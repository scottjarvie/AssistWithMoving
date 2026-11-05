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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { UNIDENTIFIED_LEGACY_CLIENT } from "../../convex/lib/mcpLegacyGrantGate";
import { GRANT_CONSENT_POLICY, grantCatalogFingerprint, effectiveScopes, effectiveScopeChoice, effectiveExpiry, chosenExpiry, movingScopes, findPermittingGrant } from "../../convex/lib/aiGrants";
import schema from "../../convex/schema";
import { hasQueueWorkGrant } from "../../convex/lib/mcpGrantAccess";

// Owner controls carry the loaded management revision, as the Settings form does.
async function revokeOwner(owner: any, args: any) {
  const loaded = await owner.query(api.aiGrants.listMine, {});
  return owner.mutation(api.aiGrants.revoke, { ...args, expectedRecoveryFingerprint: loaded.recoveryFingerprint });
}

async function updateOwner(owner: any, args: any) {
  const loaded = await owner.query(api.aiGrants.listMine, {});
  return owner.mutation(api.aiGrants.updateLimits, { ...args, expectedRecoveryFingerprint: loaded.recoveryFingerprint });
}
const consent = { consentPolicyVersion: GRANT_CONSENT_POLICY, catalogFingerprint: grantCatalogFingerprint() };

it("rejects a stale alias limit edit after a newer reconnect, even if that old row did not change", async () => {
  const t = convexTest(schema, modules);
  const { householdId } = await seedOwner(t);
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  const clientId = "stale-alias-limit-edit";
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId });
  const original = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
  const aliasId = await t.run(async ctx => {
    const expiresAt = Date.now() - 1;
    await ctx.db.patch(original._id, { expiresAt, expiryChoice: "chosen" });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- persist the old source without system fields.
    const { _id, _creationTime, ...fields } = original;
    return ctx.db.insert("aiGrants", { ...fields, clientId: `legacy:${clientId}`, expiresAt, expiryChoice: "chosen" });
  });
  const loaded = await owner.query(api.aiGrants.listMine, {});
  const oldEdit = { ...consent, grantId: original._id, expectedVersion: original.version,
    expectedRecoveryFingerprint: loaded.recoveryFingerprint, scopes: [...movingScopes], scopeIntent: "preserve" as const };
  const { grantId } = await owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Current reconnect", reconnectGrantId: aliasId, expectedHistoryFingerprint: loaded.historyFingerprint });
  const before = await t.run(ctx => ctx.db.query("aiGrants").collect());
  await expect(owner.mutation(api.aiGrants.updateLimits, { ...oldEdit, expectedRecoveryFingerprint: undefined } as any)).rejects.toThrow(/expectedRecoveryFingerprint/);
  await expect(owner.mutation(api.aiGrants.updateLimits, oldEdit)).rejects.toThrow(/history changed/);
  const current = await owner.query(api.aiGrants.listMine, {});
  await expect(owner.mutation(api.aiGrants.updateLimits, { ...oldEdit, expectedRecoveryFingerprint: current.recoveryFingerprint })).rejects.toThrow(/newer connection decision/);
  expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toEqual(before);
  expect((await t.run(ctx => ctx.db.get(grantId)))?.expiresAt).toBeUndefined();
  expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId })).scopes).toEqual(movingScopes);
  expect((await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: `legacy:${clientId}` })).grants[0].scopes).toEqual(movingScopes);
});

it.each([
  { clientId: "quota-history-client", siblings: 0 },
  { clientId: "quota-history-client", siblings: 7 },
  { clientId: "https://quota.example/client.json", siblings: 0 },
  { clientId: "https://quota.example/client.json", siblings: 7 },
])("counts governing connections through repeated historical revokes: $clientId / $siblings siblings", async ({ clientId, siblings }) => {
  const t = convexTest(schema, modules);
  const { householdId } = await seedOwner(t);
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  for (let i = 0; i < siblings; i++) await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: `quota-sibling-${i}` });
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId });
  const original = (await t.run(ctx => ctx.db.query("aiGrants").collect())).find(row => row.clientId === clientId)!;
  await revokeOwner(owner, { grantId: original._id, expectedVersion: original.version });
  for (let cycle = 0; cycle < 4; cycle++) {
    const loaded = await owner.query(api.aiGrants.listMine, {});
    expect(loaded.activeCount).toBe(siblings);
    const { grantId } = await owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Recovered within quota", reconnectGrantId: original._id, expectedHistoryFingerprint: loaded.historyFingerprint });
    expect((await owner.query(api.aiGrants.listMine, {})).activeCount).toBe(siblings + 1);
    expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId })).scopes).toEqual(movingScopes);
    const preserved = await t.run(ctx => ctx.db.get(grantId));
    const historical = (await t.run(ctx => ctx.db.get(original._id)))!;
    await revokeOwner(owner, { grantId: original._id, expectedVersion: historical.version });
    expect((await owner.query(api.aiGrants.listMine, {})).activeCount).toBe(siblings);
    expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId })).scopes).toEqual([]);
    expect((await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: `legacy:${clientId}` })).block).toBe("revoked");
    expect(await t.run(ctx => ctx.db.get(grantId))).toEqual(preserved);
  }
  if (siblings === 7) {
    // First-contact admission uses the same governing count, and still
    // refuses a real ninth connection after the free slot is occupied.
    expect((await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "quota-new-eighth" })).block).toBeUndefined();
    expect((await owner.query(api.aiGrants.listMine, {})).activeCount).toBe(8);
    expect((await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "quota-real-ninth" })).block).toBe("connectionLimit");
    const loaded = await owner.query(api.aiGrants.listMine, {});
    await expect(owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Cannot exceed quota", reconnectGrantId: original._id, expectedHistoryFingerprint: loaded.historyFingerprint })).rejects.toThrow(/8 active/);
  }
});

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

