import { defaultPhotoUploadCleanupGraceMs } from "./photoCleanup";
import { bumpOwnerRevision, closeUploadReservation } from "../usageLimits";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Parent records may disappear; ownership and object refs must survive them. */
export async function retainPhotoForDeletion(ctx: MutationCtx, photo: Doc<"itemPhotos">, now = Date.now()) {
  const ownerId = photo.usageOwnerId ?? (await ctx.db.get(photo.householdId))?.ownerUserId ?? photo.uploadedByUserId;
  if (!ownerId) throw new Error("Cannot remove media without retaining its owner.");
  await bumpOwnerRevision(ctx, ownerId);
  await ctx.scheduler.runAfter(0, internal.storageDeletion.runPhotoDeletion, { photoId: photo._id });
  await ctx.db.patch(photo._id, { usageOwnerId: ownerId, pendingStorageDeletion: true, itemId: undefined, boxId: undefined, archivedAt: now, updatedAt: now });
}
export async function retainSessionForDeletion(ctx: MutationCtx, session: Doc<"photoUploadSessions">) {
  const ownerId = session.usageOwnerId ?? (await ctx.db.get(session.householdId))?.ownerUserId ?? session.createdByUserId;
  if (!ownerId) throw new Error("Cannot remove a session without retaining its owner.");
  await closeUploadReservation(ctx, session);
  await bumpOwnerRevision(ctx, ownerId);
  await ctx.scheduler.runAt(Math.max(Date.now(), session.expiresAt + defaultPhotoUploadCleanupGraceMs), internal.storageDeletion.runSessionDeletion, { sessionId: session._id });
  await ctx.db.patch(session._id, { usageOwnerId: ownerId, status: session.completedPhotoId ? session.status : "cancelled", updatedAt: Date.now() });
}
