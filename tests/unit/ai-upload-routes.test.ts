// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { nativeWebsiteIdentity } from "../helpers/website-session";

const store = vi.hoisted(() => ({ objects: new Map<string, { bytes: Uint8Array; mime: string; size?: number; read?: (a: number, n: number) => Uint8Array }>(), reads: [] as number[], versionReads: [] as string[] }));
vi.mock("@aws-sdk/client-s3", async load => {
  const actual = await load<typeof import("@aws-sdk/client-s3")>();
  return { ...actual, S3Client: class { async send(command: { constructor: { name: string }; input: { Key: string; Range?: string; VersionId?: string } }) {
    if (command.constructor.name === "DeleteObjectCommand") { store.objects.delete(command.input.Key); return {}; }
    const object = store.objects.get(command.input.Key);
    if (!object) throw Object.assign(new Error("Missing synthetic object"), { name: "NotFound" });
    if (command.constructor.name === "HeadObjectCommand") return { ContentLength: object.size ?? object.bytes.length, ContentType: object.mime, VersionId: "synthetic-version", ETag: "synthetic-etag" };
    if (command.constructor.name === "GetObjectCommand") {
      const match = /bytes=(\d+)-(\d+)/.exec(command.input.Range ?? "");
      if (!match) throw new Error("Unbounded validation read");
      const start = Number(match[1]), n = Number(match[2]) - start + 1;
      store.reads.push(n); store.versionReads.push(command.input.VersionId ?? "");
      const bytes = object.read ? object.read(start, n) : object.bytes.subarray(start, start + n);
      return { ContentLength: bytes.length, Body: { transformToByteArray: async () => bytes } };
    }
    throw new Error("Unexpected storage operation");
  } } };
});
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: async (_: unknown, command: { input: { Key: string } }) => `https://storage.invalid/${encodeURIComponent(command.input.Key)}` }));
const modules = import.meta.glob("../../convex/**/*.ts");
beforeEach(() => {
  vi.useFakeTimers(); store.objects.clear(); store.reads.length = 0; store.versionReads.length = 0;
  for (const name of ["B2_ENDPOINT", "B2_BUCKET_NAME", "B2_APPLICATION_KEY_ID", "B2_APPLICATION_KEY"]) vi.stubEnv(name, "synthetic-placeholder");
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://synthetic.clerk.accounts.dev");
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const user = (clerkUserId: string) => ctx.db.insert("users", { clerkUserId, appRole: "member", status: "active", createdAt: 1, updatedAt: 1, lastSeenAt: 1 });
    const owner = await user("synthetic-owner"), member = await user("synthetic-member");
    const householdId = await ctx.db.insert("households", { name: "Example household", ownerUserId: owner, createdByUserId: owner, createdAt: 1, updatedAt: 1 });
    for (const [userId, role] of [[owner, "owner"], [member, "editor"]] as const) await ctx.db.insert("householdMemberships", { householdId, userId, role, status: "active", apiAccessStatus: "enabled", createdAt: 1, updatedAt: 1 });
    const moveId = await ctx.db.insert("moves", { householdId, title: "Example move", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: owner, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("householdBillingProfiles", { householdId, tier: "free", provider: "none", status: "none", createdAt: 1, updatedAt: 1 });
    const settings = await ctx.db.insert("usageLimitSettings", { key: "site", backfillCompletedAt: 1, enforcement: "on", updatedAt: 1, updatedBy: "synthetic" });
    return { owner, member, householdId, moveId, settings };
  });
  const person = t.withIdentity(nativeWebsiteIdentity("synthetic-member"));
  async function begin(bytes: Uint8Array, mime: string, audioKind?: "voicenote", declaredSize = bytes.length) {
    const result = await person.action(api.photos.initUpload, { ...scope, operationId: crypto.randomUUID(), sizeBytes: declaredSize, mimeType: mime, audioKind });
    const key = decodeURIComponent(new URL(result.uploadUrl).pathname.slice(1));
    const object = { bytes, mime };
    store.objects.set(key, object);
    return { session: result.uploadSessionId as Id<"photoUploadSessions">, key, object };
  }
  const scope = { householdId: ids.householdId, moveId: ids.moveId };
  const finish = (session: Id<"photoUploadSessions">) => person.action(api.photos.finalizeUpload, { ...scope, uploadSessionId: session });
  return { t, person, ...ids, scope, begin, finish };
}

import { canonicalRequestBytes, normalizeUploadBound, relayCap, filesCap } from "../../convex/lib/aiUploadCaps";
async function aiFixture() {
  const f = await fixture();
  const principal = { subject: "synthetic-member", issuer: "https://synthetic.clerk.accounts.dev", clientId: "synthetic-client" };
  const grantId = await f.t.run(ctx => ctx.db.insert("aiGrants", { ownerUserId: f.member, householdId: f.householdId, label: "Example connection", clientId: principal.clientId, scopes: ["moving.work.write"], moveScope: "allMoves", status: "active", consentBoundaryVersion: "synthetic", consentSnapshot: [], approvedAt: 1, useCount: 0, version: 1, createdAt: 1, updatedAt: 1 }));
  for (let i = 0; i < 2; i++) await f.t.mutation(internal.aiGrants.continueBootstrap, { ownerUserId: f.member });
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname !== "storage.invalid" || init?.method !== "PUT") throw new Error("Unexpected external request");
    store.objects.set(decodeURIComponent(url.pathname.slice(1)), { bytes: init.body as Uint8Array, mime: (init.headers as Record<string, string>)["Content-Type"] });
    return new Response(null, { status: 200 });
  });
  const bytes = new Uint8Array(readFileSync("tests/fixtures/audio/tone.wav"));
  const input = { operationId: "example-upload", mimeType: "audio/wav", sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), audioKind: "voicenote" as const };
  const begin = (files = [input]) => f.t.action(internal.aiUploads.begin, { principal, moveId: f.moveId, files, single: false });
  const put = (receipt: { uploadUrl?: string }, body = bytes) => f.t.fetch(`/ai-upload${new URL(receipt.uploadUrl!).search}`, { method: "PUT", headers: { "Content-Length": String(body.length) }, body });
  const finish = (uploadSessionId: Id<"photoUploadSessions">) => f.t.action(internal.aiUploads.finish, { principal, uploadSessionId });
  return { ...f, principal, grantId, bytes, input, begin, put, finish };
}
afterEach(() => vi.unstubAllGlobals());
it("uploads, validates audio, counts once and replays exact operations through registered handlers", async () => {
  const f = await aiFixture(), result = await f.begin(), receipt = result.receipts[0];
  expect(receipt.ok).toBe(true);
  expect((await f.put(receipt)).status).toBe(200);
  const done = await f.finish(receipt.uploadSessionId!) as { photoId: string };
  expect(await f.finish(receipt.uploadSessionId!)).toMatchObject({ photoId: done.photoId });
  expect((await f.begin()).receipts[0].uploadSessionId).toBe(receipt.uploadSessionId);
  expect(await f.t.run(ctx => ctx.db.query("itemPhotos").collect())).toHaveLength(1);
  expect((await f.t.run(ctx => ctx.db.query("usageCounters").collect()))[0]).toMatchObject({ storedBytes: f.bytes.length, reservedBytes: 0 });
  expect((await f.begin([{ ...f.input, sha256: "a".repeat(64) }])).receipts[0]).toMatchObject({ ok: false, error: { code: "OPERATION_CONFLICT" } });
});
it("keeps successful files when a batch includes invalid media and lets every receipt finish independently", async () => {
  const f = await aiFixture();
  const result = await f.begin([f.input, { ...f.input, operationId: "bad-type", mimeType: "unknown/example" }, { ...f.input, operationId: "second-good" }]);
  expect(result.receipts.map(r => r.ok)).toEqual([true, false, true]);
  for (const receipt of result.receipts.filter(r => r.ok)) { expect((await f.put(receipt)).status).toBe(200); await f.finish(receipt.uploadSessionId!); }
  expect(await f.t.run(ctx => ctx.db.query("itemPhotos").collect())).toHaveLength(2);
});
it.each(["off", "warn", "on"] as const)("refuses the entire oversized batch before holds in %s", async enforcement => {
  const f = await aiFixture(); await f.t.run(ctx => ctx.db.patch(f.settings, { enforcement }));
  await expect(f.begin([f.input, { ...f.input, operationId: "too-large", sizeBytes: canonicalRequestBytes + 1 }])).rejects.toMatchObject({ data: { code: "FILE_TOO_LARGE" } });
  await expect(f.begin(Array.from({ length: 26 }, (_, i) => ({ ...f.input, operationId: String(i) })))).rejects.toMatchObject({ data: { code: "REQUEST_TOO_LARGE" } });
  expect(await f.t.run(ctx => ctx.db.query("photoUploadSessions").collect())).toHaveLength(0);
  expect(await f.t.run(ctx => ctx.db.query("uploadReservations").collect())).toHaveLength(0);
});
it("refuses a changed PUT digest before storing and never creates ready media", async () => {
  const f = await aiFixture(), receipt = (await f.begin()).receipts[0];
  const bad = f.bytes.slice(); bad[0] ^= 1;
  expect((await f.put(receipt, bad)).status).toBe(400);
  expect(store.objects.size).toBe(0);
  await expect(f.finish(receipt.uploadSessionId!)).rejects.toMatchObject({ data: { code: "INVALID_UPLOAD" } });
});
it("uses core validation on inline audio, repeats exactly and rejects changed content", async () => {
  const f = await aiFixture();
  const args = { principal: f.principal, moveId: f.moveId, input: f.input, base64: Buffer.from(f.bytes).toString("base64") };
  const result = await f.t.action(internal.aiUploads.inline, args) as { photoId: string };
  expect(await f.t.action(internal.aiUploads.inline, args)).toMatchObject({ photoId: result.photoId });
  const bad = f.bytes.slice(); bad[0] ^= 1;
  await expect(f.t.action(internal.aiUploads.inline, { ...args, base64: Buffer.from(bad).toString("base64") })).rejects.toThrow();
  expect((await f.t.run(ctx => ctx.db.query("usageCounters").collect()))[0]).toMatchObject({ storedBytes: f.bytes.length, reservedBytes: 0 });
});
it.each([false, true])("ordinary cleanup owns abandoned uploads with deletion enabled=%s", async enabled => {
  const f = await aiFixture(), receipt = (await f.begin()).receipts[0];
  await f.put(receipt);
  await f.t.run(ctx => ctx.db.patch(receipt.uploadSessionId!, { expiresAt: 0 }));
  await f.t.mutation(internal.usageLimits.operatorSetDeletionModes, { bucket: enabled, reason: "Synthetic test" });
  await f.t.action(internal.storageDeletion.runSessionDeletion, { sessionId: receipt.uploadSessionId! });
  expect(store.objects.size).toBe(enabled ? 0 : 1);
});
it("revoking the write grant refuses begin, PUT and finish", async () => {
  const f = await aiFixture(), receipt = (await f.begin()).receipts[0];
  await f.person.mutation(api.aiGrants.revoke, { grantId: f.grantId, expectedVersion: 1 });
  await expect(f.begin()).rejects.toThrow();
  expect((await f.put(receipt)).status).toBe(400);
  await expect(f.finish(receipt.uploadSessionId!)).rejects.toThrow();
});
it.each([NaN, Infinity, -1, 0, 1.5, canonicalRequestBytes + 1, null, "2"])("normalizes invalid route setting %s in the one caps reader", value => {
  expect(normalizeUploadBound(value, canonicalRequestBytes)).toBe(canonicalRequestBytes);
  expect(relayCap("audio", { maxFileBytes: { audio: value as number } }, null)).toBe(canonicalRequestBytes);
});
it("caps readers use the one normalizer and do not read settings directly in the route", () => {
  const route = readFileSync("convex/aiUploads.ts", "utf8");
  expect(route).not.toContain("maxFileBytes");
  expect(readFileSync("convex/lib/aiUploadCaps.ts", "utf8")).toContain("normalizeUploadBound(effectiveFileCap(");
  for (const value of [1, 3, 1000, canonicalRequestBytes]) expect(relayCap("audio", { maxFileBytes: { audio: value } }, null)).toBe(value);
});
it.each(["opus.webm", "opus.ogg", "aac.m4a", "tone.mp3", "tone.wav", "tone.flac", "tone.aac"])("validates %s on both new byte transports", async name => {
  const mime = ({ "opus.webm": "audio/webm", "opus.ogg": "audio/ogg", "aac.m4a": "audio/mp4", "tone.mp3": "audio/mpeg", "tone.wav": "audio/wav", "tone.flac": "audio/flac", "tone.aac": "audio/aac" } as Record<string, string>)[name];
  for (const inline of [false, true]) {
    const f = await aiFixture(), bytes = new Uint8Array(readFileSync(`tests/fixtures/audio/${name}`));
    const input = { ...f.input, mimeType: mime, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    if (inline) await f.t.action(internal.aiUploads.inline, { principal: f.principal, moveId: f.moveId, input, base64: Buffer.from(bytes).toString("base64") });
    else { const r = (await f.begin([input])).receipts[0]; expect((await f.put(r, bytes)).status).toBe(200); await f.finish(r.uploadSessionId!); }
    expect((await f.t.run(ctx => ctx.db.query("itemPhotos").collect()))[0]).toMatchObject({ audioValidated: true, usageOwnerId: f.owner });
  }
});
it("a bad stored audio file fails independently, releases its hold and remains ordinary cleanup work", async () => {
  const f = await aiFixture(), bad = f.bytes.subarray(0, 12), input = { ...f.input, operationId: "short-audio", sizeBytes: bad.length, sha256: createHash("sha256").update(bad).digest("hex") };
  const result = await f.begin([f.input, input]);
  await f.put(result.receipts[0]); await f.finish(result.receipts[0].uploadSessionId!);
  await f.put(result.receipts[1], bad);
  await expect(f.finish(result.receipts[1].uploadSessionId!)).rejects.toMatchObject({ data: { code: "INVALID_AUDIO_CONTAINER" } });
  expect(await f.t.run(ctx => ctx.db.query("itemPhotos").collect())).toHaveLength(1);
  expect((await f.t.run(ctx => ctx.db.query("usageCounters").collect()))[0]).toMatchObject({ reservedBytes: 0, storedBytes: f.bytes.length + bad.length });
});
it.each(["off", "warn", "on"] as const)("checks configured file caps before bytes move on inline and PUT in %s", async enforcement => {
  const f = await aiFixture(); await f.t.run(ctx => ctx.db.patch(f.settings, { enforcement, maxFileBytes: { voicenote: 1 } }));
  await expect(f.begin()).rejects.toMatchObject({ data: { code: "FILE_TOO_LARGE", max: 1 } });
  await expect(f.t.action(internal.aiUploads.inline, { principal: f.principal, moveId: f.moveId, input: f.input, base64: Buffer.from(f.bytes).toString("base64") })).rejects.toMatchObject({ data: { code: "FILE_TOO_LARGE", max: 1 } });
  expect(store.objects.size).toBe(0);
  expect(await f.t.run(ctx => ctx.db.query("uploadReservations").collect())).toHaveLength(0);
});
it("holds one bounded byte buffer near the relay ceiling and keeps the website proxy streaming", async () => {
  const f = await aiFixture(), bytes = new Uint8Array(canonicalRequestBytes);
  const input = { ...f.input, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  const receipt = (await f.begin([input])).receipts[0];
  const before = process.memoryUsage();
  expect((await f.put(receipt, bytes)).status).toBe(200);
  expect(process.memoryUsage().arrayBuffers - before.arrayBuffers).toBeLessThan(bytes.length * 3);
  const relay = readFileSync("convex/aiUploads.ts", "utf8"), proxy = readFileSync("src/app/api/ai-upload/route.ts", "utf8");
  expect(relay.match(/new Uint8Array\(session.expectedSizeBytes\)/g)).toHaveLength(1);
  expect(relay).not.toContain("arrayBuffer()"); expect(relay).not.toContain("new Blob");
  expect(proxy).toContain("body: request.body"); expect(proxy).not.toContain("arrayBuffer");
});
it("rejects another connection or household session at the real finish handler", async () => {
  const f = await aiFixture(), receipt = (await f.begin()).receipts[0];
  await expect(f.t.action(internal.aiUploads.finish, { principal: { ...f.principal, clientId: "another-client" }, uploadSessionId: receipt.uploadSessionId! })).rejects.toMatchObject({ data: { code: "INVALID_UPLOAD" } });
});

it.each([NaN, Infinity, -1, 0, 1.5, 26])("normalizes invalid batch bound %s before the real handler", async value => {
 const f = await aiFixture(); await f.t.run(ctx => ctx.db.patch(f.settings, { mcpBatchMaxItems: value }));
 expect((await f.begin()).receipts[0].ok).toBe(true);
 expect(filesCap({ mcpBatchMaxItems: value }, null)).toBe(25);
});
it("uses configured batch bounds in every allowance mode with no session or hold", async () => {
 for (const enforcement of ["off", "warn", "on"] as const) {
  const f = await aiFixture(); await f.t.run(ctx => ctx.db.patch(f.settings, { enforcement, mcpBatchMaxItems: 1 }));
  await expect(f.begin([f.input, { ...f.input, operationId: "second" }])).rejects.toMatchObject({ data: { code: "REQUEST_TOO_LARGE" } });
  expect(await f.t.run(ctx => ctx.db.query("uploadReservations").collect())).toHaveLength(0);
 }
});
