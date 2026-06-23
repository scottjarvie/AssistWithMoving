import { chromium } from "playwright";
import { pathToFileURL } from "node:url";

const strict = process.argv.includes("--strict");
const targetUrlInput = process.env.LAUNCH_URL ?? "https://movingmanifest.com";
const targetUrl = new URL(targetUrlInput);
const staleAliasUrl = process.env.STALE_ALIAS_URL;

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
const expectedRuntimeOrigins = new Set(["https://clerk.movingmanifest.com"]);

function record(status, label, detail) {
  results.push({ status, label, detail });
}

function toUrl(path) {
  return new URL(path, targetUrl).href;
}

function normalizeDetail(detail) {
  return detail.replaceAll(targetUrl.origin, "{target}");
}

function errorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(/\r?\n/, 1)[0] || message;
}

async function fetchForCheck(input, label) {
  try {
    return await fetch(input, { redirect: "manual" });
  } catch (error) {
    record(
      "fail",
      label,
      `could not reach ${normalizeDetail(String(input))}: ${errorMessage(error)}`
    );
    return null;
  }
}

function displayOrigin(origin) {
  const url = new URL(origin);
  if (url.origin === targetUrl.origin) return "{target}";
  if (/\.clerk\.accounts\.dev$/.test(url.hostname)) return "https://{clerk-dev-origin}";
  return origin;
}

export function isExpectedRuntimeOrigin(origin, targetOrigin = targetUrl.origin) {
  const url = new URL(origin);
  if (url.origin === targetOrigin) return true;
  if (expectedRuntimeOrigins.has(url.origin)) return true;
  if (/\.convex\.cloud$/.test(url.hostname)) return true;
  return false;
}

async function checkOkRoute(path, label) {
  const response = await fetchForCheck(toUrl(path), label);
  if (!response) return;

  if (response.ok) {
    record("pass", label, `${path} returned HTTP ${response.status}`);
    return;
  }

  record("fail", label, `${path} returned HTTP ${response.status}`);
}

async function checkHome() {
  const response = await fetchForCheck(targetUrl, "home page");
  if (!response) return;

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

  const enforcedCsp = response.headers.get("content-security-policy");
  const reportOnlyCsp = response.headers.get("content-security-policy-report-only");

  if (enforcedCsp) {
    record("pass", "content security policy", "CSP is enforced");
  } else if (reportOnlyCsp) {
    const directiveCount = reportOnlyCsp
      .split(";")
      .map((directive) => directive.trim())
      .filter(Boolean).length;
    record(
      "pass",
      "content security policy report-only",
      `report-only CSP is present with ${directiveCount} directives`
    );
    if (reportOnlyCsp.includes("report-uri /api/csp-report")) {
      record(
        "pass",
        "content security policy reporting",
        "CSP reports post to /api/csp-report"
      );
    } else {
      record(
        "warn",
        "content security policy reporting",
        "report-only CSP is present without a report-uri endpoint"
      );
    }
    record(
      "blocked",
      "content security policy enforcement",
      "CSP is report-only until production origins settle; tracked by MOVE-64"
    );
  } else {
    record(
      "blocked",
      "content security policy",
      "CSP is missing until production origins settle; tracked by MOVE-64"
    );
  }
}

async function checkSignedOutProtection(path, label) {
  const protectedUrl = toUrl(path);
  const response = await fetchForCheck(protectedUrl, label);
  if (!response) return;

  const location = response.headers.get("location") ?? "";

  if (
    [301, 302, 303, 307, 308].includes(response.status) &&
    location.includes("/sign-in")
  ) {
    record(
      "pass",
      label,
      `redirects to ${location}`
    );
    return;
  }

  record(
    "fail",
    label,
    `expected sign-in redirect, got HTTP ${response.status} ${location}`
  );
}

async function checkRuntimeOrigins() {
  let browser;
  const origins = new Set();
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on("request", (request) => {
      try {
        origins.add(new URL(request.url()).origin);
      } catch {
        // Ignore non-URL request values from browser internals.
      }
    });
    await page.goto(targetUrl.href, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
  } catch (error) {
    record(
      "fail",
      "runtime origins observed",
      `could not load ${normalizeDetail(targetUrl.href)}: ${errorMessage(error)}`
    );
    return;
  } finally {
    await browser?.close().catch(() => {});
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
    if (/\.clerk\.accounts\.dev$/.test(new URL(origin).hostname)) return false;
    return !isExpectedRuntimeOrigin(origin);
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
  if (!staleAliasUrl) {
    record(
      "pass",
      "stale brand alias",
      "no stale alias URL configured for this run"
    );
    return;
  }

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

export async function runLaunchReadiness() {
  results.length = 0;

  await checkHome();
  await checkOkRoute("/robots.txt", "robots");
  await checkOkRoute("/sitemap.xml", "sitemap");
  await checkSignedOutProtection(
    "/app/dashboard",
    "signed-out workspace protection"
  );
  await checkSignedOutProtection("/admin", "signed-out admin protection");
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

  return { results, counts };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await runLaunchReadiness();
}
