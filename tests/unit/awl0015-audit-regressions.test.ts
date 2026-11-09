// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { movingScopes } from "../../convex/lib/aiGrants";
import { apiKeyScopes } from "../../convex/lib/apiKeys";
import { checkPublishing } from "../../convex/lib/publishingCheck";
import { accessFixture } from "../helpers/ai-access";
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });
it("P1/P2: retired rotations and expired/default keys never poison OAuth's floor", async () => {
  const f = await accessFixture(); const createdAt = Date.now() - 91 * 86400000;
  const old = await f.legacyKey({ status: "revoked", createdAt });
  const replacement = await f.legacyKey({ rotatedFromApiKeyId: old.apiKeyId });
  const expiredDefault = await f.legacyKey({ createdAt, expiresAt: createdAt + 90 * 86400000 });
  await f.connect(); await f.finish();
  expect(await f.connect()).toMatchObject({ status: "active", scopes: [...movingScopes], expiresAt: null });
  expect((await f.root())!.entries).toEqual([]);
  expect((await f.root())!.connectionCount).toBe(3); // OAuth + two live credentials, not the retired predecessor.
  expect((await f.request(replacement.rawKey, "GET", "me")).status).toBe(200);
  expect((await f.request(expiredDefault.rawKey, "GET", "me")).body).toMatchObject({ data: { apiKey: { status: "active", expiresAt: null } } });
});
it("P3/P4: creation and rotation preserve the key's own chosen limits despite a revoked OAuth AI", async () => {
  const f = await accessFixture(); await f.connect();
  const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Script", scopes: ["moves/read", "inventory/read"] });
  await f.reduce({ action: "revoke", opId: "stop-oauth" });
  const rotated = await f.person.mutation(api.apiKeys.rotate, { householdId: f.householdId, apiKeyId: key.apiKeyId, expectedVersion: 1 });
  expect(rotated.scopes).toEqual(["moves/read", "inventory/read"]);
  expect((await f.request(rotated.rawKey, "GET", "me")).body).toMatchObject({ data: { apiKey: { status: "active", scopes: ["moves/read", "inventory/read"] } } });
  expect((await f.request(key.rawKey, "GET", "moves")).status).toBe(403);
  const fresh = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Fresh deliberate script" });
  expect(fresh.scopes).toEqual([...apiKeyScopes]);
  expect((await f.request(fresh.rawKey, "GET", "moves")).status).toBe(200);
  expect(await f.connect("another-oauth")).toMatchObject({ status: "revoked" });
});
it("P5: successor restrictions count until released; later source revisions survive earlier release", async () => {
  const f = await accessFixture(); await f.connect(); await f.reduce({ action: "revoke", opId: "first-stop" });
  await f.connect("second"); await f.change({ action: "restore", opId: "first-restore" });
  expect(await f.connect("third")).toMatchObject({ status: "revoked" });
  await f.change({ action: "restore", opId: "release-second" }, "second");
  await f.change({ action: "restore", opId: "release-third" }, "third");
  expect(await f.connect("fourth")).toMatchObject({ status: "active" });
  await f.reduce({ action: "revoke", opId: "later-stop" });
  expect(await f.connect("fifth")).toMatchObject({ status: "revoked" });
});
it("P6: a key's selected move never restricts an OAuth AI", async () => {
  const f = await accessFixture(); await f.legacyKey({ moveId: f.moveId }); await f.connect(); await f.finish();
  expect(await f.connect()).toMatchObject({ status: "active", scopes: [...movingScopes], moveRestricted: false });
});
it("P7: forced OAuth end dates lift; past chosen end dates stay only on the original connection", async () => {
  const f = await accessFixture();
  await f.legacyGrant({ clientId: "forced", approvedAt: Date.now() - 100 * 86400000, expiresAt: Date.now() - 10 * 86400000 });
  await f.legacyGrant({ clientId: "chosen", expiryChoice: "chosen", expiresAt: Date.now() - 1 });
  await f.connect(); await f.finish();
  expect(await f.connect()).toMatchObject({ status: "active", scopes: [...movingScopes], expiresAt: null });
  expect(await f.connect("forced")).toMatchObject({ status: "active", expiresAt: null });
  expect(await f.connect("chosen")).toMatchObject({ status: "expired" });
  expect((await f.root())!.entries).toEqual([]);
});
it("P8: revoking and pausing keys free real enforced plan slots", async () => {
  const f = await accessFixture();
  await f.t.run(async ctx => {
    await ctx.db.insert("featureFlags", { key: "billingGates", enabled: true, environment: "production", createdAt: Date.now(), updatedAt: Date.now() });
    await ctx.db.insert("householdBillingProfiles", { householdId: f.householdId, tier: "free", provider: "none", status: "none", createdAt: Date.now(), updatedAt: Date.now() });
  });
  const first = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "First" });
  const second = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Second" });
  await expect(f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Blocked" })).rejects.toThrow(/limit|activeApiKeys/i);
  await f.person.mutation(api.apiKeys.revoke, { householdId: f.householdId, apiKeyId: first.apiKeyId, expectedVersion: 1 });
  const third = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Replacement" }); expect(third.apiKeyId).toBeTruthy();
  await f.request(second.rawKey, "POST", "me/access", { action: "pause", opId: "pause", expectedVersion: 1 });
  expect((await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "After pause" })).apiKeyId).toBeTruthy();
});
it.each([["moves/read", "inventory/read", "queue/read", "exports/read"], ["moves/read", "inventory/read", "inventory/write", "photos/write"], apiKeyScopes.filter(scope => scope !== "members/manage")].map(scopes => [scopes]))("P9: deliberate key preset %j never withholds OAuth powers", async scopes => {
  const f = await accessFixture(); await f.legacyKey({ scopes: scopes as typeof apiKeyScopes[number][] }); await f.connect(); await f.finish();
  expect(await f.connect()).toMatchObject({ status: "active", scopes: [...movingScopes] });
});
it("bootstrap excludes retired OAuth rows rather than treating history as connections", async () => {
  const f = await accessFixture(); await f.legacyGrant({ clientId: "retired", status: "revoked", revokedReason: "Replaced by a newer grant" }); await f.legacyGrant({ clientId: "current" });
  await f.connect("current"); await f.finish();
  expect(await f.connect("new")).toMatchObject({ status: "active", scopes: [...movingScopes] });
  expect((await f.root())!.entries).toEqual([]);
  expect((await f.person.query(api.connectionSettings.list, {})).connections).toHaveLength(2);
});
it("Forget of an inherited revoke releases only its own entry", async () => {
  const f = await accessFixture(); await f.connect(); await f.reduce({ action: "revoke", opId: "stop" }); await f.connect("inherited");
  const source = (await f.connection())!.grantId;
  await f.change({ action: "forget", opId: "forget-inherited" }, "inherited");
  expect((await f.root())!.entries.some(row => row.sourceGrantId === source)).toBe(true);
  expect(await f.connect("new")).toMatchObject({ status: "revoked" });
});
it("no-op and narrowing-only person saves preserve inherited provenance", async () => {
  const f = await accessFixture(); await f.connect(); await f.reduce({ scopes: ["moving.context.read"], opId: "read" }); await f.connect("inherited");
  const refs = (await f.connection("inherited"))!.inheritedSources;
  await f.change({ action: "resume", opId: "no-op-resume" }, "inherited");
  expect((await f.connection("inherited"))!.inheritedSources).toEqual(refs);
  expect(await f.connect("inherited")).toMatchObject({ scopes: ["moving.context.read"] });
  await f.change({ action: "limits", scopes: [], opId: "narrower" }, "inherited");
  expect((await f.connection("inherited"))!.inheritedSources).toEqual(refs);
  expect((await f.root())!.entries.some(row => row.sourceGrantId === (refs ?? [])[0]?.sourceGrantId)).toBe(true);
});
it.each(["auth_token: supersecret", "db_password=supersecret", "AWS_SECRET_ACCESS_KEY=supersecret", String.raw`{\"db_password\":\"supersecret\"}`, String.raw`{"\u0070assword":"supersecret"}`, "password:\n  supersecret", "https://user:pass@example.test/path", "postgres://user:pass@db.test", "xoxb-secret123456", "xoxa-secret123456", "xoxp-secret123456", "xoxr-secret123456", "rk_live_secret123456", "sk_live_secret123456", "access-production-secret123456", "4111 1111 1111 1111"])("Finances secret regression: %s", body => {
  expect(() => checkPublishing({ body }, { emails: 999, phones: 999, addresses: 999 })).toThrow(/Publishing refused/);
});
it("snake_case object keys refuse, invalid card numbers do not", () => {
  expect(() => checkPublishing({ AWS_SECRET_ACCESS_KEY: "supersecret" })).toThrow(/Publishing refused/);
  expect(checkPublishing("4111 1111 1111 1112")).toEqual({ emails: 0, phones: 0, addresses: 0 });
});
it("retired OAuth rows stay stopped on their own client id without restricting fresh clients", async () => {
  const f = await accessFixture(); await f.legacyGrant({ clientId: "retired", status: "revoked", revokedReason: "Replaced by a newer grant." });
  await f.connect("retired"); await f.finish();
  expect(await f.connect("retired")).toMatchObject({ status: "superseded", scopes: [] });
  expect(await f.connect("fresh")).toMatchObject({ status: "active", scopes: [...movingScopes] });
  expect((await f.root())!.connectionCount).toBe(1);
});
it("a rotation successor retires an old active credential even on its first bootstrap request", async () => {
  const f = await accessFixture(); const old = await f.legacyKey(); await f.legacyKey({ rotatedFromApiKeyId: old.apiKeyId });
  await f.request(old.rawKey, "GET", "me"); await f.finish();
  const own = await f.request(old.rawKey, "GET", "me");
  expect(own.body).toMatchObject({ data: { apiKey: { status: "superseded" } } });
  expect((await f.request(old.rawKey, "GET", "moves")).status).toBe(403);
});
it("arbitrary revoke text mentioning replacement never proves a retired connection", async () => {
  const f = await accessFixture(); await f.legacyGrant({ status: "revoked", revokedReason: "I replaced my laptop; stop all AI." }); await f.connect(); await f.finish();
  expect(await f.connect()).toMatchObject({ status: "revoked" });
});
it("Forget releases every own legacy alias entry, with no inherited source release", async () => {
  const f = await accessFixture();
  await f.legacyGrant({ clientId: "https://CLIENT.example:443", status: "revoked" });
  await f.legacyGrant({ clientId: "legacy:https://client.example/", scopes: ["moving.context.read"] });
  await f.connect("https://client.example/"); await f.finish();
  await f.change({ action: "forget", opId: "forget-own-aliases" }, "https://client.example/");
  expect((await f.root())!.entries).toEqual([]);
  expect(await f.connect("fresh-after-forget")).toMatchObject({ status: "active", scopes: [...movingScopes] });
});
it.each(["automatic", "none"] as const)("a %s expiry marker never makes a forced date survive a person's chosen scope limits", async expiryChoice => {
  const f = await accessFixture();
  await f.legacyGrant({ clientId: "own-limits", scopeChoice: "chosen", scopes: ["moving.context.read"], expiryChoice, expiresAt: Date.now() + 60000, ownerDecisionAt: Date.now() - 500 });
  await f.connect("new"); await f.finish();
  expect(await f.connect("own-limits")).toMatchObject({ status: "active", scopes: ["moving.context.read", "moving.suggestions.propose"], expiresAt: null });
  expect(await f.connect("new")).toMatchObject({ status: "active", scopes: ["moving.context.read", "moving.suggestions.propose"], expiresAt: null });
});
