import { oauthClientIdFromClaims } from "./lib/mcpClientIdentity";
import { readConnection, oauthIdentity } from "./lib/carriedAccess";
import { recordAuditEvent } from "./lib/audit";
import { getCurrentUser } from "./lib/auth";
import { uploadPolicyLine } from "../shared/upload-policy.mjs";
import { defaultPhotoUploadCleanupGraceMs, photoStorageRefs, uploadSessionStorageRefs } from "./lib/photoCleanup";
import { referencedObject } from "./storageDeletion";
import { refusalOf } from "./lib/usageLimits/refusal";
import { requirePersonConnectionManagement } from "./lib/personConnectionManagement";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { appRoleForEmail, requireAppAdmin } from "./lib/admin";
import { billingProfileForHousehold } from "./lib/billing";
import { requireHouseholdPermission } from "./lib/permissions";
import { nullableLimitPatch, enforcementValidator } from "./usageLimitsSchema";
import { nextHourStart, nextDayStart, batchVerdict, ownerReady, ownerEnforcement, aiStorage, applyStoredRemoval, applyCommit, applyRelease, applyReserve, applyStoredAddition, checkCommit, checkUpload, checkFileSize, effectiveFileCap, effectiveLimits, emptyCounters, rollBuckets, storageSummary, storageLine, usageLimitError, validateLimits, validatePlanStoredBytes, validateFileCaps, type Refusal, type UsageCounters, DEFAULT_PLAN_STORED_BYTES } from "./lib/usageLimits/core";

