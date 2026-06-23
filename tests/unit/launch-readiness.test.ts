import { describe, expect, it } from "vitest";

import {
  launchBlockerRemediations,
  renderLaunchRemediationPlan,
} from "../../scripts/launch-next-steps.mjs";
import {
  launchReadinessBlockers,
  launchReadinessOptionalChecks,
  launchReadinessSummary,
} from "@/lib/launch-readiness";

describe("admin launch readiness blockers", () => {
  it("stays aligned with the terminal launch-next-steps checklist", () => {
    expect(
      launchReadinessBlockers.map((blocker) => [blocker.issue, blocker.title])
    ).toEqual(
      launchBlockerRemediations.map((blocker) => [blocker.issue, blocker.title])
    );
  });

  it("keeps blocker order and summary focused on safe launch sequencing", () => {
    expect(launchReadinessSummary()).toEqual({
      blockerCount: 7,
      optionalCheckCount: 1,
      ownerAreas: [
        "auth",
        "operations",
        "auth-sync",
        "deployment",
        "security",
        "routing",
      ],
      nextIssue: "MOVE-63",
      finalIssue: "MOVE-67",
    });
  });

  it("keeps optional Cloudflare posture separate from blocker count", () => {
    expect(launchReadinessOptionalChecks).toEqual([
      expect.objectContaining({
        issue: "MOVE-140",
        title: "Cloudflare image delivery readiness is optional",
        owner: "storage",
        currentPosture: expect.stringContaining("signed Backblaze derivative URLs"),
        verify: [
          "npm run doctor:convex-env",
          "npm run doctor:convex-dev-env",
          "npm run doctor:vercel-env",
          "npm run doctor:vercel-preview-env",
        ],
      }),
    ]);
    expect(launchReadinessBlockers.map((blocker) => blocker.issue)).not.toContain(
      "MOVE-140"
    );
  });

  it("does not expose secret values or direct external mutation commands", () => {
    const uiText = JSON.stringify({
      blockers: launchReadinessBlockers,
      optionalChecks: launchReadinessOptionalChecks,
    });
    const cliPlan = renderLaunchRemediationPlan();

    expect(uiText).not.toMatch(/sk_(test|live)_/);
    expect(uiText).not.toMatch(/pk_(test|live)_/);
    expect(uiText).not.toContain(".clerk.accounts.dev");
    expect(uiText).not.toContain("vercel remove");
    expect(uiText).not.toContain("vercel rm");
    expect(uiText).toContain("Google OAuth credentials");
    expect(uiText).toContain("https://clerk.movingmanifest.com/v1/oauth_callback");
    expect(uiText).toContain("ofid_a7fc26bd131d0216");
    expect(uiText).toContain("MOVE-240");
    expect(uiText).toContain("MOVINGMANIFEST_MCP_OAUTH_TOOLSET=trusted-helper");
    expect(uiText).toContain("trustedHelperToolsetVerified");
    expect(uiText).toContain(
      "scripts/mcp-oauth-smoke.mjs --authorize --open-browser --box-intake-smoke --write-smoke --expect-trusted-helper-toolset --expected-email scott@thejarvie.com"
    );
    expect(uiText).not.toContain("MOVINGMANIFEST_AUTHORIZED_OAUTH_SMOKE_PASSED");
    expect(cliPlan).toContain("This checklist is intentionally read-only.");
  });
});
