import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const strict = process.argv.includes("--strict");
const deployment = deploymentArg();
const compareLocalStorage = process.argv.includes("--compare-local-storage");
const results = [];
const localStorageKeys = [
  "B2_BUCKET_NAME",
  "B2_BUCKET_ID",
  "B2_ENDPOINT",
  "B2_REGION",
];

const requiredGroups = [
  {
    label: "Clerk auth issuer env",
    keys: ["CLERK_JWT_ISSUER_DOMAIN"],
    issue: "MOVE-63",
  },
  {
    label: "Backblaze B2 Convex env names",
    keys: [
      "B2_APPLICATION_KEY_ID",
      "B2_APPLICATION_KEY",
      "B2_BUCKET_NAME",
      "B2_ENDPOINT",
      "B2_REGION",
    ],
    issue: "MOVE-66",
  },
  {
    label: "admin promotion env",
    keys: ["ADMIN_EMAILS"],
    issue: "MOVE-62",
  },
];

const alternativeGroups = [
  {
    label: "Clerk webhook signing env",
    alternatives: ["CLERK_WEBHOOK_SIGNING_SECRET", "CLERK_WEBHOOK_SECRET"],
    issue: "MOVE-68",
  },
];

export const optionalGroups = [
  {
    label: "Cloudflare image delivery Convex env names",
    alternatives: [
      "CLOUDFLARE_IMAGE_DELIVERY_URL",
      "CLOUDFLARE_IMAGES_ACCOUNT_HASH",
    ],
    helperKeys: ["CLOUDFLARE_IMAGE_DELIVERY_DOMAIN"],
    issue: "MOVE-140",
  },
];

function deploymentArg() {
  const index = process.argv.indexOf("--deployment");
  if (index !== -1) {
    return { label: process.argv[index + 1] ?? "missing", args: ["--deployment", process.argv[index + 1] ?? ""] };
  }

  if (process.argv.includes("--deployment-from-env")) {
    const value = process.env.CONVEX_DEPLOYMENT ?? "";
    const deployment = deploymentReferenceFromEnvValue(value);
    return { label: value || "missing", args: ["--deployment", deployment] };
  }

  return { label: "production", args: ["--prod"] };
}

function record(status, label, detail) {
  results.push({ status, label, detail });
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

function sanitizeCliError(value) {
  return value
    .replace(/[A-Z][A-Z0-9_]+=([^\s]+)/g, (match) => match.replace(/=.*/, "={redacted}"))
    .replace(/(sk|pk|whsec|svix|key|secret)_[A-Za-z0-9_-]+/gi, "{redacted-secret}")
    .trim();
}

function outputMentionsKey(output, key) {
  return new RegExp(`(^|[^A-Z0-9_])${escapeRegExp(key)}([^A-Z0-9_]|$)`).test(
    output
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function deploymentReferenceFromEnvValue(value) {
  const trimmed = value.trim();
  const shorthand = trimmed.match(/^(dev|prod):(.+)$/);
  return shorthand ? shorthand[2] : trimmed;
}

function checkRequiredGroups(output) {
  for (const group of requiredGroups) {
    const missing = group.keys.filter((key) => !outputMentionsKey(output, key));
    if (missing.length) {
      record(
        "blocked",
        group.label,
        `missing ${missing.join(", ")}; tracked by ${group.issue}`
      );
      continue;
    }

    record("pass", group.label, "all expected names present");
  }
}

function checkAlternativeGroups(output) {
  for (const group of alternativeGroups) {
    const present = group.alternatives.filter((key) =>
      outputMentionsKey(output, key)
    );
    if (present.length) {
      record("pass", group.label, `present as ${present.join(" or ")}`);
      continue;
    }

    record(
      "blocked",
      group.label,
      `missing one of ${group.alternatives.join(", ")}; tracked by ${group.issue}`
    );
  }
}

export function optionalGroupResults(output) {
  const nextResults = [];
  for (const group of optionalGroups) {
    const present = group.alternatives.filter((key) =>
      outputMentionsKey(output, key)
    );
    const helpers = group.helperKeys.filter((key) =>
      outputMentionsKey(output, key)
    );
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
      detail: `optional Cloudflare Images delivery is inactive in Convex; signed Backblaze derivative URLs remain the fallback; tracked by ${group.issue}`,
    });
  }

  return nextResults;
}

function checkOptionalGroups(output) {
  for (const result of optionalGroupResults(output)) {
    record(result.status, result.label, result.detail);
  }
}

export function parseEnvAssignments(output) {
  const assignments = new Map();
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    const equalsMatch = trimmed.match(/^([A-Z][A-Z0-9_]+)=(.*)$/);
    if (equalsMatch) {
      assignments.set(equalsMatch[1], equalsMatch[2]);
      continue;
    }

    const tableMatch = trimmed.match(/^([A-Z][A-Z0-9_]+)\s+(.+)$/);
    if (tableMatch && tableMatch[1] !== "NAME") {
      assignments.set(tableMatch[1], tableMatch[2]);
    }
  }
  return assignments;
}