describe("participant settings and cross-household self-reduction", () => {
  async function seedMoves(t: TestConvex<typeof schema>) {
    const { userId, householdId } = await seedOwner(t);
    return t.run(async ctx => {
      const now = Date.now();
      const otherHouseholdId = await ctx.db.insert("households", {
        name: "Another synthetic household", createdByUserId: userId,
        ownerUserId: userId, createdAt: now, updatedAt: now,
      });
      const move = (title: string) => ctx.db.insert("moves", {
        householdId: otherHouseholdId, title, type: "local", status: "planning",
        unitSystem: "imperial", createdByUserId: userId, createdAt: now, updatedAt: now,
      });
      return { userId, householdId, otherHouseholdId, moveId: await move("Reachable move"), otherMoveId: await move("Unreachable move") };
    });
  }

  it("lets a participant-only grant owner change scopes and end date while preserving moves", async () => {
    const t = convexTest(schema, modules);
    const { userId, moveId, otherHouseholdId } = await seedMoves(t);
    await t.run(async ctx => {
      const membership = (await ctx.db.query("householdMemberships").first())!;
      await ctx.db.patch(membership._id, { status: "disabled" });
      await ctx.db.insert("moveParticipants", {
        householdId: otherHouseholdId, moveId, userId, role: "viewer", accessKind: "moveOnly",
        participantType: "helper", status: "active", createdAt: Date.now(), updatedAt: Date.now(),
      });
    });
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "participant" });
    const grant = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
    expect(grant.householdId).toBe(otherHouseholdId);
    await updateOwner(t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" }), {
      ...consent, grantId: grant._id, expectedVersion: 1,
      scopes: ["moving.context.read"], scopeIntent: "chosen", expiryIntent: "chosen", expiresInDays: 7,
    });
    const updated = (await t.run(ctx => ctx.db.get(grant._id)))!;
    expect(updated).toMatchObject({
      scopes: ["moving.context.read"], scopeChoice: "chosen", expiryChoice: "chosen",
      moveScope: grant.moveScope, version: 2,
    });
    expect(updated.moveIds).toEqual(grant.moveIds);
    expect(updated.expiresAt).toBeGreaterThan(Date.now());
  });

  it.each(["membership", "participant"] as const)("reduces all-moves access to another household via %s", async kind => {
    const t = convexTest(schema, modules);
    const { userId, otherHouseholdId, moveId } = await seedMoves(t);
    await t.run(async ctx => {
      const now = Date.now();
      if (kind === "membership") {
        await ctx.db.insert("householdMemberships", {
          householdId: otherHouseholdId, userId, role: "viewer", status: "active",
          apiAccessStatus: "enabled", createdByUserId: userId, createdAt: now, updatedAt: now,
        });
      } else {
        await ctx.db.insert("moveParticipants", {
          householdId: otherHouseholdId, moveId, userId, role: "viewer", accessKind: "moveOnly",
          participantType: "helper", status: "active", createdAt: now, updatedAt: now,
        });
      }
    });
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "own" });
    const principal = { issuer: ISSUER, subject: SUBJECT, clientId: "own" };
    const before = await t.query(internal.mcpPlanning.getMoveBrief, { principal });
    expect(before.moves?.map(move => move.moveId)).toContain(moveId);
    const receipt = await t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: "own", expectedVersion: 1, moveIds: [moveId] });
    expect(receipt.version).toBe(2);
    expect(await t.run(ctx => ctx.db.query("aiGrants").first())).toMatchObject({ moveScope: "selectedMoves", moveIds: [moveId] });
    await expect(t.query(internal.mcpPlanning.getMoveBrief, { principal, moveId })).resolves.toBeTruthy();
  });

  it("refuses unreachable moves atomically, including a participant's sibling move", async () => {
    const t = convexTest(schema, modules);
    const { userId, otherHouseholdId, moveId, otherMoveId } = await seedMoves(t);
    await t.run(ctx => ctx.db.insert("moveParticipants", {
      householdId: otherHouseholdId, moveId, userId, role: "viewer", accessKind: "moveOnly",
      participantType: "helper", status: "active", createdAt: Date.now(), updatedAt: Date.now(),
    }));
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "own" });
    const snapshot = () => t.run(async ctx => ({
      grants: await ctx.db.query("aiGrants").collect(),
      activity: await ctx.db.query("aiGrantActivities").collect(), audit: await ctx.db.query("auditLogs").collect(),
    }));
    const before = await snapshot();
    await expect(t.mutation(grants.reduceConnection, {
      subject: SUBJECT, clientId: "own", expectedVersion: 1, moveIds: [moveId, otherMoveId],
    })).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });
});

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
  it("resolves full access dynamically and preserves every unmarked legacy row", () => {
    expect(effectiveScopes({ scopes: [], scopeChoice: "full" })).toEqual(movingScopes);
    expect(effectiveScopeChoice({ scopes: [...movingScopes] })).toBe("chosen");
    expect(effectiveScopeChoice({ scopes: ["moving.context.read"] })).toBe("chosen");
    expect(effectiveScopes({ scopes: ["moving.context.read"], scopeChoice: "chosen" })).toEqual(["moving.context.read"]);
    expect(effectiveExpiry({ expiresAt: 1, expiryChoice: "chosen" })).toBe(1);
    expect(effectiveExpiry({ expiresAt: 1, expiryChoice: "automatic" })).toBe(1);
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
      expect(effectiveScopes({ scopes: frozen })).not.toContain("moving.future.test");
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
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    await updateOwner(owner, { grantId: row!._id, expectedVersion: 1, ...consent, scopeIntent: "chosen", expiryIntent: "chosen", scopes: ["moving.context.read"], expiresInDays: 7 });
    const chosen = await t.run((ctx) => ctx.db.get(row!._id));
    expect(chosen?.scopeChoice).toBe("chosen");
    expect(chosen?.expiryChoice).toBe("chosen");
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "full-client" });
    expect(await t.run((ctx) => ctx.db.get(row!._id))).toEqual(chosen);
    await updateOwner(owner, { grantId: row!._id, expectedVersion: 2, ...consent, scopeIntent: "full", expiryIntent: "none", scopes: [...movingScopes], expiresInDays: null });
    const restored = await t.run((ctx) => ctx.db.get(row!._id));
    expect(restored?.scopeChoice).toBe("full");
    expect(restored?.expiresAt).toBeUndefined();
    expect(restored?.expiryChoice).toBe("none");
    await expect(updateOwner(t.withIdentity({ subject: "other" }), { grantId: row!._id, expectedVersion: 3, expiresInDays: null })).rejects.toThrow();
    await revokeOwner(owner, { grantId: row!._id, expectedVersion: 3 });
    await expect(updateOwner(owner, { grantId: row!._id, expectedVersion: 4, expiresInDays: null })).rejects.toThrow(/revoked/);
  });

  it("preserves legacy expiry even with an automatic audit receipt", async () => {
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
    expect(access.grants).toHaveLength(0);
    // Resolution is read-only: the original row remains available for audit.
    expect((await t.run((ctx) => ctx.db.get(row._id)))?.expiresAt).toBe(approvedAt + 30 * 86_400_000);

    expect(access.scopes).not.toContain("moving.archive");
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    await updateOwner(owner, { grantId: row._id, expectedVersion: 1, ...consent, scopeIntent: "chosen", scopes: ["moving.context.read"] });
    expect((await t.run((ctx) => ctx.db.get(row._id)))?.expiresAt).toBe(approvedAt + 30 * 86_400_000);
    await t.run((ctx) => ctx.db.patch(row._id, { expiryChoice: "chosen", expiresAt: approvedAt }));
    expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: "old-client" })).grants).toHaveLength(0);
  });

  it("settings approval defaults to no expiry and marks explicit durations", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
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
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  await updateOwner(owner, { grantId: row._id, expectedVersion: 1, ...consent, scopeIntent: "chosen", expiryIntent: "chosen", scopes: ["moving.context.read"], expiresInDays: 7 });
  const chosen = (await t.run(ctx => ctx.db.get(row._id)))!;
  for (const moveIds of [[], [ids.foreign]]) {
    await expect(updateOwner(owner, {
      ...consent, grantId: row._id, expectedVersion: 2, moveScope: "selectedMoves", moveIds,
    })).rejects.toThrow();
  }
  await updateOwner(owner, {
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
  await expect(updateOwner(t.withIdentity({ subject: "other" }), {
    ...consent, grantId: row._id, expectedVersion: 3, moveScope: "allMoves",
  })).rejects.toThrow();
  await expect(updateOwner(owner, { ...consent, grantId: row._id, expectedVersion: 2, moveScope: "allMoves" })).rejects.toThrow(/changed/);
  await updateOwner(owner, { ...consent, grantId: row._id, expectedVersion: 3, moveScope: "allMoves" });
  const restored = (await t.run(ctx => ctx.db.get(row._id)))!;
  expect(restored.moveIds).toBeUndefined();
  expect(restored.expiresAt).toBe(chosen.expiresAt);
  expect(restored.scopes).toEqual(chosen.scopes);
  await revokeOwner(owner, { grantId: row._id, expectedVersion: restored.version });
  await expect(updateOwner(owner, { grantId: row._id, expectedVersion: 5, moveScope: "selectedMoves", moveIds: [ids.selected] })).rejects.toThrow(/revoked/);
});


describe("explicit settings consent protocol", () => {
  it("atomically rejects the actual unmarked old manual default of 90 days", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    const before = await t.run(async ctx => ({ grants: await ctx.db.query("aiGrants").collect(), activity: await ctx.db.query("aiGrantActivities").collect(), audit: await ctx.db.query("auditLogs").collect() }));
    await expect(owner.mutation(api.aiGrants.approve, {
      householdId, label: "Old manual form", scopes: [...movingScopes], moveScope: "allMoves", expiresInDays: 90,
    })).rejects.toThrow(/Reload/);
    expect(await t.run(async ctx => ({ grants: await ctx.db.query("aiGrants").collect(), activity: await ctx.db.query("aiGrantActivities").collect(), audit: await ctx.db.query("auditLogs").collect() }))).toEqual(before);
  });

  it("validates intent consistency and stale catalogs before any writes", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
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
    await expect(updateOwner(owner, { grantId, expectedVersion: 1, scopes: [...movingScopes] })).rejects.toThrow(/Reload/);
    expect((await t.run(ctx => ctx.db.get(grantId)))?.version).toBe(1);
  });

  it("never lets an unchanged or stale form widen chosen permissions and refuses atomically", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
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
      await expect(updateOwner(owner, payload)).rejects.toThrow();
      expect(await state()).toEqual(before);
    }
    await updateOwner(owner, { ...consent, grantId, expectedVersion: 1, expiresInDays: 7, expiryIntent: "chosen" });
    expect((await state()).grant).toMatchObject({ scopes: chosen, scopeChoice: "chosen", expiryChoice: "chosen" });
  });

  it("preserves chosen all-current intent on date-only and unchanged permission edits; deliberate full follows future scopes", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    const { grantId } = await owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Chosen all", scopes: [...movingScopes], moveScope: "allMoves", scopeIntent: "chosen", expiryIntent: "chosen", expiresInDays: 7 });
    await updateOwner(owner, { ...consent, grantId, expectedVersion: 1, expiryIntent: "none", expiresInDays: null });
    await updateOwner(owner, { ...consent, grantId, expectedVersion: 2, scopes: [...movingScopes], scopeIntent: "preserve" });
    expect((await t.run(ctx => ctx.db.get(grantId)))?.scopeChoice).toBe("chosen");
    const frozen = [...movingScopes];
    const catalog = movingScopes as unknown as string[];
    catalog.push("moving.future.test");
    try {
      await expect(updateOwner(owner, { ...consent, grantId, expectedVersion: 3, scopes: frozen, scopeIntent: "full" })).rejects.toThrow(/Reload/);
      const row = (await t.run(ctx => ctx.db.get(grantId)))!;
      expect(effectiveScopes(row)).toEqual(frozen);
      // After reviewing the new catalog the person can deliberately restore full.
      // The synthetic scope bypasses schema validation here by exercising the pure resolver.
      const { explicitScopes } = await import("../../convex/lib/aiGrants");
      expect(explicitScopes([...movingScopes], "full")).toContain("moving.future.test");
      expect(() => explicitScopes(frozen, "full")).toThrow(/current permission catalog/);
    } finally { catalog.pop(); }
    await updateOwner(owner, { ...consent, grantId, expectedVersion: 3, scopes: frozen, scopeIntent: "full" });
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

describe("explicit owner reconnect", () => {
  it.each([2, 128, 129])("a fresh revoke of an already-revoked alias stops recovery with %i records", async count => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    const clientId = "acknowledged-revoked-client";
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId });
    const original = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
    const aliasId = await t.run(async ctx => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- fixture copies persisted fields only.
      const { _id, _creationTime, ...fields } = original;
      for (let i = 2; i < count; i++) await ctx.db.insert("aiGrants", { ...fields, status: "revoked", clientId: `history-${i}` });
      return ctx.db.insert("aiGrants", { ...fields, clientId: `legacy:${clientId}` });
    });
    await revokeOwner(owner, { grantId: original._id, expectedVersion: 1 });
    await revokeOwner(owner, { grantId: aliasId, expectedVersion: 1 });
    const loaded = await owner.query(api.aiGrants.listMine, {});
    await owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Recovered client", reconnectGrantId: original._id, expectedHistoryFingerprint: loaded.historyFingerprint, expectedRecoveryFingerprint: loaded.recoveryFingerprint });
    expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId })).scopes).toEqual(movingScopes);
    // Both requests refer to the same already-revoked row revision. Only the
    // fresh management revision expresses a decision after the reconnect.
    await expect(owner.mutation(api.aiGrants.revoke, { grantId: aliasId, expectedVersion: 2, expectedRecoveryFingerprint: loaded.recoveryFingerprint })).rejects.toThrow(/history changed/);
    expect(await revokeOwner(owner, { grantId: aliasId, expectedVersion: 2 })).toMatchObject({ alreadyRevoked: false });
    expect((await t.run(ctx => ctx.db.get(aliasId)))?.version).toBe(3);
    for (const id of [clientId, `legacy:${clientId}`]) {
      expect((await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: id })).block).toBe("revoked");
      expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: id })).scopes).toEqual([]);
    }
  });

  it("keeps malformed historical URL ids readable and revocable without authorizing their valid URL", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "healthy-client" });
    const original = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
    const invalidIds = await t.run(async ctx => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- fixture preserves old stored identifiers verbatim.
      const { _id, _creationTime, ...fields } = original;
      return Promise.all(["https://client.example/id#instance", "legacy:https://client.example/id#other"].map(clientId => ctx.db.insert("aiGrants", { ...fields, householdId, clientId })));
    });
    const page = await owner.query(api.aiGrants.listMine, {});
    expect(page.grants).toHaveLength(3);
    for (const id of invalidIds) {
      expect(page.grants.find(row => row.grantId === id)?.effectiveAuthority).toBeNull();
      await revokeOwner(owner, { grantId: id, expectedVersion: 1 });
    }
    expect((await owner.query(api.aiGrants.listMine, {})).grants).toHaveLength(3);
    expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: "healthy-client" })).scopes).toEqual(movingScopes);
    expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: "https://client.example/id" })).scopes).toEqual([]);
    expect((await t.run(ctx => ctx.db.get(invalidIds[0])))?.clientId).toBe("https://client.example/id#instance");
  });

  it("reconnects into a currently eligible household after losing the original membership", async () => {
    const t = convexTest(schema, modules);
    const { householdId, userId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "relocated-client" });
    const original = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
    await revokeOwner(owner, { grantId: original._id, expectedVersion: 1 });
    const target = await t.run(async ctx => {
      const membership = (await ctx.db.query("householdMemberships").first())!;
      await ctx.db.patch(membership._id, { status: "disabled" });
      const next = await ctx.db.insert("households", { name: "Current household", createdByUserId: userId, ownerUserId: userId, createdAt: Date.now(), updatedAt: Date.now() });
      await ctx.db.insert("householdMemberships", { householdId: next, userId, role: "owner", status: "active", apiAccessStatus: "enabled", createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() });
      return next;
    });
    const loaded = await owner.query(api.aiGrants.listMine, {});
    const args = { ...consent, householdId, label: "Relocated connection", reconnectGrantId: original._id, expectedHistoryFingerprint: loaded.historyFingerprint };
    await expect(owner.mutation(api.aiGrants.approve, args)).rejects.toThrow();
    const { grantId } = await owner.mutation(api.aiGrants.approve, { ...args, householdId: target });
    expect((await t.run(ctx => ctx.db.get(grantId)))?.householdId).toBe(target);
    expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: "relocated-client" })).scopes).toEqual(movingScopes);
    expect((await t.run(ctx => ctx.db.get(original._id)))?.householdId).toBe(householdId);
  });

  it.each([
    ["reconnect-client", "legacy:reconnect-client"],
    ["https://CLIENT.example:443/a/../client.json", "legacy:https://client.example/client.json"],
  ])("replaces only acknowledged revisions across %s and %s", async (first, alias) => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now());
    try {
      const t = convexTest(schema, modules);
      const { householdId } = await seedOwner(t);
      const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
      await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: first });
      const original = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
      const aliasId = await t.run(async ctx => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- copy stored fields without Convex document metadata.
        const { _id: _originalId, _creationTime: _originalTime, ...fields } = original;
        return ctx.db.insert("aiGrants", { ...fields, clientId: alias });
      });
      await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "untouched-sibling" });
      await revokeOwner(owner, { grantId: original._id, expectedVersion: 1 });
      await owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Unrelated approval" });
      const before = await t.run(ctx => ctx.db.query("aiGrants").collect());
      for (const clientId of [first, alias]) {
        expect((await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId })).block).toBe("revoked");
      }
      const args = { ...consent, householdId, label: "Reconnect this AI", reconnectGrantId: original._id };
      for (const expectedHistoryFingerprint of [undefined, "stale"]) {
        await expect(owner.mutation(api.aiGrants.approve, { ...args, expectedHistoryFingerprint })).rejects.toThrow(/history changed/);
      }
      const loaded = await owner.query(api.aiGrants.listMine, {});
      await expect(owner.mutation(api.aiGrants.approve, { ...args, expectedHistoryFingerprint: loaded.historyFingerprint, catalogFingerprint: "old" })).rejects.toThrow(/Reload/);
      await expect(t.withIdentity({ subject: SUBJECT, client_id: first }).mutation(api.aiGrants.approve, { ...args, expectedHistoryFingerprint: loaded.historyFingerprint })).rejects.toThrow(/settings/);
      expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toEqual(before);

      const { grantId } = await owner.mutation(api.aiGrants.approve, { ...args, expectedHistoryFingerprint: loaded.historyFingerprint });
      const restored = (await t.run(ctx => ctx.db.get(grantId)))!;
      expect(restored).toMatchObject({ clientId: first, scopeChoice: "full", expiryChoice: "none" });
      expect(restored.expiresAt).toBeUndefined();
      expect(restored.reconnectsClientHistory).toEqual(expect.arrayContaining([
        { grantId: original._id, version: 2 }, { grantId: aliasId, version: 1 },
      ]));
      expect(restored.reconnectsClientHistory).toHaveLength(2);
      await expect(owner.mutation(api.aiGrants.revoke, { grantId: aliasId, expectedVersion: 1, expectedRecoveryFingerprint: loaded.recoveryFingerprint })).rejects.toThrow(/history changed/);
      for (const previous of before) expect(await t.run(ctx => ctx.db.get(previous._id))).toEqual(previous);
      for (const clientId of [first, alias]) {
        expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId })).scopes).toEqual(movingScopes);
        // Versions 1 and 3 were observable before this reconnect (two aliases).
        for (const expectedVersion of [1, 3]) await expect(t.mutation(grants.reduceConnection, {
          subject: SUBJECT, clientId, expectedVersion, action: "revoke",
        })).rejects.toThrow(/changed/);
      }
      expect(restored.version).toBeGreaterThan(3);
      const audit = await t.run(ctx => ctx.db.query("auditLogs").filter(q => q.eq(q.field("objectId"), grantId)).first());
      expect(audit).toMatchObject({ actorType: "user", action: "ai_grant.approved", metadata: { reconnected: true } });
      await expect(owner.mutation(api.aiGrants.approve, { ...args, expectedHistoryFingerprint: loaded.historyFingerprint })).rejects.toThrow(/history changed/);
      const current = await owner.query(api.aiGrants.listMine, {});
      await expect(owner.mutation(api.aiGrants.approve, { ...args, expectedHistoryFingerprint: current.historyFingerprint })).rejects.toThrow(/already has active/);

      // A later refusal on an acknowledged alias still wins in the SAME ms.
      await revokeOwner(owner, { grantId: aliasId, expectedVersion: 1 });
      for (const clientId of [first, alias]) {
        expect((await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId })).block).toBe("revoked");
      }
      expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: "untouched-sibling" })).scopes).toEqual(movingScopes);
    } finally { clock.mockRestore(); }
  });

  it("reconnects an expired client with the owner's new chosen limits", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "expired-client" });
    const original = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
    await t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: "expired-client", expectedVersion: 1, action: "pause" });
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    const loaded = await owner.query(api.aiGrants.listMine, {});
    const previous = await t.run(ctx => ctx.db.get(original._id));
    const { grantId } = await owner.mutation(api.aiGrants.approve, {
      ...consent, householdId, label: "Chosen reconnect", reconnectGrantId: original._id,
      expectedHistoryFingerprint: loaded.historyFingerprint,
      scopeIntent: "chosen", scopes: ["moving.context.read"], expiryIntent: "chosen", expiresInDays: 7,
    });
    const restored = (await t.run(ctx => ctx.db.get(grantId)))!;
    expect(restored).toMatchObject({ scopeChoice: "chosen", scopes: ["moving.context.read"], expiryChoice: "chosen" });
    expect(restored.expiresAt).toBeGreaterThan(Date.now());
    expect(await t.run(ctx => ctx.db.get(original._id))).toEqual(previous);
    for (const clientId of ["expired-client", "legacy:expired-client"]) {
      expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId })).scopes).toEqual(["moving.context.read"]);
    }
  });

  it("refuses foreign and unbound reconnect targets without changing records", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    const { grantId: unbound } = await owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Unbound" });
    const foreign = await t.run(async ctx => {
      const row = (await ctx.db.get(unbound))!;
      const userId = await ctx.db.insert("users", { clerkUserId: "another-owner", email: "other@example.test", name: "Other", appRole: "member", status: "active", createdAt: Date.now(), updatedAt: Date.now(), lastSeenAt: Date.now() });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- copy stored fields without Convex document metadata.
      const { _id: _sourceId, _creationTime: _sourceTime, ...fields } = row;
      return ctx.db.insert("aiGrants", { ...fields, ownerUserId: userId, clientId: "foreign", status: "revoked" });
    });
    const loaded = await owner.query(api.aiGrants.listMine, {});
    const before = await t.run(ctx => ctx.db.query("aiGrants").collect());
    for (const reconnectGrantId of [foreign, unbound]) {
      await expect(owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Invalid reconnect", reconnectGrantId, expectedHistoryFingerprint: loaded.historyFingerprint })).rejects.toThrow(/previously connected/);
    }
    expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toEqual(before);
  });

  it("keeps settings and explicit reconnect usable at the history limit without adding a row", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const clientId = "https://capacity.example/client.json";
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId });
    const original = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    await revokeOwner(owner, { grantId: original._id, expectedVersion: 1 });
    await t.run(async ctx => {
      const row = (await ctx.db.get(original._id))!;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- omit Convex system fields from historical fixture copies.
      const { _id, _creationTime, ...fields } = row;
      for (let i = 0; i < 127; i++) await ctx.db.insert("aiGrants", { ...fields, clientId: `capacity-noise-${i}` });
    });
    const loaded = await owner.query(api.aiGrants.listMine, {});
    expect(loaded.grants).toHaveLength(128);
    expect(loaded).toMatchObject({ historyAtCapacity: true, historyOverflow: false });
    expect(loaded.historyFingerprint).toBeTruthy();
    await expect(owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Would overflow" })).rejects.toThrow(/history is full/);
    expect((await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "would-overflow" })).block).toBe("connectionLimit");
    const previous = await t.run(ctx => ctx.db.get(original._id));
    const { grantId } = await owner.mutation(api.aiGrants.approve, {
      ...consent, householdId, label: "Reconnect at capacity", reconnectGrantId: original._id,
      expectedHistoryFingerprint: loaded.historyFingerprint,
    });
    expect(grantId).toBe(original._id);
    const restored = (await t.run(ctx => ctx.db.get(grantId)))!;
    expect(restored).toMatchObject({ version: 3, status: "active", scopeChoice: "full", expiryChoice: "none" });
    expect(restored.expiresAt).toBeUndefined();
    await expect(revokeOwner(owner, { grantId } as any)).rejects.toThrow(/expectedVersion/);
    await expect(revokeOwner(owner, { grantId, expectedVersion: original.version })).rejects.toThrow(/changed/);
    expect(await t.run(ctx => ctx.db.get(grantId))).toEqual(restored);
    expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toHaveLength(128);
    const audits = await t.run(ctx => ctx.db.query("auditLogs").collect());
    expect(audits.every(event => event.metadata?.previousGrant === undefined)).toBe(true);
    expect((await owner.query(api.aiGrants.listSourceHistory, {})).page[0].source).toEqual(previous);
    for (const id of [clientId, `legacy:${clientId}`]) {
      expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: id })).scopes).toEqual(movingScopes);
      await expect(t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: id, expectedVersion: 1, action: "revoke" })).rejects.toThrow(/changed/);
    }
    expect((await owner.query(api.aiGrants.listMine, {})).grants).toHaveLength(128);
    await revokeOwner(owner, { grantId, expectedVersion: restored.version });
    expect((await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId })).block).toBe("revoked");
  });

  it.each(["overflow-client", "https://overflow.example/client.json"])("recovers %s from oversized history without scanning away refusals or losing records", async clientId => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId });
    const original = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
    const aliasId = await t.run(async ctx => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- omit system fields from persisted historical fixtures.
      const { _id, _creationTime, ...fields } = original;
      for (let i = 0; i < 129; i++) await ctx.db.insert("aiGrants", { ...fields, status: "revoked", clientId: `overflow-noise-${i}` });
      return ctx.db.insert("aiGrants", { ...fields, clientId: `legacy:${clientId}` });
    });
    await revokeOwner(owner, { grantId: original._id, expectedVersion: 1 });
    const loaded = await owner.query(api.aiGrants.listMine, {});
    expect(loaded.historyFingerprint).toBeUndefined();
    expect(loaded.nextCursor).toBeTruthy();
    const older = await owner.query(api.aiGrants.listMine, { cursor: loaded.nextCursor! });
    expect(older.grants.length).toBeGreaterThan(0);
    expect(older.historyOverflow).toBe(true);
    expect(older.recoveryFingerprint).toBe(loaded.recoveryFingerprint);
    const args = { ...consent, householdId, label: "Owner overflow recovery", reconnectGrantId: original._id, expectedRecoveryFingerprint: loaded.recoveryFingerprint };
    const previous = await t.run(ctx => ctx.db.get(original._id));
    const count = (await t.run(ctx => ctx.db.query("aiGrants").collect())).length;
    for (const expectedRecoveryFingerprint of [undefined, "stale"]) await expect(owner.mutation(api.aiGrants.approve, { ...args, expectedRecoveryFingerprint })).rejects.toThrow(/history changed/);
    await expect(t.withIdentity({ subject: SUBJECT, client_id: clientId }).mutation(api.aiGrants.approve, args)).rejects.toThrow(/settings/);
    const { grantId } = await owner.mutation(api.aiGrants.approve, args);
    expect(grantId).toBe(original._id);
    const recovered = (await t.run(ctx => ctx.db.get(grantId)))!;
    expect(recovered).toMatchObject({ version: -1, recoveredClientKey: clientId, scopeChoice: "full", expiryChoice: "none" });
    expect(recovered.expiresAt).toBeUndefined();
    await expect(owner.mutation(api.aiGrants.revoke, { grantId: aliasId, expectedVersion: 1, expectedRecoveryFingerprint: loaded.recoveryFingerprint })).rejects.toThrow(/history changed/);
    await expect(revokeOwner(owner, { grantId } as any)).rejects.toThrow(/expectedVersion/);
    await expect(revokeOwner(owner, { grantId, expectedVersion: original.version })).rejects.toThrow(/changed/);
    expect(await t.run(ctx => ctx.db.get(grantId))).toEqual(recovered);
    expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toHaveLength(count);
    const audits = await t.run(ctx => ctx.db.query("auditLogs").collect());
    expect(audits.every(row => row.metadata?.previousGrant === undefined)).toBe(true);
    const archive = await owner.query(api.aiGrants.listSourceHistory, {});
    expect(archive.page[0].source).toEqual(previous);
    const other = await t.run(ctx => ctx.db.insert("users", { clerkUserId: "archive-outsider", email: "outsider@example.test", name: "Another person", appRole: "member", status: "active", createdAt: Date.now(), updatedAt: Date.now(), lastSeenAt: Date.now() }));
    expect(other).toBeTruthy();
    expect((await t.withIdentity({ subject: "archive-outsider", sid: "sess_outsider_fixture" }).query(api.aiGrants.listSourceHistory, {})).page).toEqual([]);
    await expect(t.withIdentity({ subject: SUBJECT, client_id: clientId }).query(api.aiGrants.listSourceHistory, {})).rejects.toThrow(/settings/);
    for (const id of [clientId, `legacy:${clientId}`]) {
      expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: id })).scopes).toEqual(movingScopes);
      await expect(t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: id, expectedVersion: 1, action: "revoke" })).rejects.toThrow(/changed/);
    }
    await expect(owner.mutation(api.aiGrants.approve, args)).rejects.toThrow(/history changed/);
    await updateOwner(owner, { ...consent, grantId, expectedVersion: -1, scopes: ["moving.context.read"], scopeIntent: "chosen" });
    expect((await t.run(ctx => ctx.db.get(grantId)))?.version).toBe(-2);
    const beforeStaleRecovery = await owner.query(api.aiGrants.listMine, {});
    await revokeOwner(owner, { grantId: aliasId, expectedVersion: 1 });
    for (const id of [clientId, `legacy:${clientId}`]) expect((await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: id })).block).toBe("revoked");
    await expect(owner.mutation(api.aiGrants.approve, { ...args, expectedRecoveryFingerprint: beforeStaleRecovery.recoveryFingerprint })).rejects.toThrow(/history changed/);
    const current = await owner.query(api.aiGrants.listMine, {});
    await owner.mutation(api.aiGrants.approve, { ...args, expectedRecoveryFingerprint: current.recoveryFingerprint });
    const newest = (await t.run(ctx => ctx.db.get(grantId)))!;
    expect(newest.version).toBe(-4);
    await expect(t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId, expectedVersion: -1, action: "revoke" })).rejects.toThrow(/changed/);
    expect((await t.mutation(grants.reduceLegacyConnection, { caller: { subject: SUBJECT, claims: { client_id: clientId } }, expectedVersion: -4, scopes: ["moving.context.read"] })).version).toBe(-5);
    expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId })).scopes).toEqual(["moving.context.read"]);
  });
});

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
    expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toEqual(before);
    // Even replaying revoke on the already-revoked row must leave the old
    // duplicate powerless; the repair cannot depend on a new revoke mutation.
    await revokeOwner(t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" }), { grantId: newerId, expectedVersion: (await t.run(ctx => ctx.db.get(newerId)))!.version });
    await expectDuplicateRefused(t, "revoked");
    // A fresh person decision advances its receipt even if the selected
    // source was already revoked; enforcement itself never rewrites history.
    expect(await t.run(ctx => ctx.db.get(newerId))).toMatchObject({ status: "revoked", version: before.find(row => row._id === newerId)!.version + 1 });
    expect(await t.run(ctx => ctx.db.get(oldId))).toEqual(before.find(row => row._id === oldId));
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
    await updateOwner(t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" }), {
      ...consent, grantId: newerId, expectedVersion: 1, expiryIntent: "none", expiresInDays: null,
    });
    const result = await t.query(internal.aiGrants.grantsForPrincipal, { subject: SUBJECT, clientId: "duplicate-client" });
    expect(result.grants.map(row => row.grantId)).toEqual([newerId]);
  });

  it("never lets a new unbound approval override bound refusal history", async () => {
    const t = convexTest(schema, modules);
    const { newerId, householdId } = await seedDuplicateHistory(t);
    const revoked = await t.run(ctx => ctx.db.get(newerId));
    const { grantId } = await t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" }).mutation(api.aiGrants.approve, {
      ...consent, householdId, label: "New unrelated approval",
    });
    await expectDuplicateRefused(t, "revoked");
    expect((await t.run(ctx => ctx.db.get(grantId)))?.clientId).toBeUndefined();
    expect(await t.run(ctx => ctx.db.get(newerId))).toEqual(revoked);
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
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    const settings = await owner.query(api.aiGrants.listMine, {});
    expect(settings).toMatchObject({ historyAtCapacity: true, historyOverflow: true });
    expect(settings.historyFingerprint).toBeUndefined();
    expect(settings.grants).toHaveLength(129);
    const active = before.find(row => row.status === "active")!;
    await revokeOwner(owner, { grantId: active._id, expectedVersion: active.version });
    expect((await owner.query(api.aiGrants.listMine, {})).grants.find(row => row.grantId === active._id)?.status).toBe("revoked");
  });
});

