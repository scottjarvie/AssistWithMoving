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

import { internal } from "../_generated/api";
import { httpAction, type ActionCtx } from "../_generated/server";
import {
  GRANT_BOUNDARY_VERSION,
  NEVER_PERMITTED,
  movingScopes,
  scopeForTool,
  type MovingScope,
} from "../lib/aiGrants";
import {
  ClientIdentityError,
  resolveClientIdentity,
  type ResolvedClientIdentity,
} from "../lib/mcpClientIdentity";

/**
 * The canonical catalog. A tool appears to a connected AI only when the
 * person's current grant includes its scope, so `tools/list` never advertises
 * a capability nobody approved.
 */
export const STATELESS_MOVING_TOOL_NAMES = [
  "describe_connection",
  "get_move_brief",
  "search_move_records",
  "get_move_records",
  "get_evidence_media",
  "save_move_context",
  "save_inventory",
  "save_planning_record",
  "save_complete_result",
  "list_queue_work",
  "claim_queue_work",
  "release_queue_work",
  "ask_queue_question",
  "complete_queue_work",
  "archive_move_records",
] as const;

const SERVER_NAME = "assistwithmoving";
const SERVER_VERSION = "0.4.0";
const MAX_MCP_REQUEST_BYTES = 512 * 1024;
const mcpQueries = (internal as any).mcpPlanning;
const mcpMutations = (internal as any).mcpPlanning;

type VerifiedPrincipal = {
  issuer: string;
  subject: string;
  clientId: string;
  clientName?: string;
  /** How this client proved its identity. A fact we record, never a claim. */
  registrationMethod?: ResolvedClientIdentity["registrationMethod"];
  metadataDigest?: string;
};

/**
 * The subset of the principal the Convex layer validates. Registration facts
 * stay at the transport, because authority never depends on them — a metadata
 * document does not buy a client more access than a dynamically registered one.
 */
function convexPrincipal(principal: VerifiedPrincipal) {
  return {
    issuer: principal.issuer,
    subject: principal.subject,
    clientId: principal.clientId,
    clientName: principal.clientName,
  };
}

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
  description = "A valid Assist With Moving OAuth token is required.",
) {
  const metadata = resourceMetadataUrl(resource);
  return new Response(
    JSON.stringify({ error: code, error_description: description }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "WWW-Authenticate": `Bearer realm="assistwithmoving", error="${code}", error_description="${description}", resource_metadata="${metadata}"`,
      },
    },
  );
}

/**
 * The authorization server could not be asked, so we do not know whether the
 * token is good.
 *
 * This is the difference between "your token is bad" and "we cannot check right
 * now", and it has to be visible from outside. A client told 401 discards a
 * perfectly good token and starts a fresh authorization it does not need; if
 * Clerk is briefly unreachable, every connected AI does that at once and none
 * of them can succeed, because the same outage breaks the authorization too. A
 * client told 503 waits and retries, which is the only thing that can work.
 */
function serviceUnavailable(
  description = "The authorization server could not be reached. Try again shortly.",
) {
  return new Response(
    JSON.stringify({ error: "temporarily_unavailable", error_description: description }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Retry-After": "30",
      },
    },
  );
}

/**
 * A fault in the token itself, as opposed to a fault in our ability to check
 * it. Thrown for the claim checks `verifyOAuth` makes by hand so they are
 * classified with jose's own token errors rather than mistaken for an outage.
 */
class TokenFault extends Error {}

/**
 * Is this error the token's fault?
 *
 * Enumerated in the positive direction on purpose. An unrecognised error is
 * treated as an outage rather than as a bad token, because the cost of being
 * wrong runs one way: telling a broken client to retry is recoverable, and
 * telling a working client its credentials are invalid sends it into a loop it
 * cannot leave.
 */
function isTokenFault(error: unknown): boolean {
  return (
    error instanceof TokenFault ||
    error instanceof joseErrors.JWTExpired ||
    error instanceof joseErrors.JWTClaimValidationFailed ||
    error instanceof joseErrors.JWTInvalid ||
    error instanceof joseErrors.JWSInvalid ||
    error instanceof joseErrors.JWSSignatureVerificationFailed ||
    error instanceof joseErrors.JWKSNoMatchingKey ||
    error instanceof joseErrors.JWKSMultipleMatchingKeys
  );
}

