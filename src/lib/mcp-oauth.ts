import { GRANT_BOUNDARY_VERSION, movingScopes } from "../../convex/lib/aiGrants";
import { product } from "@/lib/product";

// ============================================================================
// THREE MCP DOORS — DO NOT CONFLATE THEM. (Read this before editing.)
//
// Assist With Moving exposes agent access through separate doors that must stay
// apart. Crossing them is the recurring bug that 401s every connection:
//
//   1. /api/mcp        — API-KEY door. Accepts mmk_ keys ONLY. It forwards the
//                        Bearer token straight to the REST API as an mmk_ key,
//                        so it CANNOT consume an OAuth/JWT token. This file
//                        builds its 401 challenge + protected-resource metadata.
//                        => It must NEVER advertise an OAuth authorization
//                           server. Doing so lures OAuth clients (claude.ai)
//                           into completing a sign-in whose token /api/mcp then
//                           rejects as "Invalid API key format". That is the
//                           exact dead-end users keep hitting.
//
//   2. /mcp            — canonical stateless OAUTH door for new clients. It
//                        verifies Clerk tokens and exposes eight move workflows.
//
//   3. /mcp/connect    — persisted OAUTH compatibility door via the older
//                        convex-mcp-gateway catalog. It stays available for
//                        already-connected clients but is not an alias of /mcp.
//
// RULE: the OAuth/Clerk advertisement belongs to /mcp and /mcp/connect, never
// /api/mcp.
// If you find yourself adding `authorization_servers`, Clerk, or a
// `resource_metadata` pointer to the /api/mcp helpers below, STOP — you are
// about to re-break agent connections. Surface /mcp to new OAuth clients
// instead (see mcpOAuthConnectUrl). Guarded by tests/unit/mcp-endpoint-
// separation.test.ts.
// ============================================================================

export const mcpOauthScopes = ["openid", "profile", "email"] as const;

/**
 * What the OAuth doors advertise in RFC 9728 `scopes_supported`.
 *
 * Two different things live in one list, and the distinction matters:
 *   - `mcpOauthScopes` are the identity scopes Clerk actually issues today.
 *   - `movingScopes` are the product ceiling this resource enforces from its
 *     own grant records. A token carrying one never widens a grant, and a token
 *     lacking one never narrows one — but a client still needs to see them to
 *     understand what approving at /settings/ai can cover.
 *
 * Sourced from convex/lib/aiGrants.ts rather than re-listed here. These Next
 * routes are what an MCP client actually reads: the /mcp proxy rewrites the
 * gateway's 401 to point at this domain's metadata, so the Convex gateway's own
 * copy is never fetched by a real client. When the two lists drifted, the five
 * moving.* scopes existed in the backend and were invisible to every client.
 */
export const mcpResourceScopes = [
  ...mcpOauthScopes,
  ...movingScopes,
] as const;

/**
 * The RFC 9728 body for an OAuth door, mirroring `protectedResourceMetadata`
 * in convex/httpRoutes/mcp.ts.
 *
 * Both copies have to exist — the gateway answers on `.convex.site`, and these
 * routes answer on the branded domain — but only this one is ever read by a
 * client, because the /mcp proxy rewrites the gateway's 401 `resource_metadata`
 * to point here. Keep the two in sync; the drift is silent and total.
 */
export function protectedResourceMetadataBody({
  origin,
  resourcePath,
  documentationPath,
}: {
  origin: string;
  resourcePath: string;
  documentationPath: string;
}) {
  const issuer = clerkOauthIssuer();
  return {
    resource: `${origin}${resourcePath}`,
    authorization_servers: issuer ? [issuer] : [],
    scopes_supported: [...mcpResourceScopes],
    bearer_methods_supported: ["header"],
    resource_name: product.name,
    resource_documentation: `${origin}${documentationPath}`,
    // A Client ID Metadata Document is preferred; dynamic registration stays as
    // a labelled compatibility fallback so a client can choose the better path.
    client_id_metadata_document_supported: true,
    dynamic_client_registration_fallback_supported: true,
    "x-assistwithmoving": {
      grantBoundaryVersion: GRANT_BOUNDARY_VERSION,
      // Signing in is not authorization. Without an approved grant every tool
      // call is refused, so a client should send people to the grant manager
      // rather than reporting a broken connection.
      productGrantRequired: true,
      grantManager: `${origin}/settings/ai`,
      // Four doors, honestly named. Only /mcp is the canonical OAuth resource.
      doors: {
        canonical: `${origin}/mcp`,
        legacyCompatibility: `${origin}/mcp/connect`,
        apiKeyOnly: `${origin}/api/mcp`,
        localStdio: "assistwithmoving-mcp (npm, mmk_ key)",
      },
    },
  };
}

