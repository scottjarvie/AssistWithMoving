import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { summarizeEvidenceDensity } from "./lib/evidenceDensity";
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

    const [items, boxes, memberships, photos] = await Promise.all([
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
    ]);

    return summarizeEvidenceDensity({
      items: items
        .filter((item) => item.householdId === args.householdId)
        .map(toEvidenceDensityItem),
      boxes: boxes
        .filter((box) => box.householdId === args.householdId)
        .map((box) => ({
          boxId: String(box._id),
          archivedAt: box.archivedAt,
        })),
      memberships: memberships
        .filter((membership) => membership.householdId === args.householdId)
        .map((membership) => ({
          boxId: String(membership.boxId),
          itemId: String(membership.itemId),
        })),
      photos: photos
        .filter((photo) => photo.householdId === args.householdId)
        .map((photo) => ({
          itemId: photo.itemId ? String(photo.itemId) : undefined,
          photoType: photo.photoType,
          archivedAt: photo.archivedAt,
        })),
    });
  },
});

function toEvidenceDensityItem(item: Doc<"items">) {
  return {
    itemId: String(item._id),
    name: item.name,
    room: item.room,
    category: item.category,
    disposition: item.disposition,
    status: item.status,
    condition: item.condition,
    valueCents: item.valueCents,
    replacementValueCents: item.replacementValueCents,
    highValue: item.highValue,
    needsReview: item.needsReview,
    requiresPersonalTransport: item.requiresPersonalTransport,
    planningDefaultKeys: item.planningDefaultKeys,
    deletedAt: item.deletedAt,
  };
}
