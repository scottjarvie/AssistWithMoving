import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  dimensionsValidator,
  estimateConfidenceValidator,
  normalizeItemName,
  normalizeOptionalText,
  normalizedSearchName,
} from "./lib/moveFields";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";

const plannedItemStatusValidator = v.union(
  v.literal("idea"),
  v.literal("decided"),
  v.literal("purchased"),
  v.literal("dropped"),
);

const plannedItemWriteArgs = {
  category: v.optional(v.string()),
  subcategory: v.optional(v.string()),
  description: v.optional(v.string()),
  dimensionsIn: v.optional(dimensionsValidator),
  dimensionsConfidence: v.optional(estimateConfidenceValidator),
  estimatedPriceCents: v.optional(v.number()),
  url: v.optional(v.string()),
  priority: v.optional(v.number()),
  notes: v.optional(v.string()),
  status: v.optional(plannedItemStatusValidator),
};

function normalizePriority(value: number | undefined) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value)) return undefined;
  return Math.min(4, Math.max(1, Math.round(value)));
}

async function requirePlannedItem(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    plannedItemId: Id<"plannedItems">;
  },
) {
  const plannedItem = await ctx.db.get(args.plannedItemId);
  if (
    !plannedItem ||
    plannedItem.householdId !== args.householdId ||
    plannedItem.moveId !== args.moveId ||
    plannedItem.archivedAt
  ) {
    throw new Error("Planned item not found.");
  }
  return plannedItem;
}

async function activePlanPlacementsForPlannedItem(
  ctx: MutationCtx,
  plannedItem: Doc<"plannedItems">,
) {
  const placements = await ctx.db
    .query("planPlacements")
    .withIndex("by_planned_item", (q) => q.eq("plannedItemId", plannedItem._id))
    .collect();

  return placements.filter(
    (placement) =>
      placement.householdId === plannedItem.householdId &&
      placement.moveId === plannedItem.moveId &&
      !placement.archivedAt,
  );
}

export const listForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );

    const plannedItems = await ctx.db
      .query("plannedItems")
      .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .collect();

    return plannedItems.filter(
      (plannedItem) =>
        plannedItem.householdId === args.householdId &&
        (args.includeArchived || !plannedItem.archivedAt),
    );
  },
});

export const create = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    name: v.string(),
    ...plannedItemWriteArgs,
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

    const now = Date.now();
    const name = normalizeItemName(args.name);
    if (!name) {
      throw new Error("name is required.");
    }
    const plannedItemId = await ctx.db.insert("plannedItems", {
      householdId: args.householdId,
      moveId: args.moveId,
      name,
      normalizedName: normalizedSearchName(name),
      category: normalizeOptionalText(args.category),
      subcategory: normalizeOptionalText(args.subcategory),
      description: normalizeOptionalText(args.description),
      dimensionsIn: args.dimensionsIn,
      dimensionsConfidence: args.dimensionsConfidence,
      estimatedPriceCents: args.estimatedPriceCents,
      url: normalizeOptionalText(args.url),
      priority: normalizePriority(args.priority),
      notes: normalizeOptionalText(args.notes),
      status: args.status ?? "idea",
      createdVia: "manual",
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
      action: "planned_item.created",
      objectTable: "plannedItems",
      objectId: plannedItemId,
      metadata: { name },
    });

    return plannedItemId;
  },
});

