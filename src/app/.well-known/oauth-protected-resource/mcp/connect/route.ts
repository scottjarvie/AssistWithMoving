// RFC 9728 protected-resource metadata for the branded MCP endpoint
// (https://<site>/mcp/connect). The proxy route rewrites the gateway's 401
// WWW-Authenticate to point here, so OAuth discovery stays on our domain instead
// of exposing the .convex.site host. `resource` matches the URL the user
// actually connects to; `authorization_servers` is Clerk.
import {
  clerkOauthIssuer,
  mcpOauthScopes,
  siteOriginFromRequest,
} from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const origin = siteOriginFromRequest(request);
  const issuer = clerkOauthIssuer();
  return Response.json(
    {
      resource: `${origin}/mcp/connect`,
      authorization_servers: issuer ? [issuer] : [],
      scopes_supported: [...mcpOauthScopes],
      bearer_methods_supported: ["header"],
      resource_name: "AssistWithMoving",
      resource_documentation: `${origin}/mcp/guide`,
    },
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
