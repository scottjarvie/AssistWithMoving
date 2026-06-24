import { product } from "@/lib/product";

// ============================================================================
// TWO MCP ENDPOINTS — DO NOT CONFLATE THEM. (Read this before editing.)
//
// MovingManifest exposes agent access through two SEPARATE doors that must stay
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
//   2. /mcp/connect    — OAUTH door. The real OAuth 2.1 flow (Clerk) via the
//                        convex-mcp-gateway. Lives in src/app/mcp/connect/route.ts
//                        + convex/http.ts + the /mcp/connect well-known route.
//                        This is what hosted clients (claude.ai) should use.
//
// RULE: the OAuth/Clerk advertisement belongs to /mcp/connect, never /api/mcp.
// If you find yourself adding `authorization_servers`, Clerk, or a
// `resource_metadata` pointer to the /api/mcp helpers below, STOP — you are
// about to re-break agent connections. Surface /mcp/connect to OAuth clients
// instead (see mcpOAuthConnectUrl). Guarded by tests/unit/mcp-endpoint-
// separation.test.ts.
// ============================================================================

export const mcpOauthScopes = ["openid", "profile", "email"] as const;

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

// The OAuth door. This is the URL OAuth-capable clients (claude.ai, Cowork)
// should connect to — NOT /api/mcp. Surface this anywhere a user is told to
// "connect with sign-in / OAuth".
export function mcpOAuthConnectUrl(request: Request) {
  return `${siteOriginFromRequest(request)}/mcp/connect`;
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
    resource_documentation: `${siteOriginFromRequest(request)}/mcp`,
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
    ["realm", "MovingManifest MCP API key"],
    ["error", options.error ?? "invalid_token"],
    [
      "error_description",
      options.errorDescription ??
        `This endpoint accepts MovingManifest API keys (mmk_...). To connect with OAuth sign-in instead, point your agent at ${mcpOAuthConnectUrl(
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
