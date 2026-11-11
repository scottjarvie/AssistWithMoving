// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import sharp from "sharp";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { hashApiKey, generateApiKeySecret, apiKeyPrefix } from "../../convex/lib/apiKeys";
import { nativeWebsiteIdentity } from "../helpers/website-session";
import { mcpLimitText } from "../../convex/lib/usageLimits/core";
import { toolErrorResult } from "../../mcp-server/assistwithmoving-api.mjs";

const storage = vi.hoisted(() => ({ objects: new Map<string, { bytes: Uint8Array; mime: string; version: string }>(), deletes: [] as string[], puts: [] as string[], failDelete: false, failPut: false, failHead: new Set<string>(), revealOlder: false }));
vi.mock("@aws-sdk/client-s3", async importOriginal => {
  const real = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  return { ...real, S3Client: class {
    async send(command: { constructor: { name: string }; input: { Key: string; Body?: Uint8Array; ContentType?: string; VersionId?: string } }) {
      const key = command.input.Key, object = storage.objects.get(key);
      if (command.constructor.name === "HeadObjectCommand" && storage.failHead.has(key)) throw Object.assign(new Error("Synthetic metadata outage"), { name: "ServiceUnavailable" });
      if (command.constructor.name === "PutObjectCommand") { if (storage.failPut) throw new Error("Synthetic PUT failure"); const bytes = new Uint8Array(command.input.Body!); storage.objects.set(key, { bytes, mime: command.input.ContentType ?? "image/webp", version: `version-${storage.puts.length}` }); storage.puts.push(key); return {}; }
      if (command.constructor.name === "DeleteObjectCommand") { if (storage.failDelete) throw new Error("Synthetic delete failure"); expect(command.input.VersionId).toBeTruthy(); storage.deletes.push(key); storage.objects.delete(key); if (storage.revealOlder) storage.objects.set(key, { bytes: new Uint8Array(1), mime: "image/png", version: "unknown-older-version" }); return {}; }
      if (!object || (command.input.VersionId && object.version !== command.input.VersionId)) throw Object.assign(new Error("Synthetic missing object"), { name: "NotFound" });
      if (command.constructor.name === "HeadObjectCommand") return { ContentLength: object.bytes.byteLength, ContentType: object.mime, VersionId: object.version };
      if (command.constructor.name === "GetObjectCommand") return { Body: object.bytes };
      throw new Error(`Unmocked storage command ${command.constructor.name}`);
    }
  } };
});
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: async (_client: unknown, command: { input: { Key: string } }) => `https://synthetic-put.invalid/${encodeURIComponent(command.input.Key)}` }));
vi.mock("../../mcp-server/media-ingress.mjs", async importOriginal => {
  const actual = await importOriginal<typeof import("../../mcp-server/media-ingress.mjs")>();
  return { ...actual, downloadPublicHttpsMedia: (url: string, options: Parameters<typeof actual.downloadPublicHttpsMedia>[1]) => actual.downloadPublicHttpsMedia(url, { ...options, lookupFn: async () => [{ address: "93.184.216.34", family: 4 }], requestFn: async () => ({ status: 200, headers: new Headers({ "content-length": String(png.byteLength), "content-type": "image/png" }), body: [Buffer.from(png)], destroy: () => {} }) }) };
});
const modules = import.meta.glob("../../convex/**/*.ts");
let png: Uint8Array;
beforeEach(async () => {
  vi.useFakeTimers(); storage.objects.clear(); storage.puts.length = 0; storage.deletes.length = 0; storage.failDelete = false; storage.failPut = false; storage.failHead.clear(); storage.revealOlder = false;
  for (const [name, value] of Object.entries({ B2_ENDPOINT: "https://synthetic-storage.invalid", B2_BUCKET_NAME: "synthetic", B2_APPLICATION_KEY_ID: "synthetic-test-only", B2_APPLICATION_KEY: "synthetic-test-only" })) vi.stubEnv(name, value);
  png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
  vi.stubGlobal("fetch", async (url: string, options?: RequestInit) => {
    if (!url.startsWith("https://synthetic-put.invalid/")) throw new Error("No network allowed in storage tests");
    const bytes = new Uint8Array(await new Response(options?.body).arrayBuffer());
    const key = decodeURIComponent(new URL(url).pathname.slice(1));
    storage.objects.set(key, { bytes, mime: String((options?.headers as Record<string, string>)?.["Content-Type"] ?? "image/png"), version: "synthetic-put-version" });
    storage.puts.push(key); return new Response("", { status: 200 });
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function fixture({ cap = 10000, backfilled = true, mode = "on" as "on" | "off" | "warn", transactionLimits = false } = {}) {
  const t = convexTest({ schema, modules, transactionLimits });
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const owner = await ctx.db.insert("users", { clerkUserId: "synthetic-owner", appRole: "member", status: "active", createdAt: now, updatedAt: now, lastSeenAt: now });
    const householdId = await ctx.db.insert("households", { name: "Synthetic", ownerUserId: owner, createdByUserId: owner, createdAt: now, updatedAt: now });
    await ctx.db.insert("householdMemberships", { householdId, userId: owner, role: "owner", status: "active", apiAccessStatus: "enabled", createdAt: now, updatedAt: now });
    const moveId = await ctx.db.insert("moves", { householdId, title: "Synthetic", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: owner, createdAt: now, updatedAt: now });
    const settings = await ctx.db.insert("usageLimitSettings", { key: "site", enforcement: mode, planStoredBytes: { free: cap, pro: cap * 10 }, maxFileBytes: { image: 1000000, audio: 1000000, video: 1000000 }, mcpBatchMaxBytes: 1000000, backfillCompletedAt: backfilled ? now : undefined, updatedAt: now, updatedBy: "synthetic-admin" });
    const adminId = await ctx.db.insert("users", { clerkUserId: "synthetic-admin", appRole: "admin", status: "active", createdAt: now, updatedAt: now, lastSeenAt: now });
    return { owner, householdId, moveId, settings, adminId };
  });
  const person = t.withIdentity(nativeWebsiteIdentity("synthetic-owner"));
  const admin = t.withIdentity(nativeWebsiteIdentity("synthetic-admin"));
  const beginArgs = (operationId: string, sizeBytes = png.byteLength) => ({ householdId: ids.householdId, moveId: ids.moveId, operationId, mimeType: "image/png", sizeBytes });
  const sessionArgs = (operationId: string, bytes = png.byteLength) => ({ householdId: ids.householdId, moveId: ids.moveId, operationId, originalBucket: "synthetic", originalStorageKey: `${operationId}-original`, expectedMimeType: "image/png", expectedSizeBytes: bytes, expiresAt: Date.now() + 900000 });
  const actor = { apiKeyId: "synthetic-internal-actor", createdByUserId: ids.owner };
  const summary = () => person.query(api.usageLimits.forHousehold, { householdId: ids.householdId });
  async function upload(operationId = "image") {
    const begin = await person.action(api.photos.initUpload, beginArgs(operationId));
    const key = decodeURIComponent(new URL(begin.uploadUrl).pathname.slice(1));
    storage.objects.set(key, { bytes: png, mime: "image/png", version: "original-version" });
    const done = await person.action(api.photos.finalizeUpload, { householdId: ids.householdId, moveId: ids.moveId, uploadSessionId: begin.uploadSessionId as typeof ids.moveId extends never ? never : import("../../convex/_generated/dataModel").Id<"photoUploadSessions">, width: 2, height: 2 });
    // Completed fixture uploads have no remaining PUT lease; live leases have
    // their own explicit survival test below.
    await t.run(ctx => ctx.db.patch(begin.uploadSessionId as import("../../convex/_generated/dataModel").Id<"photoUploadSessions">, { expiresAt: 0 }));
    return { begin, done, key };
  }
  async function key() {
    const raw = generateApiKeySecret();
    const id = await t.run(async ctx => ctx.db.insert("apiKeys", { householdId: ids.householdId, name: "Synthetic", prefix: apiKeyPrefix(raw), tokenPreview: "synthetic", secretHash: await hashApiKey(raw), scopes: ["moves/read", "inventory/read", "inventory/write", "photos/write"], scopeChoice: "chosen", status: "active", createdByUserId: ids.owner, createdAt: Date.now(), updatedAt: Date.now() }));
    await t.mutation(internal.apiKeys.connectCallingKey, { apiKeyId: id });
    while (!(await t.run(ctx => ctx.db.query("aiAccessOwners").withIndex("by_owner", q => q.eq("ownerUserId", ids.owner)).unique()))?.bootstrapped) await t.mutation(internal.aiGrants.continueBootstrap, { ownerUserId: ids.owner });
    return { raw, id };
  }
  return { t, person, admin, ...ids, beginArgs, sessionArgs, actor, summary, upload, key };
}

describe("storage admission through actual upload doors", () => {
  it("starts a new no-profile account free and enforces immediately after backfill", async () => {
    const f = await fixture({ cap: png.byteLength - 1 });
    expect(await f.summary()).toMatchObject({ ready: true, plan: "free", usedBytes: 0 });
    await expect(f.person.action(api.photos.initUpload, f.beginArgs("full"))).rejects.toMatchObject({ data: expect.stringContaining("[USAGE_LIMIT_REACHED]") });
    expect(storage.puts).toHaveLength(0);
    expect(await f.t.run(ctx => ctx.db.query("usageLimitEvents").collect())).toHaveLength(1);
    expect((await f.admin.query(api.usageLimits.adminOverview, {})).events[0]).toMatchObject({ mode: "on", limit: "storedBytesPerUser", requested: png.byteLength });
  });
  it("does not expose invented byte numbers before backfill", async () => {
    const f = await fixture({ backfilled: false });
    expect(await f.summary()).toEqual({ ready: false, plan: "free", line: "Storage is still being counted." });
  });
  it("uses one owner plan across free and explicitly paid households", async () => {
    const f = await fixture();
    const second = await f.t.run(async ctx => {
      const id = await ctx.db.insert("households", { name: "Other synthetic", ownerUserId: f.owner, createdByUserId: f.owner, createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("householdBillingProfiles", { householdId: id, tier: "launch", provider: "none", status: "none", createdAt: 1, updatedAt: 1 }); return id;
    });
    expect(await f.summary()).toMatchObject({ plan: "pro", capBytes: 100000 });
    expect(await f.t.query(internal.usageLimits.summaryInternal, { householdId: second })).toMatchObject({ plan: "pro", capBytes: 100000 });
  });
  it("begin retries reuse the session, original key and one reservation", async () => {
    const f = await fixture();
    const a = await f.person.action(api.photos.initUpload, f.beginArgs("stable"));
    const b = await f.person.action(api.photos.initUpload, f.beginArgs("stable"));
    expect(b.uploadSessionId).toBe(a.uploadSessionId); expect(b.uploadUrl).toBe(a.uploadUrl);
    expect(await f.summary()).toMatchObject({ usedBytes: png.byteLength });
    expect(await f.t.run(ctx => ctx.db.query("uploadReservations").collect())).toHaveLength(1);
    await expect(f.person.action(api.photos.initUpload, f.beginArgs("stable", png.byteLength + 1))).rejects.toThrow(/different media/);
  });
  it("commits the original and all four generated copies, including a replay at cap", async () => {
    const f = await fixture(); const { done } = await f.upload();
    expect(done.derivativeStatus).toBe("ready");
    expect((await f.t.run(ctx => ctx.db.get(f.settings)))?.storageRevision).toBe(9);
    const used = [...storage.objects.values()].reduce((sum, object) => sum + object.bytes.byteLength, 0);
    expect(storage.objects.size).toBe(5); expect(await f.summary()).toMatchObject({ usedBytes: used });
    await f.t.run(ctx => ctx.db.patch(f.settings, { planStoredBytes: { free: used, pro: used } }));
    const retry = await f.person.action(api.photos.initUpload, f.beginArgs("image"));
    expect(retry.replayedPhotoId).toBe(done.photoId); expect(await f.summary()).toMatchObject({ usedBytes: used });
  });
  it("finishes a pre-deploy session without a reservation and counts it", async () => {
    const f = await fixture(); const id = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("old"));
    await f.t.run(ctx => ctx.db.patch(id, { usageReservationId: undefined }));
    const photo = await f.person.mutation(internal.photos.completeUploadSession, { householdId: f.householdId, moveId: f.moveId, uploadSessionId: id, width: 2, height: 2 });
    expect(await f.t.run(ctx => ctx.db.get(photo))).toMatchObject({ sizeBytes: png.byteLength });
    expect((await f.t.run(ctx => ctx.db.query("usageCounters").first()))?.storedBytes).toBe(png.byteLength);
  });
  it("checks the whole batch against true room before the first session is created", async () => {
    const f = await fixture({ cap: 100 });
    const result = await f.person.mutation(internal.photos.tryCreateUploadBatch, { files: [f.sessionArgs("one", 60), f.sessionArgs("two", 60)], requestBytes: 100 });
    expect(result.refusal).toMatchObject({ code: "USAGE_LIMIT_REACHED", requested: 120, remaining: 100 });
    expect(await f.t.run(ctx => ctx.db.query("photoUploadSessions").collect())).toEqual([]);
    expect((await f.summary()).usedBytes).toBe(0);
  });
  it("keeps an operation conflict per item, and never releases another call's hold", async () => {
    const f = await fixture(); const id = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("prior", 20));
    const result = await f.person.mutation(internal.photos.tryCreateUploadBatch, { files: [f.sessionArgs("prior", 21), f.sessionArgs("new", 30)], requestBytes: 100 });
    expect(result.results?.[0]).toMatchObject({ code: "OPERATION_CONFLICT" });
    expect(result.results?.[1].uploadSessionId).toBeTruthy();
    expect((await f.t.run(ctx => ctx.db.get(id)))?.status).toBe("authorized");
    expect((await f.summary()).usedBytes).toBe(50);
  });
  it("retains an expired session's hold until storage confirms deletion", async () => {
    const f = await fixture(); const id = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("abandoned", 20));
    await f.t.run(ctx => ctx.db.patch(id, { expiresAt: 1 }));
    await f.t.mutation(internal.usageLimits.expireReservations, {});
    expect((await f.summary()).usedBytes).toBe(20);
    expect(await f.t.action(internal.storageDeletion.deleteSession, { sessionId: id, dryRun: false })).toMatchObject({ deleted: true });
    expect((await f.summary()).usedBytes).toBe(0);
  });
});

describe("cleanup and confirmed removal", () => {
  it("a historically failed completed session and all referenced objects survive the sweep", async () => {
    const f = await fixture(); const { begin, done, key } = await f.upload();
    await f.t.run(ctx => ctx.db.patch(begin.uploadSessionId as import("../../convex/_generated/dataModel").Id<"photoUploadSessions">, { status: "failed", expiresAt: 0 }));
    const plan = await f.t.query(internal.photos.claimExpiredCleanup, {});
    expect(plan.candidates).toEqual([]);
    await f.t.action(internal.photos.cleanupExpiredInternal, {});
    expect(storage.objects.has(key)).toBe(true); expect(storage.deletes).toEqual([]);
    expect(await f.t.run(ctx => ctx.db.get(done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">))).not.toBeNull();
  });
  it("hard deletion counts originals and copies until every version is confirmed gone", async () => {
    const f = await fixture(); const { done } = await f.upload();
    const photoId = done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">;
    await f.t.run(ctx => ctx.db.patch(photoId, { archivedAt: Date.now(), pendingStorageDeletion: true }));
    const before = (await f.summary()).usedBytes;
    expect(await f.t.action(internal.storageDeletion.deletePhoto, { photoId })).toMatchObject({ dryRun: true });
    expect((await f.summary()).usedBytes).toBe(before); expect(storage.objects.size).toBe(5);
    storage.failDelete = true;
    await expect(f.t.action(internal.storageDeletion.deletePhoto, { photoId, dryRun: false })).rejects.toThrow(/Synthetic delete failure/);
    expect((await f.summary()).usedBytes).toBe(before);
    storage.failDelete = false;
    expect(await f.t.action(internal.storageDeletion.deletePhoto, { photoId, dryRun: false })).toMatchObject({ deleted: true });
    expect(storage.objects.size).toBe(0); expect((await f.summary()).usedBytes).toBe(0);
    await f.person.action(api.photos.initUpload, f.beginArgs("room-again"));
  });
  it("refuses deletion of a key another photo still references", async () => {
    const f = await fixture(); const { done, key } = await f.upload(); const photoId = done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">;
    await f.t.run(async ctx => { const photo = (await ctx.db.get(photoId))!; const { _id: _id, _creationTime: _time, ...copy } = photo; void _id; void _time; await ctx.db.insert("itemPhotos", copy); await ctx.db.patch(photoId, { pendingStorageDeletion: true, archivedAt: Date.now() }); });
    expect(await f.t.action(internal.storageDeletion.deletePhoto, { photoId, dryRun: false })).toMatchObject({ deleted: false, blocked: true });
    expect(storage.objects.has(key)).toBe(true); expect(storage.deletes).toEqual([]);
  });
});

describe("person-only allowance controls", () => {
  it.each(["adminOverview", "adminSetLimits", "adminSetDeletionMode", "forHousehold"] as const)("rejects an administrator's AI identity on %s", async name => {
    const f = await fixture(); const ai = f.t.withIdentity({ ...nativeWebsiteIdentity("synthetic-admin"), client_id: "synthetic-ai" });
    if (name === "adminSetDeletionMode") await expect(ai.mutation(api.usageLimits.adminSetDeletionMode, { enabled: true, reason: "Synthetic" })).rejects.toThrow(/only reduce/);
    else if (name === "adminSetLimits") await expect(ai.mutation(api.usageLimits.adminSetLimits, { limits: {}, reason: "Synthetic" })).rejects.toThrow(/only reduce/);
    else if (name === "adminOverview") await expect(ai.query(api.usageLimits.adminOverview, {})).rejects.toThrow(/only reduce/);
    else await expect(ai.query(api.usageLimits.forHousehold, { householdId: f.householdId })).rejects.toThrow(/only reduce/);
  });
  it("allows an uploading editor to read the owner meter", async () => {
    const f = await fixture(); await f.t.run(async ctx => { const id = await ctx.db.insert("users", { clerkUserId: "synthetic-editor", appRole: "member", status: "active", createdAt: 1, updatedAt: 1, lastSeenAt: 1 }); await ctx.db.insert("householdMemberships", { householdId: f.householdId, userId: id, role: "editor", status: "active", createdAt: 1, updatedAt: 1 }); });
    expect(await f.t.withIdentity(nativeWebsiteIdentity("synthetic-editor")).query(api.usageLimits.forHousehold, { householdId: f.householdId })).toMatchObject({ ready: true, plan: "free" });
  });
  it("patches only edited personal fields, supports explicit reset, and audits field-only data", async () => {
    const f = await fixture();
    await f.admin.mutation(api.usageLimits.adminSetLimits, { ownerId: f.owner, limits: { storedBytesPerUser: 25 }, reason: "Synthetic exception" });
    let override = await f.t.run(ctx => ctx.db.query("usageLimitOverrides").first());
    expect(override).not.toHaveProperty("enforcement"); expect(override).not.toHaveProperty("planStoredBytes"); expect(override).not.toHaveProperty("maxFileBytes");
    await f.admin.mutation(api.usageLimits.adminSetLimits, { ownerId: f.owner, limits: { storedBytesPerUser: null }, reason: "Synthetic reset" });
    override = await f.t.run(ctx => ctx.db.query("usageLimitOverrides").first()); expect(override).not.toHaveProperty("storedBytesPerUser");
    const audit = await f.t.run(ctx => ctx.db.query("usageLimitAudit").collect());
    expect(audit).toHaveLength(2); expect(audit[0].target).not.toBe(f.owner); expect(audit[0].field).toBe("storedBytesPerUser"); expect(audit[0].after).toBe("25");
  });
});

it("the AI receives shared text first, structured refusal data, and keeps using the same credential", async () => {
  const refusal = { code: "USAGE_LIMIT_REACHED" as const, limit: "storedBytesPerUser" as const, unit: "bytes" as const, used: 100, cap: 100, requested: 1, remaining: 0, resetsAt: null, retryable: true as const, nothingSaved: true as const, message: "Person sentence" };
  const result = toolErrorResult(Object.assign(new Error("Person sentence"), { payload: { error: refusal } }));
  expect(result.isError).toBe(true); expect(result.structuredContent).toEqual(refusal); expect(result.content[0].text).toBe(mcpLimitText(refusal));
  const f = await fixture({ cap: 1 }); const key = await f.key();
  const request = (path: string, body?: unknown) => f.t.action(internal.restApiActions.handle, { method: "POST", path, authorization: `Bearer ${key.raw}`, query: {}, idempotencyKey: "same-operation", body });
  const rejected = await request("uploads/init", { moveId: f.moveId, mimeType: "image/png", sizeBytes: png.byteLength });
  expect(rejected.status, JSON.stringify(rejected.body)).toBe(413);
  expect(rejected.body).toMatchObject({ error: { code: "USAGE_LIMIT_REACHED" } });
  expect(await f.t.run(ctx => ctx.db.query("apiIdempotencyKeys").collect())).toEqual([]);
  await f.t.run(ctx => ctx.db.patch(f.settings, { planStoredBytes: { free: 10000, pro: 10000 } }));
  expect((await request("uploads/init", { moveId: f.moveId, mimeType: "image/png", sizeBytes: png.byteLength })).status).toBe(201);
  expect((await f.t.run(ctx => ctx.db.get(key.id)))?.status).toBe("active");
});

it("the REST direct-upload pipeline commits every generated copy and never stores an over-cap batch", async () => {
  const f = await fixture(); const credential = await f.key();
  const call = (path: string, body: unknown, operation: string) => f.t.action(internal.restApiActions.handle, { method: "POST", path, query: {}, authorization: `Bearer ${credential.raw}`, idempotencyKey: operation, body });
  const uploaded = await call("photos/upload", { moveId: f.moveId, fileBase64: Buffer.from(png).toString("base64"), mimeType: "image/png" }, "rest-one");
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
  expect((await f.t.run(ctx => ctx.db.get(f.settings)))?.storageRevision).toBe(9);
  const used = [...storage.objects.values()].reduce((sum, object) => sum + object.bytes.byteLength, 0);
  expect(storage.objects.size).toBe(5); expect((await f.summary()).usedBytes).toBe(used);
  await f.t.run(ctx => ctx.db.patch(f.settings, { planStoredBytes: { free: used + png.byteLength, pro: used + png.byteLength } }));
  const count = storage.objects.size;
  const blocked = await call("uploads/batch", { moveId: f.moveId, images: [1, 2].map(() => ({ fileBase64: Buffer.from(png).toString("base64"), mimeType: "image/png" })) }, "rest-batch");
  expect(blocked.status).toBe(413); expect(blocked.body).toMatchObject({ error: { code: "USAGE_LIMIT_REACHED", requested: png.byteLength * 2, remaining: png.byteLength } });
  expect(storage.objects.size).toBe(count);
  const replay = await call("photos/upload", { moveId: f.moveId, fileBase64: Buffer.from(png).toString("base64"), mimeType: "image/png" }, "rest-one");
  expect(replay.body).toMatchObject({ data: { photoId: (uploaded.body as { data: { photoId: string } }).data.photoId, storage: { capBytes: used + png.byteLength } } }); expect(replay.status).toBe(uploaded.status); expect(storage.objects.size).toBe(count);
});

it("legacy OAuth returns the family error, then stores originals and all copies through the same connection", async () => {
  const f = await fixture({ cap: 1 });
  await f.t.mutation(internal.aiGrants.touchLegacyConnection, { subject: "synthetic-owner", clientId: "synthetic-ai" });
  while (!(await f.t.run(ctx => ctx.db.query("aiAccessOwners").withIndex("by_owner", q => q.eq("ownerUserId", f.owner)).unique()))?.bootstrapped) await f.t.mutation(internal.aiGrants.continueBootstrap, { ownerUserId: f.owner });
  const caller = { subject: "synthetic-owner", claims: { client_id: "synthetic-ai" } };
  const args = { caller, householdId: f.householdId, moveId: f.moveId, operationId: "legacy-image", images: [{ base64: Buffer.from(png).toString("base64"), mimeType: "image/png" }] };
  const blocked = await f.t.action(internal.mcpToolsImages.addImages, args);
  expect(blocked.isError).toBe(true); expect(blocked.structuredContent).toMatchObject({ code: "USAGE_LIMIT_REACHED" });
  expect(blocked.content?.[0].text).toBe(mcpLimitText(blocked.structuredContent as Parameters<typeof mcpLimitText>[0]));
  expect((await f.person.query(api.aiGrants.listActivity, {})).activity.some(row => row.type === "refused" && row.refusalCode === "USAGE_LIMIT_REACHED")).toBe(true);
  expect(storage.puts).toHaveLength(0);
  await f.t.run(ctx => ctx.db.patch(f.settings, { planStoredBytes: { free: 10000, pro: 10000 } }));
  const accepted = await f.t.action(internal.mcpToolsImages.addImages, args);
  expect(accepted.results[0], JSON.stringify(accepted)).toMatchObject({ ok: true });
  expect((await f.t.run(ctx => ctx.db.get(f.settings)))?.storageRevision).toBe(9);
  expect(storage.objects.size).toBe(5);
  expect(accepted.storage?.usedBytes).toBe([...storage.objects.values()].reduce((sum, object) => sum + object.bytes.byteLength, 0));
});

it("a bad OAuth batch item stays per-item while another valid item succeeds", async () => {
  const f = await fixture();
  await f.t.mutation(internal.aiGrants.touchLegacyConnection, { subject: "synthetic-owner", clientId: "synthetic-ai" });
  while (!(await f.t.run(ctx => ctx.db.query("aiAccessOwners").withIndex("by_owner", q => q.eq("ownerUserId", f.owner)).unique()))?.bootstrapped) await f.t.mutation(internal.aiGrants.continueBootstrap, { ownerUserId: f.owner });
  const result = await f.t.action(internal.mcpToolsImages.addImages, { caller: { subject: "synthetic-owner", claims: { client_id: "synthetic-ai" } }, householdId: f.householdId, moveId: f.moveId, operationId: "mixed", images: [{ base64: "YmFk", mimeType: "image/png" }, { base64: Buffer.from(png).toString("base64"), mimeType: "image/png" }] });
  expect(result.results[0]).toMatchObject({ ok: false }); expect(result.results[1]).toMatchObject({ ok: true });
  expect(result.isError).not.toBe(true);
});

it("move purge retains every photo, session and byte until confirmed storage removal", async () => {
  const f = await fixture(); const { begin, done, key } = await f.upload(); const before = (await f.summary()).usedBytes;
  await f.person.mutation(api.moves.purge, { householdId: f.householdId, moveId: f.moveId, confirmTitle: "Synthetic" });
  const photo = await f.t.run(ctx => ctx.db.get(done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">));
  expect(photo).toMatchObject({ pendingStorageDeletion: true, usageOwnerId: f.owner });
  expect(await f.t.run(ctx => ctx.db.get(begin.uploadSessionId as import("../../convex/_generated/dataModel").Id<"photoUploadSessions">))).toBeNull();
  expect(storage.objects.has(key)).toBe(true); expect((await f.summary()).usedBytes).toBe(before);
});

it("data exports succeed at the storage cap, count against nobody, and their artifacts expire", async () => {
  const f = await fixture({ cap: 0 });
  const job = await f.person.mutation(api.accountPrivacy.createAccountExport, {});
  expect(job.sizeBytes).toBeGreaterThan(0); expect((await f.summary()).usedBytes).toBe(0);
  await f.t.run(ctx => ctx.db.patch(job.exportJobId, { expiresAt: 1 }));
  await f.t.mutation(internal.exportCleanup.expireArtifacts, {});
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.t.run(ctx => ctx.db.get(job.exportJobId))).toMatchObject({ status: "expired" });
  expect(await f.t.run(ctx => ctx.db.get(job.exportJobId))).not.toHaveProperty("artifactText");
});

it("all-account dry run and backfill are resumable and only backfill records completion", async () => {
  const f = await fixture({ backfilled: false });
  const dry = await f.t.mutation(internal.usageRecount.start, { dryRun: true });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.t.query(internal.usageRecount.status, { runId: dry })).toMatchObject({ status: "done", accountsSeen: 2, bytesCounted: 0, unknownSizeFiles: 0, unattributedFiles: 0 });
  expect(await f.t.run(ctx => ctx.db.get(f.settings))).not.toHaveProperty("backfillCompletedAt");
  const run = await f.t.mutation(internal.usageRecount.start, { dryRun: false });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.t.query(internal.usageRecount.status, { runId: run })).toMatchObject({ status: "done", accountsSeen: 2 });
  expect((await f.t.run(ctx => ctx.db.get(f.settings)))?.backfillCompletedAt).toBeTypeOf("number");
});

it("a legacy failed session without a completed-photo link still cannot delete a referenced original", async () => {
  const f = await fixture(); const { begin, key } = await f.upload();
  const sessionId = begin.uploadSessionId as import("../../convex/_generated/dataModel").Id<"photoUploadSessions">;
  await f.t.run(ctx => ctx.db.patch(sessionId, { status: "failed", completedPhotoId: undefined, expiresAt: 0 }));
  expect((await f.t.query(internal.photos.claimExpiredCleanup, {})).candidates[0].refs).toEqual([]);
  expect(await f.t.action(internal.storageDeletion.deleteSession, { sessionId, dryRun: false })).toMatchObject({ deleted: false });
  expect(storage.objects.has(key)).toBe(true); expect(storage.deletes).toEqual([]);
});

it("pending derivative slots protect their objects from deletion", async () => {
  const f = await fixture(); const { done, key } = await f.upload();
  const photoId = done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">;
  const legacy = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("other-slot"));
  await f.t.run(ctx => ctx.db.patch(legacy, { objectClaimsRegistered: undefined, derivativeUploads: [{ variant: "thumb", bucket: "synthetic", storageKey: key, expectedMimeType: "image/png", expectedSizeBytes: png.byteLength, width: 2, height: 2 }] }));
  await f.t.run(ctx => ctx.db.patch(photoId, { pendingStorageDeletion: true, archivedAt: Date.now() }));
  expect(await f.t.action(internal.storageDeletion.deletePhoto, { photoId, dryRun: false })).toMatchObject({ blocked: true, deleted: false });
  expect(storage.deletes).toEqual([]);
});

it("a generated PUT intent remains charged if its completion mutation is lost", async () => {
  const f = await fixture(); const { done } = await f.upload();
  const photoId = done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">;
  const before = (await f.summary()).usedBytes!;
  await f.t.mutation(internal.photos.prepareStoredDerivative, { photoId, storageKey: "synthetic-lost-completion", bytes: 70 });
  expect((await f.summary()).usedBytes).toBe(before + 70);
  const row = await f.t.run(ctx => ctx.db.query("generatedObjects").withIndex("by_key", q => q.eq("storageKey", "synthetic-lost-completion")).unique());
  expect(row).toMatchObject({ state: "pending", bytes: 70, ownerId: f.owner });
  let cursor: string | null = null, total = 0;
  for (;;) {
    const page: { bytes: number; pendingBytes: number; cursor: string; isDone: boolean } = await f.t.query(internal.usageLimits.metadataPage, { ownerId: f.owner, cursor });
    total += page.pendingBytes;
    if (page.isDone) break; cursor = page.cursor;
  }
  expect(total).toBe(70);
});

it("a counter cannot be backfilled across a partially completed physical delete", async () => {
  const f = await fixture(); const { done } = await f.upload();
  const photoId = done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">;
  await f.t.run(ctx => ctx.db.patch(photoId, { pendingStorageDeletion: true, archivedAt: Date.now() }));
  await f.t.mutation(internal.storageDeletion.prepare, { photoId });
  const snapshot = await f.t.mutation(internal.usageLimits.beginRecountPage, { ownerId: f.owner });
  expect(await f.t.mutation(internal.usageLimits.finishRecountPage, { ownerId: f.owner, ...snapshot, nextCursor: "end", bytes: 0, done: true })).toMatchObject({ done: false, restarted: true });
});

it("settings caps apply through the begin door even with enforcement off and prose stays readable", async () => {
  const f = await fixture({ mode: "off" });
  await f.t.run(ctx => ctx.db.patch(f.settings, { maxFileBytes: { image: png.byteLength - 1 } }));
  await expect(f.person.action(api.photos.initUpload, f.beginArgs("too-big"))).rejects.toMatchObject({ data: expect.stringContaining("[FILE_TOO_LARGE]") });
  const internalBegin = await f.t.action(internal.photos.initUploadForActor, { ...f.beginArgs("too-big"), apiActor: { ...f.actor, apiKeyId: "mcp-oauth", oauthCaller: { subject: "synthetic-owner" } } });
  expect(internalBegin.refusal).toMatchObject({ code: "FILE_TOO_LARGE", max: png.byteLength - 1 });
});

it("every accepted settings field receives its own audit row and unedited tables stay inherited", async () => {
  const f = await fixture();
  await f.admin.mutation(api.usageLimits.adminSetLimits, { limits: { planStoredBytes: { free: 5000 }, maxFileBytes: { image: 500 }, uploadsPerDay: 100 }, enforcement: "warn", reason: "Synthetic settings" });
  const audit = await f.t.run(ctx => ctx.db.query("usageLimitAudit").collect());
  expect(new Set(audit.map(row => row.field))).toEqual(new Set(["planStoredBytes", "maxFileBytes", "uploadsPerDay", "enforcement"]));
  await f.admin.mutation(api.usageLimits.adminSetLimits, { limits: { uploadsPerHour: 10 }, reason: "Only one setting" });
  expect((await f.t.run(ctx => ctx.db.get(f.settings)))?.planStoredBytes).toEqual({ free: 5000, pro: 100000 });
});

it("a backfill cannot record completion while any owner is uncounted", async () => {
  const f = await fixture({ backfilled: false });
  const run = await f.t.mutation(internal.usageRecount.start, { dryRun: false });
  await f.t.run(async ctx => {
    const { emptyCounters } = await import("../../convex/lib/usageLimits/core");
    await ctx.db.insert("usageCounters", { ownerId: "synthetic-unattributed-owner", ...emptyCounters(Date.now()), ready: false, revision: 0, updatedAt: Date.now() });
  });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.t.query(internal.usageRecount.status, { runId: run })).toMatchObject({ status: "blocked" });
  expect(await f.t.run(ctx => ctx.db.get(f.settings))).not.toHaveProperty("backfillCompletedAt");
});

it("accepted image generation is counted without upload rate charges or editable file-cap checks", async () => {
  const f = await fixture(); const { done } = await f.upload();
  const before = await f.t.run(ctx => ctx.db.query("usageCounters").first());
  await f.t.run(ctx => ctx.db.patch(f.settings, { enforcement: "off", maxFileBytes: { image: 0 } }));
  await f.t.mutation(internal.photos.prepareStoredDerivative, { photoId: done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">, storageKey: "synthetic-copy-over-file-cap", bytes: 100 });
  const after = await f.t.run(ctx => ctx.db.query("usageCounters").first());
  expect(after?.storedBytes).toBe(before!.storedBytes + 100); expect(after?.hourUploads).toBe(before?.hourUploads); expect(after?.dayUploads).toBe(before?.dayUploads); expect(after?.inFlight).toBe(before?.inFlight);
});

it("administrator plan resolution uses the existing Convex-side administrator rules", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch(f.owner, { appRole: "admin" }));
  expect(await f.summary()).toMatchObject({ plan: "pro" });
});

it("a released upload can reopen the same operation after cleanup without double-counting the attempt", async () => {
  const f = await fixture();
  const id = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("retryable", 20));
  await f.t.run(ctx => ctx.db.patch(id, { status: "failed", expiresAt: 1 }));
  expect(await f.t.action(internal.storageDeletion.deleteSession, { sessionId: id, dryRun: false })).toMatchObject({ deleted: true });
  const again = await f.person.mutation(internal.photos.createUploadSession, { ...f.sessionArgs("retryable", 20), originalStorageKey: "new-key-after-cleanup" });
  expect(again).toBe(id);
  const counters = await f.t.run(ctx => ctx.db.query("usageCounters").first());
  expect(counters).toMatchObject({ reservedBytes: 20, dayUploads: 1 });
});

