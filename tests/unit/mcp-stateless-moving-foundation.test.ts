// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- protocol envelopes and the convex-test ActionCtx bridge are intentionally synthetic. */

import { createMcpHandler } from "@modelcontextprotocol/server";
import { convexTest } from "convex-test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { createMovingServer, STATELESS_MOVING_TOOL_NAMES } from "../../convex/httpRoutes/mcp";
import schema from "../../convex/schema";

type ModuleMap = Record<string, () => Promise<unknown>>;

function buildModuleMap(rootDir: string): ModuleMap {
  const modules: ModuleMap = {};
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const fullPath = path.join(directory, entry);
      if (statSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else if (/\.(?:ts|tsx|js)$/.test(entry)) {
        modules[path.relative(process.cwd(), fullPath).replace(/\\/g, "/")] = () =>
          import(pathToFileURL(fullPath).href);
      }
    }
  };
  walk(rootDir);
  return modules;
}

const modules = buildModuleMap(path.join(process.cwd(), "convex"));
const ISSUER = "https://moving-mcp-test.clerk.accounts.dev";
const SUBJECT = "user_moving_mcp_synthetic";
const PRINCIPAL = {
  issuer: ISSUER,
  subject: SUBJECT,
  clientId: "moving-mcp-synthetic-client",
  clientName: "Synthetic Moving client",
};
const mcpInternal = (internal as any).mcpPlanning;

