// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { nativeWebsiteIdentity } from "../helpers/website-session";

const store = vi.hoisted(() => ({ objects: new Map<string, { bytes: Uint8Array; mime: string; size?: number; read?: (a: number, n: number) => Uint8Array }>(), failDelete: false, onHead: undefined as undefined | (() => Promise<void>), reads: [] as number[], versionReads: [] as string[] }));
vi.mock("@aws-sdk/client-s3", async load => {
  const actual = await load<typeof import("@aws-sdk/client-s3")>();
  return { ...actual, S3Client: class { async send(command: { constructor: { name: string }; input: { Key: string; Range?: string; VersionId?: string; Body?: Uint8Array; ContentType?: string } }) {
    if (command.constructor.name === "DeleteObjectCommand") { if (store.failDelete) { store.failDelete = false; throw new Error("Synthetic provider unavailable"); } store.objects.delete(command.input.Key); return {}; }
    if (command.constructor.name === "PutObjectCommand") { store.objects.set(command.input.Key, { bytes: command.input.Body!, mime: command.input.ContentType! }); return { VersionId: "synthetic-version", ETag: "synthetic-etag" }; }
    const object = store.objects.get(command.input.Key);
    if (!object) throw Object.assign(new Error("Missing synthetic object"), { name: "NotFound" });
    if (command.constructor.name === "HeadObjectCommand" && store.onHead) { const hook = store.onHead; store.onHead = undefined; await hook(); }
    if (command.constructor.name === "HeadObjectCommand") return { ContentLength: object.size ?? object.bytes.length, ContentType: object.mime, VersionId: "synthetic-version", ETag: "synthetic-etag" };
    if (command.constructor.name === "GetObjectCommand") {
      const match = /bytes=(\d+)-(\d+)/.exec(command.input.Range ?? "");
      if (!match) return { ContentLength: object.bytes.length, Body: { transformToByteArray: async () => object.bytes } };
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
  vi.useFakeTimers(); store.failDelete = false; store.onHead = undefined; store.objects.clear(); store.reads.length = 0; store.versionReads.length = 0;
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
  const input = { operationId: "example-upload", mimeType: "audio/wav", sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), audioKind: "voicenote" as "voicenote" | "audio" | undefined, width: undefined as number | undefined, height: undefined as number | undefined };
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
it.each(["off", "warn", "on"] as const)("count overflow refuses the call without changing rows in %s", async enforcement => {
 const f = await aiFixture(); await f.t.run(ctx => ctx.db.patch(f.settings, { enforcement })); const before = await rowSnapshot(f);
 await expect(f.begin(Array.from({ length: 26 }, (_, i) => ({ ...f.input, operationId: String(i) })))).rejects.toMatchObject({ data: { code: "REQUEST_TOO_LARGE" } });
 expect(await rowSnapshot(f)).toEqual(before);
});
it.each(["off", "warn", "on"] as const)("file failures keep independent sibling receipts in %s", async enforcement => {
 const f = await aiFixture(); await f.t.run(ctx => ctx.db.patch(f.settings, { enforcement, maxFileBytes: { voicenote: 1 } }));
 const good = { ...f.input, audioKind: "audio" as const };
 const result = await f.begin([good, { ...good, operationId: "over-transport", sizeBytes: canonicalRequestBytes + 1 }, { ...f.input, operationId: "over-setting" }, { ...good, operationId: "wrong-type", mimeType: "invalid/example" }, { ...good, operationId: "second-good" }]);
 expect(result.receipts.map(r => r.ok)).toEqual([true, false, false, false, true]);
 expect(result.receipts[1].error).toMatchObject({ code: "FILE_TOO_LARGE", max: canonicalRequestBytes });
 expect(result.receipts[2].error).toMatchObject({ code: "FILE_TOO_LARGE", max: 1 });
 expect(result.receipts[3].error).toMatchObject({ code: "INVALID_UPLOAD" });
 expect(await f.t.run(ctx => ctx.db.query("photoUploadSessions").collect())).toHaveLength(2);
 expect(await f.t.run(ctx => ctx.db.query("uploadReservations").collect())).toHaveLength(2);
 for (const receipt of result.receipts.filter(r => r.ok)) { expect((await f.put(receipt)).status).toBe(200); await f.finish(receipt.uploadSessionId!); }
 expect((await f.t.run(ctx => ctx.db.query("usageCounters").collect()))[0]).toMatchObject({ storedBytes: f.bytes.length * 2, reservedBytes: 0, inFlight: 0 });
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
  expect(readFileSync("convex/lib/aiUploadCaps.ts", "utf8")).toContain("normalizeUploadBound(cap,");
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
  expect((await f.begin()).receipts[0]).toMatchObject({ ok: false, error: { code: "FILE_TOO_LARGE", max: 1 } });
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
  await expect(f.t.action(internal.aiUploads.finish, { principal: { ...f.principal, clientId: "another-client" }, uploadSessionId: receipt.uploadSessionId! })).rejects.toThrow();
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

it.each([NaN, Infinity, -1, 0, 1.5])("invalid stored file bound %s defaults through the real lifecycle", async value => {
 const f = await aiFixture(); await f.t.run(ctx => ctx.db.patch(f.settings, { maxFileBytes: { voicenote: value } }));
 const r = (await f.begin()).receipts[0]; expect(r.ok).toBe(true); expect((await f.put(r)).status).toBe(200); await f.finish(r.uploadSessionId!);
});

const acceptedOriginals = [
  ["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"],
  ["opus.webm", "audio/webm"], ["opus.ogg", "audio/ogg"], ["aac.m4a", "audio/mp4"],
  ["fragmented.mp4", "audio/mp4"], ["tone.mp3", "audio/mpeg"], ["tone.wav", "audio/wav"], ["tone.flac", "audio/flac"], ["tone.aac", "audio/aac"],
] as const;
it.each(acceptedOriginals)("accepted original %s is ready, attached and counted through PUT and inline", async (name, mimeType) => {
 for (const inline of [false, true]) {
  store.objects.clear(); const f = await aiFixture();
  const image = mimeType.startsWith("image/");
  const sharp = (await import("sharp")).default;
  const bytes = image ? new Uint8Array(await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).toFormat(name as "jpeg" | "png" | "webp").toBuffer()) : new Uint8Array(readFileSync(`tests/fixtures/audio/${name}`));
  const input = { ...f.input, mimeType, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), audioKind: image ? undefined : "audio" as const, width: image ? 2 : undefined, height: image ? 2 : undefined };
  let result: { photoId: Id<"itemPhotos"> };
  if (inline) result = await f.t.action(internal.aiUploads.inline, { principal: f.principal, moveId: f.moveId, input, base64: Buffer.from(bytes).toString("base64") }) as typeof result;
  else { const receipt = (await f.begin([input])).receipts[0]; expect(receipt.ok).toBe(true); expect((await f.put(receipt, bytes)).status).toBe(200); result = await f.finish(receipt.uploadSessionId!) as typeof result; }
  const photo = await f.t.run(ctx => ctx.db.get(result.photoId));
  expect(photo).toMatchObject({ moveId: f.moveId, householdId: f.householdId, usageOwnerId: f.owner, ...(image ? { derivativeStatus: "ready", width: 2, height: 2 } : { audioValidated: true }) });
  const session = (await f.t.run(ctx => ctx.db.query("photoUploadSessions").collect()))[0];
  expect(session).toMatchObject({ status: "completed", completedPhotoId: result.photoId });
  const physical = [...store.objects.values()].reduce((sum, object) => sum + object.bytes.length, 0);
  expect((await f.t.run(ctx => ctx.db.query("usageCounters").collect()))[0]).toMatchObject({ storedBytes: physical, reservedBytes: 0, inFlight: 0 });
 }
});

it.each([false, true])("cleanup retry stores the current ordinary attempt with deletion=%s", async enabled => {
 const f = await aiFixture(), first = (await f.begin()).receipts[0]; await f.put(first);
 const oldKey = (await f.t.run(ctx => ctx.db.get(first.uploadSessionId!)))!.originalStorageKey;
 await f.t.run(ctx => ctx.db.patch(first.uploadSessionId!, { expiresAt: 0 }));
 await f.t.mutation(internal.usageLimits.operatorSetDeletionModes, { bucket: enabled, reason: "Synthetic test" });
 await f.t.action(internal.storageDeletion.runSessionDeletion, { sessionId: first.uploadSessionId! });
 expect(store.objects.size).toBe(enabled ? 0 : 1);
 const retry = (await f.begin()).receipts[0]; expect(retry.ok).toBe(true);
 const current = (await f.t.run(ctx => ctx.db.get(retry.uploadSessionId!)))!;
 expect(current.originalStorageKey === oldKey).toBe(!enabled);
 expect((await f.put(retry)).status).toBe(200);
 expect(store.objects.has(current.originalStorageKey)).toBe(true);
 await f.finish(retry.uploadSessionId!);
 expect((await f.t.run(ctx => ctx.db.query("usageCounters").collect()))[0]).toMatchObject({ storedBytes: f.bytes.length, reservedBytes: 0, inFlight: 0 });
 if (enabled) expect((await f.put(first)).status).toBe(400);
});

async function rowSnapshot(f: Awaited<ReturnType<typeof aiFixture>>) {
 return f.t.run(async ctx => Object.fromEntries(await Promise.all([
  ...Object.keys(schema.tables).map(async name => [name, await ctx.db.query(name as "users").collect()]),
  Promise.resolve(["_scheduled_functions", await ctx.db.system.query("_scheduled_functions").collect()]),
  Promise.resolve(["_storage", await ctx.db.system.query("_storage").collect()]),
 ])));
}
it("a PUT capability is the credential; missing, wrong, expired and cross-session capabilities change no rows", async () => {
 const f = await aiFixture(), receipt = (await f.begin()).receipts[0];
 const url = new URL(receipt.uploadUrl!);
 const other = (await f.begin([{ ...f.input, operationId: "other-slot" }])).receipts[0];
 for (const token of [undefined, "incorrect-capability", new URL(other.uploadUrl!).searchParams.get("token")!]) {
  const candidate = new URL(url); if (token) candidate.searchParams.set("token", token); else candidate.searchParams.delete("token");
  const before = await rowSnapshot(f);
  const response = await f.t.fetch(`/ai-upload${candidate.search}`, { method: "PUT", headers: { "Content-Length": String(f.bytes.length) }, body: f.bytes });
  expect(response.status).toBe(400); expect(await rowSnapshot(f)).toEqual(before); expect(store.objects.size).toBe(0);
 }
 expect((await f.put(receipt)).status).toBe(200);
 const session = (await f.t.run(ctx => ctx.db.get(receipt.uploadSessionId!)))!;
 vi.setSystemTime(session.aiUpload!.expiresAt! + 1);
 const before = await rowSnapshot(f); expect((await f.put(receipt)).status).toBe(400); expect(await rowSnapshot(f)).toEqual(before);
});
it("a person or another connection cannot present a capability as its own identity", async () => {
 const f = await aiFixture(), receipt = (await f.begin()).receipts[0];
 for (const identity of [nativeWebsiteIdentity("synthetic-member"), { subject: "synthetic-member", issuer: f.principal.issuer, client_id: "other-client" }, { subject: "other-household-member", issuer: f.principal.issuer, client_id: f.principal.clientId }]) {
  const before = await rowSnapshot(f);
  const response = await f.t.withIdentity(identity).fetch(`/ai-upload${new URL(receipt.uploadUrl!).search}`, { method: "PUT", headers: { "Content-Length": String(f.bytes.length) }, body: f.bytes });
  expect(response.status).toBe(400); expect(await rowSnapshot(f)).toEqual(before); expect(store.objects.size).toBe(0);
 }
});
it("another active connection is refused before the commit handler writes anything", async () => {
 const f = await aiFixture(), receipt = (await f.begin()).receipts[0];
 await f.t.mutation(internal.aiGrants.touchLegacyConnection, { subject: f.principal.subject, clientId: "other-client" });
 const session = (await f.t.run(ctx => ctx.db.get(receipt.uploadSessionId!)))!;
 const { uploadActor } = await import("../../convex/lib/aiUploadSession"); const actor = uploadActor(session);
 actor.uploadAuthorization.principal = { ...f.principal, clientId: "other-client" };
 const before = await rowSnapshot(f);
 await expect(f.t.mutation(internal.photos.tryCompleteUploadSession, { ...f.scope, uploadSessionId: session._id, apiActor: actor })).rejects.toThrow();
 expect(await rowSnapshot(f)).toEqual(before);
});
it.each(["audio", "image"])("revocation during %s validation refuses finish with no writes after revocation", async kind => {
 const f = await aiFixture();
 const bytes = kind === "image" ? new Uint8Array(await (await import("sharp")).default({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer()) : f.bytes;
 const input = { ...f.input, mimeType: kind === "image" ? "image/png" : "audio/wav", sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), width: kind === "image" ? 2 : undefined, height: kind === "image" ? 2 : undefined, audioKind: kind === "image" ? undefined : f.input.audioKind };
 const receipt = (await f.begin([input])).receipts[0]; await f.put(receipt, bytes);
 let cut: Awaited<ReturnType<typeof rowSnapshot>> | undefined;
 store.onHead = async () => { await f.person.mutation(api.aiGrants.revoke, { grantId: f.grantId, expectedVersion: 1 }); cut = await rowSnapshot(f); };
 await expect(f.finish(receipt.uploadSessionId!)).rejects.toThrow();
 expect(cut).toBeDefined(); expect(await rowSnapshot(f)).toEqual(cut);
 expect(await f.t.run(ctx => ctx.db.query("itemPhotos").collect())).toHaveLength(0);
 expect((await f.t.run(ctx => ctx.db.query("usageCounters").collect()))[0]).toMatchObject({ storedBytes: 0, reservedBytes: bytes.length, inFlight: 1 });
 const abandoned = (await f.t.run(ctx => ctx.db.get(receipt.uploadSessionId!)))!;
 const { defaultPhotoUploadCleanupGraceMs } = await import("../../convex/lib/photoCleanup");
 vi.setSystemTime(Math.max(abandoned.expiresAt, abandoned.processingUntil ?? 0) + defaultPhotoUploadCleanupGraceMs + 1);
 for (const enabled of [false, true]) {
  await f.t.mutation(internal.usageLimits.operatorSetDeletionModes, { bucket: enabled, reason: "Synthetic test" });
  await f.t.action(internal.storageDeletion.runSessionDeletion, { sessionId: receipt.uploadSessionId! });
  expect(store.objects.size).toBe(enabled ? 0 : 1);
 }
 expect((await f.t.run(ctx => ctx.db.query("usageCounters").collect()))[0]).toMatchObject({ storedBytes: 0, reservedBytes: 0, inFlight: 0 });
});
it.each(["paused", "expired", "revoked", "power"])("%s blocks every connection write transition with all rows unchanged", async state => {
 const f = await aiFixture(), receipt = (await f.begin()).receipts[0]; await f.put(receipt);
 await f.t.run(async ctx => { const connection = (await ctx.db.query("aiAccessConnections").collect()).find(c => c.grantId === f.grantId)!; await ctx.db.patch(connection._id, { policy: { ...connection.policy!, ...(state === "paused" ? { pausedAt: 1 } : state === "expired" ? { endsAt: 1 } : state === "revoked" ? { revoked: true } : { withheldScopes: ["moving.work.write"] }) } }); });
 const session = (await f.t.run(ctx => ctx.db.get(receipt.uploadSessionId!)))!;
 const { uploadActor } = await import("../../convex/lib/aiUploadSession"); const actor = uploadActor(session);
 const before = await rowSnapshot(f);
 await expect(f.begin()).rejects.toThrow(); expect((await f.put(receipt)).status).toBe(400); await expect(f.finish(receipt.uploadSessionId!)).rejects.toThrow();
 await expect(f.t.mutation(internal.photos.startFinalize, { ...f.scope, uploadSessionId: session._id, apiActor: actor })).rejects.toThrow();
 await expect(f.t.mutation(internal.photos.markAudioValidated, { uploadSessionId: session._id, uploadAuthorization: actor.uploadAuthorization })).rejects.toThrow();
 await expect(f.t.mutation(internal.photos.tryCompleteUploadSession, { ...f.scope, uploadSessionId: session._id, apiActor: actor })).rejects.toThrow();
 expect(await rowSnapshot(f)).toEqual(before);
});

async function lifecycle(route: "person" | "connection", state: "begun" | "stored" | "failed" | "retried" | "completed", enabled: boolean, deletionRetry = false) {
 store.objects.clear(); store.failDelete = false; const f = await aiFixture();
 const bytes = state === "failed" ? f.bytes.subarray(0, 12) : f.bytes;
 const input = { ...f.input, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
 async function begin() {
  if (route === "connection") return (await f.begin([input])).receipts[0];
  const receipt = await f.person.action(api.photos.initUpload, { ...f.scope, operationId: input.operationId, sizeBytes: bytes.length, mimeType: input.mimeType, audioKind: input.audioKind });
  return { uploadSessionId: receipt.uploadSessionId as Id<"photoUploadSessions">, uploadUrl: receipt.uploadUrl };
 }
 async function put(receipt: Awaited<ReturnType<typeof begin>>) {
  if (route === "connection") expect((await f.put(receipt, bytes)).status).toBe(200);
  else await fetch(receipt.uploadUrl!, { method: "PUT", headers: { "Content-Type": input.mimeType }, body: bytes });
 }
 async function finish(receipt: Awaited<ReturnType<typeof begin>>) { return route === "connection" ? f.finish(receipt.uploadSessionId!) : f.person.action(api.photos.finalizeUpload, { ...f.scope, uploadSessionId: receipt.uploadSessionId! }); }
 async function cleanup(receipt: Awaited<ReturnType<typeof begin>>) {
  await f.t.run(ctx => ctx.db.patch(receipt.uploadSessionId!, { expiresAt: 0 }));
  await f.t.action(internal.storageDeletion.runSessionDeletion, { sessionId: receipt.uploadSessionId! });
 }
 await f.t.mutation(internal.usageLimits.operatorSetDeletionModes, { bucket: enabled, reason: "Synthetic test" });
 let receipt = await begin();
 if (state !== "begun") await put(receipt);
 if (state === "failed") await expect(finish(receipt)).rejects.toThrow();
 if (state === "completed") await finish(receipt);
 if (state === "retried") { await cleanup(receipt); receipt = await begin(); await put(receipt); }
 store.failDelete = deletionRetry;
 if (deletionRetry && enabled) await expect(cleanup(receipt)).rejects.toThrow("Synthetic provider unavailable"); else await cleanup(receipt);
 if (deletionRetry) { store.failDelete = false; await cleanup(receipt); }
 const session = (await f.t.run(ctx => ctx.db.get(receipt.uploadSessionId!)))!;
 const reservation = await f.t.run(ctx => ctx.db.get(session.usageReservationId!));
 const counter = (await f.t.run(ctx => ctx.db.query("usageCounters").collect()))[0];
 return { objects: store.objects.size, bytes: [...store.objects.values()].reduce((n, object) => n + object.bytes.length, 0), status: session.status, cleaned: !!session.cleanupCompletedAt, reservation: reservation?.status, stored: counter.storedBytes, reserved: counter.reservedBytes, inFlight: counter.inFlight, photos: (await f.t.run(ctx => ctx.db.query("itemPhotos").collect())).length };
}
it.each([false, true])("existing cleanup has lifecycle parity with deletion=%s", async enabled => {
 for (const state of ["begun", "stored", "failed", "retried", "completed"] as const) {
  const expected = await lifecycle("person", state, enabled);
  expect(await lifecycle("connection", state, enabled)).toEqual(expected);
  if (!enabled && state === "stored") expect(expected.objects).toBe(1);
  if (enabled && state !== "completed") expect(expected).toMatchObject({ objects: 0, stored: 0, reserved: 0, inFlight: 0 });
 }
});
it.each([false, true])("provider deletion retry remains ordinary lifecycle behavior, enabled=%s", async enabled => {
 const actual = await lifecycle("connection", "stored", enabled, true);
 expect(actual).toEqual(await lifecycle("person", "stored", enabled, true));
 if (enabled) expect(actual).toMatchObject({ objects: 0, stored: 0, reserved: 0, inFlight: 0 });
});

it.each(["off", "warn", "on"] as const)("a refused file changes no rows before reservation in %s", async enforcement => {
 const f = await aiFixture(); await f.t.run(ctx => ctx.db.patch(f.settings, { enforcement }));
 for (const input of [{ ...f.input, sizeBytes: canonicalRequestBytes + 1 }, { ...f.input, mimeType: "invalid/example" }, { ...f.input, mimeType: "image/png", audioKind: undefined }, { ...f.input, sha256: "invalid" }]) {
  const before = await rowSnapshot(f); expect((await f.begin([input])).receipts[0].ok).toBe(false); expect(await rowSnapshot(f)).toEqual(before);
 }
 expect((await f.begin()).receipts[0].ok).toBe(true);
});
it.each(["finish", "cancel"])("person %s keeps ordinary authority after the initiating connection is revoked", async operation => {
 const f = await aiFixture(), receipt = (await f.begin()).receipts[0]; await f.put(receipt);
 await f.person.mutation(api.aiGrants.revoke, { grantId: f.grantId, expectedVersion: 1 });
 const args = { ...f.scope, uploadSessionId: receipt.uploadSessionId! };
 if (operation === "finish") {
  const result = await f.person.action(api.photos.finalizeUpload, args);
  expect(await f.t.run(ctx => ctx.db.get(result.photoId as Id<"itemPhotos">))).toMatchObject({ audioValidated: true, usageOwnerId: f.owner });
 } else {
  await f.person.mutation(api.photos.cancelUploadSession, args);
  expect(await f.t.run(ctx => ctx.db.get(receipt.uploadSessionId!))).toMatchObject({ status: "cancelled" });
 }
 expect((await f.t.run(ctx => ctx.db.query("usageCounters").collect()))[0]).toMatchObject({ reservedBytes: 0, inFlight: 0 });
});

it("older upload bridges cannot bypass a bound session using an unbound actor", async () => {
 const f = await aiFixture(), receipt = (await f.begin()).receipts[0]; await f.put(receipt);
 const apiActor = { apiKeyId: "mcp-oauth", createdByUserId: f.member, oauthCaller: { subject: f.principal.subject, claims: { client_id: "other-client" } } };
 const args = { ...f.scope, uploadSessionId: receipt.uploadSessionId!, apiActor };
 const before = await rowSnapshot(f);
 await expect(f.t.action(internal.photos.finalizeUploadForActor, args)).rejects.toThrow();
 await expect(f.t.mutation(internal.photos.tryCompleteUploadSession, args)).rejects.toThrow();
 await expect(f.t.mutation(internal.photos.markUploadSessionFailed, args)).rejects.toThrow();
 const session = (await f.t.run(ctx => ctx.db.get(receipt.uploadSessionId!)))!;
 await expect(f.t.mutation(internal.photos.tryCreateUploadBatch, { requestBytes: 0, files: [{ ...f.scope, operationId: session.operationId!.slice(`${f.moveId}:${f.member}:`.length), originalStorageKey: session.originalStorageKey, originalBucket: session.originalBucket!, expectedMimeType: session.expectedMimeType, expectedSizeBytes: session.expectedSizeBytes, audioKind: session.audioKind, mediaKind: session.mediaKind, expiresAt: session.expiresAt, apiActor }] })).rejects.toThrow();
 expect(await rowSnapshot(f)).toEqual(before);
});

it("operation ids stay opaque and a capability cannot initialize another operation", async () => {
 const f = await aiFixture(); const input = { ...f.input, operationId: `opaque:${f.moveId}:${f.member}:suffix` };
 const receipt = (await f.begin([input])).receipts[0]; expect((await f.put(receipt)).status).toBe(200); await f.finish(receipt.uploadSessionId!);
 expect(await f.t.run(ctx => ctx.db.query("photoUploadSessions").collect())).toHaveLength(1);
 expect(await f.t.run(ctx => ctx.db.query("uploadReservations").collect())).toHaveLength(1);
 const session = (await f.t.run(ctx => ctx.db.get(receipt.uploadSessionId!)))!;
 const { uploadActor } = await import("../../convex/lib/aiUploadSession"); const before = await rowSnapshot(f);
 await expect(f.t.action(internal.photos.initUploadForActor, { ...f.scope, operationId: "different-operation", mimeType: input.mimeType, sizeBytes: input.sizeBytes, audioKind: input.audioKind, apiActor: uploadActor(session) })).rejects.toThrow();
 expect(await rowSnapshot(f)).toEqual(before);
});
