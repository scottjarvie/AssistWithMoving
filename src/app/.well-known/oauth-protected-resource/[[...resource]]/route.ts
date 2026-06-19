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
