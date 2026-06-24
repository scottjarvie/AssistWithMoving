// Protected-resource metadata for the /api/mcp (API-KEY) door. This advertises
// NO OAuth authorization server on purpose — /api/mcp is key-only. The OAuth
// door has its own discovery doc at
// .well-known/oauth-protected-resource/mcp/connect. See src/lib/mcp-oauth.ts.
import { mcpProtectedResourceMetadata } from "@/lib/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return Response.json(mcpProtectedResourceMetadata(request), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
