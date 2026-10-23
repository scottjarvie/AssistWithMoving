// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- the convex-test internal handle is intentionally synthetic. */

/**
 * Database-side proofs for the legacy connection's grant lifecycle.
 *
 * The pure gate tests in `mcp-legacy-grant-gate.test.ts` cover the decision.
 * These cover `touchLegacyConnection` — the mutation that resolves, and on a
 * true first contact mints, the grant a signing-in client gets. Two of its
 * behaviours are exactly the failures Playbook v1.3.0 §2.6 requires a proof
 * for, because neither shows up in a connect-once/revoke-once test:
 *
 *   1. A revoked grant must stay revoked however many grant rows the account
 *      has accumulated. A windowed `.take(N)` scan resurrects it once the
 *      revoked row ages past the window; an indexed `by clientId` lookup does
 *      not. (Pitfall 1.)
 *   2. Two distinct clients must get two distinct grant rows, so revoking one
 *      leaves the other working. (Pitfall 2 — the flip side of refusing the
 *      shared unidentified sentinel.)
 */
import { convexTest, type TestConvex } from "convex-test";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import { api, internal } from "../../convex/_generated/api";
import { UNIDENTIFIED_LEGACY_CLIENT } from "../../convex/lib/mcpLegacyGrantGate";
import { GRANT_CONSENT_POLICY, grantCatalogFingerprint, effectiveScopes, effectiveScopeChoice, effectiveExpiry, chosenExpiry, movingScopes, findPermittingGrant } from "../../convex/lib/aiGrants";
import schema from "../../convex/schema";
import { hasQueueWorkGrant } from "../../convex/lib/mcpGrantAccess";

const consent = { consentPolicyVersion: GRANT_CONSENT_POLICY, catalogFingerprint: grantCatalogFingerprint() };

function buildModuleMap(rootDir: string): Record<string, () => Promise<unknown>> {
  const modules: Record<string, () => Promise<unknown>> = {};
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const fullPath = path.join(directory, entry);
      if (statSync(fullPath).isDirectory()) walk(fullPath);
      else if (/\.(?:ts|tsx|js)$/.test(entry))
        modules[path.relative(process.cwd(), fullPath).replace(/\\/g, "/")] =
          () => import(pathToFileURL(fullPath).href);
    }
  };
  walk(rootDir);
  return modules;
}

const modules = buildModuleMap(path.join(process.cwd(), "convex"));
const ISSUER = "https://moving-legacy-lifecycle.clerk.accounts.dev";
const SUBJECT = "user_moving_legacy_lifecycle";
const grants = (internal as any).aiGrants;

beforeEach(() => {
  process.env.CLERK_JWT_ISSUER_DOMAIN = ISSUER;
});

async function seedOwner(t: TestConvex<typeof schema>) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      clerkUserId: SUBJECT,
      email: "moving-legacy-lifecycle@example.test",
      name: "Legacy Lifecycle Owner",
      appRole: "member",
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });
    const householdId = await ctx.db.insert("households", {
      name: "Legacy Lifecycle Household",
      createdByUserId: userId,
      ownerUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(userId, { defaultHouseholdId: householdId });
    await ctx.db.insert("householdMemberships", {
      householdId,
      userId,
      role: "owner",
      status: "active",
      apiAccessStatus: "enabled",
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    return { userId, householdId };
  });
}

describe("a revoked connection stays revoked past the old scan window", () => {
  it("does not resurrect when many other grant rows exist (pitfall 1)", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedOwner(t);
    const client = "legacy:claude-desktop";

    // First contact mints and binds a grant for this client.
    const first = (await t.mutation(grants.touchLegacyConnection , {
      subject: SUBJECT,
      clientId: client,
      clientName: "Claude",
    })) as { grants: unknown[]; block?: string };
    expect(first.block).toBeUndefined();
    expect(first.grants.length).toBe(1);

    // The person revokes it, then connects and revokes many OTHER clients, so
    // the original revoked row is far from the newest rows. A `.take(32)` scan
    // ordered newest-first would no longer see it.
    await t.run(async (ctx) => {
      const now = Date.now();
      const row = await ctx.db
        .query("aiGrants")
        .withIndex("by_owner_client_status", (q) =>
          q.eq("ownerUserId", userId).eq("clientId", client),
        )
        .first();
      if (!row) throw new Error("expected the bound grant row");
      await ctx.db.patch(row._id, { status: "revoked", updatedAt: now });

      for (let index = 0; index < 40; index += 1) {
        await ctx.db.insert("aiGrants", {
          ownerUserId: userId,
          householdId,
          label: `Noise ${index}`,
          clientId: `legacy:noise-${index}`,
          scopes: ["moving.context.read"],
          moveScope: "allMoves",
          status: "revoked",
          consentBoundaryVersion: "test",
          consentSnapshot: [],
          expiresAt: now + 1_000_000,
          approvedAt: now + index + 1,
          useCount: 0,
          version: 1,
          createdAt: now + index + 1,
          updatedAt: now + index + 1,
        });
      }
    });

    // The same client signs in again. It must be told the connection was
    // revoked — not silently handed a fresh grant.
    const again = (await t.mutation(grants.touchLegacyConnection , {
      subject: SUBJECT,
      clientId: client,
      clientName: "Claude",
    })) as { grants: unknown[]; block?: string };
    expect(again.block).toBe("revoked");
    expect(again.grants.length).toBe(0);

    // And no new active grant was minted for this client behind the scenes.
    const activeForClient = await t.run(async (ctx) =>
      ctx.db
        .query("aiGrants")
        .withIndex("by_owner_client_status", (q) =>
          q.eq("ownerUserId", userId).eq("clientId", client).eq("status", "active"),
        )
        .collect(),
    );
    expect(activeForClient.length).toBe(0);
  });
});

