import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

const liveQueueStatuses = new Set<Doc<"ingestionQueueEntries">["status"]>([
  "queued",
  "claimed",
  "needsInput",
]);

export type CascadeDeleteItemResult = {
  deletedPhotoIds: Id<"itemPhotos">[];
  deletedPhotoCount: number;
  deletedMembershipCount: number;
  deletedListingCount: number;
  deletedPlacementCount: number;
  updatedQueueEntryCount: number;
  updatedPlanningSuggestionCount: number;
};

export type CascadeDeleteBoxResult = {
  deletedPhotoIds: Id<"itemPhotos">[];
  deletedPhotoCount: number;
  unpackedItemCount: number;
  deletedPlacementCount: number;
  updatedQueueEntryCount: number;
  updatedPlanningSuggestionCount: number;
};

export async function archiveActiveSaleListingsForItem(
  ctx: MutationCtx,
  itemId: Id<"items">,
  now: number,
) {
  const listings = await ctx.db
    .query("saleListings")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .collect();
  let archived = 0;
  for (const listing of listings) {
    if (listing.archivedAt) continue;
    await ctx.db.patch(listing._id, {
      archivedAt: now,
      updatedAt: now,
    });
    archived += 1;
  }
  return archived;
}

export async function cascadeDeleteItem(
  ctx: MutationCtx,
  args: {
    moveId: Id<"moves">;
    itemId: Id<"items">;
    now: number;
  },
): Promise<CascadeDeleteItemResult> {
  const photos = await ctx.db
    .query("itemPhotos")
    .withIndex("by_item_created", (q) => q.eq("itemId", args.itemId))
    .collect();
  const memberships = await ctx.db
    .query("boxItems")
    .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
    .collect();
  const listings = await ctx.db
    .query("saleListings")
    .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
    .collect();
  const placements = await ctx.db
    .query("planPlacements")
    .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
    .collect();

  const deletedPhotoIds = photos.map((photo) => photo._id);
  const updatedQueueEntryCount = await scrubLiveQueueReferences(ctx, {
    moveId: args.moveId,
    itemId: args.itemId,
    deletedPhotoIds,
    now: args.now,
  });
  const updatedPlanningSuggestionCount = await scrubPlanningSuggestionReferences(
    ctx,
    {
      moveId: args.moveId,
      itemId: args.itemId,
      now: args.now,
    },
  );

  for (const doc of photos) await ctx.db.delete(doc._id);
  for (const doc of memberships) await ctx.db.delete(doc._id);
  for (const doc of listings) await ctx.db.delete(doc._id);
  for (const doc of placements) await ctx.db.delete(doc._id);

  return {
    deletedPhotoIds,
    deletedPhotoCount: photos.length,
    deletedMembershipCount: memberships.length,
    deletedListingCount: listings.length,
    deletedPlacementCount: placements.length,
    updatedQueueEntryCount,
    updatedPlanningSuggestionCount,
  };
}

export async function cascadeDeleteBox(
  ctx: MutationCtx,
  args: {
    moveId: Id<"moves">;
    boxId: Id<"boxes">;
    now: number;
  },
): Promise<CascadeDeleteBoxResult> {
  const photos = await ctx.db
    .query("itemPhotos")
    .withIndex("by_box_created", (q) => q.eq("boxId", args.boxId))
    .collect();
  const memberships = await ctx.db
    .query("boxItems")
    .withIndex("by_box", (q) => q.eq("boxId", args.boxId))
    .collect();
  const placements = await ctx.db
    .query("planPlacements")
    .withIndex("by_box", (q) => q.eq("boxId", args.boxId))
    .collect();

  const deletedPhotoIds = photos.map((photo) => photo._id);
  const updatedQueueEntryCount = await scrubLiveQueueReferences(ctx, {
    moveId: args.moveId,
    boxId: args.boxId,
    deletedPhotoIds,
    now: args.now,
  });
  const updatedPlanningSuggestionCount = await scrubPlanningSuggestionReferences(
    ctx,
    {
      moveId: args.moveId,
      boxId: args.boxId,
      now: args.now,
    },
  );

  for (const doc of photos) await ctx.db.delete(doc._id);
  for (const doc of memberships) await ctx.db.delete(doc._id);
  for (const doc of placements) await ctx.db.delete(doc._id);

  return {
    deletedPhotoIds,
    deletedPhotoCount: photos.length,
    unpackedItemCount: memberships.length,
    deletedPlacementCount: placements.length,
    updatedQueueEntryCount,
    updatedPlanningSuggestionCount,
  };
}

