import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { referencedObject } from "./storageDeletion";
import { uploadSessionStorageRefs } from "./lib/photoCleanup";
import { photoStorageRefs } from "./lib/photoCleanup";
import { bumpOwnerRevision } from "./usageLimits";
const sizesValidator = v.object({ thumb: v.optional(v.number()), card: v.optional(v.number()), detail: v.optional(v.number()), full: v.optional(v.number()) });
export const source = internalQuery({ args: { cursor: v.union(v.string(), v.null()) }, handler: async (ctx, args) => {
  const page = await ctx.db.query("itemPhotos").paginate({ cursor: args.cursor, numItems: 30, maximumBytesRead: 350_000 });
  return { ...page, generated: await Promise.all(page.page.map(photo => ctx.db.query("generatedObjects").withIndex("by_photo", q => q.eq("photoId", photo._id)).collect())) };
} });
export const apply = internalMutation({
  args: { photoId: v.id("itemPhotos"), refs: v.string(), previousStoredBytes: v.optional(v.number()), originalBytes: v.number(), generatedSizes: v.record(v.string(), v.number()), derivativeSizes: sizesValidator },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo || JSON.stringify(photoStorageRefs(photo)) !== args.refs || photo.storedBytes !== args.previousStoredBytes) return false;
    const ownerId = (await ctx.db.get(photo.householdId))?.ownerUserId ?? photo.usageOwnerId ?? photo.uploadedByUserId;
    if (!await ctx.db.get(ownerId)) return false;
    const generated = await ctx.db.query("generatedObjects").withIndex("by_photo", q => q.eq("photoId", photo._id)).collect();
    for (const object of generated) if (args.generatedSizes[object.storageKey] !== undefined && object.state !== "pending") await ctx.db.patch(object._id, { bytes: args.generatedSizes[object.storageKey] });
    const unattached = generated.filter(g => !photoStorageRefs(photo).some(ref => ref.storageKey === g.storageKey)).reduce((sum, g) => sum + (g.state === "pending" ? g.bytes : args.generatedSizes[g.storageKey] ?? g.bytes), 0);
    const storedBytes = args.originalBytes + Object.values(args.derivativeSizes).reduce((sum, bytes) => sum + (bytes ?? 0), 0) + unattached;
    await ctx.db.patch(photo._id, { usageOwnerId: ownerId, sizeBytes: args.originalBytes, derivativeSizes: args.derivativeSizes, storedBytes });
    await bumpOwnerRevision(ctx, ownerId);
    return true;
  },
});
export const page = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ cursor: string; isDone: boolean; filesSeen: number; repaired: number; unknownSizeFiles: number; missingObjects: number; repairFailures: number }> => {
    const page = await ctx.runQuery(internal.storageSizeRepair.source, { cursor: args.cursor ?? null });
    const endpoint = process.env.B2_ENDPOINT, accessKeyId = process.env.B2_APPLICATION_KEY_ID, secretAccessKey = process.env.B2_APPLICATION_KEY;
    if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error("Storage size repair requires server storage configuration.");
    const client = new S3Client({ endpoint, region: process.env.B2_REGION ?? "us-west-004", forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
    let repaired = 0, unknownSizeFiles = 0, missingObjects = 0, repairFailures = 0;
    for (const [index, photo] of page.page.entries()) {
      const sizes: Record<string, number> = {}; let unknown = false;
      const generatedSizes: Record<string, number> = {};
      const allRefs = [...photoStorageRefs(photo), ...page.generated[index].filter(g => g.state !== "pending" && !photoStorageRefs(photo).some(ref => ref.storageKey === g.storageKey)).map(g => ({ bucket: g.bucket, storageKey: g.storageKey }))];
      for (const ref of allRefs) {
        try { const head = await client.send(new HeadObjectCommand({ Bucket: ref.bucket, Key: ref.storageKey })); if (head.ContentLength === undefined) unknown = true; else sizes[ref.storageKey] = head.ContentLength; }
        catch (error) { if (["NotFound", "NoSuchKey"].includes((error as { name?: string }).name ?? "")) { sizes[ref.storageKey] = 0; missingObjects++; } else unknown = true; }
      }
      if (unknown) { unknownSizeFiles++; continue; }
      for (const object of page.generated[index]) if (object.state !== "pending" && sizes[object.storageKey] !== undefined) generatedSizes[object.storageKey] = sizes[object.storageKey];
    try {
      if (args.dryRun === false && await ctx.runMutation(internal.storageSizeRepair.apply, { photoId: photo._id, refs: JSON.stringify(photoStorageRefs(photo)), previousStoredBytes: photo.storedBytes, generatedSizes, originalBytes: sizes[photo.originalStorageKey], derivativeSizes: Object.fromEntries(Object.entries(photo.derivativeRefs).filter(([, key]) => Boolean(key)).map(([kind, key]) => [kind, sizes[key!]])) })) repaired++;
    } catch { repairFailures++; }
    }
    return { cursor: page.continueCursor, isDone: page.isDone, filesSeen: page.page.length, repaired, unknownSizeFiles, missingObjects, repairFailures };
  },
});