describe("two distinct clients get two distinct grant rows", () => {
  it("keeps each connection revocable on its own (pitfall 2)", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedOwner(t);

    const a = (await t.mutation(grants.touchLegacyConnection , {
      subject: SUBJECT,
      clientId: "legacy:client-a",
      clientName: "Assistant A",
    })) as { grants: unknown[]; block?: string };
    const b = (await t.mutation(grants.touchLegacyConnection , {
      subject: SUBJECT,
      clientId: "legacy:client-b",
      clientName: "Assistant B",
    })) as { grants: unknown[]; block?: string };
    expect(a.block).toBeUndefined();
    expect(b.block).toBeUndefined();

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("aiGrants")
        .withIndex("by_owner_status_updated", (q) =>
          q.eq("ownerUserId", userId).eq("status", "active"),
        )
        .collect(),
    );
    const clientIds = rows.map((row) => row.clientId).sort();
    expect(clientIds).toEqual(["legacy:client-a", "legacy:client-b"]);

    // Revoking A must leave B untouched.
    await t.run(async (ctx) => {
      const rowA = rows.find((row) => row.clientId === "legacy:client-a");
      if (!rowA) throw new Error("expected client A's row");
      await ctx.db.patch(rowA._id, { status: "revoked", updatedAt: Date.now() });
    });
    const bStill = (await t.mutation(grants.touchLegacyConnection , {
      subject: SUBJECT,
      clientId: "legacy:client-b",
      clientName: "Assistant B",
    })) as { grants: unknown[]; block?: string };
    expect(bStill.block).toBeUndefined();
    expect(bStill.grants.length).toBeGreaterThan(0);

    const aStill = (await t.mutation(grants.touchLegacyConnection , {
      subject: SUBJECT,
      clientId: "legacy:client-a",
      clientName: "Assistant A",
    })) as { grants: unknown[]; block?: string };
    expect(aStill.block).toBe("revoked");
  });
});

describe("an unidentified client is refused, not shared", () => {
  it("never mints a grant for the shared sentinel id", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedOwner(t);

    const result = (await t.mutation(grants.touchLegacyConnection , {
      subject: SUBJECT,
      clientId: UNIDENTIFIED_LEGACY_CLIENT,
      clientName: undefined,
    })) as { grants: unknown[]; block?: string };
    expect(result.block).toBe("unidentifiedClient");
    expect(result.grants.length).toBe(0);

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("aiGrants")
        .withIndex("by_owner_updated", (q) => q.eq("ownerUserId", userId))
        .collect(),
    );
    expect(rows.length).toBe(0);
  });
});

