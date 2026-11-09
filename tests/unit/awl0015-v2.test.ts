// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { movingScopes } from "../../convex/lib/aiGrants";
import { checkPublishing } from "../../convex/lib/publishingCheck";
import * as publicPackets from "../../convex/publicPackets";
import type { MutationCtx } from "../../convex/_generated/server";
import { accessFixture } from "../helpers/ai-access";
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
it("inherits the union/any/earliest floor from independently restricted OAuth connections", async () => {
  const f = await accessFixture(); await f.connect("read"); await f.connect("paused"); await f.connect("dated");
  await f.reduce({ opId: "read", scopes: ["moving.context.read"] }, "read");
  await f.reduce({ opId: "pause", action: "pause" }, "paused");
  const end = Date.now() + 60000; await f.reduce({ opId: "end", expiresAt: end }, "dated");
  const next = await f.connect("https://entirely-different.example/client.json", "Different app");
  expect(next).toMatchObject({ status: "paused", expiresAt: end, scopes: [] });
  expect((await f.connection("read"))!.policy!.withheldScopes).toContain("moving.work.write");
  expect(await f.connect("dated")).toMatchObject({ status: "active", scopes: [...movingScopes], expiresAt: end });
  const row = (await f.person.query(api.connectionSettings.list, {})).connections.find(row => row.label === "Different app")!;
  expect(row.inherited).toBe(true);
});
it("a later restriction cannot be released by an inherited connection's older source revision", async () => {
  const f = await accessFixture(); await f.connect(); await f.reduce({ opId: "read", scopes: ["moving.context.read"] });
  await f.connect("second"); await f.reduce({ opId: "new-revoke", action: "revoke" });
  await f.change({ opId: "restore-second", action: "restore" }, "second");
  expect(await f.connect("second")).toMatchObject({ status: "active", scopes: [...movingScopes] });
  expect(await f.connect("third")).toMatchObject({ status: "revoked" });
});
it("Forget releases only that revoked connection; its token stays stopped and other restrictions remain", async () => {
  const f = await accessFixture(); await f.connect(); await f.connect("other");
  await f.reduce({ opId: "stop", action: "revoke" });
  await f.change({ opId: "forget", action: "forget" });
  expect(await f.connect()).toMatchObject({ status: "superseded", scopes: [] });
  expect(await f.connect("new")).toMatchObject({ status: "active" });
  expect((await f.person.query(api.connectionSettings.list, {})).connections.every(row => row.id !== undefined && row.isCurrent)).toBe(true);
  expect((await f.person.query(api.connectionSettings.list, { superseded: true })).connections).toHaveLength(1);
  await expect(f.change({ action: "forget", opId: "not-revoked" }, "other")).rejects.toThrow(/Only revoked/);
});
it("an inherited restricted successor counts until the person releases it", async () => {
  const f = await accessFixture(); await f.connect(); await f.reduce({ opId: "stop", action: "revoke" });
  await f.connect("second"); await f.change({ opId: "restore-first", action: "restore" });
  expect(await f.connect("third")).toMatchObject({ status: "revoked" });
  await f.change({ opId: "restore-third", action: "restore" }, "third");
  expect(await f.connect("fourth")).toMatchObject({ status: "active" });
});
it.each(["mmk_abcdef123456", "sk_live_abcdef123456", "Bearer abc123", "password=supersecret", "-----BEGIN PRIVATE KEY-----\nprivate"])("publishing refuses secrets even with acknowledgement: %s", secret => {
  expect(() => checkPublishing({ items: [{ description: secret }] }, { emails: 100, phones: 100, addresses: 100 })).toThrow(/Publishing refused:.*at \$public.items\[0\].description/);
});
it("summarizes contacts once for the whole batch and accepts exact counts on the first call", () => {
  const batch = [{ name: "Store", email: "shop@example.test", phone: "503-555-1212", address: "123 Main Street" }, { email: "business@example.test", address: "42 South Main Road" }];
  expect(() => checkPublishing(batch)).toThrow(/This contains 2 email addresses, 1 phone numbers and 2 street addresses/);
  expect(() => checkPublishing(batch, { emails: 1, phones: 1, addresses: 2 })).toThrow(/whole batch/);
  expect(checkPublishing(batch, { emails: 2, phones: 1, addresses: 2 })).toEqual({ emails: 2, phones: 1, addresses: 2 });
  expect(() => checkPublishing(batch, { emails: 3, phones: 2, addresses: 3 })).toThrow(/exact counts/);
  expect(() => checkPublishing(batch, { emails: 999, phones: 999, addresses: 999 })).toThrow(/2 email addresses, 1 phone numbers and 2 street addresses/);
});
it("publishes and unpublishes through the actual API with one acknowledgement and AI history", async () => {
  const f = await accessFixture(); const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Publisher" });
  const path = `moves/${f.moveId}/share-links`;
  const refused = await f.request(key.rawKey, "POST", path, { label: "mmk_secret1234" });
  expect(JSON.stringify(refused.body)).toContain("Publishing refused");
  expect(await f.t.run(ctx => ctx.db.query("shareLinks").collect())).toHaveLength(0);
  const flagged = await f.request(key.rawKey, "POST", path, { label: "Store: shop@example.test, 503-555-1212, 123 Main Street" });
  expect(JSON.stringify(flagged.body)).toContain("1 email addresses, 1 phone numbers and 1 street addresses");
  const created = await f.request(key.rawKey, "POST", path, { label: "Store: shop@example.test, 503-555-1212, 123 Main Street", acknowledgeContactDetails: { emails: 1, phones: 1, addresses: 1 } });
  expect(created.status).toBe(201);
  const link = (await f.t.run(ctx => ctx.db.query("shareLinks").collect()))[0];
  expect(link.createdByApiKeyId).toBe(key.apiKeyId);
  expect((await f.request(key.rawKey, "POST", `${path}/${link._id}/revoke`)).status).toBe(200);
  const audit = await f.t.run(ctx => ctx.db.query("auditLogs").collect());
  expect(audit.some(row => row.action === "share_link.created" && row.actorApiKeyId === key.apiKeyId)).toBe(true);
  expect(audit.some(row => row.action === "share_link.revoked" && row.actorApiKeyId === key.apiKeyId)).toBe(true);
  expect((await f.request(key.rawKey, "POST", `households/${f.householdId}/members`, { email: "friend@example.test" })).status).toBe(403);
});
it("API key first bootstrap keeps an existing full key's own access while new OAuth inherits old restrictions", async () => {
  const f = await accessFixture(); await f.legacyGrant({ status: "revoked" }); const key = await f.legacyKey();
  await f.request(key.rawKey, "GET", "me"); await f.finish();
  expect((await f.request(key.rawKey, "GET", "me")).body).toMatchObject({ data: { apiKey: { status: "active" } } });
  expect(await f.connect("new-oauth")).toMatchObject({ status: "revoked" });
  expect((await f.request(key.rawKey, "GET", "moves")).status).toBe(200);
});

