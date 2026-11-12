// @vitest-environment node
import { expect, it } from "vitest";
import { convexTest } from "convex-test";
import { readFileSync, readdirSync } from "node:fs";
import schema from "../../convex/schema";
import { internal, api } from "../../convex/_generated/api";
import { manifestPage } from "../../convex/storageCheck";
import type { FunctionReturnType } from "convex/server";
const modules = import.meta.glob("../../convex/**/*.ts");
type Page = FunctionReturnType<typeof internal.storageCheck.manifestPage>;
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const owner = await ctx.db.insert("users", { clerkUserId: "placeholder-owner", appRole: "member", status: "active", createdAt: 0, updatedAt: 0, lastSeenAt: 0 });
    const uploader = await ctx.db.insert("users", { clerkUserId: "placeholder-uploader", appRole: "member", status: "active", createdAt: 0, updatedAt: 0, lastSeenAt: 0 });
    const household = await ctx.db.insert("households", { name: "Placeholder", ownerUserId: owner, createdByUserId: owner, createdAt: 0, updatedAt: 0 });
    const move = await ctx.db.insert("moves", { householdId: household, title: "Placeholder", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: owner, createdAt: 0, updatedAt: 0 });
    const photo = { householdId: household, moveId: move, originalStorageKey: "placeholder/shared", originalBucket: "placeholder-bucket", derivativeRefs: { thumb: "placeholder/thumb", card: "placeholder/card", detail: "placeholder/detail", full: "placeholder/full" }, derivativeSizes: { thumb: 1, card: 2, detail: 3, full: 4 }, documentationProfileTypes: [], mimeType: "image/jpeg", sizeBytes: 10, photoType: "other" as const, privacyLevel: "normal" as const, visibilityScope: "moveCollaborators" as const, source: "manualUpload" as const, exifHandlingStatus: "pending" as const, confidence: "none" as const, verificationStatus: "unreviewed" as const, aiProcessed: false, uploadedByUserId: uploader, createdAt: 0, updatedAt: 0 };
    const photoId = await ctx.db.insert("itemPhotos", photo);
    await ctx.db.insert("itemPhotos", { ...photo, derivativeRefs: {}, mediaKind: "audio", audioKind: "voicenote", audioVersionId: "placeholder-version", mimeType: "audio/webm" });
    await ctx.db.insert("itemPhotos", { ...photo, originalStorageKey: "placeholder/video", derivativeRefs: {}, mediaKind: "video", pendingStorageDeletion: true });
    const sessionId = await ctx.db.insert("photoUploadSessions", { householdId: household, moveId: move, originalStorageKey: "placeholder/session", originalBucket: "placeholder-bucket", expectedMimeType: "audio/webm", expectedSizeBytes: 12, mediaKind: "audio", audioKind: "audio", derivativeUploads: [{ variant: "thumb", storageKey: "placeholder/session-copy", bucket: "placeholder-bucket", expectedMimeType: "image/jpeg", expectedSizeBytes: 2, width: 1, height: 1 }], status: "authorized", expiresAt: 100, createdByUserId: uploader, createdAt: 0, updatedAt: 0 });
    await ctx.db.insert("generatedObjects", { ownerId: owner, photoId, bucket: "placeholder-bucket", storageKey: "placeholder/generated", bytes: 3, state: "pending", createdAt: 0 });
    const refs = [{ bucket: "placeholder-bucket", storageKey: "placeholder/retained", bytes: 4, deleted: false }, { bucket: "placeholder-bucket", storageKey: "placeholder/removed", bytes: 4, deleted: true }];
    await ctx.db.insert("storageDeletionJobs", { photoId, ownerId: owner, bytes: 8, refs, status: "pending", updatedAt: 0 });
    const jobId = await ctx.db.insert("sessionDeletionJobs", { sessionId, originalStorageKey: "placeholder/retained-session", ownerId: owner, refs: [{ ...refs[0], storageKey: "placeholder/retained-session" }], status: "pending", updatedAt: 0 });
    await ctx.db.insert("uploadObjectClaims", { sessionId, deletionJobId: jobId, storageKey: "placeholder/retained-session" });
    await ctx.db.insert("uploadObjectClaims", { storageKey: "placeholder/unowned" });
    await ctx.db.insert("usageInventoryObjects", { scanId: "placeholder", ownerId: owner, bucket: "placeholder-bucket", storageKey: "placeholder/inventory", firstPage: "placeholder", bytes: 5, unknown: false, missing: false, expiresAt: 100 });
    return { owner, photoId };
  });
  return { t, ...ids };
}
async function walk(t: ReturnType<typeof convexTest>, limit: number) {
  let cursor: string | null = null;
  const rows: Page["rows"] = [], lengths: number[] = [];
  let revision = "";
  for (let count = 0; count < 1000; count++) {
    const page: Page = await t.query(internal.storageCheck.manifestPage, { cursor, limit });
    expect(page.rows.length).toBeLessThanOrEqual(limit);
    rows.push(...page.rows); revision = page.revision;
    if (page.isDone) { expect(page.nextCursor).toBeNull(); return { rows, revision, lengths }; }
    cursor = page.nextCursor; lengths.push(cursor!.length);
  }
  throw new Error("Paging did not terminate");
}
it("lists every reference without merging shared objects, and splits one document across pages", async () => {
  const f = await fixture();
  const small = await walk(f.t, 2), large = await walk(f.t, 200);
  expect(small.rows).toEqual(large.rows);
  expect(small.revision).toBe(large.revision);
  expect(small.rows).toHaveLength(15);
  expect(small.rows.filter(r => r.key === "placeholder/shared")).toHaveLength(2);
  expect(small.rows.filter(r => r.recordRef === f.photoId)).toHaveLength(5);
  expect(new Set(small.rows.map(r => r.role))).toEqual(new Set(["original", "copy", "session", "generated", "retained"]));
  expect(new Set(small.rows.map(r => r.state))).toEqual(new Set(["live", "pending", "deleting", "archived"]));
  for (const row of small.rows) {
    expect(Object.keys(row).sort()).toEqual(["store", "bucketRole", "key", "versionId", "expectedBytes", "ownerRef", "recordRef", "role", "state"].sort());
    expect(row.versionId).toBeNull();
    expect(row.ownerRef).toBe(row.key === "placeholder/unowned" ? null : f.owner);
    expect(row.bucketRole).toBe("private");
  }
  expect(small.rows.some(r => r.key === "placeholder/removed")).toBe(false);
  const before = large.revision;
  await f.t.run(ctx => ctx.db.patch(f.photoId, { sizeBytes: 11, updatedAt: 1 }));
  expect((await walk(f.t, 200)).revision).not.toBe(before);
});
it("keeps cursor state bounded as the inventory grows", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    const photo = (await ctx.db.get(f.photoId))!;
    const { _id, _creationTime, ...fields } = photo;
    void _id; void _creationTime;
    for (let i = 0; i < 210; i++) await ctx.db.insert("itemPhotos", { ...fields, originalStorageKey: `placeholder/${i}`, derivativeRefs: {} });
  });
  const result = await walk(f.t, 200);
  expect(result.rows).toHaveLength(225);
  expect(Math.max(...result.lengths)).toBeLessThan(1000);
  expect(Math.max(...result.lengths.slice(20, 200)) - Math.min(...result.lengths.slice(20, 200))).toBeLessThan(20);
});
it("registers only an internal query and adds no public caller", async () => {
  expect(manifestPage).toHaveProperty("isInternal", true);
  expect(manifestPage).toHaveProperty("isQuery", true);
  expect(manifestPage).not.toHaveProperty("isPublic", true);
  // @ts-expect-error Internal queries must be absent from the client API.
  void api.storageCheck.manifestPage;
  function files(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(`${dir}/${e.name}`) : /\.[cm]?[jt]sx?$/.test(e.name) ? [`${dir}/${e.name}`] : []); }
  for (const file of [...files("convex"), ...files("src"), ...files("mcp-server")]) {
    if (file.includes("_generated") || file === "convex/storageCheck.ts") continue;
    expect(readFileSync(file, "utf8")).not.toMatch(/storageCheck[.:]/);
  }
  const f = await fixture();
  for (const limit of [0, 201, 1.5]) await expect(f.t.query(internal.storageCheck.manifestPage, { cursor: null, limit })).rejects.toThrow();
  await expect(f.t.query(internal.storageCheck.manifestPage, { cursor: "invalid", limit: 200 })).rejects.toThrow();
});
it("uses one paginated source read, bounded attribution reads, and no writable or provider surface", async () => {
  const f = await fixture();
  let cursor: string | null = null;
  for (let i = 0; i < 100; i++) {
    const page: Page = await f.t.run(async ctx => {
      let queries = 0, gets = 0;
      const allowed = new Set(["itemPhotos", "photoUploadSessions", "generatedObjects", "storageDeletionJobs", "sessionDeletionJobs", "uploadObjectClaims", "usageInventoryObjects"]);
      const db = new Proxy(ctx.db, { get(target, prop) {
        if (prop === "query") return (table: Parameters<typeof ctx.db.query>[0]) => { expect(allowed.has(table)).toBe(true); queries++; return target.query(table); };
        if (prop === "get") return (...args: Parameters<typeof ctx.db.get>) => { gets++; return target.get(...args); };
        if (prop === "normalizeId") return target.normalizeId.bind(target);
        throw new Error(`Forbidden database operation: ${String(prop)}`);
      } });
      const readonly = new Proxy({ db }, { get(target, prop) {
        if (prop === "db") return target.db;
        throw new Error(`Forbidden context operation: ${String(prop)}`);
      } });
      const handler = (manifestPage as unknown as { _handler: (ctx: typeof readonly, input: { cursor: string | null; limit: number }) => Promise<Page> })._handler;
      const result = await handler(readonly, { cursor, limit: 1 });
      expect(queries).toBe(1); expect(gets).toBeLessThanOrEqual(3);
      return result;
    });
    if (page.isDone) return;
    cursor = page.nextCursor;
  }
  throw new Error("Paging did not terminate");
});