it("requires current consent for move-only widening and refuses atomically", async () => {
  const t = convexTest(schema, modules);
  const { householdId, userId } = await seedOwner(t);
  const moveId = await t.run(ctx => ctx.db.insert("moves", {
    householdId, title: "Selected", type: "local", status: "planning", unitSystem: "imperial",
    createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now(),
  }));
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
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
    await expect(updateOwner(owner, {
      ...metadata, grantId, expectedVersion: 1, moveScope: "allMoves",
    })).rejects.toThrow(/Reload/);
    expect(await snapshot()).toEqual(before);
  }
  await updateOwner(owner, { ...consent, grantId, expectedVersion: 1, moveScope: "allMoves" });
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
  await expect(updateOwner(t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" }), { grantId: oldId, expectedVersion: 1 })).rejects.toThrow(/newer connection decision/);
  expect((await t.run(ctx => ctx.db.get(oldId)))?.ownerDecisionAt).toBeUndefined();
  await expectDuplicateRefused(t, "revoked");
});

describe("FAD own-connection authority", () => {
  it("defaults omitted fresh choices to full/all/no-end while retaining consent", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    await expect(owner.mutation(api.aiGrants.approve, { householdId, label: "Missing consent" })).rejects.toThrow(/Reload/);
    const { grantId } = await owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Defaults" });
    expect(await t.run(ctx => ctx.db.get(grantId))).toMatchObject({ scopes: [...movingScopes], scopeChoice: "full", moveScope: "allMoves", expiryChoice: "none" });
    expect((await t.run(ctx => ctx.db.get(grantId)))?.expiresAt).toBeUndefined();
    expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: "atomic-client" })).grants).toEqual([]);
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "atomic-client" });
    expect((await t.run(ctx => ctx.db.get(grantId)))?.clientId).toBe("atomic-client");
    // A second caller cannot use the claimed grant during the receipt gap.
    expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: "sibling" })).grants).toEqual([]);
  });

  it("reduces only its bound connection, atomically records version/activity/audit, and refuses widening", async () => {
    const t = convexTest(schema, modules);
    const { householdId, userId } = await seedOwner(t);
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "own" });
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "sibling" });
    const sibling = (await t.run(ctx => ctx.db.query("aiGrants").collect())).find(row => row.clientId === "sibling");
    const now = Date.now();
    const move = (title: string) => t.run(ctx => ctx.db.insert("moves", { householdId, title, type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: now, updatedAt: now }));
    const a = await move("A"), b = await move("B");
    const receipt = await t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: "own", expectedVersion: 1, scopes: ["moving.context.read"], moveIds: [a], expiresAt: now + 10_000 });
    expect(receipt.version).toBe(2);
    expect(await t.run(ctx => ctx.db.get(receipt.receipt))).toMatchObject({ action: "ai_grant.self_reduced", actorType: "agent", metadata: { version: 2 } });
    const own = (await t.run(ctx => ctx.db.query("aiGrants").collect())).find(row => row.clientId === "own")!;
    expect(await t.run(ctx => ctx.db.query("aiGrantActivities").withIndex("by_grant_created", q => q.eq("grantId", own._id)).collect())).toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining("version 2") })]));
    for (const input of [{ scopes: [...movingScopes] }, { moveIds: [a, b] }, { expiresAt: null }, { expiresAt: now + 20_000 }, { action: "reactivate" }, { action: "rotate" }]) {
      await expect(t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: "own", expectedVersion: 2, ...input })).rejects.toThrow(/Settings|settings/);
      expect(await t.run(ctx => ctx.db.get(own._id))).toEqual(own);
    }
    await expect(t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: "own", expectedVersion: 1, scopes: [] })).rejects.toThrow(/changed/);
    await t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: "own", expectedVersion: 2, action: "pause" });
    await expect(t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: "own", expectedVersion: 3, action: "reactivate" })).rejects.toThrow(/settings/);
    expect(await t.run(ctx => ctx.db.get(sibling!._id))).toEqual(sibling);
  });

  it("blocks AI JWTs from person mutation paths even with current consent", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const oauth = t.withIdentity({ subject: SUBJECT, client_id: "ai-client" });
    await expect(oauth.mutation(api.aiGrants.approve, { ...consent, householdId, label: "No widening" })).rejects.toThrow(/settings/);
    await expect(oauth.mutation(api.apiKeys.create, { householdId, name: "No new authority" })).rejects.toThrow(/settings/);
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "own" });
    const row = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
    await expect(updateOwner(oauth, { ...consent, grantId: row._id, expectedVersion: 1, scopes: [...movingScopes], scopeIntent: "full" })).rejects.toThrow(/settings/);
    await expect(oauth.mutation(api.aiGrants.revoke, { grantId: row._id, expectedVersion: row.version, expectedRecoveryFingerprint: "not-owner-consent" })).rejects.toThrow(/settings/);
  });

  it("refuses explicit scope and date edits to older duplicates", async () => {
    const t = convexTest(schema, modules);
    const { oldId } = await seedDuplicateHistory(t);
    for (const edits of [{ scopes: [...movingScopes], scopeIntent: "full" as const }, { expiresInDays: null, expiryIntent: "none" as const }]) {
      await expect(updateOwner(t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" }), { ...consent, grantId: oldId, expectedVersion: 1, ...edits })).rejects.toThrow(/newer connection decision/);
      await expectDuplicateRefused(t, "revoked");
    }
  });

  it("defaults omitted API-key choices to full/future and no expiry", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const created = await t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" }).mutation(api.apiKeys.create, { householdId, name: "Default key" });
    const row = await t.run(ctx => ctx.db.get(created.apiKeyId));
    const { apiKeyScopes } = await import("../../convex/lib/apiKeys");
    expect(row).toMatchObject({ scopeChoice: "full", version: 1 });
    expect(row?.scopes.slice().sort()).toEqual([...apiKeyScopes].sort());
    expect(row?.expiresAt).toBeUndefined();
    expect(row?.moveId).toBeUndefined();
  });

  it("API-key HTTP reductions bind the authenticated bearer and keep legacy records exact", async () => {
    const t = convexTest(schema, modules);
    const { householdId, userId } = await seedOwner(t);
    const { generateApiKeySecret, hashApiKey, apiKeyPrefix, effectiveApiKeyScopes, apiKeyScopes } = await import("../../convex/lib/apiKeys");
    const raw = generateApiKeySecret();
    const secretHash = await hashApiKey(raw);
    const keyId = await t.run(ctx => ctx.db.insert("apiKeys", { householdId, name: "Synthetic", prefix: apiKeyPrefix(raw), tokenPreview: "synthetic", secretHash, scopes: [...apiKeyScopes], scopeChoice: "full", status: "active", createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() }));
    const request = (body: unknown) => t.mutation(internal.restApi.handle, { method: "POST", path: "me/access", query: {}, authorization: `Bearer ${raw}`, body });
    const narrowed = await request({ expectedVersion: 1, scopes: ["moves/read"], expiresAt: Date.now() + 100_000 });
    expect(narrowed.status).toBe(200);
    const changed = (await t.run(ctx => ctx.db.get(keyId)))!;
    expect(changed).toMatchObject({ version: 2, scopes: ["moves/read"], scopeChoice: "chosen" });
    for (const body of [{ expectedVersion: 2, scopes: [...apiKeyScopes] }, { expectedVersion: 2, expiresAt: null }, { expectedVersion: 2, expiresAt: Date.now() + 200_000 }, { expectedVersion: 2, action: "reactivate" }, { expectedVersion: 2, apiKeyId: keyId }, { expectedVersion: 1, scopes: [] }]) {
      expect((await request(body)).status).toBeGreaterThanOrEqual(400);
      expect(await t.run(ctx => ctx.db.get(keyId))).toEqual(changed);
    }
    expect((await request({ expectedVersion: 2, action: "revoke" })).status).toBe(200);
    expect((await request({ expectedVersion: 3, action: "reactivate" })).status).toBeGreaterThanOrEqual(400);
    const frozen = ["moves/read" as const];
    expect(effectiveApiKeyScopes({ scopes: frozen })).toEqual(frozen);
    expect(effectiveApiKeyScopes({ scopes: frozen, scopeChoice: "full" })).toEqual(apiKeyScopes);
  });
});

