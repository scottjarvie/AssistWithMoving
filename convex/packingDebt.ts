import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { summarizePackingDebt } from "./lib/packingDebt";
import { requireMovePermission } from "./lib/permissions";

export const summaryForMove = query({
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

    const [
      items,
      boxes,
      memberships,
      photos,
      textSuggestions,
      photoSuggestions,
      planningSuggestions,
    ] = await Promise.all([
      ctx.db
        .query("items")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("boxes")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("boxItems")
        .withIndex("by_move", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("itemPhotos")
        .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("aiTextSuggestions")
        .withIndex("by_move_status", (q) =>
          q.eq("moveId", args.moveId).eq("status", "pending")
        )
        .collect(),
      ctx.db
        .query("aiPhotoSuggestions")
        .withIndex("by_move_status", (q) =>
          q.eq("moveId", args.moveId).eq("status", "pending")
        )
        .collect(),
      ctx.db
        .query("aiPlanningSuggestions")
        .withIndex("by_move_status", (q) =>
          q.eq("moveId", args.moveId).eq("status", "pending")
        )
        .collect(),
    ]);

    const householdItems = items.filter(
      (item) => item.householdId === args.householdId
    );
    const householdBoxes = boxes.filter(
      (box) => box.householdId === args.householdId
    );
    const householdMemberships = memberships.filter(
      (membership) => membership.householdId === args.householdId
    );
    const householdPhotos = photos.filter(
      (photo) => photo.householdId === args.householdId
    );

    return summarizePackingDebt({
      items: householdItems.map(toPackingDebtItem),
      boxes: householdBoxes.map(toPackingDebtBox),
      memberships: householdMemberships.map((membership) => ({
        boxId: String(membership.boxId),
        itemId: String(membership.itemId),
      })),
      photos: householdPhotos.map((photo) => ({
        itemId: photo.itemId ? String(photo.itemId) : undefined,
        boxId: photo.boxId ? String(photo.boxId) : undefined,
        photoType: photo.photoType,
        verificationStatus: photo.verificationStatus,
        archivedAt: photo.archivedAt,
      })),
      pendingAiSuggestions: {
        textSuggestions: countHouseholdRecords(textSuggestions, args.householdId),
        photoSuggestions: countHouseholdRecords(
          photoSuggestions,
          args.householdId
        ),
        planningSuggestions: countHouseholdRecords(
          planningSuggestions,
          args.householdId
        ),
      },
    });
  },
});

function toPackingDebtItem(item: Doc<"items">) {
  return {
    itemId: String(item._id),
    disposition: item.disposition,
    status: item.status,
    highValue: item.highValue,
    needsReview: item.needsReview,
    requiresPersonalTransport: item.requiresPersonalTransport,
    planningDefaultKeys: item.planningDefaultKeys,
    deletedAt: item.deletedAt,
  };
}

function toPackingDebtBox(box: Doc<"boxes">) {
  return {
    boxId: String(box._id),
    destinationRoom: box.destinationRoom,
    status: box.status,
    assignedResourceId: box.assignedResourceId
      ? String(box.assignedResourceId)
      : undefined,
    assignmentWarnings: box.assignmentWarnings,
    assignmentHardBlocks: box.assignmentHardBlocks,
    archivedAt: box.archivedAt,
  };
}

function countHouseholdRecords<TRecord extends { householdId: string }>(
  records: TRecord[],
  householdId: string
) {
  return records.filter((record) => record.householdId === householdId).length;
}
