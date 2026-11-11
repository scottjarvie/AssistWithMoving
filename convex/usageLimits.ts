import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAppAdmin } from "./lib/admin";
import { billingProfileForHousehold, effectiveBillingTier } from "./lib/billing";
import { requireHouseholdPermission } from "./lib/permissions";
import { limitPatchValidator, enforcementValidator } from "./usageLimitsSchema";
import { applyCommit, applyRelease, applyReserve, applyStoredAddition, checkCommit, checkUpload, checkFileSize, effectiveFileCap, effectiveLimits, emptyCounters, rollBuckets, storageSummary, storageLine, usageLimitError, validateLimits, validatePlanStoredBytes, validateFileCaps, type Refusal, type UsageCounters } from "./lib/usageLimits/core";

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
  const plan = storagePlan(effectiveBillingTier(await billingProfileForHousehold(ctx, householdId)), user?.appRole === "admin");
  return { ownerId, site, override, effective: effectiveLimits(site, override, plan) };
}
async function rowFor(ctx: Ctx, ownerId: string) { return ctx.db.query("usageCounters").withIndex("by_owner", q => q.eq("ownerId", ownerId)).unique(); }
async function load(ctx: MutationCtx, ownerId: string) {
  let row = await rowFor(ctx, ownerId);
  if (!row) {
    // Historical owners remain unknown until a complete recount verifies their objects.
    const id = await ctx.db.insert("usageCounters", { ownerId, ...emptyCounters(Date.now()), ready: false, revision: 0, updatedAt: Date.now() });
    row = (await ctx.db.get(id))!;
  }
  return { row, counters: rollBuckets(row, Date.now()) };
}
async function save(ctx: MutationCtx, row: Doc<"usageCounters">, counters: UsageCounters, changed = false) {
  await ctx.db.patch(row._id, { ...counters, revision: row.revision + Number(changed), updatedAt: Date.now() });
}
async function verdict(ctx: MutationCtx, info: Awaited<ReturnType<typeof limitsFor>>, row: Doc<"usageCounters">, refusal: Refusal | null) {
  if (!refusal) return;
  const mode = row.ready ? info.effective.enforcement : info.effective.enforcement === "on" ? "warn" : info.effective.enforcement;
  if (mode === "on") throw new ConvexError(usageLimitError(refusal));
  await ctx.db.insert("usageLimitEvents", { ownerId: info.ownerId, at: Date.now(), mode, source: "upload", limit: refusal.limit, used: refusal.used, cap: refusal.cap, requested: refusal.requested, remaining: refusal.remaining });
}
export async function reserveUpload(ctx: MutationCtx, householdId: Id<"households">, key: string, bytes: number, kind: string, originalBytes = bytes) {
  const info = await limitsFor(ctx, householdId);
  const tooLarge = checkFileSize(kind, originalBytes, effectiveFileCap(kind, siteDefaults, info.site, info.override));
  if (tooLarge) throw new ConvexError(tooLarge);
  const old = await ctx.db.query("uploadReservations").withIndex("by_owner_key", q => q.eq("ownerId", info.ownerId).eq("key", key)).unique();
  if (old && old.status !== "released") return old._id;
  const { row, counters } = await load(ctx, info.ownerId);
  await verdict(ctx, info, row, checkUpload(counters, info.effective.limits, bytes, Date.now(), { countUpload: !old }));
  const next = applyReserve(counters, bytes, { countUpload: !old });
  await save(ctx, row, next);
  const fields = { bytes, day: next.dayKey, status: "reserved" as const, expiresAt: Date.now() + 15 * 60 * 1000 };
  if (old) { await ctx.db.patch(old._id, fields); return old._id; }
  return ctx.db.insert("uploadReservations", { ownerId: info.ownerId, key, ...fields });
}
export async function commitUpload(ctx: MutationCtx, householdId: Id<"households">, id: Id<"uploadReservations"> | undefined, bytes: number) {
  const info = await limitsFor(ctx, householdId);
  const reservation = id ? await ctx.db.get(id) : null;
  if (reservation?.status === "committed") return;
  if (reservation && reservation.status !== "reserved") throw new ConvexError("Upload reservation expired.");
  const { row, counters } = await load(ctx, info.ownerId);
  await verdict(ctx, info, row, checkCommit(counters, info.effective.limits, reservation?.bytes ?? 0, bytes));
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
export const expireReservations = internalMutation({ args: {}, handler: async ctx => {
  const rows = await ctx.db.query("uploadReservations").withIndex("by_status_expires", q => q.eq("status", "reserved").lte("expiresAt", Date.now())).take(100);
  for (const row of rows) await releaseUpload(ctx, row._id);
} });
export async function summaryFor(ctx: Ctx, householdId: Id<"households">) {
  const info = await limitsFor(ctx, householdId);
  const row = await rowFor(ctx, info.ownerId);
  const summary = storageSummary(row ?? emptyCounters(Date.now()), info.effective, { ready: row?.ready ?? false });
  return { ...summary, line: storageLine(summary) };
}
export const forHousehold = query({ args: { householdId: v.id("households") }, handler: async (ctx, args) => {
  await requireHouseholdPermission(ctx, args.householdId, "admin:read");
  return summaryFor(ctx, args.householdId);
} });
export const summaryInternal = internalQuery({ args: { householdId: v.id("households") }, handler: (ctx, args) => summaryFor(ctx, args.householdId) });

async function storedPage(ctx: Ctx, ownerId: string, cursor: string | null) {
  const page = await ctx.db.query("itemPhotos").paginate({ cursor, numItems: 100, maximumBytesRead: 350_000 });
  let bytes = 0, unknown = 0;
  const objects: Array<{ bucket: string; storageKey: string }> = [];
  for (const photo of page.page) {
    if (await ownerFor(ctx, photo.householdId) !== ownerId) continue;
    for (const storageKey of new Set([photo.originalStorageKey, ...Object.values(photo.derivativeRefs)].filter((key): key is string => Boolean(key)))) objects.push({ bucket: photo.originalBucket, storageKey });
    bytes += photo.storedBytes ?? photo.sizeBytes;
    if (photo.storedBytes === undefined && Object.values(photo.derivativeRefs).some(Boolean)) unknown++;
  }
  return { bytes, unknown, objects, cursor: page.continueCursor, isDone: page.isDone };
}
export const metadataPage = internalQuery({ args: { ownerId: v.string(), cursor: v.union(v.string(), v.null()) }, handler: (ctx, args) => storedPage(ctx, args.ownerId, args.cursor) });
export const beginRecountPage = internalMutation({ args: { ownerId: v.id("users") }, handler: async (ctx, args) => {
  const { row } = await load(ctx, args.ownerId);
  const repair = row.repair?.revision === row.revision ? row.repair : { phase: 0, cursor: null, bytes: 0, revision: row.revision, restarts: (row.repair?.restarts ?? 0) + 1 };
  await ctx.db.patch(row._id, { repair });
  return { revision: row.revision, cursor: repair.cursor };
} });
export const finishRecountPage = internalMutation({ args: { ownerId: v.id("users"), revision: v.number(), cursor: v.union(v.string(), v.null()), nextCursor: v.string(), bytes: v.number(), done: v.boolean() }, handler: async (ctx, args) => {
  const row = await rowFor(ctx, args.ownerId);
  if (!row?.repair || row.revision !== args.revision || row.repair.cursor !== args.cursor) return { done: false, restarted: true };
  const bytes = row.repair.bytes + args.bytes;
  if (args.done) await ctx.db.patch(row._id, { storedBytes: bytes, ready: true, repair: undefined, revision: row.revision + 1, updatedAt: Date.now() });
  else await ctx.db.patch(row._id, { repair: { ...row.repair, bytes, cursor: args.nextCursor } });
  return { done: args.done, restarted: false };
} });
export const adminOverview = query({ args: {}, handler: async ctx => {
  await requireAppAdmin(ctx);
  return { settings: await ctx.db.query("usageLimitSettings").withIndex("by_key", q => q.eq("key", "site")).unique(), people: await ctx.db.query("usageCounters").take(500), overrides: await ctx.db.query("usageLimitOverrides").take(500), audit: await ctx.db.query("usageLimitAudit").withIndex("by_at").order("desc").take(50) };
} });
export const adminSetLimits = mutation({ args: { ownerId: v.optional(v.id("users")), limits: limitPatchValidator, enforcement: enforcementValidator, reason: v.string() }, handler: async (ctx, args) => {
  const actor = await requireAppAdmin(ctx);
  if (!args.reason.trim()) throw new ConvexError("A reason is required.");
  const errors = [...validateLimits(args.limits), ...validatePlanStoredBytes(args.limits.planStoredBytes ?? {}), ...validateFileCaps(args.limits.maxFileBytes ?? {})];
  if (errors.length) throw new ConvexError(errors.join("; "));
  const before = args.ownerId ? await ctx.db.query("usageLimitOverrides").withIndex("by_owner", q => q.eq("ownerId", args.ownerId!)).unique() : await ctx.db.query("usageLimitSettings").withIndex("by_key", q => q.eq("key", "site")).unique();
  const fields = { ...args.limits, enforcement: args.enforcement, updatedAt: Date.now(), updatedBy: String(actor._id) };
  if (before) await ctx.db.patch(before._id, { ...fields, ...(args.ownerId ? { reason: args.reason } : {}) });
  else if (args.ownerId) await ctx.db.insert("usageLimitOverrides", { ownerId: args.ownerId, ...fields, reason: args.reason });
  else await ctx.db.insert("usageLimitSettings", { key: "site", ...fields });
  await ctx.db.insert("usageLimitAudit", { at: Date.now(), actor: String(actor._id), target: args.ownerId ?? "site", field: "limits", before: JSON.stringify(before), after: JSON.stringify(fields), reason: args.reason });
} });
