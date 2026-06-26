import { describe, expect, it } from "vitest";

import {
  PARTICIPANT_TYPE_PRESETS,
  canGrantRole,
  isAccessGrantingType,
  resolveParticipantGrant,
} from "../../convex/lib/participants";

describe("participant type presets (requirement 6)", () => {
  it("maps household member to full household-backed access", () => {
    expect(PARTICIPANT_TYPE_PRESETS.householdMember.accessKind).toBe(
      "householdBacked",
    );
  });

  it("walls movers and helpers to the one move", () => {
    expect(PARTICIPANT_TYPE_PRESETS.mover.accessKind).toBe("moveOnly");
    expect(PARTICIPANT_TYPE_PRESETS.helper.accessKind).toBe("moveOnly");
    expect(PARTICIPANT_TYPE_PRESETS.company.accessKind).toBe("moveOnly");
  });

  it("treats contact as no-access", () => {
    expect(PARTICIPANT_TYPE_PRESETS.contact.defaultRole).toBeNull();
    expect(isAccessGrantingType("contact")).toBe(false);
    expect(isAccessGrantingType("mover")).toBe(true);
  });
});

describe("no-privilege-escalation ceiling", () => {
  it("lets an owner grant any role", () => {
    expect(canGrantRole("owner", "admin")).toBe(true);
    expect(canGrantRole("owner", "editor")).toBe(true);
  });

  it("forbids granting above your own role", () => {
    expect(canGrantRole("editor", "admin")).toBe(false);
    expect(canGrantRole("packer", "editor")).toBe(false);
  });

  it("lets you grant at or below your own role", () => {
    expect(canGrantRole("editor", "editor")).toBe(true);
    expect(canGrantRole("editor", "viewer")).toBe(true);
  });
});

describe("resolveParticipantGrant", () => {
  it("applies the type preset when no overrides are given", () => {
    expect(
      resolveParticipantGrant({ type: "mover", actorRole: "owner" }),
    ).toEqual({ ok: true, role: "viewer", accessKind: "moveOnly" });
  });

  it("honors an explicit role override within the ceiling", () => {
    expect(
      resolveParticipantGrant({
        type: "helper",
        requestedRole: "editor",
        actorRole: "owner",
      }),
    ).toEqual({ ok: true, role: "editor", accessKind: "moveOnly" });
  });

  it("refuses a role above the actor's own", () => {
    const result = resolveParticipantGrant({
      type: "householdMember",
      requestedRole: "admin",
      actorRole: "editor",
    });
    expect(result.ok).toBe(false);
  });

  it("refuses to grant access to a plain contact", () => {
    const result = resolveParticipantGrant({ type: "contact", actorRole: "owner" });
    expect(result.ok).toBe(false);
  });
});
