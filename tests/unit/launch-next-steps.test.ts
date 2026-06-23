import { describe, expect, it } from "vitest";

import {
  launchBlockerRemediations,
  renderLaunchRemediationPlan,
} from "../../scripts/launch-next-steps.mjs";

describe("launch next steps", () => {
  it("keeps every open launch blocker visible with its meaning", () => {
    const plan = renderLaunchRemediationPlan();

    expect(plan).toContain(
      "MOVE-63 - Switch Clerk to a production instance before public launch"
    );
    expect(plan).toContain(
      "MOVE-240 - Decide and enable trusted-helper OAuth MCP toolset before publish"
    );
    expect(plan).toContain("MOVE-62 - Configure production admin access");
    expect(plan).toContain(
      "MOVE-68 - Configure Clerk production webhook endpoint and Convex signing secret"
    );
    expect(plan).toContain(
      "MOVE-64 - Evaluate and enforce a Content Security Policy after production origins settle"
    );
    expect(plan).toContain("MOVE-106 - Configure Vercel preview environment variables");
    expect(plan).toContain(
      "MOVE-67 - Remove stale legacy Vercel alias after brand rename"
    );
  });

  it("orders the work so identity and admin access come before final hardening", () => {
    expect(launchBlockerRemediations.map((remediation) => remediation.issue)).toEqual([
      "MOVE-63",
      "MOVE-240",
      "MOVE-62",
      "MOVE-68",
      "MOVE-106",
      "MOVE-64",
      "MOVE-67",
    ]);
  });

  it("prints placeholders and doctors, not secret values", () => {
    const plan = renderLaunchRemediationPlan();

    expect(plan).toContain("ADMIN_EMAILS");
    expect(plan).toContain("B2_APPLICATION_KEY_ID preview");
    expect(plan).toContain("CONTENT_SECURITY_POLICY_MODE");
    expect(plan).toContain("Google OAuth custom credentials");
    expect(plan).toContain("https://clerk.movingmanifest.com/v1/oauth_callback");
    expect(plan).toContain("Dynamic client registration");
    expect(plan).toContain("ofid_a7fc26bd131d0216");
    expect(plan).toContain("OAuth access tokens are still generated as JWTs");
    expect(plan).toContain("Deploy the current repo to production");
    expect(plan).toContain("connection.user.email");
    expect(plan).toContain("MOVINGMANIFEST_MCP_OAUTH_TOOLSET=trusted-helper");
    expect(plan).toContain("trustedHelperToolsetVerified: true");
    expect(plan).toContain(
      "scripts/mcp-oauth-smoke.mjs --authorize --open-browser --box-intake-smoke --write-smoke --expect-trusted-helper-toolset --expected-email scott@thejarvie.com"
    );
    expect(plan).toContain("npm run doctor:oauth-cutover");
    expect(plan).not.toContain("MOVINGMANIFEST_AUTHORIZED_OAUTH_SMOKE_PASSED");
    expect(plan).toContain("npm run doctor:launch");
    expect(plan).toContain("npm run doctor:vercel-preview-env");
    expect(plan).not.toMatch(/sk_(test|live)_/);
    expect(plan).not.toMatch(/pk_(test|live)_/);
    expect(plan).not.toContain(".clerk.accounts.dev");
  });
});
