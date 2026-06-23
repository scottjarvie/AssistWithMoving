import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { contractDriftResults } from "./contract-drift-check.mjs";

const strict = process.argv.includes("--strict");
const results = [];

export const expectedVercelConvexBuildCommand =
  "npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL";
export const expectedAgentReadyVerifyCommand =
  "npm run contract:drift && npm test -- tests/unit/mcp-capabilities.test.ts tests/unit/mcp-client.test.ts tests/unit/mcp-stdio-smoke.test.ts tests/unit/agent-journey-smoke.test.ts tests/unit/agent-kit.test.ts tests/unit/mcp-page-copy.test.ts tests/unit/mcp-endpoint-routing.test.ts tests/unit/mcp-route-auth.test.ts tests/unit/mcp-oauth-smoke-script.test.ts tests/unit/oauth-cutover-readiness.test.ts tests/unit/release-readiness.test.ts && npm run smoke:mcp-stdio -- --mock-api && npm run doctor:release";

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

export function agentReadyMcpScriptResult(packageJson) {
  const scripts = packageJson?.scripts ?? {};
  const requiredScripts = {
    "contract:drift": "node scripts/contract-drift-check.mjs",
    "doctor:oauth-cutover": "node scripts/oauth-cutover-readiness.mjs",
    "mcp:doctor": "node scripts/mcp-oauth-smoke.mjs --discover --endpoint https://movingmanifest.com/api/mcp",
    "smoke:agent-journey": "node scripts/agent-journey-smoke.mjs",
    "smoke:mcp-oauth": "node scripts/mcp-oauth-smoke.mjs",
    "smoke:mcp-stdio": "node scripts/mcp-stdio-smoke.mjs",
    "verify:agent-ready": expectedAgentReadyVerifyCommand,
  };
  const missing = Object.entries(requiredScripts).filter(
    ([name, command]) => scripts[name] !== command
  );
  if (missing.length === 0) {
    return {
      status: "pass",
      label: "Agent-ready MCP verification scripts",
      detail:
        "package scripts include the agent-ready umbrella gate, contract drift, read-only MCP discovery doctor, stdio MCP smoke, OAuth MCP smoke, agent journey smoke, and OAuth cutover doctor.",
    };
  }

  return {
    status: "fail",
    label: "Agent-ready MCP verification scripts",
    detail: `missing or changed script(s): ${missing.map(([name]) => name).join(", ")}`,
  };
}

export function releaseReadinessResults(vercelConfig, packageJson = {}) {
  const driftResults = contractDriftResults();
  return [
    buildCommandResult(vercelConfig?.buildCommand),
    agentReadyMcpScriptResult(packageJson),
    {
      status: driftResults.length ? "fail" : "pass",
      label: "REST/OpenAPI/MCP contract drift",
      detail: driftResults.length
        ? `${driftResults.length} contract issue(s); run npm run contract:drift for exact routes.`
        : "REST manifest, OpenAPI paths, MCP client paths, and core enums agree.",
    },
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
