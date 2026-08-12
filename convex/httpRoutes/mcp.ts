/**
 * Stateless dual-era remote MCP endpoint and Moving-native workflow tools.
 *
 * The canonical /mcp resource uses the MCP 2026-07-28 request model with the
 * SDK's stateless 2025 compatibility mode. The older persisted gateway remains
 * mounted separately at /mcp/legacy for existing /mcp/connect clients.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Convex's generated API cannot include this new module until deployment codegen; casts stay at the transport boundary. */
import {
  McpServer,
  createMcpHandler,
  type AuthInfo,
} from "@modelcontextprotocol/server";
import { errors as joseErrors, createRemoteJWKSet, jwtVerify } from "jose";
import type { HttpRouter } from "convex/server";
import { z } from "zod";

import { api, internal } from "../_generated/api";
import { httpAction, type ActionCtx } from "../_generated/server";

export const STATELESS_MOVING_TOOL_NAMES = [
  "get_move_brief",
  "search_move_records",
  "get_move_records",
  "get_evidence_media",
  "save_move_context",
  "save_inventory",
  "save_planning_record",
  "save_complete_result",
] as const;

const SERVER_NAME = "movingmanifest";
const SERVER_VERSION = "0.4.0";
const MAX_MCP_REQUEST_BYTES = 512 * 1024;
const mcpQueries = (internal as any).mcpPlanning;
const mcpMutations = (internal as any).mcpPlanning;

type VerifiedPrincipal = {
  issuer: string;
  subject: string;
  clientId: string;
  clientName?: string;
};

