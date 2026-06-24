// Branded entry point for the OAuth MCP gateway:  https://<site>/mcp/connect
//
// The gateway itself runs as a Convex HTTP action on `<deployment>.convex.site`
// — not something we want users pasting into their AI client. This route proxies
// straight through to it, and rewrites the one place the gateway leaks its own
// origin: the `WWW-Authenticate` header on the 401, whose `resource_metadata`
// URL it builds from the request origin (the Convex host). We repoint that at
// our own discovery doc on this domain (see
// .well-known/oauth-protected-resource/mcp/connect) so the whole OAuth flow
// stays branded. The gateway is mounted with disableSse, so responses are
// single JSON frames — no streaming to relay.
import { siteOriginFromRequest } from "@/lib/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function convexMcpUrl(): string {
  const site = process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.trim();
  if (site) return `${site.replace(/\/+$/, "")}/mcp`;
  const cloud = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (cloud) {
    return `${cloud
      .replace(/\.convex\.cloud\/?$/, ".convex.site")
      .replace(/\/+$/, "")}/mcp`;
  }
  throw new Error("Convex site URL is not configured.");
}

async function proxy(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const upstream = await fetch(`${convexMcpUrl()}${incoming.search}`, {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer(),
    redirect: "manual",
  });

  const responseHeaders = new Headers(upstream.headers);

  // Node's fetch (undici) transparently decompresses the upstream body but
  // leaves the upstream's content-encoding/content-length headers untouched.
  // Relaying those with the already-decompressed body makes the MCP client try
  // to gunzip plain JSON (and read a wrong length), which silently corrupts the
  // response. This bites only LARGE responses — the gateway sits behind Caddy,
  // which gzips above a size threshold, so the full initialize / tools-list
  // (16 tool schemas) breaks while the small 401 challenge slips through. That
  // asymmetry is exactly the "OAuth succeeds, then 'couldn't connect'" symptom.
  // Strip both so the decompressed body is served verbatim.
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");

  // Repoint the gateway's self-referential discovery URL at our branded domain.
  const challenge = responseHeaders.get("www-authenticate");
  if (challenge) {
    const metadataUrl = `${siteOriginFromRequest(
      request,
    )}/.well-known/oauth-protected-resource/mcp/connect`;
    responseHeaders.set(
      "www-authenticate",
      challenge.replace(
        /resource_metadata="[^"]*"/,
        `resource_metadata="${metadataUrl}"`,
      ),
    );
  }
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set("Access-Control-Expose-Headers", "mcp-session-id");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "authorization, content-type, mcp-session-id, mcp-protocol-version, accept",
      "Access-Control-Expose-Headers": "mcp-session-id",
      "Access-Control-Max-Age": "86400",
    },
  });
}
