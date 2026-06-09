import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  addDuplicateReviewFlag,
  findInventoryDuplicateGroups,
  hasDuplicateReviewFlag,
  itemIdsKey,
  removeDuplicateReviewFlag,
} from "./lib/inventoryDuplicates";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";

const duplicateGroupArgs = {
  householdId: v.id("households"),
  moveId: v.id("moves"),
  groupKey: v.string(),
  itemIds: v.array(v.id("items")),
};

export const listForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const policy = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );
    const [items, ignoredDecisions] = await Promise.all([
      ctx.db
        .query("items")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("inventoryDuplicateDecisions")
        .withIndex("by_move_status", (q) =>
          q.eq("moveId", args.moveId).eq("status", "ignored"),
        )
        .collect(),
    ]);

    const inventoryItems = items.filter(
      (item) => item.householdId === args.householdId,
    );
    const ignoredKeys = new Set(
      ignoredDecisions
        .filter((decision) => decision.householdId === args.householdId)
        .map((decision) =>
          duplicateDecisionKey(decision.groupKey, decision.itemIdsKey),
        ),
    );

    return findInventoryDuplicateGroups(inventoryItems, {
      limit: args.limit ?? 20,
    })
      .filter(
        (group) =>
          !ignoredKeys.has(
            duplicateDecisionKey(group.groupKey, itemIdsKey(group.itemIds)),
          ),
      )
      .map((group) => ({
        ...group,
        items: group.items.map((item) =>
          redactItemForVisibility(item, policy.visibility),
        ),
      }));
  },
});

export const markForReview = mutation({
  args: duplicateGroupArgs,
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

    const items = await loadGroupItems(ctx, args);
    const now = Date.now();
    await Promise.all(
      items.map((item) =>
        ctx.db.patch(item._id, {
          needsReview: true,
          reviewFlags: addDuplicateReviewFlag(item.reviewFlags),
          reviewedAt: undefined,
          updatedByUserId: actor.userId,
          updatedAt: now,
        }),
      ),
    );

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "inventory_duplicate.marked_for_review",
      metadata: {
        groupKey: args.groupKey,
        itemCount: items.length,
        itemIds: items.map((item) => String(item._id)),
      },
    });

    return { updatedCount: items.length };
  },
});

export const ignoreGroup = mutation({
  args: duplicateGroupArgs,
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

    const items = await loadGroupItems(ctx, args);
    const now = Date.now();
    const idsKey = itemIdsKey(args.itemIds.map((id) => String(id)));
    const existing = await ctx.db
      .query("inventoryDuplicateDecisions")
      .withIndex("by_move_group", (q) =>
        q
          .eq("moveId", args.moveId)
          .eq("groupKey", args.groupKey)
          .eq("itemIdsKey", idsKey),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "ignored",
        itemIds: args.itemIds,
        reviewedByUserId: actor.userId,
        reviewedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("inventoryDuplicateDecisions", {
        householdId: args.householdId,
        moveId: args.moveId,
        groupKey: args.groupKey,
        itemIdsKey: idsKey,
        itemIds: args.itemIds,
        status: "ignored",
        reviewedByUserId: actor.userId,
        reviewedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    await Promise.all(
      items
        .filter((item) => hasDuplicateReviewFlag(item.reviewFlags))
        .map((item) => {
          const reviewFlags = removeDuplicateReviewFlag(item.reviewFlags);
          return ctx.db.patch(item._id, {
            reviewFlags,
            needsReview: reviewFlags.length > 0,
            reviewedAt: reviewFlags.length > 0 ? undefined : now,
            updatedByUserId: actor.userId,
            updatedAt: now,
          });
        }),
    );

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "inventory_duplicate.ignored",
      metadata: {
        groupKey: args.groupKey,
        itemCount: items.length,
        itemIds: items.map((item) => String(item._id)),
      },
    });

    return { ignoredCount: items.length };
  },
});

async function loadGroupItems(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    itemIds: Id<"items">[];
  },
) {
  const items = await Promise.all(
    args.itemIds.map((itemId) => ctx.db.get(itemId)),
  );
  if (items.some((item) => !item)) {
    throw new Error("Duplicate review item no longer exists.");
  }

  const loadedItems = items as Doc<"items">[];
  for (const item of loadedItems) {
    if (
      item.householdId !== args.householdId ||
      item.moveId !== args.moveId ||
      item.deletedAt ||
      item.status === "archived"
    ) {
      throw new Error("Duplicate review item is not available for this move.");
    }
  }

  return loadedItems;
}

function redactItemForVisibility(
  item: Doc<"items">,
  visibility: Awaited<ReturnType<typeof requireMovePermission>>["visibility"],
) {
  return {
    ...item,
    valueCents: visibility.estimatedValue ? item.valueCents : undefined,
    replacementValueCents: visibility.estimatedValue
      ? item.replacementValueCents
      : undefined,
    serialNumber: visibility.serialNumber ? item.serialNumber : undefined,
    modelNumber: visibility.serialNumber ? item.modelNumber : undefined,
    privateNotes: visibility.privateNotes ? item.privateNotes : undefined,
  };
}

function duplicateDecisionKey(groupKey: string, idsKey: string) {
  return `${groupKey}::${idsKey}`;
}
