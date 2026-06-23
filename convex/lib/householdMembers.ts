import type { Id } from "../_generated/dataModel";
import type { HouseholdRole } from "./roles";
import { canPerformHouseholdAction } from "./roles";

export const MANAGED_HOUSEHOLD_MEMBER_ROLES = [
  "admin",
  "editor",
  "packer",
  "viewer",
  "guest",
] as const;

export type ManagedHouseholdMemberRole =
  (typeof MANAGED_HOUSEHOLD_MEMBER_ROLES)[number];

export type MemberApiAccessStatus = "enabled" | "disabled";

const managedRoleSet = new Set<string>(MANAGED_HOUSEHOLD_MEMBER_ROLES);

export function normalizeCollaboratorEmail(value: string) {
  return value.trim().toLowerCase();
}

export function parseManagedHouseholdMemberRole(
  value: string,
): ManagedHouseholdMemberRole | null {
  return managedRoleSet.has(value)
    ? (value as ManagedHouseholdMemberRole)
    : null;
}

export function defaultMemberApiAccessStatus(role: HouseholdRole) {
  return canPerformHouseholdAction(role, "api_keys:manage")
    ? "enabled"
    : "disabled";
}

export function effectiveMemberApiAccessStatus({
  role,
  status,
  apiAccessStatus,
}: {
  role: HouseholdRole;
  status: string;
  apiAccessStatus?: MemberApiAccessStatus;
}) {
  if (status !== "active") {
    return "disabled";
  }

  return apiAccessStatus ?? defaultMemberApiAccessStatus(role);
}

export function canMembershipUseApiAccess(input: {
  role: HouseholdRole;
  status: string;
  apiAccessStatus?: MemberApiAccessStatus;
}) {
  return (
    defaultMemberApiAccessStatus(input.role) === "enabled" &&
    effectiveMemberApiAccessStatus(input) === "enabled"
  );
}

export function memberManagementBlockReason({
  action,
  currentUserId,
  targetUserId,
  targetRole,
}: {
  action: "changeRole" | "disable" | "apiAccess";
  currentUserId: Id<"users">;
  targetUserId: Id<"users">;
  targetRole: HouseholdRole;
}) {
  if (targetRole === "owner") {
    return action === "apiAccess"
      ? "Owner API access cannot be changed from this collaborator manager."
      : "Owner access cannot be changed from this collaborator manager.";
  }

  if (currentUserId === targetUserId) {
    if (action === "disable") {
      return "You cannot disable your own household access.";
    }

    if (action === "apiAccess") {
      return "You cannot change your own API access.";
    }

    return "You cannot change your own household role.";
  }

  return null;
}
