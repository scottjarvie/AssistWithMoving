import { defaultPhotoUploadCleanupGraceMs, photoStorageRefs, uploadSessionStorageRefs } from "./photoCleanup";
import { internal } from "../_generated/api";
import { bumpOwnerRevision, closeUploadReservation } from "../usageLimits";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Erase the user row as main did; only storage cleanup state survives. */
export async function retainPhotoForDeletion(ctx: MutationCtx, photo: Doc<"itemPhotos">, now = Date.now(), batch?: { ownerId: Id<"users">; leaseSaved: boolean; noGeneratedObjects?: boolean }) {
  const ownerId = photo.usageOwnerId ?? batch?.ownerId ?? (await ctx.db.get(photo.householdId))?.ownerUserId ?? photo.uploadedByUserId;
  if (!ownerId) throw new Error("Storage owner unavailable.");
  let notBefore = photo.storageWriteUntil ?? 0;
  if (!batch?.leaseSaved) for (const session of await ctx.db.query("photoUploadSessions").withIndex("by_original_key", q => q.eq("originalStorageKey", photo.originalStorageKey)).collect()) if (session.completedPhotoId === photo._id) notBefore = Math.max(notBefore, session.expiresAt + (session.objectClaimsRegistered ? 0 : defaultPhotoUploadCleanupGraceMs));
  const generated = batch?.noGeneratedObjects ? [] : await ctx.db.query("generatedObjects").withIndex("by_photo", q => q.eq("photoId", photo._id)).collect();
  if (generated.some(row => row.state === "pending")) notBefore = Math.max(notBefore, now + 15 * 60 * 1000);
  const refs = [...photoStorageRefs(photo), ...generated.map(row => ({ bucket: row.bucket, storageKey: row.storageKey }))].filter((ref, i, all) => all.findIndex(other => other.bucket === ref.bucket && other.storageKey === ref.storageKey) === i);
  await ctx.db.insert("storageDeletionJobs", { photoId: photo._id, ownerId, bytes: photo.storedBytes ?? photo.sizeBytes + Object.values(photo.derivativeSizes ?? {}).reduce((sum, n) => sum + (n ?? 0), 0), originalStorageKey: photo.originalStorageKey, derivativeRefs: photo.derivativeRefs, refs: refs.map(ref => ({ ...ref, deleted: false })), notBefore, status: "pending", updatedAt: now });
  await ctx.db.delete(photo._id);
  if (!batch) await bumpOwnerRevision(ctx, ownerId);
}
async function eraseSession(ctx: MutationCtx, session: Doc<"photoUploadSessions">) {
  const ownerId = session.usageOwnerId ?? (await ctx.db.get(session.householdId))?.ownerUserId ?? session.createdByUserId;
  if (!ownerId) throw new Error("Storage owner unavailable.");
  if (session.completedPhotoId) {
    const until = session.expiresAt + (session.objectClaimsRegistered ? 0 : defaultPhotoUploadCleanupGraceMs);
    const photo = await ctx.db.get(session.completedPhotoId);
    if (photo) await ctx.db.patch(photo._id, { storageWriteUntil: Math.max(photo.storageWriteUntil ?? 0, until) });
    else {
      const job = await ctx.db.query("storageDeletionJobs").withIndex("by_photo", q => q.eq("photoId", session.completedPhotoId!)).unique();
      if (job) await ctx.db.patch(job._id, { notBefore: Math.max(job.notBefore ?? 0, until) });
    }
  } else if (!session.cleanupCompletedAt) {
    await closeUploadReservation(ctx, session, false);
    const closed = (await ctx.db.get(session._id))!;
    const derivativeRefs = Object.fromEntries((session.derivativeUploads ?? []).map(ref => [ref.variant, ref.storageKey]));
    await ctx.db.insert("sessionDeletionJobs", { sessionId: session._id, originalStorageKey: session.originalStorageKey, ownerId, derivativeRefs, refs: uploadSessionStorageRefs(session).map(ref => ({ ...ref, deleted: false })), bytes: closed.quarantinedBytes ?? 0, notBefore: session.expiresAt + defaultPhotoUploadCleanupGraceMs, erased: true, status: "pending", updatedAt: Date.now() });
  }
  if (session.usageReservationId) await ctx.db.delete(session.usageReservationId);
  for (const claim of await ctx.db.query("uploadObjectClaims").withIndex("by_session", q => q.eq("sessionId", session._id)).collect()) await ctx.db.delete(claim._id);
  await ctx.db.delete(session._id);
  await bumpOwnerRevision(ctx, ownerId);
}

/** One existing recount continuation per owner, not per erased session. */
export async function eraseSessions(ctx: MutationCtx, sessions: Doc<"photoUploadSessions">[]) {
  const owners = new Map<Id<"users">, number>();
  for (const session of sessions) {
    const ownerId = session.usageOwnerId ?? (await ctx.db.get(session.householdId))?.ownerUserId ?? session.createdByUserId;
    await eraseSession(ctx, { ...session, usageOwnerId: ownerId });
    if (!session.completedPhotoId && !session.cleanupCompletedAt) owners.set(ownerId, Math.max(owners.get(ownerId) ?? 0, session.expiresAt));
  }
  for (const [ownerId, at] of owners) await ctx.scheduler.runAt(Math.max(Date.now(), at), internal.usageLimitsStorage.recomputeStep, { ownerId });
}
