// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import { checkPublishing } from "../../convex/lib/publishingCheck";
import { accessFixture } from "../helpers/ai-access";
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
it.each([
  "sk-ant-synthetic_token_123456", "sk-proj-synthetic_token_123456", `sk-${"a".repeat(20)}`,
  "ghp_synthetic123456", "gho_synthetic123456", "github_pat_synthetic123456",
  "glpat-synthetic123456", "AIzaSynthetic12345678901234567890123456789",
  `AKIA${"A1".repeat(8)}`, `ASIA${"Z9".repeat(8)}`,
])("refuses provider credentials in stored content despite contact acknowledgement: %s", token => {
  expect(() => checkPublishing({ body: `Stored note: ${token}` }, { emails: 0, phones: 0, addresses: 0 })).toThrow(/Publishing refused:.*(?:provider token|AWS access key).*body/);
});
it.each(["secret=synthetic_value", '"pwd": "synthetic_value"', String.raw`{\"secret\":\"synthetic_value\"}`, "db_secret:\nsynthetic_value"])("recognizes explicit secret/pwd credential fields: %s", body => {
  expect(() => checkPublishing({ body })).toThrow(/Publishing refused/);
});
it.each([{ secret: "synthetic_value" }, { pwd: "synthetic_value" }])("refuses object credential fields %j", content => {
  expect(() => checkPublishing(content)).toThrow(/Publishing refused/);
});
it.each(["password manager box", "secret compartment", "pwd reference sheet", "sk-short", `sk-${"a".repeat(19)}`, `AKIA${"a1".repeat(8)}`, `ASIA${"Z9".repeat(7)}`])("ordinary labels and non-credential values remain publishable: %s", body => {
  expect(checkPublishing({ body })).toEqual({ emails: 0, phones: 0, addresses: 0 });
});
it("an archived profile is unavailable for its own reason, never mislabeled as a sensitive-info failure", async () => {
  const f = await accessFixture();
  const ids = await f.t.run(async ctx => {
    const now = Date.now();
    const documentationProfileId = await ctx.db.insert("documentationProfiles", { householdId: f.householdId, moveId: f.moveId, type: "movingCompany", name: "Archived packet", status: "archived", includedFields: ["items"], imageRule: "none", filters: {}, allowedActions: ["view"], exportHistory: [], createdByUserId: f.userId, createdAt: now, updatedAt: now });
    const shareLinkId = await ctx.db.insert("shareLinks", { householdId: f.householdId, moveId: f.moveId, documentationProfileId, scope: "profile", tokenHash: "synthetic", tokenPreview: "synthetic", role: "guest", status: "active", allowedActions: ["view"], expiresAt: now + 60000, accessCount: 0, createdByUserId: f.userId, createdAt: now, updatedAt: now });
    return { documentationProfileId, shareLinkId };
  });
  const result = await f.t.query(internal.publicPackets.getForShareLink, { ...ids, householdId: f.householdId, moveId: f.moveId, scope: "profile", role: "guest", allowedActions: ["view"], expiresAt: Date.now() + 60000 });
  expect(result).toMatchObject({ status: "unavailable", reason: expect.stringContaining("profile is unavailable or archived") });
  expect(JSON.stringify(result)).not.toContain("publishing check");
});
it("an unavailable response never echoes a link label containing the refused credential", async () => {
  const f = await accessFixture(); const label = "sk-ant-synthetic_label_secret";
  const shareLinkId = await f.t.run(ctx => ctx.db.insert("shareLinks", { householdId: f.householdId, moveId: f.moveId, scope: "move", label, tokenHash: "synthetic", tokenPreview: "synthetic", role: "guest", status: "active", allowedActions: ["view"], expiresAt: Date.now() + 60000, accessCount: 0, createdByUserId: f.userId, createdAt: Date.now(), updatedAt: Date.now() }));
  const result = await f.t.query(internal.publicPackets.getForShareLink, { shareLinkId, householdId: f.householdId, moveId: f.moveId, scope: "move", label, role: "guest", allowedActions: ["view"], expiresAt: Date.now() + 60000 });
  expect(result).toMatchObject({ status: "unavailable", reason: expect.stringContaining("publishing check") });
  expect(JSON.stringify(result)).not.toContain(label);
});