export const sessionSource = internalQuery({ args: { cursor: v.union(v.string(), v.null()) }, handler: async (ctx, args) => {
  const page = await ctx.db.query("photoUploadSessions").paginate({ cursor: args.cursor, numItems: 30, maximumBytesRead: 350_000 });
  const rows = [];
  for (const session of page.page) {
    if (session.usageReservationId || session.completedPhotoId || session.status === "completed" || session.cleanupCompletedAt || (session.status === "authorized" && session.expiresAt > Date.now())) continue;
    const refs = [];
    for (const ref of uploadSessionStorageRefs(session)) if (!await referencedObject(ctx, ref.storageKey, undefined, session._id)) refs.push(ref);
    rows.push({ session, refs });
  }
  return { ...page, rows };
} });
export const applySession = internalMutation({ args: { sessionId: v.id("photoUploadSessions"), refs: v.string(), bytes: v.number() }, handler: async (ctx, args) => {
  const session = await ctx.db.get(args.sessionId);
  if (!session || session.usageReservationId || session.completedPhotoId || session.status === "completed" || session.cleanupCompletedAt || session.expiresAt > Date.now() || JSON.stringify(uploadSessionStorageRefs(session)) !== args.refs) return false;
  const ownerId = (await ctx.db.get(session.householdId))?.ownerUserId ?? session.usageOwnerId ?? session.createdByUserId;
  if (!await ctx.db.get(ownerId)) return false;
  await ctx.db.patch(session._id, { usageOwnerId: ownerId, quarantinedBytes: args.bytes });
  await bumpOwnerRevision(ctx, ownerId); return true;
} });
export const sessionPage = internalAction({ args: { cursor: v.optional(v.union(v.string(), v.null())), dryRun: v.optional(v.boolean()) }, handler: async (ctx, args): Promise<{ cursor: string; isDone: boolean; repaired: number; unknownSizeFiles: number; missingObjects: number; repairFailures: number }> => {
  const page = await ctx.runQuery(internal.storageSizeRepair.sessionSource, { cursor: args.cursor ?? null });
  const endpoint = process.env.B2_ENDPOINT, accessKeyId = process.env.B2_APPLICATION_KEY_ID, secretAccessKey = process.env.B2_APPLICATION_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error("Storage size repair requires server storage configuration.");
  const client = new S3Client({ endpoint, region: process.env.B2_REGION ?? "us-west-004", forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
  let repaired = 0, unknownSizeFiles = 0, missingObjects = 0, repairFailures = 0;
  for (const { session, refs } of page.rows) {
    let bytes = 0, unknown = false;
    for (const ref of refs) try { const head = await client.send(new HeadObjectCommand({ Bucket: ref.bucket, Key: ref.storageKey })); if (head.ContentLength === undefined) unknown = true; else bytes += head.ContentLength; } catch (error) { if (["NotFound", "NoSuchKey"].includes((error as { name?: string }).name ?? "")) missingObjects++; else unknown = true; }
    if (unknown) { unknownSizeFiles++; continue; }
    try {
    if (args.dryRun === false && await ctx.runMutation(internal.storageSizeRepair.applySession, { sessionId: session._id, refs: JSON.stringify(uploadSessionStorageRefs(session)), bytes })) repaired++;
    } catch { repairFailures++; }
  }
  return { cursor: page.continueCursor, isDone: page.isDone, repaired, unknownSizeFiles, missingObjects, repairFailures };
} });
