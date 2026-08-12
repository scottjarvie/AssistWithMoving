// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- protocol envelopes and the convex-test ActionCtx bridge are intentionally synthetic. */

import { createMcpHandler } from "@modelcontextprotocol/server";
import { convexTest } from "convex-test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { api, internal } from "../../convex/_generated/api";
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
    return {
      userId,
      householdId,
      moveId,
      guestUserId,
      privatePhotoId,
      foreignQueueItemId,
    };
  });
  return { t, ...ids };
}

describe("stateless Moving MCP foundation", () => {
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

  it("accepts only issuer-signed, resource-bound access tokens", async () => {
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
      const sign = (audience: string, expiresAt: number) =>
        new SignJWT({ scope: "openid profile", azp: PRINCIPAL.clientId })
          .setProtectedHeader({ alg: "RS256", kid: "moving-mcp-proof-key", typ: "at+jwt" })
          .setIssuer(ISSUER)
          .setSubject(SUBJECT)
          .setAudience(audience)
          .setIssuedAt()
          .setExpirationTime(expiresAt)
          .sign(privateKey);
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
          expect(await accepted.text()).toContain("get_move_brief");

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
      expect(created.queue).toBeNull();
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

      const hiddenPhotos = await fixture.t.query(api.mcpToolsImages.mcpResolvePhotos, {
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
      expect(crossClientDenied.structuredContent.error.code).toBe("FORBIDDEN");
      await otherClient.close();
      await handler.close();
    } finally {
      if (previousIssuer === undefined) delete process.env.CLERK_JWT_ISSUER_DOMAIN;
      else process.env.CLERK_JWT_ISSUER_DOMAIN = previousIssuer;
    }
  });
});