describe("full access and optional end dates", () => {
  it("resolves full access dynamically and conservatively infers old rows", () => {
    expect(effectiveScopes({ scopes: [], scopeChoice: "full" })).toEqual(movingScopes);
    expect(effectiveScopeChoice({ scopes: [...movingScopes] })).toBe("full");
    expect(effectiveScopeChoice({ scopes: ["moving.context.read"] })).toBe("chosen");
    expect(effectiveScopes({ scopes: ["moving.context.read"], scopeChoice: "chosen" })).toEqual(["moving.context.read"]);
    expect(effectiveExpiry({ expiresAt: 1, expiryChoice: "chosen" })).toBe(1);
    expect(effectiveExpiry({ expiresAt: 1, expiryChoice: "automatic" })).toBeUndefined();
    expect(chosenExpiry(undefined, 100)).toBeUndefined();
    expect(() => chosenExpiry(NaN, 100)).toThrow();
  });

  it("includes future scopes only for full connections", () => {
    const catalog = movingScopes as unknown as string[];
    const frozen = [...movingScopes];
    catalog.push("moving.future.test");
    try {
      expect(effectiveScopes({ scopes: frozen, scopeChoice: "full" })).toContain("moving.future.test");
      expect(effectiveScopes({ scopes: frozen, scopeChoice: "chosen" })).not.toContain("moving.future.test");
      expect(effectiveScopes({ scopes: frozen })).toContain("moving.future.test");
      const base = { scopes: frozen, status: "active" as const, moveScope: "allMoves" as const, moveIds: [] };
      expect(findPermittingGrant([{ ...base, scopeChoice: "chosen" }], "moving.future.test" as any, undefined, Date.now())).toBeNull();
      expect(findPermittingGrant([{ ...base, scopeChoice: "full" }], "moving.future.test" as any, undefined, Date.now())).not.toBeNull();
    } finally { catalog.pop(); }
  });

  it("creates full, non-expiring connections and preserves person choices on reconnect", async () => {
    const t = convexTest(schema, modules);
    await seedOwner(t);
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "full-client" });
    const row = await t.run((ctx) => ctx.db.query("aiGrants").first());
    expect(row?.scopeChoice).toBe("full");
    expect(row?.scopes).toEqual(movingScopes);
    expect(row?.expiresAt).toBeUndefined();
    const owner = t.withIdentity({ subject: SUBJECT });
    await owner.mutation(api.aiGrants.updateLimits, { grantId: row!._id, expectedVersion: 1, ...consent, scopeIntent: "chosen", expiryIntent: "chosen", scopes: ["moving.context.read"], expiresInDays: 7 });
    const chosen = await t.run((ctx) => ctx.db.get(row!._id));
    expect(chosen?.scopeChoice).toBe("chosen");
    expect(chosen?.expiryChoice).toBe("chosen");
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "full-client" });
    expect(await t.run((ctx) => ctx.db.get(row!._id))).toEqual(chosen);
    await owner.mutation(api.aiGrants.updateLimits, { grantId: row!._id, expectedVersion: 2, ...consent, scopeIntent: "full", expiryIntent: "none", scopes: [...movingScopes], expiresInDays: null });
    const restored = await t.run((ctx) => ctx.db.get(row!._id));
    expect(restored?.scopeChoice).toBe("full");
    expect(restored?.expiresAt).toBeUndefined();
    expect(restored?.expiryChoice).toBe("none");
    await expect(t.withIdentity({ subject: "other" }).mutation(api.aiGrants.updateLimits, { grantId: row!._id, expectedVersion: 3, expiresInDays: null })).rejects.toThrow();
    await owner.mutation(api.aiGrants.revoke, { grantId: row!._id });
    await expect(owner.mutation(api.aiGrants.updateLimits, { grantId: row!._id, expectedVersion: 4, expiresInDays: null })).rejects.toThrow(/revoked/);
  });

  it("ignores only legacy expiry proven automatic by its durable audit receipt", async () => {
    const t = convexTest(schema, modules);
    await seedOwner(t);
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "old-client", clientName: "Old AI" });
    const row = (await t.run((ctx) => ctx.db.query("aiGrants").first()))!;
    const approvedAt = Date.now() - 31 * 86_400_000;
    await t.run(async (ctx) => {
      await ctx.db.patch(row._id, { scopeChoice: undefined, expiryChoice: undefined, consentBoundaryVersion: "2026-08-16", approvedAt, expiresAt: approvedAt + 30 * 86_400_000, scopes: movingScopes.filter((s) => s !== "moving.archive") });
      // Activity is not durable provenance: its original approval can be gone.
      const activity = await ctx.db.query("aiGrantActivities").first();
      if (activity) await ctx.db.patch(activity._id, { type: "scopeUsed", message: "Later usage only" });

    });
    const access = await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: "old-client" });
    expect(access.grants).toHaveLength(1);
    expect(access.grants[0].expiresAt).toBeNull();
    // Resolution is read-only: the original row remains available for audit.
    expect((await t.run((ctx) => ctx.db.get(row._id)))?.expiresAt).toBe(approvedAt + 30 * 86_400_000);

    expect(access.scopes).not.toContain("moving.archive");
    const owner = t.withIdentity({ subject: SUBJECT });
    await owner.mutation(api.aiGrants.updateLimits, { grantId: row._id, expectedVersion: 1, ...consent, scopeIntent: "chosen", scopes: ["moving.context.read"] });
    expect((await t.run((ctx) => ctx.db.get(row._id)))?.expiresAt).toBeUndefined();
    await t.run((ctx) => ctx.db.patch(row._id, { expiryChoice: "chosen", expiresAt: approvedAt }));
    expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: "old-client" })).grants).toHaveLength(0);
  });

  it("settings approval defaults to no expiry and marks explicit durations", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT });
    const common = { ...consent, scopeIntent: "full" as const, expiryIntent: "none" as const, householdId, label: "Manual", scopes: [...movingScopes], moveScope: "allMoves" as const };
    const { grantId } = await owner.mutation(api.aiGrants.approve, common);
    expect((await t.run((ctx) => ctx.db.get(grantId)))?.expiryChoice).toBe("none");
    const dated = await owner.mutation(api.aiGrants.approve, { ...common, expiryIntent: "chosen", expiresInDays: 30 });
    expect((await t.run((ctx) => ctx.db.get(dated.grantId)))?.expiryChoice).toBe("chosen");
    // An unmarked manual grant with the same old duration is still a choice.
    const approvedAt = Date.now() - 31 * 86_400_000;
    await t.run((ctx) => ctx.db.patch(dated.grantId, {
      expiryChoice: undefined, scopeChoice: undefined, clientId: "manual-client",
      consentBoundaryVersion: "2026-08-16", approvedAt,
      expiresAt: approvedAt + 30 * 86_400_000,
    }));
    const access = await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: "manual-client" });
    expect(access.grants.some((grant: { grantId: string }) => grant.grantId === dated.grantId)).toBe(false);

  });
});


