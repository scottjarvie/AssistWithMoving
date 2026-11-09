// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import * as history from "../../convex/lib/connectionHistory";
import { accessFixture } from "../helpers/ai-access";
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe("API-key shared authority and rotation", () => {
  it.each(["revoked", "paused", "expired"])("cannot rotate a %s connection into wider access", async state => {
    const f = await accessFixture();
    const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Key" });
    const row = (await f.person.query(api.connectionSettings.list, {})).connections[0];
    await f.person.mutation(api.connectionSettings.change, { connectionId: row.id, expectedVersion: row.version, opId: "stop", action: state === "expired" ? "limits" : state === "revoked" ? "revoke" : "pause", ...(state === "expired" ? { expiresAt: Date.now() + 1000 } : {}) });
    if (state === "expired") vi.setSystemTime(Date.now() + 1001);
    const before = await f.root();
    await expect(f.person.mutation(api.apiKeys.rotate, { householdId: f.householdId, apiKeyId: key.apiKeyId, expectedVersion: before!.revision })).rejects.toThrow(new RegExp(`${state}.*Restore.*website`));
    expect(await f.root()).toEqual(before);
  });
  it("preserves selected powers and date, retires the old secret, and never stores the new raw secret", async () => {
    const f = await accessFixture(); const end = Date.now() + 60000;
    const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Read key", scopes: ["moves/read"], expiresAt: end });
    const rotated = await f.person.mutation(api.apiKeys.rotate, { householdId: f.householdId, apiKeyId: key.apiKeyId, expectedVersion: (await f.root())!.revision });
    expect(rotated.rawKey).toMatch(/^mmk_/); expect(rotated.scopes).toEqual(["moves/read"]);
    expect((await f.request(key.rawKey, "GET", "moves")).status).toBe(403);
    expect((await f.request(rotated.rawKey, "GET", "moves")).status).toBe(200);
    const stored = (await f.t.run(ctx => ctx.db.get(rotated.apiKeyId)))!;
    expect(stored.expiresAt).toBe(end); expect(JSON.stringify(stored)).not.toContain(rotated.rawKey);
    const old = (await f.t.run(ctx => ctx.db.get(key.apiKeyId)))!; expect(old.credentialRetiredAt).toBe(Date.now());
    const history = await f.person.query(api.connectionSettings.list, { superseded: true });
    await expect(f.person.mutation(api.connectionSettings.change, { connectionId: history.connections[0].id, expectedVersion: history.connections[0].version, action: "restore", opId: "restore-retired" })).rejects.toThrow(/rotated credential stays retired/);
  });
  it("rotation checks the currently loaded revision", async () => {
    const f = await accessFixture(); const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Key" });
    await expect(f.person.mutation(api.apiKeys.rotate, { householdId: f.householdId, apiKeyId: key.apiKeyId, expectedVersion: 0 })).rejects.toThrow(/changed.*Reload Settings/);
  });
  it.each(["membership-disabled", "membership-removed", "agent-disabled", "user-disabled"])("rechecks live access: %s", async why => {
    const f = await accessFixture(); const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Key" });
    await f.t.run(async ctx => { if (why === "membership-removed") await ctx.db.delete(f.membershipId); else if (why === "user-disabled") await ctx.db.patch(f.userId, { status: "disabled" }); else await ctx.db.patch(f.membershipId, why === "agent-disabled" ? { apiAccessStatus: "disabled" } : { status: "disabled" }); });
    const response = await f.request(key.rawKey, "GET", "moves"); expect(response.status).toBe(403); expect(JSON.stringify(response.body)).toMatch(/no longer has active household access|turned off/);
    expect((await f.t.run(ctx => ctx.db.get(key.apiKeyId)))!.lastUsedAt).toBeUndefined();
    expect((await f.request(key.rawKey, "GET", "me")).status).toBe(200);
  });
  it("records last use only on a successful authenticated call", async () => {
    const f = await accessFixture(); const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Key", scopes: ["moves/read"] });
    expect((await f.request(key.rawKey, "POST", `moves/${f.moveId}/inventory`, { name: "No" })).status).toBe(403);
    expect((await f.t.run(ctx => ctx.db.get(key.apiKeyId)))!.lastUsedAt).toBeUndefined();
    expect((await f.request(key.rawKey, "GET", "moves")).status).toBe(200);
    expect((await f.t.run(ctx => ctx.db.get(key.apiKeyId)))!.lastUsedAction).toBe("GET /api/v1/moves");
  });
  it.each(["pause", "revoke"])("scope-free inspection and narrow-only control survive %s", async action => {
    const f = await accessFixture(); const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Key" });
    expect((await f.request(key.rawKey, "POST", "me/access", { expectedVersion: (await f.root())!.revision, opId: action, action })).status).toBe(200);
    const inspected = await f.request(key.rawKey, "GET", "me"); expect(inspected.status).toBe(200);
    expect(inspected.body).toMatchObject({ data: { household: null, apiKey: { status: action === "pause" ? "paused" : "revoked", scopes: [], settings: "https://movingmanifest.com/settings/ai" } } });
    expect((await f.request(key.rawKey, "GET", "moves")).status).toBe(403);
    const widen = await f.request(key.rawKey, "POST", "me/access", { expectedVersion: (await f.root())!.revision, opId: "restore", action: "restore" });
    expect(JSON.stringify(widen.body)).toContain("only reduce");
  });
  it("every API-key door blocks household invitations even with the full catalog", async () => {
    const f = await accessFixture(); const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Key" });
    for (const path of [`households/${f.householdId}/members`]) {
      const response = await f.request(key.rawKey, "POST", path, { email: "new@example.test", permission: "viewer" });
      expect(response.status).toBe(403); expect(JSON.stringify(response.body)).toContain("website-only");
    }
  });
});

