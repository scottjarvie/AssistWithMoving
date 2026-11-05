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
    await t.withIdentity({ subject: SUBJECT }).mutation(api.aiGrants.updateLimits, {
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
    const owner = t.withIdentity({ subject: SUBJECT });
    await owner.mutation(api.aiGrants.updateLimits, { grantId: row._id, expectedVersion: 1, ...consent, scopeIntent: "chosen", scopes: ["moving.context.read"] });
    expect((await t.run((ctx) => ctx.db.get(row._id)))?.expiresAt).toBe(approvedAt + 30 * 86_400_000);
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

describe("explicit owner reconnect", () => {
  it.each([
    ["reconnect-client", "legacy:reconnect-client"],
    ["https://CLIENT.example:443/a/../client.json", "legacy:https://client.example/client.json"],
  ])("replaces only acknowledged revisions across %s and %s", async (first, alias) => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now());
    try {
      const t = convexTest(schema, modules);
      const { householdId } = await seedOwner(t);
      const owner = t.withIdentity({ subject: SUBJECT });
      await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: first });
      const original = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
      const aliasId = await t.run(async ctx => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- copy stored fields without Convex document metadata.
        const { _id: _originalId, _creationTime: _originalTime, ...fields } = original;
        return ctx.db.insert("aiGrants", { ...fields, clientId: alias });
      });
      await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "untouched-sibling" });
      await owner.mutation(api.aiGrants.revoke, { grantId: original._id, expectedVersion: 1 });
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
      await owner.mutation(api.aiGrants.revoke, { grantId: aliasId, expectedVersion: 1 });
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
    const owner = t.withIdentity({ subject: SUBJECT });
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
    const owner = t.withIdentity({ subject: SUBJECT });
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
    const owner = t.withIdentity({ subject: SUBJECT });
    await owner.mutation(api.aiGrants.revoke, { grantId: original._id, expectedVersion: 1 });
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
    expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toHaveLength(128);
    const audits = await t.run(ctx => ctx.db.query("auditLogs").collect());
    expect(audits.every(event => event.metadata?.previousGrant === undefined)).toBe(true);
    expect((await owner.query(api.aiGrants.listSourceHistory, {})).page[0].source).toEqual(previous);
    for (const id of [clientId, `legacy:${clientId}`]) {
      expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: id })).scopes).toEqual(movingScopes);
      await expect(t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: id, expectedVersion: 1, action: "revoke" })).rejects.toThrow(/changed/);
    }
    expect((await owner.query(api.aiGrants.listMine, {})).grants).toHaveLength(128);
    await owner.mutation(api.aiGrants.revoke, { grantId, expectedVersion: restored.version });
    expect((await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId })).block).toBe("revoked");
  });

  it.each(["overflow-client", "https://overflow.example/client.json"])("recovers %s from oversized history without scanning away refusals or losing records", async clientId => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT });
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId });
    const original = (await t.run(ctx => ctx.db.query("aiGrants").first()))!;
    const aliasId = await t.run(async ctx => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- omit system fields from persisted historical fixtures.
      const { _id, _creationTime, ...fields } = original;
      for (let i = 0; i < 129; i++) await ctx.db.insert("aiGrants", { ...fields, status: "revoked", clientId: `overflow-noise-${i}` });
      return ctx.db.insert("aiGrants", { ...fields, clientId: `legacy:${clientId}` });
    });
    await owner.mutation(api.aiGrants.revoke, { grantId: original._id, expectedVersion: 1 });
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
    expect(await t.run(ctx => ctx.db.query("aiGrants").collect())).toHaveLength(count);
    const audits = await t.run(ctx => ctx.db.query("auditLogs").collect());
    expect(audits.every(row => row.metadata?.previousGrant === undefined)).toBe(true);
    const archive = await owner.query(api.aiGrants.listSourceHistory, {});
    expect(archive.page[0].source).toEqual(previous);
    const other = await t.run(ctx => ctx.db.insert("users", { clerkUserId: "archive-outsider", email: "outsider@example.test", name: "Another person", appRole: "member", status: "active", createdAt: Date.now(), updatedAt: Date.now(), lastSeenAt: Date.now() }));
    expect(other).toBeTruthy();
    expect((await t.withIdentity({ subject: "archive-outsider" }).query(api.aiGrants.listSourceHistory, {})).page).toEqual([]);
    await expect(t.withIdentity({ subject: SUBJECT, client_id: clientId }).query(api.aiGrants.listSourceHistory, {})).rejects.toThrow(/settings/);
    for (const id of [clientId, `legacy:${clientId}`]) {
      expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: id })).scopes).toEqual(movingScopes);
      await expect(t.mutation(grants.reduceConnection, { subject: SUBJECT, clientId: id, expectedVersion: 1, action: "revoke" })).rejects.toThrow(/changed/);
    }
    await expect(owner.mutation(api.aiGrants.approve, args)).rejects.toThrow(/history changed/);
    await owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId, expectedVersion: -1, scopes: ["moving.context.read"], scopeIntent: "chosen" });
    expect((await t.run(ctx => ctx.db.get(grantId)))?.version).toBe(-2);
    const beforeStaleRecovery = await owner.query(api.aiGrants.listMine, {});
    await owner.mutation(api.aiGrants.revoke, { grantId: aliasId, expectedVersion: 1 });
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

  it("never lets a new unbound approval override bound refusal history", async () => {
    const t = convexTest(schema, modules);
    const { newerId, householdId } = await seedDuplicateHistory(t);
    const revoked = await t.run(ctx => ctx.db.get(newerId));
    const { grantId } = await t.withIdentity({ subject: SUBJECT }).mutation(api.aiGrants.approve, {
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
    const owner = t.withIdentity({ subject: SUBJECT });
    const settings = await owner.query(api.aiGrants.listMine, {});
    expect(settings).toMatchObject({ historyAtCapacity: true, historyOverflow: true });
    expect(settings.historyFingerprint).toBeUndefined();
    expect(settings.grants).toHaveLength(129);
    const active = before.find(row => row.status === "active")!;
    await owner.mutation(api.aiGrants.revoke, { grantId: active._id, expectedVersion: active.version });
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
  await expect(t.withIdentity({ subject: SUBJECT }).mutation(api.aiGrants.updateLimits, { grantId: oldId, expectedVersion: 1 })).rejects.toThrow(/newer connection decision/);
  expect((await t.run(ctx => ctx.db.get(oldId)))?.ownerDecisionAt).toBeUndefined();
  await expectDuplicateRefused(t, "revoked");
});

describe("FAD own-connection authority", () => {
  it("defaults omitted fresh choices to full/all/no-end while retaining consent", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT });
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
    await expect(oauth.mutation(api.aiGrants.updateLimits, { ...consent, grantId: row._id, expectedVersion: 1, scopes: [...movingScopes], scopeIntent: "full" })).rejects.toThrow(/settings/);
    await expect(oauth.mutation(api.aiGrants.revoke, { grantId: row._id })).rejects.toThrow(/settings/);
  });

  it("refuses explicit scope and date edits to older duplicates", async () => {
    const t = convexTest(schema, modules);
    const { oldId } = await seedDuplicateHistory(t);
    for (const edits of [{ scopes: [...movingScopes], scopeIntent: "full" as const }, { expiresInDays: null, expiryIntent: "none" as const }]) {
      await expect(t.withIdentity({ subject: SUBJECT }).mutation(api.aiGrants.updateLimits, { ...consent, grantId: oldId, expectedVersion: 1, ...edits })).rejects.toThrow(/newer connection decision/);
      await expectDuplicateRefused(t, "revoked");
    }
  });

  it("defaults omitted API-key choices to full/future and no expiry", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const created = await t.withIdentity({ subject: SUBJECT }).mutation(api.apiKeys.create, { householdId, name: "Default key" });
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
  const owner = t.withIdentity({ subject: SUBJECT });
  await expect(owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId: oldId, expectedVersion: 1, scopes: [...movingScopes], scopeIntent: "full" })).rejects.toThrow(/newer connection decision/);
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
      await t.withIdentity({ subject: SUBJECT }).mutation(api.aiGrants.revoke, { grantId: stored._id, expectedVersion: 3 });
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
    for (const row of before) await t.withIdentity({ subject: SUBJECT }).mutation(api.aiGrants.updateLimits, { ...consent, grantId: row._id, expectedVersion: 1, scopes: [...movingScopes], scopeIntent: "full", moveScope: "allMoves", expiresInDays: null, expiryIntent: "none" });
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
      await t.withIdentity({ subject: SUBJECT }).mutation(api.aiGrants.approve, { ...consent, householdId, label: "Unbound unrelated" });
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
    const { generateApiKeySecret, hashApiKey, apiKeyPrefix } = await import("../../convex/lib/apiKeys");
    const { registerTools } = await import("../../mcp-server/assistwithmoving-mcp.mjs");
    const moveId = await t.run(ctx => ctx.db.insert("moves", { householdId, title: "PRIVATE move title", origin: "PRIVATE origin", destination: "PRIVATE destination", dateStart: "2027-01-01", dateEnd: "2027-01-02", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() }));
    let raw = generateApiKeySecret();
    const secretHash = await hashApiKey(raw);
    const keyId = await t.run(ctx => ctx.db.insert("apiKeys", { householdId, name: "Synthetic context", prefix: apiKeyPrefix(raw), tokenPreview: "synthetic", secretHash, moveId, scopes: ["moves/read", "inventory/read"], status: "active", createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() }));
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
    expect((await readMove()).status).toBe(200);
    for (const [version, scopes] of [[1, ["inventory/read"]], [2, []]] as const) {
      const receipt = await reduce(version, [...scopes]);
      expect(receipt.status).toBe(200);
      const result = await context();
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ data: { apiKey: { version: version + 1, scopes: [...scopes] }, restrictedMove: null } });
      expect(JSON.stringify(result.body)).not.toContain("PRIVATE");
      expect((await readMove()).status).toBe(403);
      for (const selected of [false, true]) {
        const tool = await invokeContext(selected);
        expect(tool.isError).not.toBe(true);
        expect(JSON.stringify(tool)).not.toContain("PRIVATE");
        expect(JSON.parse(tool.content[0].text)).toMatchObject({ data: { restrictedMove: null } });
      }
    }
    const replacement = await t.withIdentity({ subject: SUBJECT }).mutation(api.apiKeys.create, { householdId, moveId, name: "Person restored read authority", scopes: ["moves/read"] });
    raw = replacement.rawKey;
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
    const owner = t.withIdentity({ subject: SUBJECT });
    await expect(owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId: row._id, expectedVersion: 1, expiryIntent, expiresInDays: expiryIntent === "none" ? null : 7 })).rejects.toThrow(/active member/);
    expect((await t.run(ctx => ctx.db.get(row._id)))?.version).toBe(1);
    await owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId: row._id, expectedVersion: 1, scopes: ["moving.context.read"], scopeIntent: "chosen" });
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
    const owner = t.withIdentity({ subject: SUBJECT });
    const payload = { ...consent, grantId: original._id, expectedVersion: 1, expiryIntent: "none" as const, expiresInDays: null };
    await expect(owner.mutation(api.aiGrants.updateLimits, payload)).rejects.toThrow(/8 active/);
    expect((await t.run(ctx => ctx.db.get(original._id)))?.version).toBe(1);
    await owner.mutation(api.aiGrants.revoke, { grantId: activeIds[0], expectedVersion: 1 });
    await owner.mutation(api.aiGrants.updateLimits, payload);
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
    const owner = t.withIdentity({ subject: SUBJECT });
    for (const edits of [{ scopes: [...movingScopes], scopeIntent: "full" as const }, { expiresInDays: null, expiryIntent: "none" as const }]) {
      await expect(owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId: row._id, expectedVersion: 1, ...edits })).rejects.toThrow(/active member/);
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
  const owner = t.withIdentity({ subject: SUBJECT });
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
  it.each([{ client_id: "own-client" }, { clientId: "own-client" }, { azp: "opaque-client" }, { scope: "openid" }, { scp: ["openid"] }, { tokenType: "oauth" }])("refuses an OAuth identity %j on all owner-facing queries", async claims => {
    const t = convexTest(schema, modules);
    await seedOwner(t);
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "sibling" });
    const oauth = t.withIdentity({ subject: SUBJECT, ...claims });
    await expect(oauth.query(api.aiGrants.listMine, {})).rejects.toThrow(/settings/);
    await expect(oauth.query(api.aiGrants.listActivity, {})).rejects.toThrow(/settings/);
    await expect(oauth.query(api.aiGrants.listMoveChoices, { householdId: (await t.run(ctx => ctx.db.query("households").first()))!._id })).rejects.toThrow(/settings/);
    await expect(oauth.query(api.aiGrants.listSourceHistory, {})).rejects.toThrow(/settings/);
    expect((await t.withIdentity({ subject: SUBJECT }).query(api.aiGrants.listMine, {})).grants).toHaveLength(1);
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
    const owner = t.withIdentity({ subject: SUBJECT });
    await owner.mutation(api.aiGrants.revoke, { grantId: original._id, expectedVersion: 1 });
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
    const owner = t.withIdentity({ subject: SUBJECT });
    await owner.mutation(api.aiGrants.revoke, { grantId: original._id });
    await t.run(async ctx => {
      const now = Date.now();
      const adminId = await ctx.db.insert("users", { clerkUserId: "separate-admin", name: "Another admin", appRole: "member", status: "active", createdAt: now, updatedAt: now, lastSeenAt: now });
      await ctx.db.insert("householdMemberships", { householdId, userId: adminId, role: "admin", status: "active", apiAccessStatus: "enabled", createdAt: now, updatedAt: now, createdByUserId: adminId });
    });
    const loaded = await owner.query(api.aiGrants.listMine, {});
    const { grantId } = await owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Private reconnect", reconnectGrantId: original._id, expectedHistoryFingerprint: loaded.historyFingerprint });
    const audit = await t.withIdentity({ subject: "separate-admin" }).query(api.audit.listForHousehold, { householdId });
    const approval = audit.find(row => row.objectId === grantId && row.action === "ai_grant.approved")!;
    expect(approval.metadata).toEqual({ scopes: [...movingScopes], moveScope: "allMoves", moveCount: null, reconnected: true });
    expect(JSON.stringify(approval.metadata)).not.toContain(clientId);
    expect(JSON.stringify(approval.metadata)).not.toContain(original._id);
    expect((await t.withIdentity({ subject: "separate-admin" }).query(api.aiGrants.listSourceHistory, {})).page).toEqual([]);
  });
});


