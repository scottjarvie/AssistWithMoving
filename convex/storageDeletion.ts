import { DeleteObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { defaultPhotoUploadCleanupGraceMs, photoStorageRefs, uploadSessionStorageRefs } from "./lib/photoCleanup";
import { bumpOwnerRevision, removeStoredBytes, releaseUpload, closeUploadReservation } from "./usageLimits";

export async function referencedObject(ctx: Pick<QueryCtx, "db">, storageKey: string, except?: Id<"itemPhotos">, exceptSession?: Id<"photoUploadSessions">) {
  for (const index of ["by_original_key", "by_thumb_key", "by_card_key", "by_detail_key", "by_full_key"] as const) {
    const field = { by_original_key: "originalStorageKey", by_thumb_key: "derivativeRefs.thumb", by_card_key: "derivativeRefs.card", by_detail_key: "derivativeRefs.detail", by_full_key: "derivativeRefs.full" }[index] as "originalStorageKey" | "derivativeRefs.thumb" | "derivativeRefs.card" | "derivativeRefs.detail" | "derivativeRefs.full";
    const row = await ctx.db.query("itemPhotos").withIndex(index, q => q.eq(field, storageKey)).filter(q => q.neq(q.field("_id"), except)).first();
    if (row) return true;
  }
  const generated = await ctx.db.query("generatedObjects").withIndex("by_key", q => q.eq("storageKey", storageKey)).first();
  if (generated && (generated.photoId !== except || generated.state === "pending")) return true;
  for await (const claim of ctx.db.query("uploadObjectClaims").withIndex("by_key", q => q.eq("storageKey", storageKey))) {
    const session = await ctx.db.get(claim.sessionId);
    if (session && session.status === "authorized" && !session.completedPhotoId && (session._id !== exceptSession || session.expiresAt > Date.now())) return true;
  }
  // Include legacy pending derivative slots too. A read-budget failure blocks
  // deletion rather than assuming the unvisited references are absent.
  for await (const session of ctx.db.query("photoUploadSessions").withIndex("by_status_claims_expires", q => q.eq("status", "authorized").eq("objectClaimsRegistered", undefined))) {
    if (session._id === exceptSession && session.expiresAt <= Date.now() && !session.completedPhotoId) continue;
    if (!session.completedPhotoId && uploadSessionStorageRefs(session).some(ref => ref.storageKey === storageKey)) return true;
  }
  return false;
}
/** Registration checks terminal retained uploads too. A cleanup claim cannot
 * acquire a new dependent while an external version deletion is in progress. */
export async function claimedUploadObject(ctx: Pick<QueryCtx, "db">, key: string, exceptSession?: Id<"photoUploadSessions">) {
  if (await referencedObject(ctx, key, undefined, exceptSession)) return true;
  for await (const claim of ctx.db.query("uploadObjectClaims").withIndex("by_key", q => q.eq("storageKey", key))) if (claim.sessionId !== exceptSession) return true;
  for await (const session of ctx.db.query("photoUploadSessions").withIndex("by_original_key", q => q.eq("originalStorageKey", key))) if (session._id !== exceptSession && !session.cleanupCompletedAt) return true;
  for (const status of ["authorized", "cancelled", "failed"] as const) for await (const session of ctx.db.query("photoUploadSessions").withIndex("by_status_claims_expires", q => q.eq("status", status).eq("objectClaimsRegistered", undefined))) if (session._id !== exceptSession && !session.cleanupCompletedAt && uploadSessionStorageRefs(session).some(ref => ref.storageKey === key)) return true;
  return false;
}
export const plan = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("itemPhotos").withIndex("by_pending_deletion", q => q.eq("pendingStorageDeletion", true)).paginate({ cursor: args.cursor, numItems: 30, maximumBytesRead: 350_000 });
    return { ids: page.page.map(p => p._id), cursor: page.continueCursor, isDone: page.isDone, dryRun: true };
  },
});
async function photoWriteLeaseEnd(ctx: Pick<QueryCtx, "db">, photoId: Id<"itemPhotos">, key: string) {
  let until = 0;
  for await (const session of ctx.db.query("photoUploadSessions").withIndex("by_original_key", q => q.eq("originalStorageKey", key))) if (session.completedPhotoId === photoId) until = Math.max(until, session.expiresAt + (session.objectClaimsRegistered ? 0 : defaultPhotoUploadCleanupGraceMs));
  return until;
}
export const prepare = internalMutation({
  args: { photoId: v.id("itemPhotos") },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo?.pendingStorageDeletion) return null;
    const writeLease = Math.max(photo.storageWriteUntil ?? 0, await photoWriteLeaseEnd(ctx, photo._id, photo.originalStorageKey));
    if (writeLease > Date.now()) { await ctx.scheduler.runAt(writeLease, internal.storageDeletion.runPhotoDeletion, { photoId: photo._id }); return null; }
    const previous = await ctx.db.query("storageDeletionJobs").withIndex("by_photo", q => q.eq("photoId", photo._id)).unique();
    if (previous) return previous;
    const ownerId = photo.usageOwnerId ?? (await ctx.db.get(photo.householdId))?.ownerUserId ?? photo.uploadedByUserId;
    if (!ownerId) throw new Error("Storage owner unavailable; deletion is blocked.");
    const generated = await ctx.db.query("generatedObjects").withIndex("by_photo", q => q.eq("photoId", photo._id)).collect();
    const refs = [...photoStorageRefs(photo), ...generated.map(g => ({ bucket: g.bucket, storageKey: g.storageKey }))].filter((ref, i, all) => all.findIndex(other => other.bucket === ref.bucket && other.storageKey === ref.storageKey) === i);
    await removeStoredBytes(ctx, ownerId, 0);
    const id = await ctx.db.insert("storageDeletionJobs", { photoId: photo._id, ownerId, bytes: photo.storedBytes ?? 0, refs: refs.map(ref => ({ ...ref, deleted: false })), status: "pending", updatedAt: Date.now() });
    return ctx.db.get(id);
  },
});
export const mayDelete = internalQuery({ args: { storageKey: v.string(), photoId: v.id("itemPhotos") }, handler: async (ctx, args) => !await referencedObject(ctx, args.storageKey, args.photoId) });
export const recordVersion = internalMutation({
  args: { jobId: v.id("storageDeletionJobs"), index: v.number(), versionId: v.optional(v.string()), bytes: v.number(), deleted: v.boolean() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === "done") return;
    const refs = [...job.refs];
    refs[args.index] = { ...refs[args.index], versionId: args.versionId ?? refs[args.index].versionId, bytes: args.bytes, deleted: args.deleted };
    await ctx.db.patch(job._id, { refs, updatedAt: Date.now() });
  },
});
export const finish = internalMutation({
  args: { jobId: v.id("storageDeletionJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === "done" || job.refs.some(ref => !ref.deleted)) return false;
    const photo = await ctx.db.get(job.photoId);
    if (!photo?.pendingStorageDeletion) return false;
    for (const ref of job.refs) if (await referencedObject(ctx, ref.storageKey, photo._id)) return false;
    await removeStoredBytes(ctx, job.ownerId, job.refs.reduce((sum, ref) => sum + (ref.bytes ?? 0), 0));
    for (const generated of await ctx.db.query("generatedObjects").withIndex("by_photo", q => q.eq("photoId", photo._id)).collect()) await ctx.db.delete(generated._id);
    await ctx.db.delete(photo._id);
    if (photo.erasurePending) await ctx.db.delete(job._id);
    else await ctx.db.patch(job._id, { status: "done", updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.usageLimitsStorage.recomputeStep, { ownerId: job.ownerId });
    return true;
  },
});
function client() {
  const endpoint = process.env.B2_ENDPOINT, accessKeyId = process.env.B2_APPLICATION_KEY_ID, secretAccessKey = process.env.B2_APPLICATION_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error("Storage configuration unavailable.");
  return new S3Client({ endpoint, region: process.env.B2_REGION ?? "us-west-004", forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
}
function missing(error: unknown) { return ["NotFound", "NoSuchKey", "NoSuchVersion"].includes((error as { name?: string }).name ?? ""); }
export const deletePhoto = internalAction({
  args: { photoId: v.id("itemPhotos"), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ deleted: boolean; blocked: boolean; dryRun: boolean; objects?: Array<{ bucket: string; storageKey: string; referenced: boolean }> }> => {
    if (args.dryRun !== false) return { deleted: false, blocked: false, dryRun: true, objects: await ctx.runQuery(internal.storageDeletion.previewPhoto, { photoId: args.photoId }) };
    const job = await ctx.runMutation(internal.storageDeletion.prepare, { photoId: args.photoId });
    if (!job || job.status === "done") return { deleted: false, blocked: false, dryRun: false };
    const storage = client();
    for (const [index, ref] of job.refs.entries()) {
      if (ref.deleted) continue;
      if (!await ctx.runQuery(internal.storageDeletion.mayDelete, { storageKey: ref.storageKey, photoId: job.photoId })) return { deleted: false, blocked: true, dryRun: false };
      let versionId = ref.versionId, bytes = ref.bytes ?? 0;
      try {
        const head = await storage.send(new HeadObjectCommand({ Bucket: ref.bucket, Key: ref.storageKey, VersionId: versionId }));
        versionId = head.VersionId;
        bytes = head.ContentLength ?? bytes;
        // A version-exact delete is necessary on versioned storage. Without an
        // identifier we cannot prove physical deletion, so retain the charge.
        if (!versionId) return { deleted: false, blocked: true, dryRun: false };
        await ctx.runMutation(internal.storageDeletion.recordVersion, { jobId: job._id, index, versionId, bytes, deleted: false });
        if (!await ctx.runQuery(internal.storageDeletion.mayDelete, { storageKey: ref.storageKey, photoId: job.photoId })) return { deleted: false, blocked: true, dryRun: false };
        await storage.send(new DeleteObjectCommand({ Bucket: ref.bucket, Key: ref.storageKey, VersionId: versionId }));
        try { await storage.send(new HeadObjectCommand({ Bucket: ref.bucket, Key: ref.storageKey, VersionId: versionId })); return { deleted: false, blocked: true, dryRun: false }; }
        catch (error) { if (!missing(error)) throw error; }
      } catch (error) { if (!missing(error)) throw error; }
      // Deleting a version can expose an older version at the same key. Keep
      // the tombstone and charge if any current object remains; never delete an
      // unknown historical version merely to make the counter smaller.
      try { await storage.send(new HeadObjectCommand({ Bucket: ref.bucket, Key: ref.storageKey })); return { deleted: false, blocked: true, dryRun: false }; }
      catch (error) { if (!missing(error)) throw error; }
      await ctx.runMutation(internal.storageDeletion.recordVersion, { jobId: job._id, index, versionId, bytes, deleted: true });
    }
    return { deleted: await ctx.runMutation(internal.storageDeletion.finish, { jobId: job._id }), blocked: false, dryRun: false };
  },
});

export const pendingGenerated = internalQuery({ args: { cursor: v.union(v.string(), v.null()), before: v.number() }, handler: async (ctx, args) => ctx.db.query("generatedObjects").withIndex("by_state_created", q => q.eq("state", "pending").lt("createdAt", args.before)).paginate({ cursor: args.cursor, numItems: 30 }) });
export const recoveredGenerated = internalMutation({ args: { id: v.id("generatedObjects"), exists: v.boolean() }, handler: async (ctx, args) => {
  const object = await ctx.db.get(args.id);
  if (!object || object.state !== "pending") return;
  // A failed generation keeps its charge and reference until this metadata
  // probe confirms absence, or the photo deletion worker removes its version.
  if (!args.exists && object.bytes > 0) {
    await removeStoredBytes(ctx, object.ownerId, object.bytes);
    const photo = await ctx.db.get(object.photoId);
    if (photo) await ctx.db.patch(photo._id, { storedBytes: Math.max(0, (photo.storedBytes ?? photo.sizeBytes) - object.bytes) });
  }
  await ctx.db.patch(object._id, { state: args.exists ? "active" : "failed", ...(!args.exists ? { bytes: 0 } : {}) });
  await bumpOwnerRevision(ctx, object.ownerId);
} });
export const recoverGenerated = internalAction({ args: { cursor: v.optional(v.union(v.string(), v.null())), before: v.optional(v.number()) }, handler: async (ctx, args): Promise<void> => {
  const before = args.before ?? Date.now() - 15 * 60 * 1000;
  const page = await ctx.runQuery(internal.storageDeletion.pendingGenerated, { cursor: args.cursor ?? null, before });
  const storage = client();
  for (const object of page.page) {
    try { await storage.send(new HeadObjectCommand({ Bucket: object.bucket, Key: object.storageKey })); await ctx.runMutation(internal.storageDeletion.recoveredGenerated, { id: object._id, exists: true }); }
    catch (error) { if (missing(error)) await ctx.runMutation(internal.storageDeletion.recoveredGenerated, { id: object._id, exists: false }); }
  }
  if (!page.isDone) await ctx.scheduler.runAfter(0, internal.storageDeletion.recoverGenerated, { cursor: page.continueCursor, before });
} });

/** Settle declared bytes after the presign expires. This never deletes an
 * object, including a recording still waiting for the composer to attach it. */
export const sessionForSettlement = internalQuery({ args: { sessionId: v.id("photoUploadSessions") }, handler: (ctx, args) => ctx.db.get(args.sessionId) });
export const applySessionSettlement = internalMutation({ args: { sessionId: v.id("photoUploadSessions"), expiresAt: v.number(), refs: v.string(), bytes: v.number() }, handler: async (ctx, args) => {
  const session = await ctx.db.get(args.sessionId);
  if (!session || session.completedPhotoId || session.cleanupCompletedAt || session.quarantinedBytes === undefined || session.expiresAt !== args.expiresAt || session.expiresAt > Date.now() || JSON.stringify(uploadSessionStorageRefs(session)) !== args.refs || (session.processingUntil ?? 0) > Date.now()) return false;
  const hold = session.usageReservationId ? await ctx.db.get(session.usageReservationId) : null;
  if (hold?.status === "reserved") return false;
  const ownerId = session.usageOwnerId ?? (await ctx.db.get(session.householdId))?.ownerUserId ?? session.createdByUserId;
  // An unexpectedly larger object remains fully charged for operator review.
  const difference = session.quarantinedBytes - args.bytes;
  if (difference >= 0) await removeStoredBytes(ctx, ownerId, difference);
  else { const row = await ctx.db.query("usageCounters").withIndex("by_owner", q => q.eq("ownerId", ownerId)).unique(); if (!row) return false; await ctx.db.patch(row._id, { storedBytes: row.storedBytes - difference, revision: row.revision + 1, updatedAt: Date.now() }); await bumpOwnerRevision(ctx, ownerId); }
  const counter = await ctx.db.query("usageCounters").withIndex("by_owner", q => q.eq("ownerId", ownerId)).unique();
  if (counter && hold?.day === counter.dayKey) await ctx.db.patch(counter._id, { dayUploadBytes: Math.max(0, counter.dayUploadBytes - difference) });
  await ctx.db.patch(session._id, { quarantinedBytes: args.bytes }); return true;
} });
export const settleSession = internalAction({ args: { sessionId: v.id("photoUploadSessions") }, handler: async (ctx, args): Promise<{ settled: boolean; unknown: number }> => {
  const session = await ctx.runQuery(internal.storageDeletion.sessionForSettlement, args);
  if (!session || session.completedPhotoId || session.cleanupCompletedAt || session.quarantinedBytes === undefined) return { settled: false, unknown: 0 };
  const safeAt = session.expiresAt + (session.objectClaimsRegistered ? 0 : defaultPhotoUploadCleanupGraceMs);
  if (safeAt > Date.now() || (session.processingUntil ?? 0) > Date.now()) { await ctx.scheduler.runAt(Math.max(safeAt, session.processingUntil ?? 0), internal.storageDeletion.settleSession, args); return { settled: false, unknown: 0 }; }
  const storage = client(); let bytes = 0, unknown = 0;
  for (const ref of uploadSessionStorageRefs(session)) try { const head = await storage.send(new HeadObjectCommand({ Bucket: ref.bucket, Key: ref.storageKey })); if (head.ContentLength === undefined) unknown++; else bytes += head.ContentLength; } catch (error) { if (!missing(error)) unknown++; }
  if (unknown) { await ctx.scheduler.runAfter(5 * 60 * 1000, internal.storageDeletion.settleSession, args); return { settled: false, unknown }; }
  return { settled: await ctx.runMutation(internal.storageDeletion.applySessionSettlement, { ...args, expiresAt: session.expiresAt, refs: JSON.stringify(uploadSessionStorageRefs(session)), bytes }), unknown: 0 };
} });

export const prepareSession = internalMutation({ args: { sessionId: v.id("photoUploadSessions") }, handler: async (ctx, args) => {
  const session = await ctx.db.get(args.sessionId);
  if (!session || session.completedPhotoId || session.status === "completed" || session.expiresAt > Date.now() || (session.processingUntil ?? 0) > Date.now() || session.cleanupCompletedAt) return null;
  if (session.expiresAt + defaultPhotoUploadCleanupGraceMs > Date.now()) return null;
  const previous = await ctx.db.query("sessionDeletionJobs").withIndex("by_session", q => q.eq("sessionId", session._id)).order("desc").first();
  if (previous?.originalStorageKey === session.originalStorageKey) return previous;
  const ownerId = session.usageOwnerId ?? (await ctx.db.get(session.householdId))?.ownerUserId ?? session.createdByUserId;
  const refs = [];
  for (const ref of uploadSessionStorageRefs(session)) {
    if (await referencedObject(ctx, ref.storageKey, undefined, session._id)) return null;
    refs.push({ ...ref, deleted: false });
  }
  // The terminal claim and its reference proof are one transaction. Reopen
  // refuses its pending job, and new registrations refuse its object claims.
  await closeUploadReservation(ctx, session);
  await ctx.db.patch(session._id, { status: "failed", updatedAt: Date.now() });
  const id = await ctx.db.insert("sessionDeletionJobs", { sessionId: session._id, originalStorageKey: session.originalStorageKey, ownerId, refs, status: "pending", updatedAt: Date.now() });
  return ctx.db.get(id);
} });
export const sessionMayDelete = internalQuery({ args: { key: v.string() }, handler: async (ctx, args) => !await referencedObject(ctx, args.key) });
export const recordSessionVersion = internalMutation({ args: { jobId: v.id("sessionDeletionJobs"), index: v.number(), bytes: v.number(), versionId: v.optional(v.string()), deleted: v.boolean() }, handler: async (ctx, args) => {
  const job = await ctx.db.get(args.jobId);
  if (!job || job.status === "done") return;
  const refs = [...job.refs]; refs[args.index] = { ...refs[args.index], versionId: args.versionId ?? refs[args.index].versionId, bytes: args.bytes, deleted: args.deleted };
  await ctx.db.patch(job._id, { refs, updatedAt: Date.now() });
} });
export const finishSession = internalMutation({ args: { jobId: v.id("sessionDeletionJobs") }, handler: async (ctx, args) => {
  const job = await ctx.db.get(args.jobId);
  if (!job || job.status === "done" || job.refs.some(ref => !ref.deleted)) return false;
  const session = await ctx.db.get(job.sessionId);
  if (!session || session.completedPhotoId || session.status === "completed") return false;
  for (const ref of job.refs) if (await referencedObject(ctx, ref.storageKey)) return false;
  if (session.quarantinedBytes) await removeStoredBytes(ctx, job.ownerId, session.quarantinedBytes);
  else if (session.usageReservationId) await releaseUpload(ctx, session.usageReservationId);
  else await removeStoredBytes(ctx, job.ownerId, job.refs.reduce((sum, ref) => sum + (ref.bytes ?? 0), 0));
  await ctx.db.patch(session._id, { cleanupCompletedAt: Date.now(), quarantinedBytes: undefined, status: "failed" });
  for (const claim of await ctx.db.query("uploadObjectClaims").withIndex("by_session", q => q.eq("sessionId", session._id)).collect()) await ctx.db.delete(claim._id);
  if (session.erasurePending) {
    if (session.usageReservationId) await ctx.db.delete(session.usageReservationId);
    await ctx.db.delete(session._id); await ctx.db.delete(job._id);
  } else await ctx.db.patch(job._id, { status: "done", updatedAt: Date.now() });
  return true;
} });
export const deleteSession = internalAction({ args: { sessionId: v.id("photoUploadSessions"), dryRun: v.optional(v.boolean()) }, handler: async (ctx, args): Promise<{ deleted: boolean; dryRun: boolean; objects?: Array<{ bucket: string; storageKey: string; referenced: boolean }> }> => {
  if (args.dryRun !== false) return { deleted: false, dryRun: true, objects: await ctx.runQuery(internal.storageDeletion.previewSession, { sessionId: args.sessionId }) };
  const job = await ctx.runMutation(internal.storageDeletion.prepareSession, { sessionId: args.sessionId });
  if (!job || job.status === "done") return { deleted: false, dryRun: false };
  const storage = client();
  for (const [index, ref] of job.refs.entries()) {
    if (ref.deleted) continue;
    if (!await ctx.runQuery(internal.storageDeletion.sessionMayDelete, { key: ref.storageKey })) return { deleted: false, dryRun: false };
    let versionId = ref.versionId, bytes = ref.bytes ?? 0;
    try {
      const head = await storage.send(new HeadObjectCommand({ Bucket: ref.bucket, Key: ref.storageKey, VersionId: versionId }));
      versionId = head.VersionId; bytes = head.ContentLength ?? bytes;
      if (!versionId) return { deleted: false, dryRun: false };
      await ctx.runMutation(internal.storageDeletion.recordSessionVersion, { jobId: job._id, index, bytes, versionId, deleted: false });
      if (!await ctx.runQuery(internal.storageDeletion.sessionMayDelete, { key: ref.storageKey })) return { deleted: false, dryRun: false };
      await storage.send(new DeleteObjectCommand({ Bucket: ref.bucket, Key: ref.storageKey, VersionId: versionId }));
      try { await storage.send(new HeadObjectCommand({ Bucket: ref.bucket, Key: ref.storageKey, VersionId: versionId })); return { deleted: false, dryRun: false }; }
      catch (error) { if (!missing(error)) throw error; }
    } catch (error) { if (!missing(error)) throw error; }
    try { await storage.send(new HeadObjectCommand({ Bucket: ref.bucket, Key: ref.storageKey })); return { deleted: false, dryRun: false }; }
    catch (error) { if (!missing(error)) throw error; }
    await ctx.runMutation(internal.storageDeletion.recordSessionVersion, { jobId: job._id, index, bytes, versionId, deleted: true });
  }
  return { deleted: await ctx.runMutation(internal.storageDeletion.finishSession, { jobId: job._id }), dryRun: false };
} });

export const deletionEnabled = internalQuery({ args: {}, handler: async ctx => Boolean((await ctx.db.query("usageLimitSettings").withIndex("by_key", q => q.eq("key", "site")).unique())?.storageDeletionEnabled) });
export const runPhotoDeletion = internalAction({ args: { photoId: v.id("itemPhotos") }, handler: async (ctx, args): Promise<unknown> => {
  const enabled = await ctx.runQuery(internal.storageDeletion.deletionEnabled, {});
  return ctx.runAction(internal.storageDeletion.deletePhoto, { ...args, dryRun: !enabled });
} });
export const sweep = internalAction({ args: { cursor: v.optional(v.union(v.string(), v.null())) }, handler: async (ctx, args): Promise<void> => {
  const page = await ctx.runQuery(internal.storageDeletion.plan, { cursor: args.cursor ?? null });
  for (const photoId of page.ids) {
    try { await ctx.runAction(internal.storageDeletion.runPhotoDeletion, { photoId }); }
    catch { /* Keep the job and continue to other owners; the next sweep retries. */ }
  }
  if (!page.isDone) await ctx.scheduler.runAfter(0, internal.storageDeletion.sweep, { cursor: page.cursor });
} });
export const sweepSessions = internalAction({ args: { cursor: v.optional(v.union(v.string(), v.null())), before: v.optional(v.number()) }, handler: async (ctx, args): Promise<void> => {
  const page = await ctx.runQuery(internal.photos.claimExpiredCleanup, { cursor: args.cursor ?? null, before: args.before });
  const enabled = await ctx.runQuery(internal.storageDeletion.deletionEnabled, {});
  if (enabled) for (const candidate of page.candidates) {
    try { await ctx.runAction(internal.storageDeletion.deleteSession, { sessionId: candidate.id, dryRun: false }); }
    catch { /* A failed owner cannot starve the rest of the paginated sweep. */ }
  }
  if (!page.isDone) await ctx.scheduler.runAfter(0, internal.storageDeletion.sweepSessions, { cursor: page.cursor, before: page.before });
} });

export const runSessionDeletion = internalAction({ args: { sessionId: v.id("photoUploadSessions") }, handler: async (ctx, args): Promise<unknown> => {
  const enabled = await ctx.runQuery(internal.storageDeletion.deletionEnabled, {});
  return ctx.runAction(internal.storageDeletion.deleteSession, { ...args, dryRun: !enabled });
} });

export const previewPhoto = internalQuery({ args: { photoId: v.id("itemPhotos") }, handler: async (ctx, args) => {
  const photo = await ctx.db.get(args.photoId);
  if (!photo?.pendingStorageDeletion) return [];
  const generated = await ctx.db.query("generatedObjects").withIndex("by_photo", q => q.eq("photoId", photo._id)).collect();
  const refs = [...photoStorageRefs(photo), ...generated.map(g => ({ bucket: g.bucket, storageKey: g.storageKey }))].filter((ref, i, all) => all.findIndex(other => other.bucket === ref.bucket && other.storageKey === ref.storageKey) === i);
  const pendingWrite = await photoWriteLeaseEnd(ctx, photo._id, photo.originalStorageKey) > Date.now();
  return Promise.all(refs.map(async ref => ({ ...ref, referenced: pendingWrite || await referencedObject(ctx, ref.storageKey, photo._id) })));
} });
export const previewSession = internalQuery({ args: { sessionId: v.id("photoUploadSessions") }, handler: async (ctx, args) => {
  const session = await ctx.db.get(args.sessionId);
  if (!session || session.completedPhotoId || session.status === "completed" || session.expiresAt > Date.now() || (session.processingUntil ?? 0) > Date.now() || session.cleanupCompletedAt) return [];
  return Promise.all(uploadSessionStorageRefs(session).map(async ref => ({ ...ref, referenced: await referencedObject(ctx, ref.storageKey, undefined, session._id) })));
} });