it("checks actual outgoing profile content, not only the label", async () => {
  const f = await accessFixture(); const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Publisher" });
  const profileId = await f.t.run(ctx => ctx.db.insert("documentationProfiles", { householdId: f.householdId, moveId: f.moveId, type: "movingCompany", name: "Packing packet", status: "active", includedFields: ["items"], imageRule: "none", filters: {}, allowedActions: ["view"], exportHistory: [], disclaimer: "password=hidden_secret", createdByUserId: f.userId, createdAt: Date.now(), updatedAt: Date.now() }));
  const response = await f.request(key.rawKey, "POST", `moves/${f.moveId}/share-links`, { documentationProfileId: profileId, label: "Clean label" });
  expect(JSON.stringify(response.body)).toContain("Publishing refused");
  expect(JSON.stringify(response.body)).toContain("disclaimer");
  expect(JSON.stringify(response.body)).not.toContain("hidden_secret");
  expect(await f.t.run(ctx => ctx.db.query("shareLinks").collect())).toHaveLength(0);
});
it("only an explicit person Restore can revive a forgotten connection", async () => {
  const f = await accessFixture(); await f.connect(); await f.reduce({ action: "revoke", opId: "stop" });
  await f.change({ action: "forget", opId: "forget" }); expect(await f.connect()).toMatchObject({ status: "superseded" });
  await f.change({ action: "restore", opId: "restore" }); expect(await f.connect()).toMatchObject({ status: "active" });
});