describe("paged owner settings and participant move limits", () => {
  it("pages API-key history without exposing settings to OAuth identities", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId } = await seedOwner(t);
    await t.run(async ctx => {
      for (let i = 0; i < 57; i++) await ctx.db.insert("apiKeys", { householdId, name: "Historical fixture " + i, prefix: "synthetic", tokenPreview: "synthetic-preview", secretHash: "synthetic-non-secret-hash", scopes: ["moves/read"], status: i === 0 ? "active" : "revoked", createdByUserId: userId, createdAt: i, updatedAt: i });
    });
    for (const claims of [{ client_id: "oauth" }, { clientId: "oauth" }, { azp: "opaque" }, { scope: "openid" }, { scp: ["openid"] }, { tokenType: "oauth" }]) await expect(t.withIdentity({ subject: SUBJECT, ...claims }).query(api.apiKeys.listForHousehold, { householdId })).rejects.toThrow(/settings/);
    const owner = t.withIdentity({ subject: SUBJECT });
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
    const owner = t.withIdentity({ subject: SUBJECT });
    const choices = await owner.query(api.aiGrants.listMoveChoices, { householdId });
    expect(choices.moves.map(move => move.moveId)).toEqual([ids.a, ids.b]);
    await owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId: row._id, expectedVersion: 1, moveScope: "selectedMoves", moveIds: [ids.a] });
    expect((await t.run(ctx => ctx.db.get(row._id)))?.moveIds).toEqual([ids.a]);
    await expect(owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId: row._id, expectedVersion: 2, moveScope: "selectedMoves", moveIds: [ids.foreign] })).rejects.toThrow();
    await owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId: row._id, expectedVersion: 2, moveScope: "selectedMoves", moveIds: [ids.a, ids.b] });
    await owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId: row._id, expectedVersion: 3, moveScope: "allMoves" });
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
  const owner = t.withIdentity({ subject: SUBJECT });
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
  const owner = t.withIdentity({ subject: SUBJECT });
  for (let i = 0; i < 3; i++) await owner.mutation(api.apiKeys.create, { householdId, name: "New default " + i, ...(i === 1 ? { expiresAt: Date.now() + 86400000 } : {}) });
  await expect(owner.mutation(api.apiKeys.create, { householdId, name: "Beyond quota" })).rejects.toThrow(/active connections/);
  const rows = await t.run(ctx => ctx.db.query("apiKeys").collect());
  const current = rows.filter(row => row.expiresAt === undefined);
  expect(current).toHaveLength(2);
  expect(current.every(row => row.scopeChoice === "full")).toBe(true);
});