import { siteDefaults } from "./lib/mediaStorage";
type Ctx = QueryCtx | MutationCtx;
export function storagePlan(tier: string, admin: boolean) { return admin || tier !== "free" ? "pro" : "free"; }
export async function ownerFor(ctx: Ctx, householdId: Id<"households">) {
  const household = await ctx.db.get(householdId);
  if (!household) throw new ConvexError("Household not found.");
  return household.ownerUserId;
}
export async function limitsFor(ctx: Ctx, householdId: Id<"households">) {
  const ownerId = await ownerFor(ctx, householdId);
  const user = await ctx.db.get(ownerId);
  const site = await ctx.db.query("usageLimitSettings").withIndex("by_key", q => q.eq("key", "site")).unique();
  const override = await ctx.db.query("usageLimitOverrides").withIndex("by_owner", q => q.eq("ownerId", ownerId)).unique();
  const households = await ctx.db.query("households").withIndex("by_owner", q => q.eq("ownerUserId", ownerId)).collect();
  const profiles = await Promise.all(households.map(h => billingProfileForHousehold(ctx, h._id)));
  const plan = storagePlan(profiles.some(p => p && p.tier !== "free") ? "pro" : "free", appRoleForEmail(user?.email, user?.appRole) === "admin");
  return { ownerId, site, override, effective: effectiveLimits(site, override, plan) };
}
async function rowFor(ctx: Ctx, ownerId: string) { return ctx.db.query("usageCounters").withIndex("by_owner", q => q.eq("ownerId", ownerId)).unique(); }
async function load(ctx: MutationCtx, ownerId: string, schedule = true) {
  let row = await rowFor(ctx, ownerId);
  if (!row) {
    const site = await ctx.db.query("usageLimitSettings").withIndex("by_key", q => q.eq("key", "site")).unique();
    const id = await ctx.db.insert("usageCounters", { ownerId, ...emptyCounters(Date.now()), ready: ownerReady(null, site), revision: 0, updatedAt: Date.now() });
    row = (await ctx.db.get(id))!;
    if (schedule && !ownerReady(row, site)) await ctx.scheduler.runAfter(0, internal.usageLimitsStorage.recomputeStep, { ownerId: ownerId as Id<"users"> });
  }
  return { row, counters: rollBuckets(row, Date.now()) };
}
export async function touchStorageRevision(ctx: MutationCtx) {
  const site = await ctx.db.query("usageLimitSettings").withIndex("by_key", q => q.eq("key", "site")).unique();
  if (site) await ctx.db.patch(site._id, { storageRevision: (site.storageRevision ?? 0) + 1 });
  else await ctx.db.insert("usageLimitSettings", { key: "site", enforcement: "off", storageRevision: 1, updatedAt: Date.now(), updatedBy: "storage-accounting" });
}
async function save(ctx: MutationCtx, row: Doc<"usageCounters">, counters: UsageCounters, changed = false) {
  await ctx.db.patch(row._id, { ...counters, revision: row.revision + Number(changed), updatedAt: Date.now() });
  if (changed) await touchStorageRevision(ctx);
}
async function verdict(ctx: MutationCtx, info: Awaited<ReturnType<typeof limitsFor>>, row: Doc<"usageCounters">, refusal: Refusal | null) {
  if (!refusal) return;
  const mode = ownerEnforcement(info.effective, ownerReady(row, info.site));
  if (mode === "on") throw new ConvexError(usageLimitError(refusal));
  await recordLimitEvent(ctx, { ownerId: info.ownerId, at: Date.now(), mode, source: "upload", limit: refusal.limit, used: refusal.used, cap: refusal.cap, requested: refusal.requested, remaining: refusal.remaining });
}
export async function recordLimitEvent(ctx: MutationCtx, event: Omit<Doc<"usageLimitEvents">, "_id" | "_creationTime">) {
  try { await ctx.db.insert("usageLimitEvents", event); } catch { /* Logging cannot replace an admission result. */ }
}
export async function recordRefusalActivity(ctx: MutationCtx, householdId: Id<"households">, refusal: { code: string; message: string }, actor?: { createdByUserId: Id<"users">; oauthCaller?: { claims?: Record<string, unknown> } }) {
  try {
  const person = actor ? null : await getCurrentUser(ctx);
  const clientId = oauthClientIdFromClaims(actor?.oauthCaller?.claims);
  const connection = actor && clientId ? await readConnection(ctx, actor.createdByUserId, oauthIdentity(clientId)) : null;
  if (connection?.grantId) await ctx.db.insert("aiGrantActivities", { grantId: connection.grantId, ownerUserId: actor!.createdByUserId, householdId, type: "refused", outcome: "refused", toolName: "add_images", refusalCode: refusal.code, message: refusal.message, createdAt: Date.now() });
  await recordAuditEvent(ctx, { householdId, actorType: actor ? "agent" : "user", actorUserId: actor?.createdByUserId ?? person?._id, category: actor ? "ai" : "photo", action: "upload.refused", metadata: { code: refusal.code, message: refusal.message } });
  } catch { /* A refusal is authoritative even if its receipt cannot be written. */ }
}
export async function reserveUpload(ctx: MutationCtx, householdId: Id<"households">, key: string, bytes: number, kind: string, originalBytes = bytes) {
  const info = await limitsFor(ctx, householdId);
  const tooLarge = checkFileSize(kind, originalBytes, effectiveFileCap(kind, siteDefaults, info.site, info.override));
  if (tooLarge) throw new ConvexError(tooLarge);
  const old = await ctx.db.query("uploadReservations").withIndex("by_owner_key", q => q.eq("ownerId", info.ownerId).eq("key", key)).unique();
  if (old && old.bytes !== bytes) throw new ConvexError({ code: "OPERATION_CONFLICT", message: "This operation id already names a different file size." });
  if (old && old.status !== "released") return old._id;
  const { row, counters } = await load(ctx, info.ownerId);
  await verdict(ctx, info, row, checkUpload(counters, info.effective.limits, bytes, Date.now(), { countUpload: !old }));
  const next = applyReserve(counters, bytes, { countUpload: !old });
  await save(ctx, row, next);
  const fields = { bytes, day: next.dayKey, status: "reserved" as const, expiresAt: Date.now() + 15 * 60 * 1000 };
  if (old) { await ctx.db.patch(old._id, fields); return old._id; }
  const id = await ctx.db.insert("uploadReservations", { ownerId: info.ownerId, key, ...fields });
  await ctx.scheduler.runAt(fields.expiresAt, internal.usageLimits.expireReservations, {});
  return id;
}
/** One sum check before any item is reserved or transferred. */
export async function checkBatchAdmission(ctx: MutationCtx, householdId: Id<"households">, bytes: number, items: number, requestBytes: number, heldBytes = 0, newSizes: Array<{ bytes: number; countUpload: boolean }> = []) {
  const info = await limitsFor(ctx, householdId);
  const { row, counters } = await load(ctx, info.ownerId);
  const size = batchVerdict({ items, bytes: requestBytes }, info.effective.limits);
  if (size && ownerEnforcement(info.effective, ownerReady(row, info.site)) === "on") throw new ConvexError(size);
  if (items) {
    await verdict(ctx, info, row, checkCommit({ ...counters, reservedBytes: counters.reservedBytes - heldBytes }, info.effective.limits, 0, bytes));
    const newUploads = newSizes.filter(item => item.countUpload).length;
    const countChecks = [
      { limit: "maxUploadsInFlight" as const, used: counters.inFlight, cap: info.effective.limits.maxUploadsInFlight, requested: newSizes.length, resetsAt: null },
      { limit: "uploadsPerHour" as const, used: counters.hourUploads, cap: info.effective.limits.uploadsPerHour, requested: newUploads, resetsAt: new Date(nextHourStart(Date.now())).toISOString() },
      { limit: "uploadsPerDay" as const, used: counters.dayUploads, cap: info.effective.limits.uploadsPerDay, requested: newUploads, resetsAt: new Date(nextDayStart(Date.now())).toISOString() },
    ];
    for (const check of countChecks) if (check.used + check.requested > check.cap) await verdict(ctx, info, row, { ...check, unit: "uploads", remaining: Math.max(0, check.cap - check.used) });
    const newBytes = newSizes.reduce((sum, item) => sum + item.bytes, 0);
    if (counters.dayUploadBytes + newBytes > info.effective.limits.uploadBytesPerDay) await verdict(ctx, info, row, { limit: "uploadBytesPerDay", unit: "bytes", used: counters.dayUploadBytes, cap: info.effective.limits.uploadBytesPerDay, requested: newBytes, remaining: Math.max(0, info.effective.limits.uploadBytesPerDay - counters.dayUploadBytes), resetsAt: new Date(nextDayStart(Date.now())).toISOString() });
  }
}
export async function commitUpload(ctx: MutationCtx, householdId: Id<"households">, id: Id<"uploadReservations"> | undefined, bytes: number) {
  const info = await limitsFor(ctx, householdId);
  const reservation = id ? await ctx.db.get(id) : null;
  if (reservation?.status === "committed") return;
  if (reservation && reservation.status !== "reserved") throw new ConvexError("Upload reservation expired.");
  const { row, counters } = await load(ctx, info.ownerId);
  if (reservation) await verdict(ctx, info, row, checkCommit(counters, info.effective.limits, reservation.bytes, bytes));
  await save(ctx, row, reservation ? applyCommit(counters, reservation.bytes, bytes, reservation.day === counters.dayKey) : applyStoredAddition(counters, bytes), true);
  if (reservation) await ctx.db.patch(reservation._id, { status: "committed" });
}
export async function releaseUpload(ctx: MutationCtx, id: Id<"uploadReservations"> | undefined) {
  if (!id) return;
  const reservation = await ctx.db.get(id);
  if (!reservation || reservation.status !== "reserved") return;
  const { row, counters } = await load(ctx, reservation.ownerId);
  await save(ctx, row, applyRelease(counters, reservation.bytes, reservation.day === counters.dayKey));
  await ctx.db.patch(id, { status: "released" });
}
export async function addStoredCopy(ctx: MutationCtx, householdId: Id<"households">, bytes: number) {
  const { row, counters } = await load(ctx, await ownerFor(ctx, householdId));
  await save(ctx, row, applyStoredAddition(counters, bytes), true);
}
/** Closing a slot frees its reservation but retains a charged cleanup ledger. */
export async function closeUploadReservation(ctx: MutationCtx, session: Doc<"photoUploadSessions">, scheduleSettlement = true) {
  if (!session.usageReservationId || session.completedPhotoId) return;
  const reservation = await ctx.db.get(session.usageReservationId);
  if (!reservation || reservation.status !== "reserved") return;
  const { row, counters } = await load(ctx, reservation.ownerId);
  await save(ctx, row, applyCommit(counters, reservation.bytes, reservation.bytes, reservation.day === counters.dayKey), true);
  await ctx.db.patch(reservation._id, { status: "released" });
  await ctx.db.patch(session._id, { quarantinedBytes: (session.quarantinedBytes ?? 0) + reservation.bytes, processingUntil: undefined });
  if (scheduleSettlement) await ctx.scheduler.runAt(Math.max(Date.now(), session.expiresAt), internal.storageDeletion.settleSession, { sessionId: session._id });
}
export async function restoreUploadReservation(ctx: MutationCtx, session: Doc<"photoUploadSessions">, expiresAt: number) {
  if (!session.usageReservationId || session.quarantinedBytes === undefined) return;
  const reservation = await ctx.db.get(session.usageReservationId);
  if (!reservation || reservation.status !== "released") return;
  const { row, counters } = await load(ctx, reservation.ownerId);
  const kept = session.quarantinedBytes;
  if (kept > reservation.bytes) throw new ConvexError({ code: "OPERATION_CONFLICT", message: "Stored bytes do not match this upload. Use a new operationId while cleanup settles it." });
  const info = await limitsFor(ctx, session.householdId);
  await verdict(ctx, info, row, checkCommit(counters, info.effective.limits, 0, reservation.bytes - kept));
  const missing = reservation.bytes - kept;
  if (counters.dayUploadBytes + missing > info.effective.limits.uploadBytesPerDay) await verdict(ctx, info, row, { limit: "uploadBytesPerDay", unit: "bytes", used: counters.dayUploadBytes, cap: info.effective.limits.uploadBytesPerDay, requested: missing, remaining: Math.max(0, info.effective.limits.uploadBytesPerDay - counters.dayUploadBytes), resetsAt: new Date(nextDayStart(Date.now())).toISOString() });
  if (counters.inFlight >= info.effective.limits.maxUploadsInFlight) await verdict(ctx, info, row, { limit: "maxUploadsInFlight", unit: "uploads", used: counters.inFlight, cap: info.effective.limits.maxUploadsInFlight, requested: 1, remaining: 0, resetsAt: null });
  await save(ctx, row, { ...counters, storedBytes: Math.max(0, counters.storedBytes - kept), reservedBytes: counters.reservedBytes + reservation.bytes, inFlight: counters.inFlight + 1, dayUploadBytes: counters.dayUploadBytes + missing }, true);
  await ctx.db.patch(reservation._id, { status: "reserved", expiresAt, day: counters.dayKey });
  await ctx.db.patch(session._id, { quarantinedBytes: undefined });
  await ctx.scheduler.runAt(expiresAt, internal.usageLimits.expireReservations, {});
}
export const expireReservations = internalMutation({ args: { cursor: v.optional(v.union(v.string(), v.null())), at: v.optional(v.number()) }, handler: async (ctx, args) => {
  const at = args.at ?? Date.now();
  const page = await ctx.db.query("uploadReservations").withIndex("by_status_expires", q => q.eq("status", "reserved").lte("expiresAt", at)).paginate({ cursor: args.cursor ?? null, numItems: 100 });
  let closed = 0, processing = 0, skipped = 0;
  for (const row of page.page) {
    const owner = ctx.db.normalizeId("users", row.ownerId);
    if (!owner || !await ctx.db.get(owner)) { skipped++; continue; }
    const session = await ctx.db.query("photoUploadSessions").withIndex("by_reservation", q => q.eq("usageReservationId", row._id)).first();
    if (!session || session.cleanupCompletedAt) { await releaseUpload(ctx, row._id); closed++; continue; }
    if (session.processingUntil && session.processingUntil > Date.now()) { processing++; continue; }
    if (session.completedPhotoId || session.expiresAt > Date.now()) { skipped++; continue; }
    await closeUploadReservation(ctx, session);
    await ctx.db.patch(session._id, { status: "failed", failureCode: "UPLOAD_EXPIRED", failureReason: "The upload session expired.", updatedAt: Date.now() }); closed++;
  }
  if (!page.isDone) await ctx.scheduler.runAfter(0, internal.usageLimits.expireReservations, { cursor: page.continueCursor, at });
  return { at, closed, processing, skipped, cursor: page.continueCursor, isDone: page.isDone };
} });
export async function summaryRawFor(ctx: Ctx, householdId: Id<"households">) {
  const info = await limitsFor(ctx, householdId);
  const row = await rowFor(ctx, info.ownerId);
  const summary = storageSummary(row ?? emptyCounters(Date.now()), info.effective, { ready: ownerReady(row, info.site) });
  return { ...summary, line: storageLine(summary) };
}
export async function summaryFor(ctx: Ctx, householdId: Id<"households">) { return aiStorage(await summaryRawFor(ctx, householdId)); }
export async function removeStoredBytes(ctx: MutationCtx, ownerId: string, bytes: number) {
  const { row, counters } = await load(ctx, ownerId);
  await save(ctx, row, applyStoredRemoval(counters, bytes), true);
}
export const forHousehold = query({ args: { householdId: v.id("households") }, handler: async (ctx, args) => {
  await requirePersonConnectionManagement(ctx);
  await requireHouseholdPermission(ctx, args.householdId, "inventory:read");
  return summaryFor(ctx, args.householdId);
} });
export async function uploadPolicy(ctx: Ctx, householdId: Id<"households">) {
  const info = await limitsFor(ctx, householdId);
  const policy = { batchLimitsEnforced: ownerEnforcement(info.effective, ownerReady(await rowFor(ctx, info.ownerId), info.site)) === "on", maxFileBytes: Object.fromEntries(["image", "audio", "video"].map(kind => [kind, effectiveFileCap(kind, siteDefaults, info.site, info.override)!])), mcpBatchMaxItems: info.effective.limits.mcpBatchMaxItems, mcpBatchMaxBytes: info.effective.limits.mcpBatchMaxBytes };
  return { ...policy, requiresOperationId: info.effective.enforcement === "on", line: uploadPolicyLine(policy) };
}
export const policyInternal = internalQuery({ args: { householdId: v.id("households") }, handler: (ctx, args) => uploadPolicy(ctx, args.householdId) });
export const summaryInternal = internalQuery({ args: { householdId: v.id("households") }, handler: (ctx, args) => summaryFor(ctx, args.householdId) });

