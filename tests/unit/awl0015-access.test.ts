// @vitest-environment node
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { effectiveScopes, movingScopes } from "../../convex/lib/aiGrants";
import { safeConnectionText } from "../../convex/lib/connectionHistory";
afterEach(() => vi.restoreAllMocks());
const modules = import.meta.glob("../../convex/**/*.ts");
async function setup() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async ctx => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", { clerkUserId: "awl-owner", name: "Owner", status: "active", appRole: "member", createdAt: now, updatedAt: now, lastSeenAt: now });
    const householdId = await ctx.db.insert("households", { name: "Home", ownerUserId: userId, createdByUserId: userId, createdAt: now, updatedAt: now });
    await ctx.db.insert("householdMemberships", { householdId, userId, role: "owner", status: "active", apiAccessStatus: "enabled", createdByUserId: userId, createdAt: now, updatedAt: now });
    return { userId, householdId };
  });
  const person = t.withIdentity({ subject: "awl-owner", sid: "sess_awl_owner" });
  const connect = async (clientId = "ai-one", clientName = "Test AI") => {
    await t.mutation(internal.aiGrants.touchLegacyConnection, { subject: "awl-owner", clientId, clientName });
    return t.query(internal.aiGrants.describeConnection, { subject: "awl-owner", clientId });
  };
  return { t, person, connect, ...seeded };
}

