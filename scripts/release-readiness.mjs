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

export function releaseReadinessResults(vercelConfig) {
  return [buildCommandResult(vercelConfig?.buildCommand)];
}

export async function main() {
  let vercelConfig;
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

  results.push(...releaseReadinessResults(vercelConfig));
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
