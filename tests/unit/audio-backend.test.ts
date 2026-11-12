// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { nativeWebsiteIdentity } from "../helpers/website-session";
import { audioResponse } from "../../convex/lib/audioResponse";
import { validateAudioContainer } from "../../convex/lib/media/audio";
import { siteDefaults } from "../../shared/media-limits.mjs";

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
const formats = [["opus.webm", "audio/webm"], ["opus.ogg", "audio/ogg"], ["aac.m4a", "audio/mp4"], ["fragmented.mp4", "audio/mp4"], ["tone.mp3", "audio/mpeg"], ["tone.wav", "audio/wav"], ["tone.flac", "audio/flac"], ["tone.aac", "audio/aac"]] as const;
function audio(name: string) { return new Uint8Array(readFileSync(`tests/fixtures/audio/${name}`)); }
it("verifies the synced audio hash", () => {
  const [header, , ...body] = readFileSync("convex/lib/media/audio.ts", "utf8").split("\n");
  expect(createHash("sha256").update(body.join("\n")).digest("hex")).toBe(header.match(/sha256:(\w+)/)?.[1]);
});
it.each(formats)("accepts complete %s through begin/finish and counts once to the owner", async (name, mime) => {
  const f = await fixture(), bytes = audio(name), upload = await f.begin(bytes, mime);
  const result = await f.finish(upload.session);
  expect((await f.finish(upload.session)).photoId).toBe(result.photoId);
  const photo = await f.t.run(ctx => ctx.db.get(result.photoId as Id<"itemPhotos">));
  expect(photo).toMatchObject({ usageOwnerId: f.owner, audioValidated: true, audioVersionId: "synthetic-version", storedBytes: bytes.length });
  const counters = await f.t.run(ctx => ctx.db.query("usageCounters").collect());
  expect(counters).toHaveLength(1); expect(counters[0]).toMatchObject({ ownerId: f.owner, storedBytes: bytes.length, reservedBytes: 0 });
  expect(store.versionReads.every(v => v === "synthetic-version")).toBe(true);
  expect(Math.max(...store.reads)).toBeLessThanOrEqual(65536);
});
it.each(formats)("refuses header-only and truncated %s without ready media or a held reservation", async (name, mime) => {
  for (const bytes of [audio(name).subarray(0, 12), audio(name).subarray(0, Math.floor(audio(name).length / 2))]) {
    const f = await fixture(), upload = await f.begin(bytes, mime);
    await expect(f.finish(upload.session)).rejects.toMatchObject({ data: { code: "INVALID_AUDIO_CONTAINER", message: "This file can't be added: it isn't a complete audio file." } });
    expect(await f.t.run(ctx => ctx.db.query("itemPhotos").collect())).toHaveLength(0);
    expect(await f.t.run(ctx => ctx.db.get(upload.session))).toMatchObject({ status: "failed", failureCode: "INVALID_AUDIO_CONTAINER" });
    expect((await f.t.run(ctx => ctx.db.query("uploadReservations").collect()))[0].status).toBe("released");
  }
});
it.each([["video.webm", "audio/webm", "AUDIO_HAS_VIDEO"], ["vorbis.ogg", "audio/ogg", "INVALID_AUDIO_CONTAINER"]])("refuses %s with core error data", async (name, mime, code) => {
  const f = await fixture(), upload = await f.begin(audio(name), mime);
  await expect(f.finish(upload.session)).rejects.toMatchObject({ data: { code } });
});
it("checks real duration and the configured cap, releases a final refusal", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch(f.settings, { voiceNoteMaxSeconds: 0.01 }));
  const upload = await f.begin(audio("tone.wav"), "audio/wav", "voicenote");
  await expect(f.finish(upload.session)).rejects.toMatchObject({ data: { code: "AUDIO_TOO_LONG" } });
  expect((await f.t.run(ctx => ctx.db.query("uploadReservations").collect()))[0].status).toBe("released");
  expect(await f.t.run(ctx => ctx.db.query("itemPhotos").collect())).toHaveLength(0);
});
it("refuses before signing bytes over the transport or configured kind cap", async () => {
  const f = await fixture();
  await expect(f.begin(new Uint8Array(1), "audio/wav", undefined, siteDefaults.audio + 1)).rejects.toMatchObject({ data: expect.stringContaining("FILE_TOO_LARGE") });
  await f.t.run(ctx => ctx.db.patch(f.settings, { maxFileBytes: { voicenote: 3 } }));
  await expect(f.begin(new Uint8Array(4), "audio/wav", "voicenote")).rejects.toMatchObject({ data: expect.stringContaining("FILE_TOO_LARGE") });
  expect(await f.t.run(ctx => ctx.db.query("photoUploadSessions").collect())).toHaveLength(0);
  expect(await f.t.run(ctx => ctx.db.query("uploadReservations").collect())).toHaveLength(0);
});
it("will not bypass audio inspection through the old direct commit mutation", async () => {
  const f = await fixture(), upload = await f.begin(audio("tone.wav"), "audio/wav");
  await expect(f.person.mutation(internal.photos.completeUploadSession, { ...f.scope, uploadSessionId: upload.session })).rejects.toMatchObject({ data: { code: "INVALID_AUDIO_CONTAINER" } });
});
it("streams ranges, ignores malformed or multiple ranges and answers unsatisfiable ranges", async () => {
  for (const [range, status, expectedRange] of [["bytes=2-4", 206, "bytes=2-4"], ["bytes=-2", 206, "bytes=8-9"], ["bad", 200, undefined], ["bytes=0-1,3-4", 200, undefined], ["bytes=20-", 416, undefined]] as const) {
    const open = vi.fn(async () => new Response(new Uint8Array(status === 206 ? 3 : 10), { status: status === 206 ? 206 : 200 }));
    const response = await audioResponse(new Request("https://example.invalid", { headers: { Range: range } }), 10, "audio/wav", open);
    expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("private, no-store");
    if (status === 416) { expect(open).not.toHaveBeenCalled(); expect(response.headers.get("content-range")).toBe("bytes */10"); }
    else expect(open).toHaveBeenCalledWith(expectedRange);
  }
});
it("rechecks a person's membership, attachment visibility and expiry when a capability is used", async () => {
  const f = await fixture(), upload = await f.begin(audio("tone.wav"), "audio/wav"), result = await f.finish(upload.session);
  const playback = await f.person.action(api.audioPlayback.playback, { ...f.scope, photoId: result.photoId as Id<"itemPhotos"> });
  const token = new URL(playback.url).pathname.split("/").pop()!;
  expect((await f.t.query(internal.audioPlayback.resolve, { token }))._id).toBe(result.photoId);
  await f.t.run(async ctx => { const row = await ctx.db.query("householdMemberships").withIndex("by_household_user", q => q.eq("householdId", f.householdId).eq("userId", f.member)).unique(); await ctx.db.patch(row!._id, { status: "disabled" }); });
  await expect(f.t.query(internal.audioPlayback.resolve, { token })).rejects.toThrow();
  vi.advanceTimersByTime(6 * 60 * 1000);
  await expect(f.t.query(internal.audioPlayback.resolve, { token })).rejects.toThrow("expired");
});
it("keeps person-only audio and upload functions closed to AI identities", async () => {
  const f = await fixture(), ai = f.t.withIdentity({ subject: "synthetic-member", issuer: "https://synthetic.clerk.accounts.dev", client_id: "synthetic-ai" });
  await expect(ai.action(api.photos.initUpload, { ...f.scope, mimeType: "audio/wav", sizeBytes: 1 })).rejects.toThrow();
  await expect(ai.action(api.audioPlayback.playback, { ...f.scope, photoId: "synthetic" as Id<"itemPhotos"> })).rejects.toThrow();
});
it("bounds heap and array-buffer growth while inspecting an original near the upload cap", async () => {
  const f = await fixture(), size = siteDefaults.audio - 44, header = new Uint8Array(44), view = new DataView(header.buffer);
  header.set(new TextEncoder().encode("RIFF")); view.setUint32(4, size - 8, true); header.set(new TextEncoder().encode("WAVEfmt "), 8); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 48000, true); view.setUint32(28, 96000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); header.set(new TextEncoder().encode("data"), 36); view.setUint32(40, size - 44, true);
  const upload = await f.begin(header, "audio/wav", undefined, size);
  store.objects.set(upload.key, { bytes: header, mime: "audio/wav", size, read: (offset, n) => { const out = new Uint8Array(n); if (offset < header.length) out.set(header.subarray(offset, Math.min(header.length, offset + n))); return out; } });
  const before = process.memoryUsage();
  await f.finish(upload.session);
  const after = process.memoryUsage();
  expect(after.arrayBuffers - before.arrayBuffers).toBeLessThan(size / 2);
  expect(after.heapUsed - before.heapUsed).toBeLessThan(size / 2);
  expect(Math.max(...store.reads)).toBeLessThanOrEqual(65536);
});
it.each(formats)("has a verified duration for %s", async (name, mime) => {
  expect(await validateAudioContainer(audio(name), mime)).toMatchObject({ valid: true });
});
it("links an existing audio attachment to work Queue without changing the capture Queue", async () => {
  const f = await fixture(), upload = await f.begin(audio("tone.wav"), "audio/wav"), result = await f.finish(upload.session);
  const queueItemId = await f.t.run(ctx => ctx.db.insert("queueItems", { ...f.scope, ownerUserId: f.member, createdByUserId: f.member, directive: "Review the attached note", state: "waitingForAi", priority: "normal", contextKind: "move", domainKind: "general", attemptCount: 0, maxAttempts: 3, version: 1, createdAt: 1, updatedAt: 1 }));
  const args = { ...f.scope, queueItemId, photoId: result.photoId as Id<"itemPhotos"> };
  await f.person.mutation(api.queue.attachAudio, args); await f.person.mutation(api.queue.attachAudio, args);
  expect((await f.t.run(ctx => ctx.db.get(queueItemId)))?.attachmentPhotoIds).toEqual([result.photoId]);
  expect(await f.t.run(ctx => ctx.db.query("ingestionQueueEntries").collect())).toHaveLength(0);
});
it("the existing evidence reader returns audio and rechecks the connection grant on playback", async () => {
  const f = await fixture(), upload = await f.begin(audio("tone.wav"), "audio/wav"), result = await f.finish(upload.session);
  const grantId = await f.t.run(ctx => ctx.db.insert("aiGrants", { ownerUserId: f.member, householdId: f.householdId, label: "Example connection", clientId: "synthetic-client", scopes: ["moving.evidence.read"], moveScope: "allMoves", status: "active", consentBoundaryVersion: "synthetic", consentSnapshot: [], approvedAt: 1, useCount: 0, version: 1, createdAt: 1, updatedAt: 1 }));
  for (let i = 0; i < 2; i++) await f.t.mutation(internal.aiGrants.continueBootstrap, { ownerUserId: f.member });
  await f.t.mutation(internal.audioPlayback.mint, { photoId: result.photoId as Id<"itemPhotos">, subject: "synthetic-member", clientId: "synthetic-client", agent: true });
  const read = await f.t.action(internal.mcpToolsImages.getImages, { ...f.scope, caller: { subject: "synthetic-member", claims: { client_id: "synthetic-client" } }, filter: { photoIds: [result.photoId as Id<"itemPhotos">] } });
  const text = JSON.parse(read.__mcpContent[0].text as string);
  expect(text.audio).toHaveLength(1); expect(text.audio[0]).toMatchObject({ photoId: result.photoId, transcript: null, mimeType: "audio/wav" });
  const token = new URL(text.audio[0].url).pathname.split("/").pop()!;
  await f.t.query(internal.audioPlayback.resolve, { token });
  await f.person.mutation(api.aiGrants.revoke, { grantId, expectedVersion: 1 });
  await expect(f.t.query(internal.audioPlayback.resolve, { token })).rejects.toThrow();
});
it("the existing deletion handler lowers the single audio counter after confirmed deletion", async () => {
  const f = await fixture(), upload = await f.begin(audio("tone.wav"), "audio/wav"), result = await f.finish(upload.session), photoId = result.photoId as Id<"itemPhotos">;
  await f.t.run(async ctx => { await ctx.db.patch(upload.session, { expiresAt: 0 }); await ctx.db.patch(photoId, { archivedAt: Date.now(), pendingStorageDeletion: true }); });
  await f.t.mutation(internal.usageLimits.operatorSetDeletionModes, { bucket: true, reason: "Synthetic test" });
  expect(await f.t.action(internal.storageDeletion.deletePhoto, { photoId, dryRun: false })).toMatchObject({ deleted: true });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await f.t.run(ctx => ctx.db.query("usageCounters").collect()))[0].storedBytes).toBe(0);
});
it("keeps the Node audio runtime identical to the synced core", async () => {
  const { execFileSync } = await import("node:child_process");
  expect(() => execFileSync(process.execPath, ["scripts/sync-audio-runtime.mjs", "--check"])).not.toThrow();
});
it.each(formats)("the existing MCP local-file helper carries %s through the authenticated REST handlers", async (name, mimeType) => {
  const f = await fixture();
  const { generateApiKeySecret, apiKeyPrefix, hashApiKey } = await import("../../convex/lib/apiKeys");
  const { uploadEvidenceFile, getInlineImages } = await import("../../mcp-server/assistwithmoving-api.mjs");
  const raw = generateApiKeySecret();
  const keyId = await f.t.run(async ctx => ctx.db.insert("apiKeys", { householdId: f.householdId, name: "Example test connection", prefix: apiKeyPrefix(raw), tokenPreview: "synthetic", secretHash: await hashApiKey(raw), scopes: ["moves/read", "inventory/read", "photos/write"], scopeChoice: "chosen", status: "active", createdByUserId: f.owner, createdAt: Date.now(), updatedAt: Date.now() }));
  await f.t.mutation(internal.apiKeys.connectCallingKey, { apiKeyId: keyId });
  for (let i = 0; i < 2; i++) await f.t.mutation(internal.aiGrants.continueBootstrap, { ownerUserId: f.owner });
  vi.stubGlobal("fetch", async (input: string | URL, options?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "storage.invalid" && options?.method === "PUT") {
      const bytes = options.body as Uint8Array;
      store.objects.set(decodeURIComponent(url.pathname.slice(1)), { bytes, mime: mimeType });
      return new Response(null, { status: 200 });
    }
    if (url.hostname !== "example.invalid") throw new Error("Unexpected external request");
    const args = { method: (options?.method ?? "GET") as "GET" | "POST", path: url.pathname.replace(/^\/api\/v1/, ""), query: Object.fromEntries(url.searchParams), authorization: `Bearer ${raw}`, body: options?.body ? JSON.parse(String(options.body)) : undefined };
    const result = args.path === "/me" ? await f.t.mutation(internal.restApi.handle, args) : await f.t.action(internal.restApiActions.handle, args);
    return Response.json(result.body, { status: result.status });
  });
  try {
    const config = { baseUrl: "https://example.invalid/api/v1", apiKey: raw, mediaIngress: { transport: "stdio" as const, allowedFileRoots: [`${process.cwd()}/tests/fixtures/audio`] } };
    const result = await uploadEvidenceFile(config, { moveId: f.moveId, filePath: `${process.cwd()}/tests/fixtures/audio/${name}`, mimeType, operationId: `synthetic-${name}` });
    expect(result.photoId).toBeTruthy();
    const read = await getInlineImages(config, { moveId: f.moveId, photoIds: [result.photoId] });
    expect(read.audio[0]).toMatchObject({ photoId: result.photoId, mimeType, transcript: null });
    const token = new URL(read.audio[0].url).pathname.split("/").pop()!;
    await f.t.query(internal.audioPlayback.resolve, { token });
    await f.t.run(async ctx => { const connection = await ctx.db.query("aiAccessConnections").withIndex("by_owner_client", q => q.eq("ownerUserId", f.owner).eq("verifiedClientId", `key:${keyId}`)).unique(); await ctx.db.patch(connection!._id, { policy: { ...connection!.policy!, revoked: true } }); });
    await expect(f.t.query(internal.audioPlayback.resolve, { token })).rejects.toThrow();
  } finally { vi.unstubAllGlobals(); }
});
it("accepts a voice note with indeterminate duration by size alone", async () => {
  const bytes = audio("aac.m4a");
  const label = new TextEncoder().encode("elst");
  const at = bytes.findIndex((_, i) => label.every((b, n) => bytes[i + n] === b));
  expect(at).toBeGreaterThan(0);
  // Change only the edit-list playback rate, which makes a single duration
  // indeterminate while leaving the complete AAC sample structure intact.
  new DataView(bytes.buffer).setInt16(at + 20, 2);
  expect(await validateAudioContainer(bytes, "audio/mp4")).toMatchObject({ valid: true, durationSeconds: null });
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch(f.settings, { voiceNoteMaxSeconds: 0.001 }));
  const upload = await f.begin(bytes, "audio/mp4", "voicenote");
  expect((await f.finish(upload.session)).photoId).toBeTruthy();
});
it("serves audio Range requests through the registered HTTP playback handler", async () => {
  const f = await fixture(), bytes = audio("tone.wav"), upload = await f.begin(bytes, "audio/wav"), result = await f.finish(upload.session);
  const playback = await f.person.action(api.audioPlayback.playback, { ...f.scope, photoId: result.photoId as Id<"itemPhotos"> });
  const token = new URL(playback.url).pathname.split("/").pop()!;
  vi.stubGlobal("fetch", async (input: string | URL, options?: RequestInit) => {
    if (!String(input).startsWith("https://storage.invalid/")) throw new Error("Unexpected external request");
    const range = (options?.headers as Record<string, string>)?.Range;
    const match = /bytes=(\d+)-(\d+)/.exec(range ?? "");
    return new Response(match ? bytes.subarray(Number(match[1]), Number(match[2]) + 1) : bytes, { status: match ? 206 : 200 });
  });
  try {
    for (const [range, status] of [["bytes=0-3", 206], ["unsupported", 200], ["bytes=999999-", 416]] as const) {
      const response = await f.t.fetch(`/audio/playback?token=${token}`, { headers: { Range: range } });
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      if (status === 206) expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes.subarray(0, 4));
    }
  } finally { vi.unstubAllGlobals(); }
});
