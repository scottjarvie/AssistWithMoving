import { parseAudioRange } from "./media/audio";

export async function audioResponse(request: Request, length: number, mimeType: string, open: (range?: string) => Promise<Response>): Promise<Response> {
  const range = parseAudioRange(request.headers.get("range"), length);
  const headers = new Headers({ "Cache-Control": "private, no-store", "Accept-Ranges": "bytes", "Content-Type": mimeType, "X-Content-Type-Options": "nosniff" });
  if (range.kind === "refused") {
    headers.set("Content-Range", `bytes */${length}`);
    return new Response(null, { status: 416, headers });
  }
  const partial = range.kind === "partial";
  const upstream = await open(partial ? `bytes=${range.start}-${range.end}` : undefined);
  if (!upstream.ok || (partial && upstream.status !== 206)) { await upstream.body?.cancel(); return new Response(null, { status: 502, headers }); }
  headers.set("Content-Length", String(partial ? range.end - range.start + 1 : length));
  if (partial) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${length}`);
  return new Response(upstream.body, { status: partial ? 206 : 200, headers });
}