describe("AWL-0015 connection contract", () => {
  it("starts full with no end date and creates a dated system receipt", async () => {
    const { t, person, connect } = await setup();
    expect(await connect()).toMatchObject({ status: "active", scopes: [...movingScopes], expiresAt: null, heldBack: [] });
    const result = await person.query(api.connectionSettings.list, {});
    expect(result.history).toEqual([expect.objectContaining({ actor: "system", before: null, createdAt: expect.any(Number), opId: expect.any(String) })]);
    await expect(t.mutation(internal.aiGrants.touchLegacyConnection, { subject: "awl-owner", clientId: "" })).resolves.toMatchObject({ block: "unidentifiedClient" });
  });
  it("narrows atomically, rejects stale/widening writes and replays one opId", async () => {
    const { t, person, connect } = await setup(); await connect();
    const input = { subject: "awl-owner", clientId: "ai-one", opId: "narrow-one", expectedVersion: 1, scopes: ["moving.context.read"] };
    const receipt = await t.mutation(internal.aiGrants.reduceConnection, input);
    expect(await t.mutation(internal.aiGrants.reduceConnection, input)).toEqual(receipt);
    await expect(t.mutation(internal.aiGrants.reduceConnection, { ...input, scopes: [] })).rejects.toThrow(/different connection change/);
    await expect(t.mutation(internal.aiGrants.reduceConnection, { ...input, opId: "stale", expectedVersion: 1 })).rejects.toThrow(/changed/);
    await expect(t.mutation(internal.aiGrants.reduceConnection, { ...input, opId: "widen", expectedVersion: 2, scopes: [...movingScopes] })).rejects.toThrow(/only reduce/);
    const listed = await person.query(api.connectionSettings.list, {});
    expect(listed.history.filter(row => row.actor === "ai")).toHaveLength(1);
    expect(listed.connections.find(row => row.kind === "oauth")!).toMatchObject({ narrowedBy: "ai", scopes: ["moving.context.read"] });
  });
  it("keeps paused state separate from the end date; only the website resumes", async () => {
    const { t, person, connect } = await setup(); await connect();
    const end = Date.now() + 86400000;
    await t.mutation(internal.aiGrants.reduceConnection, { subject: "awl-owner", clientId: "ai-one", opId: "pause", expectedVersion: 1, action: "pause", expiresAt: end });
    expect(await connect()).toMatchObject({ status: "paused", scopes: [], expiresAt: end, heldBack: expect.arrayContaining([expect.objectContaining({ missingPower: "moving.work.write", reason: "paused" })]) });
    const row = (await person.query(api.connectionSettings.list, {})).connections.find(row => row.kind === "oauth")!;
    const oauth = t.withIdentity({ subject: "awl-owner", client_id: "ai-one" });
    const input = { grantId: row.id as Id<"aiGrants">, expectedVersion: row.version, opId: "resume", action: "resume" as const };
    await expect(oauth.mutation(api.connectionSettings.change, input)).rejects.toThrow(/only reduce/);
    await person.mutation(api.connectionSettings.change, input);
    expect(await connect()).toMatchObject({ status: "active", expiresAt: end });
  });
  it("inherits revocation on re-registration by reported name; restores previous powers exactly", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.now());
    const { t, person, connect } = await setup(); await connect();
    await t.mutation(internal.aiGrants.reduceConnection, { subject: "awl-owner", clientId: "ai-one", opId: "read", expectedVersion: 1, scopes: ["moving.context.read"] });
    await t.mutation(internal.aiGrants.reduceConnection, { subject: "awl-owner", clientId: "ai-one", opId: "revoke", expectedVersion: 2, action: "revoke" });
    const originalId = (await person.query(api.connectionSettings.list, {})).connections[0].id;
    expect(await connect("new-registration")).toMatchObject({ status: "revoked", scopes: [] });
    const row = (await person.query(api.connectionSettings.list, {})).connections.find(row => row.kind === "oauth" && row.id !== originalId)!;
    await person.mutation(api.connectionSettings.change, { grantId: row.id as Id<"aiGrants">, expectedVersion: row.version, opId: "person-restore", action: "restore" });
    expect(await connect("new-registration")).toMatchObject({ status: "active", scopes: ["moving.context.read"] });
    expect(await connect("third-registration")).toMatchObject({ status: "active", scopes: ["moving.context.read"] });
  });
  it("lifts an expired automatic legacy grant in code without changing the stored row", async () => {
    const { t, person, connect } = await setup(); await connect();
    const row = (await person.query(api.connectionSettings.list, {})).connections.find(row => row.kind === "oauth")!;
    await t.run(async ctx => {
      const old = (await ctx.db.get(row.id as Id<"aiGrants">))!;
      await ctx.db.patch(row.id, { scopes: movingScopes.filter(scope => scope !== "moving.archive"), scopeChoice: undefined, expiryChoice: undefined, approvedAt: Date.now() - 31 * 86400000, expiresAt: Date.now() - 86400000 });
      await ctx.db.insert("aiGrantActivities", { grantId: row.id as Id<"aiGrants">, ownerUserId: old.ownerUserId, householdId: old.householdId, type: "approved", outcome: "recorded", message: "Test AI connected by signing in. It can read and save — for 30 days.", createdAt: old.approvedAt });
    });
    const before = await t.run(ctx => ctx.db.get(row.id as Id<"aiGrants">));
    expect(await connect()).toMatchObject({ status: "active", scopes: [...movingScopes], expiresAt: null });
    expect(await t.run(ctx => ctx.db.get(row.id as Id<"aiGrants">))).toEqual(before);
    await t.run(ctx => ctx.db.patch(row.id, { ownerDecisionAt: Date.now() }));
    expect(await connect()).toMatchObject({ status: "expired" });
  });
  it("receives new powers while keeping only explicitly removed powers withheld", () => {
    const catalog = movingScopes as unknown as string[];
    catalog.push("moving.future.test");
    try { expect(effectiveScopes({ scopes: ["moving.context.read"], withheldScopes: ["moving.work.write"] })).toContain("moving.future.test"); expect(effectiveScopes({ scopes: [], withheldScopes: ["moving.work.write"] })).not.toContain("moving.work.write"); }
    finally { catalog.pop(); }
  });
  it.each(["pause", "revoke"] as const)("keeps API key inspection working after %s and blocks invitations/share links", async action => {
    const { t, person, householdId } = await setup();
    const key = await person.mutation(api.apiKeys.create, { householdId, name: "Test key" });
    const request = (method: "GET" | "POST", path: string, body?: unknown) => t.mutation(internal.restApi.handle, { method, path, query: {}, authorization: `Bearer ${key.rawKey}`, body });
    for (const path of [`households/${householdId}/members`, "moves/fake/share-links"]) {
      const response = await request("POST", path, { email: "new@example.test" });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(response.body)).toContain("website-only");
    }
    expect((await request("POST", "me/access", { opId: action, expectedVersion: 1, action })).status).toBe(200);
    const result = await request("GET", "me");
    expect(result.status).toBe(200);
    const body = result.body as { data: { apiKey: unknown; household: unknown } };
    expect(body.data.apiKey).toMatchObject({ status: action === "pause" ? "paused" : "revoked", scopes: [], settings: "https://movingmanifest.com/settings/ai" });
    expect(body.data.household).toBeNull();
    expect((await request("GET", "moves")).status).toBeGreaterThanOrEqual(400);
  });
  it("does not let an older registration escape a later sibling limit by changing its reported name", async () => {
    const { t, connect } = await setup(); await connect(); await connect("second-id");
    const current = await connect();
    await t.mutation(internal.aiGrants.reduceConnection, { subject: "awl-owner", clientId: "ai-one", opId: "family-read", expectedVersion: current.version!, scopes: ["moving.context.read"] });
    expect(await connect("second-id")).toMatchObject({ scopes: ["moving.context.read"] });
    await t.mutation(internal.aiGrants.noteGrantUse, { subject: "awl-owner", clientId: "second-id", clientName: "Different reported name", scope: "moving.context.read", toolName: "get_move_brief" });
    expect(await connect("second-id", "Different reported name")).toMatchObject({ scopes: ["moving.context.read"] });
  });
  it("keeps owner settings usable with more than 128 historical grants", async () => {
    const { t, person, connect } = await setup(); await connect();
    const original = (await person.query(api.connectionSettings.list, {})).connections.find(row => row.kind === "oauth")!;
    await t.run(async ctx => {
      const row = (await ctx.db.get(original.id as Id<"aiGrants">))!;
      const { _id: ignored, _creationTime: ignoredTime, ...fields } = row; void ignored; void ignoredTime;
      for (let i = 0; i < 130; i++) await ctx.db.insert("aiGrants", { ...fields, observedClientName: undefined, clientId: `old-${i}`, status: "revoked", revokedAt: Date.now() });
    });
    expect((await person.query(api.connectionSettings.list, {})).connections).toHaveLength(131);
    await person.mutation(api.connectionSettings.change, { grantId: original.id as Id<"aiGrants">, opId: "large-history", expectedVersion: 1, action: "pause" });
    expect(await connect()).toMatchObject({ status: "paused" });
  });
  it("redacts secret-shaped free text", () => {
    expect(safeConnectionText("Bearer secret mmk_exampletoken eyJabc.e30.sig")).toBe("[redacted] [redacted] [redacted]");
  });
});
