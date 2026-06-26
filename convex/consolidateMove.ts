// One-off: consolidate a (legacy/duplicate) move's inventory INTO another move.
//
// For each non-deleted item in fromMove:
//  - DUPLICATE (same normalizedName as a toMove item): enrich the toMove item
//    with any weight/dimension/volume it's MISSING, move the legacy item's
//    photos onto it (deduped by originalHash), then soft-delete the legacy item.
//  - UNIQUE: re-point the item to toMove (clearing move-scoped space/transport
//    refs, keeping the free-text room), and move its photos.
// Boxes ("movable units") are re-pointed to toMove (codes disambiguated on
// collision), and boxItems follow their box/item (re-pointed to the surviving
// item when their item was merged away).
//
// dryRun:true writes nothing and returns the full plan. Run that first.
// Run via: npx convex run consolidateMove:consolidateMove '{...}' --prod
import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, internalMutation } from "./_generated/server";

export const exportMoveInventory = internalQuery({
  args: { moveId: v.id("moves") },
  handler: async (ctx, { moveId }) => {
    const items = (
      await ctx.db
        .query("items")
        .withIndex("by_move_updated", (q) => q.eq("moveId", moveId))
        .collect()
    ).filter((i) => !i.deletedAt);
    const boxes = (
      await ctx.db
        .query("boxes")
        .withIndex("by_move_updated", (q) => q.eq("moveId", moveId))
        .collect()
    ).filter((b) => !b.archivedAt);
    const photos = (
      await ctx.db
        .query("itemPhotos")
        .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
        .collect()
    ).filter((p) => !p.archivedAt);
    const photosByItem = new Map<string, number>();
    for (const p of photos) {
      if (p.itemId) photosByItem.set(p.itemId, (photosByItem.get(p.itemId) ?? 0) + 1);
    }
    return {
      items: items.map((i) => ({
        id: i._id,
        name: i.name,
        norm: i.normalizedName,
        room: i.room ?? null,
        weight: i.estimatedWeightLb ?? null,
        actualWeight: i.actualWeightLb ?? null,
        hasDims: !!i.dimensionsIn,
        photos: photosByItem.get(i._id) ?? 0,
      })),
      boxes: boxes.map((b) => ({ id: b._id, code: b.code, label: b.label ?? null })),
      totals: { items: items.length, boxes: boxes.length, photos: photos.length },
    };
  },
});

// Move any leftover photos still on fromMove (box-level, room/space-level, or
// move-level — i.e. not attached to an item, so consolidateMove didn't relocate
// them) onto toMove. Keeps boxId (the box moved too) and the free-text room;
// clears spaceId (legacy moveSpaces don't exist in toMove).
export const moveRemainingPhotos = internalMutation({
  args: {
    fromMoveId: v.id("moves"),
    toMoveId: v.id("moves"),
    dryRun: v.boolean(),
  },
  handler: async (ctx, { fromMoveId, toMoveId, dryRun }) => {
    const toMove = await ctx.db.get(toMoveId);
    if (!toMove) throw new ConvexError("to move not found.");
    const now = Date.now();
    const photos = (
      await ctx.db
        .query("itemPhotos")
        .withIndex("by_move_created", (q) => q.eq("moveId", fromMoveId))
        .collect()
    ).filter((p) => !p.archivedAt);
    const summary = {
      total: photos.length,
      withItem: 0,
      withBox: 0,
      withSpace: 0,
      moveLevel: 0,
      moved: 0,
    };
    for (const p of photos) {
      if (p.itemId) summary.withItem++;
      else if (p.boxId) summary.withBox++;
      else if (p.spaceId) summary.withSpace++;
      else summary.moveLevel++;
      if (!dryRun)
        await ctx.db.patch(p._id, {
          moveId: toMoveId,
          householdId: toMove.householdId,
          spaceId: undefined,
          updatedAt: now,
        });
      summary.moved++;
    }
    return summary;
  },
});

