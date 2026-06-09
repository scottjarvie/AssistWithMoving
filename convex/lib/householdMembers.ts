import type { Id } from "../_generated/dataModel";
import type { HouseholdRole } from "./roles";

export const MANAGED_HOUSEHOLD_MEMBER_ROLES = [
  "admin",
  "editor",
  "packer",
  "viewer",
  "guest",
] as const;

export type ManagedHouseholdMemberRole =
  (typeof MANAGED_HOUSEHOLD_MEMBER_ROLES)[number];

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

export function memberManagementBlockReason({
  action,
  currentUserId,
  targetUserId,
  targetRole,
}: {
  action: "changeRole" | "disable";
  currentUserId: Id<"users">;
  targetUserId: Id<"users">;
  targetRole: HouseholdRole;
}) {
  if (targetRole === "owner") {
    return "Owner access cannot be changed from this collaborator manager.";
  }

  if (currentUserId === targetUserId) {
    return action === "disable"
      ? "You cannot disable your own household access."
      : "You cannot change your own household role.";
  }

  return null;
}
