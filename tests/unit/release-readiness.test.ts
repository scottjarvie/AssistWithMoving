import { describe, expect, it } from "vitest";

import {
  agentJourneySmokeScriptResult,
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
            "smoke:agent-journey": "node scripts/agent-journey-smoke.mjs",
          },
        }
      )
    ).toEqual([
      expect.objectContaining({
        status: "pass",
        label: "Vercel Convex build command",
      }),
      expect.objectContaining({
        status: "pass",
        label: "Agent journey smoke script",
      }),
    ]);
  });

  it("allows benign agent journey smoke script command variations", () => {
    for (const command of [
      "node ./scripts/agent-journey-smoke.mjs",
      "node scripts/agent-journey-smoke.mjs --mock-api",
      "cross-env NODE_ENV=test node scripts\\agent-journey-smoke.mjs",
    ]) {
      expect(
        agentJourneySmokeScriptResult({
          scripts: { "smoke:agent-journey": command },
        })
      ).toEqual({
        status: "pass",
        label: "Agent journey smoke script",
        detail:
          "package scripts include the env-gated public API/MCP journey smoke.",
      });
    }
  });

  it("fails when the release gate loses the agent journey smoke script", () => {
    expect(agentJourneySmokeScriptResult({ scripts: {} })).toEqual({
      status: "fail",
      label: "Agent journey smoke script",
      detail:
        "package scripts must include smoke:agent-journey that runs scripts/agent-journey-smoke.mjs.",
    });
  });
});