it("edits move reach in place, validates ownership, and preserves scope and expiry choices", async () => {
  const t = convexTest(schema, modules);
  const { userId, householdId } = await seedOwner(t);
  const ids = await t.run(async ctx => {
    await ctx.db.insert("users", {
      clerkUserId: "other", email: "other-move-owner@example.test", name: "Other owner",
      appRole: "member", status: "active", createdAt: Date.now(), updatedAt: Date.now(), lastSeenAt: Date.now(),
    });
    const foreignHouseholdId = await ctx.db.insert("households", {
      name: "Other household", createdByUserId: userId, ownerUserId: userId, createdAt: Date.now(), updatedAt: Date.now(),
    });
    const makeMove = (household: typeof householdId, title: string) => ctx.db.insert("moves", {
      householdId: household, title, type: "local", status: "planning", unitSystem: "imperial",
      createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now(),
    });
    return { selected: await makeMove(householdId, "Selected"), excluded: await makeMove(householdId, "Excluded"), foreign: await makeMove(foreignHouseholdId, "Foreign") };
  });
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "move-limit-client" });
  const row = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
  const owner = t.withIdentity({ subject: SUBJECT });
  await owner.mutation(api.aiGrants.updateLimits, { grantId: row._id, expectedVersion: 1, ...consent, scopeIntent: "chosen", expiryIntent: "chosen", scopes: ["moving.context.read"], expiresInDays: 7 });
  const chosen = (await t.run(ctx => ctx.db.get(row._id)))!;
  for (const moveIds of [[], [ids.foreign]]) {
    await expect(owner.mutation(api.aiGrants.updateLimits, {
      ...consent, grantId: row._id, expectedVersion: 2, moveScope: "selectedMoves", moveIds,
    })).rejects.toThrow();
  }
  await owner.mutation(api.aiGrants.updateLimits, {
    ...consent, grantId: row._id, expectedVersion: 2, moveScope: "selectedMoves", moveIds: [ids.selected, ids.selected],
  });
  const narrowed = (await t.run(ctx => ctx.db.get(row._id)))!;
  expect(narrowed).toMatchObject({
    moveScope: "selectedMoves", moveIds: [ids.selected], scopes: chosen.scopes,
    scopeChoice: "chosen", expiryChoice: "chosen", expiresAt: chosen.expiresAt,
    clientId: chosen.clientId, approvedAt: chosen.approvedAt, ownerUserId: chosen.ownerUserId,
  });
  expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toHaveLength(1);
  const principal = { issuer: ISSUER, subject: SUBJECT, clientId: "move-limit-client" };
  await expect(t.query(internal.mcpPlanning.getMoveBrief, { principal, moveId: ids.selected })).resolves.toBeTruthy();
  await expect(t.query(internal.mcpPlanning.getMoveBrief, { principal, moveId: ids.excluded })).rejects.toThrow();
  await expect(t.withIdentity({ subject: "other" }).mutation(api.aiGrants.updateLimits, {
    ...consent, grantId: row._id, expectedVersion: 3, moveScope: "allMoves",
  })).rejects.toThrow();
  await expect(owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId: row._id, expectedVersion: 2, moveScope: "allMoves" })).rejects.toThrow(/changed/);
  await owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId: row._id, expectedVersion: 3, moveScope: "allMoves" });
  const restored = (await t.run(ctx => ctx.db.get(row._id)))!;
  expect(restored.moveIds).toBeUndefined();
  expect(restored.expiresAt).toBe(chosen.expiresAt);
  expect(restored.scopes).toEqual(chosen.scopes);
  await owner.mutation(api.aiGrants.revoke, { grantId: row._id });
  await expect(owner.mutation(api.aiGrants.updateLimits, { grantId: row._id, expectedVersion: 5, moveScope: "selectedMoves", moveIds: [ids.selected] })).rejects.toThrow(/revoked/);
});