function requiredUrl(name: string) {
  const raw =
    process.env[name]?.trim() ||
    (name === "MCP_RESOURCE_URL"
      ? "https://movingmanifest.com/mcp"
      : undefined);
  if (!raw) throw new Error(`Missing ${name}.`);
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error(`${name} must be HTTPS.`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must not contain credentials, query, or fragment.`);
  }
  if (name === "MCP_RESOURCE_URL" && url.pathname !== "/mcp") {
    throw new Error("MCP_RESOURCE_URL must identify the canonical /mcp resource.");
  }
  if (name === "CLERK_JWT_ISSUER_DOMAIN" && url.pathname !== "/") {
    throw new Error("CLERK_JWT_ISSUER_DOMAIN must be an issuer origin.");
  }
  return url;
}

function resourceMetadataUrl(resource: URL) {
  return new URL(
    `/.well-known/oauth-protected-resource${resource.pathname}`,
    resource.origin,
  ).toString();
}

function challenge(
  resource: URL,
  code = "invalid_token",
  description = "A valid MovingManifest OAuth token is required.",
) {
  const metadata = resourceMetadataUrl(resource);
  return new Response(
    JSON.stringify({ error: code, error_description: description }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "WWW-Authenticate": `Bearer realm="movingmanifest", error="${code}", error_description="${description}", resource_metadata="${metadata}"`,
      },
    },
  );
}

function protectedResourceMetadata(resource: URL, issuer: URL) {
  return new Response(
    JSON.stringify({
      resource: resource.toString(),
      resource_name: "MovingManifest",
      authorization_servers: [issuer.toString().replace(/\/$/, "")],
      scopes_supported: ["openid", "profile", "email"],
      bearer_methods_supported: ["header"],
      resource_documentation: new URL("/ai", resource.origin).toString(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

let jwksCache: {
  issuer: string;
  value: ReturnType<typeof createRemoteJWKSet>;
} | null = null;

function jwksFor(issuer: URL) {
  const normalized = issuer.toString().replace(/\/$/, "");
  if (!jwksCache || jwksCache.issuer !== normalized) {
    jwksCache = {
      issuer: normalized,
      value: createRemoteJWKSet(new URL("/.well-known/jwks.json", `${normalized}/`)),
    };
  }
  return jwksCache.value;
}

async function verifyOAuth(
  request: Request,
  resource: URL,
  issuer: URL,
): Promise<AuthInfo | Response> {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  if (!match) return challenge(resource);
  try {
    const result = await jwtVerify(match[1], jwksFor(issuer), {
      issuer: issuer.toString().replace(/\/$/, ""),
      audience: resource.toString(),
    });
    if (
      result.protectedHeader.typ !== "at+jwt" &&
      result.protectedHeader.typ !== "application/at+jwt"
    ) {
      throw new Error("Bearer is not an OAuth access token.");
    }
    const subject = result.payload.sub;
    if (!subject || !result.payload.exp) {
      throw new Error("Missing OAuth subject or expiry.");
    }
    const clientId =
      typeof result.payload.azp === "string"
        ? result.payload.azp
        : typeof result.payload.client_id === "string"
          ? result.payload.client_id
          : null;
    if (!clientId) throw new Error("Missing OAuth client identifier.");
    if (clientId.length > 160) throw new Error("OAuth client identifier is too long.");
    const scopeValue = result.payload.scope ?? result.payload.scp;
    const scopes = Array.isArray(scopeValue)
      ? scopeValue.filter((item): item is string => typeof item === "string")
      : typeof scopeValue === "string"
        ? scopeValue.split(/\s+/).filter(Boolean)
        : [];
    return {
      token: match[1],
      clientId,
      scopes,
      expiresAt: result.payload.exp,
      resource,
      extra: {
        issuer: issuer.toString().replace(/\/$/, ""),
        subject,
      },
    };
  } catch (error) {
    const description =
      error instanceof joseErrors.JWTExpired
        ? "The MovingManifest OAuth token expired."
        : "The MovingManifest OAuth token is invalid for this resource.";
    return challenge(resource, "invalid_token", description);
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toolResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function toolError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  let payload: Record<string, unknown> = {
    code: "INTERNAL_ERROR",
    message: "MovingManifest could not complete the MCP operation.",
    recovery: "Retry once with the same operationId, then report the receipt.",
  };
  const marker = "MCP_MOVING_ERROR:";
  const index = raw.indexOf(marker);
  if (index >= 0) {
    try {
      payload = JSON.parse(raw.slice(index + marker.length));
    } catch {
      // Retain the stable fallback rather than exposing a framework error.
    }
  }
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: { error: payload },
  };
}

const id = z.string().min(1).max(100);
const operationId = z.string().min(8).max(160);
const reason = z.string().trim().min(3).max(500);
const confidence = z.enum(["none", "low", "medium", "high", "manual", "actual"]);
const sourceStatus = z.enum(["checked", "blocked", "gated", "failed", "notRelevant"]);
const recordStatus = z.enum([
  "draft",
  "current",
  "needsReview",
  "confirmed",
  "superseded",
  "blocked",
  "failed",
  "notRelevant",
]);
const recordKind = z.enum(["decision", "estimate", "planResult", "sourceCheck"]);
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const nullableNonnegative = z.number().finite().min(0).nullable().optional();

const relatedSchema = {
  relatedItemIds: z.array(id).max(50).optional(),
  relatedBoxIds: z.array(id).max(50).optional(),
  relatedSpaceIds: z.array(id).max(50).optional(),
  relatedQueueItemId: id.optional(),
};

const planningRecordSchema = z
  .object({
    planningRecordId: id.optional(),
    expectedVersion: z.number().int().min(1).optional(),
    stableKey: z.string().trim().min(1).max(160),
    kind: recordKind,
    title: z.string().trim().min(1).max(240),
    summary: z.string().trim().min(1).max(2_000),
    details: z.string().trim().max(8_000).optional(),
    status: recordStatus.optional(),
    confidence: confidence.optional(),
    decision: z.string().trim().max(2_000).optional(),
    alternatives: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
    rationale: z.string().trim().max(4_000).optional(),
    estimateMetric: z.string().trim().max(160).optional(),
    estimateLow: z.number().finite().optional(),
    estimateValue: z.number().finite().optional(),
    estimateHigh: z.number().finite().optional(),
    estimateUnit: z.string().trim().max(80).optional(),
    estimateCurrency: z.string().trim().max(12).optional(),
    assumptions: z.array(z.string().trim().min(1).max(500)).max(30).optional(),
    sectionKey: z.string().trim().max(160).optional(),
    body: z.string().trim().max(20_000).optional(),
    sourceTitle: z.string().trim().max(500).optional(),
    sourceUrl: z.url().max(2_000).optional(),
    sourcePublisher: z.string().trim().max(240).optional(),
    sourceStatus: sourceStatus.optional(),
    checkedAt: z.number().int().positive().optional(),
    ...relatedSchema,
  })
  .strict();

const sourceCheckSchema = z
  .object({
    stableKey: z.string().trim().min(1).max(160),
    title: z.string().trim().min(1).max(500),
    summary: z.string().trim().min(1).max(2_000),
    details: z.string().trim().max(8_000).optional(),
    status: sourceStatus,
    url: z.url().max(2_000).optional(),
    publisher: z.string().trim().max(240).optional(),
    checkedAt: z.number().int().positive().optional(),
    relatedItemIds: z.array(id).max(50).optional(),
    relatedBoxIds: z.array(id).max(50).optional(),
    relatedSpaceIds: z.array(id).max(50).optional(),
  })
  .strict();

const itemSchema = z
  .object({
    itemId: id.optional(),
    createKey: z.string().trim().min(1).max(160).optional(),
    expectedUpdatedAt: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(240).optional(),
    room: nullableText(240),
    destinationRoom: nullableText(240),
    category: nullableText(160),
    subcategory: nullableText(160),
    description: nullableText(4_000),
    quantity: z.number().int().min(1).max(100_000).optional(),
    condition: z.enum(["unknown", "new", "excellent", "good", "fair", "poor", "damaged"]).optional(),
    disposition: z.enum(["undecided", "take", "sell", "donate", "dump", "free", "storage", "mover", "personalTransport"]).optional(),
    status: z.enum(["draft", "active", "packed", "staged", "loaded", "delivered", "missing", "damaged"]).optional(),
    fragility: z.enum(["low", "medium", "high"]).optional(),
    highValue: z.boolean().optional(),
    needsReview: z.boolean().optional(),
    reviewFlags: z.array(z.string().trim().min(1).max(240)).max(30).optional(),
    estimatedWeightLb: nullableNonnegative,
    estimatedWeightLowLb: nullableNonnegative,
    estimatedWeightHighLb: nullableNonnegative,
    actualWeightLb: nullableNonnegative,
    estimatedVolumeCuFt: nullableNonnegative,
    estimatedPackedVolumeCuFt: nullableNonnegative,
    weightConfidence: confidence.optional(),
    volumeConfidence: confidence.optional(),
    valueCents: nullableNonnegative,
    replacementValueCents: nullableNonnegative,
    researchSummary: nullableText(4_000),
    researchNotes: nullableText(4_000),
    researchConfidence: confidence.optional(),
    researchSources: z
      .array(
        z
          .object({
            title: z.string().trim().max(500).optional(),
            url: z.url().max(2_000).optional(),
            summary: z.string().trim().max(1_000).optional(),
            status: z.enum(["used", "checked", "blocked", "gated", "failed", "notRelevant"]).optional(),
            checkedAt: z.number().int().positive().optional(),
          })
          .strict(),
      )
      .max(30)
      .optional(),
  })
  .strict()
  .refine((value) => Boolean(value.itemId) !== Boolean(value.createKey), {
    message: "Use exactly one of itemId or createKey.",
  })
  .refine((value) => Boolean(value.itemId) || Boolean(value.name), {
    message: "New inventory rows require name.",
  })
  .refine((value) => !value.itemId || value.expectedUpdatedAt !== undefined, {
    message: "Inventory corrections require expectedUpdatedAt.",
  });

const spaceSchema = z
  .object({
    spaceId: id.optional(),
    expectedUpdatedAt: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(200),
    kind: z.enum(["originRoom", "destinationRoom", "yardOutdoor", "storage", "custom"]).optional(),
    floorLevel: nullableText(120),
    notes: nullableText(2_000),
  })
  .strict()
  .refine((value) => !value.spaceId || value.expectedUpdatedAt !== undefined, {
    message: "Space corrections require expectedUpdatedAt.",
  });

export function createMovingServer(
  actionCtx: ActionCtx,
  principal: VerifiedPrincipal,
) {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions: [
        "Call get_move_brief first and use only returned move and record IDs.",
        "Search before creating duplicates; hydrate only the records needed for the work.",
        "Use get_evidence_media for private photos rather than normal web fetch.",
        "Use save_complete_result for a normal finished workflow and granular save tools for corrections.",
        "Record blocked, gated, failed, and not-relevant sources honestly.",
        "This OAuth surface does not claim or complete canonical Queue work until Moving has a distinct chosen-AI grant.",
      ].join(" "),
    },
  );

  server.registerTool(
    "get_move_brief",
    {
      title: "Get Move Brief",
      description:
        "FIRST CALL. Return the signed-in person's bounded accessible move list, or one move's route, spaces, counts, attention, planning records, and Queue summaries. Identity and workspace are derived server-side.",
      inputSchema: z.object({ moveId: id.optional() }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ moveId }) => {
      try {
        return toolResult(
          await actionCtx.runQuery(mcpQueries.getMoveBrief, {
            principal,
            moveId: moveId as any,
          }),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "search_move_records",
    {
      title: "Search Move records",
      description:
        "Search bounded move inventory, boxes, spaces, decisions, estimates, plan results, source checks, and the person's Queue. Use filters and cursor instead of asking for a raw move dump.",
      inputSchema: z
        .object({
          moveId: id,
          query: z.string().trim().min(1).max(240).optional(),
          kinds: z
            .array(z.enum(["item", "box", "space", "decision", "estimate", "planResult", "sourceCheck", "queue"]))
            .min(1)
            .max(8)
            .optional(),
          limit: z.number().int().min(1).max(50).default(25),
          cursor: z.string().max(80).optional(),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        return toolResult(
          await actionCtx.runQuery(mcpQueries.searchMoveRecords, {
            ...input,
            principal,
            moveId: input.moveId as any,
          }),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_move_records",
    {
      title: "Get Move records",
      description:
        "Hydrate up to 25 selected move records with permission-filtered detail. Prefer this batch read after search instead of repeatedly fetching one record at a time.",
      inputSchema: z
        .object({
          moveId: id,
          records: z
            .array(
              z
                .object({
                  kind: z.enum(["item", "box", "space", "decision", "estimate", "planResult", "sourceCheck", "queue", "photo"]),
                  id,
                })
                .strict(),
            )
            .min(1)
            .max(25),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        return toolResult(
          await actionCtx.runQuery(mcpQueries.getMoveRecords, {
            principal,
            moveId: input.moveId as any,
            records: input.records,
          }),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_evidence_media",
    {
      title: "Get evidence media",
      description:
        "Return private move photos as native inline image blocks. Filter by explicit photo IDs or one item, box, space, transport, zone, room, or the move. Use detail/full only when fine print matters.",
      inputSchema: z
        .object({
          moveId: id,
          filter: z
            .object({
              photoIds: z.array(id).min(1).max(8).optional(),
              itemId: id.optional(),
              boxId: id.optional(),
              spaceId: id.optional(),
              transportId: id.optional(),
              transportZoneId: id.optional(),
              room: z.string().trim().min(1).max(240).optional(),
              all: z.literal(true).optional(),
            })
            .strict(),
          limit: z.number().int().min(1).max(8).default(6),
          variant: z.enum(["thumb", "card", "detail", "full"]).default("card"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        const scope = await actionCtx.runQuery(mcpQueries.resolveMoveScope, {
          principal,
          moveId: input.moveId as any,
        });
        const result = await actionCtx.runAction((api as any).mcpToolsImages.getImages, {
          caller: { subject: principal.subject },
          householdId: scope.householdId,
          moveId: input.moveId,
          filter: input.filter,
          limit: input.limit,
          variant: input.variant,
        });
        return { content: result.__mcpContent };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "save_move_context",
    {
      title: "Save Move context",
      description:
        "Optimistically update move route/timing/notes and upsert durable rooms or locations in one replay-safe operation. Omitted fields stay unchanged; null clears supported optional fields.",
      inputSchema: z
        .object({
          moveId: id,
          operationId,
          expectedUpdatedAt: z.number().int().positive().optional(),
          patch: z
            .object({
              title: z.string().trim().min(1).max(240).optional(),
              status: z.enum(["planning", "active", "completed"]).optional(),
              origin: nullableText(500),
              destination: nullableText(500),
              dateStart: nullableText(40),
              dateEnd: nullableText(40),
              distanceMiles: nullableNonnegative,
              travelMinutes: nullableNonnegative,
              notes: nullableText(8_000),
            })
            .strict(),
          spaces: z.array(spaceSchema).max(100).optional(),
          reason,
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        const requestHash = await sha256({ tool: "save_move_context", ...input, operationId: undefined });
        return toolResult(
          await actionCtx.runMutation(mcpMutations.saveMoveContext, {
            ...input,
            principal,
            requestHash,
            moveId: input.moveId as any,
            spaces: input.spaces as any,
          }),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "save_inventory",
    {
      title: "Save inventory",
      description:
        "Create replay-safe inventory rows or optimistically correct existing items in a bounded batch. Preserve estimates, confidence, review flags, and item-level source provenance.",
      inputSchema: z
        .object({
          moveId: id,
          operationId,
          items: z.array(itemSchema).min(1).max(100),
          reason,
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        const requestHash = await sha256({ tool: "save_inventory", ...input, operationId: undefined });
        return toolResult(
          await actionCtx.runMutation(mcpMutations.saveInventory, {
            ...input,
            principal,
            requestHash,
            moveId: input.moveId as any,
            items: input.items as any,
          }),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "save_planning_record",
    {
      title: "Save planning record",
      description:
        "Create or optimistically correct one durable decision, estimate, readable plan result, or source check. Stable keys make retries update instead of duplicate.",
      inputSchema: z
        .object({
          moveId: id,
          operationId,
          record: planningRecordSchema,
          reason,
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        const requestHash = await sha256({ tool: "save_planning_record", ...input, operationId: undefined });
        return toolResult(
          await actionCtx.runMutation(mcpMutations.savePlanningRecord, {
            ...input,
            principal,
            requestHash,
            moveId: input.moveId as any,
            record: input.record as any,
          }),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "save_complete_result",
    {
      title: "Save complete Move result",
      description:
        "Preferred happy path. Atomically save one readable planning result plus bounded inventory, locations, decisions, estimates, plan sections, and honest source checks in one approval and one replay-safe operation.",
      inputSchema: z
        .object({
          moveId: id,
          operationId,
          resultKey: z.string().trim().min(1).max(160),
          title: z.string().trim().min(1).max(240),
          summary: z.string().trim().min(1).max(2_000),
          body: z.string().trim().min(1).max(20_000),
          status: recordStatus.optional(),
          confidence: confidence.optional(),
          items: z.array(itemSchema).max(100).optional(),
          spaces: z.array(spaceSchema).max(100).optional(),
          decisions: z.array(planningRecordSchema).max(30).optional(),
          estimates: z.array(planningRecordSchema).max(30).optional(),
          planSections: z.array(planningRecordSchema).max(30).optional(),
          sourceChecks: z.array(sourceCheckSchema).max(30).optional(),
          relatedQueueItemId: id.optional(),
          reason,
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        const requestHash = await sha256({ tool: "save_complete_result", ...input, operationId: undefined });
        return toolResult(
          await actionCtx.runMutation(mcpMutations.saveCompleteResult, {
            ...input,
            principal,
            requestHash,
            moveId: input.moveId as any,
            items: input.items as any,
            spaces: input.spaces as any,
            decisions: input.decisions as any,
            estimates: input.estimates as any,
            planSections: input.planSections as any,
            sourceChecks: input.sourceChecks as any,
            relatedQueueItemId: input.relatedQueueItemId as any,
          }),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

async function handleMcp(actionCtx: ActionCtx, request: Request) {
  const resource = requiredUrl("MCP_RESOURCE_URL");
  const issuer = requiredUrl("CLERK_JWT_ISSUER_DOMAIN");
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization,content-type,mcp-protocol-version,mcp-method,mcp-name",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      },
    });
  }
  if (url.pathname === "/.well-known/oauth-protected-resource/mcp") {
    return request.method === "GET"
      ? protectedResourceMetadata(resource, issuer)
      : new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
  }
  if (url.pathname !== "/mcp") return new Response("Not found", { status: 404 });
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST,OPTIONS" },
    });
  }
  const auth = await verifyOAuth(request, resource, issuer);
  if (auth instanceof Response) return auth;
  const subject = auth.extra?.subject;
  const principalIssuer = auth.extra?.issuer;
  if (typeof subject !== "string" || typeof principalIssuer !== "string") {
    return challenge(resource);
  }
  if ((await request.clone().arrayBuffer()).byteLength > MAX_MCP_REQUEST_BYTES) {
    return new Response(
      JSON.stringify({
        error: "request_too_large",
        error_description: "MovingManifest MCP requests are limited to 512 KiB.",
      }),
      {
        status: 413,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      },
    );
  }
  const clientName = request.headers.get("mcp-client-name")?.slice(0, 160) || undefined;
  const handler = createMcpHandler(
    () =>
      createMovingServer(actionCtx, {
        issuer: principalIssuer,
        subject,
        clientId: auth.clientId,
        clientName,
      }).server,
    {
      legacy: "stateless",
      responseMode: "json",
      onerror: (error) => console.error("[MCP] Protocol error", error),
    },
  );
  return await handler.fetch(request, { authInfo: auth });
}

export function registerMcpRoutes(http: HttpRouter) {
  http.route({ path: "/mcp", method: "POST", handler: httpAction(handleMcp) });
  http.route({ path: "/mcp", method: "OPTIONS", handler: httpAction(handleMcp) });
  http.route({
    path: "/.well-known/oauth-protected-resource/mcp",
    method: "GET",
    handler: httpAction(handleMcp),
  });
  http.route({
    path: "/.well-known/oauth-protected-resource/mcp",
    method: "OPTIONS",
    handler: httpAction(handleMcp),
  });
}
