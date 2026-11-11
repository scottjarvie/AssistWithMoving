import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";

/** Each completed export expires in its own transaction; writers are excluded. */
export const expireOne = internalMutation({ args: { id: v.union(v.id("accountExportJobs"), v.id("exportJobs")) }, handler: async (ctx, args) => {
  const job = await ctx.db.get(args.id);
  if (!job || job.status !== "completed" || !job.expiresAt || job.expiresAt >= Date.now()) return false;
  await ctx.db.patch(job._id, { status: "expired", artifactText: undefined, sizeBytes: undefined });
  await recordAuditEvent(ctx, { actorType: "system", category: "export", action: "export.artifact_expired", objectTable: "userId" in job ? "accountExportJobs" : "exportJobs", objectId: job._id, ...("householdId" in job ? { householdId: job.householdId, moveId: job.moveId } : { actorUserId: job.userId }), metadata: { expiredAt: Date.now() } });
  return true;
} });
/** Temporary data exports are a right: no usage reservation or storage charge. */
export const expireArtifacts = internalMutation({ args: {}, handler: async ctx => {
  let scheduled = 0;
  for (const table of ["accountExportJobs", "exportJobs"] as const) {
    const page = await ctx.db.query(table).withIndex("by_status_expiry", q => q.eq("status", "completed").gt("expiresAt", 0).lt("expiresAt", Date.now())).take(100);
    for (const job of page) { await ctx.scheduler.runAfter(0, internal.exportCleanup.expireOne, { id: job._id }); scheduled++; }
  }
  return { scheduled };
} });