export const consolidateMove = internalMutation({
  args: {
    fromMoveId: v.id("moves"),
    toMoveId: v.id("moves"),
    dryRun: v.boolean(),
    // Force-merge these legacy items into the given toMove item, regardless of
    // normalizedName (for fuzzy/human-confirmed duplicates).
    explicitMerges: v.optional(
      v.array(v.object({ fromId: v.id("items"), toId: v.id("items") })),
    ),
  },
  handler: async (ctx, { fromMoveId, toMoveId, dryRun, explicitMerges }) => {
    if (fromMoveId === toMoveId) throw new ConvexError("from and to are the same move.");
    const explicit = new Map<string, Id<"items">>(
      (explicitMerges ?? []).map((p) => [p.fromId, p.toId]),
    );
    const fromMove = await ctx.db.get(fromMoveId);
    const toMove = await ctx.db.get(toMoveId);
    if (!fromMove || !toMove) throw new ConvexError("Move not found.");
    const toHouseholdId = toMove.householdId;
    const now = Date.now();

    const liveToItems = (
      await ctx.db
        .query("items")
        .withIndex("by_move_updated", (q) => q.eq("moveId", toMoveId))
        .collect()
    ).filter((i) => !i.deletedAt);
    // normalizedName -> surviving item id in toMove (first wins).
    const survivorByNorm = new Map<string, Id<"items">>();
    for (const it of liveToItems) {
      if (!survivorByNorm.has(it.normalizedName)) survivorByNorm.set(it.normalizedName, it._id);
    }

    const fromItems = (
      await ctx.db
        .query("items")
        .withIndex("by_move_updated", (q) => q.eq("moveId", fromMoveId))
        .collect()
    ).filter((i) => !i.deletedAt);

    // Map a merged-away legacy item id -> surviving toMove item id (for boxItems).
    const mergedItemMap = new Map<string, Id<"items">>();

    const plan = {
      from: fromMove.title,
      to: toMove.title,
      merged: [] as Array<{
        from: string;
        into: string;
        filled: string[];
        photosMoved: number;
        photosSkippedDup: number;
      }>,
      movedUnique: [] as Array<{ name: string; photos: number }>,
      boxesMoved: [] as Array<{ code: string; renamedTo: string | null }>,
      boxItemsRepointed: 0,
      totals: {
        merged: 0,
        movedUnique: 0,
        photosMoved: 0,
        photosSkippedDup: 0,
        weightsFilled: 0,
        dimsFilled: 0,
      },
    };

    async function photosForItem(itemId: Id<"items">) {
      return (
        await ctx.db
          .query("itemPhotos")
          .withIndex("by_item_created", (q) => q.eq("itemId", itemId))
          .collect()
      ).filter((p) => !p.archivedAt);
    }

    for (const fi of fromItems) {
      const survivorId = explicit.get(fi._id) ?? survivorByNorm.get(fi.normalizedName);

      if (survivorId && survivorId !== fi._id) {
        // DUPLICATE -> enrich survivor, move photos, soft-delete legacy.
        const survivor = (await ctx.db.get(survivorId)) as Doc<"items">;
        const patch: Partial<Doc<"items">> = {};
        if (survivor.estimatedWeightLb == null && fi.estimatedWeightLb != null)
          patch.estimatedWeightLb = fi.estimatedWeightLb;
        if (survivor.actualWeightLb == null && fi.actualWeightLb != null)
          patch.actualWeightLb = fi.actualWeightLb;
        if (survivor.dimensionsIn == null && fi.dimensionsIn != null)
          patch.dimensionsIn = fi.dimensionsIn;
        if (survivor.estimatedVolumeCuFt == null && fi.estimatedVolumeCuFt != null)
          patch.estimatedVolumeCuFt = fi.estimatedVolumeCuFt;
        if (survivor.estimatedWeightLb == null && fi.estimatedWeightLb != null)
          plan.totals.weightsFilled++;
        if (survivor.dimensionsIn == null && fi.dimensionsIn != null)
          plan.totals.dimsFilled++;

        const survivorHashes = new Set(
          (await photosForItem(survivorId))
            .map((p) => p.originalHash)
            .filter(Boolean) as string[],
        );
        let movedP = 0;
        let skipP = 0;
        for (const p of await photosForItem(fi._id)) {
          if (p.originalHash && survivorHashes.has(p.originalHash)) {
            skipP++;
            continue;
          }
          if (!dryRun)
            await ctx.db.patch(p._id, {
              itemId: survivorId,
              moveId: toMoveId,
              householdId: toHouseholdId,
              boxId: undefined,
              spaceId: undefined,
              updatedAt: now,
            });
          movedP++;
        }

        if (Object.keys(patch).length && !dryRun) {
          patch.updatedAt = now;
          await ctx.db.patch(survivorId, patch);
        }
        if (!dryRun) await ctx.db.patch(fi._id, { deletedAt: now, updatedAt: now });

        mergedItemMap.set(fi._id, survivorId);
        plan.merged.push({
          from: fi.name,
          into: survivor.name,
          filled: Object.keys(patch).filter((k) => k !== "updatedAt"),
          photosMoved: movedP,
          photosSkippedDup: skipP,
        });
        plan.totals.merged++;
        plan.totals.photosMoved += movedP;
        plan.totals.photosSkippedDup += skipP;
      } else {
        // UNIQUE -> re-point to toMove; clear move-scoped refs, keep room text.
        const itemPhotos = await photosForItem(fi._id);
        if (!dryRun) {
          await ctx.db.patch(fi._id, {
            moveId: toMoveId,
            householdId: toHouseholdId,
            currentSpaceId: undefined,
            destinationSpaceId: undefined,
            assignedResourceId: undefined,
            assignedZoneId: undefined,
            assignedTripId: undefined,
            assignedTripSpaceId: undefined,
            assignmentLocked: undefined,
            assignmentValidatedAt: undefined,
            assignmentWarnings: undefined,
            assignmentHardBlocks: undefined,
            updatedAt: now,
          });
          for (const p of itemPhotos) {
            await ctx.db.patch(p._id, {
              moveId: toMoveId,
              householdId: toHouseholdId,
              spaceId: undefined,
              updatedAt: now,
            });
          }
        }
        // This item now lives in toMove; future legacy dups should merge into it.
        if (!survivorByNorm.has(fi.normalizedName))
          survivorByNorm.set(fi.normalizedName, fi._id);
        plan.movedUnique.push({ name: fi.name, photos: itemPhotos.length });
        plan.totals.movedUnique++;
        plan.totals.photosMoved += itemPhotos.length;
      }
    }

    // Boxes -> re-point to toMove, disambiguate code collisions.
    const fromBoxes = (
      await ctx.db
        .query("boxes")
        .withIndex("by_move_updated", (q) => q.eq("moveId", fromMoveId))
        .collect()
    ).filter((b) => !b.archivedAt);
    const usedCodes = new Set(
      (
        await ctx.db
          .query("boxes")
          .withIndex("by_move_updated", (q) => q.eq("moveId", toMoveId))
          .collect()
      )
        .filter((b) => !b.archivedAt)
        .map((b) => b.code),
    );
    for (const b of fromBoxes) {
      let code = b.code;
      let renamedTo: string | null = null;
      if (usedCodes.has(code)) {
        code = `${b.code}-L`;
        renamedTo = code;
      }
      usedCodes.add(code);
      if (!dryRun)
        await ctx.db.patch(b._id, {
          moveId: toMoveId,
          householdId: toHouseholdId,
          code,
          destinationSpaceId: undefined,
          currentSpaceId: undefined,
          assignedResourceId: undefined,
          assignedZoneId: undefined,
          assignedTripId: undefined,
          assignedTripSpaceId: undefined,
          assignmentLocked: undefined,
          assignmentValidatedAt: undefined,
          updatedAt: now,
        });
      plan.boxesMoved.push({ code: b.code, renamedTo });
    }

    // boxItems -> follow to toMove; re-point itemId to survivor if merged; drop
    // if the surviving item already has a boxItem in the same box (avoid dup).
    const fromBoxItems = await ctx.db
      .query("boxItems")
      .withIndex("by_move", (q) => q.eq("moveId", fromMoveId))
      .collect();
    for (const bi of fromBoxItems) {
      const survivorItemId = mergedItemMap.get(bi.itemId) ?? bi.itemId;
      if (!dryRun)
        await ctx.db.patch(bi._id, {
          moveId: toMoveId,
          householdId: toHouseholdId,
          itemId: survivorItemId,
          updatedAt: now,
        });
      plan.boxItemsRepointed++;
    }

    return plan;
  },
});