function normalizePublicStorageValue(key, value) {
  const trimmed = value.trim();
  if (key === "B2_ENDPOINT") {
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
  return trimmed;
}

export function localStorageAlignmentResults(assignments, localEnv = process.env) {
  const availableLocalKeys = localStorageKeys.filter((key) => localEnv[key]);
  if (availableLocalKeys.length === 0) {
    return [
      {
        status: "warn",
        label: "Backblaze B2 public value alignment",
        detail:
          "local B2 public values unavailable; run with --env-file=.env.local and --compare-local-storage to compare drift",
      },
    ];
  }

  const comparableKeys = availableLocalKeys.filter((key) => assignments.has(key));
  const missingRemoteKeys = availableLocalKeys.filter((key) => !assignments.has(key));
  const mismatchedKeys = comparableKeys.filter(
    (key) =>
      normalizePublicStorageValue(key, assignments.get(key) ?? "") !==
      normalizePublicStorageValue(key, localEnv[key] ?? "")
  );
  const results = [];

  if (missingRemoteKeys.length) {
    results.push({
      status: missingRemoteKeys.includes("B2_BUCKET_ID") ? "warn" : "blocked",
      label: "Backblaze B2 public value alignment",
      detail: `Convex missing ${missingRemoteKeys.join(", ")} for local comparison; tracked by MOVE-66`,
    });
  }

  if (mismatchedKeys.length) {
    results.push({
      status: "blocked",
      label: "Backblaze B2 public value alignment",
      detail: `${mismatchedKeys.join(", ")} ${
        mismatchedKeys.length === 1 ? "differs" : "differ"
      } from local .env.local; tracked by MOVE-66`,
    });
  } else if (comparableKeys.length) {
    results.push({
      status: "pass",
      label: "Backblaze B2 public value alignment",
      detail: `${comparableKeys.join(", ")} match local .env.local without printing values`,
    });
  }

  if (results.length === 0) {
    results.push({
      status: "warn",
      label: "Backblaze B2 public value alignment",
      detail:
        "no comparable public B2 values found in Convex env output; expected names are still checked separately",
    });
  }

  return results;
}

function checkLocalStorageAlignment(output) {
  const assignments = parseEnvAssignments(output);
  for (const result of localStorageAlignmentResults(assignments)) {
    record(result.status, result.label, result.detail);
  }
}

async function main() {
  if (deployment.args.includes("")) {
    record("fail", "Convex env list", "--deployment requires a value");
    return;
  }

  const response = await run("npx", ["convex", "env", "list", ...deployment.args]);
  if (response.code !== 0) {
    record(
      "fail",
      "Convex env list",
      sanitizeCliError(response.stderr) || `convex env list exited ${response.code}`
    );
    return;
  }

  record(
    "pass",
    "Convex env list",
    `${deployment.label}: env list returned successfully; values are redacted by this doctor`
  );
  checkRequiredGroups(response.stdout);
  checkAlternativeGroups(response.stdout);
  checkOptionalGroups(response.stdout);
  if (compareLocalStorage) {
    checkLocalStorageAlignment(response.stdout);
  }
  record(
    "warn",
    "encrypted value validation",
    "Convex env list output is parsed only for expected names; runtime doctors validate behavior without printing secret values"
  );
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
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
    `Convex env readiness summary: ${counts.pass} pass, ${counts.warn} warn, ${counts.blocked} blocked, ${counts.fail} fail`
  );
  console.log(
    strict
      ? "Strict mode: failures and blockers exit nonzero."
      : "Default mode: only Convex CLI/list failures exit nonzero. Use --strict for launch gating."
  );

  if (counts.fail > 0 || (strict && counts.blocked > 0)) {
    process.exitCode = 1;
  }
}
