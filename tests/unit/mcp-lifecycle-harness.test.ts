// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- protocol envelopes and the convex-test ActionCtx bridge are intentionally synthetic. */

/**
 * The scripted Bring Your AI lifecycle, run end to end against the real MCP
 * handler with clearly marked synthetic records.
 *
 * This walks the nine steps the family standard requires, in order, and prints
 * an evidence matrix. Read the matrix honestly: this is **harness proof**. It
 * exercises the deployed code paths, not a real AI product. No named client —
 * Claude, ChatGPT, Codex, Grok, Hermes, or any other — may be described as
 * working on the strength of this file. Their rows stay Unknown until each one
 * completes this lifecycle itself, against the deployed endpoint, with a real
 * person's consent.
 *
 * What is deliberately *not* proved here, and needs the live run:
 *  - a real authorization server issuing a real token (this signs its own);
 *  - the storage host itself (the HTTP GET is stubbed; the URL under it is the
 *    product's real derivative/signed URL, and the budget, step-down, and
 *    skipped-with-reason contract is proved in
 *    `mcp-evidence-media-delivery.test.ts`);
 *  - any client's own OAuth, consent, or tool-refresh behaviour.
 */
import { createMcpHandler } from "@modelcontextprotocol/server";
import { convexTest } from "convex-test";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { api, internal } from "../../convex/_generated/api";
import { createMovingServer } from "../../convex/httpRoutes/mcp";
import {
  GRANT_BOUNDARY_VERSION,
  buildConsentSnapshot,
  movingScopes,
} from "../../convex/lib/aiGrants";
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
const ISSUER = "https://moving-lifecycle-test.clerk.accounts.dev";

/** Everything this harness creates carries this marker, so cleanup is exact. */
const SYNTHETIC_MARKER = "SYNTHETIC-MOV-WO-010";
const OWNER_SUBJECT = "user_synthetic_lifecycle_owner";
const STRANGER_SUBJECT = "user_synthetic_lifecycle_stranger";
const CLIENT_A = "synthetic-lifecycle-client-a";
const CLIENT_B = "synthetic-lifecycle-client-b";

const mcp = (internal as any).mcpPlanning;

const evidence: Array<{ step: string; result: string; proves: string }> = [];
function record(step: string, result: string, proves: string) {
  evidence.push({ step, result, proves });
}

function principalFor(subject: string, clientId: string) {
  return { issuer: ISSUER, subject, clientId, clientName: "Synthetic harness client" };
}

function modernRequest(
  method: string,
  params: Record<string, unknown> = {},
  name?: string,
) {
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
      id: `${method}-lifecycle`,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": {
            name: "moving-lifecycle-harness",
            version: "1",
          },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
}

async function seedLifecycle() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const makePerson = async (subject: string, name: string) => {
      const userId = await ctx.db.insert("users", {
        clerkUserId: subject,
        email: `${subject}@example.test`,
        name: `${SYNTHETIC_MARKER} ${name}`,
        appRole: "member",
        status: "active",
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      });
      const householdId = await ctx.db.insert("households", {
        name: `${SYNTHETIC_MARKER} ${name} household`,
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
        title: `${SYNTHETIC_MARKER} ${name} move`,
        type: "local",
        status: "planning",
        unitSystem: "imperial",
        createdByUserId: userId,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, householdId, moveId };
    };

    const owner = await makePerson(OWNER_SUBJECT, "owner");
    const stranger = await makePerson(STRANGER_SUBJECT, "stranger");

    const itemId = await ctx.db.insert("items", {
      householdId: owner.householdId,
      moveId: owner.moveId,
      name: `${SYNTHETIC_MARKER} dining table`,
      normalizedName: "synthetic dining table",
      quantity: 1,
      status: "active",
      condition: "good",
      disposition: "take",
      weightConfidence: "none",
      volumeConfidence: "none",
      fragility: "low",
      stackable: false,
      hazardousFlag: false,
      highValue: false,
      requiresPersonalTransport: false,
      planningDefaultKeys: [],
      needsReview: false,
      reviewFlags: [],
      aiTags: [],
      createdVia: "manual",
      createdByUserId: owner.userId,
      updatedByUserId: owner.userId,
      createdAt: now,
      updatedAt: now,
    });

    // Attached to the item on purpose: evidence is reachable because it was
    // attached to the work, never because it merely exists in the move.
    const photoId = await ctx.db.insert("itemPhotos", {
      householdId: owner.householdId,
      moveId: owner.moveId,
      itemId,
      documentationProfileTypes: [],
      originalStorageKey: "synthetic/lifecycle-table.webp",
      originalBucket: "synthetic-lifecycle-bucket",
      derivativeRefs: { card: "lifecycle-table-card.webp" },
      cloudflareImageId: "synthetic-lifecycle-image",
      derivativeStatus: "ready",
      mediaKind: "image",
      mimeType: "image/webp",
      sizeBytes: 128,
      caption: `${SYNTHETIC_MARKER} dining table condition`,
      photoType: "other",
      privacyLevel: "private",
      visibilityScope: "private",
      source: "manualUpload",
      exifHandlingStatus: "stripped",
      confidence: "manual",
      verificationStatus: "verified",
      aiProcessed: false,
      uploadedByUserId: owner.userId,
      createdAt: now,
      updatedAt: now,
    });

    const queueItemId = await ctx.db.insert("queueItems", {
      householdId: owner.householdId,
      moveId: owner.moveId,
      ownerUserId: owner.userId,
      createdByUserId: owner.userId,
      directive: `${SYNTHETIC_MARKER} value the dining table for the move`,
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

    return { owner, stranger, itemId, photoId, queueItemId };
  });
  return { t, ...ids };
}

