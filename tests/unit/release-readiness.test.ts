import { describe, expect, it } from "vitest";

import {
  agentReadyMcpScriptResult,
  expectedAgentReadyVerifyCommand,
  buildCommandResult,
  expectedVercelConvexBuildCommand,
  releaseReadinessResults,
} from "../../scripts/release-readiness.mjs";

describe("release readiness", () => {
  it("passes when Vercel build deploys Convex before Next.js", () => {
    expect(buildCommandResult(expectedVercelConvexBuildCommand)).toEqual({
      status: "pass",
      label: "Vercel Convex build command",
      detail: "Vercel build command deploys Convex before building Next.js",
    });
  });

  it("blocks when Vercel only runs the Next.js build", () => {
    expect(buildCommandResult("npm run build")).toEqual({
      status: "blocked",
      label: "Vercel Convex build command",
      detail:
        'vercel.json buildCommand is "npm run build"; expected "npx convex deploy --cmd \'npm run build\' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL"; tracked by MOVE-143',
    });
  });

  it("reports release readiness from parsed Vercel config", () => {
    expect(
      releaseReadinessResults(
        {
          buildCommand: expectedVercelConvexBuildCommand,
        },
        {
          scripts: {
            "contract:drift": "node scripts/contract-drift-check.mjs",
            "doctor:oauth-cutover": "node scripts/oauth-cutover-readiness.mjs",
            "mcp:doctor": "node scripts/mcp-oauth-smoke.mjs --discover --endpoint https://movingmanifest.com/api/mcp",
            "smoke:agent-journey": "node scripts/agent-journey-smoke.mjs",
            "smoke:mcp-oauth": "node scripts/mcp-oauth-smoke.mjs",
            "smoke:mcp-stdio": "node scripts/mcp-stdio-smoke.mjs",
            "verify:agent-ready": expectedAgentReadyVerifyCommand,
          },
        }
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "pass",
          label: "Vercel Convex build command",
        }),
        expect.objectContaining({
          status: "pass",
          label: "Agent-ready MCP verification scripts",
        }),
        expect.objectContaining({
          status: "pass",
          label: "REST/OpenAPI/MCP contract drift",
        }),
      ])
    );
  });

  it("fails when the release gate loses an MCP smoke script", () => {
    expect(
      agentReadyMcpScriptResult({
        scripts: {
          "contract:drift": "node scripts/contract-drift-check.mjs",
          "doctor:oauth-cutover": "node scripts/oauth-cutover-readiness.mjs",
          "mcp:doctor": "node scripts/mcp-oauth-smoke.mjs --discover --endpoint https://movingmanifest.com/api/mcp",
          "smoke:mcp-oauth": "node scripts/mcp-oauth-smoke.mjs",
          "smoke:mcp-stdio": "node scripts/mcp-stdio-smoke.mjs",
          "verify:agent-ready": expectedAgentReadyVerifyCommand,
        },
      })
    ).toEqual({
      status: "fail",
      label: "Agent-ready MCP verification scripts",
      detail: "missing or changed script(s): smoke:agent-journey",
    });
  });
});