export function siteOriginFromRequest(request: Request) {
  const requestOrigin = originFromRequest(request);
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return requestOrigin;

  const configuredOrigin = configured.replace(/\/+$/, "");
  if (shouldUseRequestOrigin(requestOrigin, configuredOrigin)) {
    return requestOrigin;
  }
  return configuredOrigin;
}

export function mcpResourceUrl(request: Request) {
  return `${siteOriginFromRequest(request)}/api/mcp`;
}

// The OAuth front door. This is the URL OAuth-capable clients (claude.ai,
// Cowork) should connect to — NOT /api/mcp. The canonical URL is the bare /mcp
// (see src/app/mcp/route.ts); /mcp/connect is compatibility-only. Surface this
// anywhere a user is told to "connect with sign-in / OAuth".
export function mcpOAuthConnectUrl(request: Request) {
  return `${siteOriginFromRequest(request)}/mcp`;
}

export function mcpProtectedResourceMetadataUrl(request: Request) {
  return `${siteOriginFromRequest(
    request
  )}/.well-known/oauth-protected-resource/api/mcp`;
}

export function clerkOauthIssuer() {
  const issuer =
    process.env.CLERK_JWT_ISSUER_DOMAIN?.trim() ??
    process.env.CLERK_FRONTEND_API_URL?.trim();
  return issuer ? issuer.replace(/\/+$/, "") : null;
}

// Protected-resource metadata for /api/mcp. This is a KEY-ONLY resource:
// `authorization_servers` is intentionally EMPTY — /api/mcp does not and cannot
// honor OAuth (see the header comment). The empty list is the RFC 9728 signal
// "no OAuth here"; `resource_documentation` points at /mcp where the real OAuth
// endpoint (/mcp/connect) is described.
export function mcpProtectedResourceMetadata(request: Request) {
  const resource = mcpResourceUrl(request);

  return {
    resource,
    authorization_servers: [],
    bearer_methods_supported: ["header"],
    resource_name: product.name,
    resource_documentation: `${siteOriginFromRequest(request)}/mcp/guide`,
  };
}

// 401 challenge for /api/mcp. Key-only: NO resource_metadata, scope, or
// authorization server (advertising those would start an OAuth flow this
// endpoint can't finish — the recurring trap). `error_description` routes
// humans to the OAuth endpoint instead. Do not re-add OAuth advertisement here.
export function mcpBearerChallenge(
  request: Request,
  options: {
    error?: string;
    errorDescription?: string;
  } = {}
) {
  const params: [string, string][] = [
    ["realm", "Assist With Moving MCP API key"],
    ["error", options.error ?? "invalid_token"],
    [
      "error_description",
      options.errorDescription ??
        `This endpoint accepts Assist With Moving API keys (mmk_...). To connect with OAuth sign-in instead, point your agent at ${mcpOAuthConnectUrl(
          request
        )}.`,
    ],
  ];

  return `Bearer ${params
    .map(([key, value]) => `${key}="${quoteHeaderValue(value)}"`)
    .join(", ")}`;
}

function quoteHeaderValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function originFromRequest(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
  if (forwardedHost) {
    const forwardedProto =
      request.headers.get("x-forwarded-proto")?.trim() ?? "https";
    return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, "");
  }
  return new URL(request.url).origin;
}

function shouldUseRequestOrigin(requestOrigin: string, configuredOrigin: string) {
  try {
    const requestHost = new URL(requestOrigin).hostname;
    const configuredHost = new URL(configuredOrigin).hostname;
    if (requestHost === configuredHost) return false;
    if (requestHost.endsWith(".vercel.app")) return true;
    if (configuredHost === "localhost" && requestHost !== "localhost") {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
