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
import { convexTest } from "convex-test";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import { api, internal } from "../../convex/_generated/api";
import { UNIDENTIFIED_LEGACY_CLIENT } from "../../convex/lib/mcpLegacyGrantGate";
import { effectiveScopes, effectiveScopeChoice, effectiveExpiry, chosenExpiry, movingScopes, findPermittingGrant } from "../../convex/lib/aiGrants";
import schema from "../../convex/schema";

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

async function seedOwner(t: ReturnType<typeof convexTest>) {
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
    await owner.mutation(api.aiGrants.updateLimits, { grantId: row!._id, expectedVersion: 1, scopes: ["moving.context.read"], expiresInDays: 7 });
    const chosen = await t.run((ctx) => ctx.db.get(row!._id));
    expect(chosen?.scopeChoice).toBe("chosen");
    expect(chosen?.expiryChoice).toBe("chosen");
    await t.mutation(grants.touchLegacyConnection, { subject: SUBJECT, clientId: "full-client" });
    expect(await t.run((ctx) => ctx.db.get(row!._id))).toEqual(chosen);
    await owner.mutation(api.aiGrants.updateLimits, { grantId: row!._id, expectedVersion: 2, scopes: [...movingScopes], expiresInDays: null });
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
    await owner.mutation(api.aiGrants.updateLimits, { grantId: row._id, expectedVersion: 1, scopes: ["moving.context.read"] });
    expect((await t.run((ctx) => ctx.db.get(row._id)))?.expiresAt).toBeUndefined();
    await t.run((ctx) => ctx.db.patch(row._id, { expiryChoice: "chosen", expiresAt: approvedAt }));
    expect((await t.query(grants.grantsForPrincipal, { subject: SUBJECT, clientId: "old-client" })).grants).toHaveLength(0);
  });

  it("settings approval defaults to no expiry and marks explicit durations", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedOwner(t);
    const owner = t.withIdentity({ subject: SUBJECT });
    const common = { householdId, label: "Manual", scopes: [...movingScopes], moveScope: "allMoves" as const };
    const { grantId } = await owner.mutation(api.aiGrants.approve, common);
    expect((await t.run((ctx) => ctx.db.get(grantId)))?.expiryChoice).toBe("none");
    const dated = await owner.mutation(api.aiGrants.approve, { ...common, expiresInDays: 30 });
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
