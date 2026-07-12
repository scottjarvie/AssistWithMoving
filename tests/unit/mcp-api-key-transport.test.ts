import { describe, expect, it } from "vitest";

import { apiKeyPrefix, generateApiKeySecret } from "../../convex/lib/apiKeys";
import { bearerToken } from "../../convex/lib/restApi";
import {
  apiKeyFromRequest,
  requestHasQueryStringKey,
} from "../../src/lib/mcp-request-auth";

// Guards the credential transport end to end: the hosted MCP endpoint extracts
// the key (Authorization / x-api-key headers only) and forwards it to the REST
// API, which re-extracts it from the Bearer header and validates the format. A
// change anywhere on that path that mangles the key reproduces the "Invalid API
// key format" outage — these round-trips fail loudly if it does. The legacy
// `?key=` query-string transport is rejected (MM-SEC-003) and covered below.

function mcpRequest(headers: Record<string, string>, url = "https://mm.test/api/mcp") {
  return new Request(url, { headers });
}

describe("MCP -> REST API key transport", () => {
  it("extracts the key unchanged from every accepted transport", () => {
    const key = generateApiKeySecret();

    expect(apiKeyFromRequest(mcpRequest({ authorization: `Bearer ${key}` }))).toBe(
      key,
    );
    // Header name and the "Bearer" scheme are case-insensitive.
    expect(apiKeyFromRequest(mcpRequest({ Authorization: `bearer ${key}` }))).toBe(
      key,
    );
    expect(apiKeyFromRequest(mcpRequest({ "x-api-key": key }))).toBe(key);

    // Stray surrounding whitespace is trimmed, not treated as a malformed key.
    expect(
      apiKeyFromRequest(mcpRequest({ authorization: `Bearer   ${key}  ` })),
    ).toBe(key);

    // No credential at all.
    expect(apiKeyFromRequest(mcpRequest({}))).toBeNull();
  });

  it("no longer accepts an API key from the ?key= query string (MM-SEC-003)", () => {
    const key = generateApiKeySecret();

    // A key supplied ONLY via the URL is not extracted as a credential...
    const queryOnly = mcpRequest({}, `https://mm.test/api/mcp?key=${key}`);
    expect(apiKeyFromRequest(queryOnly)).toBeNull();
    // ...but the endpoint can still detect it, to return the migration error
    // instead of a generic "no credential" 401.
    expect(requestHasQueryStringKey(queryOnly)).toBe(true);

    // A header key still wins even if a stray ?key= is also present.
    const headerAndQuery = mcpRequest(
      { authorization: `Bearer ${key}` },
      `https://mm.test/api/mcp?key=ignored`,
    );
    expect(apiKeyFromRequest(headerAndQuery)).toBe(key);

    // Requests with no query key are not flagged for the migration error.
    expect(requestHasQueryStringKey(mcpRequest({}))).toBe(false);
    expect(
      requestHasQueryStringKey(mcpRequest({}, "https://mm.test/api/mcp?key=")),
    ).toBe(false);
  });

  it("round-trips the full hosted-MCP -> REST chain for many keys", () => {
    // Includes the ~20% of keys whose base64url prefix contains "_", the case
    // that historically tripped delimiter-based parsing.
    for (let index = 0; index < 1000; index += 1) {
      const key = generateApiKeySecret();

      // 1. Hosted MCP endpoint reads the key the connector sent.
      const extracted = apiKeyFromRequest(
        mcpRequest({ authorization: `Bearer ${key}` }),
      );
      expect(extracted).toBe(key);

      // 2. It forwards the key to the REST API as a Bearer header; the REST API
      //    re-extracts and validates it. The whole path must preserve the key.
      const forwarded = bearerToken(`Bearer ${extracted}`);
      expect(forwarded).toBe(key);
      expect(apiKeyPrefix(forwarded as string)).toBe(key.slice(4, 18));
    }
  });

  it("rejects a forwarded OAuth/JWT token with a diagnosable error", () => {
    const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEyMyJ9.c2ln";
    const forwarded = bearerToken(`Bearer ${jwt}`);
    expect(forwarded).toBe(jwt);
    expect(() => apiKeyPrefix(forwarded as string)).toThrow(/OAuth\/JWT token/);
  });
});
