// RFC 9728 protected-resource metadata for the branded MCP endpoint
// (https://<site>/mcp/connect). The proxy route rewrites the gateway's 401
// WWW-Authenticate to point here, so OAuth discovery stays on our domain instead
// of exposing the .convex.site host. `resource` matches the URL the user
// actually connects to; `authorization_servers` is Clerk.
//
// Shares protectedResourceMetadataBody with the /mcp door: the grant boundary
// is the same product ceiling whichever door a client came through, and the
// legacy door must not quietly describe a smaller product than the canonical one.
import {
  protectedResourceMetadataBody,
  siteOriginFromRequest,
} from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return Response.json(
    protectedResourceMetadataBody({
      origin: siteOriginFromRequest(request),
      resourcePath: "/mcp/connect",
      documentationPath: "/mcp/guide",
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
