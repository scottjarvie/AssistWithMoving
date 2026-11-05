import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

import { internalMutation, query } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  requireHouseholdPermission,
  requireMovePermission,
} from "./lib/permissions";

/** Preserve old source rows, while hiding prior private grant details too. */
function householdReceipt(entry: Doc<"auditLogs">): Doc<"auditLogs"> {
  return entry.objectTable === "aiGrants" || entry.action.startsWith("ai_grant.")
    ? { ...entry, action: "ai_connection.changed", objectTable: undefined, objectId: undefined, metadata: undefined }
    : entry;
}

export const record = internalMutation({
  args: {
    householdId: v.optional(v.id("households")),
    moveId: v.optional(v.id("moves")),
    actorType: v.union(
      v.literal("user"),
      v.literal("apiKey"),
      v.literal("agent"),
      v.literal("system"),
      v.literal("webhook")
    ),
    actorUserId: v.optional(v.id("users")),
    actorApiKeyId: v.optional(v.string()),
    category: v.union(
      v.literal("auth"),
      v.literal("household"),
      v.literal("inventory"),
      v.literal("plan"),
      v.literal("assignment"),
      v.literal("photo"),
      v.literal("documentation"),
      v.literal("shareLink"),
      v.literal("apiKey"),
      v.literal("export"),
      v.literal("ai"),
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

    const rows = await ctx.db
      .query("auditLogs")
      .withIndex("by_household_time", (q) =>
        q.eq("householdId", args.householdId)
      )
      .order("desc")
      .take(Math.min(Math.max(Math.trunc(args.limit ?? 50), 1), 200));
    return rows.map(householdReceipt);
  },
});

// Owner-facing "who did what / whose agent did what" activity feed for a move.
// Resolves each event's human actor name and flags agent actions, so the UI can
// say e.g. "Erin's agent added 4 items" without the caller doing joins.
export const listForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );

    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const entries = await ctx.db
      .query("auditLogs")
      .withIndex("by_move_time", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .take(limit);

    const nameCache = new Map<string, string | null>();
    async function actorName(userId: string | undefined) {
      if (!userId) return null;
      if (nameCache.has(userId)) return nameCache.get(userId) ?? null;
      const user = await ctx.db.get(userId as Parameters<typeof ctx.db.get>[0]);
      const name =
        user && "name" in user
          ? ((user as { name?: string | null }).name ?? null)
          : null;
      nameCache.set(userId, name);
      return name;
    }

    return await Promise.all(
      entries.map(householdReceipt).map(async (entry) => ({
        _id: entry._id,
        action: entry.action,
        category: entry.category,
        objectTable: entry.objectTable ?? null,
        objectId: entry.objectId ?? null,
        createdAt: entry.createdAt,
        actorType: entry.actorType,
        // "agent" events carry BOTH the agent and the human who owns it.
        viaAgent: entry.actorType === "agent",
        actorName: await actorName(entry.actorUserId),
        metadata: entry.metadata ?? null,
      })),
    );
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
    ).map(householdReceipt);
  },
});
