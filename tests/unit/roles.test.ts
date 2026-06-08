import { describe, expect, it } from "vitest";

import {
  canEditHouseholdContent,
  canManageHousehold,
  canPackHouseholdContent,
  householdRoleAtLeast,
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
});
