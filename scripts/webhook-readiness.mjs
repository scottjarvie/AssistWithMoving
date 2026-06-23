import { pathToFileURL } from "node:url";

const strict = process.argv.includes("--strict");
const results = [];

function record(status, label, detail) {
  results.push({ status, label, detail });
}

export function baseUrl(env = process.env) {
  return (
    env.CLERK_WEBHOOK_URL ??
    (env.CONVEX_HTTP_ACTIONS_URL
      ? new URL("/clerk-webhook", env.CONVEX_HTTP_ACTIONS_URL).href
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

function hasLocalSigningSecret(env = process.env) {
  return Boolean(env.CLERK_WEBHOOK_SIGNING_SECRET ?? env.CLERK_WEBHOOK_SECRET);
}

function recordSigningSecretReadiness(endpointStatus, env = process.env) {
  if (hasLocalSigningSecret(env)) {
    record("pass", "webhook signing secret", "secret env var is present");
    return;
  }

  if (endpointStatus === "configured") {
    record(
      "pass",
      "webhook signing secret",
      "remote endpoint has a signing secret; local env is optional for unsigned-rejection readiness"
    );
    return;
  }

  record(
    "blocked",
    "webhook signing secret",
    "missing CLERK_WEBHOOK_SIGNING_SECRET or CLERK_WEBHOOK_SECRET; tracked by MOVE-68"
  );
}

async function checkEnv(env = process.env) {
  const url = baseUrl(env);
  if (!url) {
    record(
      "fail",
      "webhook URL",
      "set CONVEX_HTTP_ACTIONS_URL or CLERK_WEBHOOK_URL"
    );
    return undefined;
  }

  record("pass", "webhook URL", `configured host ${maskedHost(url)}`);
  return url;
}

export async function checkEndpoint(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "user.created",
      data: { id: "movingmanifest-webhook-readiness" },
    }),
  });
  const body = (await response.text()).toLowerCase();

  if (response.status === 400 && body.includes("verification failed")) {
    record(
      "pass",
      "unsigned webhook rejection",
      "endpoint rejects unsigned payloads with HTTP 400"
    );
    return "configured";
  }

  if (response.status === 500 && body.includes("signing secret")) {
    record(
      "blocked",
      "unsigned webhook rejection",
      "endpoint is reachable but signing secret is not configured; tracked by MOVE-68"
    );
    return "missing";
  }

  record(
    "fail",
    "unsigned webhook rejection",
    `expected HTTP 400 or signing-secret 500, got HTTP ${response.status}`
  );
  return "unknown";
}

export async function runWebhookReadiness({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  results.length = 0;
  const url = await checkEnv(env);
  if (!url) return results;
  const endpointStatus = await checkEndpoint(url, fetchImpl);
  recordSigningSecretReadiness(endpointStatus, env);
  return results;
}

export function summarizeResults(nextResults) {
  return nextResults.reduce(
    (acc, result) => {
      acc[result.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, blocked: 0, fail: 0 }
  );
}

function printResults(nextResults, counts) {
  for (const result of nextResults) {
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
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  await runWebhookReadiness();
  const counts = summarizeResults(results);
  printResults(results, counts);

  if (counts.fail > 0 || (strict && counts.blocked > 0)) {
    process.exitCode = 1;
  }
}
