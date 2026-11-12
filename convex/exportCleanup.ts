import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalAction, internalQuery } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";

/** Each completed export expires in its own transaction; writers are excluded. */
export const expireOne = internalMutation({ args: { id: v.union(v.id("accountExportJobs"), v.id("exportJobs")) }, handler: async (ctx, args) => {
  const site = await ctx.db.query("usageLimitSettings").withIndex("by_key", q => q.eq("key", "site")).unique();
  if (!site?.exportExpiryEnabled) return false;
  const job = await ctx.db.get(args.id);
  if (!job || job.status !== "completed" || !job.expiresAt || job.expiresAt >= Date.now()) return false;
  await ctx.db.patch(job._id, { status: "expired", artifactText: undefined, sizeBytes: undefined });
  await recordAuditEvent(ctx, { actorType: "system", category: "export", action: "export.artifact_expired", objectTable: "userId" in job ? "accountExportJobs" : "exportJobs", objectId: job._id, ...("householdId" in job ? { householdId: job.householdId, moveId: job.moveId } : { actorUserId: job.userId }), metadata: { expiredAt: Date.now() } });
  return true;
} });
/** Temporary data exports are a right: no usage reservation or storage charge. */
export const expireArtifacts = internalMutation({ args: {}, handler: async ctx => {
  const site = await ctx.db.query("usageLimitSettings").withIndex("by_key", q => q.eq("key", "site")).unique();
  if (!site?.exportExpiryEnabled) return { scheduled: 0 };
  let scheduled = 0;
  for (const table of ["accountExportJobs", "exportJobs"] as const) {
    const page = await ctx.db.query(table).withIndex("by_status_expiry", q => q.eq("status", "completed").gt("expiresAt", 0).lt("expiresAt", Date.now())).take(100);
    for (const job of page) { await ctx.scheduler.runAfter(0, internal.exportCleanup.expireOne, { id: job._id }); scheduled++; }
  }
  return { scheduled };
} });

export const previewPage = internalQuery({ args: { account: v.boolean(), cursor: v.union(v.string(), v.null()), before: v.number() }, handler: async (ctx, args) => {
  const table = args.account ? "accountExportJobs" : "exportJobs";
  const page = await ctx.db.query(table).withIndex("by_status_expiry", q => q.eq("status", "completed").gt("expiresAt", 0).lt("expiresAt", args.before)).paginate({ cursor: args.cursor, numItems: 30, maximumBytesRead: 350_000 });
  return { count: page.page.length, bytes: page.page.reduce((sum, row) => sum + (row.sizeBytes ?? new TextEncoder().encode(row.artifactText ?? "").byteLength), 0), cursor: page.continueCursor, done: page.isDone };
} });
/** Aggregate only; never returns export ids, owners or payloads, and writes nothing. */
export const preview = internalAction({ args: {}, handler: async (ctx): Promise<{ count: number; bytes: number }> => {
  let count = 0, bytes = 0; const before = Date.now();
  for (const account of [true, false]) {
    let cursor: string | null = null;
    for (;;) { const page: { count: number; bytes: number; cursor: string; done: boolean } = await ctx.runQuery(internal.exportCleanup.previewPage, { account, cursor, before }); count += page.count; bytes += page.bytes; if (page.done) break; cursor = page.cursor; }
  }
  return { count, bytes };
} });
