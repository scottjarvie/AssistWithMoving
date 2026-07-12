// Remote-MCP side of the credential transport. The hosted MCP endpoint accepts
// an mmk_ API key via the `Authorization: Bearer` header or the `x-api-key`
// header and forwards it byte-for-byte to the REST API, so this extraction must
// NOT mutate the key beyond trimming surrounding whitespace. The legacy `?key=`
// query-string form is NO LONGER accepted — URL-borne keys leak into browser
// history, server access logs, referrers, and analytics (audit MM-SEC-003);
// requestHasQueryStringKey lets the endpoint answer such a request with an
// actionable migration error instead of silently trusting a URL credential.
// Kept in its own module (no mcp-handler import) so it can be regression-tested
// directly — see tests/unit/mcp-api-key-transport.test.ts.
export function apiKeyFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const headerKey = request.headers.get("x-api-key")?.trim();
  if (headerKey) return headerKey;
  return null;
}

// True when the request carries an API key only via the rejected `?key=` query
// parameter. The endpoint uses this to return a specific migration error so a
// caller still on the legacy URL form is told to move the key into a header,
// rather than getting a generic "no credential" 401.
export function requestHasQueryStringKey(request: Request): boolean {
  try {
    return Boolean(new URL(request.url).searchParams.get("key")?.trim());
  } catch {
    return false;
  }
}
