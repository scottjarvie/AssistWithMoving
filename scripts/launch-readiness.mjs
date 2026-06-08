import { chromium } from "playwright";

const strict = process.argv.includes("--strict");
const targetUrlInput = process.env.LAUNCH_URL ?? "https://movingmanifest.com";
const targetUrl = new URL(targetUrlInput);
const staleAliasUrl =
  process.env.STALE_ALIAS_URL ?? "https://themoveplanner.vercel.app";

const requiredHeaders = [
  ["strict-transport-security", "hsts", /max-age=63072000/],
  ["x-content-type-options", "nosniff", /^nosniff$/],
  ["x-frame-options", "frame denial", /^DENY$/],
  ["referrer-policy", "referrer policy", /^strict-origin-when-cross-origin$/],
  ["permissions-policy", "camera policy", /camera=\(self\)/],
  ["permissions-policy", "microphone policy", /microphone=\(\)/],
  ["permissions-policy", "geolocation policy", /geolocation=\(\)/],
  ["permissions-policy", "payment policy", /payment=\(\)/],
  ["permissions-policy", "usb policy", /usb=\(\)/],
  [
    "cross-origin-opener-policy",
    "opener isolation",
    /^same-origin-allow-popups$/,
  ],
  ["x-permitted-cross-domain-policies", "cross-domain policy", /^none$/],
];

const results = [];

function record(status, label, detail) {
  results.push({ status, label, detail });
}

function sameOrigin(url) {
  return new URL(url).origin === targetUrl.origin;
}

function toUrl(path) {
  return new URL(path, targetUrl).href;
}

function normalizeDetail(detail) {
  return detail.replaceAll(targetUrl.origin, "{target}");
}

function displayOrigin(origin) {
  const url = new URL(origin);
  if (url.origin === targetUrl.origin) return "{target}";
  if (/\.clerk\.accounts\.dev$/.test(url.hostname)) return "https://{clerk-dev-origin}";
  return origin;
}

async function checkOkRoute(path, label) {
  const response = await fetch(toUrl(path), { redirect: "manual" });
  if (response.ok) {
    record("pass", label, `${path} returned HTTP ${response.status}`);
    return;
  }

  record("fail", label, `${path} returned HTTP ${response.status}`);
}

async function checkHome() {
  const response = await fetch(targetUrl, { redirect: "manual" });
  if (!response.ok) {
    record(
      "fail",
      "home page",
      `${targetUrl.href} returned HTTP ${response.status}`
    );
    return;
  }

  record(
    "pass",
    "home page",
    `${targetUrl.href} returned HTTP ${response.status}`
  );
  for (const [header, label, pattern] of requiredHeaders) {
    const value = response.headers.get(header);
    if (value && pattern.test(value)) {
      record("pass", `header ${label}`, value);
    } else {
      record(
        "fail",
        `header ${label}`,
        value ? `unexpected value: ${value}` : "missing"
      );
    }
  }

  if (response.headers.get("content-security-policy")) {
    record("pass", "content security policy", "CSP is enforced");
  } else {
    record(
      "blocked",
      "content security policy",
      "CSP is intentionally deferred until production origins settle; tracked by MOVE-64"
    );
  }
}

async function checkSignedOutProtection() {
  const protectedUrl = toUrl("/app/dashboard");
  const response = await fetch(protectedUrl, { redirect: "manual" });
  const location = response.headers.get("location") ?? "";

  if (
    [301, 302, 303, 307, 308].includes(response.status) &&
    location.includes("/sign-in")
  ) {
    record(
      "pass",
      "signed-out workspace protection",
      `redirects to ${location}`
    );
    return;
  }

  record(
    "fail",
    "signed-out workspace protection",
    `expected sign-in redirect, got HTTP ${response.status} ${location}`
  );
}

async function checkRuntimeOrigins() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const origins = new Set();
  page.on("request", (request) => {
    try {
      origins.add(new URL(request.url()).origin);
    } catch {
      // Ignore non-URL request values from browser internals.
    }
  });
  try {
    await page.goto(targetUrl.href, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
  } finally {
    await browser.close();
  }

  const sortedOrigins = [...origins].sort();
  record(
    "pass",
    "runtime origins observed",
    sortedOrigins
      .map((origin) => normalizeDetail(displayOrigin(origin)))
      .join(", ")
  );

  const devClerkOrigin = sortedOrigins.find((origin) =>
    /\.clerk\.accounts\.dev$/.test(new URL(origin).hostname)
  );
  if (devClerkOrigin) {
    record(
      "blocked",
      "production Clerk origin",
      `live app is still using a development Clerk origin; tracked by MOVE-63`
    );
  }

  const unexpectedOrigins = sortedOrigins.filter((origin) => {
    if (sameOrigin(origin)) return false;
    if (/\.clerk\.accounts\.dev$/.test(new URL(origin).hostname)) return false;
    if (/\.convex\.cloud$/.test(new URL(origin).hostname)) return false;
    return true;
  });

  if (unexpectedOrigins.length) {
    record(
      "warn",
      "unexpected public runtime origins",
      unexpectedOrigins.map((origin) => normalizeDetail(origin)).join(", ")
    );
  }
}

async function checkStaleAlias() {
  try {
    const response = await fetch(staleAliasUrl, { redirect: "manual" });
    if (response.status === 404) {
      record("pass", "stale brand alias", `${staleAliasUrl} is not serving`);
      return;
    }

    record(
      "warn",
      "stale brand alias",
      `${staleAliasUrl} still returns HTTP ${response.status}; tracked by MOVE-67`
    );
  } catch (error) {
    record(
      "pass",
      "stale brand alias",
      `${staleAliasUrl} is not reachable: ${error instanceof Error ? error.message : error}`
    );
  }
}

await checkHome();
await checkOkRoute("/robots.txt", "robots");
await checkOkRoute("/sitemap.xml", "sitemap");
await checkSignedOutProtection();
await checkRuntimeOrigins();
await checkStaleAlias();

const counts = results.reduce(
  (acc, result) => {
    acc[result.status] += 1;
    return acc;
  },
  { pass: 0, warn: 0, blocked: 0, fail: 0 }
);

for (const result of results) {
  const label =
    result.status === "pass"
      ? "PASS"
      : result.status === "warn"
        ? "WARN"
        : result.status === "blocked"
          ? "BLOCKED"
          : "FAIL";
  console.log(`${label} ${result.label}: ${result.detail}`);
}

console.log(
  `Launch readiness summary: ${counts.pass} pass, ${counts.warn} warn, ${counts.blocked} blocked, ${counts.fail} fail`
);
console.log(
  strict
    ? "Strict mode: failures and blockers exit nonzero."
    : "Default mode: only code/app failures exit nonzero. Use --strict for launch gating."
);

if (counts.fail > 0 || (strict && counts.blocked > 0)) {
  process.exitCode = 1;
}
