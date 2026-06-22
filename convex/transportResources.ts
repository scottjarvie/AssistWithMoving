import { v } from "convex/values";

import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { recordAuditEvent } from "./lib/audit";
import {
  capacityReviewStatusValidator,
  capacityValidator,
  normalizeRuleList,
  normalizeOptionalText,
  normalizeSortOrder,
  transportResourcePresetKeyValidator,
  transportResourceTypeValidator,
} from "./lib/moveFields";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";
import {
  getTransportResourcePreset,
  type TransportResourcePresetKey,
} from "./lib/transportPresets";

// Shared by the createFromPreset mutation and template pre-loading in
// moves.create. Caller is responsible for permission checks.
export async function insertTransportResourceFromPreset(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    presetKey: TransportResourcePresetKey;
    userId: Id<"users">;
    name?: string;
    capacity?: Doc<"transportResources">["capacity"];
    sortOrder?: number;
  },
) {
  const preset = getTransportResourcePreset(args.presetKey);
  const now = Date.now();
  const resourceId = await ctx.db.insert("transportResources", {
    householdId: args.householdId,
    moveId: args.moveId,
    type: preset.type,
    name: normalizeOptionalText(args.name) ?? preset.name,
    description: preset.description,
    capacity: args.capacity ?? preset.capacity,
    capacityReviewStatus: "unreviewed",
    rules: normalizeRuleList(preset.rules),
    sortOrder: args.sortOrder ?? now,
    createdByUserId: args.userId,
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
      sortOrder: (args.sortOrder ?? now) + index,
      createdByUserId: args.userId,
      createdAt: now,
      updatedAt: now,
    });
    zoneIds.push(zoneId);
  }

  return { resourceId, zoneIds, preset };
}

export const update = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    resourceId: v.id("transportResources"),
    name: v.optional(v.string()),
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
      "household:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }
    const resource = await ctx.db.get(args.resourceId);
    if (!resource || resource.moveId !== args.moveId) {
      throw new Error("Transportation method not found for this move.");
    }

    const patch: Partial<Doc<"transportResources">> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      patch.name = args.name.trim() || resource.name;
    }
    if (args.description !== undefined) {
      patch.description = normalizeOptionalText(args.description);
    }
    if (args.capacity !== undefined) {
      patch.capacity = args.capacity;
      // A manual capacity edit means the user has reviewed it; lift it out of
      // the "unreviewed" default so capacity rollups treat it as a real value.
      if (resource.capacityReviewStatus === "unreviewed") {
        patch.capacityReviewStatus = "estimated";
      }
    }
    if (args.rules !== undefined) {
      patch.rules = normalizeRuleList(args.rules);
    }
    if (args.sortOrder !== undefined) {
      patch.sortOrder = normalizeSortOrder(args.sortOrder);
    }

    await ctx.db.patch(args.resourceId, patch);

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "household",
      action: "transport_resource.updated",
      objectTable: "transportResources",
      objectId: args.resourceId,
      metadata: { name: patch.name ?? resource.name },
    });
  },
});

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
      "inventory:read",
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
      "inventory:read",
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
              q.eq("resourceId", resource._id),
            )
            .collect();

          return {
            resource,
            zones: zones.filter((zone) => !zone.archivedAt),
          };
        }),
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
      "household:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }
    const now = Date.now();
    const resourceId = await ctx.db.insert("transportResources", {
      householdId: args.householdId,
      moveId: args.moveId,
      type: args.type,
      name: args.name.trim(),
      description: normalizeOptionalText(args.description),
      capacity: args.capacity ?? {},
      capacityReviewStatus: "unreviewed",
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
      "household:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }

    const { resourceId, zoneIds, preset } =
      await insertTransportResourceFromPreset(ctx, {
        householdId: args.householdId,
        moveId: args.moveId,
        presetKey: args.presetKey,
        userId: actor.userId,
        name: args.name,
        capacity: args.capacity,
      });

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

export const updateCapacityReview = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    resourceId: v.id("transportResources"),
    status: capacityReviewStatusValidator,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }

    const resource = await ctx.db.get(args.resourceId);
    if (
      !resource ||
      resource.householdId !== args.householdId ||
      resource.moveId !== args.moveId ||
      resource.archivedAt
    ) {
      throw new Error("Transport resource not found.");
    }

    const now = Date.now();
    await ctx.db.patch(args.resourceId, {
      capacityReviewStatus: args.status,
      capacityNotes: normalizeOptionalText(args.notes),
      capacityReviewedAt: now,
      capacityReviewedByUserId: actor.userId,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "household",
      action: "transport_resource.capacity_reviewed",
      objectTable: "transportResources",
      objectId: args.resourceId,
      metadata: {
        status: args.status,
        name: resource.name,
      },
    });
  },
});