export const update = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    plannedItemId: v.id("plannedItems"),
    name: v.optional(v.string()),
    ...plannedItemWriteArgs,
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
    const plannedItem = await requirePlannedItem(ctx, args);

    const patch: Partial<Doc<"plannedItems">> = {
      updatedByUserId: actor.userId,
      updatedAt: Date.now(),
    };
    if (args.name !== undefined) {
      const name = normalizeItemName(args.name);
      if (!name) {
        throw new Error("name is required.");
      }
      patch.name = name;
      patch.normalizedName = normalizedSearchName(name);
    }
    if (args.category !== undefined) {
      patch.category = normalizeOptionalText(args.category);
    }
    if (args.subcategory !== undefined) {
      patch.subcategory = normalizeOptionalText(args.subcategory);
    }
    if (args.description !== undefined) {
      patch.description = normalizeOptionalText(args.description);
    }
    if (args.dimensionsIn !== undefined) {
      patch.dimensionsIn = args.dimensionsIn;
    }
    if (args.dimensionsConfidence !== undefined) {
      patch.dimensionsConfidence = args.dimensionsConfidence;
    }
    if (args.estimatedPriceCents !== undefined) {
      patch.estimatedPriceCents = args.estimatedPriceCents;
    }
    if (args.url !== undefined) {
      patch.url = normalizeOptionalText(args.url);
    }
    if (args.priority !== undefined) {
      patch.priority = normalizePriority(args.priority);
    }
    if (args.notes !== undefined) {
      patch.notes = normalizeOptionalText(args.notes);
    }
    if (args.status !== undefined) {
      patch.status = args.status;
    }

    await ctx.db.patch(args.plannedItemId, patch);
    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "planned_item.updated",
      objectTable: "plannedItems",
      objectId: args.plannedItemId,
      metadata: {
        changedKeys: Object.keys(patch),
        ...(patch.status && patch.status !== plannedItem.status
          ? { statusFrom: plannedItem.status, statusTo: patch.status }
          : {}),
      },
    });
  },
});

export const archive = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    plannedItemId: v.id("plannedItems"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const plannedItem = await requirePlannedItem(ctx, args);
    const now = Date.now();

    await ctx.db.patch(plannedItem._id, {
      archivedAt: now,
      updatedByUserId: actor.type === "user" ? actor.userId : plannedItem.updatedByUserId,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: actor.type,
      actorUserId: actor.type === "user" ? actor.userId : undefined,
      actorApiKeyId: actor.type === "apiKey" ? actor.apiKeyId : undefined,
      category: "inventory",
      action: "planned_item.archived",
      objectTable: "plannedItems",
      objectId: plannedItem._id,
    });
  },
});

export const convertToOwned = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    plannedItemId: v.id("plannedItems"),
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
    const plannedItem = await requirePlannedItem(ctx, args);
    if (plannedItem.convertedItemId) {
      return {
        itemId: plannedItem.convertedItemId,
        reparentedPlacementCount: 0,
      };
    }

    const now = Date.now();
    const itemId = await ctx.db.insert("items", {
      householdId: plannedItem.householdId,
      moveId: plannedItem.moveId,
      name: plannedItem.name,
      normalizedName: plannedItem.normalizedName,
      description: plannedItem.description,
      category: plannedItem.category,
      subcategory: plannedItem.subcategory,
      disposition: "take",
      status: "active",
      quantity: 1,
      condition: "unknown",
      dimensionsIn: plannedItem.dimensionsIn,
      dimensionsConfidence: plannedItem.dimensionsConfidence ?? "medium",
      weightConfidence: "none",
      volumeConfidence: "none",
      fragility: "low",
      stackable: true,
      hazardousFlag: false,
      highValue: false,
      requiresPersonalTransport: false,
      planningDefaultKeys: [],
      needsReview: false,
      reviewFlags: [],
      privateNotes: plannedItem.notes,
      aiTags: [],
      createdVia: "manual",
      reviewedAt: now,
      createdByUserId: actor.userId,
      updatedByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    const placements = await activePlanPlacementsForPlannedItem(ctx, plannedItem);
    await Promise.all(
      placements.map((placement) =>
        ctx.db.patch(placement._id, {
          itemId,
          plannedItemId: undefined,
          updatedAt: now,
        }),
      ),
    );

    await ctx.db.patch(plannedItem._id, {
      status: "purchased",
      convertedItemId: itemId,
      updatedByUserId: actor.userId,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: plannedItem.householdId,
      moveId: plannedItem.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "planned_item.converted",
      objectTable: "plannedItems",
      objectId: plannedItem._id,
      metadata: {
        itemId,
        reparentedPlacementCount: placements.length,
      },
    });

    return { itemId, reparentedPlacementCount: placements.length };
  },
});