it("persisted OAuth reduction derives its client from gateway-injected identity", async () => {
  const t = convexTest(schema, modules);
  await seedOwner(t);
  for (const clientId of ["legacy:caller", "legacy:sibling"]) await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId });
  const before = await t.run(ctx => ctx.db.query("aiGrants").collect());
  const result = await t.mutation(grants.reduceLegacyConnection, { caller: { subject: SUBJECT, claims: { client_id: "caller" } }, expectedVersion: 1, scopes: ["moving.context.read"] });
  expect(result.version).toBe(2);
  const after = await t.run(ctx => ctx.db.query("aiGrants").collect());
  expect(after.find(row => row.clientId === "legacy:sibling")).toEqual(before.find(row => row.clientId === "legacy:sibling"));
  await expect(t.mutation(grants.reduceLegacyConnection, { caller: { subject: SUBJECT, claims: { client_id: "caller" } }, expectedVersion: 2, scopes: [...movingScopes] })).rejects.toThrow(/settings/);
  const revoked = await t.mutation(grants.reduceLegacyConnection, { caller: { subject: SUBJECT, claims: { client_id: "caller" } }, expectedVersion: 2, action: "revoke" });
  expect(await t.run(ctx => ctx.db.get(revoked.receipt))).toMatchObject({ action: "ai_grant.self_reduced", metadata: { version: 3 } });
  expect((await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "legacy:caller" })).block).toBe("revoked");
});

it("requires loaded history for unbound refusal recovery and refuses stale duplicate edits", async () => {
  const t = convexTest(schema, modules);
  const { oldId, newerId, householdId } = await seedDuplicateHistory(t);
  await t.run(async ctx => {
    await ctx.db.patch(oldId, { clientId: undefined });
    await ctx.db.patch(newerId, { clientId: undefined });
  });
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  await expect(updateOwner(owner, { ...consent, grantId: oldId, expectedVersion: 1, scopes: [...movingScopes], scopeIntent: "full" })).rejects.toThrow(/newer connection decision/);
  const args = { ...consent, householdId, label: "Fresh manual approval" };
  for (const extra of [{}, { expectedHistoryFingerprint: "stale" }]) await expect(owner.mutation(api.aiGrants.approve, { ...args, ...extra })).rejects.toThrow(/history changed/);
  expect((await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "new-client" })).block).toBe("revoked");
  const loaded = await owner.query(api.aiGrants.listMine, {});
  const { grantId } = await owner.mutation(api.aiGrants.approve, { ...args, expectedHistoryFingerprint: loaded.historyFingerprint });
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "new-client" });
  expect((await t.run(ctx => ctx.db.get(grantId)))?.clientId).toBe("new-client");
});


describe.each([
  [["alias-client", "legacy:alias-client"]],
  [["https://client.example", "legacy:https://client.example/"]],
  [["https://client.example/", "legacy:https://CLIENT.example:443"]],
  [["https://CLIENT.example:443/a/../client.json", "legacy:https://client.example/client.json"]],
])("OAuth history variants %j enforce one credential's authority", (aliases) => {
  const access = (t: TestConvex<typeof schema>, clientId: string) => t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId });

  for (const first of aliases) {
    it(`honors narrowing, pause and revocation on both doors after first contact on ${first}`, async () => {
      const t = convexTest(schema, modules);
      await seedOwner(t);
      await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: first });
      const stored = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
      const date = Date.now() + 100_000;
      const receipt = await t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: aliases.find(id => id !== first)!, expectedVersion: 1, scopes: ["moving.context.read"], expiresAt: date });
      expect(receipt.version).toBe(2);
      for (const clientId of aliases) {
        expect((await access(t, clientId)).grants).toEqual([expect.objectContaining({ grantId: stored._id, version: 2, scopes: ["moving.context.read"], expiresAt: date })]);
        await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId });
      }
      expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toHaveLength(1);
      await t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: first, expectedVersion: 2, action: "pause" });
      for (const clientId of aliases) {
        expect((await access(t, clientId)).scopes).toEqual([]);
        expect((await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId })).block).toBe("expired");
      }
      await revokeOwner(t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" }), { grantId: stored._id, expectedVersion: 3 });
      for (const clientId of aliases) expect((await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId })).block).toBe("revoked");
    });
  }

  it("intersects disagreeing aliases without rewriting legacy scopes/dates or choosing broader authority", async () => {
    const t = convexTest(schema, modules);
    const { householdId, userId } = await seedOwner(t);
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: aliases[0] });
    const date = Date.now() + 100_000;
    const [a, b] = await Promise.all(["A", "B"].map(title => t.run(ctx => ctx.db.insert("moves", { householdId, title, type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() }))));
    await t.run(async ctx => {
      const row = (await ctx.db.query("aiGrants").first())!;
      await ctx.db.patch(row._id, { scopes: ["moving.context.read", "moving.queue.work"], scopeChoice: undefined, expiresAt: date, expiryChoice: undefined, moveScope: "selectedMoves", moveIds: [a] });
      const { _id, _creationTime, ...fields } = row;
      await ctx.db.insert("aiGrants", { ...fields, clientId: aliases[1], approvedAt: row.approvedAt + 1, scopes: ["moving.context.read", "moving.work.write"], scopeChoice: "chosen", moveScope: "selectedMoves", moveIds: [a, b] });
      expect((await ctx.db.get(_id))?._creationTime).toBe(_creationTime);
    });
    const before = await t.run(ctx => ctx.db.query("aiGrants").collect());
    for (const clientId of aliases) {
      const result = await access(t, clientId);
      expect(result.grants).toEqual([expect.objectContaining({ scopes: ["moving.context.read"], version: 2, moveIds: [a], expiresAt: date, scopeChoice: "chosen" })]);
      await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId });
      expect(await t.run(ctx => hasQueueWorkGrant(ctx, { issuer: ISSUER, subject: SUBJECT, clientId }, a))).toBe(false);
      await expect(t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId, expectedVersion: 2, scopes: ["moving.queue.work"] })).rejects.toThrow(/settings/);
    }
    expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toEqual(before);
    // Only a loaded person edit may widen each existing alias. Neither alias
    // can hide the other's remaining restriction.
    for (const row of before) await updateOwner(t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" }), { ...consent, grantId: row._id, expectedVersion: 1, scopes: [...movingScopes], scopeIntent: "full", moveScope: "allMoves", expiresInDays: null, expiryIntent: "none" });
    for (const clientId of aliases) expect((await access(t, clientId)).grants).toEqual([expect.objectContaining({ scopes: [...movingScopes], expiresAt: null, version: 4, moveScope: "allMoves" })]);
    const narrowed = await t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: aliases[1], expectedVersion: 4, scopes: [] });
    expect(narrowed.version).toBe(5);
    for (const clientId of aliases) {
      expect((await access(t, clientId)).scopes).toEqual([]);
      await expect(t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId, expectedVersion: 4, scopes: [] })).rejects.toThrow(/changed/);
    }
  });

  for (const restriction of ["revoked", "expired"] as const) {
    it(`does not hide ${restriction} alias history behind newer broad aliases, duplicates or fresh approvals`, async () => {
      const t = convexTest(schema, modules);
      const { householdId } = await seedOwner(t);
      await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: aliases[0] });
      await t.run(async ctx => {
        const row = (await ctx.db.query("aiGrants").first())!;
        const { _id, _creationTime, ...fields } = row;
        await ctx.db.insert("aiGrants", { ...fields, clientId: aliases[1], approvedAt: row.approvedAt + 10 });
        await ctx.db.patch(_id, restriction === "revoked" ? { status: "revoked", revokedAt: row.approvedAt + 1 } : { expiresAt: Date.now() - 1 });
        // Older broad duplicate is never a substitute for the refused alias.
        await ctx.db.insert("aiGrants", { ...fields, approvedAt: row.approvedAt - 10 });
        expect((await ctx.db.get(_id))?._creationTime).toBe(_creationTime);
      });
      await t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" }).mutation(api.aiGrants.approve, { ...consent, householdId, label: "Unbound unrelated" });
      const before = await t.run(ctx => ctx.db.query("aiGrants").collect());
      for (const clientId of aliases) {
        expect((await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId })).block).toBe(restriction);
        expect((await access(t, clientId)).grants).toEqual([]);
      }
      expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toEqual(before);
    });
  }

  it("serializes first-contact alias races to one grant and isolates siblings", async () => {
    const t = convexTest(schema, modules);
    await seedOwner(t);
    await Promise.all(aliases.map(clientId => t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId })));
    expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toHaveLength(1);
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "sibling" });
    const sibling = (await t.run(ctx => ctx.db.query("aiGrants").collect())).find(row => row.clientId === "sibling")!;
    await Promise.all([
      t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: aliases[0], expectedVersion: 1, action: "revoke" }),
      t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: aliases[1] }),
    ]);
    for (const clientId of aliases) expect((await access(t, clientId)).grants).toEqual([]);
    expect(await t.run(ctx => ctx.db.get(sibling._id))).toEqual(sibling);
    expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toHaveLength(2);
  });
});


describe("normalized URL histories preserve all governing stored decisions", () => {
  const aliases = ["https://CLIENT.example:443", "legacy:https://client.example", "https://client.example/", "legacy:https://client.example/"];
  for (const refusal of ["limits", "revoked", "expired", "paused"] as const) {
    it(`honors ${refusal} across raw/legacy/normalized duplicates without touching rows`, async () => {
      const t = convexTest(schema, modules);
      const { householdId, userId } = await seedOwner(t);
      const [a, b] = await Promise.all(["A", "B"].map(title => t.run(ctx => ctx.db.insert("moves", { householdId, title, type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() }))));
      await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: aliases[0] });
      const expiry = Date.now() + 100_000;
      await t.run(async ctx => {
        const original = (await ctx.db.query("aiGrants").first())!;
        const { _id, _creationTime, ...fields } = original;
        expect(_creationTime).toBeTypeOf("number");
        for (const [index, clientId] of aliases.entries()) {
          if (index === 0) await ctx.db.patch(_id, { scopes: ["moving.context.read", "moving.queue.work"], scopeChoice: undefined, moveScope: "selectedMoves", moveIds: [a], expiresAt: expiry, expiryChoice: undefined });
          else await ctx.db.insert("aiGrants", { ...fields, clientId, approvedAt: original.approvedAt + index, scopes: ["moving.context.read", "moving.work.write"], scopeChoice: "chosen", moveScope: "selectedMoves", moveIds: [a, b], expiresAt: expiry + index * 10_000 });
        }
        if (refusal === "revoked") await ctx.db.patch(_id, { status: "revoked", revokedAt: original.approvedAt + 1 });
        if (refusal === "expired" || refusal === "paused") await ctx.db.patch(_id, { expiresAt: Date.now() - 1, ...(refusal === "paused" ? { expiryChoice: "chosen" as const } : {}) });
        // An older broad duplicate must not replace the raw alias's decision.
        await ctx.db.insert("aiGrants", { ...fields, approvedAt: original.approvedAt - 10 });
      });
      const before = await t.run(ctx => ctx.db.query("aiGrants").collect());
      for (const clientId of aliases) {
        const result = await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId });
        const touched = await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId });
        if (refusal === "limits") {
          expect(result.grants).toEqual([expect.objectContaining({ scopes: ["moving.context.read"], moveIds: [a], expiresAt: expiry, version: 4 })]);
          expect(touched.block).toBeUndefined();
          await expect(t.run(ctx => hasQueueWorkGrant(ctx, { subject: SUBJECT, issuer: ISSUER, clientId }, b))).resolves.toBe(false);
          await expect(t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId, expectedVersion: 4, moveIds: [b] })).rejects.toThrow(/settings/);
          await expect(t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId, expectedVersion: 4, expiresAt: expiry + 1 })).rejects.toThrow(/settings/);
        } else {
          expect(result.grants).toEqual([]);
          expect(touched.block).toBe(refusal === "revoked" ? "revoked" : "expired");
        }
      }
      expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toEqual(before);
      if (refusal === "limits") {
        await t.mutation(grants.reduceLegacyConnection, { caller: { subject: SUBJECT, claims: { client_id: aliases[0] } }, expectedVersion: 4, scopes: [], expiresAt: expiry - 1 });
        for (const clientId of aliases) {
          expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId })).grants).toEqual([expect.objectContaining({ scopes: [], version: 5, expiresAt: expiry - 1 })]);
          await expect(t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId, expectedVersion: 4, scopes: [] })).rejects.toThrow(/changed/);
        }
      }
    });
  }

  it("does not merge distinct URL paths/queries, opaque siblings or invalid stored URLs", async () => {
    const t = convexTest(schema, modules);
    await seedOwner(t);
    for (const clientId of ["https://client.example/path", "https://client.example/path/", "https://client.example/path?x=1", "https://client.example/path?x=2", "opaque-client"]) {
      await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId });
    }
    const rows = await t.run(ctx => ctx.db.query("aiGrants").collect());
    expect(rows).toHaveLength(5);
    await t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: "https://CLIENT.example:443/path", expectedVersion: 1, action: "revoke" });
    for (const row of rows.filter(row => row.clientId !== "https://client.example/path")) {
      expect(await t.run(ctx => ctx.db.get(row._id))).toEqual(row);
      expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: row.clientId })).grants).toHaveLength(1);
    }
    await t.run(async ctx => {
      const { _id, _creationTime, ...fields } = rows[0];
      await ctx.db.insert("aiGrants", { ...fields, clientId: "https://client.example/path#not-a-valid-CIMD", status: "revoked" });
      expect((await ctx.db.get(_id))?._creationTime).toBe(_creationTime);
    });
    expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: "https://client.example/path/" })).grants).toHaveLength(1);
  });
});


describe("R1 scope-free API context", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("hides gated move content after zero/readless reductions on REST and both API-key MCP registries, and restores only by person edit", async () => {
    const t = convexTest(schema, modules);
    const { householdId, userId } = await seedOwner(t);
    await t.run(ctx => ctx.db.patch(householdId, { name: "PRIVATE household name", slug: "private-household" }));
    const { generateApiKeySecret, hashApiKey, apiKeyPrefix } = await import("../../convex/lib/apiKeys");
    const { registerTools } = await import("../../mcp-server/assistwithmoving-mcp.mjs");
    const moveId = await t.run(ctx => ctx.db.insert("moves", { householdId, title: "PRIVATE move title", origin: "PRIVATE origin", destination: "PRIVATE destination", dateStart: "2027-01-01", dateEnd: "2027-01-02", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() }));
    let raw = generateApiKeySecret();
    const secretHash = await hashApiKey(raw);
    const expiresAt = Date.now() + 600000;
    const keyId = await t.run(ctx => ctx.db.insert("apiKeys", { householdId, name: "Synthetic context", prefix: apiKeyPrefix(raw), tokenPreview: "synthetic", secretHash, moveId, scopes: ["moves/read", "inventory/read"], expiresAt, status: "active", createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() }));
    const context = () => t.mutation(internal.restApi.handle, { method: "GET", path: "me", query: {}, authorization: `Bearer ${raw}` });
    const readMove = () => t.mutation(internal.restApi.handle, { method: "GET", path: `moves/${moveId}`, query: {}, authorization: `Bearer ${raw}` });
    const reduce = (version: number, scopes: string[]) => t.mutation(internal.restApi.handle, { method: "POST", path: "me/access", query: {}, authorization: `Bearer ${raw}`, body: { expectedVersion: version, scopes } });
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname.replace("/api/v1/", "");
      const result = await t.mutation(internal.restApi.handle, { method: "GET", path, query: {}, authorization: (init.headers as Record<string, string>).authorization });
      return new Response(JSON.stringify(result.body), { status: result.status, headers: { "content-type": "application/json" } });
    });
    const invokeContext = async (selected: boolean) => {
      const registrations = new Map<string, any>();
      registerTools({ registerTool: (name: string, _definition: any, handler: any) => registrations.set(name, handler) }, { baseUrl: "https://synthetic.example/api/v1", apiKey: raw }, selected ? { allowedToolNames: ["get_api_context", "reduce_connection"] } : undefined);
      return registrations.get("get_api_context")({});
    };
    expect(JSON.stringify((await context()).body)).toContain("PRIVATE move title");
    expect((await context()).body).toMatchObject({ data: { apiKey: { status: "active", expiresAt } } });
    for (const selected of [false, true]) {
      const tool = await invokeContext(selected);
      expect(JSON.parse(tool.content[0].text)).toMatchObject({ data: { apiKey: { status: "active", expiresAt } } });
      expect(JSON.stringify(tool)).toContain("PRIVATE move title");
    }
    expect((await readMove()).status).toBe(200);
    for (const [version, scopes] of [[1, ["inventory/read"]], [2, []]] as const) {
      const receipt = await reduce(version, [...scopes]);
      expect(receipt.status).toBe(200);
      const result = await context();
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ data: { household: null, apiKey: { version: version + 1, scopes: [...scopes], status: "active", expiresAt }, restrictedMove: null } });
      expect(JSON.stringify(result.body)).not.toContain("PRIVATE");
      expect(JSON.stringify(result.body)).not.toContain(moveId);
      expect((await readMove()).status).toBe(403);
      for (const selected of [false, true]) {
        const tool = await invokeContext(selected);
        expect(tool.isError).not.toBe(true);
        expect(JSON.stringify(tool)).not.toContain("PRIVATE");
        expect(JSON.stringify(tool)).not.toContain(moveId);
        expect(JSON.parse(tool.content[0].text)).toMatchObject({ data: { apiKey: { status: "active", expiresAt }, restrictedMove: null } });
      }
    }
    const replacement = await t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" }).mutation(api.apiKeys.create, { householdId, moveId, name: "Person restored read authority", scopes: ["moves/read"] });
    raw = replacement.rawKey;
    expect((await context()).body).toMatchObject({ data: { apiKey: { status: "active", expiresAt: null } } });
    expect((await t.run(ctx => ctx.db.get(keyId)))?.scopes).toEqual([]);
    expect((await readMove()).status).toBe(200);
    expect(JSON.stringify((await context()).body)).toContain("PRIVATE move title");
    for (const selected of [false, true]) expect(JSON.stringify(await invokeContext(selected))).toContain("PRIVATE move title");
  });
});


