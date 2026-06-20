import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const strict = process.argv.includes("--strict");
const results = [];

export const expectedVercelConvexBuildCommand =
  "npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL";

function record(status, label, detail) {
  results.push({ status, label, detail });
}

export function buildCommandResult(buildCommand) {
  if (buildCommand === expectedVercelConvexBuildCommand) {
    return {
      status: "pass",
      label: "Vercel Convex build command",
      detail: "Vercel build command deploys Convex before building Next.js",
    };
  }

  return {
    status: "blocked",
    label: "Vercel Convex build command",
    detail: `vercel.json buildCommand is ${JSON.stringify(
      buildCommand ?? null
    )}; expected ${JSON.stringify(expectedVercelConvexBuildCommand)}; tracked by MOVE-143`,
  };
}

export function agentJourneySmokeScriptResult(packageJson) {
  const command = packageJson?.scripts?.["smoke:agent-journey"];
  if (command === "node scripts/agent-journey-smoke.mjs") {
    return {
      status: "pass",
      label: "Agent journey smoke script",
      detail: "package scripts include the env-gated public API/MCP journey smoke.",
    };
  }

  return {
    status: "fail",
    label: "Agent journey smoke script",
    detail:
      "package scripts must include smoke:agent-journey = node scripts/agent-journey-smoke.mjs.",
  };
}

export function releaseReadinessResults(vercelConfig, packageJson = {}) {
  return [
    buildCommandResult(vercelConfig?.buildCommand),
    agentJourneySmokeScriptResult(packageJson),
  ];
}

export async function main() {
  let vercelConfig;
  let packageJson;
  try {
    vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8"));
  } catch (error) {
    record(
      "fail",
      "Vercel config",
      error instanceof Error ? error.message : "Could not read vercel.json"
    );
    return;
  }
  try {
    packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  } catch (error) {
    record(
      "fail",
      "Package scripts",
      error instanceof Error ? error.message : "Could not read package.json"
    );
    return;
  }

  results.push(...releaseReadinessResults(vercelConfig, packageJson));
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
    `Release readiness summary: ${counts.pass} pass, ${counts.warn} warn, ${counts.blocked} blocked, ${counts.fail} fail`
  );
  console.log(
    strict
      ? "Strict mode: failures and blockers exit nonzero."
      : "Default mode: only release doctor failures exit nonzero. Use --strict for release gating."
  );

  if (counts.fail > 0 || (strict && counts.blocked > 0)) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await runCli();
}