it("remote fetch holds the declared size or one byte for an unknown length, never the transport ceiling", async () => {
  const f = await fixture();
  const first = await f.t.mutation(internal.usageLimits.reserveFetch, { householdId: f.householdId, key: "synthetic-fetch-known", bytes: 10 });
  expect((await f.summary()).usedBytes).toBe(10);
  await f.t.mutation(internal.usageLimits.releaseFetch, { id: first.reservationId! });
  const unknown = await f.t.mutation(internal.usageLimits.reserveFetch, { householdId: f.householdId, key: "synthetic-fetch-unknown", bytes: 1 });
  expect((await f.summary()).usedBytes).toBe(1);
  await f.t.mutation(internal.usageLimits.finishFetch, { householdId: f.householdId, reservationId: unknown.reservationId!, bytes: 50 });
  expect((await f.summary()).usedBytes).toBe(50);
  expect((await f.t.run(ctx => ctx.db.query("usageCounters").first()))?.dayUploads).toBe(2);
});

it("raising an image cap changes the browser begin policy rather than hitting the old default first", async () => {
  const f = await fixture({ cap: 100 * 1024 * 1024 });
  await f.t.run(ctx => ctx.db.patch(f.settings, { maxFileBytes: { image: 40 * 1024 * 1024 } }));
  const begin = await f.person.action(api.photos.initUpload, f.beginArgs("raised-policy", 26 * 1024 * 1024));
  expect(begin.uploadSessionId).toBeTruthy(); expect((await f.summary()).usedBytes).toBe(26 * 1024 * 1024);
});

