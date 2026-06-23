// Remote MCP endpoint (Streamable HTTP) for hosted agents — claude.ai,
// Claude Cowork, and any MCP client that can't run a local process.
//
// Auth: scoped mmk_ API keys remain supported. OAuth-capable hosted agents can
// also discover Clerk through MCP protected-resource metadata and use a
// Clerk-issued OAuth access token.
//
// Tool definitions are shared with the local stdio server in
// mcp-server/movingmanifest-mcp.mjs so the two transports cannot drift.
import { createMcpHandler } from "mcp-handler";
import { auth } from "@clerk/nextjs/server";

import {
  bearerTokenFromRequest,
  isMovingManifestApiKey,
  mcpBearerChallenge,
  mcpOauthScopes,
} from "@/lib/mcp-oauth";
import {
  MOVINGMANIFEST_MCP_INSTRUCTIONS,
  MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS,
  registerTools,
} from "../../../../mcp-server/movingmanifest-mcp.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function apiKeyFromRequest(request: Request): string | null {
  const bearerToken = bearerTokenFromRequest(request);
  if (bearerToken && isMovingManifestApiKey(bearerToken)) {
    return bearerToken;
  }
  const headerKey = request.headers.get("x-api-key")?.trim();
  if (headerKey) return headerKey;
  const queryKey = new URL(request.url).searchParams.get("key")?.trim();
  if (queryKey) return queryKey;
  return null;
}

function restApiBaseUrl(): string {
  const convexHttpActionsUrl = process.env.CONVEX_HTTP_ACTIONS_URL;
  if (convexHttpActionsUrl) {
    return `${convexHttpActionsUrl.replace(/\/+$/, "")}/api/v1`;
  }
  return "https://movingmanifest.com/api/v1";
}

function unauthorized(request: Request, message: string): Response {
  return Response.json(
    {
      error: {
        code: "unauthorized",
        message,
      },
    },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": mcpBearerChallenge(request),
      },
    }
  );
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const apiKey = apiKeyFromRequest(request);
  let bearerToken = apiKey;
  let authMode: "apiKey" | "oauth" = "apiKey";
  if (!bearerToken) {
    const oauthBearerToken = bearerTokenFromRequest(request);
    if (!oauthBearerToken) {
      return unauthorized(
        request,
        "Connect with OAuth or provide a MovingManifest API key via 'Authorization: Bearer mmk_...'."
      );
    }
    const verified = await verifyMcpOAuthRequest();
    if (!verified.ok) {
      return Response.json(
        {
          error: {
            code: verified.code,
            message: verified.message,
          },
        },
        {
          status: 401,
          headers: {
            "WWW-Authenticate": mcpBearerChallenge(request, {
              error: "invalid_token",
              errorDescription: verified.message,
            }),
          },
        }
      );
    }
    bearerToken = oauthBearerToken;
    authMode = "oauth";
  }

  const apiConfig = { baseUrl: restApiBaseUrl(), apiKey: bearerToken };

  const handler = createMcpHandler(
    (server) => {
      registerTools(server, apiConfig, {
        allowedToolNames: oauthAllowedToolNames(authMode),
      });
    },
    {
      serverInfo: { name: "movingmanifest", version: "0.2.0" },
      instructions: MOVINGMANIFEST_MCP_INSTRUCTIONS,
    },
    {
      basePath: "/api",
      disableSse: true,
      maxDuration: 60,
      verboseLogs: false,
    }
  );

  return handler(request);
}

function oauthAllowedToolNames(authMode: "apiKey" | "oauth") {
  if (authMode !== "oauth") return undefined;
  return process.env.MOVINGMANIFEST_MCP_OAUTH_TOOLSET === "trusted-helper"
    ? MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS
    : undefined;
}

async function verifyMcpOAuthRequest(): Promise<
  | { ok: true }
  | { ok: false; code: "invalid_token" | "insufficient_scope"; message: string }
> {
  const authResult = await auth({ acceptsToken: "oauth_token" });
  if (!authResult.isAuthenticated || authResult.tokenType !== "oauth_token") {
    return {
      ok: false,
      code: "invalid_token",
      message: "OAuth access token is invalid or was not issued by Clerk.",
    };
  }

  const scopes = new Set(authResult.scopes ?? []);
  const missingScopes = mcpOauthScopes.filter((scope) => !scopes.has(scope));
  if (missingScopes.length) {
    return {
      ok: false,
      code: "insufficient_scope",
      message: `OAuth access token is missing required scope(s): ${missingScopes.join(
        ", "
      )}.`,
    };
  }

  return { ok: true };
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}
