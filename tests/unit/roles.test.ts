import { describe, expect, it } from "vitest";

import {
  canPerformHouseholdAction,
  canEditHouseholdContent,
  canManageHousehold,
  canPackHouseholdContent,
  canViewSensitiveField,
  householdRoleAtLeast,
  strongerHouseholdRole,
  visibilityForHouseholdRole,
} from "../../convex/lib/roles";

describe("household role helpers", () => {
  it("treats owner and admin as household managers", () => {
    expect(canManageHousehold("owner")).toBe(true);
    expect(canManageHousehold("admin")).toBe(true);
    expect(canManageHousehold("editor")).toBe(false);
  });

  it("allows editors to edit and packers to pack without admin access", () => {
    expect(canEditHouseholdContent("editor")).toBe(true);
    expect(canEditHouseholdContent("packer")).toBe(false);
    expect(canPackHouseholdContent("packer")).toBe(true);
    expect(canPackHouseholdContent("viewer")).toBe(false);
  });

  it("keeps guest access below every trusted household role", () => {
    expect(householdRoleAtLeast("guest", "guest")).toBe(true);
    expect(householdRoleAtLeast("guest", "viewer")).toBe(false);
    expect(householdRoleAtLeast("viewer", "guest")).toBe(true);
  });

  it("maps product actions to minimum household roles", () => {
    expect(canPerformHouseholdAction("guest", "inventory:read")).toBe(true);
    expect(canPerformHouseholdAction("packer", "inventory:pack")).toBe(true);
    expect(canPerformHouseholdAction("viewer", "inventory:pack")).toBe(false);
    expect(canPerformHouseholdAction("guest", "queue:read")).toBe(true);
    expect(canPerformHouseholdAction("guest", "queue:write")).toBe(true);
    expect(canPerformHouseholdAction("viewer", "queue:run")).toBe(false);
    expect(canPerformHouseholdAction("packer", "queue:run")).toBe(true);
    expect(canPerformHouseholdAction("editor", "documentation:create")).toBe(
      true
    );
    expect(canPerformHouseholdAction("editor", "api_keys:manage")).toBe(false);
  });

  it("hides sensitive fields from mover-safe roles by default", () => {
    expect(canViewSensitiveField("viewer", "estimatedValue")).toBe(false);
    expect(canViewSensitiveField("packer", "serialNumber")).toBe(false);
    expect(canViewSensitiveField("editor", "privateNotes")).toBe(true);
    expect(canViewSensitiveField("admin", "apiKeys")).toBe(true);
  });

  it("returns a visibility policy for redaction decisions", () => {
    expect(visibilityForHouseholdRole("guest")).toEqual({
      estimatedValue: false,
      purchaseValue: false,
      serialNumber: false,
      privateNotes: false,
      sensitivePhotos: false,
      research: false,
      apiKeys: false,
    });
    expect(visibilityForHouseholdRole("editor").serialNumber).toBe(true);
    expect(visibilityForHouseholdRole("editor").research).toBe(true);
    expect(visibilityForHouseholdRole("editor").apiKeys).toBe(false);
  });

  it("uses the stronger role for move-specific grants", () => {
    expect(strongerHouseholdRole("viewer", "editor")).toBe("editor");
    expect(strongerHouseholdRole("admin", "guest")).toBe("admin");
  });
});
