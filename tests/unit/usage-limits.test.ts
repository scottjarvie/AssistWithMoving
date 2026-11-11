// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { reserveUpload, commitUpload, releaseUpload, storagePlan, summaryFor, addStoredCopy } from "../../convex/usageLimits";
import { emptyCounters } from "../../convex/lib/usageLimits/core";
const modules = import.meta.glob("../../convex/**/*.ts");
async function fixture(mode: "off" | "warn" | "on" = "on", ready = true) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const owner = await ctx.db.insert("users", { clerkUserId: "synthetic-owner", name: "Synthetic", appRole: "member", status: "active", createdAt: now, updatedAt: now, lastSeenAt: now });
    const household = await ctx.db.insert("households", { name: "Synthetic", ownerUserId: owner, createdByUserId: owner, createdAt: now, updatedAt: now });
    await ctx.db.insert("householdBillingProfiles", { householdId: household, tier: "free", provider: "none", status: "none", createdAt: now, updatedAt: now });
    await ctx.db.insert("usageLimitSettings", { key: "site", planStoredBytes: { free: 100, pro: 1000 }, enforcement: mode, updatedAt: now, updatedBy: owner });
    const counter = await ctx.db.insert("usageCounters", { ownerId: owner, ...emptyCounters(now), ready, revision: 0, updatedAt: now });
    return { owner, household, counter };
  });
  return { t, ...ids };
}
describe("Moving storage adapter", () => {
  it("maps every paid plan and administrators to Pro", () => {
    expect(storagePlan("free", false)).toBe("free");
    for (const plan of ["launch", "plus", "pro", "unlimited"]) expect(storagePlan(plan, false)).toBe("pro");
    expect(storagePlan("free", true)).toBe("pro");
  });
  it("reserves once, rechecks larger finish, counts copies and releases once", async () => {
    const f = await fixture();
    const id = await f.t.run(ctx => reserveUpload(ctx, f.household, "op", 80, "image"));
    expect(await f.t.run(ctx => reserveUpload(ctx, f.household, "op", 80, "image"))).toBe(id);
    await expect(f.t.run(ctx => commitUpload(ctx, f.household, id, 110))).rejects.toThrow();
    await f.t.run(ctx => commitUpload(ctx, f.household, id, 75));
    await f.t.run(ctx => commitUpload(ctx, f.household, id, 75));
    await f.t.run(ctx => addStoredCopy(ctx, f.household, 20));
    expect((await f.t.run(ctx => summaryFor(ctx, f.household))).usedBytes).toBe(95);
    await expect(f.t.run(ctx => reserveUpload(ctx, f.household, "no-room", 10, "image"))).rejects.toThrow(/remaining/);
    const small = await f.t.run(ctx => reserveUpload(ctx, f.household, "small", 5, "image"));
    await f.t.run(async ctx => { await releaseUpload(ctx, small); await releaseUpload(ctx, small); });
    expect((await f.t.run(ctx => summaryFor(ctx, f.household))).usedBytes).toBe(95);
  });
  it.each([["warn", true], ["on", false], ["off", true]] as const)("never refuses %s, ready %s", async (mode, ready) => {
    const f = await fixture(mode, ready);
    await f.t.run(ctx => reserveUpload(ctx, f.household, "over", 200, "image"));
    expect((await f.t.run(ctx => summaryFor(ctx, f.household))).usedBytes).toBe(200);
  });
  it("expires reservations and permits retry without a second attempt charge", async () => {
    const f = await fixture();
    const id = await f.t.run(ctx => reserveUpload(ctx, f.household, "op", 80, "image"));
    await f.t.run(ctx => ctx.db.patch(id, { expiresAt: 0 }));
    await f.t.mutation(internal.usageLimits.expireReservations, {});
    expect((await f.t.run(ctx => summaryFor(ctx, f.household))).usedBytes).toBe(0);
    await f.t.run(ctx => reserveUpload(ctx, f.household, "op", 80, "image"));
    expect((await f.t.run(ctx => ctx.db.get(f.counter)))?.dayUploads).toBe(1);
  });
  it("uses personal overrides and file cap settings", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.insert("usageLimitOverrides", { ownerId: f.owner, storedBytesPerUser: 500, maxFileBytes: { image: 10 }, reason: "Synthetic test", updatedAt: Date.now(), updatedBy: f.owner }));
    expect((await f.t.run(ctx => summaryFor(ctx, f.household))).capBytes).toBe(500);
    await expect(f.t.run(ctx => reserveUpload(ctx, f.household, "large", 11, "image"))).rejects.toThrow(/FILE_TOO_LARGE/);
  });
  it("verifies the synced core hash", () => {
    const core = readFileSync("convex/lib/usageLimits/core.ts", "utf8");
    const [header, , ...body] = core.split("\n");
    expect(createHash("sha256").update(body.join("\n")).digest("hex")).toBe(header.match(/sha256:(\w+)/)?.[1]);
  });
});

it("pages a recount beyond 100 source rows and rejects a racing counter revision", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    const moveId = await ctx.db.insert("moves", { householdId: f.household, title: "Synthetic", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: f.owner, createdAt: 0, updatedAt: 0 });
    for (let i = 0; i < 205; i++) await ctx.db.insert("itemPhotos", { householdId: f.household, moveId, originalStorageKey: `synthetic/${i}`, originalBucket: "synthetic", derivativeRefs: {}, documentationProfileTypes: [], mimeType: "image/jpeg", sizeBytes: 2, storedBytes: 2, photoType: "other", privacyLevel: "normal", visibilityScope: "moveCollaborators", source: "manualUpload", exifHandlingStatus: "pending", confidence: "none", verificationStatus: "unreviewed", aiProcessed: false, uploadedByUserId: f.owner, createdAt: i, updatedAt: i });
  });
  let cursor: string | null = null, pages = 0, bytes = 0;
  for (;;) {
    const page: { bytes: number; cursor: string; isDone: boolean } = await f.t.query(internal.usageLimits.metadataPage, { ownerId: f.owner, cursor });
    pages++; bytes += page.bytes;
    if (page.isDone) break;
    cursor = page.cursor;
  }
  expect(pages).toBeGreaterThan(1); expect(bytes).toBe(410);
  const snapshot = await f.t.mutation(internal.usageLimits.beginRecountPage, { ownerId: f.owner });
  await f.t.run(ctx => addStoredCopy(ctx, f.household, 1));
  expect(await f.t.mutation(internal.usageLimits.finishRecountPage, { ownerId: f.owner, ...snapshot, nextCursor: "end", bytes: 410, done: true })).toEqual({ done: false, restarted: true });
});

it("keeps family storage allowance literals out of site logic", async () => {
  const { readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  function files(dir: string): string[] { return readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? files(path) : /\.[cm]?[jt]sx?$/.test(path) ? [path] : []; }); }
  for (const path of [...files("convex"), ...files("src"), ...files("mcp-server")]) {
    if (path === "convex/lib/usageLimits/core.ts" || /\.(test|spec)\./.test(path)) continue;
    expect(readFileSync(path, "utf8"), path).not.toMatch(/\b(?:1_000_000_000|10_000_000_000|1000000000|10000000000|1073741824|10737418240)\b/);
  }
});