it("batch hourly/in-flight checks occur before any reservation is applied", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch(f.settings, { uploadsPerHour: 1 }));
  const result = await f.person.mutation(internal.photos.tryCreateUploadBatch, { files: [f.sessionArgs("hour-one", 20), f.sessionArgs("hour-two", 20)], requestBytes: 50 });
  expect(result.refusal).toMatchObject({ code: "USAGE_LIMIT_REACHED", limit: "uploadsPerHour", used: 0, requested: 2 });
  expect(await f.t.run(ctx => ctx.db.query("photoUploadSessions").collect())).toEqual([]);
  expect((await f.summary()).usedBytes).toBe(0);
});

it("only refusal results bypass idempotency; a normal record with the same code remains cached", async () => {
  const f = await fixture(); const key = await f.key();
  const base = { householdId: f.householdId, apiKeyId: key.id, requestHash: "synthetic-request", status: 201 };
  await f.t.mutation(internal.restApi.storeIdempotency, { ...base, idempotencyKey: "normal", response: { data: { code: "FILE_TOO_LARGE" } } });
  await f.t.mutation(internal.restApi.storeIdempotency, { ...base, idempotencyKey: "refusal", response: { data: { results: [{ ok: false, code: "FILE_TOO_LARGE", error: "Synthetic file refusal" }] } } });
  expect((await f.t.run(ctx => ctx.db.query("apiIdempotencyKeys").collect())).map(row => row.idempotencyKey)).toEqual(["normal"]);
});

it("unknown object sizes are reported per owner and prevent the backfill stamp", async () => {
  const f = await fixture(); const { key } = await f.upload();
  await f.t.run(ctx => ctx.db.patch(f.settings, { backfillCompletedAt: undefined }));
  storage.failHead.add(key);
  const runId = await f.t.mutation(internal.usageRecount.start, { dryRun: false });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const run = await f.t.query(internal.usageRecount.status, { runId });
  expect(run).toMatchObject({ status: "blocked", unknownSizeFiles: 1 });
  expect(await f.t.run(ctx => ctx.db.get(f.settings))).not.toHaveProperty("backfillCompletedAt");
});

it("missing objects are reported and do not stop the indexed recount", async () => {
  const f = await fixture(); const { key } = await f.upload(); storage.objects.delete(key);
  const runId = await f.t.mutation(internal.usageRecount.start, { dryRun: true });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.t.query(internal.usageRecount.status, { runId })).toMatchObject({ status: "done", missingObjects: 1, unknownSizeFiles: 0 });
});

