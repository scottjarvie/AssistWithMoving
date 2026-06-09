import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const strict = process.argv.includes("--strict");
const environment = envArg() ?? "production";
const results = [];
export const previewEnvironmentIssue = "MOVE-106";

export const requiredGroups = [
  {
    label: "app routing env",
    keys: ["NEXT_PUBLIC_APP_URL"],
    issue: "MOVE-59",
  },
  {
    label: "Clerk auth env names",
    keys: [
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY",
      "CLERK_JWT_ISSUER_DOMAIN",
      "CLERK_FRONTEND_API_URL",
      "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
      "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
      "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
      "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL",
    ],
    issue: "MOVE-63",
  },
  {
    label: "Convex deployment env names",
    keys: [
      "NEXT_PUBLIC_CONVEX_URL",
      "CONVEX_DEPLOYMENT",
      "CONVEX_HTTP_ACTIONS_URL",
    ],
    issue: "MOVE-59",
  },
  {
    label: "Convex deploy key env name",
    keys: ["CONVEX_DEPLOY_KEY"],
    issue: "MOVE-143",
  },
  {
    label: "Backblaze B2 env names",
    keys: [
      "B2_APPLICATION_KEY_ID",
      "B2_APPLICATION_KEY",
      "B2_BUCKET_NAME",
      "B2_ENDPOINT",
      "B2_REGION",
    ],
    optionalKeys: ["B2_BUCKET_ID"],
    issue: "MOVE-66",
  },
  {
    label: "admin access env",
    keys: ["ADMIN_EMAILS"],
    issue: "MOVE-62",
  },
];

export const alternativeGroups = [
  {
    label: "Clerk webhook signing env",
    alternatives: ["CLERK_WEBHOOK_SIGNING_SECRET", "CLERK_WEBHOOK_SECRET"],
    issue: "MOVE-68",
  },
];

export const optionalGroups = [
  {
    label: "Cloudflare image delivery env names",
    alternatives: [
      "CLOUDFLARE_IMAGE_DELIVERY_URL",
      "CLOUDFLARE_IMAGES_ACCOUNT_HASH",
    ],
    helperKeys: ["CLOUDFLARE_IMAGE_DELIVERY_DOMAIN"],
    issue: "MOVE-138",
  },
];

export function envArg() {
  const index = process.argv.indexOf("--environment");
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function record(status, label, detail) {
  results.push({ status, label, detail });
}

export function trackedIssueDetail(groupIssue, currentEnvironment = environment) {
  if (currentEnvironment !== "preview" || groupIssue === previewEnvironmentIssue) {
    return `tracked by ${groupIssue}`;
  }

  return `tracked by ${previewEnvironmentIssue}; source setup ${groupIssue}`;
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
    child.on("error", (error) => {
      resolve({ code: 1, stdout, stderr: error.message });
    });
  });
}

export function parseEnvNames(output) {
  const names = new Set();
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Z][A-Z0-9_]+)\s+/);
    if (match) {
      names.add(match[1]);
    }
  }
  return names;
}

function summarizeNames(names) {
  return `${names.size} env var name${names.size === 1 ? "" : "s"} visible`;
}

export function requiredGroupResults(names, currentEnvironment = environment) {
  const nextResults = [];
  for (const group of requiredGroups) {
    const missing = group.keys.filter((key) => !names.has(key));
    const optionalMissing = (group.optionalKeys ?? []).filter(
      (key) => !names.has(key)
    );

    if (missing.length) {
      nextResults.push({
        status: "blocked",
        label: group.label,
        detail: `missing ${missing.join(", ")}; ${trackedIssueDetail(
          group.issue,
          currentEnvironment
        )}`,
      });
      continue;
    }

    nextResults.push({
      status: "pass",
      label: group.label,
      detail: optionalMissing.length
        ? `required names present; optional missing ${optionalMissing.join(", ")}`
        : "all expected names present",
    });
  }

  return nextResults;
}

function checkRequiredGroups(names) {
  results.push(...requiredGroupResults(names));
}

export function alternativeGroupResults(names, currentEnvironment = environment) {
  const nextResults = [];
  for (const group of alternativeGroups) {
    const present = group.alternatives.filter((key) => names.has(key));
    if (present.length) {
      nextResults.push({
        status: "pass",
        label: group.label,
        detail: `present as ${present.join(" or ")}`,
      });
      continue;
    }

    nextResults.push({
      status: "blocked",
      label: group.label,
      detail: `missing one of ${group.alternatives.join(
        ", "
      )}; ${trackedIssueDetail(group.issue, currentEnvironment)}`,
    });
  }

  return nextResults;
}

function checkAlternativeGroups(names) {
  results.push(...alternativeGroupResults(names));
}

export function optionalGroupResults(names) {
  const nextResults = [];
  for (const group of optionalGroups) {
    const present = group.alternatives.filter((key) => names.has(key));
    const helpers = group.helperKeys.filter((key) => names.has(key));
    if (present.length) {
      nextResults.push({
        status: "pass",
        label: group.label,
        detail: helpers.length
          ? `configured through ${present.join(" or ")} with ${helpers.join(", ")}`
          : `configured through ${present.join(" or ")}`,
      });
      continue;
    }

    nextResults.push({
      status: "warn",
      label: group.label,
      detail: `optional Cloudflare Images delivery is inactive; signed Backblaze derivative URLs remain the fallback; tracked by ${group.issue}`,
    });
  }

  return nextResults;
}

function checkOptionalGroups(names) {
  results.push(...optionalGroupResults(names));
}

export async function main() {
  const response = await run("npx", ["vercel", "env", "ls", environment]);
  if (response.code !== 0) {
    record(
      "fail",
      "Vercel env list",
      response.stderr.trim() || `vercel env ls exited ${response.code}`
    );
    return;
  }

  const names = parseEnvNames(response.stdout);
  if (names.size === 0) {
    record(
      "blocked",
      "Vercel env list",
      `${environment}: no env var names are configured; required groups are checked below`
    );
    checkRequiredGroups(names);
    checkAlternativeGroups(names);
    checkOptionalGroups(names);
    return;
  }

  record("pass", "Vercel env list", `${environment}: ${summarizeNames(names)}`);
  checkRequiredGroups(names);
  checkAlternativeGroups(names);
  checkOptionalGroups(names);
  record(
    "warn",
    "encrypted value validation",
    "Vercel env ls exposes names only; live key mode and secret values remain validated by runtime doctors"
  );
}

async function runCli() {
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
    `Vercel env readiness summary: ${counts.pass} pass, ${counts.warn} warn, ${counts.blocked} blocked, ${counts.fail} fail`
  );
  console.log(
    strict
      ? "Strict mode: failures and blockers exit nonzero."
      : "Default mode: only Vercel CLI/list failures exit nonzero. Use --strict for launch gating."
  );

  if (counts.fail > 0 || (strict && counts.blocked > 0)) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await runCli();
}
