// The MCP front door: https://<site>/mcp
//
// This is the URL we want people and agents to reach for. It serves two
// audiences off one path:
//   - An MCP client (claude.ai, Cowork, etc.) hits it with JSON-RPC / SSE and
//     gets the real OAuth 2.1 flow — proxied to the Convex MCP gateway exactly
//     like /mcp/connect (which stays a working alias).
//   - A human opening it in a browser is sent to the human setup guide at
//     /mcp/guide.
//
// Why a front door at all: the bare /mcp URL is what people and agents guess
// first. Before this, /mcp was a docs page and OAuth only lived at /mcp/connect,
// so guessing /mcp (or worse, /api/mcp — the key-only door) dead-ended OAuth.
// Now the obvious guess just works. The OAuth/Clerk advertisement still belongs
// ONLY to the OAuth doors (/mcp and /mcp/connect) — never /api/mcp. See
// src/lib/mcp-oauth.ts.
//
// NOTE: the proxy logic mirrors src/app/mcp/connect/route.ts; keep them in sync.
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

// A browser navigation (top-level GET that prefers HTML) gets the human guide;
// MCP clients negotiate JSON / SSE and must be proxied to the gateway instead.
function isBrowserNavigation(request: Request): boolean {
  if (request.method !== "GET") return false;
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html");
}

async function proxy(request: Request): Promise<Response> {
  if (isBrowserNavigation(request)) {
    return Response.redirect(
      `${siteOriginFromRequest(request)}/mcp/guide`,
      307,
    );
  }

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
  // undici already decompressed the body; relaying the upstream encoding/length
  // headers would corrupt large responses. Strip both (see /mcp/connect).
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");

  // Repoint the gateway's self-referential discovery URL at this resource's
  // metadata on our branded domain (resource = .../mcp).
  const challenge = responseHeaders.get("www-authenticate");
  if (challenge) {
    const metadataUrl = `${siteOriginFromRequest(
      request,
    )}/.well-known/oauth-protected-resource/mcp`;
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
