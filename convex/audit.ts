import { v } from "convex/values";

import { internalMutation, query } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import { requireHouseholdPermission } from "./lib/permissions";

export const record = internalMutation({
  args: {
    householdId: v.optional(v.id("households")),
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
