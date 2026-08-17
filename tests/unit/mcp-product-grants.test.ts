// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- protocol envelopes and the convex-test ActionCtx bridge are intentionally synthetic. */

/**
 * The product grant boundary.
 *
 * The claim these tests defend is narrow and load-bearing: an OAuth token
 * proves *who* is calling and decides nothing about *what* they may do. Every
 * refusal below would previously have been an allow.
 */
import { createMcpHandler } from "@modelcontextprotocol/server";
import { convexTest } from "convex-test";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import { internal } from "../../convex/_generated/api";
import {
  createMovingServer,
  STATELESS_MOVING_TOOL_NAMES,
} from "../../convex/httpRoutes/mcp";
import {
  GRANT_BOUNDARY_VERSION,
  MOVING_SCOPES,
  MOVING_TOOL_SCOPES,
  NEVER_EXPOSED,
  NEVER_PERMITTED,
  buildConsentSnapshot,
  findPermittingGrant,
  movingScopes,
  scopeForTool,
  type MovingScope,
} from "../../convex/lib/aiGrants";
import {
  ClientIdentityError,
  clearClientMetadataCache,
  looksLikeClientIdMetadataDocument,
  resolveClientIdentity,
  validateClientMetadataDocument,
} from "../../convex/lib/mcpClientIdentity";
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
const ISSUER = "https://moving-grant-test.clerk.accounts.dev";
const SUBJECT = "user_moving_grant_synthetic";
const CLIENT_ID = "moving-grant-synthetic-client";
const PRINCIPAL = {
  issuer: ISSUER,
  subject: SUBJECT,
  clientId: CLIENT_ID,
  clientName: "Synthetic chosen AI",
};