/** Cursor walks owned households, then retained/orphan media; never all photos per owner. */
async function storedPage(ctx: Ctx, ownerId: string, cursor: string | null) {
  type Position = { phase: number; households: string | null; householdId?: Id<"households">; nextHousehold?: string; lastHousehold?: boolean; cursor: string | null };
  let at: Position = cursor ? JSON.parse(cursor) : { phase: 0, households: null, cursor: null };
  if (at.phase === 0 && !at.householdId) {
    const households = await ctx.db.query("households").withIndex("by_owner", q => q.eq("ownerUserId", ownerId as Id<"users">)).paginate({ cursor: at.households, numItems: 1 });
    if (!households.page.length) at = { phase: 2, households: null, cursor: null };
    else at = { ...at, householdId: households.page[0]._id, nextHousehold: households.continueCursor, lastHousehold: households.isDone };
    return { bytes: 0, pendingBytes: 0, unknown: 0, pendingLegacyFiles: 0, objects: [], cursor: JSON.stringify(at), isDone: false };
  }
  if (at.phase === 7 || at.phase === 8) {
    const jobs = at.phase === 7
      ? await ctx.db.query("storageDeletionJobs").withIndex("by_owner_status", q => q.eq("ownerId", ownerId as Id<"users">).eq("status", "pending")).paginate({ cursor: at.cursor, numItems: 100 })
      : await ctx.db.query("sessionDeletionJobs").withIndex("by_owner_status", q => q.eq("ownerId", ownerId as Id<"users">).eq("status", "pending")).paginate({ cursor: at.cursor, numItems: 100 });
    const objects: Array<{ bucket: string; storageKey: string }> = []; let pendingBytes = 0, pendingLegacyFiles = 0;
    for (const job of jobs.page) {
      const writeUntil = "sessionId" in job ? (job.notBefore ?? 0) - defaultPhotoUploadCleanupGraceMs : job.notBefore ?? 0;
      if (writeUntil > Date.now()) { pendingBytes += job.bytes ?? 0; pendingLegacyFiles++; }
      else objects.push(...job.refs.filter(ref => !ref.deleted).map(ref => ({ bucket: ref.bucket, storageKey: ref.storageKey })));
    }
    return { bytes: pendingBytes, pendingBytes, pendingLegacyFiles, unknown: 0, objects, cursor: JSON.stringify({ ...at, phase: jobs.isDone && at.phase === 7 ? 8 : at.phase, cursor: jobs.isDone && at.phase === 7 ? null : jobs.continueCursor }), isDone: jobs.isDone && at.phase === 8 };
  }
  if (at.phase === 6) {
    const generated = await ctx.db.query("generatedObjects").withIndex("by_owner", q => q.eq("ownerId", ownerId as Id<"users">)).paginate({ cursor: at.cursor, numItems: 100, maximumBytesRead: 350_000 });
    const objects = []; let pendingBytes = 0;
    for (const intent of generated.page) {
      if (await ctx.db.query("storageDeletionJobs").withIndex("by_photo", q => q.eq("photoId", intent.photoId)).filter(q => q.eq(q.field("status"), "pending")).first()) continue;
      const photo = await ctx.db.get(intent.photoId);
      if (photo && photoStorageRefs(photo).some(ref => ref.storageKey === intent.storageKey)) continue;
      if (intent.state === "pending") pendingBytes += intent.bytes;
      else objects.push({ bucket: intent.bucket, storageKey: intent.storageKey });
    }
    return { bytes: pendingBytes, pendingBytes, pendingLegacyFiles: 0, unknown: 0, objects, cursor: JSON.stringify({ ...at, phase: generated.isDone ? 7 : 6, cursor: generated.isDone ? null : generated.continueCursor }), isDone: false };
  }
  const isSession = at.phase === 1 || at.phase >= 4;
  const page = at.phase <= 1
    ? isSession
      ? await ctx.db.query("photoUploadSessions").withIndex("by_household", q => q.eq("householdId", at.householdId!)).paginate({ cursor: at.cursor, numItems: 100, maximumBytesRead: 350_000 })
      : await ctx.db.query("itemPhotos").withIndex("by_household", q => q.eq("householdId", at.householdId!)).paginate({ cursor: at.cursor, numItems: 100, maximumBytesRead: 350_000 })
    : isSession
      ? at.phase === 4 ? await ctx.db.query("photoUploadSessions").withIndex("by_usage_owner", q => q.eq("usageOwnerId", ownerId as Id<"users">)).paginate({ cursor: at.cursor, numItems: 100, maximumBytesRead: 350_000 }) : await ctx.db.query("photoUploadSessions").withIndex("by_creator", q => q.eq("createdByUserId", ownerId as Id<"users">)).paginate({ cursor: at.cursor, numItems: 100, maximumBytesRead: 350_000 })
      : at.phase === 2 ? await ctx.db.query("itemPhotos").withIndex("by_usage_owner", q => q.eq("usageOwnerId", ownerId as Id<"users">)).paginate({ cursor: at.cursor, numItems: 100, maximumBytesRead: 350_000 }) : await ctx.db.query("itemPhotos").withIndex("by_uploader", q => q.eq("uploadedByUserId", ownerId as Id<"users">)).paginate({ cursor: at.cursor, numItems: 100, maximumBytesRead: 350_000 });
  let bytes = 0, unknown = 0;
  let pendingLegacyFiles = 0, pendingBytes = 0;
  const objects: Array<{ bucket: string; storageKey: string }> = [];
  for (const row of page.page) {
    if (at.phase >= 2) {
      const household = await ctx.db.get(row.householdId);
      if (household) continue; // already visited by the household's current owner
      if ((at.phase === 3 || at.phase === 5) && row.usageOwnerId) continue;
    }
    if ("expectedSizeBytes" in row) {
      if (row.quarantinedBytes && !row.cleanupCompletedAt) { pendingBytes += row.quarantinedBytes; continue; }
      if (row.completedPhotoId || row.status === "completed" || row.cleanupCompletedAt || row.usageReservationId) continue;
      if (row.status === "authorized" && row.expiresAt > Date.now()) { pendingLegacyFiles++; continue; }
      // Legacy abandoned objects have no hold. Count only refs not already owned
      // by a photo, including historically failed completed sessions.
      for (const ref of uploadSessionStorageRefs(row)) if (!await referencedObject(ctx, ref.storageKey, undefined, row._id)) objects.push(ref);
    } else {
      objects.push(...photoStorageRefs(row));
      bytes += row.storedBytes ?? row.sizeBytes;
      if (row.storedBytes === undefined && Object.values(row.derivativeRefs).some(Boolean)) unknown++;
    }
  }
  let next: Position = { ...at, cursor: page.continueCursor };
  let done = false;
  if (page.isDone) {
    if (at.phase === 0) next = { ...at, phase: 1, cursor: null };
    else if (at.phase === 1) next = at.lastHousehold ? { phase: 2, households: null, cursor: null } : { phase: 0, households: at.nextHousehold ?? null, cursor: null };
    else if (at.phase < 6) next = { phase: at.phase + 1, households: null, cursor: null };
    else done = true;
  }
  return { bytes: bytes + pendingBytes, pendingBytes, unknown, pendingLegacyFiles, objects, cursor: JSON.stringify(next), isDone: done };
}
export const metadataPage = internalQuery({ args: { ownerId: v.string(), cursor: v.union(v.string(), v.null()) }, handler: (ctx, args) => storedPage(ctx, args.ownerId, args.cursor) });
export const beginRecountPage = internalMutation({ args: { ownerId: v.id("users") }, handler: async (ctx, args) => {
  const { row } = await load(ctx, args.ownerId, false);
  const repair = row.repair?.revision === row.revision ? row.repair : { phase: 0, cursor: null, bytes: 0, revision: row.revision, restarts: (row.repair?.restarts ?? 0) + 1 };
  await ctx.db.patch(row._id, { repair });
  return { revision: row.revision, cursor: repair.cursor };
} });
export const finishRecountPage = internalMutation({ args: { ownerId: v.id("users"), revision: v.number(), cursor: v.union(v.string(), v.null()), nextCursor: v.string(), bytes: v.number(), done: v.boolean(), unknownSizeFiles: v.optional(v.number()) }, handler: async (ctx, args) => {
  const row = await rowFor(ctx, args.ownerId);
  if (!row?.repair || row.revision !== args.revision || row.repair.cursor !== args.cursor) return { done: false, restarted: true };
  const bytes = row.repair.bytes + args.bytes;
  const backedHold = args.done ? await ctx.db.query("uploadReservations").withIndex("by_owner_status", q => q.eq("ownerId", args.ownerId).eq("status", "reserved")).first() : null;
  const site = args.done ? await ctx.db.query("usageLimitSettings").withIndex("by_key", q => q.eq("key", "site")).unique() : null;
  const unknown = row.repair.phase + (args.unknownSizeFiles ?? 0);
  const keepEnforced = Boolean(site?.backfillCompletedAt && row.ready);
  if (args.done) await ctx.db.patch(row._id, { storedBytes: keepEnforced && unknown > 0 ? row.storedBytes : bytes, ...(!backedHold ? { reservedBytes: 0, inFlight: 0 } : {}), ready: keepEnforced || unknown === 0, repair: undefined, revision: row.revision + 1, updatedAt: Date.now() });
  else await ctx.db.patch(row._id, { repair: { ...row.repair, phase: row.repair.phase + (args.unknownSizeFiles ?? 0), bytes, cursor: args.nextCursor } });
  if (args.done) await touchStorageRevision(ctx);
  return { done: args.done, restarted: false };
} });
export const adminOverview = query({ args: {}, handler: async ctx => {
  await requirePersonConnectionManagement(ctx);
  await requireAppAdmin(ctx);
  const settings = await ctx.db.query("usageLimitSettings").withIndex("by_key", q => q.eq("key", "site")).unique();
  return { settings, effectiveSite: { ...effectiveLimits(settings).limits, planStoredBytes: { ...DEFAULT_PLAN_STORED_BYTES, ...settings?.planStoredBytes }, maxFileBytes: { ...siteDefaults, ...settings?.maxFileBytes } }, people: await ctx.db.query("usageCounters").take(500), overrides: await ctx.db.query("usageLimitOverrides").take(500), audit: await ctx.db.query("usageLimitAudit").withIndex("by_at").order("desc").take(50), events: await ctx.db.query("usageLimitEvents").withIndex("by_at").order("desc").take(50) };
} });
export const adminSetLimits = mutation({
  args: { ownerId: v.optional(v.id("users")), limits: nullableLimitPatch, enforcement: v.optional(v.union(enforcementValidator, v.null())), reason: v.string() },
  handler: async (ctx, args) => {
    await requirePersonConnectionManagement(ctx);
    const actor = await requireAppAdmin(ctx);
    if (!args.reason.trim()) throw new ConvexError("A reason is required.");
    const numeric = Object.fromEntries(Object.entries(args.limits).filter(([key, value]) => key !== "planStoredBytes" && key !== "maxFileBytes" && value !== null));
    const errors = [...validateLimits(numeric), ...validatePlanStoredBytes(args.limits.planStoredBytes ?? {}), ...validateFileCaps(args.limits.maxFileBytes ?? {})];
    if (errors.length) throw new ConvexError(errors.join("; "));
    const before = args.ownerId ? await ctx.db.query("usageLimitOverrides").withIndex("by_owner", q => q.eq("ownerId", args.ownerId!)).unique() : await ctx.db.query("usageLimitSettings").withIndex("by_key", q => q.eq("key", "site")).unique();
    const patch = { ...Object.fromEntries(Object.entries(args.limits).map(([key, value]) => [key, value === null ? undefined : (key === "planStoredBytes" || key === "maxFileBytes") ? { ...before?.[key], ...value as Record<string, number> } : value])), ...(args.enforcement !== undefined ? { enforcement: args.enforcement ?? undefined } : {}) };
    const target = args.ownerId ? String((await load(ctx, args.ownerId)).row._id) : "site";
    for (const [field, after] of Object.entries(patch)) {
      const rawOld = before?.[field as keyof typeof before];
      if (JSON.stringify(rawOld) === JSON.stringify(after)) continue;
      const resolved = args.ownerId ? before : { ...effectiveLimits(before).limits, enforcement: before?.enforcement ?? "off", planStoredBytes: { ...DEFAULT_PLAN_STORED_BYTES, ...before?.planStoredBytes }, maxFileBytes: { ...siteDefaults, ...before?.maxFileBytes } };
      const old = resolved?.[field as keyof typeof resolved];
      await ctx.db.insert("usageLimitAudit", { at: Date.now(), actor: String(actor._id), target, field, before: old === undefined ? undefined : JSON.stringify(old), after: after === undefined ? undefined : JSON.stringify(after), reason: args.reason.trim() });
    }
    const fields = { ...patch, updatedAt: Date.now(), updatedBy: String(actor._id) };
    if (before) await ctx.db.patch(before._id, { ...fields, ...(args.ownerId ? { reason: args.reason.trim() } : {}) });
    else if (args.ownerId) await ctx.db.insert("usageLimitOverrides", { ownerId: args.ownerId, ...fields, reason: args.reason.trim() });
    else await ctx.db.insert("usageLimitSettings", { key: "site", ...fields, enforcement: args.enforcement ?? "off" });
  },
});

