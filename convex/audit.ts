import { v } from "convex/values";

import { internalMutation, query } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  requireHouseholdPermission,
  requireMovePermission,
} from "./lib/permissions";

export const record = internalMutation({
  args: {
    householdId: v.optional(v.id("households")),
    moveId: v.optional(v.id("moves")),
    actorType: v.union(
      v.literal("user"),
      v.literal("apiKey"),
      v.literal("system"),
      v.literal("webhook")
    ),
    actorUserId: v.optional(v.id("users")),
    actorApiKeyId: v.optional(v.string()),
    category: v.union(
      v.literal("auth"),
      v.literal("household"),
      v.literal("inventory"),
      v.literal("assignment"),
      v.literal("photo"),
      v.literal("documentation"),
      v.literal("shareLink"),
      v.literal("apiKey"),
      v.literal("export"),
      v.literal("admin"),
      v.literal("system")
    ),
    action: v.string(),
    objectTable: v.optional(v.string()),
    objectId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await recordAuditEvent(ctx, args);
  },
});

export const listForHousehold = query({
  args: {
    householdId: v.id("households"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireHouseholdPermission(ctx, args.householdId, "admin:read");

    return await ctx.db
      .query("auditLogs")
      .withIndex("by_household_time", (q) =>
        q.eq("householdId", args.householdId)
      )
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listForObject = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    objectTable: v.string(),
    objectId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read"
    );

    const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);
    const entries = await ctx.db
      .query("auditLogs")
      .withIndex("by_object_time", (q) =>
        q.eq("objectTable", args.objectTable).eq("objectId", args.objectId)
      )
      .order("desc")
      .take(limit);

    return entries.filter(
      (entry) =>
        entry.householdId === args.householdId && entry.moveId === args.moveId
    );
  },
});
