// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
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
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

import { probeUploadBounds } from "../helpers/upload-bound-probe";
it("unset upload bounds match the identical main-checkout probe", async () => {
 const t = convexTest(schema, modules);
 const scope = await t.run(async ctx => {
  const member = await ctx.db.insert("users", { clerkUserId: "synthetic-member", appRole: "member", status: "active", createdAt: 1, updatedAt: 1, lastSeenAt: 1 });
  const householdId = await ctx.db.insert("households", { name: "Example household", ownerUserId: member, createdByUserId: member, createdAt: 1, updatedAt: 1 });
  await ctx.db.insert("householdMemberships", { householdId, userId: member, role: "owner", status: "active", apiAccessStatus: "enabled", createdAt: 1, updatedAt: 1 });
  const moveId = await ctx.db.insert("moves", { householdId, title: "Example move", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: member, createdAt: 1, updatedAt: 1 });
  return { householdId, moveId, member };
 });
 vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
  const url = new URL(String(input)); if (url.hostname !== "storage.invalid" || init?.method !== "PUT") throw new Error("Unexpected external request");
  store.objects.set(decodeURIComponent(url.pathname.slice(1)), { bytes: init.body instanceof Blob ? new Uint8Array(await init.body.arrayBuffer()) : init.body as Uint8Array, mime: (init.headers as Record<string, string>)["Content-Type"] });
  return new Response(null, { status: 200 });
 });
 const result = await probeUploadBounds({ t, person: t.withIdentity(nativeWebsiteIdentity("synthetic-member")), scope: { householdId: scope.householdId, moveId: scope.moveId }, member: scope.member });
 const path = "tests/fixtures/upload-unset-bounds.json";
 if (process.env.UPDATE_UPLOAD_BOUNDS === "1") writeFileSync(path, JSON.stringify(result, null, 2) + "\n");
 expect(result).toEqual(JSON.parse(readFileSync(path, "utf8")));
 for (const values of Object.values(result.website)) expect(values).toEqual([true, false]);
 for (const values of Object.values(result.apiBegin)) expect(values).toEqual([true, false]);
 for (const [name, bounds] of Object.entries(result.tools)) { expect(bounds.policyResolved).toBe(true); if (["upload_evidence_images", "upload_images", "upload_photos"].includes(name)) expect(bounds.maximumItems).toBe(50); }
});
