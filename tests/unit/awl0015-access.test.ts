// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { effectiveScopes, movingScopes } from "../../convex/lib/aiGrants";
import { apiKeyScopes } from "../../convex/lib/apiKeys";
import { safeConnectionText } from "../../convex/lib/connectionHistory";
import { connectOAuth } from "../../convex/lib/carriedAccess";
import { accessFixture } from "../helpers/ai-access";
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe("AWL-0015 durable owner authority", () => {
  it("starts full without approval or an end date and records its system receipt", async () => {
    const f = await accessFixture();
    expect(await f.connect()).toMatchObject({ status: "active", scopes: [...movingScopes], expiresAt: null, heldBack: [] });
    const row = (await f.person.query(api.connectionSettings.list, {})).connections[0];
    expect((await f.person.query(api.connectionSettings.history, { connectionId: row.id })).history).toEqual([expect.objectContaining({ actor: "system", before: null, opId: expect.any(String) })]);
    expect(await f.t.mutation(internal.aiGrants.touchLegacyConnection, { subject: "awl-owner", clientId: "" })).toMatchObject({ block: "unidentifiedClient" });
  });
  it("also connects before the person creates any household", async () => {
    const f = await accessFixture();
    await f.t.run(async ctx => { await ctx.db.delete(f.membershipId); await ctx.db.delete(f.moveId); await ctx.db.delete(f.householdId); });
    expect(await f.connect()).toMatchObject({ status: "active", scopes: [...movingScopes], expiresAt: null });
  });
  it("atomically narrows, rejects stale/widening writes, and replays one opId once", async () => {
    const f = await accessFixture(); await f.connect();
    const input = { opId: "read", expectedVersion: 1, scopes: ["moving.context.read"] };
    const receipt = await f.reduce(input);
    expect(await f.reduce(input)).toEqual(receipt);
    await expect(f.reduce({ ...input, scopes: [] })).rejects.toThrow(/different connection change/);
    await expect(f.reduce({ ...input, opId: "stale" })).rejects.toThrow(/changed/);
    await expect(f.reduce({ opId: "widen", scopes: [...movingScopes] })).rejects.toThrow(/only reduce.*https:\/\/movingmanifest.com\/settings\/ai/);
    const history = await f.person.query(api.connectionSettings.history, { connectionId: (await f.connection())!._id });
    expect(history.history.filter(row => row.actor === "ai")).toHaveLength(1);
    expect(history.history[0]).toMatchObject({ before: { scopes: [...movingScopes], version: 1 }, after: { scopes: ["moving.context.read"], version: 2 } });
  });
  it.each(["restore", "resume", "full", "extend"])("refuses AI %s with the specific narrow-only refusal", async action => {
    const f = await accessFixture(); await f.connect();
    await expect(f.reduce({ opId: action, action })).rejects.toThrow(/Your AI can only reduce its own connection/);
  });
  it.each([null, 1e20, -1e20])("refuses invalid/widening expiry %s", async expiresAt => {
    const f = await accessFixture(); await f.connect();
    await expect(f.reduce({ opId: "bad-date", expiresAt })).rejects.toThrow(/only reduce/);
    expect((await f.root())!.revision).toBe(1);
  });
  it("keeps pause through revoke, re-registration and person restore; resume is separate", async () => {
    const f = await accessFixture(); await f.connect();
    const end = Date.now() + 60000;
    await f.reduce({ opId: "pause", action: "pause", expiresAt: end, scopes: ["moving.context.read"] });
    const paused = (await f.root())!.pausedAt;
    await f.reduce({ opId: "revoke", action: "revoke" });
    expect(await f.connect("second", "Different name")).toMatchObject({ status: "revoked", pausedAt: paused, expiresAt: end });
    await f.change({ opId: "restore", action: "restore" }, "second");
    expect(await f.connect("second")).toMatchObject({ status: "paused", pausedAt: paused, expiresAt: end, scopes: [] });
    await f.change({ opId: "resume", action: "resume" }, "second");
    expect(await f.connect("second")).toMatchObject({ status: "active", scopes: ["moving.context.read"], expiresAt: end });
    expect(await f.connect()).toMatchObject({ status: "superseded", scopes: [] });
  });
  it("restores a revoked connection with its exact chosen date even after it passes", async () => {
    const f = await accessFixture(); await f.connect(); const endsAt = Date.now() + 1000;
    await f.reduce({ opId: "date", expiresAt: endsAt }); await f.reduce({ opId: "revoke", action: "revoke" });
    vi.setSystemTime(endsAt + 1);
    await f.change({ opId: "restore", action: "restore" });
    expect(await f.connect()).toMatchObject({ status: "expired", expiresAt: endsAt });
    await f.change({ opId: "clear", action: "limits", expiresAt: null });
    expect(await f.connect()).toMatchObject({ status: "active", expiresAt: null });
  });
  it.each([undefined, "Same name", "Different name", "https://different.example/client.json"])("a new self-reported name %s cannot prove independence", async name => {
    const f = await accessFixture(); await f.connect("ai-one", "Original"); await f.reduce({ opId: "revoke", action: "revoke" });
    for (const client of ["second", "third", "fourth"]) expect(await f.connect(client, name)).toMatchObject({ status: "revoked", scopes: [] });
  });
  it.each(["pause", "revoke", "narrow", "expiry"])("later predecessor %s counts again after the person's revision-bound release", async kind => {
    const f = await accessFixture(); await f.connect(); await f.reduce({ opId: "revoke", action: "revoke" });
    await f.connect("second"); await f.change({ opId: "restore", action: "restore" }, "second");
    expect(await f.connect("third")).toMatchObject({ status: "active", scopes: [...movingScopes] });
    const releasedRevision = (await f.root())!.revision;
    await f.reduce({ opId: "later", ...(kind === "narrow" ? { scopes: ["moving.context.read"] } : kind === "expiry" ? { expiresAt: Date.now() + 60000 } : { action: kind }) });
    expect((await f.root())!.entries).toEqual([expect.objectContaining({ sourceRevision: releasedRevision + 1 })]);
    const description = await f.connect("fourth");
    expect(description.status).toBe(kind === "pause" ? "paused" : kind === "revoke" ? "revoked" : "active");
    if (kind === "narrow") expect(description.scopes).toEqual(["moving.context.read"]);
    if (kind === "expiry") expect(description.expiresAt).toBe(Date.now() + 60000);
  });
  it("same-millisecond release and later restriction order by revision", async () => {
    const f = await accessFixture(); await f.connect(); await f.reduce({ opId: "old", action: "revoke" });
    await f.connect("second"); await f.change({ opId: "release", action: "restore" }, "second");
    await f.reduce({ opId: "new", action: "revoke" });
    expect(await f.connect("third")).toMatchObject({ status: "revoked" });
  });
  it("all live members share one authority; revoking one stops every stale sibling token", async () => {
    const f = await accessFixture(); await f.connect(); await f.connect("second");
    await f.reduce({ opId: "stop-all", action: "revoke" });
    for (const id of ["ai-one", "second"]) {
      expect(await f.t.query(internal.aiGrants.grantsForPrincipal, { subject: "awl-owner", clientId: id })).toMatchObject({ scopes: [], grants: [], connectionState: { status: "revoked" } });
    }
    expect(await f.connect("third")).toMatchObject({ status: "revoked" });
    expect(await f.connect("second")).toMatchObject({ status: "superseded" });
  });
  it("uses only the durable record after bootstrap, even when connecting a new identity", async () => {
    const f = await accessFixture(); await f.connect(); await f.reduce({ opId: "stop", action: "revoke" });
    await f.t.run(async ctx => {
      const query = ctx.db.query.bind(ctx.db);
      vi.spyOn(ctx.db, "query").mockImplementation(table => {
        if (["aiGrants", "apiKeys", "aiGrantActivities", "aiConnectionChanges"].includes(table)) throw new Error(`History scan: ${table}`);
        return query(table);
      });
      const user = (await ctx.db.get(f.userId))!;
      const { access } = await connectOAuth(ctx, user, "new-no-history", "Unrelated claim");
      expect(access.revoked).toBe(true);
    });
  });
  it("keeps all current connections paginated and superseded registrations separate", async () => {
    const f = await accessFixture();
    for (let i = 0; i < 57; i++) await f.connect(`ai-${i}`);
    let cursor: string | undefined, count = 0;
    do { const page = await f.person.query(api.connectionSettings.list, cursor ? { cursor } : {}); count += page.connections.length; cursor = page.nextCursor ?? undefined; } while (cursor);
    expect(count).toBe(57);
    await f.reduce({ opId: "revoke", action: "revoke" }, "ai-0"); await f.connect("successor");
    expect((await f.person.query(api.connectionSettings.list, {})).connections).toHaveLength(1);
    let oldCursor: string | undefined, oldCount = 0;
    do { const page = await f.person.query(api.connectionSettings.list, { superseded: true, ...(oldCursor ? { cursor: oldCursor } : {}) }); oldCount += page.connections.length; oldCursor = page.nextCursor ?? undefined; } while (oldCursor);
    expect(oldCount).toBe(57);
  });
  it("a narrowed grant receives future tools except explicitly withheld powers", () => {
    const scopes = movingScopes as unknown as string[]; scopes.push("moving.future.test");
    try { expect(effectiveScopes({ scopes: ["moving.context.read"], withheldScopes: ["moving.work.write"] })).toContain("moving.future.test"); }
    finally { scopes.pop(); }
  });
  it("scrubs secret-shaped names and refuses secret-shaped opIds", async () => {
    expect(safeConnectionText("Bearer secret mmk_exampletoken eyJabc.e30.sig")).toBe("[redacted] [redacted] [redacted]");
    const f = await accessFixture(); await f.connect("ai-one", "mmk_secret");
    await expect(f.reduce({ opId: "mmk_secret", action: "pause" })).rejects.toThrow(/non-secret opId/);
    expect((await f.connection())!.label).toBe("[redacted]");
  });
  it("projects OAuth restrictions onto API keys and key restrictions back onto OAuth", async () => {
    const f = await accessFixture(); await f.connect(); await f.reduce({ opId: "read", scopes: ["moving.context.read"] });
    const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "New key" });
    expect(key.scopes).not.toContain("inventory/write");
    const root = (await f.root())!;
    expect((await f.request(key.rawKey, "POST", "me/access", { opId: "stop-key", expectedVersion: root.revision, action: "revoke" })).status).toBe(200);
    expect(await f.connect("yet-another")).toMatchObject({ status: "revoked" });
  });
  it("full API keys have all current powers and no default end date", async () => {
    const f = await accessFixture(); const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Full" });
    expect(key.scopes).toEqual([...apiKeyScopes]); expect((await f.root())!.endsAt).toBeUndefined();
  });
});
