import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { summarizeClaimCenter } from "./lib/claimCenter";
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
      "documentation:read"
    );

    const [items, photos, memberships, auditEvents] = await Promise.all([
      ctx.db
        .query("items")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("itemPhotos")
        .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("boxItems")
        .withIndex("by_move", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("auditLogs")
        .withIndex("by_move_time", (q) => q.eq("moveId", args.moveId))
        .order("desc")
        .take(100),
    ]);

    return summarizeClaimCenter({
      items: items
        .filter((item) => item.householdId === args.householdId)
        .map(toClaimCenterItem),
      photos: photos
        .filter((photo) => photo.householdId === args.householdId)
        .map((photo) => ({
          photoId: String(photo._id),
          itemId: photo.itemId ? String(photo.itemId) : undefined,
          boxId: photo.boxId ? String(photo.boxId) : undefined,
          claimId: photo.claimId,
          photoType: photo.photoType,
          privacyLevel: photo.privacyLevel,
          verificationStatus: photo.verificationStatus,
          documentationProfileTypes: photo.documentationProfileTypes,
          archivedAt: photo.archivedAt,
        })),
      memberships: memberships
        .filter((membership) => membership.householdId === args.householdId)
        .map((membership) => ({
          boxId: String(membership.boxId),
          itemId: String(membership.itemId),
        })),
      auditEvents: auditEvents
        .filter((event) => event.householdId === args.householdId)
        .map((event) => ({
          eventId: String(event._id),
          action: event.action,
          category: event.category,
          objectTable: event.objectTable,
          objectId: event.objectId,
          metadata: event.metadata,
          createdAt: event.createdAt,
        })),
    });
  },
});

function toClaimCenterItem(item: Doc<"items">) {
  return {
    itemId: String(item._id),
    name: item.name,
    room: item.room,
    category: item.category,
    status: item.status,
    condition: item.condition,
    quantity: item.quantity,
    valueCents: item.valueCents,
    replacementValueCents: item.replacementValueCents,
    serialNumber: item.serialNumber,
    modelNumber: item.modelNumber,
    highValue: item.highValue,
    needsReview: item.needsReview,
    reviewFlags: item.reviewFlags,
    planningDefaultKeys: item.planningDefaultKeys,
    deletedAt: item.deletedAt,
    updatedAt: item.updatedAt,
  };
}
