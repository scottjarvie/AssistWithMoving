import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  moveSpaceKindValidator,
  moveSpaceStatusValidator,
  normalizeOptionalText,
  normalizeRuleList,
  normalizeSortOrder,
} from "./lib/moveFields";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";

const dimensionsValidator = v.object({
  lengthIn: v.optional(v.number()),
  widthIn: v.optional(v.number()),
  heightIn: v.optional(v.number()),
});

const capacityValidator = v.object({
  maxWeightLb: v.optional(v.number()),
  maxVolumeCuFt: v.optional(v.number()),
  maxAreaSqFt: v.optional(v.number()),
  maxItemCount: v.optional(v.number()),
  dimensions: v.optional(dimensionsValidator),
  weightIsUnlimited: v.optional(v.boolean()),
  volumeIsUnlimited: v.optional(v.boolean()),
});

const spaceWriteArgs = {
  kind: moveSpaceKindValidator,
  name: v.string(),
  aliases: v.optional(v.array(v.string())),
  notes: v.optional(v.string()),
  floorLevel: v.optional(v.string()),
  sortOrder: v.optional(v.number()),
  status: v.optional(moveSpaceStatusValidator),
  transportResourceId: v.optional(v.id("transportResources")),
  transportZoneId: v.optional(v.id("transportZones")),
  linkedPlanEntityId: v.optional(v.id("planEntities")),
  capacity: v.optional(capacityValidator),
};

const defaultCapacity = {
  weightIsUnlimited: false,
  volumeIsUnlimited: false,
};

function normalizeName(name: string) {
  const normalized = normalizeOptionalText(name);
  if (!normalized) {
    throw new Error("Space name is required.");
  }
  return normalized.slice(0, 120);
}

function normalizeAliases(aliases: string[] | undefined) {
  return normalizeRuleList(aliases ?? []).map((alias) => alias.slice(0, 80));
}

async function assertSpaceTargets(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    transportResourceId?: Id<"transportResources">;
    transportZoneId?: Id<"transportZones">;
    linkedPlanEntityId?: Id<"planEntities">;
  },
) {
  if (args.transportResourceId) {
    const resource = await ctx.db.get(args.transportResourceId);
    if (
      !resource ||
      resource.householdId !== args.householdId ||
      resource.moveId !== args.moveId ||
      resource.archivedAt
    ) {
      throw new Error("Transport resource is not available for this move.");
    }
  }

  if (args.transportZoneId) {
    const zone = await ctx.db.get(args.transportZoneId);
    if (
      !zone ||
      zone.householdId !== args.householdId ||
      zone.moveId !== args.moveId ||
      zone.archivedAt
    ) {
      throw new Error("Transport zone is not available for this move.");
    }
  }

  if (args.linkedPlanEntityId) {
    const entity = await ctx.db.get(args.linkedPlanEntityId);
    if (
      !entity ||
      entity.householdId !== args.householdId ||
      entity.moveId !== args.moveId ||
      entity.archivedAt
    ) {
      throw new Error("Plan entity is not available for this move.");
    }
  }
}

export const listForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    kind: v.optional(moveSpaceKindValidator),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );

    const spaces = await ctx.db
      .query("moveSpaces")
      .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
      .collect();
    const photos = await ctx.db
      .query("itemPhotos")
      .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
      .collect();

    const photoCounts = new Map<string, number>();
    for (const photo of photos) {
      if (!photo.spaceId || photo.archivedAt) continue;
      photoCounts.set(
        String(photo.spaceId),
        (photoCounts.get(String(photo.spaceId)) ?? 0) + 1,
      );
    }

    return spaces
      .filter((space) => space.householdId === args.householdId)
      .filter((space) => args.includeArchived || space.status !== "archived")
      .filter((space) => (args.kind ? space.kind === args.kind : true))
      .map((space) => ({
        ...space,
        photoCount: photoCounts.get(String(space._id)) ?? 0,
      }));
  },
});

export const create = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    ...spaceWriteArgs,
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }

    await assertSpaceTargets(ctx, args);
    const now = Date.now();
    const spaceId = await ctx.db.insert("moveSpaces", {
      householdId: args.householdId,
      moveId: args.moveId,
      kind: args.kind,
      name: normalizeName(args.name),
      aliases: normalizeAliases(args.aliases),
      notes: normalizeOptionalText(args.notes),
      floorLevel: normalizeOptionalText(args.floorLevel),
      sortOrder: normalizeSortOrder(args.sortOrder),
      status: args.status ?? "active",
      transportResourceId: args.transportResourceId,
      transportZoneId: args.transportZoneId,
      linkedPlanEntityId: args.linkedPlanEntityId,
      capacity: args.capacity ?? defaultCapacity,
      createdByUserId: actor.userId,
      updatedByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "space.created",
      objectTable: "moveSpaces",
      objectId: spaceId,
      metadata: { name: args.name, kind: args.kind },
    });

    return spaceId;
  },
});