it("REST rolls back a self-reduction if its private history write fails", async () => {
  const f = await accessFixture(); const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Atomic key" });
  const before = await f.root();
  vi.spyOn(history, "connectionChange").mockRejectedValueOnce(new Error("Synthetic receipt failure"));
  const response = await f.request(key.rawKey, "POST", "me/access", { expectedVersion: before!.revision, opId: "atomic", action: "revoke" });
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(response.body)).toContain("Synthetic receipt failure");
  expect(await f.root()).toEqual(before);
});

it("archives both box-unassignment paths with full provenance and can restore quantity and notes", async () => {
  const f = await accessFixture(); const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Archive key" });
  const itemResult = await f.request(key.rawKey, "POST", `moves/${f.moveId}/items`, { name: "Three books", quantity: 3 });
  const boxResult = await f.request(key.rawKey, "POST", `moves/${f.moveId}/boxes`, { label: "Books" });
  expect(itemResult.status).toBe(201); expect(boxResult.status).toBe(201);
  const itemId = (itemResult.body as { data: { itemId: string } }).data.itemId;
  const boxId = (boxResult.body as { data: { boxId: string } }).data.boxId;
  for (const pathKind of ["assignment", "box"]) {
    const created = await f.request(key.rawKey, "POST", `moves/${f.moveId}/assignments`, { itemId, boxId, quantity: 3, notes: "Keep this exact note" });
    const assignmentId = (created.body as { data: { assignmentId: string } }).data.assignmentId;
    const removed = await f.request(key.rawKey, "DELETE", pathKind === "assignment" ? `moves/${f.moveId}/assignments/${assignmentId}` : `boxes/${boxId}/items/${itemId}`);
    expect(removed.status).toBe(200);
    const archiveId = (removed.body as { data: { archiveId: string } }).data.archiveId;
    const archived = await f.t.run(ctx => ctx.db.query("archivedBoxAssignments").collect());
    expect(archived.find(row => row._id === archiveId)).toMatchObject({ originalAssignmentId: assignmentId, source: { quantity: 3, notes: "Keep this exact note", itemId, boxId }, archivedByApiKeyId: key.apiKeyId });
    const restored = await f.request(key.rawKey, "POST", `moves/${f.moveId}/assignments/${archiveId}/restore`);
    expect(restored.status).toBe(200);
    expect((await f.t.run(ctx => ctx.db.query("boxItems").collect()))[0]).toMatchObject({ quantity: 3, notes: "Keep this exact note", itemId, boxId });
  }
});

it("REST cannot retain a partial legacy bootstrap when its system receipt fails", async () => {
  const f = await accessFixture(); await f.legacyGrant({ scopes: ["moving.context.read"] }); const key = await f.legacyKey();
  vi.spyOn(history, "connectionChange").mockRejectedValueOnce(new Error("Synthetic bootstrap receipt failure"));
  const response = await f.request(key.rawKey, "GET", "me");
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(await f.root()).toBeNull();
  vi.restoreAllMocks();
  await f.request(key.rawKey, "GET", "me"); await f.finish();
  expect((await f.root())!.withheldScopes).toContain("inventory/write");
});

it("preserves move-only participation without exposing the household, and checks its agent switch", async () => {
  const f = await accessFixture(); const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, moveId: f.moveId, name: "Move-only key" });
  const participant = await f.t.run(async ctx => { await ctx.db.patch(f.membershipId, { status: "disabled" }); return ctx.db.insert("moveParticipants", { householdId: f.householdId, moveId: f.moveId, userId: f.userId, role: "editor", accessKind: "moveOnly", participantType: "helper", status: "active", agentAccessStatus: "enabled", createdAt: Date.now(), updatedAt: Date.now() }); });
  expect((await f.request(key.rawKey, "GET", `moves/${f.moveId}/items`)).status).toBe(200);
  expect((await f.request(key.rawKey, "GET", "me")).body).toMatchObject({ data: { household: null } });
  await f.t.run(ctx => ctx.db.patch(participant, { agentAccessStatus: "disabled" }));
  expect((await f.request(key.rawKey, "GET", `moves/${f.moveId}/items`)).status).toBe(403);
});