describe("current eligibility and capacity when owner edits restore access", () => {
  it.each(["none", "chosen"] as const)("refuses expiry-only %s restoration after membership loss, but permits a reduction", async expiryIntent => {
    const t = convexTest(schema, modules);
    await seedOwner(t);
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "expired-owner" });
    const row = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
    await t.run(async ctx => {
      await ctx.db.patch(row._id, { expiresAt: Date.now() - 1000, expiryChoice: "chosen" });
      const membership = (await ctx.db.query("householdMemberships").first())!;
      await ctx.db.patch(membership._id, { status: "disabled" });
    });
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    await expect(updateOwner(owner, { ...consent, grantId: row._id, expectedVersion: 1, expiryIntent, expiresInDays: expiryIntent === "none" ? null : 7 })).rejects.toThrow(/active member/);
    expect((await t.run(ctx => ctx.db.get(row._id)))?.version).toBe(1);
    await updateOwner(owner, { ...consent, grantId: row._id, expectedVersion: 1, scopes: ["moving.context.read"], scopeIntent: "chosen" });
    expect((await t.run(ctx => ctx.db.get(row._id)))?.expiresAt).toBeLessThan(Date.now());
  });

  it("counts active grants beyond expired rows before restoring, then permits restoration after revocation", async () => {
    const t = convexTest(schema, modules);
    await seedOwner(t);
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "restore-cap" });
    const original = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
    const activeIds = await t.run(async ctx => {
      await ctx.db.patch(original._id, { expiresAt: Date.now() - 1000, expiryChoice: "chosen" });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- historical fixtures omit system fields.
      const { _id, _creationTime, ...fields } = original;
      for (let i = 0; i < 20; i++) await ctx.db.insert("aiGrants", { ...fields, clientId: "expired-noise-" + i, expiresAt: Date.now() - 1000, expiryChoice: "chosen" });
      const ids = [];
      for (let i = 0; i < 8; i++) ids.push(await ctx.db.insert("aiGrants", { ...fields, clientId: "active-cap-" + i }));
      return ids;
    });
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    const payload = { ...consent, grantId: original._id, expectedVersion: 1, expiryIntent: "none" as const, expiresInDays: null };
    await expect(updateOwner(owner, payload)).rejects.toThrow(/8 active/);
    expect((await t.run(ctx => ctx.db.get(original._id)))?.version).toBe(1);
    await revokeOwner(owner, { grantId: activeIds[0], expectedVersion: 1 });
    await updateOwner(owner, payload);
    expect((await t.run(ctx => ctx.db.get(original._id)))?.expiresAt).toBeUndefined();
  });

  it("rejects widening scopes or expiry after losing eligibility on a still active connection", async () => {
    const t = convexTest(schema, modules);
    await seedOwner(t);
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "widen-ineligible" });
    const row = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
    await t.run(async ctx => {
      await ctx.db.patch(row._id, { scopes: ["moving.context.read"], scopeChoice: "chosen", expiryChoice: "chosen", expiresAt: Date.now() + 86400000 });
      const membership = (await ctx.db.query("householdMemberships").first())!;
      await ctx.db.patch(membership._id, { status: "disabled" });
    });
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    for (const edits of [{ scopes: [...movingScopes], scopeIntent: "full" as const }, { expiresInDays: null, expiryIntent: "none" as const }]) {
      await expect(updateOwner(owner, { ...consent, grantId: row._id, expectedVersion: 1, ...edits })).rejects.toThrow(/active member/);
    }
  });
});


it("pages private original source history even after the owner loses household administration", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedOwner(t);
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "private-archive" });
  const source = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
  await t.run(async ctx => {
    const membership = (await ctx.db.query("householdMemberships").first())!;
    await ctx.db.patch(membership._id, { status: "disabled" });
    for (let i = 0; i < 26; i++) await ctx.db.insert("aiGrantSourceHistory", { ownerUserId: userId, grantId: source._id, archivedAt: Date.now() + i, source });
  });
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  const first = await owner.query(api.aiGrants.listSourceHistory, {});
  expect(first.page).toHaveLength(25);
  expect(first.isDone).toBe(false);
  const last = await owner.query(api.aiGrants.listSourceHistory, { cursor: first.continueCursor });
  expect(last.page).toHaveLength(1);
  expect(last.isDone).toBe(true);
  expect(last.page[0].source).toEqual(source);
  await expect(owner.query(api.audit.listForHousehold, { householdId: source.householdId })).rejects.toThrow();
});


describe("private owner queries and participant reconnects", () => {
  it.each([{ client_id: "own-client" }, { clientId: "own-client" }, { azp: "opaque-client" }, { scope: "openid" }, { scp: ["openid"] }, { tokenType: "oauth" }, { azp: "https://oauth.example/client.json", sid: undefined }, { sid: undefined }, { sid: "" }, { sid: "sess_" }, { sts: "pending" }])("refuses a non-person identity %j on all owner-facing queries", async claims => {
    const t = convexTest(schema, modules);
    await seedOwner(t);
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "sibling" });
    const oauth = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture", ...claims });
    await expect(oauth.query(api.aiGrants.listMine, {})).rejects.toThrow(/settings/);
    await expect(oauth.query(api.aiGrants.listActivity, {})).rejects.toThrow(/settings/);
    await expect(oauth.query(api.aiGrants.listMoveChoices, { householdId: (await t.run(ctx => ctx.db.query("households").first()))!._id })).rejects.toThrow(/settings/);
    await expect(oauth.query(api.aiGrants.listSourceHistory, {})).rejects.toThrow(/settings/);
    await expect(oauth.query(api.aiGrants.listRecoveryHouseholds, {})).rejects.toThrow(/settings/);
    await expect(oauth.query(api.aiGrants.listHouseholdChoices, {})).rejects.toThrow(/settings/);
    await expect(oauth.query(api.aiGrants.listReceipts, {})).rejects.toThrow(/settings/);
    expect((await t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" }).query(api.aiGrants.listMine, {})).grants).toHaveLength(1);
  });

  it("refuses URL azp without a signed session marker on every owner mutation", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture", azp: "https://movingmanifest.com" });
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "owner-only-fixture" });
    const grant = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
    const { apiKeyId } = await owner.mutation(api.apiKeys.create, { householdId, name: "Owner-only fixture" });
    const loaded = await owner.query(api.aiGrants.listMine, {});
    const oauth = t.withIdentity({ subject: SUBJECT, azp: "https://oauth.example/client.json" });
    const before = await t.run(async ctx => ({ grant: await ctx.db.get(grant._id), key: await ctx.db.get(apiKeyId) }));
    await expect(oauth.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Disallowed widening" })).rejects.toThrow(/settings/);
    await expect(updateOwner(oauth, { ...consent, grantId: grant._id, expectedVersion: grant.version, scopeIntent: "full" })).rejects.toThrow(/settings/);
    await expect(oauth.mutation(api.aiGrants.revoke, { grantId: grant._id, expectedVersion: grant.version, expectedRecoveryFingerprint: loaded.recoveryFingerprint })).rejects.toThrow(/settings/);
    await expect(oauth.mutation(api.apiKeys.create, { householdId, name: "Disallowed key" })).rejects.toThrow(/settings/);
    await expect(oauth.query(api.apiKeys.listForHousehold, { householdId })).rejects.toThrow(/settings/);
    await expect(oauth.mutation(api.apiKeys.revoke, { householdId, apiKeyId, expectedVersion: 1 })).rejects.toThrow(/settings/);
    await expect(oauth.mutation(api.apiKeys.rotate, { householdId, apiKeyId })).rejects.toThrow(/settings/);
    expect(await t.run(async ctx => ({ grant: await ctx.db.get(grant._id), key: await ctx.db.get(apiKeyId) }))).toEqual(before);
  });

  it("pages eligible move-only recovery households and recovers after losing the original household", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "participant-relocated" });
    const original = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
    await revokeOwner(owner, { grantId: original._id, expectedVersion: 1 });
    const target = await t.run(async ctx => {
      const membership = (await ctx.db.query("householdMemberships").first())!;
      await ctx.db.patch(membership._id, { status: "disabled" });
      let latest;
      for (let i = 0; i < 27; i++) {
        const nextHousehold = await ctx.db.insert("households", { name: "PRIVATE household profile", createdByUserId: userId, ownerUserId: userId, createdAt: Date.now(), updatedAt: Date.now() });
        const moveId = await ctx.db.insert("moves", { householdId: nextHousehold, title: `Accessible participant move ${i}`, type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() });
        const participantId = await ctx.db.insert("moveParticipants", { householdId: nextHousehold, moveId, userId, role: "viewer", accessKind: "moveOnly", participantType: "helper", status: "active", createdAt: Date.now(), updatedAt: Date.now() });
        latest = { householdId: nextHousehold, moveId, participantId };
      }
      for (const [status, accessKind, archived] of [["disabled", "moveOnly", false], ["active", "householdBacked", false], ["active", "moveOnly", true]] as const) {
        const moveId = await ctx.db.insert("moves", { householdId, title: "INELIGIBLE move", type: "local", status: archived ? "archived" : "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() });
        await ctx.db.insert("moveParticipants", { householdId, moveId, userId, role: "viewer", accessKind, participantType: "helper", status, createdAt: Date.now(), updatedAt: Date.now() });
      }
      return latest!;
    });
    const first = await owner.query(api.aiGrants.listRecoveryHouseholds, {});
    expect(first.households).toHaveLength(25);
    const second = await owner.query(api.aiGrants.listRecoveryHouseholds, { cursor: first.nextCursor! });
    expect(second.households).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    const choices = [...first.households, ...second.households];
    expect(JSON.stringify(choices)).not.toMatch(/PRIVATE|INELIGIBLE/);
    expect(choices.some(choice => choice.householdId === target.householdId)).toBe(true);
    expect((await owner.query(api.aiGrants.listMoveChoices, { householdId: target.householdId })).moves.map(move => move.moveId)).toEqual([target.moveId]);
    const loaded = await owner.query(api.aiGrants.listMine, {});
    const args = { ...consent, householdId: target.householdId, label: "Participant recovery", reconnectGrantId: original._id, expectedHistoryFingerprint: loaded.historyFingerprint, moveScope: "selectedMoves" as const, moveIds: [target.moveId] };
    await t.run(ctx => ctx.db.patch(target.participantId, { status: "disabled" }));
    await expect(owner.mutation(api.aiGrants.approve, args)).rejects.toThrow(/active member or move participant|No access to this move/);
    await t.run(ctx => ctx.db.patch(target.participantId, { status: "active" }));
    const { grantId } = await owner.mutation(api.aiGrants.approve, args);
    expect(await t.run(ctx => ctx.db.get(grantId))).toMatchObject({ householdId: target.householdId, moveIds: [target.moveId], scopeChoice: "full", expiryChoice: "none" });
    expect((await t.run(ctx => ctx.db.get(original._id)))?.householdId).toBe(householdId);
  });

  it.each([0, 127, 129])("lets a current move-only participant recover with %s other historical rows", async noise => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedOwner(t);
    const participantId = await t.run(async ctx => {
      const membership = (await ctx.db.query("householdMemberships").first())!;
      await ctx.db.patch(membership._id, { status: "disabled" });
      const moveId = await ctx.db.insert("moves", { householdId, title: "Participant move", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() });
      return ctx.db.insert("moveParticipants", { householdId, moveId, userId, role: "viewer", accessKind: "moveOnly", participantType: "helper", status: "active", createdAt: Date.now(), updatedAt: Date.now() });
    });
    const clientId = "https://participant.example/client.json";
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId });
    const original = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    await revokeOwner(owner, { grantId: original._id, expectedVersion: 1 });
    await t.run(async ctx => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- original historical fixtures omit system fields.
      const { _id, _creationTime, ...fields } = original;
      for (let i = 0; i < noise; i++) await ctx.db.insert("aiGrants", { ...fields, clientId: "participant-noise-" + i, status: "revoked" });
    });
    const loaded = await owner.query(api.aiGrants.listMine, {});
    const payload = { ...consent, householdId, label: "Reconnect participant AI", reconnectGrantId: original._id, expectedHistoryFingerprint: loaded.historyFingerprint, expectedRecoveryFingerprint: loaded.recoveryFingerprint };
    await t.run(ctx => ctx.db.patch(participantId, { status: "disabled" }));
    await expect(owner.mutation(api.aiGrants.approve, payload)).rejects.toThrow(/active member or move participant/);
    await t.run(ctx => ctx.db.patch(participantId, { status: "active" }));
    await expect(owner.mutation(api.aiGrants.approve, { ...payload, catalogFingerprint: "stale" })).rejects.toThrow(/Reload/);
    const { grantId } = await owner.mutation(api.aiGrants.approve, payload);
    const recovered = (await t.run(ctx => ctx.db.get(grantId)))!;
    expect(recovered).toMatchObject({ scopeChoice: "full", expiryChoice: "none", moveScope: "allMoves" });
    expect(recovered.expiresAt).toBeUndefined();
    for (const id of [clientId, "legacy:" + clientId]) expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: id })).scopes).toEqual(movingScopes);
    expect((await t.run(ctx => ctx.db.query("aiGrants").collect())).length).toBe(noise === 0 ? 2 : noise + 1);
  });

  it("exposes no prior client identifiers or source revisions to another household administrator", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const clientId = "https://private-client.example/secret-history.json";
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId });
    const original = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    await revokeOwner(owner, { grantId: original._id, expectedVersion: original.version });
    await t.run(async ctx => {
      const now = Date.now();
      const adminId = await ctx.db.insert("users", { clerkUserId: "separate-admin", name: "Another admin", appRole: "member", status: "active", createdAt: now, updatedAt: now, lastSeenAt: now });
      await ctx.db.insert("householdMemberships", { householdId, userId: adminId, role: "admin", status: "active", apiAccessStatus: "enabled", createdAt: now, updatedAt: now, createdByUserId: adminId });
    });
    const loaded = await owner.query(api.aiGrants.listMine, {});
    const { grantId } = await owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Private reconnect", reconnectGrantId: original._id, expectedHistoryFingerprint: loaded.historyFingerprint });
    const current = (await t.run(ctx => ctx.db.get(grantId)))!;
    await updateOwner(owner, { ...consent, grantId, expectedVersion: current.version, scopeIntent: "chosen", scopes: ["moving.context.read"] });
    const reduction = await t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId, expectedVersion: current.version + 1, scopes: [] });
    await revokeOwner(owner, { grantId, expectedVersion: reduction.version, reason: "PRIVATE reason" });
    const historicalReceipt = await t.run(ctx => ctx.db.insert("auditLogs", { householdId, actorType: "user", actorUserId: original.ownerUserId, category: "ai", action: "ai_grant.revoked", objectTable: "aiGrants", objectId: original._id, metadata: { reason: "PRIVATE historical reason" }, createdAt: Date.now() }));
    const audit = await t.withIdentity({ subject: "separate-admin" }).query(api.audit.listForHousehold, { householdId });
    expect(audit.length).toBeGreaterThan(0);
    for (const row of audit) expect(row).toMatchObject({ action: "ai_connection.changed" });
    for (const value of [clientId, original._id, grantId, "PRIVATE", "scopeChoice", "reconnected"]) expect(JSON.stringify(audit)).not.toContain(value);
    const receipts = await owner.query(api.aiGrants.listReceipts, {});
    expect(receipts.page.some(row => row.objectId === grantId && row.action === "ai_grant.approved")).toBe(true);
    expect(JSON.stringify(receipts)).toContain("PRIVATE reason");
    expect((await t.run(ctx => ctx.db.get(historicalReceipt)))?.metadata).toEqual({ reason: "PRIVATE historical reason" });
    expect((await t.withIdentity({ subject: "separate-admin", sid: "sess_separate_admin" }).query(api.aiGrants.listReceipts, {})).page).toEqual([]);
    expect((await t.withIdentity({ subject: "separate-admin", sid: "sess_separate_admin" }).query(api.aiGrants.listSourceHistory, {})).page).toEqual([]);
  });
});


