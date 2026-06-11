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

export type PermissionAction =
  | "household:read"
  | "household:edit"
  | "household:manage_members"
  | "household:manage_settings"
  | "inventory:read"
  | "inventory:edit"
  | "inventory:pack"
  | "plan:read"
  | "plan:edit"
  | "documentation:read"
  | "documentation:create"
  | "documentation:manage"
  | "api_keys:manage"
  | "admin:read";

const actionMinimumRole: Record<PermissionAction, HouseholdRole> = {
  "household:read": "guest",
  "household:edit": "editor",
  "household:manage_members": "admin",
  "household:manage_settings": "admin",
  "inventory:read": "guest",
  "inventory:edit": "editor",
  "inventory:pack": "packer",
  "plan:read": "guest",
  "plan:edit": "editor",
  "documentation:read": "viewer",
  "documentation:create": "editor",
  "documentation:manage": "admin",
  "api_keys:manage": "admin",
  "admin:read": "admin",
};

export type SensitiveField =
  | "estimatedValue"
  | "purchaseValue"
  | "serialNumber"
  | "privateNotes"
  | "sensitivePhotos"
  | "apiKeys";

const sensitiveFieldMinimumRole: Record<SensitiveField, HouseholdRole> = {
  estimatedValue: "editor",
  purchaseValue: "editor",
  serialNumber: "editor",
  privateNotes: "editor",
  sensitivePhotos: "editor",
  apiKeys: "admin",
};

export function householdRoleAtLeast(
  actual: HouseholdRole,
  required: HouseholdRole
) {
  return householdRoleRank[actual] >= householdRoleRank[required];
}

export function strongerHouseholdRole(
  first: HouseholdRole,
  second: HouseholdRole
) {
  return householdRoleRank[first] >= householdRoleRank[second] ? first : second;
}

export function canPerformHouseholdAction(
  role: HouseholdRole,
  action: PermissionAction
) {
  return householdRoleAtLeast(role, actionMinimumRole[action]);
}

export function canViewSensitiveField(
  role: HouseholdRole,
  field: SensitiveField
) {
  return householdRoleAtLeast(role, sensitiveFieldMinimumRole[field]);
}

export function visibilityForHouseholdRole(role: HouseholdRole) {
  return {
    estimatedValue: canViewSensitiveField(role, "estimatedValue"),
    purchaseValue: canViewSensitiveField(role, "purchaseValue"),
    serialNumber: canViewSensitiveField(role, "serialNumber"),
    privateNotes: canViewSensitiveField(role, "privateNotes"),
    sensitivePhotos: canViewSensitiveField(role, "sensitivePhotos"),
    apiKeys: canViewSensitiveField(role, "apiKeys"),
  };
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
