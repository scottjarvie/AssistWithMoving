import { ConvexError, v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const sources = ["itemPhotos", "photoUploadSessions", "generatedObjects", "storageDeletionJobs", "sessionDeletionJobs", "uploadObjectClaims", "usageInventoryObjects"] as const;
type Source = typeof sources[number];
type Row = {
  store: "b2-private"; bucketRole: "private"; key: string; versionId: string | null;
  expectedBytes: number | null; ownerRef: string | null; recordRef: string;
  role: "original" | "copy" | "generated" | "session" | "retained";
  state: "live" | "archived" | "pending" | "deleting";
};
const bytes = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
async function owner(ctx: QueryCtx, row: Doc<"itemPhotos"> | Doc<"photoUploadSessions">) {
  return (await ctx.db.get(row.householdId))?.ownerUserId ?? row.usageOwnerId ?? null;
}
async function references(ctx: QueryCtx, source: Source, document: Doc<Source>) {
  const rows: Row[] = [];
  // This installation has one private B2 store. Stored bucket values are never
  // returned; the operator binds the logical role to its configured bucket.
  const add = (key: string | undefined, size: unknown, ownerRef: string | null, role: Row["role"], state: Row["state"], versionId?: string) => {
    if (key) rows.push({ store: "b2-private", bucketRole: "private", key, versionId: versionId ?? null, expectedBytes: bytes(size), ownerRef, recordRef: document._id, role, state });
  };
  if (source === "itemPhotos") {
    const d = document as Doc<"itemPhotos">;
    const charged = await owner(ctx, d);
    const state = d.pendingStorageDeletion ? "deleting" : d.archivedAt !== undefined ? "archived" : "live";
    add(d.originalStorageKey, d.sizeBytes, charged, "original", state, d.audioVersionId);
    for (const variant of ["thumb", "card", "detail", "full"] as const) add(d.derivativeRefs[variant], d.derivativeSizes?.[variant], charged, "copy", state);
  } else if (source === "photoUploadSessions") {
    const d = document as Doc<"photoUploadSessions">;
    // Completed receipts remain references even when a photo has the same key.
    if (!d.cleanupCompletedAt) {
      const charged = await owner(ctx, d);
      const state = d.status === "completed" ? "live" : d.status === "authorized" ? "pending" : "archived";
      add(d.originalStorageKey, d.expectedSizeBytes, charged, "session", state, d.audioVersionId);
      for (const ref of d.derivativeUploads ?? []) add(ref.storageKey, ref.expectedSizeBytes, charged, "session", state);
    }
  } else if (source === "generatedObjects") {
    const d = document as Doc<"generatedObjects">;
    add(d.storageKey, d.bytes, d.ownerId, "generated", d.state === "active" ? "live" : d.state === "failed" ? "archived" : "pending");
  } else if (source === "storageDeletionJobs" || source === "sessionDeletionJobs") {
    const d = document as Doc<"storageDeletionJobs"> | Doc<"sessionDeletionJobs">;
    // The refs array is authoritative; original/derivative fields are indexes
    // into it. Deleted receipts are historical metadata, not retained bytes.
    for (const ref of d.refs) if (!ref.deleted) add(ref.storageKey, ref.bytes, d.ownerId, "retained", "deleting", ref.versionId);
  } else if (source === "uploadObjectClaims") {
    const d = document as Doc<"uploadObjectClaims">;
    const session = d.sessionId ? await ctx.db.get(d.sessionId) : null;
    const jobId = d.deletionJobId ? ctx.db.normalizeId("sessionDeletionJobs", d.deletionJobId) ?? ctx.db.normalizeId("storageDeletionJobs", d.deletionJobId) : null;
    const job = jobId ? await ctx.db.get(jobId) : null;
    const ref = job?.refs.find(ref => ref.storageKey === d.storageKey && !ref.deleted);
    add(d.storageKey, ref?.bytes, job?.ownerId ?? (session ? await owner(ctx, session) : null), d.deletionJobId ? "retained" : "session", d.deletionJobId ? "deleting" : "pending");
  } else {
    const d = document as Doc<"usageInventoryObjects">;
    add(d.storageKey, d.unknown || d.missing ? null : d.bytes, d.ownerId || null, "retained", "archived");
  }
  return rows;
}

type Position = { version: 1; source: number; cursor: string | null; offset: number; digest: string };
function decode(raw: string | null): Position {
  if (raw === null) return { version: 1, source: 0, cursor: null, offset: 0, digest: "0".repeat(64) };
  try {
    const p = JSON.parse(raw) as Position;
    if (raw.length <= 16384 && p.version === 1 && Number.isSafeInteger(p.source) && p.source >= 0 && p.source < sources.length && Number.isSafeInteger(p.offset) && p.offset >= 0 && (p.cursor === null || typeof p.cursor === "string") && /^[a-f0-9]{64}$/.test(p.digest)) return p;
  } catch { /* Never echo cursor data. */ }
  throw new ConvexError("Invalid manifest cursor");
}
async function digest(previous: string, value: unknown) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([previous, value])));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** A read-only internal listing of stored media references for an operator storage check.
 * One source document per call, at most three point reads for attribution, and
 * no cross-record deduplication. Multi-object documents drain by offset before
 * advancing the native cursor. Cursor space is independent of inventory size.
 * Compare terminal revisions of full walks: intermediate digests are advisory.
 * Concurrent writes require a second pass. Exports are inline database text,
 * not object-store references; capture/queue records link to itemPhotos.
 * movePurges holds traversal state only; its retained bytes live in deletion jobs.
 * Cloudflare Images objects identified by itemPhotos.cloudflareImageId are
 * excluded: the operator contract has no store binding for that provider.
 * No Convex file storage is used by this application.
 */
export const manifestPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), limit: v.number() },
  handler: async (ctx, input) => {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 200) throw new ConvexError("Limit must be 1–200");
    const p = decode(input.cursor);
    const page = await ctx.db.query(sources[p.source]).order("asc").paginate({ cursor: p.cursor, numItems: 1, maximumRowsRead: 1 });
    const doc = page.page[0];
    const all = doc ? await references(ctx, sources[p.source], doc) : [];
    if (doc && p.offset === 0) p.digest = await digest(p.digest, [doc._id, doc._creationTime, "updatedAt" in doc ? doc.updatedAt : null, all]);
    const rows = all.slice(p.offset, p.offset + input.limit);
    p.offset += rows.length;
    if (p.offset >= all.length) {
      p.offset = 0;
      p.cursor = page.continueCursor;
      if (page.isDone) { p.source++; p.cursor = null; }
    }
    const isDone = p.source === sources.length;
    return { rows, nextCursor: isDone ? null : JSON.stringify(p), isDone, revision: `manifest-v1:${p.digest}` };
  },
});