describe("paged owner settings and participant move limits", () => {
  it("pages member households and uses a key-only summary independent of unrelated records", async () => {
    const t = convexTest(schema, modules);
    const { householdId, userId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    await t.run(async ctx => {
      for (let i = 0; i < 30; i++) {
        const household = await ctx.db.insert("households", { name: `Member household ${i}`, createdByUserId: userId, ownerUserId: userId, createdAt: i, updatedAt: i });
        await ctx.db.insert("householdMemberships", { householdId: household, userId, role: "owner", status: "active", createdAt: i, updatedAt: i });
      }
      for (let i = 0; i < 160; i++) await ctx.db.insert("apiKeys", { householdId, name: "Expired summary fixture", prefix: "synthetic", tokenPreview: "synthetic", secretHash: "synthetic", scopes: ["moves/read"], status: "active", expiresAt: 1, createdByUserId: userId, createdAt: i, updatedAt: i });
    });
    const first = await owner.query(api.aiGrants.listHouseholdChoices, {});
    expect(first.households).toHaveLength(25);
    const last = await owner.query(api.aiGrants.listHouseholdChoices, { cursor: first.nextCursor! });
    expect(last.households).toHaveLength(6);
    expect(last.nextCursor).toBeNull();
    expect(new Set([...first.households, ...last.households].map(row => row.household._id)).size).toBe(31);
    expect(await owner.query(api.apiKeys.settingsSummary, { householdId })).toEqual({ activeApiKeyCount: 0, activeApiKeyCountTruncated: false });
    await owner.mutation(api.apiKeys.create, { householdId, name: "Current connection" });
    expect(await owner.query(api.apiKeys.settingsSummary, { householdId })).toEqual({ activeApiKeyCount: 1, activeApiKeyCountTruncated: false });
    await expect(t.withIdentity({ subject: SUBJECT, azp: "https://oauth.example/" }).query(api.apiKeys.settingsSummary, { householdId })).rejects.toThrow(/settings/);
  });
  it("pages API-key history without exposing settings to OAuth identities", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedOwner(t);
    await t.run(async ctx => {
      for (let i = 0; i < 57; i++) await ctx.db.insert("apiKeys", { householdId, name: "Historical fixture " + i, prefix: "synthetic", tokenPreview: "synthetic-preview", secretHash: "synthetic-non-secret-hash", scopes: ["moves/read"], status: i === 0 ? "active" : "revoked", createdByUserId: userId, createdAt: i, updatedAt: i });
    });
    for (const claims of [{ client_id: "oauth" }, { clientId: "oauth" }, { azp: "opaque" }, { scope: "openid" }, { scp: ["openid"] }, { tokenType: "oauth" }]) await expect(t.withIdentity({ subject: SUBJECT, ...claims }).query(api.apiKeys.listForHousehold, { householdId })).rejects.toThrow(/settings/);
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    const first = await owner.query(api.apiKeys.listForHousehold, { householdId });
    expect(first.keys).toHaveLength(50);
    expect(first.nextCursor).toBeTruthy();
    expect(first.keys[0].name).toBe("Historical fixture 56");
    const older = await owner.query(api.apiKeys.listForHousehold, { householdId, cursor: first.nextCursor! });
    expect(older.keys).toHaveLength(7);
    expect(older.nextCursor).toBeNull();
    expect(older.keys.find(key => key.status === "active")?.name).toBe("Historical fixture 0");
    for (const key of [...first.keys, ...older.keys]) expect(key).not.toHaveProperty("secretHash");
    expect(new Set([...first.keys, ...older.keys].map(key => key.apiKeyId)).size).toBe(57);
  });

  it("lets a move-only owner narrow, expand only to entitled moves, and restore all-current-move access", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedOwner(t);
    const ids = await t.run(async ctx => {
      const member = (await ctx.db.query("householdMemberships").first())!;
      await ctx.db.patch(member._id, { status: "disabled" });
      const now = Date.now();
      const makeMove = (title: string) => ctx.db.insert("moves", { householdId, title, type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: now, updatedAt: now });
      const a = await makeMove("Participant A"), b = await makeMove("Participant B"), foreign = await makeMove("Private other move");
      for (const moveId of [a, b]) await ctx.db.insert("moveParticipants", { householdId, moveId, userId, role: "viewer", accessKind: "moveOnly", participantType: "helper", status: "active", createdAt: now, updatedAt: now });
      return { a, b, foreign };
    });
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "participant-move-edits" });
    const row = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
    const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
    const choices = await owner.query(api.aiGrants.listMoveChoices, { householdId });
    expect(choices.moves.map(move => move.moveId)).toEqual([ids.a, ids.b]);
    await updateOwner(owner, { ...consent, grantId: row._id, expectedVersion: 1, moveScope: "selectedMoves", moveIds: [ids.a] });
    expect((await t.run(ctx => ctx.db.get(row._id)))?.moveIds).toEqual([ids.a]);
    await expect(updateOwner(owner, { ...consent, grantId: row._id, expectedVersion: 2, moveScope: "selectedMoves", moveIds: [ids.foreign] })).rejects.toThrow();
    await updateOwner(owner, { ...consent, grantId: row._id, expectedVersion: 2, moveScope: "selectedMoves", moveIds: [ids.a, ids.b] });
    await updateOwner(owner, { ...consent, grantId: row._id, expectedVersion: 3, moveScope: "allMoves" });
    const restored = (await t.run(ctx => ctx.db.get(row._id)))!;
    expect(restored.moveScope).toBe("allMoves");
    expect(restored.moveIds).toBeUndefined();
    expect(restored.scopeChoice).toBe("full");
    expect(restored.expiresAt).toBeUndefined();
  });
});


it("pages only accessible move choices for a participant without household access", async () => {
  const t = convexTest(schema, modules);
  const { userId, householdId } = await seedOwner(t);
  await t.run(async ctx => {
    const member = (await ctx.db.query("householdMemberships").first())!;
    await ctx.db.patch(member._id, { status: "disabled" });
    const now = Date.now();
    for (let i = 0; i < 27; i++) {
      const moveId = await ctx.db.insert("moves", { householdId, title: "Paged move " + i, type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: now, updatedAt: now });
      await ctx.db.insert("moveParticipants", { householdId, moveId, userId, role: "viewer", accessKind: "moveOnly", participantType: "helper", status: "active", createdAt: now, updatedAt: now });
    }
    await ctx.db.insert("moves", { householdId, title: "Unshared household move", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: now, updatedAt: now });
  });
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  const first = await owner.query(api.aiGrants.listMoveChoices, { householdId });
  expect(first.moves).toHaveLength(25);
  expect(first.nextCursor).toBeTruthy();
  const next = await owner.query(api.aiGrants.listMoveChoices, { householdId, cursor: first.nextCursor! });
  expect(next.moves).toHaveLength(2);
  expect(next.nextCursor).toBeNull();
  expect(new Set([...first.moves, ...next.moves].map(move => move.moveId)).size).toBe(27);
  expect([...first.moves, ...next.moves].some(move => move.title === "Unshared household move")).toBe(false);
});


it("ignores long expired-key history while enforcing both permanent and future-expiry active slots", async () => {
  const t = convexTest(schema, modules);
  const { userId, householdId } = await seedOwner(t);
  await t.run(async ctx => {
    for (let i = 0; i < 160; i++) await ctx.db.insert("apiKeys", { householdId, name: "Expired quota fixture", prefix: "synthetic", tokenPreview: "synthetic-preview", secretHash: "synthetic-hash", scopes: ["moves/read"], status: "active", expiresAt: 1, createdByUserId: userId, createdAt: i, updatedAt: i });
  });
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  for (let i = 0; i < 3; i++) await owner.mutation(api.apiKeys.create, { householdId, name: "New default " + i, ...(i === 1 ? { expiresAt: Date.now() + 86400000 } : {}) });
  await expect(owner.mutation(api.apiKeys.create, { householdId, name: "Beyond quota" })).rejects.toThrow(/active connections/);
  const rows = await t.run(ctx => ctx.db.query("apiKeys").collect());
  const current = rows.filter(row => row.expiresAt === undefined);
  expect(current).toHaveLength(2);
  expect(current.every(row => row.scopeChoice === "full")).toBe(true);
});


it.each(["api_key.self_reduced", "api_connection.changed"])("rolls back the API-key patch if %s receipt write fails inside REST reduction", async failedAction => {
  const t = convexTest(schema, modules);
  const { householdId, userId } = await seedOwner(t);
  const { generateApiKeySecret, hashApiKey, apiKeyPrefix } = await import("../../convex/lib/apiKeys");
  const raw = generateApiKeySecret();
  const secretHash = await hashApiKey(raw);
  const keyId = await t.run(ctx => ctx.db.insert("apiKeys", { householdId, name: "Rollback fixture", prefix: apiKeyPrefix(raw), tokenPreview: "synthetic", secretHash, scopes: ["moves/read"], scopeChoice: "chosen", status: "active", version: 1, createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() }));
  const request = () => t.mutation(internal.restApi.handle, { method: "POST", path: "me/access", query: {}, authorization: "Bearer " + raw, body: { expectedVersion: 1, scopes: [] } });
  const before = await t.run(ctx => ctx.db.get(keyId));
  const auditModule = await import("../../convex/lib/audit");
  const actual = auditModule.recordAuditEvent;
  const receiptSpy = vi.spyOn(auditModule, "recordAuditEvent").mockImplementation(async (ctx, input) => {
    if (input.action === failedAction) throw new Error("synthetic receipt failure");
    return actual(ctx, input);
  });
  try {
    expect((await request()).status).toBeGreaterThanOrEqual(400);
    expect(receiptSpy).toHaveBeenCalled();
    expect(await t.run(ctx => ctx.db.get(keyId))).toEqual(before);
    expect(await t.run(ctx => ctx.db.query("auditLogs").collect())).toEqual([]);
  } finally { receiptSpy.mockRestore(); }
  const response = await request();
  expect(response.status).toBe(200);
  expect((await t.run(ctx => ctx.db.get(keyId)))?.version).toBe(2);
  expect((await t.run(ctx => ctx.db.query("auditLogs").collect()))).toEqual(expect.arrayContaining([expect.objectContaining({ action: "api_key.self_reduced", metadata: expect.objectContaining({ version: 2 }) }), expect.objectContaining({ action: "api_connection.changed" })]));
});

it.each(["opaque-description", "https://description.example/client.json"])("describes only the calling legacy credential %s without context scope or unrestricted moves", async clientId => {
  const t = convexTest(schema, modules);
  const { userId, householdId } = await seedOwner(t);
  const moveId = await t.run(ctx => ctx.db.insert("moves", { householdId, title: "PRIVATE domain move", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() }));
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "legacy:" + clientId });
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "legacy:sibling-description" });
  const row = (await t.run(ctx => ctx.db.query("aiGrants").collect())).find(row => row.clientId === "legacy:" + clientId)!;
  const sibling = (await t.run(ctx => ctx.db.query("aiGrants").collect())).find(row => row.clientId === "legacy:sibling-description")!;
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  await updateOwner(owner, { ...consent, grantId: row._id, expectedVersion: 1, moveScope: "selectedMoves", moveIds: [moveId], scopes: ["moving.work.write"], scopeIntent: "chosen" });
  const caller = { subject: SUBJECT, claims: { client_id: clientId } };
  const ctx = { runQuery: (ref: any, args: any) => t.query(ref, args), runMutation: (ref: any, args: any) => t.mutation(ref, args) } as any;
  const { createLegacyGrantGate } = await import("../../convex/http");
  const gate = (toolName: string) => createLegacyGrantGate(ctx)({} as any, { identity: caller, toolName, mode: "call" } as any);
  expect((await gate("get_agent_context")).allowed).toBe(false);
  expect((await gate("describe_connection")).allowed).toBe(true);
  const description = await t.query(internal.aiGrants.describeLegacyConnection, { caller });
  expect(description).toEqual({ version: 2, status: "active", settings: "https://movingmanifest.com/settings/ai" });
  expect(JSON.stringify(description)).not.toContain("PRIVATE");
  await t.mutation(internal.aiGrants.reduceLegacyConnection, { caller, expectedVersion: description.version!, scopes: [] });
  const empty = await t.query(internal.aiGrants.describeLegacyConnection, { caller });
  expect(empty.version).toBe(3);
  expect((await gate("describe_connection")).allowed).toBe(true);
  await t.mutation(internal.aiGrants.reduceLegacyConnection, { caller, expectedVersion: empty.version!, action: "revoke" });
  expect(await t.run(ctx => ctx.db.get(sibling._id))).toEqual(sibling);
  expect((await t.query(internal.aiGrants.describeLegacyConnection, { caller })).status).toBe("revoked");
});

it("counts summary API keys by effective expiry and marks a bounded count as truncated", async () => {
  const t = convexTest(schema, modules);
  const { userId, householdId } = await seedOwner(t);
  await t.run(async ctx => {
    for (let i = 0; i < 160; i++) await ctx.db.insert("apiKeys", { householdId, name: "Summary fixture", prefix: "synthetic", tokenPreview: "synthetic", secretHash: "synthetic-hash", scopes: ["moves/read"], status: "active", expiresAt: 1, createdByUserId: userId, createdAt: i, updatedAt: i });
  });
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  expect(await owner.query(api.households.summaryStats, { householdId })).toMatchObject({ activeApiKeyCount: 0, activeApiKeyCountTruncated: false });
  await t.run(async ctx => {
    for (let i = 0; i < 103; i++) await ctx.db.insert("apiKeys", { householdId, name: "Current summary fixture", prefix: "synthetic", tokenPreview: "synthetic", secretHash: "synthetic-hash", scopes: ["moves/read"], status: "active", createdByUserId: userId, createdAt: i, updatedAt: i });
  });
  expect(await owner.query(api.households.summaryStats, { householdId })).toMatchObject({ activeApiKeyCount: 100, activeApiKeyCountTruncated: true });
});