it("rolls back the API-key patch if its receipt write fails inside REST reduction", async () => {
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
    if (input.action === "api_key.self_reduced") throw new Error("synthetic receipt failure");
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
  expect((await t.run(ctx => ctx.db.query("auditLogs").collect()))).toEqual([expect.objectContaining({ action: "api_key.self_reduced", metadata: expect.objectContaining({ version: 2 }) })]);
});

it.each(["opaque-description", "https://description.example/client.json"])("describes only the calling legacy credential %s without context scope or unrestricted moves", async clientId => {
  const t = convexTest(schema, modules);
  const { userId, householdId } = await seedOwner(t);
  const moveId = await t.run(ctx => ctx.db.insert("moves", { householdId, title: "PRIVATE domain move", type: "local", status: "planning", unitSystem: "imperial", createdByUserId: userId, createdAt: Date.now(), updatedAt: Date.now() }));
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "legacy:" + clientId });
  await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "legacy:sibling-description" });
  const row = (await t.run(ctx => ctx.db.query("aiGrants").collect())).find(row => row.clientId === "legacy:" + clientId)!;
  const sibling = (await t.run(ctx => ctx.db.query("aiGrants").collect())).find(row => row.clientId === "legacy:sibling-description")!;
  const owner = t.withIdentity({ subject: SUBJECT });
  await owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId: row._id, expectedVersion: 1, moveScope: "selectedMoves", moveIds: [moveId], scopes: ["moving.work.write"], scopeIntent: "chosen" });
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
  const owner = t.withIdentity({ subject: SUBJECT });
  expect(await owner.query(api.households.summaryStats, { householdId })).toMatchObject({ activeApiKeyCount: 0, activeApiKeyCountTruncated: false });
  await t.run(async ctx => {
    for (let i = 0; i < 103; i++) await ctx.db.insert("apiKeys", { householdId, name: "Current summary fixture", prefix: "synthetic", tokenPreview: "synthetic", secretHash: "synthetic-hash", scopes: ["moves/read"], status: "active", createdByUserId: userId, createdAt: i, updatedAt: i });
  });
  expect(await owner.query(api.households.summaryStats, { householdId })).toMatchObject({ activeApiKeyCount: 100, activeApiKeyCountTruncated: true });
});
