// @vitest-environment node
/** Real pre-deploy rows, not new grants patched after bootstrap. The approved
 * one-time import replaces the old capped-history/independent-alias tests. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { movingScopes } from "../../convex/lib/aiGrants";
import { accessFixture } from "../helpers/ai-access";
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe("one-time complete indexed legacy bootstrap", () => {
  it.each(["unbound", "name-equals-id", "different-name", "no-name"])("inherits a legacy revoke: %s", async shape => {
    const f = await accessFixture();
    const source = await f.legacyGrant({ ...(shape === "unbound" ? {} : { clientId: "old-id", ...(shape === "no-name" ? {} : { observedClientName: shape === "name-equals-id" ? "old-id" : "Different app" }) }), status: "revoked", revokedAt: Date.now() - 50 });
    expect(await f.connect("new-id", "New name")).toMatchObject({ status: "initializing", scopes: [] });
    await f.finish();
    expect(await f.connect("new-id", "Other name")).toMatchObject({ status: "revoked", scopes: [], changedAt: Date.now() - 50 });
    expect((await f.root())!.entries).toEqual(expect.arrayContaining([expect.objectContaining({ sourceGrantId: String(source), sourceRevision: 1, revoked: true })]));
    expect(await f.connect("third")).toMatchObject({ status: "revoked" });
  });
  it("checkpoints every grant and key with no cap, stays stopped through partial pages, and keeps every restricted entry", async () => {
    const f = await accessFixture();
    for (let i = 0; i < 205; i++) await f.legacyGrant({ clientId: `legacy-${i}`, scopes: ["moving.context.read"], status: i === 204 ? "revoked" : "active" });
    for (let i = 0; i < 103; i++) await f.legacyKey({ expiresAt: Date.now() - 1, pausedAt: i === 102 ? Date.now() - 20 : undefined });
    await f.connect("new");
    let previousEntries = 0, accesses = 0;
    while (!(await f.root())!.bootstrapped) {
      const root = (await f.root())!;
      expect(root.entries.length).toBeGreaterThanOrEqual(previousEntries); previousEntries = root.entries.length;
      expect((await f.t.query(internal.aiGrants.describeConnection, { subject: "awl-owner", clientId: "new" })).scopes).toEqual([]);
      await f.t.mutation(internal.aiGrants.continueBootstrap, { ownerUserId: f.userId }); accesses++;
    }
    expect(accesses).toBeGreaterThan(2);
    const root = (await f.root())!;
    expect(root.entries).toHaveLength(205); expect(root.revoked).toBe(true); expect(root.pausedAt).toBeUndefined(); expect(root.endsAt).toBeUndefined();
    expect(await f.connect("new")).toMatchObject({ status: "revoked", scopes: [] });
    const unchanged = await f.root(); await f.finish(); expect(await f.root()).toEqual(unchanged);
  });
  it.each(["revoked", "paused", "expired", "narrowed"])("retains legacy API key %s independently of OAuth on first access", async state => {
    const f = await accessFixture();
    const key = await f.legacyKey({ ...(state === "revoked" ? { status: "revoked" } : state === "paused" ? { pausedAt: Date.now() - 1 } : state === "expired" ? { expiresAt: Date.now() - 1 } : { scopes: ["moves/read"] }) });
    await f.connect(); await f.finish();
    const description = await f.connect();
    expect(description).toMatchObject({ status: "active", scopes: [...movingScopes] });
    expect((await f.root())!.entries).toEqual([]);
    const own = await f.request(key.rawKey, "GET", "me");
    expect(own.body).toMatchObject({ data: { apiKey: { status: state === "narrowed" ? "active" : state } } });
  });
  it.each(["revoked", "paused", "expired", "narrowed"])("imports legacy OAuth %s on API-key first access", async state => {
    const f = await accessFixture();
    await f.legacyGrant({ ...(state === "revoked" ? { status: "revoked" } : state === "paused" ? { pausedAt: Date.now() - 1 } : state === "expired" ? { expiryChoice: "chosen", expiresAt: Date.now() - 1 } : { scopes: ["moving.context.read"] }) });
    const key = await f.legacyKey();
    const initializing = await f.request(key.rawKey, "GET", "me"); expect(JSON.stringify(initializing.body)).toContain("initializing");
    await f.finish();
    const result = await f.request(key.rawKey, "GET", "me"); expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ data: { apiKey: { status: "active" } } });
    expect((await f.root())!.entries.length).toBe(state === "expired" ? 0 : 1);
  });
  it("lifts only demonstrably automatic defaults, with no rewrite of stored scopes or dates", async () => {
    const f = await accessFixture(); const approvedAt = Date.now() - 31 * 86400000;
    const id = await f.legacyGrant({ clientId: "old", scopes: movingScopes.filter(scope => scope !== "moving.archive" && scope !== "moving.suggestions.propose"), approvedAt, expiresAt: approvedAt + 30 * 86400000 });
    await f.t.run(ctx => ctx.db.insert("aiGrantActivities", { grantId: id, ownerUserId: f.userId, householdId: f.householdId, type: "approved", outcome: "recorded", message: "Your AI connected by signing in. It can read and save — for 30 days.", createdAt: approvedAt }));
    const before = (await f.t.run(ctx => ctx.db.get(id)))!;
    await f.connect("new"); await f.finish();
    expect(await f.connect("new")).toMatchObject({ status: "active", scopes: [...movingScopes], expiresAt: null });
    expect(await f.t.run(ctx => ctx.db.get(id))).toMatchObject({ scopes: before.scopes, expiresAt: before.expiresAt, version: before.version });
    expect((await f.root())!.entries).toEqual([]);
  });
  it.each(["no-receipt", "settings-receipt", "owner-marker", "ai-marker", "chosen", "automatic-chosen", "revoked"])("preserves legacy chosen limits when provenance is %s", async provenance => {
    const f = await accessFixture(); const approvedAt = Date.now() - 31 * 86400000;
    const id = await f.legacyGrant({ scopes: movingScopes.filter(scope => scope !== "moving.archive" && scope !== "moving.suggestions.propose"), approvedAt, expiresAt: approvedAt + 30 * 86400000,
      ...(provenance === "owner-marker" ? { ownerDecisionAt: approvedAt } : provenance === "ai-marker" ? { narrowedBy: "ai" } : provenance === "automatic-chosen" ? { scopeChoice: "chosen", expiryChoice: "automatic" } : provenance === "chosen" ? { scopeChoice: "chosen", expiryChoice: "chosen" } : provenance === "revoked" ? { status: "revoked" } : {}) });
    if (provenance !== "no-receipt") await f.t.run(ctx => ctx.db.insert("aiGrantActivities", { grantId: id, ownerUserId: f.userId, householdId: f.householdId, type: "approved", outcome: "recorded", message: provenance === "settings-receipt" ? "You approved this connection in Settings." : "Your AI connected by signing in.", createdAt: approvedAt }));
    await f.connect(); await f.finish(); expect((await f.root())!.endsAt).toBeUndefined();
    expect((await f.root())!.withheldScopes).toContain("moving.archive");
    expect(await f.connect()).toMatchObject({ status: provenance === "revoked" ? "revoked" : "active", scopes: provenance === "revoked" ? [] : movingScopes.filter(scope => scope !== "moving.archive") });
  });
  it("keeps a paused legacy predecessor through revoke and exact person restore", async () => {
    const f = await accessFixture(); const pausedAt = Date.now() - 20;
    await f.legacyGrant({ status: "revoked", pausedAt, scopes: ["moving.context.read"] });
    await f.connect(); await f.finish(); await f.change({ action: "restore", opId: "restore" });
    expect(await f.connect()).toMatchObject({ status: "active", pausedAt: null, scopes: [...movingScopes] });
  });
  it("normalizes verified OAuth aliases without losing either raw legacy restriction", async () => {
    const f = await accessFixture();
    await f.legacyGrant({ clientId: "https://CLIENT.example:443", scopes: ["moving.context.read"] });
    await f.legacyGrant({ clientId: "legacy:https://client.example/", pausedAt: Date.now() - 1 });
    await f.connect("https://client.example/"); await f.finish();
    expect(await f.connect("https://CLIENT.example:443")).toMatchObject({ status: "paused", scopes: [] });
    expect((await f.root())!.entries).toHaveLength(2);
    expect((await f.person.query(api.connectionSettings.list, {})).connections).toHaveLength(1);
  });
  it("retains malformed historical URL identities without preventing bootstrap or granting access", async () => {
    const f = await accessFixture(); await f.legacyGrant({ clientId: "https://broken.example/%", status: "revoked" });
    await f.connect(); await f.finish(); expect(await f.connect()).toMatchObject({ status: "revoked" });
  });
  it("never imports legacy records again after completion", async () => {
    const f = await accessFixture(); await f.legacyGrant({ scopes: ["moving.context.read"] });
    await f.connect(); await f.finish();
    await f.legacyGrant({ status: "revoked" }); // Out-of-band legacy writes are not a supported mutation door.
    expect(await f.connect("new")).toMatchObject({ status: "active", scopes: ["moving.context.read", "moving.suggestions.propose"] });
  });
  it("isolates another owner's restrictions", async () => {
    const f = await accessFixture();
    const legacyId = await f.legacyGrant();
    await f.t.run(async ctx => { const now = Date.now(); const other = await ctx.db.insert("users", { clerkUserId: "other", name: "Other", appRole: "member", status: "active", createdAt: now, updatedAt: now, lastSeenAt: now }); await ctx.db.patch(legacyId, { ownerUserId: other, status: "revoked" }); });
    expect(await f.connect()).toMatchObject({ status: "active", scopes: [...movingScopes] });
  });
});

describe("owner controls and privacy", () => {
  it.each([{ client_id: "ai-one" }, { clientId: "ai-one" }, { azp: "opaque-ai" }, { scope: "openid" }, { scp: ["openid"] }, { tokenType: "oauth" }, { sid: undefined }, { sid: "" }, { sid: "sess_" }, { sts: "pending" }])("rejects non-person identity %j on controls and private history", async claims => {
    const f = await accessFixture(); await f.connect(); const id = (await f.connection())!._id;
    const ai = f.t.withIdentity({ subject: "awl-owner", ...claims });
    await expect(ai.query(api.connectionSettings.list, {})).rejects.toThrow(/only reduce/);
    await expect(ai.query(api.connectionSettings.history, { connectionId: id })).rejects.toThrow(/only reduce/);
    await expect(ai.mutation(api.connectionSettings.change, { connectionId: id, expectedVersion: 1, opId: "restore", action: "restore" })).rejects.toThrow(/only reduce/);
    await expect(ai.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Escape" })).rejects.toThrow(/only reduce/);
  });
  it("keeps history private from other household administrators", async () => {
    const f = await accessFixture(); await f.connect();
    await f.t.run(async ctx => { const now = Date.now(); const id = await ctx.db.insert("users", { clerkUserId: "other", name: "Admin", appRole: "admin", status: "active", createdAt: now, updatedAt: now, lastSeenAt: now }); await ctx.db.insert("householdMemberships", { householdId: f.householdId, userId: id, role: "owner", status: "active", createdByUserId: f.userId, createdAt: now, updatedAt: now }); });
    const other = f.t.withIdentity({ subject: "other", sid: "sess_other" });
    expect((await other.query(api.connectionSettings.list, {})).connections).toEqual([]);
    await expect(other.query(api.connectionSettings.history, { connectionId: (await f.connection())!._id })).rejects.toThrow(/unavailable/);
    await expect(other.mutation(api.connectionSettings.change, { connectionId: (await f.connection())!._id, opId: "foreign", expectedVersion: 1, action: "restore" })).rejects.toThrow(/unavailable/);
  });
  it("validates move narrowing before changing authority and refuses expansion by an AI", async () => {
    const f = await accessFixture(); await f.connect();
    await f.reduce({ opId: "move", moveIds: [f.moveId] });
    await expect(f.reduce({ opId: "empty", moveIds: [] })).rejects.toThrow(/only reduce/);
    await f.change({ opId: "all-moves", action: "limits", moveIds: null });
    expect((await f.root())!.moveIds).toBeUndefined();
  });
  it("does not permit another user's private move as a narrowing witness", async () => {
    const f = await accessFixture(); await f.connect();
    const inaccessible = await f.t.run(async ctx => { const now = Date.now(); const id = await ctx.db.insert("users", { clerkUserId: "stranger", name: "Stranger", appRole: "member", status: "active", createdAt: now, updatedAt: now, lastSeenAt: now }); const household = await ctx.db.insert("households", { name: "Secret", ownerUserId: id, createdByUserId: id, createdAt: now, updatedAt: now }); return ctx.db.insert("moves", { householdId: household, title: "Secret move", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: id, createdAt: now, updatedAt: now }); });
    const before = await f.root(); await expect(f.reduce({ opId: "foreign", moveIds: [inaccessible] })).rejects.toThrow(/access|member/i); expect(await f.root()).toEqual(before);
  });
  it("legacy approval endpoints cannot mint an unbound bypass grant", async () => {
    const f = await accessFixture(); await expect(f.person.mutation(api.aiGrants.approve, { householdId: f.householdId, label: "Bypass" })).rejects.toThrow(/receives full access when it connects/);
  });
});
