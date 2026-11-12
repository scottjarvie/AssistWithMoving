import { unavailableStatus } from "../../../../convex/lib/aiUploadCaps";
import { localPublicAuthEnabled } from "@/lib/localLiveAuth";
export async function PUT(request: Request) {
  if (localPublicAuthEnabled()) return new Response(null, { status: unavailableStatus });
  const base = process.env.CONVEX_HTTP_ACTIONS_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL?.replace(/\.convex\.cloud$/, ".convex.site");
  if (!base) return new Response(null, { status: unavailableStatus });
  const target = new URL("/ai-upload", base);
  target.search = new URL(request.url).search;
  const headers = new Headers();
  const length = request.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  const response = await fetch(target, { method: "PUT", headers, body: request.body, duplex: "half", redirect: "error", cache: "no-store" } as RequestInit);
  return new Response(response.body, { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
}
