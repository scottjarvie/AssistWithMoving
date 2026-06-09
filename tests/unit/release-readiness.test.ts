import { describe, expect, it } from "vitest";

import {
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
      releaseReadinessResults({
        buildCommand: expectedVercelConvexBuildCommand,
      })
    ).toHaveLength(1);
  });
});