async function withEnvironment<T>(values: Record<string, string>, task: () => Promise<T>) {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, values);
  try {
    return await task();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function modernRequest(method: string, params: Record<string, unknown> = {}, name?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2026-07-28",
    "mcp-method": method,
  };
  if (name) headers["mcp-name"] = name;
  return new Request("https://movingmanifest.test/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${method}-synthetic-proof`,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": {
            name: "moving-mcp-synthetic-proof",
            version: "1",
          },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
}

async function seedMove() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      clerkUserId: SUBJECT,
      email: "moving-mcp-synthetic@example.test",
      name: "Synthetic Move Owner",
      appRole: "member",
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });
    const householdId = await ctx.db.insert("households", {
      name: "Synthetic MCP Household",
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
    const moveId = await ctx.db.insert("moves", {
      householdId,
      title: "Synthetic Phoenix to Tucson move",
      type: "local",
      status: "planning",
      origin: "Phoenix, AZ",
      destination: "Tucson, AZ",
      unitSystem: "imperial",
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    // The connection's product grant. An OAuth token alone proves identity and
    // nothing more, so every tool call in these tests is authorized by this row
    // — and revoking it is what the revocation tests exercise.
    const grantId = await ctx.db.insert("aiGrants", {
      ownerUserId: userId,
      householdId,
      label: "Synthetic chosen AI",
      scopes: [
        "moving.context.read",
        "moving.evidence.read",
        "moving.work.write",
        "moving.queue.work",
        "moving.archive",
      ],
      moveScope: "allMoves",
      status: "active",
      consentBoundaryVersion: "2026-08-16",
      consentSnapshot: [],
      approvedAt: now,
      useCount: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const guestUserId = await ctx.db.insert("users", {
      clerkUserId: "user_moving_mcp_guest",
      email: "moving-mcp-guest@example.test",
      name: "Synthetic Move Guest",
      appRole: "member",
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });
    await ctx.db.insert("householdMemberships", {
      householdId,
      userId: guestUserId,
      role: "viewer",
      status: "active",
      apiAccessStatus: "enabled",
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    const privatePhotoId = await ctx.db.insert("itemPhotos", {
      householdId,
      moveId,
      documentationProfileTypes: [],
      originalStorageKey: "synthetic/private-proof.webp",
      originalBucket: "synthetic-proof-bucket",
      derivativeRefs: { card: "private-proof-card.webp" },
      derivativeStatus: "ready",
      mediaKind: "image",
      mimeType: "image/webp",
      sizeBytes: 100,
      caption: "Private synthetic proof caption",
      photoType: "other",
      privacyLevel: "private",
      visibilityScope: "private",
      source: "manualUpload",
      exifHandlingStatus: "stripped",
      confidence: "manual",
      verificationStatus: "verified",
      aiProcessed: false,
      uploadedByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    const foreignQueueItemId = await ctx.db.insert("queueItems", {
      householdId,
      moveId,
      ownerUserId: guestUserId,
      createdByUserId: guestUserId,
      directive: "Private synthetic guest Queue work",
      state: "waitingForAi",
      priority: "normal",
      contextKind: "move",
      domainKind: "general",
      nextStep: "Wait for the guest's chosen AI",
      waitingReason: "ready",
      attemptCount: 0,
      maxAttempts: 3,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const queueItemId = await ctx.db.insert("queueItems", {
      householdId,
      moveId,
      ownerUserId: userId,
      createdByUserId: userId,
      directive: "Save a source-backed packing result for review",
      state: "waitingForAi",
      priority: "normal",
      contextKind: "move",
      domainKind: "general",
      waitingReason: "ready",
      attemptCount: 0,
      maxAttempts: 3,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    return {
      userId,
      householdId,
      moveId,
      grantId,
      guestUserId,
      privatePhotoId,
      queueItemId,
      foreignQueueItemId,
    };
  });
  // Legacy grants bootstrap through scheduled pages. Finish fixture setup before
  // querying authority, rather than racing the zero-delay continuation timer.
  vi.useFakeTimers();
  try {
    await t.mutation(internal.aiGrants.touchLegacyConnection, { subject: PRINCIPAL.subject, clientId: PRINCIPAL.clientId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const access = await t.query(internal.aiGrants.grantsForPrincipal, {
      subject: PRINCIPAL.subject,
      clientId: PRINCIPAL.clientId,
    });
    expect(access.connectionState.status).toBe("active");
  } finally {
    vi.useRealTimers();
  }
  return { t, ...ids };
}

describe("stateless Moving MCP foundation", () => {
  it.each([100, 2000, 10000])("traverses %i synthetic source items against ID ground truth (local engine model only)", async size => {
    await withEnvironment({ CLERK_JWT_ISSUER_DOMAIN: ISSUER }, async () => {
      const f = await seedMove();
      const expected = new Set<string>();
      for (let base = 0; base < size; base += 250) {
        const ids = await f.t.run(async ctx => {
          const ids = [];
          for (let i = base; i < Math.min(size, base + 250); i++) ids.push(await ctx.db.insert("items", {
            householdId: f.householdId, moveId: f.moveId, name: "common latest 東京", normalizedName: "common latest 東京",
            quantity: 1, status: "active", condition: "good", disposition: "take",
            weightConfidence: "none", volumeConfidence: "none", fragility: "low", stackable: false,
            hazardousFlag: false, highValue: false, requiresPersonalTransport: false, planningDefaultKeys: [],
            needsReview: false, reviewFlags: [], aiTags: [], createdVia: "manual",
            createdByUserId: f.userId, updatedByUserId: f.userId, createdAt: i, updatedAt: i,
          }));
          return ids;
        });
        ids.forEach(id => expected.add(id));
      }
      const input = { principal: PRINCIPAL, moveId: f.moveId, query: "common", pageSize: 50 };
      let page = await f.t.mutation(mcpInternal.searchItemPagePrototype, input);
      const actual = new Set<string>();
      let steps = 0;
      for (;;) {
        expect(page.records.length).toBeLessThanOrEqual(50);
        for (const row of page.records) { expect(actual.has(row.id)).toBe(false); actual.add(row.id); }
        expect(++steps).toBeLessThanOrEqual(400);
        if (!page.nextCursor) break;
        page = await f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, cursor: page.nextCursor });
      }
      expect(actual).toEqual(expected);
      // Exactly10000may stop at the explicit traversal budget with all IDs
      // returned, but no native end observed. That is still NOT completion.
      expect(page.coverage.status).toBe(size === 10000 ? "budgetLimited" : "complete");
      expect(page.coverage.corpusComplete).toBe(false);
    });
  }, 60000);

  it("traverses the item prototype beyond 120 with sparse pages, current source matching and bounded state", async () => {
    await withEnvironment({ CLERK_JWT_ISSUER_DOMAIN: ISSUER }, async () => {
      const f = await seedMove();
      const ids = await f.t.run(async ctx => {
        const ids = [];
        for (let i = 0; i < 135; i++) ids.push(await ctx.db.insert("items", {
          householdId: f.householdId, moveId: f.moveId,
          name: i === 0 ? "latest 東京" : "ordinary", normalizedName: "ordinary",
          room: "front", category: "room", description: i === 0 ? "café cafe\u0301 body-only" : "",
          quantity: 1, status: "active", condition: "good", disposition: "take",
          weightConfidence: "none", volumeConfidence: "none", fragility: "low",
          stackable: false, hazardousFlag: false, highValue: false,
          requiresPersonalTransport: false, planningDefaultKeys: [], needsReview: false,
          reviewFlags: [], aiTags: [], createdVia: "manual", createdByUserId: f.userId,
          updatedByUserId: f.userId, createdAt: i, updatedAt: i,
        }));
        return ids;
      });
      const input = { principal: PRINCIPAL, moveId: f.moveId, query: "test", pageSize: 25 };
      let page = await f.t.mutation(mcpInternal.searchItemPagePrototype, input);
      expect(page.records).toEqual([]);
      expect(page.coverage.status).toBe("continuable");
      const firstCursor = page.nextCursor;
      const seen: string[] = [];
      let steps = 1;
      while (page.nextCursor) {
        page = await f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, cursor: page.nextCursor });
        seen.push(...page.records.map((row: any) => row.id));
        expect(++steps).toBeLessThan(10);
      }
      expect(seen).toEqual([ids[0]]);
      expect(page.coverage.status).toBe("complete");
      await expect(f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, cursor: firstCursor })).rejects.toThrow(/stale|terminal/);
      // Same current source supports body-only, Unicode and joined-field phrase;
      // the website's per-field phrase semantics remain a distinct adapter.
      await f.t.run(ctx => ctx.db.patch(ids[0], { updatedAt: 1000 }));
      for (const query of ["café", "cafe\u0301", "東京", "body-only", "front room"]) {
        const result = await f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, query, pageSize: 50 });
        expect(result.nextCursor).not.toBeNull();
        if (query === "front room") expect(result.records).toHaveLength(50);
        else expect(result.records.map((row: any) => row.id)).toEqual([ids[0]]);
      }
      expect(await f.t.run(ctx => ctx.db.query("itemSearchContinuations").collect())).toHaveLength(1);
      // Editing and soft-deleting a source immediately affect a new traversal.
      await f.t.run(ctx => ctx.db.patch(ids[0], { name: "renamed", description: "", deletedAt: 1 }));
      let after = await f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, pageSize: 50 });
      const afterIds = [...after.records];
      while (after.nextCursor) {
        after = await f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, pageSize: 50, cursor: after.nextCursor });
        afterIds.push(...after.records);
      }
      expect(afterIds).toEqual([]);
      await f.t.run(ctx => ctx.db.patch(ids[0], { name: "restored", description: "body-only", deletedAt: undefined, updatedAt: 1000 }));
      expect((await f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, query: "body-only" })).records[0].id).toBe(ids[0]);
      await f.t.run(ctx => ctx.db.delete(ids[0]));
      expect((await f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, query: "body-only" })).records).toEqual([]);
      // Full source text is matched even when output snippets are clipped.
      await f.t.run(ctx => ctx.db.patch(ids[1], { name: "x".repeat(100000) + "tail-token", updatedAt: 2000 }));
      const large = await f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, query: "tail-token", pageSize: 1 });
      expect(large.records[0]).toMatchObject({ id: ids[1], snippetTruncated: true });
      expect(large.records[0].title).toHaveLength(160);
      expect(Buffer.byteLength(JSON.stringify(large))).toBeLessThan(160 * 1024);
    });
  });

  it("binds server-owned item positions to exact semantics and live authority, refusing edited state", async () => {
    await withEnvironment({ CLERK_JWT_ISSUER_DOMAIN: ISSUER }, async () => {
      const f = await seedMove();
      // Tied timestamps exercise the native cursor tie ordering.
      await f.t.run(async ctx => {
        for (let i = 0; i < 3; i++) await ctx.db.insert("items", {
          householdId: f.householdId, moveId: f.moveId, name: "latest", normalizedName: "latest",
          quantity: 1, status: "active", condition: "good", disposition: "take",
          weightConfidence: "none", volumeConfidence: "none", fragility: "low",
          stackable: false, hazardousFlag: false, highValue: false, requiresPersonalTransport: false,
          planningDefaultKeys: [], needsReview: false, reviewFlags: [], aiTags: [], createdVia: "manual",
          createdByUserId: f.userId, updatedByUserId: f.userId, createdAt: i, updatedAt: 1, // tied source timestamps
        });
      });
      const input = { principal: PRINCIPAL, moveId: f.moveId, query: "test", pageSize: 1 };
      const first = await f.t.mutation(mcpInternal.searchItemPagePrototype, input);
      const cursor = first.nextCursor;
      expect(cursor).not.toBeNull();
      for (const changed of [{ query: "other" }, { pageSize: 2 }, { room: "front" }, { needsReview: true }]) {
        await expect(f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, ...changed, cursor })).rejects.toThrow(/another request|stale/);
      }
      for (const changed of [{ version: 999 }, { version: NaN }, { done: true }, { seen: [first.records[0].id] }, { position: "offset:2" }]) {
        await expect(f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, cursor: { ...cursor, ...changed } })).rejects.toThrow();
      }
      // Normalized-equivalent queries are intentionally the same request.
      const second = await f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, query: " TEST ", cursor });
      expect(second.records[0].id).not.toBe(first.records[0].id);
      await expect(f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, cursor })).rejects.toThrow(/stale/);
      const state = await f.t.run(async ctx => (await ctx.db.get(second.nextCursor.id as Id<"itemSearchContinuations">))!);
      expect(state.binding).toContain("joined-lowercase-infix-v1");
      expect(state).not.toHaveProperty("seen");
      await f.t.run(ctx => ctx.db.patch(state._id, { expiresAt: 0 }));
      await expect(f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, cursor: second.nextCursor })).rejects.toThrow(/expired/);
      await f.t.run(ctx => ctx.db.patch(state._id, { expiresAt: state.expiresAt }));
      const connection = await f.t.run(async ctx => (await ctx.db.get(state.connectionId))!);
      const originalPolicy = connection.policy!;
      for (const stopped of [{ pausedAt: Date.now() }, { revoked: true }, { endsAt: Date.now() - 1 }]) {
        await f.t.run(ctx => ctx.db.patch(connection._id, { policy: { ...originalPolicy, ...stopped } }));
        await expect(f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, cursor: second.nextCursor })).rejects.toThrow(/GRANT_REQUIRED|Missing power/);
      }
      await f.t.run(ctx => ctx.db.patch(connection._id, { policy: { ...originalPolicy, revision: originalPolicy.revision + 1 } }));
      await expect(f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, cursor: second.nextCursor })).rejects.toThrow(/stale|authority/);
      await f.t.run(ctx => ctx.db.patch(connection._id, { policy: originalPolicy }));
      await f.t.mutation(internal.aiGrants.touchLegacyConnection, { subject: PRINCIPAL.subject, clientId: "other-prototype-client" });
      await expect(f.t.mutation(mcpInternal.searchItemPagePrototype, {
        ...input, principal: { ...PRINCIPAL, clientId: "other-prototype-client" }, cursor: second.nextCursor,
      })).rejects.toThrow(/another request|authority|stale/);
      // A different granting row under the same subject/client also invalidates.
      await f.t.run(async ctx => {
        const grant = await ctx.db.get(f.grantId);
        const { _id, _creationTime, ...data } = grant!;
        void _id; void _creationTime;
        await ctx.db.patch(connection._id, { grantId: await ctx.db.insert("aiGrants", data) });
      });
      await expect(f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, cursor: second.nextCursor })).rejects.toThrow(/stale|authority/);
      await f.t.run(ctx => ctx.db.patch(connection._id, { grantId: connection.grantId }));
      // Traversal budgets are server state; reaching a limit never claims an end.
      await f.t.run(ctx => ctx.db.patch(state._id, { steps: 399 }));
      const limited = await f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, cursor: second.nextCursor });
      // Even the last returned row need not prove native range exhaustion.
      expect(limited.coverage.status).toBe("budgetLimited");
      expect(limited.coverage.corpusComplete).toBe(false);
      const newStream = await f.t.mutation(mcpInternal.searchItemPagePrototype, input);
      await f.t.run(ctx => ctx.db.patch(newStream.nextCursor.id, { steps: 399 }));
      const bounded = await f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, cursor: newStream.nextCursor });
      expect(bounded.coverage).toMatchObject({ status: "budgetLimited", observedRangeEnd: false, corpusComplete: false });
      expect(bounded.nextCursor).toBeNull();
      const liveStream = await f.t.mutation(mcpInternal.searchItemPagePrototype, input);
      const foreignMove = await f.t.run(async ctx => {
        const householdId = await ctx.db.insert("households", {
          name: "Foreign prototype household", ownerUserId: f.guestUserId,
          createdByUserId: f.guestUserId, createdAt: 1, updatedAt: 1,
        });
        const move = await ctx.db.get(f.moveId);
        const { _id, _creationTime, ...row } = move!;
        void _id; void _creationTime;
        return ctx.db.insert("moves", { ...row, householdId });
      });
      await expect(f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, moveId: foreignMove })).rejects.toThrow(/FORBIDDEN|No access/);
      // Allowed authority change still restarts: do not rely on grant revision
      // alone when membership changes role between calls.
      const membership = await f.t.run(ctx => ctx.db.query("householdMemberships").withIndex("by_household_user", q => q.eq("householdId", f.householdId).eq("userId", f.userId)).unique());
      await f.t.run(ctx => ctx.db.patch(membership!._id, { role: "viewer" }));
      await expect(f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, cursor: liveStream.nextCursor })).rejects.toThrow(/authority|stale/);
      await f.t.run(ctx => ctx.db.patch(membership!._id, { role: "owner" }));
      await f.t.run(async ctx => {
        const membership = await ctx.db.query("householdMemberships").withIndex("by_household_user", q => q.eq("householdId", f.householdId).eq("userId", f.userId)).unique();
        await ctx.db.patch(membership!._id, { apiAccessStatus: "disabled" });
      });
      await expect(f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, cursor: liveStream.nextCursor })).rejects.toThrow(/FORBIDDEN|agent access/);
      await f.t.run(ctx => ctx.db.patch(membership!._id, { apiAccessStatus: "enabled" }));
      const participantId = await f.t.run(ctx => ctx.db.insert("moveParticipants", {
        householdId: f.householdId, moveId: f.moveId, userId: f.userId,
        role: "viewer", accessKind: "householdBacked", participantType: "householdMember",
        status: "active", agentAccessStatus: "enabled", createdAt: 1, updatedAt: 1,
      }));
      const participantStream = await f.t.mutation(mcpInternal.searchItemPagePrototype, input);
      await f.t.run(ctx => ctx.db.patch(participantId, { agentAccessStatus: "disabled" }));
      await expect(f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, cursor: participantStream.nextCursor })).rejects.toThrow(/FORBIDDEN|agent access/);
    });
  });

  it("keeps prototype progress invariant when only deleted item terms and sizes change", async () => {
    await withEnvironment({ CLERK_JWT_ISSUER_DOMAIN: ISSUER }, async () => {
      const f = await seedMove();
      await f.t.run(async ctx => {
        for (let i = 0; i < 4; i++) await ctx.db.insert("items", {
          householdId: f.householdId, moveId: f.moveId, name: "ordinary", normalizedName: "ordinary",
          deletedAt: i % 2 ? 1 : undefined,
          quantity: 1, status: "active", condition: "good", disposition: "take",
          weightConfidence: "none", volumeConfidence: "none", fragility: "low", stackable: false,
          hazardousFlag: false, highValue: false, requiresPersonalTransport: false, planningDefaultKeys: [],
          needsReview: false, reviewFlags: [], aiTags: [], createdVia: "manual", createdByUserId: f.userId,
          updatedByUserId: f.userId, createdAt: i, updatedAt: i,
        });
      });
      const input = { principal: PRINCIPAL, moveId: f.moveId, query: "hidden", pageSize: 1 };
      const first = await f.t.mutation(mcpInternal.searchItemPagePrototype, input);
      const stored = await f.t.run(async ctx => (await ctx.db.get(first.nextCursor.id as Id<"itemSearchContinuations">))!);
      const before = await f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, cursor: first.nextCursor });
      await f.t.run(async ctx => {
        const { _id, _creationTime, ...data } = stored;
        void _creationTime;
        await ctx.db.replace(_id, data);
        const deleted = (await ctx.db.query("items").collect()).filter(row => row.deletedAt !== undefined);
        for (const row of deleted) await ctx.db.patch(row._id, { name: "hidden".repeat(20000), description: "secret hidden" });
      });
      const after = await f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, cursor: first.nextCursor });
      expect(after).toEqual(before); // complete envelope incl handle/termination/coverage
      const stateAfter = await f.t.run(async ctx => (await ctx.db.get(first.nextCursor.id as Id<"itemSearchContinuations">))!);
      // Retired/foreign handle cannot be restarted under a different move.
      const foreignMove = await f.t.run(async ctx => {
        const source = await ctx.db.get(f.moveId);
        const { _id, _creationTime, ...row } = source!;
        void _id; void _creationTime;
        return ctx.db.insert("moves", { ...row, title: "Other move" });
      });
      await expect(f.t.mutation(mcpInternal.searchItemPagePrototype, { ...input, moveId: foreignMove, cursor: { id: stateAfter!._id, version: stateAfter!.revision } })).rejects.toThrow(/another request|terminal|stale/);
    });
  });

  it("reports full source windows before text/deletion filtering without claiming corpus continuation", async () => {
    await withEnvironment({ CLERK_JWT_ISSUER_DOMAIN: ISSUER }, async () => {
      const fixture = await seedMove();
      const itemIds: string[] = [];
      await fixture.t.run(async (ctx) => {
        for (let index = 0; index < 121; index++) {
          const id = await ctx.db.insert("items", {
            householdId: fixture.householdId, moveId: fixture.moveId,
            name: index === 120 ? "latest 東京" : "ordinary",
            normalizedName: index === 120 ? "latest 東京" : "ordinary",
            description: index === 120 ? "body-only café" : undefined,
            quantity: 1, status: "active", condition: "good", disposition: "take",
            weightConfidence: "none", volumeConfidence: "none", fragility: "low",
            stackable: false, hazardousFlag: false, highValue: false,
            requiresPersonalTransport: false, planningDefaultKeys: [],
            needsReview: false, reviewFlags: [], aiTags: [], createdVia: "manual",
            createdByUserId: fixture.userId, updatedByUserId: fixture.userId,
            createdAt: index, updatedAt: index,
            deletedAt: index > 0 && index < 120 ? 999 : undefined,
          });
          itemIds.push(id);
        }
      });
      const search = (query: string) => fixture.t.query(mcpInternal.searchMoveRecords, {
        principal: PRINCIPAL, moveId: fixture.moveId, kinds: ["item", "space"], query,
      });
      for (const query of ["test", "東京", "body-only", "café"]) {
        const result = await search(query);
        expect(result.records).toHaveLength(1);
        expect(result.truncatedBeforeFilter).toBe(true);
        expect(result.nextCursor).toBeNull();
        expect(result.coverage).toMatchObject({
          visitedKinds: ["item", "space"], unsupportedKinds: [],
          candidateWindowStatus: "possiblyLimited", corpusComplete: false,
          continuationScope: "boundedCandidatePool", exactTotal: null,
        });
      }
      const empty = await search("no-match");
      expect(empty.records).toEqual([]);
      expect(empty.truncatedBeforeFilter).toBe(true);
      expect(empty.next).toContain("corpus coverage is not proved");
      // Exactly at the cap is still conservative: no lookahead read was made.
      await fixture.t.run(async (ctx) => { await ctx.db.delete(itemIds[0] as any); });
      expect((await search("test")).truncatedBeforeFilter).toBe(true);
      await fixture.t.run(async (ctx) => { await ctx.db.delete(itemIds[1] as any); });
      expect((await search("test")).truncatedBeforeFilter).toBe(false);
    });
  });

  it("distinguishes unsupported families and unverified native coverage from exhausted source windows", async () => {
    await withEnvironment({ CLERK_JWT_ISSUER_DOMAIN: ISSUER }, async () => {
      const fixture = await seedMove();
      const base = { principal: PRINCIPAL, moveId: fixture.moveId };
      const empty = await fixture.t.query(mcpInternal.searchMoveRecords, { ...base, kinds: ["item"] });
      expect(empty.coverage.candidateWindowStatus).toBe("exhausted");
      expect(empty.truncatedBeforeFilter).toBe(false);
      const photo = await fixture.t.query(mcpInternal.searchMoveRecords, { ...base, kinds: ["photo"] });
      expect(photo.coverage).toMatchObject({ visitedKinds: [], unsupportedKinds: ["photo"], corpusComplete: false });
      const native = await fixture.t.query(mcpInternal.searchMoveRecords, { ...base, kinds: ["decision"], query: "missing" });
      expect(native.coverage).toMatchObject({ candidateWindowStatus: "unverified", corpusComplete: false });
      expect(native.truncatedBeforeFilter).toBe(true);
      for (const cursor of ["offset:9007199254740992", `offset:${"0".repeat(81)}`, "offset:-1", "other:0"]) {
        await expect(fixture.t.query(mcpInternal.searchMoveRecords, { ...base, cursor })).rejects.toThrow(/Restart search_move_records/);
      }
      await expect(fixture.t.query(mcpInternal.searchMoveRecords, { ...base, query: "a".repeat(241) })).rejects.toThrow(/240/);
      await expect(fixture.t.query(mcpInternal.searchMoveRecords, { ...base, limit: Infinity })).rejects.toThrow(/finite/);
    });
  });

  it("keeps search and coverage identical when only a foreign Queue owner's terms change", async () => {
    await withEnvironment({ CLERK_JWT_ISSUER_DOMAIN: ISSUER }, async () => {
      const fixture = await seedMove();
      const input = { principal: PRINCIPAL, moveId: fixture.moveId, kinds: ["queue"], query: "hidden-token" };
      const before = await fixture.t.query(mcpInternal.searchMoveRecords, input);
      await fixture.t.run(async (ctx) => {
        await ctx.db.patch(fixture.foreignQueueItemId, { directive: "hidden-token" });
      });
      expect(await fixture.t.query(mcpInternal.searchMoveRecords, input)).toEqual(before);
      await expect(fixture.t.query(mcpInternal.searchMoveRecords, {
        ...input, principal: { ...PRINCIPAL, clientId: "unapproved-sibling" },
      })).rejects.toThrow(/GRANT_REQUIRED|Missing power/);
    });
  });

  it("returns an RFC 9728 OAuth challenge and bounded public resource metadata", async () => {
    const t = convexTest(schema, modules);
    await withEnvironment(
      {
        MCP_RESOURCE_URL: "https://movingmanifest.test/mcp",
        CLERK_JWT_ISSUER_DOMAIN: ISSUER,
      },
      async () => {
        const anonymous = await t.fetch("/mcp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "anonymous-proof",
            method: "tools/list",
            params: {},
          }),
        });
        expect(anonymous.status).toBe(401);
        expect(anonymous.headers.get("www-authenticate")).toContain(
          'resource_metadata="https://movingmanifest.test/.well-known/oauth-protected-resource/mcp"',
        );

        const metadata = await t.fetch("/.well-known/oauth-protected-resource/mcp");
        expect(metadata.status).toBe(200);
        const body = (await metadata.json()) as any;
        expect(body.resource).toBe("https://movingmanifest.test/mcp");
        expect(body.authorization_servers).toEqual([ISSUER]);
        expect(body.resource_documentation).toBe("https://movingmanifest.test/ai");
        expect(JSON.stringify(body)).not.toContain(SUBJECT);
      },
    );
  });

  it("accepts Clerk issuer-signed access tokens with its production audience shape", async () => {
    const t = convexTest(schema, modules);
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === `${ISSUER}/.well-known/jwks.json`) {
        return new Response(
          JSON.stringify({
            keys: [{ ...jwk, kid: "moving-mcp-proof-key", use: "sig", alg: "RS256" }],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return originalFetch(input as any, init);
    }) as typeof fetch;
    try {
      const sign = (audience: string | undefined, expiresAt: number) => {
        const token = new SignJWT({ scope: "openid profile", azp: PRINCIPAL.clientId })
          .setProtectedHeader({ alg: "RS256", kid: "moving-mcp-proof-key", typ: "at+jwt" })
          .setIssuer(ISSUER)
          .setSubject(SUBJECT)
          .setIssuedAt()
          .setExpirationTime(expiresAt);
        if (audience) token.setAudience(audience);
        return token.sign(privateKey);
      };
      const call = (token: string) =>
        t.fetch("/mcp", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": "2026-07-28",
            "mcp-method": "tools/list",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "oauth-proof",
            method: "tools/list",
            params: {
              _meta: {
                "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                "io.modelcontextprotocol/clientInfo": { name: "oauth-proof", version: "1" },
                "io.modelcontextprotocol/clientCapabilities": {},
              },
            },
          }),
        });

      await withEnvironment(
        {
          MCP_RESOURCE_URL: "https://movingmanifest.test/mcp",
          CLERK_JWT_ISSUER_DOMAIN: ISSUER,
        },
        async () => {
          const accepted = await call(
            await sign(
              "https://movingmanifest.test/mcp",
              Math.floor(Date.now() / 1_000) + 300,
            ),
          );
          expect(accepted.status).toBe(200);
          const acceptedBody = await accepted.text();
          // A verified token gets a working catalog. This identity holds no
          // product grant, so the catalog is only the always-available
          // connection description — identity is not authority.
          expect(acceptedBody).toContain("describe_connection");
          expect(acceptedBody).not.toContain("get_move_brief");

          const productionShape = await call(
            await sign(undefined, Math.floor(Date.now() / 1_000) + 300),
          );
          expect(productionShape.status).toBe(200);
          expect(await productionShape.text()).toContain("describe_connection");

          const clerkClientAudience = await call(
            await sign(PRINCIPAL.clientId, Math.floor(Date.now() / 1_000) + 300),
          );
          expect(clerkClientAudience.status).toBe(200);

          const wrongAudience = await call(
            await sign(
              "https://other.example.test/mcp",
              Math.floor(Date.now() / 1_000) + 300,
            ),
          );
          expect(wrongAudience.status).toBe(401);

          const expired = await call(
            await sign(
              "https://movingmanifest.test/mcp",
              Math.floor(Date.now() / 1_000) - 60,
            ),
          );
          expect(expired.status).toBe(401);
          expect((await expired.json()) as any).toMatchObject({
            error: "invalid_token",
          });
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("discovers the exact workflow catalog on modern and legacy stateless requests", async () => {
    const actionCtx = {
      runQuery: async () => {
        throw new Error("Tool execution was not expected during discovery.");
      },
      runMutation: async () => {
        throw new Error("Tool execution was not expected during discovery.");
      },
    } as any;
    const handler = createMcpHandler(
      () => createMovingServer(actionCtx, PRINCIPAL).server,
      { legacy: "stateless", responseMode: "json" },
    );

    const discover = await handler.fetch(modernRequest("server/discover"));
    expect(discover.status).toBe(200);
    const discoverBody = (await discover.json()) as any;
    expect(discoverBody.result.supportedVersions).toContain("2026-07-28");

    const listed = await handler.fetch(modernRequest("tools/list"));
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as any;
    expect(listedBody.result.tools.map((tool: { name: string }) => tool.name)).toEqual(
      STATELESS_MOVING_TOOL_NAMES,
    );
    expect(listed.headers.get("mcp-session-id")).toBeNull();

    const legacy = await handler.fetch(
      new Request("https://movingmanifest.test/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2025-11-25",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "legacy-tool-list",
          method: "tools/list",
          params: {},
        }),
      }),
    );
    expect(legacy.status).toBe(200);
    const legacyText = await legacy.text();
    expect(legacyText).toContain("get_move_brief");
    expect(legacyText).toContain("save_complete_result");
    expect(legacy.headers.get("mcp-session-id")).toBeNull();
    await handler.close();
  });

  it("orients, saves a complete result once, replays safely, searches, and corrects it in isolation", async () => {
    const previousIssuer = process.env.CLERK_JWT_ISSUER_DOMAIN;
    process.env.CLERK_JWT_ISSUER_DOMAIN = ISSUER;
    try {
      const fixture = await seedMove();
      const actionCtx = {
        runQuery: (reference: any, args: any) => fixture.t.query(reference, args),
        runMutation: (reference: any, args: any) => fixture.t.mutation(reference, args),
        runAction: (reference: any, args: any) => fixture.t.action(reference, args),
      } as any;
      const handler = createMcpHandler(
        () => createMovingServer(actionCtx, PRINCIPAL).server,
        { legacy: "stateless", responseMode: "json" },
      );

      const brief = await fixture.t.query(mcpInternal.getMoveBrief, {
        principal: PRINCIPAL,
      });
      expect(brief.moves).toHaveLength(1);
      expect(brief.moves[0].moveId).toBe(fixture.moveId);
      expect(brief).not.toHaveProperty("householdId");

      const completeInput = {
        moveId: String(fixture.moveId),
        operationId: "synthetic-complete-result-0001",
        resultKey: "first-useful-loop",
        title: "First useful move plan",
        summary: "Captured the office inventory and one timing decision.",
        body: "Pack the office reference books first, then confirm the truck estimate.",
        spaces: [
          { name: "Office", kind: "originRoom" },
          { name: "New office", kind: "destinationRoom" },
        ],
        items: [
          {
            createKey: "office-reference-books",
            name: "Reference books",
            room: "Office",
            destinationRoom: "New office",
            quantity: 24,
            estimatedWeightLb: 72,
            weightConfidence: "medium",
            needsReview: true,
            reviewFlags: ["Confirm final box count"],
            researchSources: [
              {
                title: "Synthetic packing note",
                status: "checked",
                checkedAt: Date.now(),
              },
            ],
          },
        ],
        decisions: [
          {
            stableKey: "office-pack-order",
            kind: "decision",
            title: "Pack office reference books first",
            summary: "This clears the room before desk disassembly.",
            decision: "Books before furniture",
            rationale: "The books are dense and easy to stage safely.",
          },
        ],
        sourceChecks: [
          {
            stableKey: "synthetic-truck-check",
            title: "Synthetic truck estimate check",
            summary: "The example source was checked for this isolated proof.",
            status: "checked",
            url: "https://example.test/truck-estimate",
            publisher: "Synthetic source",
            checkedAt: Date.now(),
          },
        ],
        relatedQueueItemId: String(fixture.queueItemId),
        reason: "Save the user's completed synthetic planning result.",
      };
      const callComplete = () =>
        handler.fetch(
          modernRequest(
            "tools/call",
            { name: "save_complete_result", arguments: completeInput },
            "save_complete_result",
          ),
        );
      const createdEnvelope = (await (await callComplete()).json()) as any;
      const created = createdEnvelope.result.structuredContent;
      expect(created.items).toHaveLength(1);
      expect(created.spaces).toHaveLength(2);
      expect(created.records).toHaveLength(2);
      expect(created.queue).toEqual({
        queueItemId: fixture.queueItemId,
        transition: "none",
        // Saving work and closing a handoff are separate asks. Without
        // completeQueueItem the result is linked and the Queue state is left
        // to the person.
        note: expect.stringMatching(/linked for human inspection/i),
      });
      expect(created.receipt.actor).toBe("Your AI via MCP");

      const replayEnvelope = (await (await callComplete()).json()) as any;
      expect(replayEnvelope.result.structuredContent.replay).toBe(true);
      expect(replayEnvelope.result.structuredContent.result.planningRecordId).toBe(
        created.result.planningRecordId,
      );

      const counts = await fixture.t.run(async (ctx) => ({
        items: (await ctx.db.query("items").collect()).length,
        spaces: (await ctx.db.query("moveSpaces").collect()).length,
        planning: (await ctx.db.query("movePlanningRecords").collect()).length,
        operations: (await ctx.db.query("mcpOperations").collect()).length,
      }));
      expect(counts).toEqual({ items: 1, spaces: 2, planning: 3, operations: 1 });

      const linkedQueue = await fixture.t.run(async (ctx) => ({
        item: await ctx.db.get(fixture.queueItemId),
        activities: await ctx.db
          .query("queueActivities")
          .withIndex("by_item_created", (q) =>
            q.eq("queueItemId", fixture.queueItemId),
          )
          .collect(),
      }));
      expect(linkedQueue.item).toMatchObject({
        state: "waitingForAi",
        resultSummary: completeInput.summary,
        resultRefs: [
          {
            type: "planningRecord",
            id: created.result.planningRecordId,
            label: completeInput.title,
          },
        ],
        version: 2,
      });
      expect(linkedQueue.activities).toEqual([
        expect.objectContaining({
          type: "resultLinked",
          actorType: "agent",
          actorLabel: "Your AI via MCP",
          fromState: "waitingForAi",
          toState: "waitingForAi",
          resultRefCount: 1,
        }),
      ]);

      const hiddenPhotos = await fixture.t.query(internal.mcpToolsImages.mcpResolvePhotos, {
        caller: { subject: "user_moving_mcp_guest" },
        householdId: fixture.householdId,
        moveId: fixture.moveId,
        filter: { photoIds: [fixture.privatePhotoId] },
        limit: 8,
      });
      expect(hiddenPhotos).toEqual([]);

      await expect(
        fixture.t.query((internal as any).photos.getPhotoForDeliveryForSubject, {
          householdId: fixture.householdId,
          moveId: fixture.moveId,
          photoId: fixture.privatePhotoId,
          subject: "user_moving_mcp_guest",
        }),
      ).rejects.toThrow(/Photo not found/);

      const search = await fixture.t.query(mcpInternal.searchMoveRecords, {
        principal: PRINCIPAL,
        moveId: fixture.moveId,
        query: "office",
        limit: 20,
      });
      expect(search.records.map((record: { kind: string }) => record.kind)).toEqual(
        expect.arrayContaining(["item", "decision", "planResult"]),
      );

      const version = created.records.find(
        (record: { kind: string }) => record.kind === "decision",
      ).version;
      const correction = await handler.fetch(
        modernRequest(
          "tools/call",
          {
            name: "save_planning_record",
            arguments: {
              moveId: String(fixture.moveId),
              operationId: "synthetic-decision-correction-0001",
              record: {
                planningRecordId: created.records.find(
                  (record: { kind: string }) => record.kind === "decision",
                ).planningRecordId,
                expectedVersion: version,
                stableKey: "office-pack-order",
                kind: "decision",
                title: "Pack office reference books first",
                summary: "Updated after reviewing the synthetic room order.",
                decision: "Books before furniture",
              },
              reason: "Correct the durable synthetic planning result.",
            },
          },
          "save_planning_record",
        ),
      );
      const corrected = ((await correction.json()) as any).result.structuredContent;
      expect(corrected.action).toBe("updated");
      expect(corrected.record.version).toBe(version + 1);

      const crossOwnerQueue = await handler.fetch(
        modernRequest(
          "tools/call",
          {
            name: "save_planning_record",
            arguments: {
              moveId: String(fixture.moveId),
              operationId: "synthetic-foreign-queue-link-0001",
              record: {
                stableKey: "foreign-queue-link-must-fail",
                kind: "decision",
                title: "Do not cross Queue ownership",
                summary: "This synthetic write must fail closed.",
                decision: "Keep personal Queue work separate",
                relatedQueueItemId: String(fixture.foreignQueueItemId),
              },
              reason: "Prove that one person's AI cannot link another person's Queue work.",
            },
          },
          "save_planning_record",
        ),
      );
      const denied = ((await crossOwnerQueue.json()) as any).result;
      expect(denied.isError).toBe(true);
      expect(denied.structuredContent.error.code).toBe("NOT_FOUND");

      const otherClient = createMcpHandler(
        () =>
          createMovingServer(actionCtx, {
            ...PRINCIPAL,
            clientId: "different-chosen-ai-client",
          }).server,
        { legacy: "stateless", responseMode: "json" },
      );
      const crossClientCorrection = await otherClient.fetch(
        modernRequest(
          "tools/call",
          {
            name: "save_planning_record",
            arguments: {
              moveId: String(fixture.moveId),
              operationId: "synthetic-cross-client-correction-0001",
              record: {
                planningRecordId: corrected.record.planningRecordId,
                expectedVersion: corrected.record.version,
                stableKey: "office-pack-order",
                kind: "decision",
                title: "Do not overwrite another AI's result",
                summary: "This synthetic cross-client correction must fail closed.",
                decision: "Keep chosen-AI planning records separate",
              },
              reason: "Prove cross-client planning separation.",
            },
          },
          "save_planning_record",
        ),
      );
      const crossClientDenied = ((await crossClientCorrection.json()) as any).result;
      expect(crossClientDenied.isError).toBe(true);
      // The refusal now lands one step earlier than it used to. A grant binds
      // to the first client that uses it, so a second AI arriving with the same
      // person's token holds no authority at all — it never reaches the
      // record-level separation check underneath.
      expect(crossClientDenied.structuredContent.error.code).toBe("GRANT_REQUIRED");
      await otherClient.close();
      await handler.close();
    } finally {
      if (previousIssuer === undefined) delete process.env.CLERK_JWT_ISSUER_DOMAIN;
      else process.env.CLERK_JWT_ISSUER_DOMAIN = previousIssuer;
    }
  });
});
