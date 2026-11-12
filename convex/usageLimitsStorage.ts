import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";

// Reads only exact references retained by the application; never lists a bucket.
export const dryRunPage = internalAction({
  args: { ownerId: v.id("users"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<{ bytes: number; objects: number; cursor: string; isDone: boolean; unknownSizeFiles: number; missingObjects: number }> => {
    const decoded = args.cursor ? JSON.parse(args.cursor) : null;
    const sourceCursor = decoded?.inventoryId ? decoded.sourceCursor as string : args.cursor;
    const inventoryId = decoded?.inventoryId ?? crypto.randomUUID();
    const inventoryExpiresAt = decoded?.inventoryExpiresAt ?? Date.now() + 7 * 24 * 60 * 60 * 1000;
    if (decoded?.ownerId && decoded.ownerId !== args.ownerId) throw new Error("Inventory cursor belongs to another owner.");
    if (inventoryExpiresAt <= Date.now()) throw new Error("Inventory cursor expired; restart the inventory.");
    const page = await ctx.runQuery(internal.usageLimits.metadataPage, { ownerId: args.ownerId, cursor: sourceCursor });
    const endpoint = process.env.B2_ENDPOINT, accessKeyId = process.env.B2_APPLICATION_KEY_ID, secretAccessKey = process.env.B2_APPLICATION_KEY;
    if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error("Storage inventory requires server storage configuration.");
    const client = new S3Client({ endpoint, region: process.env.B2_REGION ?? "us-west-004", forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
    // The source enumerates references. The scan's durable seen set counts each
    // bucket/key once across every page and phase, including a retried page.
    const unique = [...new Map(page.objects.map(object => [JSON.stringify([object.bucket, object.storageKey]), object])).values()];
    const observations = [];
    for (const object of unique) {
      let bytes = 0, unknown = false, missing = false;
      try { const head = await client.send(new HeadObjectCommand({ Bucket: object.bucket, Key: object.storageKey })); if (head.ContentLength === undefined) unknown = true; else bytes = head.ContentLength; }
      catch (error) { if (["NotFound", "NoSuchKey"].includes((error as { name?: string }).name ?? "")) missing = true; else unknown = true; }
      observations.push({ ...object, bytes, unknown, missing });
    }
    const totals = await ctx.runMutation(internal.usageLimitsStorage.tallyInventory, { scanId: inventoryId, ownerId: args.ownerId, page: sourceCursor ?? "start", expiresAt: inventoryExpiresAt, observations });
    return { ...totals, unknownSizeFiles: totals.unknownSizeFiles + page.pendingLegacyFiles, cursor: JSON.stringify({ inventoryId, inventoryExpiresAt, ownerId: args.ownerId, sourceCursor: page.cursor }), isDone: page.isDone };

  },
});
export const recomputeStep = internalAction({
  args: { ownerId: v.id("users") },
  handler: async (ctx, args): Promise<{ done: boolean; restarted: boolean }> => {
    const snapshot = await ctx.runMutation(internal.usageLimits.beginRecountPage, args);
    const page = await ctx.runAction(internal.usageLimitsStorage.dryRunPage, { ...args, cursor: snapshot.cursor });
    const result = await ctx.runMutation(internal.usageLimits.finishRecountPage, { ...args, ...snapshot, bytes: page.bytes, nextCursor: page.cursor, done: page.isDone, unknownSizeFiles: page.unknownSizeFiles });
    if (!result.done && !result.restarted) await ctx.scheduler.runAfter(0, internal.usageLimitsStorage.recomputeStep, args);
    return result;
  },
});

// Derived bookkeeping only: no object ownership, payload or deletion authority.
export const tallyInventory = internalMutation({ args: { scanId: v.string(), ownerId: v.string(), page: v.string(), expiresAt: v.number(), observations: v.array(v.object({ bucket: v.string(), storageKey: v.string(), bytes: v.number(), unknown: v.boolean(), missing: v.boolean() })) }, handler: async (ctx, args) => {
  let bytes = 0, objects = 0, unknownSizeFiles = 0, missingObjects = 0;
  for (const object of args.observations) {
    let seen = await ctx.db.query("usageInventoryObjects").withIndex("by_scan_object", q => q.eq("scanId", args.scanId).eq("ownerId", args.ownerId).eq("bucket", object.bucket).eq("storageKey", object.storageKey)).unique();
    if (!seen) { const id = await ctx.db.insert("usageInventoryObjects", { ...object, scanId: args.scanId, ownerId: args.ownerId, firstPage: args.page, expiresAt: args.expiresAt }); seen = (await ctx.db.get(id))!; }
    if (seen.firstPage === args.page) { bytes += seen.bytes; objects++; unknownSizeFiles += Number(seen.unknown); missingObjects += Number(seen.missing); }
  }
  return { bytes, objects, unknownSizeFiles, missingObjects };
} });
export const cleanupInventorySeen = internalMutation({ args: { before: v.number() }, handler: async (ctx, args) => {
  const rows = await ctx.db.query("usageInventoryObjects").withIndex("by_expiry", q => q.lt("expiresAt", args.before)).take(500);
  for (const row of rows) await ctx.db.delete(row._id);
  if (rows.length === 500) await ctx.scheduler.runAfter(0, internal.usageLimitsStorage.cleanupInventorySeen, args);
} });
