// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { accessFixture } from "../helpers/ai-access";
import * as publicPackets from "../../convex/publicPackets";
import type { MutationCtx } from "../../convex/_generated/server";
beforeEach(() => { vi.useFakeTimers(); vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://clerk.test"); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
async function sharedFixture() {
  const f = await accessFixture(); const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Publisher" });
  const created = await f.request(key.rawKey, "POST", `moves/${f.moveId}/items`, { name: "Chair", description: "Clean stored description" });
  expect(created.status).toBe(201);
  const item = (await f.t.run(ctx => ctx.db.query("items").collect()))[0];
  const profileId = await f.t.run(ctx => ctx.db.insert("documentationProfiles", { householdId: f.householdId, moveId: f.moveId, type: "movingCompany", name: "Packing packet", status: "active", includedFields: ["items"], imageRule: "none", filters: {}, allowedActions: ["view"], exportHistory: [], createdByUserId: f.userId, createdAt: Date.now(), updatedAt: Date.now() }));
  expect((await f.request(key.rawKey, "POST", `moves/${f.moveId}/share-links`, { documentationProfileId: profileId })).status).toBe(201);
  const link = (await f.t.run(ctx => ctx.db.query("shareLinks").collect()))[0];
  await f.connect();
  const principal = { issuer: "https://clerk.test", subject: "awl-owner", clientId: "ai-one" };
  const caller = { subject: "awl-owner", claims: { azp: "ai-one" } };
  const save = (description: string, extra = {}) => f.t.mutation(internal.mcpPlanning.saveInventory, { principal, moveId: f.moveId, operationId: `save-${description.length}`, requestHash: description, items: [{ itemId: item._id, expectedUpdatedAt: item.updatedAt, description }], reason: "Update stored item details", ...extra });
  return { ...f, key, item, profileId, link, principal, caller, save };
}
it("canonical edits check the stored outgoing packet and roll back secrets", async () => {
  const f = await sharedFixture();
  await expect(f.save("password=should_not_commit")).rejects.toThrow(/Publishing refused/);
  expect((await f.t.run(ctx => ctx.db.get(f.item._id)))!.description).toBe("Clean stored description");
  expect(await f.t.run(ctx => ctx.db.query("mcpOperations").collect())).toHaveLength(0);
  await expect(f.save("shop@example.test")).rejects.toThrow(/1 email addresses/);
  await expect(f.save("shop@example.test", { acknowledgeContactDetails: { emails: 999, phones: 999, addresses: 999 } })).rejects.toThrow(/exact counts/);
  await f.save("shop@example.test", { acknowledgeContactDetails: { emails: 1, phones: 0, addresses: 0 } });
  expect((await f.t.run(ctx => ctx.db.get(f.item._id)))!.description).toBe("shop@example.test");
  expect((await f.t.run(ctx => ctx.db.query("auditLogs").collect())).some(row => row.action === "share_link.content_published" && row.actorType === "agent")).toBe(true);
  expect((await f.t.run(ctx => ctx.db.query("aiConnectionChanges").collect())).some(row => row.message.includes("published an update"))).toBe(true);
});
it("legacy edits and additions into an already shared packet run the same transaction check", async () => {
  const f = await sharedFixture();
  await expect(f.t.mutation(internal.mcpToolsWrite.upsertItems, { caller: f.caller, householdId: f.householdId, moveId: f.moveId, items: [{ itemId: f.item._id, name: "Chair", description: "auth_token: secret_value" }] })).rejects.toThrow(/Publishing refused/);
  await expect(f.t.mutation(internal.mcpToolsWrite.upsertItems, { caller: f.caller, householdId: f.householdId, moveId: f.moveId, items: [{ name: "sk_live_secret123456" }] })).rejects.toThrow(/Publishing refused/);
  expect(await f.t.run(ctx => ctx.db.query("items").collect())).toHaveLength(1);
});
it("REST edits and additions roll back even though the outer door returns an error response", async () => {
  const f = await sharedFixture();
  for (const [method, path, body] of [["PATCH", `moves/${f.moveId}/items/${f.item._id}`, { description: "db_password=secret_value" }], ["POST", `moves/${f.moveId}/items`, { name: "Secret chair", description: "xoxb-secret123456" }]] as const) {
    const result = await f.request(f.key.rawKey, method, path, body);
    expect(result.status).toBe(400); expect(JSON.stringify(result.body)).toContain("Publishing refused");
  }
  expect(await f.t.run(ctx => ctx.db.query("items").collect())).toHaveLength(1);
  expect((await f.t.run(ctx => ctx.db.get(f.item._id)))!.description).toBe("Clean stored description");
  const flagged = await f.request(f.key.rawKey, "PATCH", `moves/${f.moveId}/items/${f.item._id}`, { description: "shop@example.test" }); expect(flagged.status).toBe(400);
  expect((await f.request(f.key.rawKey, "PATCH", `moves/${f.moveId}/items/${f.item._id}`, { description: "shop@example.test", acknowledgeContactDetails: { emails: 1, phones: 0, addresses: 0 } })).status).toBe(200);
});
it("restoring archived shared content refuses secrets and offers a private restore", async () => {
  const f = await sharedFixture();
  await f.t.run(ctx => ctx.db.patch(f.item._id, { deletedAt: Date.now(), description: "password=secret_value" }));
  const restore = (extra = {}) => f.t.mutation(internal.mcpArchive.archiveMoveRecords, { principal: f.principal, moveId: f.moveId, operationId: "restore-item", action: "restore", records: [{ kind: "item", id: f.item._id }], reason: "Recover archived belonging", ...extra });
  await expect(restore()).rejects.toThrow(/restorePrivately/);
  expect((await f.t.run(ctx => ctx.db.get(f.item._id)))!.deletedAt).toBeDefined();
  await restore({ restorePrivately: true });
  expect((await f.t.run(ctx => ctx.db.get(f.item._id)))!.deletedAt).toBeUndefined();
  expect((await f.t.run(ctx => ctx.db.get(f.link._id)))!.status).toBe("revoked");
});
it("restore requires current publish power; private restore only needs active access plus archive authority", async () => {
  const f = await sharedFixture();
  await f.t.run(ctx => ctx.db.patch(f.item._id, { deletedAt: Date.now() }));
  await f.reduce({ opId: "remove-publish", scopes: ["moving.archive"] });
  const restore = (restorePrivately = false) => f.t.mutation(internal.mcpArchive.archiveMoveRecords, { principal: f.principal, moveId: f.moveId, operationId: "restore-item", action: "restore", records: [{ kind: "item", id: f.item._id }], reason: "Recover archived belonging", restorePrivately });
  await expect(restore()).rejects.toThrow(/missing power moving.work.write/);
  await restore(true);
  expect((await f.t.run(ctx => ctx.db.get(f.link._id)))!.status).toBe("revoked");
});
it("rechecks the current publish power after building the resulting packet in the same transaction", async () => {
  const f = await sharedFixture(); const row = (await f.person.query(api.connectionSettings.list, {})).connections.find(row => row.kind === "key")!;
  const original = publicPackets.previewPublicPacket; let previews = 0;
  vi.spyOn(publicPackets, "previewPublicPacket").mockImplementation(async (ctx, args) => {
    const result = await original(ctx, args); previews++;
    if (previews === 2) { const m = ctx as MutationCtx; const connection = (await m.db.get(row.id))!; await m.db.patch(row.id, { policy: { ...connection.policy!, withheldScopes: ["exports/create"], revision: 2 } }); }
    return result;
  });
  const result = await f.request(f.key.rawKey, "PATCH", `moves/${f.moveId}/items/${f.item._id}`, { description: "Clean changed content" });
  expect(result.status).toBe(403); expect(JSON.stringify(result.body)).toContain("exports/create");
  expect((await f.t.run(ctx => ctx.db.get(f.item._id)))!.description).toBe("Clean stored description");
});
it("private writes with no outgoing change remain available without the publish power", async () => {
  const f = await sharedFixture();
  await f.request(f.key.rawKey, "POST", "me/access", { opId: "no-publish", expectedVersion: 1, scopes: ["inventory/write", "moves/read"] });
  expect((await f.request(f.key.rawKey, "PATCH", `moves/${f.moveId}/items/${f.item._id}`, { description: "New visible description" })).status).toBe(403);
  await f.t.run(ctx => ctx.db.patch(f.link._id, { status: "revoked", revokedAt: Date.now() }));
  expect((await f.request(f.key.rawKey, "PATCH", `moves/${f.moveId}/items/${f.item._id}`, { description: "Private secret password=allowed_privately" })).status).toBe(200);
});
it("moving a private item into a shared selection and widening that selection both run the full check", async () => {
  const f = await sharedFixture();
  await f.t.run(async ctx => { await ctx.db.patch(f.profileId, { filters: { room: "Shared room" } }); await ctx.db.patch(f.item._id, { room: "Private room", description: "auth_token: hidden_value" }); });
  const moved = await f.request(f.key.rawKey, "PATCH", `moves/${f.moveId}/items/${f.item._id}`, { room: "Shared room" });
  expect(moved.status).toBe(400); expect(JSON.stringify(moved.body)).toContain("Publishing refused");
  expect((await f.t.run(ctx => ctx.db.get(f.item._id)))!.room).toBe("Private room");
  const widened = await f.request(f.key.rawKey, "PATCH", `moves/${f.moveId}/documentation-profiles/${f.profileId}`, { filters: {} });
  expect(widened.status).toBe(400); expect(JSON.stringify(widened.body)).toContain("Publishing refused");
  expect((await f.t.run(ctx => ctx.db.get(f.profileId)))!.filters).toEqual({ room: "Shared room" });
});
it("restoring an archived profile never reactivates an unscanned link; private restore revokes it", async () => {
  const f = await sharedFixture();
  await f.t.run(ctx => ctx.db.patch(f.profileId, { status: "archived", archivedAt: Date.now(), disclaimer: "AWS_SECRET_ACCESS_KEY=hidden_value" }));
  const path = `moves/${f.moveId}/documentation-profiles/${f.profileId}`;
  const refused = await f.request(f.key.rawKey, "PATCH", path, { status: "active" });
  expect(refused.status).toBe(400); expect(JSON.stringify(refused.body)).toContain("restorePrivately");
  expect((await f.t.run(ctx => ctx.db.get(f.profileId)))!.status).toBe("archived");
  expect((await f.request(f.key.rawKey, "PATCH", path, { status: "active", restorePrivately: true })).status).toBe(200);
  expect((await f.t.run(ctx => ctx.db.get(f.link._id)))!.status).toBe("revoked");
});
it("nested REST Layout Studio writes cannot publish through a child mutation that escaped the parent guard", async () => {
  const f = await sharedFixture();
  const planId = await f.t.run(ctx => ctx.db.insert("floorPlans", { householdId: f.householdId, moveId: f.moveId, name: "Shared plan", kind: "destination", status: "active", northAngleDeg: 0, defaultWallThicknessIn: 4.5, defaultCeilingHeightIn: 96, gridSnapIn: 3, shortIdCounters: { nextWall: 1, nextRoom: 1, nextOpening: 1, nextFeature: 1, nextZone: 1, nextAnnotation: 1, nextPlacement: 1 }, nextSeq: 1, createdByUserId: f.userId, createdAt: Date.now(), updatedAt: Date.now() }));
  expect((await f.request(f.key.rawKey, "POST", `moves/${f.moveId}/share-links`, { allowedActions: ["viewPlan"] })).status).toBe(201);
  const result = await f.request(f.key.rawKey, "POST", `plans/${planId}/ops`, { batchId: "unsafe-level", ops: [{ type: "createLevel", level: { name: "db_password=hidden_value", levelType: "indoor", sortOrder: 0 } }] });
  expect(result.status).toBe(400); expect(JSON.stringify(result.body)).toContain("Publishing refused");
  expect(await f.t.run(ctx => ctx.db.query("planLevels").collect())).toEqual([]);
});