describe("explicit settings consent protocol", () => {
  it("atomically rejects the actual unmarked old manual default of 90 days", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT });
    const before = await t.run(async ctx => ({ grants: await ctx.db.query("aiGrants").collect(), activity: await ctx.db.query("aiGrantActivities").collect(), audit: await ctx.db.query("auditLogs").collect() }));
    await expect(owner.mutation(api.aiGrants.approve, {
      householdId, label: "Old manual form", scopes: [...movingScopes], moveScope: "allMoves", expiresInDays: 90,
    })).rejects.toThrow(/Reload/);
    expect(await t.run(async ctx => ({ grants: await ctx.db.query("aiGrants").collect(), activity: await ctx.db.query("aiGrantActivities").collect(), audit: await ctx.db.query("auditLogs").collect() }))).toEqual(before);
  });

  it("validates intent consistency and stale catalogs before any writes", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT });
    const base = { ...consent, householdId, label: "Explicit", scopes: [...movingScopes], moveScope: "allMoves" as const, scopeIntent: "full" as const, expiryIntent: "none" as const };
    for (const payload of [
      { ...base, expiresInDays: 90 },
      { ...base, expiryIntent: "chosen" as const },
      { ...base, catalogFingerprint: "old-five-scopes" },
      { ...base, scopes: ["moving.context.read" as const] },
    ]) await expect(owner.mutation(api.aiGrants.approve, payload)).rejects.toThrow();
    expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toEqual([]);
    const { grantId } = await owner.mutation(api.aiGrants.approve, base);
    expect(await t.run(ctx => ctx.db.get(grantId))).toMatchObject({ scopeChoice: "full", expiryChoice: "none", scopes: [...movingScopes] });
    await expect(owner.mutation(api.aiGrants.updateLimits, { grantId, expectedVersion: 1, scopes: [...movingScopes] })).rejects.toThrow(/Reload/);
    expect((await t.run(ctx => ctx.db.get(grantId)))?.version).toBe(1);
  });

  it("never lets an unchanged or stale form widen chosen permissions and refuses atomically", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT });
    const chosen = movingScopes.filter(scope => scope !== "moving.archive");
    const { grantId } = await owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Limited", scopes: chosen, moveScope: "allMoves", scopeIntent: "chosen", expiryIntent: "none" });
    const state = () => t.run(async ctx => ({ grant: await ctx.db.get(grantId), activity: await ctx.db.query("aiGrantActivities").collect(), audit: await ctx.db.query("auditLogs").collect() }));
    const before = await state();
    for (const payload of [
      { grantId, expectedVersion: 1, scopes: [...movingScopes] },
      { ...consent, grantId, expectedVersion: 1, scopes: [...movingScopes], scopeIntent: "preserve" as const },
      { ...consent, catalogFingerprint: "stale", grantId, expectedVersion: 1, scopes: chosen, scopeIntent: "chosen" as const },
      { ...consent, grantId, expectedVersion: 1, expiresInDays: 90 },
    ]) {
      await expect(owner.mutation(api.aiGrants.updateLimits, payload)).rejects.toThrow();
      expect(await state()).toEqual(before);
    }
    await owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId, expectedVersion: 1, expiresInDays: 7, expiryIntent: "chosen" });
    expect((await state()).grant).toMatchObject({ scopes: chosen, scopeChoice: "chosen", expiryChoice: "chosen" });
  });

  it("preserves chosen all-current intent on date-only and unchanged permission edits; deliberate full follows future scopes", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT });
    const { grantId } = await owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Chosen all", scopes: [...movingScopes], moveScope: "allMoves", scopeIntent: "chosen", expiryIntent: "chosen", expiresInDays: 7 });
    await owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId, expectedVersion: 1, expiryIntent: "none", expiresInDays: null });
    await owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId, expectedVersion: 2, scopes: [...movingScopes], scopeIntent: "preserve" });
    expect((await t.run(ctx => ctx.db.get(grantId)))?.scopeChoice).toBe("chosen");
    const frozen = [...movingScopes];
    const catalog = movingScopes as unknown as string[];
    catalog.push("moving.future.test");
    try {
      await expect(owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId, expectedVersion: 3, scopes: frozen, scopeIntent: "full" })).rejects.toThrow(/Reload/);
      const row = (await t.run(ctx => ctx.db.get(grantId)))!;
      expect(effectiveScopes(row)).toEqual(frozen);
      // After reviewing the new catalog the person can deliberately restore full.
      // The synthetic scope bypasses schema validation here by exercising the pure resolver.
      const { explicitScopes } = await import("../../convex/lib/aiGrants");
      expect(explicitScopes([...movingScopes], "full")).toContain("moving.future.test");
      expect(() => explicitScopes(frozen, "full")).toThrow(/current permission catalog/);
    } finally { catalog.pop(); }
    await owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId, expectedVersion: 3, scopes: frozen, scopeIntent: "full" });
    expect((await t.run(ctx => ctx.db.get(grantId)))?.scopeChoice).toBe("full");
  });
});