function protectedResourceMetadata(resource: URL, issuer: URL) {
  return new Response(
    JSON.stringify({
      resource: resource.toString(),
      resource_name: "Assist With Moving",
      authorization_servers: [issuer.toString().replace(/\/$/, "")],
      // Identity scopes ONLY. `scopes_supported` is what a client may request
      // of the authorization server, and Clerk can only issue these three.
      // The moving.* scopes are product permission, which lives in the
      // person's grant record and never in the token, so listing them here
      // would both misdescribe the authority model and invite a client to
      // request a scope Clerk will reject. They appear as a vendor hint below.
      scopes_supported: ["openid", "profile", "email"],
      bearer_methods_supported: ["header"],
      resource_documentation: new URL("/ai", resource.origin).toString(),
      // Client ID Metadata Documents are preferred here; dynamic registration
      // is accepted as a labelled compatibility fallback. Advertised so a
      // client can choose the better path rather than defaulting to DCR.
      client_id_metadata_document_supported: true,
      dynamic_client_registration_fallback_supported: true,
      "x-assistwithmoving": {
        grantBoundaryVersion: GRANT_BOUNDARY_VERSION,
        productGrantRequired: true,
        grantManager: new URL("/settings/ai", resource.origin).toString(),
        // The product ceiling, surfaced as a vendor hint rather than in
        // `scopes_supported`: these are approved at the grant manager, not
        // requested from Clerk.
        productScopes: [...movingScopes],
        // Four doors, honestly named. Only this one is the canonical OAuth
        // resource; the others exist and are not equivalent to it.
        doors: {
          canonical: new URL("/mcp", resource.origin).toString(),
          legacyCompatibility: new URL("/mcp/connect", resource.origin).toString(),
          apiKeyOnly: new URL("/api/mcp", resource.origin).toString(),
          localStdio: "assistwithmoving-mcp (npm, mmk_ key)",
        },
      },
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
    });
    if (
      result.protectedHeader.typ !== "at+jwt" &&
      result.protectedHeader.typ !== "application/at+jwt"
    ) {
      throw new TokenFault("Bearer is not an OAuth access token.");
    }
    const subject = result.payload.sub;
    if (!subject || !result.payload.exp) {
      throw new TokenFault("Missing OAuth subject or expiry.");
    }
    const clientId =
      typeof result.payload.azp === "string"
        ? result.payload.azp
        : typeof result.payload.client_id === "string"
          ? result.payload.client_id
          : null;
    if (!clientId) throw new TokenFault("Missing OAuth client identifier.");
    if (clientId.length > 160) throw new TokenFault("OAuth client identifier is too long.");
    // Clerk's production dynamic-registration access tokens currently omit
    // `aud`, even when the authorization request carries the RFC 8707
    // `resource` parameter. Keep the exact issuer, signature, expiry, token
    // type, subject, and client checks as the trust boundary. If Clerk does
    // provide an audience, fail closed unless it names this MCP resource or
    // the issuing OAuth client (Clerk's documented OAuth audience shape).
    const audiences = Array.isArray(result.payload.aud)
      ? result.payload.aud
      : typeof result.payload.aud === "string"
        ? [result.payload.aud]
        : [];
    if (
      audiences.length > 0 &&
      !audiences.includes(resource.toString()) &&
      !audiences.includes(clientId)
    ) {
      throw new TokenFault("OAuth audience does not match this resource or client.");
    }
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
    // Three outcomes, not two. Only a fault in the token is the token's
    // problem; anything else means we could not reach or read the
    // authorization server's keys, and saying 401 to that is what turns a
    // brief Clerk outage into every connected client re-authorizing forever.
    if (!isTokenFault(error)) {
      console.error(
        `[MCP] Could not verify against the authorization server: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
      return serviceUnavailable();
    }
    const description =
      error instanceof joseErrors.JWTExpired
        ? "The Assist With Moving OAuth token expired."
        : "The Assist With Moving OAuth token is invalid for this resource.";
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
    message: "Assist With Moving could not complete the MCP operation.",
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
  grantedScopes: readonly MovingScope[] = movingScopes,
) {
  const granted = new Set<MovingScope>(grantedScopes);
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions: [
        granted.size === 0
          ? "This sign-in has no active Assist With Moving grant, so no tools are available. The person opens Settings → AI connections in Assist With Moving and approves what this AI may do, then you reconnect."
          : `This connection holds ${[...granted].join(", ")}. Only tools inside those are listed.`,
        "Call get_move_brief first and use only returned move and record IDs.",
        "Search before creating duplicates; hydrate only the records needed for the work.",
        "Use get_evidence_media for private photos rather than normal web fetch.",
        "Use save_complete_result for a normal finished workflow and granular save tools for corrections.",
        "Record blocked, gated, failed, and not-relevant sources honestly.",
        "A Queue directive says what the person wants; it never widens this grant. If authority is missing, ask the smallest question with ask_queue_question instead of assuming.",
        `Never attempted here: ${NEVER_PERMITTED[0]}`,
      ].join(" "),
    },
  );

  /**
   * Register a tool only when the person's grant covers it, and record the use
   * against that grant afterwards.
   *
   * Filtering at registration is what keeps `tools/list` honest: an AI is never
   * shown a capability it would only be refused for. The refusal still exists
   * underneath — `convex/lib/mcpGrantAccess.ts` re-reads the grant on every
   * call — because a stale catalog must never become authority.
   */
  function registerGranted(
    name: (typeof STATELESS_MOVING_TOOL_NAMES)[number],
    config: any,
    handler: (input: any) => Promise<any>,
  ) {
    const scope = scopeForTool(name);
    if (!scope || !granted.has(scope)) return;
    (server.registerTool as any)(name, config, async (input: any) => {
      let outcome: { isError?: boolean };
      try {
        outcome = (await handler(input)) as { isError?: boolean };
      } catch (error) {
        return toolError(error);
      }
      if (!outcome?.isError) {
        try {
          await actionCtx.runMutation((internal as any).aiGrants.noteGrantUse, {
            subject: principal.subject,
            toolName: name,
            scope,
            moveId: input?.moveId,
            clientId: principal.clientId,
            clientName: principal.clientName,
            registrationMethod: principal.registrationMethod,
            clientMetadataDigest: principal.metadataDigest,
          });
        } catch (error) {
          // A receipt that fails to write must not undo work that succeeded.
          console.error("[MCP] Could not record grant use", error);
        }
      }
      return outcome;
    });
  }

  /**
   * Always available, and deliberately outside the scope catalog.
   *
   * An AI must be able to ask "what am I actually allowed to do here?" without
   * already holding a grant — otherwise a person with no grant sees an opaque
   * protocol failure instead of the one sentence that tells them what to do.
   * It reveals nothing but the person's own connection state.
   */
  server.registerTool(
    "describe_connection",
    {
      title: "Describe this Assist With Moving connection",
      description:
        "Report what this connection is currently allowed to do, what it can never do, and how the person changes that. Safe to call first when no other tools are listed.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () =>
      toolResult({
        endpoint: "https://movingmanifest.com/mcp",
        grantBoundaryVersion: GRANT_BOUNDARY_VERSION,
        grantedScopes: [...granted],
        connected: granted.size > 0,
        client: {
          clientId: principal.clientId,
          registrationMethod: principal.registrationMethod ?? "unknown",
          name: principal.clientName ?? null,
          note: "Registration method is recorded, never trusted as a claim about which product this is.",
        },
        neverPermitted: [...NEVER_PERMITTED],
        next:
          granted.size > 0
            ? "Call get_move_brief, then list_queue_work if you hold moving.queue.work."
            : "Ask the person to open Assist With Moving → Settings → AI connections and approve what this AI may do, then reconnect. Signing in proved who they are; it did not decide what you may do.",
        grantManager: "https://movingmanifest.com/settings/ai",
      }),
  );

  registerGranted(
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
            principal: convexPrincipal(principal),
            moveId: moveId as any,
          }),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  registerGranted(
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
            principal: convexPrincipal(principal),
            moveId: input.moveId as any,
          }),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  registerGranted(
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
            principal: convexPrincipal(principal),
            moveId: input.moveId as any,
            records: input.records,
          }),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  registerGranted(
    "get_evidence_media",
    {
      title: "Get evidence media",
      description:
        "Return private move photos as native inline image blocks — never a storage link. Filter by explicit photo IDs or one item, box, space, transport, zone, room, or the move. Use detail/full only when fine print matters. Delivery is budgeted: a photo too large at the size you asked for is sent smaller rather than dropped, and any photo left out is listed under `skipped` with a reason and what to do about it.",
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
          principal: convexPrincipal(principal),
          moveId: input.moveId as any,
        });
        const result = await actionCtx.runAction((internal as any).mcpToolsImages.getImages, {
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

  registerGranted(
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
            principal: convexPrincipal(principal),
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

  registerGranted(
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
            principal: convexPrincipal(principal),
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

  registerGranted(
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
            principal: convexPrincipal(principal),
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

  registerGranted(
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
          // The one-call finish: save the work and close the handoff in the
          // same approval, so a completed job is not two separate asks.
          completeQueueItem: z.boolean().optional(),
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
            principal: convexPrincipal(principal),
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

  // --- Queue workflow -----------------------------------------------------
  // The loop that makes a connection useful: see what is waiting, take it,
  // ask if something is genuinely unclear, and hand back a finished result.

  registerGranted(
    "list_queue_work",
    {
      title: "List Queue work waiting for your AI",
      description:
        "Return only the handoffs this person has actually accepted and left Waiting for your AI on one move, each with the version to claim it with. Needs you items are waiting on the person and are not listed.",
      inputSchema: z
        .object({
          moveId: id,
          includeMine: z.boolean().optional(),
          limit: z.number().int().min(1).max(25).default(10),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        return toolResult(
          await actionCtx.runQuery((internal as any).mcpQueueWork.listQueueWork, {
            ...input,
            principal: convexPrincipal(principal),
            moveId: input.moveId as any,
          }),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  registerGranted(
    "claim_queue_work",
    {
      title: "Claim Queue work",
      description:
        "Take one waiting handoff so the person can see it is being worked and no other AI picks it up. Claims lease for 15 minutes and renew by working; echo the expectedVersion from list_queue_work.",
      inputSchema: z
        .object({
          moveId: id,
          queueItemId: id,
          expectedVersion: z.number().int().min(1),
          operationId,
          nextStep: z.string().trim().min(3).max(500),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        return toolResult(
          await actionCtx.runMutation((internal as any).mcpQueueWork.claimQueueWork, {
            ...input,
            principal: convexPrincipal(principal),
            moveId: input.moveId as any,
            queueItemId: input.queueItemId as any,
          }),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  registerGranted(
    "release_queue_work",
    {
      title: "Release Queue work",
      description:
        "Hand a claimed handoff back to Waiting for your AI without pretending it is finished. Use this when you cannot complete it and the person does not need to do anything.",
      inputSchema: z
        .object({
          moveId: id,
          queueItemId: id,
          expectedVersion: z.number().int().min(1),
          operationId,
          reason,
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        return toolResult(
          await actionCtx.runMutation((internal as any).mcpQueueWork.releaseQueueWork, {
            ...input,
            principal: convexPrincipal(principal),
            moveId: input.moveId as any,
            queueItemId: input.queueItemId as any,
          }),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  registerGranted(
    "ask_queue_question",
    {
      title: "Ask the smallest Needs you question",
      description:
        "Move a claimed handoff to Needs you with one specific question. Prefer this over guessing or saving a result built on an assumption. Ask for the smallest thing that unblocks the work.",
      inputSchema: z
        .object({
          moveId: id,
          queueItemId: id,
          expectedVersion: z.number().int().min(1),
          operationId,
          question: z.string().trim().min(5).max(2_000),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        return toolResult(
          await actionCtx.runMutation((internal as any).mcpQueueWork.askQueueQuestion, {
            ...input,
            principal: convexPrincipal(principal),
            moveId: input.moveId as any,
            queueItemId: input.queueItemId as any,
          }),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  registerGranted(
    "complete_queue_work",
    {
      title: "Complete Queue work",
      description:
        "Mark a claimed handoff Done with its result summary and references. Use this when the result was already saved; save_complete_result with completeQueueItem does both in one approval.",
      inputSchema: z
        .object({
          moveId: id,
          queueItemId: id,
          expectedVersion: z.number().int().min(1),
          operationId,
          resultSummary: z.string().trim().min(1).max(4_000),
          resultRefs: z
            .array(
              z
                .object({
                  type: z.string().trim().min(1).max(80),
                  id,
                  label: z.string().trim().max(200).optional(),
                })
                .strict(),
            )
            .max(20)
            .optional(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        return toolResult(
          await actionCtx.runMutation((internal as any).mcpQueueWork.completeQueueWork, {
            ...input,
            principal: convexPrincipal(principal),
            moveId: input.moveId as any,
            queueItemId: input.queueItemId as any,
            resultRefs: input.resultRefs as any,
          }),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  registerGranted(
    "archive_move_records",
    {
      title: "Archive or restore Move records",
      description:
        "Reversibly retire belongings, boxes, rooms, or planning records that turned out to be wrong, or restore ones already archived. Returns a per-record result. This never permanently deletes anything.",
      inputSchema: z
        .object({
          moveId: id,
          operationId,
          action: z.enum(["archive", "restore"]),
          records: z
            .array(
              z
                .object({
                  kind: z.enum(["item", "box", "space", "planningRecord"]),
                  id,
                })
                .strict(),
            )
            .min(1)
            .max(50),
          reason,
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        // Reversible, but a person should still be told it changes what they see.
        destructiveHint: true,
        idempotentHint: true,
      },
    },
    async (input) => {
      try {
        return toolResult(
          await actionCtx.runMutation((internal as any).mcpArchive.archiveMoveRecords, {
            ...input,
            principal: convexPrincipal(principal),
            moveId: input.moveId as any,
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
  // The third outcome: unconfigured. A missing or malformed environment
  // variable is our fault, not the caller's, and an uncaught throw here is a
  // Convex 500 that a client reads as "this server is broken" with no idea
  // whether to retry. Say so in the same shape as an outage, because to a
  // client that is exactly what it is.
  let resource: URL;
  let issuer: URL;
  try {
    resource = requiredUrl("MCP_RESOURCE_URL");
    issuer = requiredUrl("CLERK_JWT_ISSUER_DOMAIN");
  } catch (error) {
    console.error(
      `[MCP] The endpoint is not configured: ${
        error instanceof Error ? error.message : "unknown"
      }`,
    );
    return serviceUnavailable(
      "This Assist With Moving endpoint is not configured yet. Try again shortly.",
    );
  }
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
        error_description: "Assist With Moving MCP requests are limited to 512 KiB.",
      }),
      {
        status: 413,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      },
    );
  }
  const declaredClientName =
    request.headers.get("mcp-client-name")?.slice(0, 160) || undefined;

  // Metadata-document first, dynamic registration as the labelled fallback.
  // A client id that claims to be a metadata document and fails to validate is
  // refused outright — degrading it to the fallback would let a bad document
  // buy the easier path.
  let identity: ResolvedClientIdentity;
  try {
    identity = await resolveClientIdentity(auth.clientId, {
      declaredClientName,
    });
  } catch (error) {
    if (error instanceof ClientIdentityError) {
      return new Response(
        JSON.stringify({
          error: "invalid_client",
          error_description: error.message,
          reason: error.reason,
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "WWW-Authenticate": `Bearer realm="assistwithmoving", error="invalid_client", error_description="${error.message}", resource_metadata="${resourceMetadataUrl(resource)}"`,
          },
        },
      );
    }
    throw error;
  }

  // The grant, read fresh on this request. It decides which tools even appear.
  let grantedScopes: MovingScope[] = [];
  try {
    const access = (await actionCtx.runQuery(
      (internal as any).aiGrants.grantsForPrincipal,
      { subject, clientId: identity.clientId },
    )) as { scopes: MovingScope[] };
    grantedScopes = access.scopes ?? [];
  } catch (error) {
    console.error("[MCP] Could not read product grants", error);
  }

  const handler = createMcpHandler(
    () =>
      createMovingServer(
        actionCtx,
        {
          issuer: principalIssuer,
          subject,
          clientId: identity.clientId,
          clientName: identity.clientName ?? declaredClientName,
          registrationMethod: identity.registrationMethod,
          metadataDigest: identity.metadataDigest,
        },
        grantedScopes,
      ).server,
    {
      legacy: "stateless",
      responseMode: "json",
      onerror: (error) => console.error("[MCP] Protocol error", error),
    },
  );
  return await handler.fetch(request, { authInfo: auth });
}

/**
 * The request-level guards, exported so they can be tested as behaviour.
 *
 * `createMovingServer` gives tests the tool layer, but the checks that run
 * *before* it — the 512 KiB body cap, the method and path gates, the OAuth
 * challenge, and client-identity resolution — lived only inside `handleMcp` and
 * were therefore unreachable. The body cap in particular was completely
 * untested. Exporting the handler keeps the route wiring below unchanged while
 * letting a test drive the real ordering rather than re-implementing it.
 */
export { handleMcp as handleMcpRequestForTests, MAX_MCP_REQUEST_BYTES };

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