export const recordActionRefusal = internalMutation({ args: { householdId: v.id("households"), actorUserId: v.id("users"), code: v.string(), message: v.string() }, handler: (ctx, args) => recordRefusalActivity(ctx, args.householdId, args, { createdByUserId: args.actorUserId }) });

export const reserveFetch = internalMutation({
  args: { householdId: v.id("households"), key: v.string(), bytes: v.number(), unknownLength: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    try {
      const info = await limitsFor(ctx, args.householdId);
      const previous = await ctx.db.query("uploadReservations").withIndex("by_owner_key", q => q.eq("ownerId", info.ownerId).eq("key", args.key)).unique();
      const session = previous ? await ctx.db.query("photoUploadSessions").withIndex("by_reservation", q => q.eq("usageReservationId", previous._id)).first() : null;
      if (session && session.householdId !== args.householdId) throw new ConvexError("Wrong upload household.");
      const bytes = args.unknownLength && previous ? previous.bytes : args.bytes;
      const sizeFailure = checkFileSize("image", bytes, effectiveFileCap("image", siteDefaults, info.site, info.override));
      if (sizeFailure) throw new ConvexError(sizeFailure);
      if (previous && previous.bytes !== bytes) throw new ConvexError({ code: "OPERATION_CONFLICT", message: "This operation id already names a different source size." });
      if (session?.quarantinedBytes !== undefined && !session.cleanupCompletedAt) {
        const deletion = await ctx.db.query("sessionDeletionJobs").withIndex("by_session", q => q.eq("sessionId", session._id)).order("desc").first();
        if (deletion?.status === "pending") throw new ConvexError({ code: "OPERATION_CONFLICT", message: "This upload is being cleaned up. Use a new operationId." });
        const expiresAt = Date.now() + 15 * 60 * 1000;
        await restoreUploadReservation(ctx, session, expiresAt);
        await ctx.db.patch(session._id, { status: "authorized", expiresAt, updatedAt: Date.now() });
        await ctx.scheduler.runAt(expiresAt + 24 * 60 * 60 * 1000, internal.storageDeletion.runSessionDeletion, { sessionId: session._id });
      }
      return { reservationId: await reserveUpload(ctx, args.householdId, args.key, bytes, "image"), created: !previous || (previous.status === "released" && !session) };
    } catch (error) { const refusal = refusalOf(error); if (!refusal) throw error; if (refusal.code === "USAGE_LIMIT_REACHED") await recordLimitEvent(ctx, { ownerId: await ownerFor(ctx, args.householdId), at: Date.now(), mode: "on", source: "fetch", limit: refusal.limit, used: refusal.used, cap: refusal.cap, requested: refusal.requested, remaining: refusal.remaining }); return { refusal }; }
  },
});
export const finishFetch = internalMutation({
  args: { householdId: v.id("households"), reservationId: v.id("uploadReservations"), bytes: v.number() },
  handler: async (ctx, args) => {
    const reservation = await ctx.db.get(args.reservationId);
    if (reservation?.status === "committed") return {};
    if (!reservation || reservation.status !== "reserved") throw new ConvexError("Fetch reservation is not active.");
    const info = await limitsFor(ctx, args.householdId);
    if (reservation.ownerId !== info.ownerId) throw new ConvexError("Wrong storage owner.");
    const { row, counters } = await load(ctx, info.ownerId);
    try { await verdict(ctx, info, row, checkCommit(counters, info.effective.limits, reservation.bytes, args.bytes)); }
    catch (error) { const refusal = refusalOf(error); if (!refusal) throw error; if (refusal.code === "USAGE_LIMIT_REACHED") await recordLimitEvent(ctx, { ownerId: await ownerFor(ctx, args.householdId), at: Date.now(), mode: "on", source: "fetch", limit: refusal.limit, used: refusal.used, cap: refusal.cap, requested: refusal.requested, remaining: refusal.remaining }); return { refusal }; }
    const delta = args.bytes - reservation.bytes;
    await save(ctx, row, { ...counters, reservedBytes: counters.reservedBytes + delta, dayUploadBytes: counters.dayUploadBytes + (reservation.day === counters.dayKey ? delta : 0) });
    await ctx.db.patch(reservation._id, { bytes: args.bytes });
    return {};
  },
});
export const releaseFetch = internalMutation({ args: { id: v.id("uploadReservations") }, handler: async (ctx, args) => {
  const session = await ctx.db.query("photoUploadSessions").withIndex("by_reservation", q => q.eq("usageReservationId", args.id)).first();
  if (session && !session.cleanupCompletedAt) return;
  await releaseUpload(ctx, args.id);
} });