async function approveGrant(
  fixture: Awaited<ReturnType<typeof seedLifecycle>>,
  clientId: string | undefined,
) {
  return fixture.t.run(async (ctx) => {
    const now = Date.now();
    return ctx.db.insert("aiGrants", {
      ownerUserId: fixture.owner.userId,
      householdId: fixture.owner.householdId,
      label: `${SYNTHETIC_MARKER} connection`,
      clientId,
      scopes: [...movingScopes],
      moveScope: "selectedMoves",
      moveIds: [fixture.owner.moveId],
      status: "active",
      consentBoundaryVersion: GRANT_BOUNDARY_VERSION,
      consentSnapshot: buildConsentSnapshot([...movingScopes]),
      expiresAt: now + 30 * 24 * 60 * 60 * 1_000,
      approvedAt: now,
      useCount: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  });
}

function handlerFor(
  fixture: Awaited<ReturnType<typeof seedLifecycle>>,
  subject: string,
  clientId: string,
  scopes = [...movingScopes],
) {
  const actionCtx = {
    runQuery: (ref: any, args: any) => fixture.t.query(ref, args),
    runMutation: (ref: any, args: any) => fixture.t.mutation(ref, args),
    runAction: (ref: any, args: any) => fixture.t.action(ref, args),
  } as any;
  return createMcpHandler(
    () =>
      createMovingServer(actionCtx, principalFor(subject, clientId), scopes).server,
    { legacy: "stateless", responseMode: "json" },
  );
}

async function callTool(handler: any, name: string, args: Record<string, unknown>) {
  const response = await handler.fetch(
    modernRequest("tools/call", { name, arguments: args }, name),
  );
  return ((await response.json()) as any).result;
}

beforeEach(() => {
  process.env.CLERK_JWT_ISSUER_DOMAIN = ISSUER;
  // A delivery base so a display URL can be built without a network call. The
  // bytes behind it are stubbed per test; the real bucket stays an external step.
  process.env.CLOUDFLARE_IMAGE_DELIVERY_URL = "https://synthetic-delivery.test";
});

afterAll(() => {
  const rows = evidence
    .map((row) => `| ${row.step} | ${row.result} | ${row.proves} |`)
    .join("\n");
  console.log(
    [
      "",
      "Bring Your AI lifecycle — harness evidence matrix",
      `Boundary version: ${GRANT_BOUNDARY_VERSION}`,
      "",
      "| Step | Result | What it proves |",
      "|---|---|---|",
      rows,
      "",
      "HARNESS PROOF ONLY. No named AI product is proved by this run. Every",
      "client remains Unknown until it completes this lifecycle itself against",
      "the deployed endpoint.",
      "",
    ].join("\n"),
  );
});

describe("Bring Your AI lifecycle (synthetic, marked, reversible)", () => {
  it("1. refuses an unauthorized caller before anything else", async () => {
    const fixture = await seedLifecycle();
    // No grant approved yet. A verified sign-in reaches nothing.
    const handler = handlerFor(fixture, OWNER_SUBJECT, CLIENT_A, []);
    const listed = await handler.fetch(modernRequest("tools/list"));
    const names = ((await listed.json()) as any).result.tools.map((t: any) => t.name);
    expect(names).toEqual(["describe_connection"]);
    await handler.close();
    record(
      "1. Discover without authority",
      "Refused",
      "Signing in lists no product tools; only the self-describing tool appears",
    );
  });

  it("2. lists exactly the tools the approved grant covers", async () => {
    const fixture = await seedLifecycle();
    await approveGrant(fixture, CLIENT_A);
    const handler = handlerFor(fixture, OWNER_SUBJECT, CLIENT_A, [
      "moving.context.read",
      "moving.queue.work",
    ]);
    const listed = await handler.fetch(modernRequest("tools/list"));
    const names: string[] = ((await listed.json()) as any).result.tools.map(
      (t: any) => t.name,
    );
    expect(names).toContain("get_move_brief");
    expect(names).toContain("list_queue_work");
    expect(names).not.toContain("save_inventory");
    expect(names).not.toContain("archive_move_records");
    await handler.close();
    record(
      "2. Consent and tool list",
      "Exact",
      "The catalog matches the approved scopes; nothing unapproved is advertised",
    );
  });

  it("3. reads only the move the person selected", async () => {
    const fixture = await seedLifecycle();
    await approveGrant(fixture, CLIENT_A);
    const brief = await fixture.t.query(mcp.getMoveBrief, {
      principal: principalFor(OWNER_SUBJECT, CLIENT_A),
      moveId: fixture.owner.moveId,
    });
    expect(brief.move.moveId).toBe(fixture.owner.moveId);
    expect(JSON.stringify(brief)).not.toContain(STRANGER_SUBJECT);
    record(
      "3. Bounded read",
      "Scoped",
      "One selected move, with no trace of another owner in the payload",
    );
  });

  it("4. returns private evidence as bytes, scoped to what it is attached to", async () => {
    const fixture = await seedLifecycle();
    await approveGrant(fixture, CLIENT_A);
    const originalFetch = globalThis.fetch;
    // Only the storage host is stubbed; the URL it answers is the one the
    // product built. A realistic payload rather than four bytes, so the budget
    // accounting in the result is meaningful.
    globalThis.fetch = (async () =>
      new Response(new Uint8Array(48_000), {
        headers: {
          "content-type": "image/webp",
          "content-length": "48000",
        },
      })) as typeof fetch;
    try {
      const result = await fixture.t.action(api.mcpToolsImages.getImages, {
        caller: { subject: OWNER_SUBJECT },
        householdId: fixture.owner.householdId,
        moveId: fixture.owner.moveId,
        filter: { itemId: fixture.itemId },
        limit: 4,
        variant: "card",
      });
      const blocks = result.__mcpContent;
      const images = blocks.filter((b: any) => b.type === "image");
      expect(images).toHaveLength(1);
      expect(typeof (images[0] as any).data).toBe("string");
      expect((images[0] as any).mimeType).toBe("image/webp");
      // No storage URL ever crosses the boundary, under any scope.
      expect(JSON.stringify(blocks)).not.toContain("synthetic-lifecycle-bucket");
      // Delivery is budgeted and accounts for itself, so a batch that cannot
      // fit reports what it left out instead of failing the call.
      const summary = JSON.parse(
        String((blocks.find((b: any) => b.type === "text") as any).text),
      );
      expect(summary.images[0].bytes).toBe(48_000);
      expect(summary.budget.batchLimitBytes).toBeGreaterThan(0);
      expect(summary.skipped).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
    record(
      "4. Protected evidence",
      "Bytes returned",
      "Private media arrives inline, scoped to the item it is attached to, within a budget that accounts for itself, with no storage link",
    );
  });

  it("5. refuses a stranger reaching for this move", async () => {
    const fixture = await seedLifecycle();
    await approveGrant(fixture, CLIENT_A);
    let refused = false;
    try {
      await fixture.t.query(mcp.getMoveBrief, {
        principal: principalFor(STRANGER_SUBJECT, CLIENT_A),
        moveId: fixture.owner.moveId,
      });
    } catch (error) {
      refused = true;
      // The refusal must not confirm the move exists or name its owner.
      expect(String((error as any).data ?? error)).not.toContain(OWNER_SUBJECT);
    }
    expect(refused).toBe(true);
    record(
      "5. Cross-owner refusal",
      "Refused",
      "Another person's grant and move are unreachable, and the refusal leaks nothing",
    );
  });

  it("6. runs the Queue loop and saves the result in one approval", async () => {
    const fixture = await seedLifecycle();
    await approveGrant(fixture, CLIENT_A);
    const handler = handlerFor(fixture, OWNER_SUBJECT, CLIENT_A);

    const listed = await callTool(handler, "list_queue_work", {
      moveId: String(fixture.owner.moveId),
    });
    const work = listed.structuredContent.work;
    expect(work).toHaveLength(1);

    const claimed = await callTool(handler, "claim_queue_work", {
      moveId: String(fixture.owner.moveId),
      queueItemId: String(fixture.queueItemId),
      expectedVersion: work[0].claimWith.expectedVersion,
      operationId: "synthetic-lifecycle-claim-0001",
      nextStep: "Checking comparable dining table sales",
    });
    expect(claimed.structuredContent.queue.state).toBe("working");

    const saved = await callTool(handler, "save_complete_result", {
      moveId: String(fixture.owner.moveId),
      operationId: "synthetic-lifecycle-result-0001",
      resultKey: "synthetic-dining-table-value",
      title: `${SYNTHETIC_MARKER} dining table value`,
      summary: "Three comparable sales put it between $220 and $280.",
      body: "Checked three local listings; two were gated and recorded as such.",
      relatedQueueItemId: String(fixture.queueItemId),
      completeQueueItem: true,
      reason: "Finish the handoff the person left.",
    });
    expect(saved.structuredContent.queue.transition).toBe("done");

    // Replay the identical call: a retry must correct, never duplicate.
    const replay = await callTool(handler, "save_complete_result", {
      moveId: String(fixture.owner.moveId),
      operationId: "synthetic-lifecycle-result-0001",
      resultKey: "synthetic-dining-table-value",
      title: `${SYNTHETIC_MARKER} dining table value`,
      summary: "Three comparable sales put it between $220 and $280.",
      body: "Checked three local listings; two were gated and recorded as such.",
      relatedQueueItemId: String(fixture.queueItemId),
      completeQueueItem: true,
      reason: "Finish the handoff the person left.",
    });
    expect(replay.structuredContent.result.planningRecordId).toBe(
      saved.structuredContent.result.planningRecordId,
    );
    await handler.close();
    record(
      "6. Work, save, and finish",
      "One approval",
      "Claim to Done with the result attached, and a replayed call corrects rather than duplicating",
    );
  });

  it("7. keeps two simultaneous clients isolated", async () => {
    const fixture = await seedLifecycle();
    // The person approved one connection. A second AI arriving with the same
    // sign-in holds nothing — authority is per connection, not per person.
    await approveGrant(fixture, CLIENT_A);
    const okay = await fixture.t.query(mcp.getMoveBrief, {
      principal: principalFor(OWNER_SUBJECT, CLIENT_A),
      moveId: fixture.owner.moveId,
    });
    expect(okay.move.moveId).toBe(fixture.owner.moveId);

    let refused = false;
    try {
      await fixture.t.query(mcp.getMoveBrief, {
        principal: principalFor(OWNER_SUBJECT, CLIENT_B),
        moveId: fixture.owner.moveId,
      });
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
    record(
      "7. Simultaneous clients",
      "Isolated",
      "A second AI on the same sign-in gets no authority from the first one's grant",
    );
  });

  it("8. refuses the next call after revocation, and recovers on reconnect", async () => {
    const fixture = await seedLifecycle();
    const grantId = await approveGrant(fixture, CLIENT_A);
    const before = handlerFor(fixture, OWNER_SUBJECT, CLIENT_A);
    const worked = await callTool(before, "get_move_brief", {
      moveId: String(fixture.owner.moveId),
    });
    expect(worked.isError).toBeFalsy();

    await fixture.t.run(async (ctx) => {
      await ctx.db.patch(grantId, { status: "revoked", revokedAt: Date.now() });
    });

    // Same live connection, same still-valid token, next call.
    const afterRevoke = await callTool(before, "get_move_brief", {
      moveId: String(fixture.owner.moveId),
    });
    expect(afterRevoke.isError).toBe(true);
    expect(afterRevoke.structuredContent.error.code).toBe("GRANT_REQUIRED");
    await before.close();

    // Reconnecting after a deployment: a fresh handler with a fresh grant
    // rebuilds the catalog, which is how a stale tool list recovers.
    const newGrantId = await approveGrant(fixture, CLIENT_A);
    expect(newGrantId).not.toBe(grantId);
    const reconnected = handlerFor(fixture, OWNER_SUBJECT, CLIENT_A);
    const listed = await reconnected.fetch(modernRequest("tools/list"));
    const names = ((await listed.json()) as any).result.tools.map((t: any) => t.name);
    expect(names).toContain("get_move_brief");
    const again = await callTool(reconnected, "get_move_brief", {
      moveId: String(fixture.owner.moveId),
    });
    expect(again.isError).toBeFalsy();
    await reconnected.close();

    // Attribution survives revocation: the person can still read what happened.
    const activity = await fixture.t.run((ctx) =>
      ctx.db
        .query("aiGrantActivities")
        .withIndex("by_grant_created", (q) => q.eq("grantId", grantId))
        .collect(),
    );
    expect(activity.length).toBeGreaterThan(0);
    record(
      "8. Revoke and reconnect",
      "Immediate",
      "The next call fails on a valid token; reconnecting rebuilds the catalog; past activity stays readable",
    );
  });

  it("9. removes every synthetic record, and a re-query proves it", async () => {
    const fixture = await seedLifecycle();
    await approveGrant(fixture, CLIENT_A);
    const handler = handlerFor(fixture, OWNER_SUBJECT, CLIENT_A);
    await callTool(handler, "save_inventory", {
      moveId: String(fixture.owner.moveId),
      operationId: "synthetic-lifecycle-inventory-0001",
      items: [{ createKey: "synthetic-lamp", name: `${SYNTHETIC_MARKER} lamp` }],
      reason: "Create something to clean up.",
    });
    await handler.close();

    const before = await fixture.t.run(async (ctx) => ({
      items: (await ctx.db.query("items").collect()).filter((row) =>
        row.name.includes(SYNTHETIC_MARKER),
      ).length,
      grants: (await ctx.db.query("aiGrants").collect()).length,
      operations: (await ctx.db.query("mcpOperations").collect()).length,
    }));
    expect(before.items).toBeGreaterThan(1);
    expect(before.grants).toBeGreaterThan(0);
    expect(before.operations).toBeGreaterThan(0);

    // Cleanup is exact because everything carries the marker. Nothing here
    // touches a record that was not created by this run.
    await fixture.t.run(async (ctx) => {
      for (const table of [
        "items",
        "itemPhotos",
        "queueItems",
        "queueActivities",
        "movePlanningRecords",
        "mcpOperations",
        "aiGrantActivities",
        "aiGrants",
        "moves",
        "householdMemberships",
        "households",
        "users",
      ] as const) {
        for (const row of await ctx.db.query(table).collect()) {
          await ctx.db.delete(row._id);
        }
      }
    });

    const after = await fixture.t.run(async (ctx) => ({
      items: (await ctx.db.query("items").collect()).length,
      grants: (await ctx.db.query("aiGrants").collect()).length,
      activity: (await ctx.db.query("aiGrantActivities").collect()).length,
      operations: (await ctx.db.query("mcpOperations").collect()).length,
      queue: (await ctx.db.query("queueItems").collect()).length,
      users: (await ctx.db.query("users").collect()).length,
    }));
    expect(after).toEqual({
      items: 0,
      grants: 0,
      activity: 0,
      operations: 0,
      queue: 0,
      users: 0,
    });
    record(
      "9. Cleanup",
      "Verified empty",
      "Every marked synthetic record, grant, receipt, and identity is gone, proved by re-query",
    );
  });

  it("records that this is harness proof and nothing more", () => {
    // A guard against the failure mode this whole Work Order exists to prevent:
    // a successful harness run being read as a working named client.
    record(
      "Client claims",
      "Unknown",
      "No named AI product completed this lifecycle; every client stays Unknown",
    );
    expect(evidence.length).toBeGreaterThan(8);
  });
});
