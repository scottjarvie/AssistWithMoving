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
    expect(plan).toContain("MOVE-62 - Configure production admin access");
    expect(plan).toContain(
      "MOVE-68 - Configure Clerk production webhook endpoint and Convex signing secret"
    );
    expect(plan).toContain(
      "MOVE-66 - Fix Backblaze B2 dev credentials and CORS for photo-upload e2e"
    );
    expect(plan).toContain(
      "MOVE-64 - Evaluate and enforce a Content Security Policy after production origins settle"
    );
    expect(plan).toContain(
      "MOVE-67 - Remove stale TheMovePlanner Vercel alias after brand rename"
    );
  });

  it("orders the work so identity and admin access come before final hardening", () => {
    expect(launchBlockerRemediations.map((remediation) => remediation.issue)).toEqual([
      "MOVE-63",
      "MOVE-62",
      "MOVE-68",
      "MOVE-66",
      "MOVE-64",
      "MOVE-67",
    ]);
  });

  it("prints placeholders and doctors, not secret values", () => {
    const plan = renderLaunchRemediationPlan();

    expect(plan).toContain("ADMIN_EMAILS");
    expect(plan).toContain("B2_APPLICATION_KEY");
    expect(plan).toContain("Vercel preview origins");
    expect(plan).toContain("CONTENT_SECURITY_POLICY_MODE");
    expect(plan).toContain("npm run doctor:launch");
    expect(plan).toContain("npm run doctor:convex-dev-env");
    expect(plan).toContain("<production-clerk-issuer>");
    expect(plan).toContain("<svix-signing-secret>");
    expect(plan).not.toMatch(/sk_(test|live)_/);
    expect(plan).not.toMatch(/pk_(test|live)_/);
    expect(plan).not.toContain(".clerk.accounts.dev");
  });
});