function modernRequest(method: string, params: Record<string, unknown> = {}) {
  return new Request("https://movingmanifest.test/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": method,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${method}-grant-proof`,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": {
            name: "moving-grant-proof",
            version: "1",
          },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
}

const mcp = (internal as any).mcpPlanning;
const queueWork = (internal as any).mcpQueueWork;
const archive = (internal as any).mcpArchive;
const grants = (internal as any).aiGrants;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type GrantOptions = {
  scopes?: MovingScope[];
  moveScope?: "allMoves" | "selectedMoves";
  selectSecondMove?: boolean;
  status?: "active" | "revoked";
  expiresAt?: number;
  clientId?: string;
};

// The identity check runs before the grant check, so the synthetic issuer has
// to be the configured one or every test would refuse for the wrong reason.
beforeEach(() => {
  process.env.CLERK_JWT_ISSUER_DOMAIN = ISSUER;
});

async function seedWorkspace(grant?: GrantOptions) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      clerkUserId: SUBJECT,
      email: "moving-grant-synthetic@example.test",
      name: "Synthetic Grant Owner",
      appRole: "member",
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });
    const householdId = await ctx.db.insert("households", {
      name: "Synthetic Grant Household",
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
    const makeMove = (title: string) =>
      ctx.db.insert("moves", {
        householdId,
        title,
        type: "local",
        status: "planning",
        unitSystem: "imperial",
        createdByUserId: userId,
        createdAt: now,
        updatedAt: now,
      });
    const moveId = await makeMove("Granted move");
    const otherMoveId = await makeMove("Move outside the grant");

    const itemId = await ctx.db.insert("items", {
      householdId,
      moveId,
      name: "Bookshelf",
      normalizedName: "bookshelf",
      quantity: 1,
      status: "active",
      condition: "good",
      disposition: "take",
      weightConfidence: "none",
      volumeConfidence: "none",
      fragility: "low",
      stackable: true,
      hazardousFlag: false,
      highValue: false,
      requiresPersonalTransport: false,
      planningDefaultKeys: [],
      needsReview: false,
      reviewFlags: [],
      aiTags: [],
      createdVia: "manual",
      createdByUserId: userId,
      updatedByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });

    const queueItemId = await ctx.db.insert("queueItems", {
      householdId,
      moveId,
      ownerUserId: userId,
      createdByUserId: userId,
      directive: "Work out what the bookshelf is worth",
      state: "waitingForAi",
      priority: "normal",
      contextKind: "move",
      domainKind: "general",
      nextStep: "Wait for the chosen AI",
      waitingReason: "ready",
      attemptCount: 0,
      maxAttempts: 3,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    let grantId: any = null;
    if (grant) {
      grantId = await ctx.db.insert("aiGrants", {
        ownerUserId: userId,
        householdId,
        label: "Synthetic connection",
        clientId: grant.clientId,
        scopes: grant.scopes ?? [...movingScopes],
        moveScope: grant.moveScope ?? "allMoves",
        moveIds:
          grant.moveScope === "selectedMoves"
            ? [grant.selectSecondMove ? otherMoveId : moveId]
            : undefined,
        status: grant.status ?? "active",
        consentBoundaryVersion: GRANT_BOUNDARY_VERSION,
        consentSnapshot: buildConsentSnapshot(grant.scopes ?? [...movingScopes]),
        expiresAt: grant.expiresAt,
        approvedAt: now,
        useCount: 0,
        version: 1,
        createdAt: now,
        updatedAt: now,
        revokedAt: grant.status === "revoked" ? now : undefined,
      });
    }
    return { userId, householdId, moveId, otherMoveId, itemId, queueItemId, grantId };
  });
  return { t, ...ids };
}

/** The error envelope a tool refusal decodes into. */
async function refusalOf(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("Expected the call to be refused, but it succeeded.");
  } catch (error) {
    const raw =
      error instanceof Error
        ? String((error as { data?: unknown }).data ?? error.message)
        : String(error);
    const marker = raw.indexOf("MCP_MOVING_ERROR:");
    if (marker < 0) return { code: "UNMARKED", message: raw, recovery: "" };
    return JSON.parse(raw.slice(marker + "MCP_MOVING_ERROR:".length)) as {
      code: string;
      message: string;
      recovery: string;
    };
  }
}

// ---------------------------------------------------------------------------

describe("the scope catalog", () => {
  it("gives every canonical tool exactly one scope, and every scope a tool", () => {
    // Both directions. A tool with no scope would fail open if the catalog were
    // ever consulted permissively; a scope with no tool is copy promising an
    // authority nothing can exercise.
    for (const name of STATELESS_MOVING_TOOL_NAMES) {
      if (name === "describe_connection") continue;
      expect(scopeForTool(name), `${name} has no scope`).not.toBeNull();
    }
    const used = new Set(Object.values(MOVING_TOOL_SCOPES));
    for (const scope of movingScopes) {
      expect([...used], `${scope} is published but unreachable`).toContain(scope);
    }
    expect(Object.keys(MOVING_TOOL_SCOPES).sort()).toEqual(
      STATELESS_MOVING_TOOL_NAMES.filter((n) => n !== "describe_connection")
        .slice()
        .sort(),
    );
  });

  it("refuses an uncatalogued tool rather than defaulting it open", () => {
    expect(scopeForTool("delete_everything")).toBeNull();
    expect(scopeForTool("")).toBeNull();
  });

  it("states a does-not-imply boundary for every scope", () => {
    for (const info of MOVING_SCOPES) {
      expect(info.doesNotImply.length, `${info.scope} has no boundary`).toBeGreaterThan(
        20,
      );
      expect(info.label.length).toBeGreaterThan(5);
      expect(info.grants.length).toBeGreaterThan(20);
    }
    // Reading context must not sound like it includes evidence or writing.
    const context = MOVING_SCOPES.find((i) => i.scope === "moving.context.read");
    expect(context?.writes).toBe(false);
    expect(context?.doesNotImply).toMatch(/photos|evidence/i);
    const archiveScope = MOVING_SCOPES.find((i) => i.scope === "moving.archive");
    expect(archiveScope?.doesNotImply).toMatch(/permanently delete/i);
  });

  it("keeps a non-empty ceiling that no grant can reach past", () => {
    expect(NEVER_EXPOSED.length).toBeGreaterThan(3);
    expect(NEVER_PERMITTED.length).toBeGreaterThan(3);
    expect(NEVER_PERMITTED.join(" ")).toMatch(/permanently delete/i);
    expect(NEVER_EXPOSED.join(" ")).toMatch(/another/i);
  });

  it("freezes the approved wording into a consent snapshot", () => {
    const snapshot = buildConsentSnapshot(["moving.context.read", "moving.archive"]);
    expect(snapshot).toHaveLength(2);
    expect(snapshot[0]).toHaveProperty("doesNotImply");
    // Only the chosen scopes, so a snapshot cannot imply more than was approved.
    expect(snapshot.map((row) => row.scope)).toEqual([
      "moving.context.read",
      "moving.archive",
    ]);
  });
});

describe("choosing which grant permits a call", () => {
  const base = {
    status: "active" as const,
    moveScope: "allMoves" as const,
    moveIds: [] as string[],
  };
  const now = 1_000;

  it("refuses when the person holds no grant at all", () => {
    expect(findPermittingGrant([], "moving.context.read", "m1", now)).toBeNull();
  });

  it("refuses a revoked or expired grant even though the token is still valid", () => {
    const scopes = ["moving.context.read"];
    expect(
      findPermittingGrant([{ ...base, scopes, status: "revoked" }], "moving.context.read", "m1", now),
    ).toBeNull();
    expect(
      findPermittingGrant(
        [{ ...base, scopes, expiresAt: now - 1 }],
        "moving.context.read",
        "m1",
        now,
      ),
    ).toBeNull();
  });

  it("never sums two half-permissions into a whole one", () => {
    const readOnly = { ...base, scopes: ["moving.context.read"] };
    const writeElsewhere = {
      ...base,
      scopes: ["moving.work.write"],
      moveScope: "selectedMoves" as const,
      moveIds: ["m2"],
    };
    // One grant reads m1, another writes m2. Neither permits writing m1, and
    // together they still must not.
    expect(
      findPermittingGrant([readOnly, writeElsewhere], "moving.work.write", "m1", now),
    ).toBeNull();
  });

  it("cannot be walked sideways into a move it does not name", () => {
    const narrow = {
      ...base,
      scopes: ["moving.context.read"],
      moveScope: "selectedMoves" as const,
      moveIds: ["m1"],
    };
    expect(findPermittingGrant([narrow], "moving.context.read", "m1", now)).not.toBeNull();
    expect(findPermittingGrant([narrow], "moving.context.read", "m2", now)).toBeNull();
    // Naming no move is refused, not read as "any move".
    expect(
      findPermittingGrant([narrow], "moving.context.read", undefined, now),
    ).toBeNull();
  });
});

describe("client identity", () => {
  const DOC_URL = "https://client.example/mcp-client.json";
  const validDoc = JSON.stringify({
    client_id: DOC_URL,
    client_name: "Example Assistant",
    redirect_uris: ["https://client.example/callback", "http://127.0.0.1:8976/cb"],
  });

  beforeEach(() => clearClientMetadataCache());

  it("treats only an absolute HTTPS client id as a metadata document", () => {
    expect(looksLikeClientIdMetadataDocument(DOC_URL)).toBe(true);
    expect(looksLikeClientIdMetadataDocument("http://client.example/c.json")).toBe(false);
    expect(looksLikeClientIdMetadataDocument("client_abc123")).toBe(false);
  });

  it("accepts a document that names its own URL", async () => {
    const identity = await validateClientMetadataDocument(DOC_URL, validDoc);
    expect(identity.registrationMethod).toBe("clientIdMetadataDocument");
    expect(identity.clientName).toBe("Example Assistant");
    expect(identity.metadataDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails closed when the document does not name its own URL", async () => {
    // Without this check any document anywhere could be pointed at by any
    // client id, and the URL would stop meaning anything.
    await expect(
      validateClientMetadataDocument(
        DOC_URL,
        JSON.stringify({ client_id: "https://attacker.example/c.json", redirect_uris: ["https://a/b"] }),
      ),
    ).rejects.toBeInstanceOf(ClientIdentityError);
  });

  it("rejects a plaintext redirect that is not loopback, and unusable documents", async () => {
    await expect(
      validateClientMetadataDocument(
        DOC_URL,
        JSON.stringify({ client_id: DOC_URL, redirect_uris: ["http://client.example/cb"] }),
      ),
    ).rejects.toBeInstanceOf(ClientIdentityError);
    await expect(
      validateClientMetadataDocument(DOC_URL, "not json"),
    ).rejects.toBeInstanceOf(ClientIdentityError);
    await expect(
      validateClientMetadataDocument(DOC_URL, JSON.stringify({ client_id: DOC_URL })),
    ).rejects.toBeInstanceOf(ClientIdentityError);
  });

  it("labels an opaque provider id as the dynamic-registration fallback", async () => {
    const identity = await resolveClientIdentity("client_opaque_123");
    expect(identity.registrationMethod).toBe("dynamicClientRegistration");
    expect(identity.metadataDigest).toBeUndefined();
  });

  it("refuses a claimed document that fails to validate, instead of downgrading it", async () => {
    // Degrading to the fallback here would let a bad document buy the easier
    // path, which is exactly backwards.
    await expect(
      resolveClientIdentity(DOC_URL, {
        fetchImpl: async () => ({ ok: false, status: 404, text: async () => "" }),
      }),
    ).rejects.toBeInstanceOf(ClientIdentityError);
  });

  it("caches a validated document rather than refetching it every call", async () => {
    let fetches = 0;
    const fetchImpl = async () => {
      fetches += 1;
      return { ok: true, status: 200, text: async () => validDoc };
    };
    await resolveClientIdentity(DOC_URL, { fetchImpl });
    await resolveClientIdentity(DOC_URL, { fetchImpl });
    expect(fetches).toBe(1);
  });
});

describe("enforcement on every call", () => {
  it("refuses everything when the person has approved nothing", async () => {
    const fixture = await seedWorkspace();
    const refusal = await refusalOf(
      fixture.t.query(mcp.getMoveBrief, { principal: PRINCIPAL }),
    );
    expect(refusal.code).toBe("GRANT_REQUIRED");
    // The recovery has to be actionable by the person, not by an operator.
    expect(refusal.recovery).toMatch(/settings/i);
  });

  it("lists no product tools without a grant, but still explains itself", async () => {
    const actionCtx = { runQuery: async () => ({ scopes: [] }) } as any;
    const handler = createMcpHandler(
      () => createMovingServer(actionCtx, PRINCIPAL, []).server,
      { legacy: "stateless", responseMode: "json" },
    );
    const listed = await handler.fetch(modernRequest("tools/list"));
    const names = ((await listed.json()) as any).result.tools.map((t: any) => t.name);
    expect(names).toEqual(["describe_connection"]);
    await handler.close();
  });

  it("advertises only the tools a partial grant covers", async () => {
    const actionCtx = { runQuery: async () => ({ scopes: [] }) } as any;
    const handler = createMcpHandler(
      () =>
        createMovingServer(actionCtx, PRINCIPAL, ["moving.context.read"]).server,
      { legacy: "stateless", responseMode: "json" },
    );
    const listed = await handler.fetch(modernRequest("tools/list"));
    const names: string[] = ((await listed.json()) as any).result.tools.map(
      (t: any) => t.name,
    );
    expect(names).toContain("get_move_brief");
    // A capability nobody approved is never even shown.
    expect(names).not.toContain("save_inventory");
    expect(names).not.toContain("get_evidence_media");
    expect(names).not.toContain("archive_move_records");
    expect(names).not.toContain("list_queue_work");
    await handler.close();
  });

  it("separates reading from writing", async () => {
    const fixture = await seedWorkspace({ scopes: ["moving.context.read"] });
    const brief = await fixture.t.query(mcp.getMoveBrief, {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
    });
    expect(brief.move.moveId).toBe(fixture.moveId);

    const refusal = await refusalOf(
      fixture.t.mutation(mcp.saveInventory, {
        principal: PRINCIPAL,
        moveId: fixture.moveId,
        operationId: "synthetic-write-without-grant",
        requestHash: "hash",
        items: [{ createKey: "k1", name: "Sofa" }],
        reason: "Prove read is not write.",
      }),
    );
    expect(refusal.code).toBe("GRANT_SCOPE_MISSING");
  });

  it("separates private evidence from ordinary context", async () => {
    const fixture = await seedWorkspace({ scopes: ["moving.context.read"] });
    // resolveMoveScope is what get_evidence_media stands on, so it must prove
    // the evidence scope rather than inheriting the context one.
    const refusal = await refusalOf(
      fixture.t.query(mcp.resolveMoveScope, {
        principal: PRINCIPAL,
        moveId: fixture.moveId,
      }),
    );
    expect(refusal.code).toBe("GRANT_SCOPE_MISSING");
  });

  it("separates Queue work from ordinary writing", async () => {
    const fixture = await seedWorkspace({
      scopes: ["moving.context.read", "moving.work.write"],
    });
    const refusal = await refusalOf(
      fixture.t.query(queueWork.listQueueWork, {
        principal: PRINCIPAL,
        moveId: fixture.moveId,
      }),
    );
    expect(refusal.code).toBe("GRANT_SCOPE_MISSING");
  });

  it("separates archive from writing", async () => {
    const fixture = await seedWorkspace({
      scopes: ["moving.context.read", "moving.work.write"],
    });
    const refusal = await refusalOf(
      fixture.t.mutation(archive.archiveMoveRecords, {
        principal: PRINCIPAL,
        moveId: fixture.moveId,
        operationId: "synthetic-archive-without-grant",
        action: "archive",
        records: [{ kind: "item", id: String(fixture.itemId) }],
        reason: "Prove write is not archive.",
      }),
    );
    expect(refusal.code).toBe("GRANT_SCOPE_MISSING");
  });

  it("refuses a move the grant does not name, and hides it from the move list", async () => {
    const fixture = await seedWorkspace({
      scopes: ["moving.context.read"],
      moveScope: "selectedMoves",
    });
    const refusal = await refusalOf(
      fixture.t.query(mcp.getMoveBrief, {
        principal: PRINCIPAL,
        moveId: fixture.otherMoveId,
      }),
    );
    expect(refusal.code).toBe("GRANT_MOVE_MISSING");

    // An AI approved for one move should not even learn a second one exists.
    const list = await fixture.t.query(mcp.getMoveBrief, { principal: PRINCIPAL });
    expect(list.moves.map((m: any) => String(m.moveId))).toEqual([
      String(fixture.moveId),
    ]);
  });

  it("refuses the next call the moment a grant is revoked", async () => {
    const fixture = await seedWorkspace({ scopes: ["moving.context.read"] });
    // Prove it worked first, so the refusal below is the revocation and not a
    // setup mistake.
    await fixture.t.query(mcp.getMoveBrief, {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
    });
    await fixture.t.run(async (ctx) => {
      await ctx.db.patch(fixture.grantId, { status: "revoked", revokedAt: Date.now() });
    });
    const refusal = await refusalOf(
      fixture.t.query(mcp.getMoveBrief, {
        principal: PRINCIPAL,
        moveId: fixture.moveId,
      }),
    );
    // The access token is untouched and still cryptographically valid. This is
    // the whole reason authority is a database read.
    expect(refusal.code).toBe("GRANT_REQUIRED");
  });

  it("refuses an expired grant without anyone having to revoke it", async () => {
    const fixture = await seedWorkspace({
      scopes: ["moving.context.read"],
      expiresAt: Date.now() - 1_000,
    });
    const refusal = await refusalOf(
      fixture.t.query(mcp.getMoveBrief, {
        principal: PRINCIPAL,
        moveId: fixture.moveId,
      }),
    );
    expect(refusal.code).toBe("GRANT_REQUIRED");
  });

  it("does not let one person's grant reach another person's client", async () => {
    const fixture = await seedWorkspace({
      scopes: [...movingScopes],
      clientId: "the-only-bound-client",
    });
    const refusal = await refusalOf(
      fixture.t.query(mcp.getMoveBrief, {
        principal: { ...PRINCIPAL, clientId: "a-different-ai" },
        moveId: fixture.moveId,
      }),
    );
    expect(refusal.code).toBe("GRANT_REQUIRED");
  });

  it("keeps refusals free of anything that would confirm another record exists", async () => {
    const fixture = await seedWorkspace({ scopes: ["moving.context.read"] });
    const refusal = await refusalOf(
      fixture.t.mutation(mcp.saveInventory, {
        principal: PRINCIPAL,
        moveId: fixture.moveId,
        operationId: "synthetic-leak-check",
        requestHash: "hash",
        items: [{ createKey: "k1", name: "Sofa" }],
        reason: "Check the refusal wording.",
      }),
    );
    const text = `${refusal.message} ${refusal.recovery}`;
    expect(text).not.toMatch(/clerk|subject|user_|household[iI]d/);
  });
});

describe("the Queue workflow under a grant", () => {
  it("lists only work actually waiting for the AI, then runs the loop", async () => {
    const fixture = await seedWorkspace({
      scopes: ["moving.context.read", "moving.queue.work"],
    });
    const listed = await fixture.t.query(queueWork.listQueueWork, {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
    });
    expect(listed.work).toHaveLength(1);
    const target = listed.work[0];
    expect(target.queueItemId).toBe(fixture.queueItemId);
    // The version to claim with is handed over rather than guessed at.
    expect(target.claimWith.expectedVersion).toBe(1);

    const claimed = await fixture.t.mutation(queueWork.claimQueueWork, {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
      queueItemId: fixture.queueItemId,
      expectedVersion: target.claimWith.expectedVersion,
      operationId: "synthetic-claim-0001",
      nextStep: "Researching comparable sale prices",
    });
    expect(claimed.queue.state).toBe("working");

    // Claimed work leaves the actionable list, so a second AI does not pick it up.
    const afterClaim = await fixture.t.query(queueWork.listQueueWork, {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
    });
    expect(afterClaim.work).toHaveLength(0);

    const asked = await fixture.t.mutation(queueWork.askQueueQuestion, {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
      queueItemId: fixture.queueItemId,
      expectedVersion: claimed.queue.version,
      operationId: "synthetic-question-0001",
      question: "Is the bookshelf solid oak or veneer?",
    });
    expect(asked.queue.state).toBe("needsYou");
    expect(asked.queue.requiredAction).toMatch(/oak or veneer/i);
  });

  it("is idempotent, so a retried claim does not fight itself", async () => {
    const fixture = await seedWorkspace({
      scopes: ["moving.context.read", "moving.queue.work"],
    });
    const args = {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
      queueItemId: fixture.queueItemId,
      expectedVersion: 1,
      operationId: "synthetic-replayed-claim",
      nextStep: "Researching comparable sale prices",
    };
    const first = await fixture.t.mutation(queueWork.claimQueueWork, args);
    const replay = await fixture.t.mutation(queueWork.claimQueueWork, args);
    expect(replay.queue.version).toBe(first.queue.version);
  });

  it("leaves the Queue state to the person when the grant stops at writing", async () => {
    const fixture = await seedWorkspace({
      scopes: ["moving.context.read", "moving.work.write"],
    });
    const saved = await fixture.t.mutation(mcp.saveCompleteResult, {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
      operationId: "synthetic-complete-no-queue-grant",
      requestHash: "hash-1",
      resultKey: "bookshelf-value",
      title: "What the bookshelf is worth",
      summary: "Comparable sales put it near $180.",
      body: "Three comparable listings were checked.",
      relatedQueueItemId: fixture.queueItemId,
      completeQueueItem: true,
      reason: "Prove a work-write grant cannot close a handoff.",
    });
    // The work is saved and linked; only the transition is withheld.
    expect(saved.queue.transition).toBe("none");
    expect(saved.queue.note).toMatch(/moving\.queue\.work/);
    const item = await fixture.t.run((ctx) => ctx.db.get(fixture.queueItemId));
    expect(item?.state).toBe("waitingForAi");
  });

  it("saves the work and closes the handoff in one approval when the grant covers both", async () => {
    const fixture = await seedWorkspace({ scopes: [...movingScopes] });
    await fixture.t.mutation(queueWork.claimQueueWork, {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
      queueItemId: fixture.queueItemId,
      expectedVersion: 1,
      operationId: "synthetic-claim-before-complete",
      nextStep: "Researching comparable sale prices",
    });
    const saved = await fixture.t.mutation(mcp.saveCompleteResult, {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
      operationId: "synthetic-one-call-finish",
      requestHash: "hash-2",
      resultKey: "bookshelf-value",
      title: "What the bookshelf is worth",
      summary: "Comparable sales put it near $180.",
      body: "Three comparable listings were checked.",
      relatedQueueItemId: fixture.queueItemId,
      completeQueueItem: true,
      reason: "One approval should finish the job.",
    });
    expect(saved.queue.transition).toBe("done");
    const item = await fixture.t.run((ctx) => ctx.db.get(fixture.queueItemId));
    expect(item?.state).toBe("done");
    expect(item?.terminalReason).toBe("completed");
    // Attribution survives: the person can see which AI did this.
    expect(item?.resultRefs?.length).toBeGreaterThan(0);
  });
});

describe("archive as the destructive default", () => {
  it("archives reversibly and restores, reporting each record separately", async () => {
    const fixture = await seedWorkspace({ scopes: [...movingScopes] });
    const archived = await fixture.t.mutation(archive.archiveMoveRecords, {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
      operationId: "synthetic-archive-0001",
      action: "archive",
      records: [
        { kind: "item", id: String(fixture.itemId) },
        { kind: "item", id: String(fixture.queueItemId) },
      ],
      reason: "The bookshelf was double-counted.",
    });
    expect(archived.changed).toBe(1);
    // A batch that half-worked says so rather than discarding the half that did.
    expect(archived.results.map((r: any) => r.outcome)).toEqual([
      "changed",
      "notFound",
    ]);
    expect(archived.reversible).toBe(true);

    const restored = await fixture.t.mutation(archive.archiveMoveRecords, {
      principal: PRINCIPAL,
      moveId: fixture.moveId,
      operationId: "synthetic-restore-0001",
      action: "restore",
      records: [{ kind: "item", id: String(fixture.itemId) }],
      reason: "It was right the first time.",
    });
    expect(restored.changed).toBe(1);
    const item = await fixture.t.run((ctx) => ctx.db.get(fixture.itemId));
    expect(item?.deletedAt).toBeUndefined();
    expect(item?.status).toBe("active");
  });
});

describe("what the person can see afterwards", () => {
  it("records each use against the grant, and binds it to the first client", async () => {
    const fixture = await seedWorkspace({ scopes: ["moving.context.read"] });
    await fixture.t.mutation(grants.noteGrantUse, {
      subject: SUBJECT,
      toolName: "get_move_brief",
      scope: "moving.context.read",
      moveId: fixture.moveId,
      clientId: CLIENT_ID,
      clientName: "Synthetic chosen AI",
      registrationMethod: "dynamicClientRegistration",
    });
    const grant = (await fixture.t.run((ctx) =>
      ctx.db.get(fixture.grantId),
    )) as any;
    expect(grant?.useCount).toBe(1);
    expect(grant?.lastToolName).toBe("get_move_brief");
    expect(grant?.clientId).toBe(CLIENT_ID);
    expect(grant?.registrationMethod).toBe("dynamicClientRegistration");
    // The reported name is stored as a label, never as authority.
    expect(grant?.observedClientName).toBe("Synthetic chosen AI");

    const activity = await fixture.t.run((ctx) =>
      ctx.db
        .query("aiGrantActivities")
        .withIndex("by_grant_created", (q) => q.eq("grantId", fixture.grantId))
        .collect(),
    );
    const types = activity.map((row) => row.type);
    expect(types).toContain("clientBound");
    expect(types).toContain("scopeUsed");
    expect(activity.every((row) => row.message.length > 0)).toBe(true);
  });
});
