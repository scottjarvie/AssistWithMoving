// RFC 9728 protected-resource metadata for the MCP front door
// (https://<site>/mcp). The /mcp proxy rewrites the stateless resource's 401
// WWW-Authenticate to point here. `resource` matches the URL the client
// connects to (.../mcp); `authorization_servers` is Clerk. Mirrors the
// /mcp/connect metadata. A specific segment route, so it takes precedence over
// the [[...resource]] catch-all (which serves the key-only /api/mcp metadata).
//
// The body is built by protectedResourceMetadataBody so this document and the
// Convex gateway's own copy cannot drift. A client only ever reads this one.
import {
  protectedResourceMetadataBody,
  siteOriginFromRequest,
} from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return Response.json(
    protectedResourceMetadataBody({
      origin: siteOriginFromRequest(request),
      resourcePath: "/mcp",
      documentationPath: "/ai",
    }),
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    },
  );
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, content-type",
    },
  });
}