it.each(["display-client", "https://display.example/client.json"])("reports intersected authority separately from saved alias rows for %s", async clientId => {
  const t = convexTest(schema, modules);
  await seedOwner(t);
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId });
  const broad = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
  const aliasId = await t.run(async ctx => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- persisted alias fixture omits Convex system fields.
    const { _id, _creationTime, ...fields } = broad;
    return ctx.db.insert("aiGrants", { ...fields, clientId: "legacy:" + clientId, scopes: ["moving.context.read"], scopeChoice: "chosen", moveScope: "selectedMoves", moveIds: [], version: 2 });
  });
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  const loaded = await owner.query(api.aiGrants.listMine, {});
  expect(loaded.grants.find(row => row.grantId === broad._id)?.scopes).toEqual(movingScopes);
  for (const row of loaded.grants) expect(row.effectiveAuthority).toMatchObject({ scopes: ["moving.context.read"], moveScope: "selectedMoves", status: "active", version: 3 });
  for (const id of [clientId, "legacy:" + clientId]) expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: id })).scopes).toEqual(["moving.context.read"]);
  await revokeOwner(owner, { grantId: aliasId, expectedVersion: 2 });
  for (const row of (await owner.query(api.aiGrants.listMine, {})).grants) expect(row.effectiveAuthority).toMatchObject({ status: "revoked", scopes: [] });
});

it("keeps detailed API-key receipts private and redacts historical shared receipts", async () => {
  const t = convexTest(schema, modules);
  const { householdId, userId } = await seedOwner(t);
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  const { apiKeyId } = await owner.mutation(api.apiKeys.create, { householdId, name: "Private key receipt" });
  const receipt = await t.mutation(internal.apiKeys.reduceCallingKey, { apiKeyId, expectedVersion: 1, scopes: [] });
  const stored = await t.run(ctx => ctx.db.get(receipt.receipt));
  expect(stored).toMatchObject({ objectId: apiKeyId, actorUserId: userId, metadata: { version: 2, scopes: [] } });
  expect(stored?.householdId).toBeUndefined();
  expect(stored?.moveId).toBeUndefined();
  const historical = await t.run(async ctx => {
    const now = Date.now();
    const admin = await ctx.db.insert("users", { clerkUserId: "key-audit-admin", name: "Audit administrator", appRole: "member", status: "active", createdAt: now, updatedAt: now, lastSeenAt: now });
    await ctx.db.insert("householdMemberships", { householdId, userId: admin, role: "admin", status: "active", apiAccessStatus: "enabled", createdAt: now, updatedAt: now });
    return ctx.db.insert("auditLogs", { householdId, actorType: "apiKey", actorApiKeyId: apiKeyId, actorUserId: userId, category: "apiKey", action: "api_key.self_reduced", objectTable: "apiKeys", objectId: apiKeyId, metadata: { previousScopes: ["PRIVATE prior scope"], expiresAt: 123, version: 1 }, createdAt: now });
  });
  const admin = t.withIdentity({ subject: "key-audit-admin", sid: "sess_admin_fixture" });
  const shared = await admin.query(api.audit.listForHousehold, { householdId });
  expect(shared.length).toBeGreaterThan(0);
  for (const value of [apiKeyId, "PRIVATE", "previousScopes", "expiresAt", "version"]) expect(JSON.stringify(shared)).not.toContain(value);
  expect((await owner.query(api.aiGrants.listReceipts, {})).page.some(row => row._id === receipt.receipt)).toBe(true);
  expect((await admin.query(api.aiGrants.listReceipts, {})).page).toEqual([]);
  expect((await t.run(ctx => ctx.db.get(historical)))?.actorApiKeyId).toBe(apiKeyId);
});

for (const operation of ["recovery", "widening"] as const) it.each(["household", "move", "moveMarker"])("refuses archived %s at " + operation + " submission", async archived => {
  const t = convexTest(schema, modules);
  const { householdId, userId } = await seedOwner(t);
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  const moveId = await t.run(ctx => ctx.db.insert("moves", { householdId, title: "Loaded eligible move", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() }));
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "archive-checked-client" });
  const original = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
  if (operation === "recovery") await revokeOwner(owner, { grantId: original._id, expectedVersion: 1 });
  else await updateOwner(owner, { ...consent, grantId: original._id, expectedVersion: 1, scopes: ["moving.context.read"], scopeIntent: "chosen" });
  const loaded = await owner.query(api.aiGrants.listMine, {});
  expect((await owner.query(api.aiGrants.listMoveChoices, { householdId })).moves.map(row => row.moveId)).toContain(moveId);
  await t.run(async ctx => {
    if (archived === "household") await ctx.db.patch(householdId, { archivedAt: Date.now() });
    else await ctx.db.patch(moveId, archived === "moveMarker" ? { status: "planning", archivedAt: Date.now() } : { status: "archived" });
  });
  const before = await t.run(ctx => ctx.db.query("aiGrants").collect());
  if (operation === "recovery") await expect(owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Stale recovery", reconnectGrantId: original._id, expectedHistoryFingerprint: loaded.historyFingerprint, moveScope: "selectedMoves", moveIds: [moveId] })).rejects.toThrow(/available/);
  else await expect(updateOwner(owner, { ...consent, grantId: original._id, expectedVersion: 2, scopeIntent: "full", scopes: [...movingScopes], moveScope: "selectedMoves", moveIds: [moveId] })).rejects.toThrow(/available/);
  expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toEqual(before);
});

it.each(["allMoves", "selectedMoves"] as const)("recovers a later eligible participation with %s through a direct checked move", async moveScope => {
  const t = convexTest(schema, modules);
  const { householdId, userId } = await seedOwner(t);
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "late-participant-client" });
  const original = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
  await revokeOwner(owner, { grantId: original._id, expectedVersion: 1 });
  const eligible = await t.run(async ctx => {
    const membership = (await ctx.db.query("householdMemberships").first())!;
    await ctx.db.patch(membership._id, { status: "disabled" });
    for (let i = 0; i < 130; i++) {
      const moveId = await ctx.db.insert("moves", { householdId, title: "Archived participation", type: "local", status: "archived", unitSystem: "imperial", createdByUserId: userId, createdAt: i, updatedAt: i });
      await ctx.db.insert("moveParticipants", { householdId, moveId, userId, role: "viewer", accessKind: "moveOnly", participantType: "helper", status: "active", createdAt: i, updatedAt: i });
    }
    const moveId = await ctx.db.insert("moves", { householdId, title: "Later eligible move", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() });
    const participantId = await ctx.db.insert("moveParticipants", { householdId, moveId, userId, role: "viewer", accessKind: "moveOnly", participantType: "helper", status: "active", createdAt: Date.now(), updatedAt: Date.now() });
    return { moveId, participantId };
  });
  let page = await owner.query(api.aiGrants.listRecoveryHouseholds, {});
  for (let i = 0; i < 6 && page.nextCursor; i++) page = await owner.query(api.aiGrants.listRecoveryHouseholds, { cursor: page.nextCursor });
  expect(page.households).toEqual([{ householdId, label: "Move: Later eligible move", moveId: eligible.moveId }]);
  const loaded = await owner.query(api.aiGrants.listMine, {});
  const args = { ...consent, householdId, label: "Later participant recovery", reconnectGrantId: original._id, expectedHistoryFingerprint: loaded.historyFingerprint, moveScope, ...(moveScope === "selectedMoves" ? { moveIds: [eligible.moveId] } : { eligibilityMoveId: eligible.moveId }) };
  await t.run(ctx => ctx.db.patch(eligible.participantId, { status: "disabled" }));
  await expect(owner.mutation(api.aiGrants.approve, args)).rejects.toThrow();
  await t.run(ctx => ctx.db.patch(eligible.participantId, { status: "active" }));
  const { grantId } = await owner.mutation(api.aiGrants.approve, args);
  expect(await t.run(ctx => ctx.db.get(grantId))).toMatchObject({ scopeChoice: "full", expiryChoice: "none", moveScope });
  const stored = (await t.run(ctx => ctx.db.get(grantId)))!;
  await updateOwner(owner, { ...consent, grantId, expectedVersion: stored.version, eligibilityMoveId: eligible.moveId, scopeIntent: "chosen", scopes: ["moving.context.read"] });
  await updateOwner(owner, { ...consent, grantId, expectedVersion: stored.version + 1, eligibilityMoveId: eligible.moveId, scopeIntent: "full", scopes: [...movingScopes] });
});

it("redacts connection identity from every shared work-event read while retaining the source", async () => {
  const t = convexTest(schema, modules);
  const { householdId, userId } = await seedOwner(t);
  const { moveId, eventId } = await t.run(async ctx => {
    const now = Date.now();
    const moveId = await ctx.db.insert("moves", { householdId, title: "Shared work", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: now, updatedAt: now });
    const eventId = await ctx.db.insert("auditLogs", { householdId, moveId, actorType: "agent", actorUserId: userId, actorApiKeyId: "PRIVATE-key-id", category: "plan", action: "mcp.move_context_saved", objectTable: "moves", objectId: moveId, metadata: { clientId: "PRIVATE-client-id", reason: "PRIVATE-work-reason", changedFields: ["title"], nested: [{ client_id: "PRIVATE-nested-id", reason: "PRIVATE-nested-reason", count: 4 }] }, createdAt: now });
    return { moveId, eventId };
  });
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  const sources = [await owner.query(api.audit.listForHousehold, { householdId }), await owner.query(api.audit.listForMove, { householdId, moveId }), await owner.query(api.audit.listForObject, { householdId, moveId, objectTable: "moves", objectId: moveId })];
  for (const rows of sources) {
    expect(JSON.stringify(rows)).not.toContain("PRIVATE");
    expect(rows[0]).toMatchObject({ action: "mcp.move_context_saved", objectId: moveId, metadata: { changedFields: ["title"], nested: [{ count: 4 }] } });
  }
  expect(JSON.stringify(await owner.query(api.claimCenter.summaryForMove, { householdId, moveId }))).not.toContain("PRIVATE");
  expect((await t.run(ctx => ctx.db.get(eventId)))?.metadata?.clientId).toBe("PRIVATE-client-id");
});

it("requires a person session for account export creation, artifacts and account controls", async () => {
  const t = convexTest(schema, modules);
  const { householdId } = await seedOwner(t);
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  await owner.mutation(api.apiKeys.create, { householdId, name: "Exported settings fixture" });
  const exported = await owner.mutation(api.accountPrivacy.createAccountExport, {});
  const artifact = await owner.query(api.accountPrivacy.getAccountExportArtifact, { exportJobId: exported.exportJobId });
  expect(artifact.artifactText).toContain("Exported settings fixture");
  const requestId = await owner.mutation(api.accountPrivacy.requestAccountDeletion, {});
  const before = await t.run(async ctx => ({ requests: await ctx.db.query("accountDeletionRequests").collect(), jobs: await ctx.db.query("accountExportJobs").collect(), user: await ctx.db.query("users").first() }));
  for (const claims of [{ azp: "https://oauth.example/client.json" }, { client_id: "oauth-client" }, {}]) {
    const oauth = t.withIdentity({ subject: SUBJECT, ...claims });
    await expect(oauth.query(api.accountPrivacy.status, {})).rejects.toThrow(/settings/);
    await expect(oauth.mutation(api.accountPrivacy.createAccountExport, {})).rejects.toThrow(/settings/);
    await expect(oauth.query(api.accountPrivacy.getAccountExportArtifact, { exportJobId: exported.exportJobId })).rejects.toThrow(/settings/);
    await expect(oauth.mutation(api.accountPrivacy.requestAccountDeletion, {})).rejects.toThrow(/settings/);
    await expect(oauth.mutation(api.accountPrivacy.cancelAccountDeletion, { requestId })).rejects.toThrow(/settings/);
    await expect(oauth.mutation(api.accountPrivacy.completeAccountDeletion, { requestId, confirmation: "DELETE MY ACCOUNT" })).rejects.toThrow(/settings/);
  }
  expect(await t.run(async ctx => ({ requests: await ctx.db.query("accountDeletionRequests").collect(), jobs: await ctx.db.query("accountExportJobs").collect(), user: await ctx.db.query("users").first() }))).toEqual(before);
  await owner.mutation(api.accountPrivacy.cancelAccountDeletion, { requestId });
});

it("preserves before and after authority in durable private grant reduction receipts", async () => {
  const t = convexTest(schema, modules);
  const { householdId, userId } = await seedOwner(t);
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  const moveId = await t.run(ctx => ctx.db.insert("moves", { householdId, title: "Receipt scope move", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() }));
  const clientId = "receipt-history-client";
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId });
  const expiry = Date.now() + 600000;
  const reduced = await t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId, expectedVersion: 1, scopes: ["moving.context.read"], moveIds: [moveId], expiresAt: expiry });
  const first = await t.run(ctx => ctx.db.get(reduced.receipt as Id<"auditLogs">));
  expect(first?.metadata).toMatchObject({ before: { version: 1, active: true, scopes: [...movingScopes], moveScope: "allMoves", moveIds: [], expiresAt: null }, after: { version: 2, active: true, scopes: ["moving.context.read"], moveScope: "selectedMoves", moveIds: [moveId], expiresAt: expiry } });
  const revoked = await t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId, expectedVersion: 2, action: "revoke" });
  const last = await t.run(ctx => ctx.db.get(revoked.receipt as Id<"auditLogs">));
  expect(last?.metadata).toMatchObject({ before: first?.metadata?.after, after: { version: 3, status: "revoked", active: false, moveIds: [moveId], scopes: ["moving.context.read"], expiresAt: expiry } });
  expect(first?.householdId).toBeUndefined();
  expect(last?.householdId).toBeUndefined();
  expect((await owner.query(api.aiGrants.listReceipts, {})).page.some(row => row._id === last?._id)).toBe(true);
});

it.each(["pause", "revoke"] as const)("preserves API-key limits before narrowing and %s in private receipts", async action => {
  const t = convexTest(schema, modules);
  const { householdId, userId } = await seedOwner(t);
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  const { apiKeyId } = await owner.mutation(api.apiKeys.create, { householdId, name: "Key limit receipt" });
  const moveId = await t.run(ctx => ctx.db.insert("moves", { householdId, title: "Key receipt move", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() }));
  const expiresAt = Date.now() + 600000;
  const firstResult = await t.mutation(internal.apiKeys.reduceCallingKey, { apiKeyId, expectedVersion: 1, scopes: ["moves/read"], moveIds: [moveId], expiresAt });
  const first = (await t.run(ctx => ctx.db.get(firstResult.receipt)))!;
  const { apiKeyScopes } = await import("../../convex/lib/apiKeys");
  expect(first.metadata).toMatchObject({ before: { version: 1, status: "active", active: true, scopes: [...apiKeyScopes], moveId: null, expiresAt: null }, after: { version: 2, status: "active", active: true, scopes: ["moves/read"], moveId, expiresAt } });
  const lastResult = await t.mutation(internal.apiKeys.reduceCallingKey, { apiKeyId, expectedVersion: 2, action });
  const last = (await t.run(ctx => ctx.db.get(lastResult.receipt)))!;
  expect(last.metadata).toMatchObject({ before: first.metadata?.after, after: { version: 3, status: action === "pause" ? "expired" : "revoked", active: false, scopes: ["moves/read"], moveId, expiresAt: action === "pause" ? expect.any(Number) : expiresAt } });
  if (action === "pause") expect(last.metadata?.after.expiresAt).toBeLessThanOrEqual(Date.now());
  for (const row of [first, last]) {
    expect(row.householdId).toBeUndefined();
    expect(row.moveId).toBeUndefined();
  }
  expect((await owner.query(api.aiGrants.listReceipts, {})).page.some(row => row._id === last._id)).toBe(true);
});

