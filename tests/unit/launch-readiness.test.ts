import { describe, expect, it } from "vitest";

import {
  launchBlockerRemediations,
  renderLaunchRemediationPlan,
} from "../../scripts/launch-next-steps.mjs";
import {
  launchReadinessBlockers,
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
      ownerAreas: [
        "auth",
        "operations",
        "auth-sync",
        "storage",
        "deployment",
        "security",
        "routing",
      ],
      nextIssue: "MOVE-63",
      finalIssue: "MOVE-67",
    });
  });

  it("does not expose secret values or direct external mutation commands", () => {
    const uiText = JSON.stringify(launchReadinessBlockers);
    const cliPlan = renderLaunchRemediationPlan();

    expect(uiText).not.toMatch(/sk_(test|live)_/);
    expect(uiText).not.toMatch(/pk_(test|live)_/);
    expect(uiText).not.toContain(".clerk.accounts.dev");
    expect(uiText).not.toContain("vercel remove");
    expect(uiText).not.toContain("vercel rm");
    expect(cliPlan).toContain("This checklist is intentionally read-only.");
  });
});