it("inherited Restore preserves limits subsequently chosen on that connection", async () => {
  const f = await accessFixture(); await f.connect(); await f.reduce({ action: "pause", opId: "old-pause" });
  await f.connect("second"); const end = Date.now() + 10000;
  await f.change({ action: "limits", opId: "chosen", scopes: ["moving.context.read"], expiresAt: end }, "second");
  await f.change({ action: "restore", opId: "release-inherited" }, "second");
  expect(await f.connect("second")).toMatchObject({ status: "active", scopes: ["moving.context.read"], expiresAt: end, pausedAt: null });
});

it("releases every bootstrapped alias source when the person restores the existing credential", async () => {
  const f = await accessFixture();
  await f.legacyGrant({ clientId: "https://CLIENT.example:443", scopes: ["moving.context.read"] });
  await f.legacyGrant({ clientId: "legacy:https://client.example/", pausedAt: Date.now() - 1 });
  await f.connect("https://client.example/"); await f.finish();
  const owner = async (action: "resume" | "full", opId: string) => {
    const data = await f.person.query(api.connectionSettings.list, {}); const row = data.connections[0];
    return f.person.mutation(api.connectionSettings.change, { connectionId: row.id, expectedVersion: row.version, action, opId });
  };
  await owner("resume", "resume"); await owner("full", "full");
  expect(await f.connect("new-after-release")).toMatchObject({ status: "active", scopes: [...movingScopes] });
});

it("does not expose secrets added after a share link was published", async () => {
  const f = await accessFixture(); const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Publisher" });
  const profileId = await f.t.run(ctx => ctx.db.insert("documentationProfiles", { householdId: f.householdId, moveId: f.moveId, type: "movingCompany", name: "Packing packet", status: "active", includedFields: ["items"], imageRule: "none", filters: {}, allowedActions: ["view"], exportHistory: [], createdByUserId: f.userId, createdAt: Date.now(), updatedAt: Date.now() }));
  expect((await f.request(key.rawKey, "POST", `moves/${f.moveId}/share-links`, { documentationProfileId: profileId })).status).toBe(201);
  const link = (await f.t.run(ctx => ctx.db.query("shareLinks").collect()))[0];
  await f.t.run(ctx => ctx.db.patch(profileId, { disclaimer: "Bearer new_secret_after_publish" }));
  expect(await f.t.query(internal.publicPackets.getForShareLink, { shareLinkId: link._id, householdId: f.householdId, moveId: f.moveId, documentationProfileId: profileId, scope: "profile", role: "guest", allowedActions: ["view"], expiresAt: link.expiresAt })).toMatchObject({ status: "unavailable", reason: expect.stringContaining("unavailable") });
});

it.each(['{"password":"secret_value"}', '"api_key": "secret_value"', '{"token":"secret_value"}', String.raw`{\"password\":\"secret_value\"}`])("detects JSON-quoted secrets: %s", text => {
  expect(() => checkPublishing({ body: text }, { emails: 100, phones: 100, addresses: 100 })).toThrow(/Publishing refused/);
});
it("counts adjacent contacts exactly and never constructs a match across lines", () => {
  expect(checkPublishing({ body: "a@one.test b@two.test\n503-555-1212 503-555-1213\n12 Main Street\n14 Oak Lane" }, { emails: 2, phones: 2, addresses: 2 })).toEqual({ emails: 2, phones: 2, addresses: 2 });
  expect(checkPublishing({ body: "12\nMain Street\n503-555\n1212\na@one.\ntest" })).toEqual({ emails: 0, phones: 0, addresses: 0 });
  expect(() => checkPublishing({ body: "12 Main Street\n14 Oak Lane" }, { emails: 0, phones: 0, addresses: 1 })).toThrow(/2 street addresses/);
});
it.each([{ bodyStorageId: "unread-file" }, { body: { storageId: "unread-file" } }, { body: new Uint8Array([1,2,3]) }])("acknowledgement cannot waive an unscannable body", body => {
  expect(() => checkPublishing(body, { emails: 100, phones: 100, addresses: 100 })).toThrow(/cannot scan file-backed body/);
});

