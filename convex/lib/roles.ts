export const APP_ROLES = ["member", "admin"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const HOUSEHOLD_ROLES = [
  "owner",
  "admin",
  "editor",
  "packer",
  "viewer",
  "guest",
] as const;
export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];

export const MOVE_ROLES = HOUSEHOLD_ROLES;
export type MoveRole = HouseholdRole;

export const MEMBERSHIP_STATUSES = ["active", "invited", "disabled"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

const householdRoleRank: Record<HouseholdRole, number> = {
  owner: 60,
  admin: 50,
  editor: 40,
  packer: 30,
  viewer: 20,
  guest: 10,
};

export function householdRoleAtLeast(
  actual: HouseholdRole,
  required: HouseholdRole
) {
  return householdRoleRank[actual] >= householdRoleRank[required];
}

export function canManageHousehold(role: HouseholdRole) {
  return householdRoleAtLeast(role, "admin");
}

export function canEditHouseholdContent(role: HouseholdRole) {
  return householdRoleAtLeast(role, "editor");
}

export function canPackHouseholdContent(role: HouseholdRole) {
  return householdRoleAtLeast(role, "packer");
}
