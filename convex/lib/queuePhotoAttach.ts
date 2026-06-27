// When a capture-queue entry is resolved (status -> processed), the photos that
// were uploaded for that capture should automatically become the photos of the
// thing the capture produced. Historically nothing did this: an agent (or the
// web reviewer) created an item and reported it via resultItemIds, but the
// entry's mediaPhotoIds stayed orphaned at move level — invisible on the item.
// This helper closes that loop so "the photo stays with the thing it documents"
// is the default, not something the agent has to remember.
//
// It is intentionally conservative:
//  - It only adopts photos that are NOT already filed onto inventory (no itemId
//    and no boxId), so an explicit attach_photos call the agent already made is
//    never clobbered.
//  - It picks the most specific destination the capture aimed at: a single
//    created item wins; otherwise the box / room / transport the entry targeted.
//    With multiple result items and no single target it can't safely choose, so
//    it leaves those for an explicit attach_photos call.

import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type AttachTarget =
  | { itemId: Id<"items"> }
  | { boxId: Id<"boxes"> }
  | { spaceId: Id<"moveSpaces"> }
  | { transportResourceId: Id<"transportResources"> };

async function resolveTarget(
  ctx: MutationCtx,
  entry: Doc<"ingestionQueueEntries">,
  resultItemIds: Id<"items">[] | undefined,
): Promise<AttachTarget | null> {
  // A single created item is the strongest signal that the capture documents it.
  if (resultItemIds && resultItemIds.length === 1) {
    const item = await ctx.db.get(resultItemIds[0]);
    if (item && item.moveId === entry.moveId && !item.deletedAt) {
      return { itemId: resultItemIds[0] };
    }
    return null;
  }
  // Multiple items -> ambiguous which photo belongs to which; leave to the agent.
  if (resultItemIds && resultItemIds.length > 1) return null;

  if (entry.targetBoxId) {
    const box = await ctx.db.get(entry.targetBoxId);
    if (box && box.moveId === entry.moveId && !box.archivedAt) {
      return { boxId: entry.targetBoxId };
    }
  }
  if (entry.targetSpaceId) {
    const space = await ctx.db.get(entry.targetSpaceId);
    if (space && space.moveId === entry.moveId && space.status !== "archived") {
      return { spaceId: entry.targetSpaceId };
    }
  }
  if (entry.targetTransportId) {
    const resource = await ctx.db.get(entry.targetTransportId);
    if (resource && resource.moveId === entry.moveId && !resource.archivedAt) {
      return { transportResourceId: entry.targetTransportId };
    }
  }
  return null;
}

/**
 * File a resolved queue entry's uploaded photos onto the inventory it produced.
 * Returns the number of photos newly attached. Safe to call on every processed
 * submission — it no-ops when there are no photos, no usable target, or the
 * photos are already attached.
 */
export async function autoAttachEntryPhotos(
  ctx: MutationCtx,
  entry: Doc<"ingestionQueueEntries">,
  resultItemIds: Id<"items">[] | undefined,
  now: number,
): Promise<number> {
  const photoIds = entry.mediaPhotoIds ?? [];
  if (photoIds.length === 0) return 0;

  const target = await resolveTarget(ctx, entry, resultItemIds);
  if (!target) return 0;

  let attached = 0;
  for (const photoId of photoIds) {
    const photo = await ctx.db.get(photoId);
    if (
      !photo ||
      photo.householdId !== entry.householdId ||
      photo.moveId !== entry.moveId ||
      photo.archivedAt
    ) {
      continue;
    }
    // Don't move a photo already filed onto inventory (an agent may have placed
    // it deliberately) — only adopt still-unattached captures.
    if (photo.itemId || photo.boxId) continue;
    await ctx.db.patch(photoId, { ...target, updatedAt: now });
    attached += 1;
  }
  return attached;
}