it("rechecks publish power after inspecting stored content, in the visibility-write transaction", async () => {
  const f = await accessFixture(); const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Publisher" });
  const row = (await f.person.query(api.connectionSettings.list, {})).connections[0];
  const original = publicPackets.previewPublicPacket;
  vi.spyOn(publicPackets, "previewPublicPacket").mockImplementation(async (ctx, args) => {
    const packet = await original(ctx, args);
    const mutationCtx = ctx as MutationCtx;
    const connection = (await mutationCtx.db.get(row.id))!;
    await mutationCtx.db.patch(row.id, { policy: { ...connection.policy!, withheldScopes: ["exports/create"], revision: connection.policy!.revision + 1 } });
    return packet;
  });
  const result = await f.request(key.rawKey, "POST", `moves/${f.moveId}/share-links`, {});
  expect(result.status).toBe(403); expect(JSON.stringify(result.body)).toContain("Missing power exports/create");
  expect(await f.t.run(ctx => ctx.db.query("shareLinks").collect())).toHaveLength(0);
});
it.each(["POST", "DELETE"] as const)("an active zero-power connection can unpublish using %s", async method => {
  const f = await accessFixture(); const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Unpublisher" });
  const path = `moves/${f.moveId}/share-links`;
  expect((await f.request(key.rawKey, "POST", path, {})).status).toBe(201);
  const link = (await f.t.run(ctx => ctx.db.query("shareLinks").collect()))[0];
  expect((await f.request(key.rawKey, "POST", "me/access", { opId: "zero", expectedVersion: 1, scopes: [] })).status).toBe(200);
  const context = await f.request(key.rawKey, "GET", "me");
  expect(context.body).toMatchObject({ data: { apiKey: { tools: expect.arrayContaining(["revoke_share_link"]), heldBack: expect.arrayContaining([expect.objectContaining({ tool: "create_share_link" })]) } } });
  const response = await f.request(key.rawKey, method, `${path}/${link._id}${method === "POST" ? "/revoke" : ""}`);
  expect(response.status).toBe(200);
  expect((await f.t.run(ctx => ctx.db.get(link._id)))!.status).toBe("revoked");
  expect((await f.request(key.rawKey, "POST", path, {})).status).toBe(403);
});
it.each(["pause", "revoke", "expire"])("unpublishing still refuses an inactive grant: %s", async action => {
  const f = await accessFixture(); const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Inactive" });
  const path = `moves/${f.moveId}/share-links`;
  await f.request(key.rawKey, "POST", path, {});
  const link = (await f.t.run(ctx => ctx.db.query("shareLinks").collect()))[0];
  await f.request(key.rawKey, "POST", "me/access", { opId: "stop", expectedVersion: 1, ...(action === "expire" ? { expiresAt: Date.now() - 1 } : { action }) });
  const response = await f.request(key.rawKey, "POST", `${path}/${link._id}/revoke`);
  expect(response.status).toBe(403);
  expect((await f.t.run(ctx => ctx.db.get(link._id)))!.status).toBe("active");
  const context = await f.request(key.rawKey, "GET", "me");
  expect(context.body).toMatchObject({ data: { apiKey: { heldBack: expect.arrayContaining([expect.objectContaining({ tool: "revoke_share_link", missingPower: "active connection" })]) } } });
});
it("a blanket acknowledgement refuses in the real publish route, while an exact first-call count succeeds", async () => {
  const f = await accessFixture(); const key = await f.person.mutation(api.apiKeys.create, { householdId: f.householdId, name: "Counter" });
  const path = `moves/${f.moveId}/share-links`;
  const excessive = await f.request(key.rawKey, "POST", path, { label: "shop@example.test", acknowledgeContactDetails: { emails: 999, phones: 999, addresses: 999 } });
  expect(excessive.status).toBe(400); expect(JSON.stringify(excessive.body)).toContain("1 email addresses, 0 phone numbers and 0 street addresses");
  expect(await f.t.run(ctx => ctx.db.query("shareLinks").collect())).toHaveLength(0);
  const exact = await f.request(key.rawKey, "POST", path, { label: "shop@example.test", acknowledgeContactDetails: { emails: 1, phones: 0, addresses: 0 } });
  expect(exact.status).toBe(201);
  const link = (await f.t.run(ctx => ctx.db.query("shareLinks").collect()))[0];
  expect(await f.t.query(internal.publicPackets.getForShareLink, { shareLinkId: link._id, householdId: f.householdId, moveId: f.moveId, scope: "move", role: "guest", allowedActions: ["view", "download"], expiresAt: link.expiresAt, label: link.label })).toBeTruthy();
});
