import { describe, expect, it } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import {
  MANAGED_HOUSEHOLD_MEMBER_ROLES,
  memberManagementBlockReason,
  normalizeCollaboratorEmail,
  parseManagedHouseholdMemberRole,
} from "../../convex/lib/householdMembers";

describe("household member management helpers", () => {
  it("normalizes collaborator emails before lookup", () => {
    expect(normalizeCollaboratorEmail("  Scott@Example.COM ")).toBe(
      "scott@example.com",
    );
  });

  it("only exposes non-owner roles for collaborator management", () => {
    expect(MANAGED_HOUSEHOLD_MEMBER_ROLES).toEqual([
      "admin",
      "editor",
      "packer",
      "viewer",
      "guest",
    ]);
    expect(parseManagedHouseholdMemberRole("editor")).toBe("editor");
    expect(parseManagedHouseholdMemberRole("owner")).toBeNull();
    expect(parseManagedHouseholdMemberRole("unknown")).toBeNull();
  });

  it("blocks owner and self role changes", () => {
    const currentUserId = "user-current" as Id<"users">;
    const otherUserId = "user-other" as Id<"users">;

    expect(
      memberManagementBlockReason({
        action: "changeRole",
        currentUserId,
        targetUserId: otherUserId,
        targetRole: "owner",
      }),
    ).toMatch(/Owner access/);

    expect(
      memberManagementBlockReason({
        action: "changeRole",
        currentUserId,
        targetUserId: currentUserId,
        targetRole: "admin",
      }),
    ).toMatch(/own household role/);
  });

  it("blocks self-disable but allows non-owner collaborator changes", () => {
    const currentUserId = "user-current" as Id<"users">;
    const otherUserId = "user-other" as Id<"users">;

    expect(
      memberManagementBlockReason({
        action: "disable",
        currentUserId,
        targetUserId: currentUserId,
        targetRole: "admin",
      }),
    ).toMatch(/disable your own/);

    expect(
      memberManagementBlockReason({
        action: "disable",
        currentUserId,
        targetUserId: otherUserId,
        targetRole: "viewer",
      }),
    ).toBeNull();
  });
});
