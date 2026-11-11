import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";

/** Derived run state only; dry-run mode never writes counters, files or settings. */
export const start = internalMutation({ args: { dryRun: v.boolean() }, handler: async (ctx, args) => {
  const id = await ctx.db.insert("usageRecountRuns", { ...args, status: "running", phase: -1, ownersCursor: null, sourceCursor: null, ownerBytes: 0, accountsSeen: 0, bytesCounted: 0, unknownSizeFiles: 0, unattributedFiles: 0, missingObjects: 0, updatedAt: Date.now() });
  await ctx.scheduler.runAfter(0, internal.usageRecount.step, { runId: id });
  return id;
} });
export const status = internalQuery({ args: { runId: v.id("usageRecountRuns") }, handler: (ctx, args) => ctx.db.get(args.runId) });
export const next = internalMutation({ args: { runId: v.id("usageRecountRuns") }, handler: async (ctx, args) => {
  const run = await ctx.db.get(args.runId);
  if (!run || run.status !== "running" || run.phase !== 0 || run.ownerId) return run;
  const owners = await ctx.db.query("users").paginate({ cursor: run.ownersCursor, numItems: 1 });
  const patch = owners.page.length ? { ownerId: owners.page[0]._id, nextOwnerCursor: owners.continueCursor, lastOwner: owners.isDone } : { phase: 1, sourceCursor: null };
  await ctx.db.patch(run._id, patch);
  return ctx.db.get(run._id);
} });
export const advance = internalMutation({
  args: { runId: v.id("usageRecountRuns"), cursor: v.string(), bytes: v.number(), unknown: v.number(), missing: v.number(), done: v.boolean() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "running") return;
    const counter = !run.dryRun && args.done && run.ownerId ? await ctx.db.query("usageCounters").withIndex("by_owner", q => q.eq("ownerId", run.ownerId!)).unique() : null;
    const ownerBytes = counter?.storedBytes ?? run.ownerBytes + args.bytes;
    if (args.done && run.ownerId) {
      const proof = await ctx.db.query("usageRecountProofs").withIndex("by_run_owner", q => q.eq("runId", run._id).eq("ownerId", run.ownerId!)).unique();
      if (proof) await ctx.db.patch(proof._id, { observedBytes: ownerBytes });
      else await ctx.db.insert("usageRecountProofs", { runId: run._id, ownerId: run.ownerId, storedBytes: 0, observedBytes: ownerBytes });
    }
    await ctx.db.patch(run._id, { unknownSizeFiles: run.unknownSizeFiles + args.unknown, missingObjects: run.missingObjects + args.missing, ...(args.done ? { accountsSeen: run.accountsSeen + 1, bytesCounted: run.bytesCounted + ownerBytes, ownerBytes: 0, ownerId: undefined, ownersCursor: run.nextOwnerCursor ?? null, sourceCursor: null, phase: run.lastOwner ? 1 : 0 } : { sourceCursor: args.cursor, ownerBytes }), updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.usageRecount.step, { runId: run._id });
  },
});
export const verifyPage = internalMutation({ args: { runId: v.id("usageRecountRuns") }, handler: async (ctx, args) => {
  const run = await ctx.db.get(args.runId);
  if (!run || run.status !== "running" || run.phase < 1) return;
  const siteRevision = (await ctx.db.query("usageLimitSettings").withIndex("by_key", q => q.eq("key", "site")).unique())?.storageRevision ?? 0;
  if (run.verifyRevision === undefined) await ctx.db.patch(run._id, { verifyRevision: siteRevision });
  else if (run.verifyRevision !== siteRevision) { await ctx.db.patch(run._id, { status: "blocked", message: "Stored media changed during verification. Wait for active uploads, then start a new run.", updatedAt: Date.now() }); return; }
  let unattributed = run.unattributedFiles; const unknown = run.unknownSizeFiles; let uncounted = run.uncountedFiles ?? 0, mismatches = run.counterMismatches ?? 0;
  if (run.phase <= 3) {
    const page = run.phase === 1 ? await ctx.db.query("itemPhotos").paginate({ cursor: run.sourceCursor, numItems: 100, maximumBytesRead: 350_000 }) : run.phase === 2 ? await ctx.db.query("photoUploadSessions").paginate({ cursor: run.sourceCursor, numItems: 100, maximumBytesRead: 350_000 }) : await ctx.db.query("generatedObjects").paginate({ cursor: run.sourceCursor, numItems: 100, maximumBytesRead: 350_000 });
    for (const row of page.page) {
      let ownerId, bytes = 0;
      if ("photoId" in row && "storageKey" in row) {
        ownerId = row.ownerId;
        // Normal intents are already included in their photo's stored total.
        if (!await ctx.db.get(row.photoId)) bytes = row.bytes;
      } else {
        const household = await ctx.db.get(row.householdId);
        const fallback = "uploadedByUserId" in row ? row.uploadedByUserId : row.createdByUserId;
        ownerId = household?.ownerUserId ?? row.usageOwnerId ?? fallback;
        if ("derivativeRefs" in row) {
          bytes = row.storedBytes ?? row.sizeBytes;
        } else bytes = row.quarantinedBytes ?? 0;
      }
      if (!await ctx.db.get(ownerId)) { unattributed++; continue; }
      const matching = await ctx.db.query("usageCounters").withIndex("by_owner", q => q.eq("ownerId", ownerId)).take(2);
      const counter = matching.length === 1 ? matching[0] : null;
      if (!run.dryRun && bytes > 0 && (!counter || !counter.ready)) uncounted++;
      const proof = await ctx.db.query("usageRecountProofs").withIndex("by_run_owner", q => q.eq("runId", run._id).eq("ownerId", ownerId)).unique();
      if (proof) await ctx.db.patch(proof._id, { storedBytes: proof.storedBytes + bytes });
      else await ctx.db.insert("usageRecountProofs", { runId: run._id, ownerId, storedBytes: bytes });
    }
    await ctx.db.patch(run._id, { unattributedFiles: unattributed, unknownSizeFiles: unknown, uncountedFiles: uncounted, sourceCursor: page.isDone ? null : page.continueCursor, phase: page.isDone ? run.phase + 1 : run.phase });
    await ctx.scheduler.runAfter(0, internal.usageRecount.step, { runId: run._id });
    return;
  }
  const counters = await ctx.db.query("usageCounters").paginate({ cursor: run.sourceCursor, numItems: 100 });
  for (const counter of counters.page) {
    const ownerId = ctx.db.normalizeId("users", counter.ownerId);
    const proof = ownerId ? await ctx.db.query("usageRecountProofs").withIndex("by_run_owner", q => q.eq("runId", run._id).eq("ownerId", ownerId)).unique() : null;
    if (!counter.ready || counter.storedBytes !== (proof?.storedBytes ?? 0) || counter.storedBytes !== (proof?.observedBytes ?? 0)) mismatches++;
  }
  if (!counters.isDone) {
    await ctx.db.patch(run._id, { counterMismatches: mismatches, sourceCursor: counters.continueCursor });
    await ctx.scheduler.runAfter(0, internal.usageRecount.step, args); return;
  }
  const notReady = await ctx.db.query("usageCounters").withIndex("by_ready", q => q.eq("ready", false)).first();
  const blocked = (run.failedOwners ?? 0) > 0 || (run.repairFailures ?? 0) > 0 || unattributed > 0 || unknown > 0 || (!run.dryRun && (Boolean(notReady) || uncounted > 0 || mismatches > 0));
  await ctx.db.patch(run._id, { unattributedFiles: unattributed, counterMismatches: mismatches, status: blocked ? "blocked" : "done", message: blocked ? "Counting found unknown, unattributed, newly uploaded or changed media. Repair sizes if needed, wait for active uploads, then start a new run." : undefined, updatedAt: Date.now() });
  if (!run.dryRun && !blocked) {
    const site = await ctx.db.query("usageLimitSettings").withIndex("by_key", q => q.eq("key", "site")).unique();
    if (site) await ctx.db.patch(site._id, { backfillCompletedAt: Date.now() });
    else await ctx.db.insert("usageLimitSettings", { key: "site", enforcement: "off", updatedAt: Date.now(), updatedBy: "storage-backfill", backfillCompletedAt: Date.now() });
  }
} });
/** Progress is accepted only for the current bounded repair page. */
export const advanceRepair = internalMutation({ args: { runId: v.id("usageRecountRuns"), previous: v.union(v.string(), v.null()), cursor: v.string(), done: v.boolean(), failures: v.optional(v.number()) }, handler: async (ctx, args) => {
  const run = await ctx.db.get(args.runId);
  if (!run || run.status !== "running" || run.phase >= 0 || run.sourceCursor !== args.previous) return;
  await ctx.db.patch(run._id, { repairFailures: (run.repairFailures ?? 0) + (args.failures ?? 0), sourceCursor: args.done ? null : args.cursor, phase: args.done ? (run.phase === -1 ? -2 : 0) : run.phase });
  await ctx.scheduler.runAfter(0, internal.usageRecount.step, { runId: run._id });
} });
export const ownerFailed = internalMutation({ args: { runId: v.id("usageRecountRuns"), ownerId: v.id("users") }, handler: async (ctx, args) => {
  const run = await ctx.db.get(args.runId);
  if (!run || run.status !== "running" || run.ownerId !== args.ownerId) return;
  await ctx.db.patch(run._id, { failedOwners: (run.failedOwners ?? 0) + 1, accountsSeen: run.accountsSeen + 1, ownerId: undefined, ownerBytes: 0, sourceCursor: null, ownersCursor: run.nextOwnerCursor ?? null, phase: run.lastOwner ? 1 : 0 });
  await ctx.scheduler.runAfter(0, internal.usageRecount.step, { runId: run._id });
} });
export const step = internalAction({
  args: { runId: v.id("usageRecountRuns") },
  handler: async (ctx, args): Promise<void> => {
    const run = await ctx.runMutation(internal.usageRecount.next, args);
    if (!run || run.status !== "running") return;
    if (run.phase < 0) {
      const repaired = run.phase === -1 ? await ctx.runAction(internal.storageSizeRepair.page, { cursor: run.sourceCursor, dryRun: run.dryRun }) : await ctx.runAction(internal.storageSizeRepair.sessionPage, { cursor: run.sourceCursor, dryRun: run.dryRun });
      await ctx.runMutation(internal.usageRecount.advanceRepair, { runId: run._id, previous: run.sourceCursor, cursor: repaired.cursor, done: repaired.isDone, failures: repaired.repairFailures }); return;
    }
    if (run.phase !== 0 || !run.ownerId) { await ctx.runMutation(internal.usageRecount.verifyPage, args); return; }
    try {
    const snapshot = run.dryRun ? null : await ctx.runMutation(internal.usageLimits.beginRecountPage, { ownerId: run.ownerId });
    const page = await ctx.runAction(internal.usageLimitsStorage.dryRunPage, { ownerId: run.ownerId, cursor: snapshot?.cursor ?? run.sourceCursor });
    if (snapshot) {
      const finished = await ctx.runMutation(internal.usageLimits.finishRecountPage, { ownerId: run.ownerId, ...snapshot, nextCursor: page.cursor, bytes: page.bytes, done: page.isDone, unknownSizeFiles: page.unknownSizeFiles });
      if (finished.restarted) { await ctx.scheduler.runAfter(0, internal.usageRecount.step, args); return; }
    }
    await ctx.runMutation(internal.usageRecount.advance, { ...args, cursor: page.cursor, bytes: page.bytes, unknown: page.unknownSizeFiles, missing: page.missingObjects, done: page.isDone });
    } catch { await ctx.runMutation(internal.usageRecount.ownerFailed, { runId: run._id, ownerId: run.ownerId }); }
  },
});
