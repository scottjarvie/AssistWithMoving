import { describe, expect, it } from "vitest";

import { computeEffectiveMoveAccess } from "../../convex/lib/moveAccess";

// The security matrix for "what can this user do on this move". This is the pure
// core that both permission gates (web + OAuth MCP) defer to, so getting it
// right here means a moveOnly outsider can never reach household-wide access and
// a household member is never silently downgraded.
describe("computeEffectiveMoveAccess", () => {
  it("household member with no participant row gets their household role", () => {
    expect(
      computeEffectiveMoveAccess({
        membershipRole: "editor",
        participantRole: null,
        participantAccessKind: null,
      }),
    ).toEqual({ role: "editor", accessKind: "householdBacked" });
  });

  it("RAISES a member's role when a participant grant is stronger", () => {
    expect(
      computeEffectiveMoveAccess({
        membershipRole: "viewer",
        participantRole: "admin",
        participantAccessKind: "householdBacked",
      }),
    ).toEqual({ role: "admin", accessKind: "householdBacked" });
  });

  it("NEVER lowers a member below their household role (raise-only)", () => {
    // An admin member with a viewer participant grant stays admin on the move.
    expect(
      computeEffectiveMoveAccess({
        membershipRole: "admin",
        participantRole: "viewer",
        participantAccessKind: "householdBacked",
      }),
    ).toEqual({ role: "admin", accessKind: "householdBacked" });
  });

  it("grants a moveOnly outsider exactly their participant role", () => {
    expect(
      computeEffectiveMoveAccess({
        membershipRole: null,
        participantRole: "packer",
        participantAccessKind: "moveOnly",
      }),
    ).toEqual({ role: "packer", accessKind: "moveOnly" });
  });

  it("DENIES a participant marked householdBacked who has no membership (fail closed)", () => {
    // e.g. a family member whose membership was later disabled — must NOT keep
    // silent move access via the leftover participant row.
    expect(
      computeEffectiveMoveAccess({
        membershipRole: null,
        participantRole: "admin",
        participantAccessKind: "householdBacked",
      }),
    ).toBeNull();
  });

  it("DENIES someone with neither membership nor participant", () => {
    expect(
      computeEffectiveMoveAccess({
        membershipRole: null,
        participantRole: null,
        participantAccessKind: null,
      }),
    ).toBeNull();
  });

  it("DENIES a participant row with no accessKind", () => {
    expect(
      computeEffectiveMoveAccess({
        membershipRole: null,
        participantRole: "editor",
        participantAccessKind: null,
      }),
    ).toBeNull();
  });
});
