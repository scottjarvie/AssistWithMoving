// Remote MCP endpoint (Streamable HTTP) for hosted agents — claude.ai,
// Claude Cowork, and any MCP client that can't run a local process.
//
// Auth: the same mmk_ API keys used by the REST API. Preferred transport is
// the Authorization header; `x-api-key` and a `?key=` query parameter are
// accepted as fallbacks for clients that cannot set custom headers (note:
// query-string keys can end up in request logs — header auth is recommended).
//
// Tool definitions are shared with the local stdio server in
// mcp-server/movingmanifest-mcp.mjs so the two transports cannot drift.
import { createMcpHandler } from "mcp-handler";

import { registerTools } from "../../../../mcp-server/movingmanifest-mcp.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SERVER_INSTRUCTIONS = [
  "MovingManifest is the system of record for a household move: inventory items, boxes, photos, rooms/spaces, transport resources, load plans, and exports.",
  "Start every session with get_api_context to confirm the key's scopes and any move restriction, then list_moves or setup_move.",
  "Typical workflow: setup_move → create_move_space (rooms) → batch_upsert_items / add_item_from_photo → create_box + add_items_to_box → upload photos → suggest_assignments → get_move_summary.",
  "Prefer batch tools over repeated single calls. Most write tools accept dryRun for a safe preview and an idempotencyKey for retries.",
].join(" ");

function apiKeyFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
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

function unauthorized(message: string): Response {
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
        "WWW-Authenticate": 'Bearer realm="MovingManifest MCP"',
      },
    }
  );
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const apiKey = apiKeyFromRequest(request);
  if (!apiKey) {
    return unauthorized(
      "Provide a MovingManifest API key via 'Authorization: Bearer mmk_...'. Create one at https://movingmanifest.com/settings/ai-connections."
    );
  }

  const apiConfig = { baseUrl: restApiBaseUrl(), apiKey };

  const handler = createMcpHandler(
    (server) => {
      registerTools(server, apiConfig);
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
