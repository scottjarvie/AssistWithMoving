// Remote MCP endpoint (Streamable HTTP) — the API-KEY door.
//
// Auth: mmk_ API keys ONLY (same keys as the REST API). This endpoint forwards
// the Bearer token to REST as an mmk_ key, so it CANNOT accept an OAuth/JWT
// token. OAuth-capable clients (claude.ai) must use the OAuth door instead:
// https://<site>/mcp/connect. See src/lib/mcp-oauth.ts for the full two-door
// explanation — do not make this endpoint advertise OAuth.
//
// Transport is the Authorization header (`Bearer mmk_...`) or the `x-api-key`
// header. The legacy `?key=` query parameter is rejected with a migration error
// — URL-borne keys leak into request logs, browser history, and referrers.
//
// Tool definitions are shared with the local stdio server in
// mcp-server/movingmanifest-mcp.mjs so the two transports cannot drift.
import { createMcpHandler } from "mcp-handler";

import {
  apiKeyFromRequest,
  requestHasQueryStringKey,
} from "@/lib/mcp-request-auth";
import { mcpBearerChallenge } from "@/lib/mcp-oauth";
import {
  MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS,
  registerTools,
} from "../../../../mcp-server/movingmanifest-mcp.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SERVER_INSTRUCTIONS = [
  "MovingManifest is the system of record for a household move: inventory items, boxes, photos, rooms/spaces, transport resources, load plans, and exports.",
  "Start every session with get_api_context to confirm the key's scopes and any move restriction, then list_moves or setup_move.",
  "Typical workflow: setup_move → create_move_space (rooms) → batch_upsert_items / add_item_from_photo → create_box + add_items_to_box → upload photos → suggest_assignments → get_move_summary.",
  "Prefer batch tools over repeated single calls. Most write tools accept dryRun for a safe preview and an idempotencyKey for retries.",
].join(" ");

function restApiBaseUrl(): string {
  const convexHttpActionsUrl = process.env.CONVEX_HTTP_ACTIONS_URL;
  if (convexHttpActionsUrl) {
    return `${convexHttpActionsUrl.replace(/\/+$/, "")}/api/v1`;
  }
  return "https://movingmanifest.com/api/v1";
}

function hostedAllowedToolNames(apiKey: string): string[] | undefined {
  if (process.env.MOVINGMANIFEST_MCP_TOOLSET === "trusted-helper") {
    return [...MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS];
  }
  const looksLikeApiKey = apiKey.startsWith("mmk_");
  if (
    process.env.MOVINGMANIFEST_MCP_OAUTH_TOOLSET === "trusted-helper" &&
    !looksLikeApiKey
  ) {
    return [...MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS];
  }
  return undefined;
}

function unauthorized(
  request: Request,
  message: string,
  code = "unauthorized",
): Response {
  return Response.json(
    {
      error: {
        code,
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
  if (!apiKey) {
    if (requestHasQueryStringKey(request)) {
      return unauthorized(
        request,
        "API keys in the URL query string (?key=...) are no longer accepted: URLs leak into browser history, server access logs, referrers, and analytics. Send the key in the 'Authorization: Bearer mmk_...' header (or 'x-api-key') instead. Any key that has ever traveled in a URL should be treated as exposed — rotate it from AI Connections settings.",
        "query_credentials_rejected",
      );
    }
    return unauthorized(
      request,
      "This endpoint accepts a MovingManifest API key via 'Authorization: Bearer mmk_...'. To connect with OAuth sign-in instead (no key needed), point your agent at https://movingmanifest.com/mcp."
    );
  }

  const apiConfig = {
    baseUrl: restApiBaseUrl(),
    apiKey,
    mediaIngress: { transport: "hosted", allowedFileRoots: [] },
  };

  const handler = createMcpHandler(
    (server) => {
      registerTools(server, apiConfig, {
        allowedToolNames: hostedAllowedToolNames(apiKey),
      });
    },
    {
      serverInfo: { name: "movingmanifest", version: "0.2.0" },
      instructions: SERVER_INSTRUCTIONS,
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

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}
