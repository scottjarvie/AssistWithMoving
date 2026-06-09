import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { summarizeDispositionPipelines } from "./lib/dispositionPipelines";
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

    const [items, boxes, memberships, photos, resources, profiles, shareLinks] =
      await Promise.all([
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
          .query("transportResources")
          .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
          .collect(),
        ctx.db
          .query("documentationProfiles")
          .withIndex("by_move_status", (q) => q.eq("moveId", args.moveId))
          .collect(),
        ctx.db
          .query("shareLinks")
          .withIndex("by_move_status", (q) => q.eq("moveId", args.moveId))
          .collect(),
      ]);

    return summarizeDispositionPipelines({
      items: items
        .filter((item) => item.householdId === args.householdId)
        .map(toDispositionPipelineItem),
      boxes: boxes
        .filter((box) => box.householdId === args.householdId)
        .map((box) => ({
          boxId: String(box._id),
          code: box.code,
          assignedResourceId: box.assignedResourceId
            ? String(box.assignedResourceId)
            : undefined,
          status: box.status,
          archivedAt: box.archivedAt,
        })),
      memberships: memberships
        .filter((membership) => membership.householdId === args.householdId)
        .map((membership) => ({
          itemId: String(membership.itemId),
          boxId: String(membership.boxId),
        })),
      photos: photos
        .filter((photo) => photo.householdId === args.householdId)
        .map((photo) => ({
          itemId: photo.itemId ? String(photo.itemId) : undefined,
          archivedAt: photo.archivedAt,
        })),
      resources: resources
        .filter((resource) => resource.householdId === args.householdId)
        .map((resource) => ({
          resourceId: String(resource._id),
          type: resource.type,
          archivedAt: resource.archivedAt,
        })),
      profiles: profiles
        .filter((profile) => profile.householdId === args.householdId)
        .map((profile) => ({
          profileId: String(profile._id),
          type: profile.type,
          status: profile.status,
          archivedAt: profile.archivedAt,
        })),
      shareLinks: shareLinks
        .filter((shareLink) => shareLink.householdId === args.householdId)
        .map((shareLink) => ({
          shareLinkId: String(shareLink._id),
          documentationProfileId: shareLink.documentationProfileId
            ? String(shareLink.documentationProfileId)
            : undefined,
          status: shareLink.status,
          expiresAt: shareLink.expiresAt,
          revokedAt: shareLink.revokedAt,
        })),
      now: Date.now(),
    });
  },
});

function toDispositionPipelineItem(item: Doc<"items">) {
  return {
    itemId: String(item._id),
    name: item.name,
    room: item.room,
    category: item.category,
    disposition: item.disposition,
    status: item.status,
    quantity: item.quantity,
    valueCents: item.valueCents,
    replacementValueCents: item.replacementValueCents,
    deletedAt: item.deletedAt,
  };
}