/** Independent dry-run-first gate: changing allowance mode never enables deletion. */
export const adminSetDeletionMode = mutation({ args: { enabled: v.boolean(), reason: v.string() }, handler: async (ctx, args) => {
  await requirePersonConnectionManagement(ctx); const actor = await requireAppAdmin(ctx);
  if (!args.reason.trim()) throw new ConvexError("A reason is required.");
  const site = await ctx.db.query("usageLimitSettings").withIndex("by_key", q => q.eq("key", "site")).unique();
  await ctx.db.insert("usageLimitAudit", { at: Date.now(), actor: String(actor._id), target: "site", field: "storageDeletionEnabled", before: String(site?.storageDeletionEnabled ?? false), after: String(args.enabled), reason: args.reason.trim() });
  if (site) await ctx.db.patch(site._id, { storageDeletionEnabled: args.enabled });
  else await ctx.db.insert("usageLimitSettings", { key: "site", enforcement: "off", storageDeletionEnabled: args.enabled, updatedAt: Date.now(), updatedBy: String(actor._id) });
} });

export const reservationInternal = internalQuery({ args: { id: v.id("uploadReservations") }, handler: (ctx, args) => ctx.db.get(args.id) });

export async function bumpOwnerRevision(ctx: MutationCtx, ownerId: string) {
  const { row, counters } = await load(ctx, ownerId, false);
  await save(ctx, row, counters, true);
}
