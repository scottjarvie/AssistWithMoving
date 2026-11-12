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
  const jobs = await ctx.db.query("sessionDeletionJobs").withIndex("by_session", q => q.eq("sessionId", session._id)).collect();
  const pending = jobs.filter(job => job.status === "pending");
  if (session.completedPhotoId) {
    const until = session.expiresAt + (session.objectClaimsRegistered ? 0 : defaultPhotoUploadCleanupGraceMs);
    const photo = await ctx.db.get(session.completedPhotoId);
    if (photo) await ctx.db.patch(photo._id, { storageWriteUntil: Math.max(photo.storageWriteUntil ?? 0, until) });
    else {
      const job = await ctx.db.query("storageDeletionJobs").withIndex("by_photo", q => q.eq("photoId", session.completedPhotoId!)).unique();
      if (job) await ctx.db.patch(job._id, { notBefore: Math.max(job.notBefore ?? 0, until) });
    }
  }
  if ((!session.completedPhotoId && !session.cleanupCompletedAt) || pending.length) {
    await closeUploadReservation(ctx, session, false);
    const closed = (await ctx.db.get(session._id))!;
    const candidates: Doc<"sessionDeletionJobs">["refs"] = [...pending.flatMap(job => job.refs), ...(!session.completedPhotoId && !session.cleanupCompletedAt ? uploadSessionStorageRefs(session).map(ref => ({ ...ref, deleted: false })) : [])];
    const refs: typeof candidates = [];
    for (const ref of candidates) {
      // A known version subsumes an unversioned alias; distinct known versions
      // retain their exact receipts and are removed in order by the worker.
      const known = candidates.some(other => other.bucket === ref.bucket && other.storageKey === ref.storageKey && other.versionId);
      if (!ref.versionId && known) continue;
      const prior = refs.find(other => other.bucket === ref.bucket && other.storageKey === ref.storageKey && other.versionId === ref.versionId);
      if (prior) { prior.deleted = prior.deleted && ref.deleted; prior.bytes = Math.max(prior.bytes ?? 0, ref.bytes ?? 0); }
      else refs.push({ ...ref });
    }
    const notBefore = Math.max(session.expiresAt + defaultPhotoUploadCleanupGraceMs, ...pending.map(job => job.notBefore ?? 0));
    const fields = { erased: true as const, refs, notBefore, bytes: closed.quarantinedBytes ?? pending[0]?.bytes ?? 0, status: "pending" as const, updatedAt: Date.now() };
    const primary = pending[0];
    let adoptedId = primary?._id;
    if (primary) {
      await ctx.db.patch(primary._id, fields);
      for (const job of pending.slice(1)) {
        for (const claim of await ctx.db.query("uploadObjectClaims").withIndex("by_deletion_job", q => q.eq("deletionJobId", String(job._id))).collect()) await ctx.db.patch(claim._id, { deletionJobId: String(primary._id) });
        await ctx.db.delete(job._id);
      }
    } else adoptedId = await ctx.db.insert("sessionDeletionJobs", { ...fields, sessionId: session._id, originalStorageKey: session.originalStorageKey, ownerId, derivativeRefs: Object.fromEntries((session.derivativeUploads ?? []).map(ref => [ref.variant, ref.storageKey])) });
    // Index every adopted key, including references absent from the session's
    // current original/derivative slots, so other workers see its write lease.
    for (const ref of refs) {
      const claim = await ctx.db.query("uploadObjectClaims").withIndex("by_deletion_job", q => q.eq("deletionJobId", String(adoptedId))).filter(q => q.eq(q.field("storageKey"), ref.storageKey)).first();
      if (!claim) await ctx.db.insert("uploadObjectClaims", { sessionId: session._id, deletionJobId: String(adoptedId), storageKey: ref.storageKey });
    }
  }
  for (const job of jobs.filter(job => job.status === "done")) {
    for (const claim of await ctx.db.query("uploadObjectClaims").withIndex("by_deletion_job", q => q.eq("deletionJobId", String(job._id))).collect()) await ctx.db.delete(claim._id);
    await ctx.db.delete(job._id);
  }
  if (session.usageReservationId) await ctx.db.delete(session.usageReservationId);
  for (const claim of await ctx.db.query("uploadObjectClaims").withIndex("by_session", q => q.eq("sessionId", session._id)).collect()) if (!claim.deletionJobId) await ctx.db.delete(claim._id);
  await ctx.db.delete(session._id);
}

/** One existing recount continuation per owner, not per erased session. */
export async function eraseSessions(ctx: MutationCtx, sessions: Doc<"photoUploadSessions">[]) {
  const owners = new Map<Id<"users">, number>();
  const changed = new Set<Id<"users">>();
  for (const session of sessions) {
    const ownerId = session.usageOwnerId ?? (await ctx.db.get(session.householdId))?.ownerUserId ?? session.createdByUserId;
    await eraseSession(ctx, { ...session, usageOwnerId: ownerId });
    changed.add(ownerId);
    if (!session.completedPhotoId && !session.cleanupCompletedAt) owners.set(ownerId, Math.max(owners.get(ownerId) ?? 0, session.expiresAt));
  }
  for (const ownerId of changed) await bumpOwnerRevision(ctx, ownerId);
  for (const [ownerId, at] of owners) await ctx.scheduler.runAt(Math.max(Date.now(), at), internal.usageLimitsStorage.recomputeStep, { ownerId });
}
