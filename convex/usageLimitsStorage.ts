import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

// Reads only exact references retained by the application; never lists a bucket.
export const dryRunPage = internalAction({
  args: { ownerId: v.id("users"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<{ bytes: number; objects: number; cursor: string; isDone: boolean }> => {
    const page = await ctx.runQuery(internal.usageLimits.metadataPage, args);
    const endpoint = process.env.B2_ENDPOINT, accessKeyId = process.env.B2_APPLICATION_KEY_ID, secretAccessKey = process.env.B2_APPLICATION_KEY;
    if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error("Storage inventory requires server storage configuration.");
    const client = new S3Client({ endpoint, region: process.env.B2_REGION ?? "us-west-004", forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
    let bytes = 0;
    for (const object of page.objects) {
      // Failure, including a missing object, blocks verification rather than inventing zero.
      const head = await client.send(new HeadObjectCommand({ Bucket: object.bucket, Key: object.storageKey }));
      if (head.ContentLength === undefined) throw new Error("Storage object size unavailable.");
      bytes += head.ContentLength;
    }
    return { bytes, objects: page.objects.length, cursor: page.cursor, isDone: page.isDone };
  },
});
export const recomputeStep = internalAction({
  args: { ownerId: v.id("users") },
  handler: async (ctx, args): Promise<{ done: boolean; restarted: boolean }> => {
    const snapshot = await ctx.runMutation(internal.usageLimits.beginRecountPage, args);
    const page = await ctx.runAction(internal.usageLimitsStorage.dryRunPage, { ...args, cursor: snapshot.cursor });
    return ctx.runMutation(internal.usageLimits.finishRecountPage, { ...args, ...snapshot, bytes: page.bytes, nextCursor: page.cursor, done: page.isDone });
  },
});
