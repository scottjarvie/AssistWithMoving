import { localPublicAuthEnabled } from "@/lib/localLiveAuth";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  if (localPublicAuthEnabled()) return new Response(null, { status: 503, headers });
  const base = process.env.CONVEX_HTTP_ACTIONS_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL?.replace(/\.convex\.cloud$/, ".convex.site");
  if (!base) return new Response(null, { status: 503, headers });
  const { token } = await context.params;
  const url = new URL("/audio/playback", base);
  url.searchParams.set("token", token);
  const range = request.headers.get("range");
  const response = await fetch(url, { headers: range ? { Range: range } : {}, cache: "no-store", redirect: "error" });
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "x-content-type-options"]) {
    const value = response.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers });
}
