import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  capacityValidator,
  normalizeRuleList,
  normalizeOptionalText,
  normalizeSortOrder,
  transportResourcePresetKeyValidator,
  transportResourceTypeValidator,
} from "./lib/moveFields";
import { requireMovePermission } from "./lib/permissions";
import { getTransportResourcePreset } from "./lib/transportPresets";

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

export const listForMoveWithZones = query({
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

    const resources = await ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
      .collect();

    return await Promise.all(
      resources
        .filter((resource) => !resource.archivedAt)
        .map(async (resource) => {
          const zones = await ctx.db
            .query("transportZones")
            .withIndex("by_resource_sort", (q) =>
              q.eq("resourceId", resource._id)
            )
            .collect();

          return {
            resource,
            zones: zones.filter((zone) => !zone.archivedAt),
          };
        })
    );
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
      description: normalizeOptionalText(args.description),
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

export const createFromPreset = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    presetKey: transportResourcePresetKeyValidator,
    name: v.optional(v.string()),
    capacity: v.optional(capacityValidator),
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

    const preset = getTransportResourcePreset(args.presetKey);
    const now = Date.now();
    const resourceId = await ctx.db.insert("transportResources", {
      householdId: args.householdId,
      moveId: args.moveId,
      type: preset.type,
      name: normalizeOptionalText(args.name) ?? preset.name,
      description: preset.description,
      capacity: args.capacity ?? preset.capacity,
      rules: normalizeRuleList(preset.rules),
      sortOrder: now,
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    const zoneIds = [];
    for (const [index, zone] of preset.zones.entries()) {
      const zoneId = await ctx.db.insert("transportZones", {
        householdId: args.householdId,
        moveId: args.moveId,
        resourceId,
        name: zone.name,
        description: zone.description,
        capacity: {},
        preferredTags: normalizeRuleList(zone.preferredTags ?? []),
        sortOrder: now + index,
        createdByUserId: actor.userId,
        createdAt: now,
        updatedAt: now,
      });
      zoneIds.push(zoneId);
    }

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "household",
      action: "transport_resource.preset_created",
      objectTable: "transportResources",
      objectId: resourceId,
      metadata: {
        presetKey: args.presetKey,
        type: preset.type,
        zoneCount: zoneIds.length,
      },
    });

    return { resourceId, zoneIds };
  },
});