async function seedDuplicateHistory(t: TestConvex<typeof schema>) {
  const { userId, householdId } = await seedOwner(t);
  await t.mutation(internal.aiGrants.touchLegacyConnection, { subject: SUBJECT, clientId: "duplicate-client" });
  return t.run(async ctx => {
    const original = (await ctx.db.query("aiGrants").first())!;
    const { _id, _creationTime, ...fields } = original;
    const now = Math.max(Date.now(), _creationTime);
    await ctx.db.patch(_id, { approvedAt: now - 10_000, updatedAt: now + 100_000 });
    const newerId = await ctx.db.insert("aiGrants", {
      ...fields, approvedAt: now - 5_000, updatedAt: now - 5_000,
      status: "revoked", revokedAt: now - 1_000,
    });
    return { oldId: _id, newerId, userId, householdId };
  });
}

async function expectDuplicateRefused(t: TestConvex<typeof schema>, block: "revoked" | "expired") {
  expect(await t.mutation(internal.aiGrants.touchLegacyConnection, {
    subject: SUBJECT, clientId: "duplicate-client",
  })).toEqual({ grants: [], block });
  expect((await t.query(internal.aiGrants.grantsForPrincipal, {
    subject: SUBJECT, clientId: "duplicate-client",
  })).grants).toEqual([]);
  await expect(t.query(internal.mcpPlanning.getMoveBrief, {
    principal: { issuer: ISSUER, subject: SUBJECT, clientId: "duplicate-client" },
  })).rejects.toThrow(/GRANT_REQUIRED/);
  expect(await t.mutation(internal.aiGrants.noteGrantUse, {
    subject: SUBJECT, clientId: "duplicate-client", toolName: "get_move_brief", scope: "moving.context.read",
  })).toBeNull();
}