async function scrubLiveQueueReferences(
  ctx: MutationCtx,
  args: {
    moveId: Id<"moves">;
    itemId?: Id<"items">;
    boxId?: Id<"boxes">;
    deletedPhotoIds: Id<"itemPhotos">[];
    now: number;
  },
) {
  const entries = await liveQueueEntries(ctx, args.moveId);
  const deletedPhotoIds = new Set(args.deletedPhotoIds);
  let updated = 0;
  for (const entry of entries) {
    const patch = queueReferencePatch(entry, {
      itemId: args.itemId,
      boxId: args.boxId,
      deletedPhotoIds,
      now: args.now,
    });
    if (!patch) continue;
    await ctx.db.patch(entry._id, patch);
    updated += 1;
  }
  return updated;
}

async function liveQueueEntries(ctx: MutationCtx, moveId: Id<"moves">) {
  const entries = await ctx.db
    .query("ingestionQueueEntries")
    .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
    .collect();
  return entries.filter((entry) => liveQueueStatuses.has(entry.status));
}

function queueReferencePatch(
  entry: Doc<"ingestionQueueEntries">,
  args: {
    itemId?: Id<"items">;
    boxId?: Id<"boxes">;
    deletedPhotoIds: Set<Id<"itemPhotos">>;
    now: number;
  },
) {
  const patch: Partial<Doc<"ingestionQueueEntries">> = {};
  if (args.itemId && entry.targetItemId === args.itemId) {
    patch.targetItemId = undefined;
  }
  if (args.boxId && entry.targetBoxId === args.boxId) {
    patch.targetBoxId = undefined;
  }
  if (args.deletedPhotoIds.size > 0) {
    const mediaPhotoIds = entry.mediaPhotoIds.filter(
      (photoId) => !args.deletedPhotoIds.has(photoId),
    );
    if (mediaPhotoIds.length !== entry.mediaPhotoIds.length) {
      patch.mediaPhotoIds = mediaPhotoIds;
      if (
        entry.expectedMediaCount !== undefined &&
        entry.expectedMediaCount > mediaPhotoIds.length
      ) {
        patch.expectedMediaCount = mediaPhotoIds.length;
        if (entry.mediaUploadState === "uploading") {
          patch.mediaUploadState = "complete";
        }
      }
    }
  }
  if (Object.keys(patch).length === 0) return null;
  patch.updatedAt = args.now;
  return patch;
}

async function scrubPlanningSuggestionReferences(
  ctx: MutationCtx,
  args: {
    moveId: Id<"moves">;
    itemId?: Id<"items">;
    boxId?: Id<"boxes">;
    now: number;
  },
) {
  const suggestions = await ctx.db
    .query("aiPlanningSuggestions")
    .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
    .collect();
  let updated = 0;
  for (const suggestion of suggestions) {
    const patch: Partial<Doc<"aiPlanningSuggestions">> = {};
    if (args.itemId && suggestion.itemId === args.itemId) {
      patch.itemId = undefined;
    }
    if (args.boxId && suggestion.boxId === args.boxId) {
      patch.boxId = undefined;
    }
    if (Object.keys(patch).length === 0) continue;
    await ctx.db.patch(suggestion._id, { ...patch, updatedAt: args.now });
    updated += 1;
  }
  return updated;
}