export const update = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    spaceId: v.id("moveSpaces"),
    kind: v.optional(moveSpaceKindValidator),
    name: v.optional(v.string()),
    aliases: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    floorLevel: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    status: v.optional(moveSpaceStatusValidator),
    transportResourceId: v.optional(v.id("transportResources")),
    transportZoneId: v.optional(v.id("transportZones")),
    linkedPlanEntityId: v.optional(v.id("planEntities")),
    capacity: v.optional(capacityValidator),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }

    const space = await ctx.db.get(args.spaceId);
    if (
      !space ||
      space.householdId !== args.householdId ||
      space.moveId !== args.moveId
    ) {
      throw new Error("Space not found.");
    }
    await assertSpaceTargets(ctx, args);

    const patch: Partial<Doc<"moveSpaces">> = {
      updatedByUserId: actor.userId,
      updatedAt: Date.now(),
    };
    if (args.kind !== undefined) patch.kind = args.kind;
    if (args.name !== undefined) patch.name = normalizeName(args.name);
    if (args.aliases !== undefined) patch.aliases = normalizeAliases(args.aliases);
    if (args.notes !== undefined) patch.notes = normalizeOptionalText(args.notes);
    if (args.floorLevel !== undefined) {
      patch.floorLevel = normalizeOptionalText(args.floorLevel);
    }
    if (args.sortOrder !== undefined) {
      patch.sortOrder = normalizeSortOrder(args.sortOrder);
    }
    if (args.status !== undefined) {
      patch.status = args.status;
      patch.archivedAt = args.status === "archived" ? Date.now() : undefined;
    }
    if (args.transportResourceId !== undefined) {
      patch.transportResourceId = args.transportResourceId;
    }
    if (args.transportZoneId !== undefined) {
      patch.transportZoneId = args.transportZoneId;
    }
    if (args.linkedPlanEntityId !== undefined) {
      patch.linkedPlanEntityId = args.linkedPlanEntityId;
    }
    if (args.capacity !== undefined) patch.capacity = args.capacity;

    await ctx.db.patch(args.spaceId, patch);
    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "space.updated",
      objectTable: "moveSpaces",
      objectId: args.spaceId,
      metadata: { changedKeys: Object.keys(patch) },
    });
  },
});

export const upsertBatchForMove = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    spaces: v.array(v.object(spaceWriteArgs)),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }
    if (args.spaces.length > 100) {
      throw new Error("Spaces are limited to 100 rows per request.");
    }

    const existing = await ctx.db
      .query("moveSpaces")
      .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
      .collect();
    const byKey = new Map(
      existing
        .filter((space) => space.householdId === args.householdId)
        .map((space) => [`${space.kind}:${space.name.toLowerCase()}`, space]),
    );
    const now = Date.now();
    const results = [];

    for (const input of args.spaces) {
      await assertSpaceTargets(ctx, {
        householdId: args.householdId,
        moveId: args.moveId,
        transportResourceId: input.transportResourceId,
        transportZoneId: input.transportZoneId,
        linkedPlanEntityId: input.linkedPlanEntityId,
      });
      const name = normalizeName(input.name);
      const key = `${input.kind}:${name.toLowerCase()}`;
      const match = byKey.get(key);
      if (match) {
        const patch: Partial<Doc<"moveSpaces">> = {
          aliases: normalizeAliases(input.aliases),
          notes: normalizeOptionalText(input.notes),
          floorLevel: normalizeOptionalText(input.floorLevel),
          sortOrder: normalizeSortOrder(input.sortOrder ?? match.sortOrder),
          status: input.status ?? match.status,
          transportResourceId: input.transportResourceId,
          transportZoneId: input.transportZoneId,
          linkedPlanEntityId: input.linkedPlanEntityId,
          capacity: input.capacity ?? match.capacity,
          updatedByUserId: actor.userId,
          updatedAt: now,
        };
        await ctx.db.patch(match._id, patch);
        results.push({ action: "updated" as const, spaceId: match._id, name });
      } else {
        const spaceId = await ctx.db.insert("moveSpaces", {
          householdId: args.householdId,
          moveId: args.moveId,
          kind: input.kind,
          name,
          aliases: normalizeAliases(input.aliases),
          notes: normalizeOptionalText(input.notes),
          floorLevel: normalizeOptionalText(input.floorLevel),
          sortOrder: normalizeSortOrder(input.sortOrder),
          status: input.status ?? "active",
          transportResourceId: input.transportResourceId,
          transportZoneId: input.transportZoneId,
          linkedPlanEntityId: input.linkedPlanEntityId,
          capacity: input.capacity ?? defaultCapacity,
          createdByUserId: actor.userId,
          updatedByUserId: actor.userId,
          createdAt: now,
          updatedAt: now,
        });
        results.push({ action: "created" as const, spaceId, name });
      }
    }

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "spaces.batch_upserted",
      objectTable: "moveSpaces",
      metadata: { count: results.length },
    });

    return results;
  },
});