it("unattributed media prevents completion and is reported instead of disappearing", async () => {
  const f = await fixture(); const { done } = await f.upload();
  await f.t.run(async ctx => { await ctx.db.patch(f.settings, { backfillCompletedAt: undefined }); await ctx.db.delete(f.householdId); await ctx.db.delete(f.owner); });
  const runId = await f.t.mutation(internal.usageRecount.start, { dryRun: false });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.t.query(internal.usageRecount.status, { runId })).toMatchObject({ status: "blocked", unattributedFiles: expect.any(Number) });
  expect((await f.t.query(internal.usageRecount.status, { runId }))!.unattributedFiles).toBeGreaterThan(0);
  expect(await f.t.run(ctx => ctx.db.get(done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">))).not.toBeNull();
  expect(await f.t.run(ctx => ctx.db.get(f.settings))).not.toHaveProperty("backfillCompletedAt");
});

it("an older version revealed by deletion keeps the tombstone and charge", async () => {
  const f = await fixture(); const { done } = await f.upload();
  const photoId = done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">;
  await f.t.run(ctx => ctx.db.patch(photoId, { pendingStorageDeletion: true, archivedAt: Date.now() }));
  const before = (await f.summary()).usedBytes;
  storage.revealOlder = true;
  expect(await f.t.action(internal.storageDeletion.deletePhoto, { photoId, dryRun: false })).toMatchObject({ deleted: false, blocked: true });
  expect((await f.summary()).usedBytes).toBe(before);
  expect(await f.t.run(ctx => ctx.db.get(photoId))).not.toBeNull();
});

it("reserving a session schedules its expiry before the surrounding action can fail", async () => {
  const f = await fixture();
  const id = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("scheduled"));
  const jobs = await f.t.run(ctx => ctx.db.system.query("_scheduled_functions").collect());
  expect(jobs.some(job => job.name.includes("expireReservations"))).toBe(true);
  expect(jobs.some(job => job.name.includes("runSessionDeletion") && (job.args[0] as { sessionId?: string }).sessionId === id)).toBe(true);
});

it("moving a generated intent into photo references bumps the counter revision without charging twice", async () => {
  const f = await fixture(); const { done } = await f.upload();
  const photoId = done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">;
  await f.t.mutation(internal.photos.prepareStoredDerivative, { photoId, storageKey: "synthetic-recovered-copy", bytes: 80 });
  const before = (await f.t.run(ctx => ctx.db.query("usageCounters").first()))!;
  await f.t.mutation(internal.photos.recordStoredDerivative, { photoId, storageKey: "synthetic-recovered-copy", bytes: 80, variant: "thumb" });
  const after = (await f.t.run(ctx => ctx.db.query("usageCounters").first()))!;
  expect(after.storedBytes).toBe(before.storedBytes); expect(after.revision).toBeGreaterThan(before.revision);
});

it("closing a slot releases the reservation but keeps its cleanup charge, and retry restores without another upload charge", async () => {
  const f = await fixture();
  const id = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("closed", 20));
  await f.person.mutation(api.photos.cancelUploadSession, { householdId: f.householdId, moveId: f.moveId, uploadSessionId: id });
  const closed = await f.t.run(ctx => ctx.db.get(id));
  expect(closed).toMatchObject({ quarantinedBytes: 20, status: "cancelled" });
  expect((await f.t.run(ctx => ctx.db.get(closed!.usageReservationId!)))?.status).toBe("released");
  expect((await f.summary()).usedBytes).toBe(20);
  await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("closed", 20));
  expect(await f.t.run(ctx => ctx.db.query("usageCounters").first())).toMatchObject({ storedBytes: 0, reservedBytes: 20, dayUploads: 1, dayUploadBytes: 20 });
});

it("expiry skips a processing lease and still releases another owner's expired unattached hold", async () => {
  const f = await fixture(); const id = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("processing", 20));
  await f.t.run(ctx => ctx.db.patch(id, { expiresAt: 1, processingUntil: Date.now() + 10000 }));
  const active = (await f.t.run(ctx => ctx.db.get(id)))!;
  await f.t.run(ctx => ctx.db.patch(active.usageReservationId!, { expiresAt: 1 }));
  const report = await f.t.mutation(internal.usageLimits.expireReservations, {});
  expect(report.processing).toBe(1);
  expect((await f.t.run(ctx => ctx.db.get(active.usageReservationId!)))?.status).toBe("reserved");
});