it("keeps connection receipts private through app-admin audit and observability readers", async () => {
  const t = convexTest(schema, modules);
  const { userId, householdId } = await seedOwner(t);
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  await t.run(ctx => ctx.db.insert("users", { clerkUserId: "other-app-admin", name: "Other administrator", appRole: "admin", status: "active", createdAt: Date.now(), updatedAt: Date.now(), lastSeenAt: Date.now() }));
  const admin = t.withIdentity({ subject: "other-app-admin", sid: "sess_other_admin" });
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "private-admin-client" });
  const grant = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
  const reduced = await t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: "private-admin-client", expectedVersion: 1, scopes: ["moving.context.read"] });
  await revokeOwner(owner, { grantId: grant._id, expectedVersion: 2, reason: "PRIVATE owner reason" });
  const { apiKeyId } = await owner.mutation(api.apiKeys.create, { householdId, name: "Private key" });
  const keyReceipt = await t.mutation(internal.apiKeys.reduceCallingKey, { apiKeyId, expectedVersion: 1, scopes: [] });
  const result = await admin.mutation(api.admin.getUser, { userId });
  const status = await admin.mutation(api.observability.status, {});
  expect(result?.recentAudit.length).toBeGreaterThan(0);
  expect(status.recentEvents.length).toBeGreaterThan(0);
  for (const output of [result?.recentAudit, status.recentEvents, status.reviewQueue]) {
    for (const privateValue of [grant._id, apiKeyId, "PRIVATE owner reason", "private-admin-client", '"before"', '"after"']) expect(JSON.stringify(output)).not.toContain(privateValue);
  }
  const source = await t.run(ctx => ctx.db.get(reduced.receipt as Id<"auditLogs">));
  expect(source?.metadata?.before).toBeDefined();
  expect((await t.run(ctx => ctx.db.get(keyReceipt.receipt)))?.metadata?.after).toBeDefined();
  expect((await owner.query(api.aiGrants.listReceipts, {})).page.some(row => row.metadata?.reason === "PRIVATE owner reason")).toBe(true);
});

it("lets the person widen expiry after a cross-household self-reduction and rechecks retained move access", async () => {
  const t = convexTest(schema, modules);
  const { householdId: firstHousehold, userId } = await seedOwner(t);
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  const { moveId, membershipId } = await t.run(async ctx => {
    const now = Date.now();
    const householdId = await ctx.db.insert("households", { name: "Second household", ownerUserId: userId, createdByUserId: userId, createdAt: now, updatedAt: now });
    const membershipId = await ctx.db.insert("householdMemberships", { householdId, userId, role: "owner", status: "active", apiAccessStatus: "enabled", createdAt: now, updatedAt: now });
    const moveId = await ctx.db.insert("moves", { householdId, title: "Second-household move", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: now, updatedAt: now });
    return { moveId, membershipId };
  });
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "cross-household-client" });
  const grant = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
  expect(grant.householdId).toBe(firstHousehold);
  await t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: "cross-household-client", expectedVersion: 1, scopes: ["moving.context.read"], moveIds: [moveId], expiresAt: Date.now() + 600000 });
  await updateOwner(owner, { ...consent, grantId: grant._id, expectedVersion: 2, expiryIntent: "none", expiresInDays: null });
  const widened = (await t.run(ctx => ctx.db.get(grant._id)))!;
  expect(widened).toMatchObject({ version: 3, moveScope: "selectedMoves", moveIds: [moveId] });
  expect(widened.expiresAt).toBeUndefined();
  await t.run(ctx => ctx.db.patch(membershipId, { status: "disabled" }));
  await expect(updateOwner(owner, { ...consent, grantId: grant._id, expectedVersion: 3, scopeIntent: "full", scopes: [...movingScopes] })).rejects.toThrow();
  expect(await t.run(ctx => ctx.db.get(grant._id))).toEqual(widened);
});

it("refuses participant recovery witnesses marked archived even when their status is planning", async () => {
  const t = convexTest(schema, modules);
  const { householdId, userId } = await seedOwner(t);
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "archived-witness-client" });
  const grant = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
  await revokeOwner(owner, { grantId: grant._id, expectedVersion: 1 });
  const moveId = await t.run(async ctx => {
    const now = Date.now();
    const membership = (await ctx.db.query("householdMemberships").first())!;
    await ctx.db.patch(membership._id, { status: "disabled" });
    const moveId = await ctx.db.insert("moves", { householdId, title: "Archived witness", type: "local", status: "planning", archivedAt: now, unitSystem: "imperial", createdByUserId: userId, createdAt: now, updatedAt: now });
    await ctx.db.insert("moveParticipants", { householdId, moveId, userId, role: "viewer", accessKind: "moveOnly", participantType: "helper", status: "active", agentAccessStatus: "enabled", invitedByUserId: userId, createdAt: now, updatedAt: now });
    return moveId;
  });
  expect((await owner.query(api.aiGrants.listRecoveryHouseholds, {})).households).toEqual([]);
  expect((await owner.query(api.aiGrants.listMoveChoices, { householdId })).moves).toEqual([]);
  const loaded = await owner.query(api.aiGrants.listMine, {});
  const before = await t.run(ctx => ctx.db.query("aiGrants").collect());
  for (const extra of [{}, { eligibilityMoveId: moveId }, { moveScope: "selectedMoves" as const, moveIds: [moveId] }]) {
    await expect(owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Stale archived witness", reconnectGrantId: grant._id, expectedHistoryFingerprint: loaded.historyFingerprint, ...extra })).rejects.toThrow();
  }
  expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toEqual(before);
});

it("keeps canonical scope-free describe_connection credential-only", async () => {
  const t = convexTest(schema, modules);
  const { householdId, userId } = await seedOwner(t);
  const clientId = "canonical-description-client";
  const moveId = await t.run(ctx => ctx.db.insert("moves", { householdId, title: "PRIVATE description move", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() }));
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId });
  const expiresAt = Date.now() + 600000;
  await t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId, expectedVersion: 1, scopes: [], moveIds: [moveId], expiresAt });
  const { createMovingServer } = await import("../../convex/httpRoutes/mcp");
  const { createMcpHandler } = await import("@modelcontextprotocol/server");
  const ctx = { runQuery: (ref: any, args: any) => t.query(ref, args) } as any;
  const handler = createMcpHandler(() => createMovingServer(ctx, { subject: SUBJECT, issuer: ISSUER, clientId }, []).server, { legacy: "stateless", responseMode: "json" });
  try {
    const method = "tools/call";
    const response = await handler.fetch(new Request("https://movingmanifest.test/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2026-07-28", "mcp-method": method, "mcp-name": "describe_connection" }, body: JSON.stringify({ jsonrpc: "2.0", id: "describe-proof", method, params: { name: "describe_connection", arguments: {}, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "description-proof", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} } } }) }));
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.error).toBeUndefined();
    const description = JSON.parse(body.result.content[0].text);
    expect(description.connection).toMatchObject({ version: 2, status: "active", scopes: [], moveRestricted: true, expiresAt });
    for (const value of [moveId, householdId, "PRIVATE", "moveIds", "grantId"]) expect(JSON.stringify(description)).not.toContain(value);
  } finally { await handler.close(); }
});

it("uses the actual retained-move household for participant widening without an explicit witness", async () => {
  const t = convexTest(schema, modules);
  const { householdId, userId } = await seedOwner(t);
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "cross-participant-client" });
  const grant = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
  const { moveId, participantId } = await t.run(async ctx => {
    const now = Date.now();
    const secondHousehold = await ctx.db.insert("households", { name: "Other participant household", createdByUserId: userId, ownerUserId: userId, createdAt: now, updatedAt: now });
    const membership = (await ctx.db.query("householdMemberships").first())!;
    await ctx.db.patch(membership._id, { status: "disabled" });
    const firstMove = await ctx.db.insert("moves", { householdId, title: "Original participant move", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: now, updatedAt: now });
    const moveId = await ctx.db.insert("moves", { householdId: secondHousehold, title: "Retained participant move", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: now, updatedAt: now });
    await ctx.db.insert("moveParticipants", { householdId, moveId: firstMove, userId, role: "viewer", accessKind: "moveOnly", participantType: "helper", status: "active", createdAt: now, updatedAt: now });
    const participantId = await ctx.db.insert("moveParticipants", { householdId: secondHousehold, moveId, userId, role: "viewer", accessKind: "moveOnly", participantType: "helper", status: "active", createdAt: now, updatedAt: now });
    return { moveId, participantId };
  });
  await t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: "cross-participant-client", expectedVersion: 1, scopes: ["moving.context.read"], moveIds: [moveId], expiresAt: Date.now() + 600000 });
  await updateOwner(owner, { ...consent, grantId: grant._id, expectedVersion: 2, expiryIntent: "none", expiresInDays: null });
  const widened = (await t.run(ctx => ctx.db.get(grant._id)))!;
  expect(widened).toMatchObject({ version: 3, moveIds: [moveId] });
  expect(widened.expiresAt).toBeUndefined();
  await t.run(ctx => ctx.db.patch(participantId, { status: "disabled" }));
  await expect(updateOwner(owner, { ...consent, grantId: grant._id, expectedVersion: 3, scopeIntent: "full", scopes: [...movingScopes] })).rejects.toThrow();
  expect(await t.run(ctx => ctx.db.get(grant._id))).toEqual(widened);
});

it.each([false, true])("guards person key revocation with its current row revision (legacy=%s)", async legacy => {
  const t = convexTest(schema, modules);
  const { householdId } = await seedOwner(t);
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  const { apiKeyId } = await owner.mutation(api.apiKeys.create, { householdId, name: "Versioned revoke" });
  if (legacy) await t.run(ctx => ctx.db.patch(apiKeyId, { version: undefined }));
  await t.mutation(internal.apiKeys.reduceCallingKey, { apiKeyId, expectedVersion: 1, scopes: [] });
  const before = await t.run(async ctx => ({ key: await ctx.db.get(apiKeyId), audits: await ctx.db.query("auditLogs").collect() }));
  await expect(owner.mutation(api.apiKeys.revoke, { householdId, apiKeyId, expectedVersion: 1 })).rejects.toThrow(/changed/);
  expect(await t.run(async ctx => ({ key: await ctx.db.get(apiKeyId), audits: await ctx.db.query("auditLogs").collect() }))).toEqual(before);
  expect(await owner.mutation(api.apiKeys.revoke, { householdId, apiKeyId, expectedVersion: 2 })).toEqual({ version: 3 });
  expect(await t.run(ctx => ctx.db.get(apiKeyId))).toMatchObject({ status: "revoked", version: 3 });
  await expect(owner.mutation(api.apiKeys.revoke, { householdId, apiKeyId, expectedVersion: 2 })).rejects.toThrow(/changed/);
});

it.each([
  { clientId: "revision-replay", legacy: false, alias: false },
  { clientId: "revision-replay", legacy: true, alias: false },
  { clientId: "https://revision.example/client.json", legacy: false, alias: true },
  { clientId: "https://revision.example/client.json", legacy: true, alias: true },
])("never reuses a pre-reconnect revision after a fresh historical refusal: %j", async ({ clientId, legacy, alias }) => {
  const t = convexTest(schema, modules);
  const { householdId } = await seedOwner(t);
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  const storedId = legacy ? "legacy:" + clientId : clientId;
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: storedId });
  const first = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
  await revokeOwner(owner, { grantId: first._id, expectedVersion: 1 });
  if (alias) await t.run(async ctx => {
    const row = (await ctx.db.get(first._id))!;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- preserve a complete synthetic alias without system fields.
    const { _id, _creationTime, ...fields } = row;
    await ctx.db.insert("aiGrants", { ...fields, clientId: legacy ? clientId : "legacy:" + clientId, version: 9, status: "active", revokedAt: undefined, revokedByUserId: undefined, revokedReason: undefined });
  });
  const reconnect = async () => {
    const loaded = await owner.query(api.aiGrants.listMine, {});
    return owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "New explicit generation", reconnectGrantId: first._id, expectedHistoryFingerprint: loaded.historyFingerprint, expectedRecoveryFingerprint: loaded.recoveryFingerprint });
  };
  await reconnect();
  const description = await t.query(internal.aiGrants.describeConnection, { subject: SUBJECT, clientId });
  const reduced = legacy
    ? await t.mutation(internal.aiGrants.reduceLegacyConnection, { caller: { subject: SUBJECT, claims: { client_id: clientId } }, expectedVersion: description.version!, scopes: ["moving.context.read"] })
    : await t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId, expectedVersion: description.version!, scopes: ["moving.context.read"] });
  const delayedVersion = reduced.version;
  const historical = (await t.run(ctx => ctx.db.get(first._id)))!;
  await revokeOwner(owner, { grantId: first._id, expectedVersion: historical.version });
  expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId })).grants).toEqual([]);
  const fresh = await reconnect();
  for (const result of [await t.query(internal.aiGrants.describeConnection, { subject: SUBJECT, clientId }), await t.query(internal.aiGrants.describeLegacyConnection, { caller: { subject: SUBJECT, claims: { client_id: clientId } } })]) expect(result.version).toBeGreaterThan(delayedVersion);
  const current = (await t.run(ctx => ctx.db.get(fresh.grantId)))!;
  expect(current.scopeChoice).toBe("full");
  expect(current.expiresAt).toBeUndefined();
  const before = await t.run(ctx => ctx.db.query("aiGrants").collect());
  await expect(t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId, expectedVersion: delayedVersion, action: "revoke" })).rejects.toThrow(/changed/);
  await expect(t.mutation(internal.aiGrants.reduceLegacyConnection, { caller: { subject: SUBJECT, claims: { client_id: clientId } }, expectedVersion: delayedVersion, action: "revoke" })).rejects.toThrow(/changed/);
  expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toEqual(before);
});

it("uses indexed disjoint revisions if a complete positive history exhausts numeric precision", async () => {
  const t = convexTest(schema, modules);
  const { householdId } = await seedOwner(t);
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  const clientId = "precision-recovery-client";
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId });
  const first = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
  await t.run(ctx => ctx.db.patch(first._id, { status: "revoked", revokedAt: Date.now(), version: Number.MAX_SAFE_INTEGER }));
  const reconnect = async () => {
    const loaded = await owner.query(api.aiGrants.listMine, {});
    return owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Safe numeric recovery", reconnectGrantId: first._id, expectedHistoryFingerprint: loaded.historyFingerprint, expectedRecoveryFingerprint: loaded.recoveryFingerprint });
  };
  expect((await reconnect()).grantId).toBe(first._id);
  expect((await t.query(internal.aiGrants.describeConnection, { subject: SUBJECT, clientId })).version).toBe(-1);
  await expect(t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId, expectedVersion: Number.MAX_SAFE_INTEGER, action: "revoke" })).rejects.toThrow(/changed/);
  await revokeOwner(owner, { grantId: first._id, expectedVersion: -1 });
  await reconnect();
  expect((await t.query(internal.aiGrants.describeConnection, { subject: SUBJECT, clientId })).version).toBe(-3);
  expect((await t.run(ctx => ctx.db.query("aiGrants").collect()))).toHaveLength(1);
  const sources = await owner.query(api.aiGrants.listSourceHistory, {});
  expect(sources.page.some(row => row.source.version === Number.MAX_SAFE_INTEGER)).toBe(true);
  await expect(t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId, expectedVersion: -1, action: "revoke" })).rejects.toThrow(/changed/);
});

it("hides choices from an archived original household and widens using an eligible retained household", async () => {
  const t = convexTest(schema, modules);
  const { householdId, userId } = await seedOwner(t);
  const owner = t.withIdentity({ subject: SUBJECT, sid: "sess_owner_fixture" });
  const retained = await t.run(async ctx => {
    const now = Date.now();
    await ctx.db.insert("moves", { householdId, title: "Unarchived move in archived household", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: now, updatedAt: now });
    const otherHousehold = await ctx.db.insert("households", { name: "Current household", createdByUserId: userId, ownerUserId: userId, createdAt: now, updatedAt: now });
    await ctx.db.insert("householdMemberships", { householdId: otherHousehold, userId, role: "owner", status: "active", apiAccessStatus: "enabled", createdAt: now, updatedAt: now });
    return ctx.db.insert("moves", { householdId: otherHousehold, title: "Current retained move", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: now, updatedAt: now });
  });
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "archived-original-client" });
  const grant = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
  await t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: "archived-original-client", expectedVersion: 1, moveIds: [retained], expiresAt: Date.now() + 600000 });
  await t.run(ctx => ctx.db.patch(householdId, { archivedAt: Date.now() }));
  expect(await owner.query(api.aiGrants.listMoveChoices, { householdId })).toEqual({ moves: [], nextCursor: null });
  await updateOwner(owner, { ...consent, grantId: grant._id, expectedVersion: 2, eligibilityMoveId: retained, expiryIntent: "none", expiresInDays: null });
  const changed = (await t.run(ctx => ctx.db.get(grant._id)))!;
  expect(changed.expiresAt).toBeUndefined();
  expect(changed.moveIds).toEqual([retained]);
});
