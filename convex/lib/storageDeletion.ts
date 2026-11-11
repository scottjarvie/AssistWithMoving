import { defaultPhotoUploadCleanupGraceMs } from "./photoCleanup";
import { bumpOwnerRevision, closeUploadReservation } from "../usageLimits";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Parent records may disappear; ownership and object refs must survive them. */
export async function retainPhotoForDeletion(ctx: MutationCtx, photo: Doc<"itemPhotos">, now = Date.now(), schedule = true) {
  const ownerId = photo.usageOwnerId ?? (await ctx.db.get(photo.householdId))?.ownerUserId ?? photo.uploadedByUserId;
  if (!ownerId) throw new Error("Cannot remove media without retaining its owner.");
  await bumpOwnerRevision(ctx, ownerId);
  if (schedule) await ctx.scheduler.runAfter(0, internal.storageDeletion.runPhotoDeletion, { photoId: photo._id });
  let storageWriteUntil = photo.storageWriteUntil ?? 0;
  for (const session of await ctx.db.query("photoUploadSessions").withIndex("by_original_key", q => q.eq("originalStorageKey", photo.originalStorageKey)).collect()) if (session.completedPhotoId === photo._id) storageWriteUntil = Math.max(storageWriteUntil, session.expiresAt + (session.objectClaimsRegistered ? 0 : defaultPhotoUploadCleanupGraceMs));
  await ctx.db.replace(photo._id, { usageOwnerId: ownerId, pendingStorageDeletion: true, erasurePending: true, storageWriteUntil,
    householdId: photo.householdId, moveId: photo.moveId, originalStorageKey: photo.originalStorageKey, originalBucket: photo.originalBucket,
    derivativeRefs: photo.derivativeRefs, derivativeSizes: photo.derivativeSizes, storedBytes: photo.storedBytes, sizeBytes: photo.sizeBytes,
    documentationProfileTypes: [], mimeType: "application/octet-stream", photoType: "other", privacyLevel: "normal", visibilityScope: "moveCollaborators", source: "manualUpload", exifHandlingStatus: "pending", confidence: "none", verificationStatus: "unreviewed", aiProcessed: false,
    uploadedByUserId: ownerId, createdAt: 0, archivedAt: now, updatedAt: now });
}
export async function retainSessionForDeletion(ctx: MutationCtx, session: Doc<"photoUploadSessions">) {
  const ownerId = session.usageOwnerId ?? (await ctx.db.get(session.householdId))?.ownerUserId ?? session.createdByUserId;
  if (!ownerId) throw new Error("Cannot remove a session without retaining its owner.");
  if (session.completedPhotoId || session.cleanupCompletedAt) {
    for (const claim of await ctx.db.query("uploadObjectClaims").withIndex("by_session", q => q.eq("sessionId", session._id)).collect()) await ctx.db.delete(claim._id);
    for (const job of await ctx.db.query("sessionDeletionJobs").withIndex("by_session", q => q.eq("sessionId", session._id)).collect()) await ctx.db.delete(job._id);
    if (session.usageReservationId) await ctx.db.delete(session.usageReservationId);
    await ctx.db.delete(session._id); return;
  }
  await closeUploadReservation(ctx, session);
  await bumpOwnerRevision(ctx, ownerId);
  await ctx.scheduler.runAt(Math.max(Date.now(), session.expiresAt + defaultPhotoUploadCleanupGraceMs), internal.storageDeletion.runSessionDeletion, { sessionId: session._id });
  const closed = await ctx.db.get(session._id);
  if (session.usageReservationId) await ctx.db.patch(session.usageReservationId, { key: String(session.usageReservationId) });
  await ctx.db.replace(session._id, { usageOwnerId: ownerId, erasurePending: true, householdId: session.householdId, moveId: session.moveId,
    originalStorageKey: session.originalStorageKey, originalBucket: session.originalBucket, expectedMimeType: "application/octet-stream", expectedSizeBytes: session.expectedSizeBytes,
    derivativeUploads: session.derivativeUploads, usageReservationId: session.usageReservationId, quarantinedBytes: closed?.quarantinedBytes,
    status: "cancelled", expiresAt: session.expiresAt, createdByUserId: ownerId, createdAt: 0, updatedAt: Date.now() });
}