it("the real hosted MCP route preserves a refusal through the real REST mapper and keeps the same key usable", async () => {
  const f = await fixture({ cap: 1 }); const credential = await f.key();
  vi.stubEnv("CONVEX_HTTP_ACTIONS_URL", "https://synthetic-backend.invalid");
  const { POST } = await import("../../src/app/api/mcp/route");
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(url.hostname).toBe("synthetic-backend.invalid");
    const headers = new Headers(init?.headers);
    const response = await f.t.action(internal.restApiActions.handle, { method: (init?.method ?? "GET") as "GET" | "POST", path: url.pathname.replace(/^\/api\/v1\//, ""), query: Object.fromEntries(url.searchParams), authorization: headers.get("authorization") ?? undefined, idempotencyKey: headers.get("idempotency-key") ?? undefined, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Response.json(response.body, { status: response.status });
  });
  const call = async (name: string, args: unknown) => {
    const response = await POST(new Request("https://synthetic-web.invalid/api/mcp", { method: "POST", headers: { authorization: `Bearer ${credential.raw}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }));
    const text = await response.text(); return JSON.parse(text.startsWith("event:") || text.startsWith("data:") ? text.split("\n").filter(line => line.startsWith("data:")).at(-1)!.slice(5).trim() : text).result;
  };
  const refusal = await call("start_photo_upload", { moveId: f.moveId, mimeType: "image/png", sizeBytes: png.byteLength, operationId: "hosted-refusal" });
  expect(refusal.isError).toBe(true); expect(refusal.structuredContent).toMatchObject({ code: "USAGE_LIMIT_REACHED", requested: png.byteLength });
  expect(refusal.content[0].text).toBe(mcpLimitText(refusal.structuredContent));
  expect(JSON.stringify(refusal)).not.toMatch(/INTERNAL_ERROR|Server Error/);
  expect((await call("get_api_context", {})).isError).not.toBe(true);
  const activity = await f.person.query(api.audit.listForHousehold, { householdId: f.householdId });
  expect(activity.some(row => row.action === "upload.refused" && row.actorType === "agent")).toBe(true);
});

it("turning enforcement on through the real admin mutation refuses the next public upload", async () => {
  const f = await fixture({ cap: 1, mode: "off" });
  await f.admin.mutation(api.usageLimits.adminSetLimits, { limits: {}, enforcement: "on", reason: "Synthetic enabled" });
  const failure = await f.person.action(api.photos.initUpload, f.beginArgs("switched-on")).catch(error => error);
  expect(failure.data).toMatch(/\[USAGE_LIMIT_REACHED\]$/);
  expect(storage.puts).toEqual([]);
});

it.each(["audio/mpeg", "video/mp4"])("%s uses the same charged deletion ledger and regains room", async mimeType => {
  const f = await fixture({ cap: 20 });
  const begin = await f.person.action(api.photos.initUpload, { ...f.beginArgs(`media-${mimeType}`, 20), mimeType });
  const key = decodeURIComponent(new URL(begin.uploadUrl).pathname.slice(1)); storage.objects.set(key, { bytes: new Uint8Array(20), mime: mimeType, version: "media-version" });
  const done = await f.person.action(api.photos.finalizeUpload, { householdId: f.householdId, moveId: f.moveId, uploadSessionId: begin.uploadSessionId as import("../../convex/_generated/dataModel").Id<"photoUploadSessions"> });
  const photoId = done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">;
  expect((await f.summary()).usedBytes).toBe(20);
  await f.t.run(ctx => ctx.db.patch(photoId, { pendingStorageDeletion: true, archivedAt: Date.now() }));
  vi.setSystemTime(begin.expiresAt + 1);
  expect(await f.t.action(internal.storageDeletion.deletePhoto, { photoId, dryRun: false })).toMatchObject({ deleted: true });
  expect((await f.summary()).usedBytes).toBe(0);
  await f.person.action(api.photos.initUpload, { ...f.beginArgs(`next-${mimeType}`, 20), mimeType });
});

it.each(["thumb", "card", "detail", "full"] as const)("a photo's %s reference protects an otherwise deletable object", async variant => {
  const f = await fixture(); const first = await f.upload("first"), second = await f.upload("second");
  const firstId = first.done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">, secondId = second.done.photoId as typeof firstId;
  await f.t.run(async ctx => { await ctx.db.patch(firstId, { pendingStorageDeletion: true, archivedAt: Date.now() }); const photo = (await ctx.db.get(secondId))!; await ctx.db.patch(secondId, { derivativeRefs: { ...photo.derivativeRefs, [variant]: first.key } }); });
  expect(await f.t.action(internal.storageDeletion.deletePhoto, { photoId: firstId, dryRun: false })).toMatchObject({ blocked: true });
  expect(storage.objects.has(first.key)).toBe(true);
});

it("an authorized original and a pending generated intent each protect a retained photo", async () => {
  const f = await fixture(); const { done, key } = await f.upload();
  const photoId = done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">;
  const session = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("legacy-ref"));
  await f.t.run(async ctx => { await ctx.db.patch(session, { objectClaimsRegistered: undefined, originalStorageKey: key }); await ctx.db.patch(photoId, { pendingStorageDeletion: true, archivedAt: Date.now() }); });
  expect(await f.t.action(internal.storageDeletion.deletePhoto, { photoId, dryRun: false })).toMatchObject({ blocked: true });
  await f.t.run(async ctx => { await ctx.db.patch(session, { status: "failed" }); await ctx.db.insert("generatedObjects", { ownerId: f.owner, photoId, storageKey: key, bucket: "synthetic", bytes: png.byteLength, state: "pending", createdAt: Date.now() }); });
  expect(await f.t.action(internal.storageDeletion.deletePhoto, { photoId, dryRun: false })).toMatchObject({ blocked: true }); expect(storage.objects.has(key)).toBe(true);
});

it("new operations cannot attach an object already registered to another record", async () => {
  const f = await fixture(); const { key } = await f.upload();
  const result = await f.person.mutation(internal.photos.tryCreateUploadSession, { ...f.sessionArgs("duplicate-object"), originalStorageKey: key });
  expect(result.refusal).toMatchObject({ code: "OPERATION_CONFLICT" });
});

it("size repair verifies legacy originals and copies, and a missing object counts as zero in backfill", async () => {
  const f = await fixture(); const { done, key } = await f.upload(); const photoId = done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">;
  const expected = [...storage.objects.values()].reduce((sum, row) => sum + row.bytes.byteLength, 0);
  await f.t.run(ctx => ctx.db.patch(photoId, { storedBytes: undefined, derivativeSizes: undefined }));
  const dry = await f.t.action(internal.storageSizeRepair.page, {}); expect(dry.repaired).toBe(0);
  expect((await f.t.run(ctx => ctx.db.get(photoId)))?.storedBytes).toBeUndefined();
  expect((await f.t.action(internal.storageSizeRepair.page, { dryRun: false })).repaired).toBe(1);
  expect(await f.t.run(ctx => ctx.db.get(photoId))).toMatchObject({ storedBytes: expected, sizeBytes: png.byteLength, derivativeSizes: { thumb: expect.any(Number), card: expect.any(Number), detail: expect.any(Number), full: expect.any(Number) } });
  storage.objects.delete(key); await f.t.run(ctx => ctx.db.patch(f.settings, { backfillCompletedAt: undefined }));
  const runId = await f.t.mutation(internal.usageRecount.start, { dryRun: false }); await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.t.query(internal.usageRecount.status, { runId })).toMatchObject({ status: "done", missingObjects: 1, unknownSizeFiles: 0 });
  expect((await f.summary()).usedBytes).toBe(expected - png.byteLength); expect((await f.t.run(ctx => ctx.db.get(f.settings)))?.backfillCompletedAt).toBeTypeOf("number");
});

it("legacy abandoned objects are repaired and settled without blocking the backfill forever", async () => {
  const f = await fixture({ backfilled: false }); const session = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("legacy-abandoned", 20));
  await f.t.run(async ctx => { const row = (await ctx.db.get(session))!; await ctx.db.delete(row.usageReservationId!); await ctx.db.patch(session, { usageReservationId: undefined, status: "failed", expiresAt: 1 }); });
  storage.objects.set("legacy-abandoned-original", { bytes: new Uint8Array(20), mime: "image/png", version: "legacy-version" });
  const runId = await f.t.mutation(internal.usageRecount.start, { dryRun: false }); await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.t.query(internal.usageRecount.status, { runId })).toMatchObject({ status: "done" });
  expect(await f.t.run(ctx => ctx.db.get(session))).toMatchObject({ quarantinedBytes: 20 });
});

it("a forged ready counter and an account first uploading mid-run cannot stamp backfill", async () => {
  const f = await fixture({ backfilled: false }); await f.upload();
  const runId = await f.t.mutation(internal.usageRecount.start, { dryRun: false });
  await f.t.run(async ctx => { await ctx.db.patch(runId, { phase: 1 }); const counter = (await ctx.db.query("usageCounters").withIndex("by_owner", q => q.eq("ownerId", f.owner)).unique())!; await ctx.db.patch(counter._id, { ready: true, storedBytes: 0 }); });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const run = await f.t.query(internal.usageRecount.status, { runId });
  expect(run).toMatchObject({ status: "blocked", counterMismatches: expect.any(Number) }); expect(run!.counterMismatches).toBeGreaterThan(0); expect(run!.message).toContain("start a new run");
  expect((await f.t.run(ctx => ctx.db.get(f.settings)))?.backfillCompletedAt).toBeUndefined();
});

it("an administrator's personal policy does not change the site audit before-value or display", async () => {
  const f = await fixture();
  await f.admin.mutation(api.usageLimits.adminSetLimits, { ownerId: f.adminId, limits: { uploadsPerDay: 1, maxFileBytes: { image: 1 } }, reason: "Synthetic personal" });
  const before = await f.admin.query(api.usageLimits.adminOverview, {});
  expect(before.effectiveSite.maxFileBytes.image).toBe(1000000);
  await f.admin.mutation(api.usageLimits.adminSetLimits, { limits: { uploadsPerDay: 2000 }, reason: "Synthetic site" });
  const events = await f.t.run(ctx => ctx.db.query("usageLimitAudit").collect());
  expect(events.find(event => event.target === "site" && event.field === "uploadsPerDay")?.before).toBe(JSON.stringify(before.effectiveSite.uploadsPerDay));
});

it("every public upload stage rejects an AI identity carrying a native-looking session", async () => {
  const f = await fixture(); const { begin, done } = await f.upload();
  const ai = f.t.withIdentity({ ...nativeWebsiteIdentity("synthetic-owner"), client_id: "synthetic-ai" });
  await expect(ai.action(api.photos.initUpload, f.beginArgs("ai-denied"))).rejects.toThrow(/only reduce/);
  await expect(ai.action(api.photos.finalizeUpload, { householdId: f.householdId, moveId: f.moveId, uploadSessionId: begin.uploadSessionId as import("../../convex/_generated/dataModel").Id<"photoUploadSessions"> })).rejects.toThrow(/only reduce/);
  await expect(ai.mutation(api.photos.cancelUploadSession, { householdId: f.householdId, moveId: f.moveId, uploadSessionId: begin.uploadSessionId as import("../../convex/_generated/dataModel").Id<"photoUploadSessions"> })).rejects.toThrow(/only reduce/);
  await expect(ai.mutation(api.photos.updateEvidence, { householdId: f.householdId, moveId: f.moveId, photoId: done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">, caption: "Denied" })).rejects.toThrow(/only reduce/);
});

it("one invalid expired hold is reported without starving the next owner's hold", async () => {
  const f = await fixture();
  const hold = await f.t.mutation(internal.usageLimits.reserveFetch, { householdId: f.householdId, key: "standalone", bytes: 20 });
  await f.t.run(async ctx => { await ctx.db.patch(hold.reservationId!, { expiresAt: 1 }); await ctx.db.insert("uploadReservations", { ownerId: "synthetic-invalid-user", key: "invalid", bytes: 1, day: "synthetic", status: "reserved", expiresAt: 0 }); });
  const report = await f.t.mutation(internal.usageLimits.expireReservations, {}); expect(report).toMatchObject({ closed: 1, skipped: 1 });
  expect((await f.summary()).usedBytes).toBe(0);
});

it("copies of an accepted original remain counted and never use upload-frequency budgets", async () => {
  const f = await fixture(); const { done } = await f.upload(); const photoId = done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">;
  const before = (await f.t.run(ctx => ctx.db.query("usageCounters").first()))!;
  await f.t.run(ctx => ctx.db.patch(f.settings, { planStoredBytes: { free: before.storedBytes, pro: before.storedBytes }, uploadsPerHour: 0 }));
  expect(await f.t.mutation(internal.photos.prepareStoredDerivative, { photoId, storageKey: "accepted-original-copy", bytes: 10 })).toBeNull();
  const after = (await f.t.run(ctx => ctx.db.get(before._id)))!; expect(after.hourUploads).toBe(before.hourUploads); expect(after.inFlight).toBe(before.inFlight); expect(after.storedBytes).toBe(before.storedBytes + 10);
  await expect(f.person.action(api.photos.initUpload, f.beginArgs("later-file"))).rejects.toMatchObject({ data: expect.stringContaining("[USAGE_LIMIT_REACHED]") });
});

it("export expiry schedules separate transactions, audits removal, and leaves a writer alone", async () => {
  const f = await fixture();
  const job = await f.person.mutation(api.accountPrivacy.createAccountExport, {});
  const writing = await f.t.run(async ctx => { await ctx.db.patch(job.exportJobId, { expiresAt: 1 }); return ctx.db.insert("exportJobs", { householdId: f.householdId, moveId: f.moveId, type: "inventory", format: "csv", status: "processing", version: 1, createdByUserId: f.owner, createdAt: 1, updatedAt: 1, expiresAt: 1 }); });
  expect(await f.t.mutation(internal.exportCleanup.expireArtifacts, {})).toEqual({ scheduled: 1 });
  expect((await f.t.run(ctx => ctx.db.get(job.exportJobId)))?.status).toBe("completed");
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await f.t.run(ctx => ctx.db.get(writing)))?.status).toBe("processing");
  expect((await f.t.run(ctx => ctx.db.query("auditLogs").collect())).some(event => event.action === "export.artifact_expired" && event.objectId === job.exportJobId)).toBe(true);
});

it.each(["application/json", "text/event-stream"])("the persisted gateway envelope preserves the OAuth native refusal as %s", async contentType => {
  const f = await fixture({ cap: 1 });
  await f.t.mutation(internal.aiGrants.touchLegacyConnection, { subject: "synthetic-owner", clientId: "synthetic-ai" });
  while (!(await f.t.run(ctx => ctx.db.query("aiAccessOwners").withIndex("by_owner", q => q.eq("ownerUserId", f.owner)).unique()))?.bootstrapped) await f.t.mutation(internal.aiGrants.continueBootstrap, { ownerUserId: f.owner });
  const { McpGateway } = await import("convex-mcp-gateway"), { components } = await import("../../convex/_generated/api"), { legacyUploadResponse } = await import("../../convex/lib/legacyUploadResponse");
  const gateway = new McpGateway(components.mcpGateway);
  const args = { householdId: f.householdId, moveId: f.moveId, operationId: "gateway-refusal", images: [{ base64: Buffer.from(png).toString("base64"), mimeType: "image/png" }] };
  const caller = { subject: "synthetic-owner", claims: { client_id: "synthetic-ai" } };
  // The external component's transport is stubbed. Its dispatch crosses our
  // own hop through the real action and real refusal mapper above.
  let componentQueries = 0;
  const ctx = { runQuery: async () => ++componentQueries === 1 ? { identitySubject: caller.subject, expiresAt: Date.now() + 100000 } : { name: "add_images", kind: "action", identityArg: "caller" }, runMutation: async () => undefined, runAction: async () => ({ ok: true, data: await f.t.action(internal.mcpToolsImages.addImages, { ...args, caller }) }) };
  const request = new Request("https://synthetic-web.invalid/mcp/legacy", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer synthetic-only", accept: "application/json, text/event-stream", "mcp-session-id": "synthetic-session", "mcp-protocol-version": "2025-06-18" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "add_images", arguments: args } }) });
  const raw = await gateway.handleMcpRequest(ctx as never, request, { requireAuth: true, authorize: async () => ({ allowed: true }), resolveIdentity: async () => caller });
  const envelope = await raw.json(); expect(envelope.result, JSON.stringify(envelope)).toBeDefined(); expect(envelope.result.isError).toBe(false); // Upstream package's exact successful-data envelope.
  const body = contentType === "text/event-stream" ? `event: message\ndata: ${JSON.stringify(envelope)}\n\n` : JSON.stringify(envelope);
  const response = await legacyUploadResponse(new Response(body, { headers: { "content-type": contentType } }));
  const text = await response.text(); const native = JSON.parse(contentType === "text/event-stream" ? text.split("\n").find(line => line.startsWith("data:"))!.slice(5) : text).result;
  expect(native.isError).toBe(true); expect(native.structuredContent.code).toBe("USAGE_LIMIT_REACHED"); expect(native.content[0].text).toBe(mcpLimitText(native.structuredContent));
});

it("a first upload or storage change during final verification blocks the marker with a restart instruction", async () => {
  const f = await fixture({ backfilled: false }); const runId = await f.t.mutation(internal.usageRecount.start, { dryRun: false });
  // Pause a real run at verification, then let a separately signed-in account
  // make its first upload while the old run's proof is in progress.
  await f.t.run(ctx => ctx.db.patch(runId, { phase: 1 }));
  await f.t.mutation(internal.usageRecount.verifyPage, { runId });
  const arrived = await f.t.run(async ctx => { const user = await ctx.db.insert("users", { clerkUserId: "synthetic-new-mid-run", appRole: "member", status: "active", createdAt: 1, updatedAt: 1, lastSeenAt: 1 }); const householdId = await ctx.db.insert("households", { ownerUserId: user, createdByUserId: user, name: "New synthetic", createdAt: 1, updatedAt: 1 }); await ctx.db.insert("householdMemberships", { householdId, userId: user, role: "owner", status: "active", createdAt: 1, updatedAt: 1 }); const moveId = await ctx.db.insert("moves", { householdId, title: "New synthetic", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: user, createdAt: 1, updatedAt: 1 }); return { householdId, moveId }; });
  const newcomer = f.t.withIdentity(nativeWebsiteIdentity("synthetic-new-mid-run"));
  const begin = await newcomer.action(api.photos.initUpload, { ...arrived, mimeType: "image/png", sizeBytes: png.byteLength, operationId: "arrived-during-proof" });
  storage.objects.set(decodeURIComponent(new URL(begin.uploadUrl).pathname.slice(1)), { bytes: png, mime: "image/png", version: "newcomer-version" });
  await newcomer.action(api.photos.finalizeUpload, { ...arrived, uploadSessionId: begin.uploadSessionId as import("../../convex/_generated/dataModel").Id<"photoUploadSessions">, width: 2, height: 2 });
  await f.t.mutation(internal.usageRecount.verifyPage, { runId });
  expect(await f.t.query(internal.usageRecount.status, { runId })).toMatchObject({ status: "blocked", message: expect.stringContaining("start a new run") });
  expect((await f.t.run(ctx => ctx.db.get(f.settings)))?.backfillCompletedAt).toBeUndefined();
});

it("weekly read-only reconciliation records exact observed drift without correcting the counter", async () => {
  const f = await fixture(); await f.upload();
  const counter = (await f.t.run(ctx => ctx.db.query("usageCounters").first()))!;
  await f.t.run(ctx => ctx.db.patch(counter._id, { storedBytes: counter.storedBytes + 50 }));
  const runId = await f.t.mutation(internal.usageRecount.start, { dryRun: true }); await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const run = await f.t.query(internal.usageRecount.status, { runId }); expect(run!.counterMismatches).toBeGreaterThan(0);
  expect((await f.t.run(ctx => ctx.db.get(counter._id)))?.storedBytes).toBe(counter.storedBytes + 50);
  const proof = await f.t.run(ctx => ctx.db.query("usageRecountProofs").withIndex("by_run_owner", q => q.eq("runId", runId).eq("ownerId", f.owner)).unique()); expect(proof?.observedBytes).toBe(counter.storedBytes);
});

it("billing keeps the legacy file sum and labels counting instead of inventing a zero", async () => {
  const f = await fixture({ backfilled: false }); await f.upload();
  const billing = await f.person.query(api.billing.statusForHousehold, { householdId: f.householdId });
  expect(billing.dimensions.find(row => row.dimension === "photoStorageBytes")).toMatchObject({ counting: true, used: png.byteLength, limit: 10000 });
  expect(billing.profile).toBeNull(); expect(billing.effectiveTier).toBe("launch");
});

it("purging an open session frees its slot immediately and keeps its declared bytes charged", async () => {
  const f = await fixture(); const sessionId = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("purge-open", 20));
  await f.person.mutation(api.moves.purge, { householdId: f.householdId, moveId: f.moveId, confirmTitle: "Synthetic" });
  const session = (await f.t.run(ctx => ctx.db.get(sessionId)))!;
  expect(session).toMatchObject({ status: "cancelled", quarantinedBytes: 20 }); expect((await f.t.run(ctx => ctx.db.get(session.usageReservationId!)))?.status).toBe("released");
  expect((await f.summary()).usedBytes).toBe(20);
});

it("a second pending operation cannot claim another upload's original or derivative", async () => {
  const f = await fixture(); const first = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("first-pending", 20));
  for (const field of ["original", "copy"]) {
    const result = await f.person.mutation(internal.photos.tryCreateUploadSession, { ...f.sessionArgs(`second-${field}`, 20), ...(field === "original" ? { originalStorageKey: "first-pending-original" } : { derivativeUploads: [{ variant: "thumb" as const, bucket: "synthetic", storageKey: "first-pending-original", expectedMimeType: "image/png", expectedSizeBytes: 20, width: 2, height: 2 }] }) });
    expect(result.refusal).toMatchObject({ code: "OPERATION_CONFLICT" });
  }
  expect((await f.t.run(ctx => ctx.db.get(first)))?.status).toBe("authorized"); expect((await f.summary()).usedBytes).toBe(20);
});

it("a new indexed pending object claim protects a retained object without a legacy session scan", async () => {
  const f = await fixture(); const { done, key } = await f.upload(); const photoId = done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">;
  const session = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("indexed-claim"));
  await f.t.run(async ctx => { await ctx.db.insert("uploadObjectClaims", { sessionId: session, storageKey: key }); await ctx.db.patch(photoId, { pendingStorageDeletion: true, archivedAt: Date.now() }); });
  expect(await f.t.action(internal.storageDeletion.deletePhoto, { photoId, dryRun: false })).toMatchObject({ blocked: true }); expect(storage.objects.has(key)).toBe(true);
});

it("two batch items sharing one object keep the conflict per-item before any reservation is written", async () => {
  const f = await fixture();
  const batch = await f.person.mutation(internal.photos.tryCreateUploadBatch, { files: [f.sessionArgs("first-batch-object", 20), { ...f.sessionArgs("second-batch-object", 20), originalStorageKey: "first-batch-object-original" }], requestBytes: 50 });
  expect(batch.results?.[0].uploadSessionId).toBeTruthy(); expect(batch.results?.[1]).toMatchObject({ code: "OPERATION_CONFLICT" });
  expect((await f.summary()).usedBytes).toBe(20); expect(await f.t.run(ctx => ctx.db.query("uploadReservations").collect())).toHaveLength(1);
});

it("a repeated operation within a batch is refused per-item before any later catch can preserve partial writes", async () => {
  const f = await fixture();
  const batch = await f.person.mutation(internal.photos.tryCreateUploadBatch, { files: [f.sessionArgs("same-batch-op", 20), { ...f.sessionArgs("same-batch-op", 21), originalStorageKey: "another-unused-key" }], requestBytes: 50 });
  expect(batch.refusal).toBeUndefined(); expect(batch.results?.[0].uploadSessionId).toBeTruthy(); expect(batch.results?.[1]).toMatchObject({ code: "OPERATION_CONFLICT" });
  expect(await f.t.run(ctx => ctx.db.query("uploadReservations").collect())).toHaveLength(1); expect((await f.summary()).usedBytes).toBe(20);
});

it("object-claim retirement, size repair, hard delete and confirmed removal each signal an in-progress whole-site proof", async () => {
  const f = await fixture(); const { done } = await f.upload(); const photoId = done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">;
  const revision = async () => (await f.t.run(ctx => ctx.db.get(f.settings)))?.storageRevision ?? 0;
  const item = await f.person.mutation(api.items.create, { householdId: f.householdId, moveId: f.moveId, name: "Synthetic removable" });
  await f.person.mutation(api.photos.updateEvidence, { householdId: f.householdId, moveId: f.moveId, photoId, itemId: item });
  let before = await revision();
  await f.t.action(internal.storageSizeRepair.page, { dryRun: false }); expect(await revision()).toBeGreaterThan(before);
  before = await revision();
  await f.t.mutation(internal.photos.prepareStoredDerivative, { photoId, storageKey: "recover-proof", bytes: 2 });
  const intent = (await f.t.run(ctx => ctx.db.query("generatedObjects").withIndex("by_key", q => q.eq("storageKey", "recover-proof")).unique()))!;
  await f.t.mutation(internal.storageDeletion.recoveredGenerated, { id: intent._id, exists: false }); expect(await revision()).toBeGreaterThan(before);
  before = await revision();
  await f.person.mutation(api.items.remove, { householdId: f.householdId, moveId: f.moveId, itemId: item }); expect(await revision()).toBeGreaterThan(before);
  before = await revision();
  await f.t.action(internal.storageDeletion.deletePhoto, { photoId, dryRun: false }); expect(await revision()).toBeGreaterThan(before);
});

it("foreign session and photo ids cannot change either owner's bytes in begin, finish, cancel or attach", async () => {
  const f = await fixture(); const local = await f.upload();
  const other = await f.t.run(async ctx => { const householdId = await ctx.db.insert("households", { ownerUserId: f.adminId, createdByUserId: f.adminId, name: "Other synthetic", createdAt: 1, updatedAt: 1 }); await ctx.db.insert("householdMemberships", { householdId, userId: f.adminId, role: "owner", status: "active", createdAt: 1, updatedAt: 1 }); const moveId = await ctx.db.insert("moves", { householdId, createdByUserId: f.adminId, title: "Other synthetic", type: "local", status: "planning", unitSystem: "imperial", createdAt: 1, updatedAt: 1 }); return { householdId, moveId }; });
  const foreign = await f.admin.action(api.photos.initUpload, { ...other, operationId: "foreign", mimeType: "image/png", sizeBytes: png.byteLength });
  const sessionId = foreign.uploadSessionId as import("../../convex/_generated/dataModel").Id<"photoUploadSessions">;
  const before = await f.t.run(ctx => ctx.db.query("usageCounters").collect());
  await expect(f.person.action(api.photos.initUpload, { ...other, operationId: "foreign-person", mimeType: "image/png", sizeBytes: png.byteLength })).rejects.toThrow(/permission|member|access|household/i);
  await expect(f.person.action(api.photos.finalizeUpload, { householdId: f.householdId, moveId: f.moveId, uploadSessionId: sessionId })).rejects.toThrow("Upload session is not active.");
  await f.person.mutation(api.photos.cancelUploadSession, { householdId: f.householdId, moveId: f.moveId, uploadSessionId: sessionId });
  await expect(f.admin.mutation(api.photos.updateEvidence, { ...other, photoId: local.done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">, caption: "Foreign denied" })).rejects.toMatchObject({ data: "Photo not found." });
  expect(await f.t.run(ctx => ctx.db.query("usageCounters").collect())).toEqual(before); expect((await f.t.run(ctx => ctx.db.get(sessionId)))?.status).toBe("authorized");
});

it("legacy presigned sessions keep their cleanup grace and remain charged until it passes", async () => {
  const f = await fixture(); const id = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("legacy-grace", 20));
  await f.person.mutation(api.photos.cancelUploadSession, { householdId: f.householdId, moveId: f.moveId, uploadSessionId: id });
  await f.t.run(ctx => ctx.db.patch(id, { objectClaimsRegistered: undefined, expiresAt: Date.now() - 1 }));
  storage.objects.set("legacy-grace-original", { bytes: new Uint8Array(20), mime: "image/png", version: "legacy-grace-version" });
  expect(await f.t.action(internal.storageDeletion.deleteSession, { sessionId: id, dryRun: false })).toMatchObject({ deleted: false }); expect((await f.summary()).usedBytes).toBe(20);
  vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000);
  expect(await f.t.action(internal.storageDeletion.deleteSession, { sessionId: id, dryRun: false })).toMatchObject({ deleted: true }); expect((await f.summary()).usedBytes).toBe(0);
});

it("both persisted administrators and the existing Convex email list receive Pro storage", async () => {
  const f = await fixture(); await f.t.run(ctx => ctx.db.patch(f.owner, { appRole: "admin" }));
  expect(await f.summary()).toMatchObject({ plan: "pro" });
  await f.t.run(ctx => ctx.db.patch(f.owner, { appRole: "member", email: "synthetic-admin@example.invalid" }));
  vi.stubEnv("ADMIN_EMAILS", "synthetic-admin@example.invalid");
  expect(await f.summary()).toMatchObject({ plan: "pro" });
});

it("old batch calls remain supported off, and enforcement requires a caller operation id before bytes move", async () => {
  const f = await fixture({ mode: "off" }); const key = await f.key(); const body = { moveId: f.moveId, images: [{ fileBase64: Buffer.from(png).toString("base64"), mimeType: "image/png" }] };
  const call = () => f.t.action(internal.restApiActions.handle, { method: "POST", path: "uploads/batch", authorization: `Bearer ${key.raw}`, query: {}, body });
  expect(await call()).toMatchObject({ status: 200, body: { data: { uploadedCount: 1 } } });
  const count = storage.puts.length;
  await f.admin.mutation(api.usageLimits.adminSetLimits, { limits: {}, enforcement: "on", reason: "Synthetic enabled" });
  expect(await call()).toMatchObject({ status: 400, body: { error: { code: "OPERATION_ID_REQUIRED" } } }); expect(storage.puts).toHaveLength(count);
});

it("never-stored declared bytes return at expiry without deleting anything, and the same session can reserve its full size again", async () => {
  const f = await fixture({ cap: 20 }); const id = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("never-stored", 20));
  await f.person.mutation(api.photos.cancelUploadSession, { householdId: f.householdId, moveId: f.moveId, uploadSessionId: id });
  const row = (await f.t.run(ctx => ctx.db.get(id)))!; vi.setSystemTime(row.expiresAt + 1);
  expect(await f.t.action(internal.storageDeletion.settleSession, { sessionId: id })).toEqual({ settled: true, unknown: 0 });
  expect((await f.summary()).usedBytes).toBe(0); expect(storage.deletes).toEqual([]);
  expect(await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("never-stored", 20))).toBe(id);
  expect((await f.summary()).usedBytes).toBe(20);
});

it("restoring a partially stored upload rechecks the missing bytes and holds the full declared size", async () => {
  const f = await fixture({ cap: 40 });
  const args = { ...f.sessionArgs("partial-stored", 20), derivativeUploads: [{ variant: "thumb" as const, bucket: "synthetic", storageKey: "partial-copy", expectedMimeType: "image/png", expectedSizeBytes: 20, width: 2, height: 2 }] };
  const id = await f.person.mutation(internal.photos.createUploadSession, args);
  storage.objects.set("partial-stored-original", { bytes: new Uint8Array(20), mime: "image/png", version: "partial-version" });
  await f.person.mutation(api.photos.cancelUploadSession, { householdId: f.householdId, moveId: f.moveId, uploadSessionId: id });
  vi.setSystemTime(args.expiresAt + 1); await f.t.action(internal.storageDeletion.settleSession, { sessionId: id }); expect((await f.summary()).usedBytes).toBe(20);
  await f.t.run(ctx => ctx.db.patch(f.settings, { planStoredBytes: { free: 30, pro: 30 } }));
  const blocked = await f.person.mutation(internal.photos.tryCreateUploadSession, { ...args, expiresAt: Date.now() + 900000 });
  expect(blocked.refusal).toMatchObject({ code: "USAGE_LIMIT_REACHED", requested: 20, remaining: 10 });
  await f.t.run(ctx => ctx.db.patch(f.settings, { planStoredBytes: { free: 40, pro: 40 } }));
  await f.person.mutation(internal.photos.createUploadSession, { ...args, expiresAt: Date.now() + 900000 });
  expect(await f.t.run(ctx => ctx.db.query("usageCounters").first())).toMatchObject({ storedBytes: 0, reservedBytes: 40, dayUploads: 1 }); expect(storage.deletes).toEqual([]);
});

it("expiry records one failure per row and never repeats its charge on the next sweep", async () => {
  const f = await fixture(); const id = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("single-expiry", 20)); const row = (await f.t.run(ctx => ctx.db.get(id)))!;
  vi.setSystemTime(row.expiresAt + 1);
  expect((await f.t.mutation(internal.usageLimits.expireReservations, {})).closed).toBe(1);
  const first = await f.t.run(ctx => ctx.db.get(id)), counter = await f.t.run(ctx => ctx.db.query("usageCounters").first());
  expect(first).toMatchObject({ status: "failed", failureCode: "UPLOAD_EXPIRED" });
  expect((await f.t.mutation(internal.usageLimits.expireReservations, {})).closed).toBe(0);
  expect(await f.t.run(ctx => ctx.db.get(id))).toEqual(first); expect(await f.t.run(ctx => ctx.db.query("usageCounters").first())).toEqual(counter);
});

it("a new upload's stored original survives the full existing cleanup grace even after expiry", async () => {
  const f = await fixture(); const id = await f.person.mutation(internal.photos.createUploadSession, { ...f.sessionArgs("composer", 20), expectedMimeType: "audio/mpeg" });
  storage.objects.set("composer-original", { bytes: new Uint8Array(20), mime: "audio/mpeg", version: "composer-version" });
  const row = (await f.t.run(ctx => ctx.db.get(id)))!; vi.setSystemTime(row.expiresAt + 1);
  await f.t.mutation(internal.usageLimits.expireReservations, {});
  await f.t.action(internal.storageDeletion.settleSession, { sessionId: id });
  expect(await f.t.action(internal.storageDeletion.deleteSession, { sessionId: id, dryRun: false })).toMatchObject({ deleted: false }); expect(storage.objects.has("composer-original")).toBe(true); expect((await f.summary()).usedBytes).toBe(20);
  vi.setSystemTime(row.expiresAt + 24 * 60 * 60 * 1000 + 1);
  expect(await f.t.action(internal.storageDeletion.deleteSession, { sessionId: id, dryRun: false })).toMatchObject({ deleted: true }); expect((await f.summary()).usedBytes).toBe(0);
});

it("backfill clears stuck in-flight bytes with no reservation behind them", async () => {
  const f = await fixture({ backfilled: false });
  await f.t.run(ctx => ctx.db.insert("usageCounters", { ownerId: f.owner, storedBytes: 0, reservedBytes: 9000, inFlight: 20, hourUploads: 0, dayUploads: 0, dayUploadBytes: 0, dayDownloadBytes: 0, hourKey: "synthetic", dayKey: "synthetic", ready: false, revision: 0, updatedAt: 1 }));
  const runId = await f.t.mutation(internal.usageRecount.start, { dryRun: false }); await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.t.query(internal.usageRecount.status, { runId })).toMatchObject({ status: "done" });
  expect(await f.t.run(ctx => ctx.db.query("usageCounters").withIndex("by_owner", q => q.eq("ownerId", f.owner)).unique())).toMatchObject({ ready: true, reservedBytes: 0, inFlight: 0 });
});

it("one owner's invalid counter rows are reported without preventing another owner's recount", async () => {
  const f = await fixture({ backfilled: false }); await f.upload();
  await f.t.run(async ctx => { const counter = (await ctx.db.query("usageCounters").first())!; const { _id, _creationTime, ...fields } = counter; void _id; void _creationTime; await ctx.db.insert("usageCounters", fields); });
  const runId = await f.t.mutation(internal.usageRecount.start, { dryRun: false }); await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.t.query(internal.usageRecount.status, { runId })).toMatchObject({ status: "blocked", failedOwners: 1, accountsSeen: 2 });
  expect(await f.t.run(ctx => ctx.db.query("usageCounters").withIndex("by_owner", q => q.eq("ownerId", f.adminId)).unique())).toMatchObject({ ready: true });
});

it("AI file-cap transport text retains exact counts even when decimal formatting rounds both values alike", async () => {
  const { checkFileSize } = await import("../../convex/lib/usageLimits/core");
  const refusal = checkFileSize("image", 104857601, 104857600)!;
  const result = toolErrorResult({ payload: { error: refusal } });
  expect(result.structuredContent).toEqual(refusal); expect(result.content[0].text).toContain("104857601 bytes"); expect(result.content[0].text).toContain("104857600 bytes");
});

it("reservation expiry preserves its first timestamp beyond one page", async () => {
  const f = await fixture(), at = Date.now();
  const future = await f.t.run(async ctx => { for (let n = 0; n < 205; n++) await ctx.db.insert("uploadReservations", { ownerId: f.owner, key: `past-${n}`, bytes: 1, day: "synthetic", status: "reserved", expiresAt: at - 1 }); return ctx.db.insert("uploadReservations", { ownerId: f.owner, key: "future", bytes: 1, day: "synthetic", status: "reserved", expiresAt: at + 1000 }); });
  let page = await f.t.mutation(internal.usageLimits.expireReservations, {}), closed = page.closed;
  expect(page.isDone).toBe(false); vi.setSystemTime(at + 60000);
  while (!page.isDone) { page = await f.t.mutation(internal.usageLimits.expireReservations, { cursor: page.cursor, at: page.at }); closed += page.closed; }
  expect(closed).toBe(205); expect((await f.t.run(ctx => ctx.db.get(future)))?.status).toBe("reserved");
});

it("generated-intent recovery keeps the original cutoff on scheduled pages", async () => {
  const f = await fixture(); const { done } = await f.upload(); const photoId = done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">, before = Date.now() - 15 * 60 * 1000;
  const late = await f.t.run(async ctx => { for (let n = 0; n < 61; n++) await ctx.db.insert("generatedObjects", { ownerId: f.owner, photoId, bucket: "synthetic", storageKey: `old-intent-${n}`, bytes: 1, state: "pending", createdAt: before - 1 }); return ctx.db.insert("generatedObjects", { ownerId: f.owner, photoId, bucket: "synthetic", storageKey: "newer-intent", bytes: 1, state: "pending", createdAt: before + 1000 }); });
  await f.t.run(async ctx => { const photo = (await ctx.db.get(photoId))!; const counter = (await ctx.db.query("usageCounters").withIndex("by_owner", q => q.eq("ownerId", f.owner)).unique())!; await ctx.db.patch(photoId, { storedBytes: photo.storedBytes! + 62 }); await ctx.db.patch(counter._id, { storedBytes: counter.storedBytes + 62 }); });
  await f.t.action(internal.storageDeletion.recoverGenerated, {}); vi.setSystemTime(Date.now() + 60000); await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const intents = await f.t.run(ctx => ctx.db.query("generatedObjects").collect()); expect(intents.filter(row => row.state === "failed")).toHaveLength(61); expect((await f.t.run(ctx => ctx.db.get(late)))?.state).toBe("pending");
});

it("photo/session cleanup pagination preserves the original cutoff", async () => {
  const f = await fixture({ mode: "off" }); const before = Date.now() - 24 * 60 * 60 * 1000;
  const ids = [];
  for (let n = 0; n < 35; n++) { const id = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs(`cutoff-${n}`, 1)); ids.push(id); await f.t.run(ctx => ctx.db.patch(id, { expiresAt: before - 1 })); }
  const future = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("cutoff-future", 1)); await f.t.run(ctx => ctx.db.patch(future, { expiresAt: before + 1000 }));
  const first = await f.t.query(internal.photos.claimExpiredCleanup, {}); expect(first.isDone).toBe(false); vi.setSystemTime(Date.now() + 60000);
  const next = await f.t.query(internal.photos.claimExpiredCleanup, { cursor: first.cursor, before: first.before });
  expect([...first.candidates, ...next.candidates].map(row => row.id)).toHaveLength(ids.length); expect(next.candidates.some(row => row.id === future)).toBe(false);
});

it("repeat attachment of the same stored photo changes no bytes", async () => {
  const f = await fixture(); const { done } = await f.upload(); const itemId = await f.person.mutation(api.items.create, { householdId: f.householdId, moveId: f.moveId, name: "Synthetic replay target" });
  await f.t.mutation(internal.aiGrants.touchLegacyConnection, { subject: "synthetic-owner", clientId: "synthetic-ai" }); while (!(await f.t.run(ctx => ctx.db.query("aiAccessOwners").withIndex("by_owner", q => q.eq("ownerUserId", f.owner)).unique()))?.bootstrapped) await f.t.mutation(internal.aiGrants.continueBootstrap, { ownerUserId: f.owner });
  const args = { householdId: f.householdId, moveId: f.moveId, caller: { subject: "synthetic-owner", claims: { client_id: "synthetic-ai" } }, photoIds: [done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">], attachTo: { itemId } };
  const before = (await f.summary()).usedBytes; await f.t.mutation(internal.mcpToolsImages.attachPhotos, args); await f.t.mutation(internal.mcpToolsImages.attachPhotos, args); expect((await f.summary()).usedBytes).toBe(before);
});

it("hard deletion waits for a completed photo's remaining PUT lease so a late PUT cannot recreate uncounted bytes", async () => {
  const f = await fixture(); const begin = await f.person.action(api.photos.initUpload, f.beginArgs("live-put-lease"));
  const key = decodeURIComponent(new URL(begin.uploadUrl).pathname.slice(1)); storage.objects.set(key, { bytes: png, mime: "image/png", version: "live-lease-version" });
  const done = await f.person.action(api.photos.finalizeUpload, { householdId: f.householdId, moveId: f.moveId, uploadSessionId: begin.uploadSessionId as import("../../convex/_generated/dataModel").Id<"photoUploadSessions">, width: 2, height: 2 });
  const photoId = done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">; await f.t.run(ctx => ctx.db.patch(photoId, { pendingStorageDeletion: true, archivedAt: Date.now() }));
  const before = (await f.summary()).usedBytes;
  expect((await f.t.action(internal.storageDeletion.deletePhoto, { photoId })).objects?.every(ref => ref.referenced)).toBe(true);
  expect(await f.t.action(internal.storageDeletion.deletePhoto, { photoId, dryRun: false })).toMatchObject({ deleted: false }); expect(storage.objects.has(key)).toBe(true); expect((await f.summary()).usedBytes).toBe(before);
  vi.setSystemTime(begin.expiresAt + 1); expect(await f.t.action(internal.storageDeletion.deletePhoto, { photoId, dryRun: false })).toMatchObject({ deleted: true }); expect((await f.summary()).usedBytes).toBe(0);
});

it("an unknown-length URL retry restores its existing declared hold without reserving again", async () => {
  const f = await fixture({ cap: 20 }); const sessionId = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("unknown-retry", 20));
  await f.person.mutation(api.photos.cancelUploadSession, { householdId: f.householdId, moveId: f.moveId, uploadSessionId: sessionId });
  await f.t.run(ctx => ctx.db.patch(f.settings, { maxFileBytes: { image: 10 } }));
  expect(await f.t.mutation(internal.usageLimits.reserveFetch, { householdId: f.householdId, key: `${f.moveId}:${f.owner}:unknown-retry`, bytes: 1, unknownLength: true })).toMatchObject({ refusal: { code: "FILE_TOO_LARGE" } });
  expect((await f.t.run(ctx => ctx.db.get(sessionId)))?.quarantinedBytes).toBe(20);
  await f.t.run(ctx => ctx.db.patch(f.settings, { maxFileBytes: { image: 1000000 } }));
  const restored = await f.t.mutation(internal.usageLimits.reserveFetch, { householdId: f.householdId, key: `${f.moveId}:${f.owner}:unknown-retry`, bytes: 1, unknownLength: true });
  expect(restored.refusal).toBeUndefined(); expect(restored.reservationId).toBe((await f.t.run(ctx => ctx.db.get(sessionId)))?.usageReservationId); expect((await f.summary()).usedBytes).toBe(20);
  expect(await f.t.run(ctx => ctx.db.query("usageCounters").first())).toMatchObject({ storedBytes: 0, reservedBytes: 20, dayUploads: 1 });
});

it("a completed operation replays through REST before changed file caps or a remote fetch", async () => {
  const f = await fixture(); const key = await f.key(); const args = { method: "POST" as const, path: "photos/upload", authorization: `Bearer ${key.raw}`, query: {}, body: { moveId: f.moveId, operationId: "operation-only", fileBase64: Buffer.from(png).toString("base64"), mimeType: "image/png" } };
  const first = await f.t.action(internal.restApiActions.handle, args); expect(first.status).toBe(201); const count = storage.puts.length;
  await f.t.run(ctx => ctx.db.patch(f.settings, { maxFileBytes: { image: 1 }, planStoredBytes: { free: 0, pro: 0 } }));
  const replay = await f.t.action(internal.restApiActions.handle, { ...args, body: { moveId: f.moveId, operationId: "operation-only", sourceUrl: "https://synthetic.invalid/must-not-fetch" } });
  expect(replay).toMatchObject({ status: 201, body: { data: { photoId: (first.body as { data: { photoId: string } }).data.photoId } } }); expect(storage.puts).toHaveLength(count);
});

it("reopening a closed upload also respects the in-flight slot budget without changing its retained bytes", async () => {
  const f = await fixture(); const first = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("first-slot", 20));
  await f.person.mutation(api.photos.cancelUploadSession, { householdId: f.householdId, moveId: f.moveId, uploadSessionId: first });
  await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("other-slot", 20));
  await f.t.run(ctx => ctx.db.patch(f.settings, { maxUploadsInFlight: 1 }));
  const result = await f.person.mutation(internal.photos.tryCreateUploadSession, f.sessionArgs("first-slot", 20));
  expect(result.refusal).toMatchObject({ code: "USAGE_LIMIT_REACHED", limit: "maxUploadsInFlight", requested: 1 });
  expect((await f.t.run(ctx => ctx.db.get(first)))?.quarantinedBytes).toBe(20); expect((await f.summary()).usedBytes).toBe(40);
});

it("a source-URL refusal survives the real REST mapper and records one activity receipt", async () => {
  const f = await fixture({ cap: 1 }); const key = await f.key();
  const result = await f.t.action(internal.restApiActions.handle, { method: "POST", path: "photos/upload", authorization: `Bearer ${key.raw}`, idempotencyKey: "source-refused", query: {}, body: { moveId: f.moveId, sourceUrl: "https://synthetic.invalid/source.png" } });
  expect(result).toMatchObject({ status: 413, body: { error: { code: "USAGE_LIMIT_REACHED", requested: png.byteLength, remaining: 1 } } }); expect(storage.puts).toEqual([]);
  const activity = await f.person.query(api.audit.listForHousehold, { householdId: f.householdId }); expect(activity.filter(row => row.action === "upload.refused")).toHaveLength(1);
  expect((await f.admin.query(api.usageLimits.adminOverview, {})).events.filter(row => row.source === "fetch")).toHaveLength(1);
});

it("an early URL batch count refusal reports uploads rather than byte counts", async () => {
  const f = await fixture(); const key = await f.key(); await f.t.run(ctx => ctx.db.patch(f.settings, { uploadsPerHour: 1 }));
  const result = await f.t.action(internal.restApiActions.handle, { method: "POST", path: "uploads/batch", authorization: `Bearer ${key.raw}`, idempotencyKey: "url-count", query: {}, body: { moveId: f.moveId, images: [{ sourceUrl: "https://synthetic.invalid/a.png" }, { sourceUrl: "https://synthetic.invalid/b.png" }] } });
  expect(result).toMatchObject({ status: 413, body: { error: { code: "USAGE_LIMIT_REACHED", limit: "uploadsPerHour", unit: "uploads", used: 0, requested: 2, cap: 1, remaining: 1 } } }); expect(storage.puts).toEqual([]);
});

it("a post-backfill recount keeps a counted owner enforced if metadata temporarily fails", async () => {
  const f = await fixture(); const { key } = await f.upload(); const before = (await f.summary()).usedBytes!;
  await f.t.run(ctx => ctx.db.patch(f.settings, { planStoredBytes: { free: before, pro: before } })); storage.failHead.add(key);
  await f.t.action(internal.usageLimitsStorage.recomputeStep, { ownerId: f.owner }); await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.summary()).toMatchObject({ ready: true, usedBytes: before });
  await expect(f.person.action(api.photos.initUpload, f.beginArgs("still-enforced"))).rejects.toMatchObject({ data: expect.stringContaining("[USAGE_LIMIT_REACHED]") });
});

it("batch reopening sums new slots without charging the hourly count again", async () => {
  const f = await fixture();
  for (const name of ["reopen-a", "reopen-b"]) { const id = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs(name, 20)); await f.person.mutation(api.photos.cancelUploadSession, { householdId: f.householdId, moveId: f.moveId, uploadSessionId: id }); }
  await f.t.run(ctx => ctx.db.patch(f.settings, { maxUploadsInFlight: 1, uploadsPerHour: 2 }));
  const files = [f.sessionArgs("reopen-a", 20), f.sessionArgs("reopen-b", 20)];
  const blocked = await f.person.mutation(internal.photos.tryCreateUploadBatch, { files, requestBytes: 50 }); expect(blocked.refusal).toMatchObject({ limit: "maxUploadsInFlight", requested: 2, used: 0 });
  expect(await f.t.run(ctx => ctx.db.query("usageCounters").first())).toMatchObject({ inFlight: 0, hourUploads: 2, storedBytes: 40 });
  await f.t.run(ctx => ctx.db.patch(f.settings, { maxUploadsInFlight: 2 })); const reopened = await f.person.mutation(internal.photos.tryCreateUploadBatch, { files, requestBytes: 50 }); expect(reopened.refusal).toBeUndefined();
  expect(await f.t.run(ctx => ctx.db.query("usageCounters").first())).toMatchObject({ inFlight: 2, hourUploads: 2, reservedBytes: 40, storedBytes: 0 });
});

it("late cleanup receipts never rewrite a cleaned session's true failure", async () => {
  const f = await fixture(); const sessionId = await f.person.mutation(internal.photos.createUploadSession, f.sessionArgs("cleaned-receipt", 20));
  await f.t.run(ctx => ctx.db.patch(sessionId, { status: "failed", failureCode: "ORIGINAL_FAILURE", cleanupCompletedAt: 1, expiresAt: 1 }));
  const before = await f.t.run(ctx => ctx.db.get(sessionId));
  await f.admin.mutation(internal.photos.finishExpiredUploadSessionCleanup, { now: Date.now(), deleteObjects: true, plannedSessionCount: 1, skippedReferencedObjectCount: 0, results: [{ uploadSessionId: sessionId, attemptedObjectCount: 1, deletedObjectCount: 0, error: "Late synthetic error" }] });
  expect(await f.t.run(ctx => ctx.db.get(sessionId))).toEqual(before);
});

it("a failed original transfer reports failure, frees its slot and retries the same operation instead of caching the error", async () => {
  const f = await fixture(); const key = await f.key();
  const args = { method: "POST" as const, path: "photos/upload", authorization: `Bearer ${key.raw}`, idempotencyKey: "transfer-retry", query: {}, body: { moveId: f.moveId, fileBase64: Buffer.from(png).toString("base64"), mimeType: "image/png" } };
  storage.failPut = true; const failed = await f.t.action(internal.restApiActions.handle, args); expect(failed).toMatchObject({ status: 400, body: { error: { code: "photo_upload_failed" } } });
  expect(await f.t.run(ctx => ctx.db.query("photoUploadSessions").first())).toMatchObject({ status: "failed", failureCode: "UPLOAD_TRANSFER_FAILED" });
  expect(await f.t.run(ctx => ctx.db.query("usageCounters").first())).toMatchObject({ inFlight: 0, reservedBytes: 0 });
  storage.failPut = false; expect((await f.t.action(internal.restApiActions.handle, args)).status).toBe(201);
});

it("confirmed absence ends a pending generated copy's charge and clears its registered size once", async () => {
  const f = await fixture(); const { done } = await f.upload(); const photoId = done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">, before = (await f.summary()).usedBytes!;
  await f.t.mutation(internal.photos.prepareStoredDerivative, { photoId, storageKey: "missing-copy", bytes: 20 });
  const intent = (await f.t.run(ctx => ctx.db.query("generatedObjects").withIndex("by_key", q => q.eq("storageKey", "missing-copy")).unique()))!;
  await f.t.mutation(internal.storageDeletion.recoveredGenerated, { id: intent._id, exists: false });
  expect((await f.summary()).usedBytes).toBe(before); expect(await f.t.run(ctx => ctx.db.get(intent._id))).toMatchObject({ bytes: 0, state: "failed" });
  await f.t.mutation(internal.storageDeletion.recoveredGenerated, { id: intent._id, exists: false }); expect((await f.summary()).usedBytes).toBe(before);
});

it("an automatically created settings row keeps enforcement off and contains no saved policy maps", async () => {
  const f = await fixture(); await f.t.run(ctx => ctx.db.delete(f.settings)); await f.upload();
  const settings = await f.t.run(ctx => ctx.db.query("usageLimitSettings").withIndex("by_key", q => q.eq("key", "site")).unique());
  expect(settings).toMatchObject({ enforcement: "off", storageRevision: expect.any(Number) }); expect(settings).not.toHaveProperty("planStoredBytes"); expect(settings).not.toHaveProperty("maxFileBytes");
});

it("R3 purge strips private photo metadata immediately and retires completed sessions, claims and cleanup jobs", async () => {
  const f = await fixture(); const { begin, done } = await f.upload();
  const photoId = done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">;
  await f.t.run(async ctx => { await ctx.db.patch(photoId, { caption: "Synthetic private caption", notes: "Synthetic private note", room: "Synthetic room", fileName: "private.png", originalHash: "private-hash" }); await ctx.db.patch(begin.uploadSessionId as import("../../convex/_generated/dataModel").Id<"photoUploadSessions">, { room: "Synthetic room", agentLabel: "Synthetic private label" }); });
  const before = (await f.summary()).usedBytes;
  await f.person.mutation(api.moves.purge, { householdId: f.householdId, moveId: f.moveId, confirmTitle: "Synthetic" });
  const retained = await f.t.run(ctx => ctx.db.get(photoId));
  for (const field of ["caption", "notes", "room", "fileName", "originalHash", "agentLabel"]) expect(retained).not.toHaveProperty(field);
  expect(await f.t.run(ctx => ctx.db.query("photoUploadSessions").collect())).toEqual([]);
  expect(await f.t.run(ctx => ctx.db.query("uploadObjectClaims").collect())).toEqual([]);
  expect((await f.summary()).usedBytes).toBe(before);
  await f.t.action(internal.storageDeletion.deletePhoto, { photoId, dryRun: false });
  expect(await f.t.run(ctx => ctx.db.get(photoId))).toBeNull();
  expect(await f.t.run(ctx => ctx.db.query("storageDeletionJobs").collect())).toEqual([]);
  expect((await f.summary()).usedBytes).toBe(0);
});

it("R3 purged unfinished sessions discard private fields and disappear after confirmed cleanup", async () => {
  const f = await fixture(); const id = await f.person.mutation(internal.photos.createUploadSession, { ...f.sessionArgs("purged-pending"), room: "Synthetic private room" });
  await f.person.mutation(api.moves.purge, { householdId: f.householdId, moveId: f.moveId, confirmTitle: "Synthetic" });
  const row = (await f.t.run(ctx => ctx.db.get(id)))!; expect(row).not.toHaveProperty("room"); expect(row).not.toHaveProperty("operationId");
  vi.setSystemTime(row.expiresAt + 24 * 3600000 + 1);
  await f.t.action(internal.storageDeletion.deleteSession, { sessionId: id, dryRun: false });
  expect(await f.t.run(ctx => ctx.db.get(id))).toBeNull();
  expect(await f.t.run(ctx => ctx.db.query("sessionDeletionJobs").collect())).toEqual([]);
  expect(await f.t.run(ctx => ctx.db.query("uploadObjectClaims").collect())).toEqual([]);
  expect(await f.t.run(ctx => ctx.db.query("usageCounters").first())).toMatchObject({ storedBytes: 0, reservedBytes: 0, inFlight: 0 });
});

it.each([1001, 100000])("R3 the purge door pages %i photos with platform transaction limits enabled", async count => {
  const f = await fixture({ transactionLimits: true }); const { done } = await f.upload();
  const photoId = done.photoId as import("../../convex/_generated/dataModel").Id<"itemPhotos">;
  const template = (await f.t.run(ctx => ctx.db.get(photoId)))!;
  const { _id, _creationTime, ...fields } = template; void _id; void _creationTime;
  for (let n = 1; n < count; n += 500) await f.t.run(async ctx => { for (let i = n; i < Math.min(n + 500, count); i++) await ctx.db.insert("itemPhotos", { ...fields, originalStorageKey: `synthetic-legacy-${i}`, caption: "Synthetic private caption" }); });
  expect(await f.person.mutation(api.moves.purge, { householdId: f.householdId, moveId: f.moveId, confirmTitle: "Synthetic" })).toMatchObject({ pending: true });
  expect(await f.t.run(ctx => ctx.db.get(f.moveId))).toBeNull();
  let next: { householdId: typeof f.householdId; moveId: typeof f.moveId; table: number; cursor: string | null } | null = { householdId: f.householdId, moveId: f.moveId, table: 0, cursor: null };
  if (count === 1001) await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  else while (next) next = await f.t.mutation(internal.moves.purgePage, next);
  const privateRow = await f.t.run(ctx => ctx.db.query("itemPhotos").withIndex("by_move_created", q => q.eq("moveId", f.moveId)).filter(q => q.neq(q.field("erasurePending"), true)).first());
  expect(privateRow).toBeNull();
  expect(await f.t.run(ctx => ctx.db.query("photoUploadSessions").first())).toBeNull();
}, 300000);

it("R3 early URL batch refusal explicitly reports unknown total rather than a sized prefix", async () => {
  const f = await fixture({ cap: png.byteLength + 1 }); const key = await f.key();
  const result = await f.t.action(internal.restApiActions.handle, { method: "POST", path: "uploads/batch", authorization: `Bearer ${key.raw}`, idempotencyKey: "unknown-total", query: {}, body: { moveId: f.moveId, images: [1, 2, 3].map(i => ({ sourceUrl: `https://synthetic.invalid/${i}.png` })) } });
  expect(result).toMatchObject({ status: 413, body: { error: { code: "USAGE_LIMIT_REACHED", requested: null, requestedTotalKnown: false, remaining: png.byteLength + 1, message: expect.stringContaining("total batch size is unknown") } } });
  expect(toolErrorResult({ payload: result.body }).content[0].text).toContain("total batch size is unknown");
  expect(storage.puts).toEqual([]); expect(await f.t.run(ctx => ctx.db.query("usageCounters").first())).toMatchObject({ reservedBytes: 0, inFlight: 0 });
});

it("R3 cleaned-operation target conflicts remain per item without hidden holds", async () => {
  const f = await fixture(); const id = await f.person.mutation(internal.photos.createUploadSession, { ...f.sessionArgs("cleaned"), room: "A" });
  await f.person.mutation(api.photos.cancelUploadSession, { householdId: f.householdId, moveId: f.moveId, uploadSessionId: id });
  vi.setSystemTime(Date.now() + 25 * 3600000); await f.t.action(internal.storageDeletion.deleteSession, { sessionId: id, dryRun: false });
  const response = await f.person.mutation(internal.photos.tryCreateUploadBatch, { files: [f.sessionArgs("fresh"), { ...f.sessionArgs("cleaned"), originalStorageKey: "cleaned-new-key", room: "B" }], requestBytes: 1 });
  expect(response).not.toHaveProperty("refusal"); expect(response.results?.[0].uploadSessionId).toBeTruthy(); expect(response.results?.[1]).toMatchObject({ code: "OPERATION_CONFLICT" });
  expect(await f.t.run(ctx => ctx.db.query("uploadReservations").withIndex("by_owner_status", q => q.eq("ownerId", f.owner).eq("status", "reserved")).collect())).toHaveLength(1);
  const before = (await f.t.run(ctx => ctx.db.query("usageCounters").first()))!;
  await f.t.run(ctx => ctx.db.patch(f.settings, { planStoredBytes: { free: 0, pro: 0 } }));
  expect(await f.person.mutation(internal.photos.tryCreateUploadBatch, { files: [f.sessionArgs("refused-new")], requestBytes: 1 })).toHaveProperty("refusal");
  expect(await f.t.run(ctx => ctx.db.query("usageCounters").first())).toMatchObject({ reservedBytes: before.reservedBytes, inFlight: before.inFlight });
});

it.each([false, true])("R3 real batch validation respects continueOnError=%s", async continueOnError => {
  const f = await fixture(); const key = await f.key();
  const response = await f.t.action(internal.restApiActions.handle, { method: "POST", path: "uploads/batch", authorization: `Bearer ${key.raw}`, idempotencyKey: `stop-${continueOnError}`, query: {}, body: { moveId: f.moveId, continueOnError, images: [{ fileBase64: "YmFk", mimeType: "image/png" }, { fileBase64: Buffer.from(png).toString("base64"), mimeType: "image/png" }] } });
  if (continueOnError) expect(response).toMatchObject({ status: 200, body: { data: { uploadedCount: 1, failedCount: 1 } } });
  else { expect(response).toMatchObject({ status: 400, body: { partialResults: [{ index: 0, ok: false }] } }); expect(storage.puts).toEqual([]); }
  expect(await f.t.run(ctx => ctx.db.query("usageCounters").first())).not.toMatchObject({ inFlight: 1 });
});

it("R3 application failure stops later writes and releases unused batch slots", async () => {
  const f = await fixture(); const key = await f.key(); storage.failPut = true;
  const response = await f.t.action(internal.restApiActions.handle, { method: "POST", path: "uploads/batch", authorization: `Bearer ${key.raw}`, idempotencyKey: "stop-put", query: {}, body: { moveId: f.moveId, continueOnError: false, images: [1, 2].map(() => ({ fileBase64: Buffer.from(png).toString("base64"), mimeType: "image/png" })) } });
  expect(response).toMatchObject({ status: 400, body: { partialResults: [{ index: 0, ok: false }] } });
  expect(await f.t.run(ctx => ctx.db.query("usageCounters").first())).toMatchObject({ inFlight: 0, reservedBytes: 0 }); expect(storage.puts).toEqual([]);
});

it("R3 the REST batch door exposes a cleaned target conflict per item and keeps only receipted reservations", async () => {
  const f = await fixture(); const key = await f.key();
  const id = await f.t.mutation(internal.photos.createUploadSession, { ...f.sessionArgs("rest-cleaned"), room: "A", apiActor: { apiKeyId: String(key.id), createdByUserId: f.owner } });
  await f.t.mutation(internal.photos.markUploadSessionFailed, { householdId: f.householdId, moveId: f.moveId, uploadSessionId: id, apiActor: { apiKeyId: String(key.id), createdByUserId: f.owner } });
  vi.setSystemTime(Date.now() + 25 * 3600000); await f.t.action(internal.storageDeletion.deleteSession, { sessionId: id, dryRun: false });
  const response = await f.t.action(internal.restApiActions.handle, { method: "POST", path: "uploads/batch", authorization: `Bearer ${key.raw}`, idempotencyKey: "mixed-cleaned-rest", query: {}, body: { moveId: f.moveId, continueOnError: true, images: [{ fileBase64: Buffer.from(png).toString("base64"), mimeType: "image/png", room: "A", idempotencyKey: "rest-fresh" }, { fileBase64: Buffer.from(png).toString("base64"), mimeType: "image/png", room: "B", idempotencyKey: "rest-cleaned" }] } });
  expect(response).toMatchObject({ status: 200, body: { data: { uploadedCount: 1, failedCount: 1, results: [{ index: 0, ok: true }, { index: 1, ok: false, code: "OPERATION_CONFLICT" }] } } });
  expect(await f.t.run(ctx => ctx.db.query("usageCounters").first())).toMatchObject({ inFlight: 0, reservedBytes: 0 });
});
