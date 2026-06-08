import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const appRole = v.union(v.literal("member"), v.literal("admin"));

export const householdRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("editor"),
  v.literal("packer"),
  v.literal("viewer"),
  v.literal("guest")
);

export const membershipStatus = v.union(
  v.literal("active"),
  v.literal("invited"),
  v.literal("disabled")
);

export const moveRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("editor"),
  v.literal("packer"),
  v.literal("viewer"),
  v.literal("guest")
);

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    appRole,
    status: v.union(v.literal("active"), v.literal("disabled")),
    defaultHouseholdId: v.optional(v.id("households")),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  households: defineTable({
    name: v.string(),
    slug: v.optional(v.string()),
    createdByUserId: v.id("users"),
    ownerUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_slug", ["slug"])
    .index("by_archived", ["archivedAt"]),

  householdMemberships: defineTable({
    householdId: v.id("households"),
    userId: v.id("users"),
    role: householdRole,
    status: membershipStatus,
    invitedEmail: v.optional(v.string()),
    createdByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_household_user", ["householdId", "userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_household_status_role", ["householdId", "status", "role"])
    .index("by_invited_email", ["invitedEmail"]),

  moveRoleGrants: defineTable({
    householdId: v.id("households"),
    moveId: v.id("moves"),
    userId: v.id("users"),
    role: moveRole,
    status: membershipStatus,
    createdByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_move_user", ["moveId", "userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_household_move", ["householdId", "moveId"]),
});
