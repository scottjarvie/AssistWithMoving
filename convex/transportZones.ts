import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  capacityValidator,
  normalizeRuleList,
  normalizeSortOrder,
} from "./lib/moveFields";
import { requireMovePermission } from "./lib/permissions";

export const listForResource = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    resourceId: v.id("transportResources"),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read"
    );

    return await ctx.db
      .query("transportZones")
      .withIndex("by_resource_sort", (q) => q.eq("resourceId", args.resourceId))
      .collect();
  },
});

export const create = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    resourceId: v.id("transportResources"),
    name: v.string(),
    description: v.optional(v.string()),
    capacity: v.optional(capacityValidator),
    preferredTags: v.optional(v.array(v.string())),
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
      throw new Error("API-key zone creation is not implemented yet.");
    }
    const now = Date.now();
    const zoneId = await ctx.db.insert("transportZones", {
      householdId: args.householdId,
      moveId: args.moveId,
      resourceId: args.resourceId,
      name: args.name.trim(),
      description: args.description,
      capacity: args.capacity ?? {},
      preferredTags: normalizeRuleList(args.preferredTags ?? []),
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
      action: "transport_zone.created",
      objectTable: "transportZones",
      objectId: zoneId,
      metadata: { resourceId: args.resourceId, name: args.name.trim() },
    });

    return zoneId;
  },
});
