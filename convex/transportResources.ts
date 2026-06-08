import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  capacityValidator,
  normalizeRuleList,
  normalizeSortOrder,
  transportResourceTypeValidator,
} from "./lib/moveFields";
import { requireMovePermission } from "./lib/permissions";

export const listForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read"
    );

    return await ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
      .collect();
  },
});

export const create = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    type: transportResourceTypeValidator,
    name: v.string(),
    description: v.optional(v.string()),
    capacity: v.optional(capacityValidator),
    rules: v.optional(v.array(v.string())),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:edit"
    );
    if (actor.type !== "user") {
      throw new Error("API-key resource creation is not implemented yet.");
    }
    const now = Date.now();
    const resourceId = await ctx.db.insert("transportResources", {
      householdId: args.householdId,
      moveId: args.moveId,
      type: args.type,
      name: args.name.trim(),
      description: args.description,
      capacity: args.capacity ?? {},
      rules: normalizeRuleList(args.rules ?? []),
      sortOrder: normalizeSortOrder(args.sortOrder),
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "household",
      action: "transport_resource.created",
      objectTable: "transportResources",
      objectId: resourceId,
      metadata: { type: args.type, name: args.name.trim() },
    });

    return resourceId;
  },
});
