import { spawn } from "node:child_process";

const strict = process.argv.includes("--strict");
const deployment = deploymentArg();
const results = [];

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

function deploymentArg() {
  const index = process.argv.indexOf("--deployment");
  if (index !== -1) {
    return { label: process.argv[index + 1] ?? "missing", args: ["--deployment", process.argv[index + 1] ?? ""] };
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
  record(
    "warn",
    "encrypted value validation",
    "Convex env list output is parsed only for expected names; runtime doctors validate behavior without printing secret values"
  );
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