describe("persisted duplicate histories resolve owner decisions before active grants", () => {
  it("refuses already-persisted partial revocation despite later usage on an old active row", async () => {
    const t = convexTest(schema, modules);
    const { oldId, newerId } = await seedDuplicateHistory(t);
    const before = await t.run(ctx => ctx.db.query("aiGrants").collect());
    await expectDuplicateRefused(t, "revoked");
    // Even replaying revoke on the already-revoked row must leave the old
    // duplicate powerless; the repair cannot depend on a new revoke mutation.
    await t.withIdentity({ subject: SUBJECT }).mutation(api.aiGrants.revoke, { grantId: newerId });
    await expectDuplicateRefused(t, "revoked");
    expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toEqual(before);
    expect((await t.run(ctx => ctx.db.get(oldId)))?.status).toBe("active");
  });

  it("honors a revocation of an older approval made after the newer approval", async () => {
    const t = convexTest(schema, modules);
    const { oldId, newerId } = await seedDuplicateHistory(t);
    await t.run(async ctx => {
      await ctx.db.patch(newerId, { status: "active", revokedAt: undefined });
      await ctx.db.patch(oldId, { status: "revoked", revokedAt: Date.now() });
    });
    await expectDuplicateRefused(t, "revoked");
  });

  it("keeps an elapsed person-chosen approval governing until the owner explicitly removes its date", async () => {
    const t = convexTest(schema, modules);
    const { newerId } = await seedDuplicateHistory(t);
    await t.run(ctx => ctx.db.patch(newerId, {
      status: "active", revokedAt: undefined, expiryChoice: "chosen", expiresAt: Date.now() - 100,
    }));
    await expectDuplicateRefused(t, "expired");
    await t.withIdentity({ subject: SUBJECT }).mutation(api.aiGrants.updateLimits, {
      ...consent, grantId: newerId, expectedVersion: 1, expiryIntent: "none", expiresInDays: null,
    });
    const result = await t.query(internal.aiGrants.grantsForPrincipal, { subject: SUBJECT, clientId: "duplicate-client" });
    expect(result.grants.map(row => row.grantId)).toEqual([newerId]);
  });

  it("allows only a later explicit approval to restore authority and preserves the revoked row binding", async () => {
    const t = convexTest(schema, modules);
    const { newerId, householdId } = await seedDuplicateHistory(t);
    const revoked = await t.run(ctx => ctx.db.get(newerId));
    const { grantId } = await t.withIdentity({ subject: SUBJECT }).mutation(api.aiGrants.approve, {
      ...consent, householdId, label: "Explicit reapproval", scopes: ["moving.context.read"],
      scopeIntent: "chosen", expiryIntent: "none", moveScope: "allMoves",
    });
    expect((await t.query(internal.aiGrants.grantsForPrincipal, {
      subject: SUBJECT, clientId: "duplicate-client",
    })).grants.map(row => row.grantId)).toEqual([grantId]);
    await t.mutation(internal.aiGrants.noteGrantUse, {
      subject: SUBJECT, clientId: "duplicate-client", toolName: "get_move_brief", scope: "moving.context.read",
    });
    expect((await t.run(ctx => ctx.db.get(grantId)))?.clientId).toBe("duplicate-client");
    expect(await t.run(ctx => ctx.db.get(newerId))).toEqual(revoked);
    expect((await t.query(internal.aiGrants.grantsForPrincipal, {
      subject: SUBJECT, clientId: "other-client",
    })).grants).toEqual([]);
  });

  it("never substitutes an older broad active approval for a newer chosen approval", async () => {
    const t = convexTest(schema, modules);
    const { newerId } = await seedDuplicateHistory(t);
    await t.run(ctx => ctx.db.patch(newerId, {
      status: "active", revokedAt: undefined, scopes: ["moving.context.read"], scopeChoice: "chosen",
    }));
    const result = await t.query(internal.aiGrants.grantsForPrincipal, { subject: SUBJECT, clientId: "duplicate-client" });
    expect(result.scopes).toEqual(["moving.context.read"]);
    expect(result.grants.map(row => row.grantId)).toEqual([newerId]);
  });

  it("makes refusal win timestamp ties, including persisted rows without revokedAt", async () => {
    const t = convexTest(schema, modules);
    const { oldId, newerId } = await seedDuplicateHistory(t);
    await t.run(async ctx => {
      const approvedAt = Date.now() - 100;
      await ctx.db.patch(oldId, { approvedAt });
      await ctx.db.patch(newerId, { approvedAt, revokedAt: undefined });
    });
    await expectDuplicateRefused(t, "revoked");
  });

  it("isolates other owners, clients and verified issuers", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedDuplicateHistory(t);
    await t.mutation(internal.aiGrants.touchLegacyConnection, { subject: SUBJECT, clientId: "unrelated-client" });
    await t.run(async ctx => {
      const now = Date.now();
      const otherOwner = await ctx.db.insert("users", {
        clerkUserId: "other-history-owner", email: "other@example.test", name: "Other", appRole: "member",
        status: "active", createdAt: now, updatedAt: now, lastSeenAt: now,
      });
      const row = (await ctx.db.query("aiGrants").withIndex("by_owner_client_status", q =>
        q.eq("ownerUserId", userId).eq("clientId", "unrelated-client")).first())!;
      const { _id, _creationTime, ...fields } = row;
      await ctx.db.insert("aiGrants", { ...fields, ownerUserId: otherOwner, householdId, clientId: "duplicate-client" });
      expect(await ctx.db.get(_id)).toEqual({ ...fields, _id, _creationTime });
    });
    await expectDuplicateRefused(t, "revoked");
    expect((await t.query(internal.aiGrants.grantsForPrincipal, { subject: SUBJECT, clientId: "unrelated-client" })).grants).toHaveLength(1);
    expect((await t.query(internal.aiGrants.grantsForPrincipal, { subject: "other-history-owner", clientId: "duplicate-client" })).grants).toHaveLength(1);
    await expect(t.query(internal.mcpPlanning.getMoveBrief, {
      principal: { issuer: "https://foreign-issuer.example.test", subject: SUBJECT, clientId: "unrelated-client" },
    })).rejects.toThrow(/AUTH_REQUIRED/);
    const moveId = await t.run(ctx => ctx.db.insert("moves", {
      householdId, title: "Issuer boundary", type: "local", status: "planning", unitSystem: "imperial",
      createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now(),
    }));
    const principal = { issuer: ISSUER, subject: SUBJECT, clientId: "unrelated-client" };
    expect(await t.run(ctx => hasQueueWorkGrant(ctx, principal, moveId))).toBe(true);
    expect(await t.run(ctx => hasQueueWorkGrant(ctx, { ...principal, issuer: "https://foreign-issuer.example.test" }, moveId))).toBe(false);
    expect(await t.run(ctx => hasQueueWorkGrant(ctx, { ...principal, clientId: "duplicate-client" }, moveId))).toBe(false);
  });

  it("fails closed on indexed history overflow without minting or using a grant", async () => {
    const t = convexTest(schema, modules);
    await seedDuplicateHistory(t);
    await t.run(async ctx => {
      const row = (await ctx.db.query("aiGrants").first())!;
      const { _id, _creationTime, ...fields } = row;
      for (let i = 0; i < 127; i++) await ctx.db.insert("aiGrants", fields);
      expect(await ctx.db.get(_id)).toEqual({ ...fields, _id, _creationTime });
    });
    const before = await t.run(ctx => ctx.db.query("aiGrants").collect());
    await expect(t.mutation(internal.aiGrants.touchLegacyConnection, { subject: SUBJECT, clientId: "duplicate-client" })).rejects.toThrow(/safe read limit/);
    await expect(t.query(internal.aiGrants.grantsForPrincipal, { subject: SUBJECT, clientId: "duplicate-client" })).rejects.toThrow(/safe read limit/);
    expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toEqual(before);
  });
});

