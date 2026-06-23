// Remote-MCP side of the credential transport. The hosted MCP endpoint accepts
// an mmk_ API key three ways and forwards it byte-for-byte to the REST API, so
// this extraction must NOT mutate the key beyond trimming surrounding
// whitespace. Kept in its own module (no mcp-handler import) so it can be
// regression-tested directly — see tests/unit/mcp-api-key-transport.test.ts.
export function apiKeyFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const headerKey = request.headers.get("x-api-key")?.trim();
  if (headerKey) return headerKey;
  const queryKey = new URL(request.url).searchParams.get("key")?.trim();
  if (queryKey) return queryKey;
  return null;
}
