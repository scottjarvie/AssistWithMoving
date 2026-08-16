const strict = process.argv.includes("--strict");
const results = [];

function record(status, label, detail) {
  results.push({ status, label, detail });
}

function baseUrl() {
  return (
    process.env.CLERK_WEBHOOK_URL ??
    (process.env.CONVEX_HTTP_ACTIONS_URL
      ? new URL("/clerk-webhook", process.env.CONVEX_HTTP_ACTIONS_URL).href
      : undefined)
  );
}

function maskedHost(value) {
  if (!value) return "missing";
  try {
    const host = new URL(value).host;
    if (/\.convex\.(site|cloud)$/.test(host)) {
      return "{convex-http-actions-host}";
    }
    return host;
  } catch {
    return "invalid URL";
  }
}

async function checkEnv() {
  const url = baseUrl();
  if (!url) {
    record(
      "fail",
      "webhook URL",
      "set CONVEX_HTTP_ACTIONS_URL or CLERK_WEBHOOK_URL"
    );
    return undefined;
  }

  record("pass", "webhook URL", `configured host ${maskedHost(url)}`);

  const hasSigningSecret = Boolean(
    process.env.CLERK_WEBHOOK_SIGNING_SECRET ?? process.env.CLERK_WEBHOOK_SECRET
  );
  if (hasSigningSecret) {
    record("pass", "webhook signing secret", "secret env var is present");
  } else {
    record(
      "blocked",
      "webhook signing secret",
      "missing CLERK_WEBHOOK_SIGNING_SECRET or CLERK_WEBHOOK_SECRET; tracked by MOVE-68"
    );
  }

  return url;
}

async function checkEndpoint(url) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "user.created",
      data: { id: "assistwithmoving-webhook-readiness" },
    }),
  });
  const body = (await response.text()).toLowerCase();

  if (response.status === 400 && body.includes("verification failed")) {
    record(
      "pass",
      "unsigned webhook rejection",
      "endpoint rejects unsigned payloads with HTTP 400"
    );
    return;
  }

  if (response.status === 500 && body.includes("signing secret")) {
    record(
      "blocked",
      "unsigned webhook rejection",
      "endpoint is reachable but signing secret is not configured; tracked by MOVE-68"
    );
    return;
  }

  record(
    "fail",
    "unsigned webhook rejection",
    `expected HTTP 400 or signing-secret 500, got HTTP ${response.status}`
  );
}

async function main() {
  const url = await checkEnv();
  if (!url) return;
  await checkEndpoint(url);
}

await main();

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
  `Webhook readiness summary: ${counts.pass} pass, ${counts.warn} warn, ${counts.blocked} blocked, ${counts.fail} fail`
);
console.log(
  strict
    ? "Strict mode: failures and blockers exit nonzero."
    : "Default mode: only missing endpoint or unsafe behavior exits nonzero. Use --strict for launch gating."
);

if (counts.fail > 0 || (strict && counts.blocked > 0)) {
  process.exitCode = 1;
}