it("requires current consent for move-only widening and refuses atomically", async () => {
  const t = convexTest(schema, modules);
  const { householdId, userId } = await seedOwner(t);
  const moveId = await t.run(ctx => ctx.db.insert("moves", {
    householdId, title: "Selected", type: "local", status: "planning", unitSystem: "imperial",
    createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now(),
  }));
  const owner = t.withIdentity({ subject: SUBJECT });
  const { grantId } = await owner.mutation(api.aiGrants.approve, {
    ...consent, householdId, label: "Move-only consent", scopes: [...movingScopes],
    scopeIntent: "full", expiryIntent: "none", moveScope: "selectedMoves", moveIds: [moveId],
  });
  const snapshot = () => t.run(async ctx => ({
    grants: await ctx.db.query("aiGrants").collect(),
    activities: await ctx.db.query("aiGrantActivities").collect(),
    audits: await ctx.db.query("auditLogs").collect(),
  }));
  const before = await snapshot();
  for (const metadata of [{}, { ...consent, consentPolicyVersion: "old" }, { ...consent, catalogFingerprint: "stale" }]) {
    await expect(owner.mutation(api.aiGrants.updateLimits, {
      ...metadata, grantId, expectedVersion: 1, moveScope: "allMoves",
    })).rejects.toThrow(/Reload/);
    expect(await snapshot()).toEqual(before);
  }
  await owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId, expectedVersion: 1, moveScope: "allMoves" });
  expect(await t.run(ctx => ctx.db.get(grantId))).toMatchObject({ moveScope: "allMoves", version: 2 });
});

it("does not let an old approval's later expiry reorder a newer explicit approval", async () => {
  const t = convexTest(schema, modules);
  const { oldId, newerId } = await seedDuplicateHistory(t);
  await t.run(async ctx => {
    await ctx.db.patch(oldId, { expiryChoice: "chosen", expiresAt: Date.now() - 1 });
    await ctx.db.patch(newerId, { status: "active", revokedAt: undefined });
  });
  expect((await t.query(internal.aiGrants.grantsForPrincipal, {
    subject: SUBJECT, clientId: "duplicate-client",
  })).grants.map(row => row.grantId)).toEqual([newerId]);
});

it("does not let a markerless no-op owner edit supersede refusal", async () => {
  const t = convexTest(schema, modules);
  const { oldId } = await seedDuplicateHistory(t);
  await t.withIdentity({ subject: SUBJECT }).mutation(api.aiGrants.updateLimits, { grantId: oldId, expectedVersion: 1 });
  expect((await t.run(ctx => ctx.db.get(oldId)))?.ownerDecisionAt).toBeUndefined();
  await expectDuplicateRefused(t, "revoked");
});
