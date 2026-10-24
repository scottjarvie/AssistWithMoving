// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- the ActionCtx and jose boundaries are intentionally stubbed. */

/**
 * The canonical `/mcp` request guards, driven as behaviour.
 *
 * Two holes this closes:
 *
 *  1. **The 512 KiB body cap was completely untested.** `MAX_MCP_REQUEST_BYTES`
 *     existed and the check existed, but nothing proved a request over the cap
 *     is refused, that the refusal is a 413 rather than a crash or a truncated
 *     read, or that the cap is enforced *after* authentication — which matters,
 *     because a pre-auth cap would let an anonymous caller learn the limit and a
 *     post-auth-but-too-late cap would let a huge body reach the tool layer.
 *
 *  2. **A malformed JSON-RPC envelope was untested.** Bad JSON and a missing
 *     `method` are what a broken client actually sends. Nothing proved the door
 *     answers them without a 500 or a leak.
 *
 * The OAuth verifier is stubbed at the `jose` boundary, which is the only way to
 * reach these guards without a real authorization server. Everything else — the
 * ordering, the status codes, the bodies — is the shipped code path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { movingScopes } from "../../convex/lib/aiGrants";
import { clearClientMetadataCache } from "../../convex/lib/mcpClientIdentity";

const verifyMock = vi.fn();

vi.mock("jose", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createRemoteJWKSet: () => () => ({}) as any,
    jwtVerify: (...args: unknown[]) => verifyMock(...args),
  };
});

const ISSUER = "https://clerk.moving-guards-test.example";
const RESOURCE = "https://movingmanifest.test/mcp";
const CLIENT_ID = "guards-test-client";
const SUBJECT = "user_guards_test";

/** A verified access token shaped the way the route requires. */
function verifiedToken(clientId = CLIENT_ID) {
  return {
    protectedHeader: { typ: "at+jwt" },
    payload: {
      sub: SUBJECT,
      exp: Math.floor(Date.now() / 1000) + 600,
      azp: clientId,
      scope: "openid profile email",
    },
  };
}

/**
 * The guards under test run before any `ctx` use, so a throwing stub is the
 * honest ctx here: if a guard ever stops short-circuiting and falls through to
 * Convex, this makes that regression loud instead of silent.
 */
function ctxThatMustNotBeUsed() {
  const explode = (name: string) => () => {
    throw new Error(
      `Guard fell through to ctx.${name} — a request that should have been ` +
        `refused reached the Convex layer.`,
    );
  };
  return {
    runQuery: explode("runQuery"),
    runMutation: explode("runMutation"),
    runAction: explode("runAction"),
    auth: { getUserIdentity: explode("auth.getUserIdentity") },
    storage: {},
    scheduler: {},
  } as any;
}

function request(body: BodyInit | null, init: RequestInit = {}) {
  return new Request(RESOURCE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: "Bearer synthetic.guards.token",
      ...((init.headers as Record<string, string>) ?? {}),
    },
    body,
    ...init,
  });
}

/** `handleMcp` reads its URLs from the environment at call time. */
beforeEach(() => {
  clearClientMetadataCache();
  process.env.MCP_RESOURCE_URL = RESOURCE;
  process.env.CLERK_JWT_ISSUER_DOMAIN = ISSUER;
  verifyMock.mockReset();
  verifyMock.mockResolvedValue(verifiedToken());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function loadRoute() {
  return import("../../convex/httpRoutes/mcp");
}

describe("#220 canonical /mcp metadata grant gate", () => {
  const metadataClientId = "https://client.example/client.json";
  const metadata = JSON.stringify({
    client_id: metadataClientId,
    redirect_uris: ["https://client.example/callback"],
  });
  const protocolRequest = (body: string) => {
    const envelope = JSON.parse(body);
    envelope.params = {
      ...envelope.params,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": { name: "metadata-security-test", version: "1" },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    };
    const req = request(JSON.stringify(envelope));
    req.headers.set("mcp-protocol-version", "2026-07-28");
    req.headers.set("mcp-method", envelope.method);
    if (envelope.params.name) req.headers.set("mcp-name", envelope.params.name);
    return req;
  };
  const listTools = () => protocolRequest(JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "tools/list",
  }));

  it("resolves first contact before discovery so a new connection sees the full catalog", async () => {
    let connected = false;
    const ctx = {
      runMutation: vi.fn(async () => { connected = true; return { grants: [] }; }),
      runQuery: vi.fn(async () => ({ scopes: connected ? movingScopes : [] })),
      runAction: vi.fn(),
    } as any;
    const { handleMcpRequestForTests, STATELESS_MOVING_TOOL_NAMES } = await loadRoute();
    const response = await handleMcpRequestForTests(ctx, listTools());
    expect(response.status).toBe(200);
    expect((await response.json()).result.tools.map((tool: any) => tool.name).sort())
      .toEqual([...STATELESS_MOVING_TOOL_NAMES].sort());
    expect(getFunctionName(ctx.runMutation.mock.calls[0][0])).toBe("aiGrants:touchLegacyConnection");
    expect(ctx.runMutation.mock.calls[0][1]).toMatchObject({ subject: SUBJECT, clientId: CLIENT_ID });
  });

  it("does not retrieve metadata without a grant, and still gives connection guidance", async () => {
    verifyMock.mockResolvedValue(verifiedToken(metadataClientId));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ctx = {
      runMutation: vi.fn(async () => ({ grants: [] })),
      runQuery: vi.fn(async () => ({ scopes: [] })),
      runAction: vi.fn(),
    } as any;
    const { handleMcpRequestForTests } = await loadRoute();
    const response = await handleMcpRequestForTests(ctx, listTools());
    expect(response.status).toBe(200);
    expect((await response.json()).result.tools.map((tool: any) => tool.name))
      .toEqual(["describe_connection", "reduce_connection"]);
    const described = await handleMcpRequestForTests(ctx, protocolRequest(JSON.stringify({
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: "describe_connection", arguments: {} },
    })));
    expect(described.status).toBe(200);
    const result = JSON.parse((await described.json()).result.content[0].text);
    expect(result.connected).toBe(false);
    expect(result.client.registrationMethod).toBe("unknown");
    expect(ctx.runAction).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed on grant lookup failure without making an outbound request", async () => {
    verifyMock.mockResolvedValue(verifiedToken(metadataClientId));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ctx = {
      runMutation: vi.fn(async () => ({ grants: [] })),
      runQuery: vi.fn(async () => { throw new Error("synthetic grant outage"); }),
      runAction: vi.fn(),
    } as any;
    const { handleMcpRequestForTests } = await loadRoute();
    const response = await handleMcpRequestForTests(ctx, listTools());
    expect(response.status).toBe(200);
    expect((await response.json()).result.tools).toHaveLength(2);
    expect(ctx.runAction).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads grants before invoking the protected Node action, keeping digest validation", async () => {
    verifyMock.mockResolvedValue(verifiedToken(metadataClientId));
    const order: string[] = [];
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ctx = {
      runMutation: vi.fn(async () => { order.push("connect"); return { grants: [] }; }),
      runQuery: vi.fn(async () => { order.push("grant"); return { scopes: ["moving.context.read"] }; }),
      runAction: vi.fn(async () => { order.push("metadata"); return metadata; }),
    } as any;
    const { handleMcpRequestForTests } = await loadRoute();
    const response = await handleMcpRequestForTests(ctx, listTools());
    expect(response.status).toBe(200);
    expect(order).toEqual(["connect", "grant", "metadata"]);
    expect(ctx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ clientId: metadataClientId }));
    expect(getFunctionName(ctx.runMutation.mock.calls[0][0])).toBe("aiGrants:touchLegacyConnection");
    expect(ctx.runAction).toHaveBeenCalledWith(expect.anything(), { clientId: metadataClientId });
    expect(getFunctionName(ctx.runAction.mock.calls[0][0])).toBe("mcpClientMetadata:fetchDocument");
    expect((await response.json()).result.tools.map((tool: any) => tool.name))
      .toContain("get_move_brief");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsafe retrieval and swapped self-IDs rather than downgrading to DCR", async () => {
    const { handleMcpRequestForTests } = await loadRoute();
    verifyMock.mockResolvedValue(verifiedToken(metadataClientId));
    const ctx = {
      runMutation: vi.fn(async () => ({ grants: [] })),
      runQuery: vi.fn(async () => ({ scopes: ["moving.context.read"] })),
      runAction: vi.fn(),
    } as any;
    ctx.runAction.mockRejectedValueOnce(new Error("safe fetch refused"));
    let response = await handleMcpRequestForTests(ctx, listTools());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "invalid_client", reason: "metadata_unreachable" });
    ctx.runAction.mockResolvedValueOnce(metadata.replace(metadataClientId, "https://other.example/client.json"));
    response = await handleMcpRequestForTests(ctx, listTools());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "invalid_client", reason: "client_id_mismatch" });
  });
});

describe("canonical /mcp request body cap", () => {
  it("caps requests at exactly 512 KiB, read from source", async () => {
    const { MAX_MCP_REQUEST_BYTES } = await loadRoute();
    // Not a retyped magic number: this asserts the shipped constant is the
    // documented 512 KiB, which is what every boundedness doc claims.
    expect(MAX_MCP_REQUEST_BYTES).toBe(512 * 1024);
  });

  it("refuses an oversized body with 413 request_too_large", async () => {
    const { handleMcpRequestForTests, MAX_MCP_REQUEST_BYTES } = await loadRoute();

    // One byte over the cap, inside a syntactically valid envelope, so the only
    // reason to refuse is the size.
    const filler = "x".repeat(MAX_MCP_REQUEST_BYTES);
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "save_inventory", arguments: { note: filler } },
    });
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(
      MAX_MCP_REQUEST_BYTES,
    );

    const response = await handleMcpRequestForTests(
      ctxThatMustNotBeUsed(),
      request(body),
    );

    expect(response.status).toBe(413);
    const payload = (await response.json()) as {
      error: string;
      error_description: string;
    };
    expect(payload.error).toBe("request_too_large");
    // The refusal must state the actual limit, or a client cannot self-correct.
    expect(payload.error_description).toMatch(/512 KiB/);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not echo the oversized payload back in the refusal", async () => {
    const { handleMcpRequestForTests, MAX_MCP_REQUEST_BYTES } = await loadRoute();

    const marker = "OVERSIZED-PAYLOAD-MARKER";
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "save_inventory", arguments: { note: marker + "x".repeat(MAX_MCP_REQUEST_BYTES) } },
    });

    const response = await handleMcpRequestForTests(
      ctxThatMustNotBeUsed(),
      request(body),
    );

    expect(await response.text()).not.toContain(marker);
  });

  it("enforces the cap only after authentication, so the limit is not public", async () => {
    const { handleMcpRequestForTests, MAX_MCP_REQUEST_BYTES } = await loadRoute();

    // Same oversized body, but no bearer token. An anonymous caller must get the
    // OAuth challenge, never a 413 that discloses the server's request budget.
    const body = "x".repeat(MAX_MCP_REQUEST_BYTES + 1);
    const response = await handleMcpRequestForTests(
      ctxThatMustNotBeUsed(),
      new Request(RESOURCE, { method: "POST", body }),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("request_too_large");
    expect(response.headers.get("WWW-Authenticate")).toContain("Bearer");
    // The challenge must point at the branded discovery document.
    expect(response.headers.get("WWW-Authenticate")).toContain(
      "resource_metadata",
    );
  });

  it("lets a body under the cap past the size guard", async () => {
    const { handleMcpRequestForTests, MAX_MCP_REQUEST_BYTES } = await loadRoute();

    // Comfortably under the cap. This must NOT be a 413 — a cap that is
    // off-by-one in the other direction would break ordinary batch writes.
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: { note: "y".repeat(Math.floor(MAX_MCP_REQUEST_BYTES / 2)) },
    });

    let response: Response;
    try {
      response = await handleMcpRequestForTests(ctxThatMustNotBeUsed(), request(body));
    } catch (error) {
      // Falling through past the size guard is the pass condition here; the
      // strict ctx stub throws once the request reaches Convex, which proves the
      // body was accepted rather than refused for size.
      expect(String(error)).toMatch(/Guard fell through to ctx|fetch|network/i);
      return;
    }

    expect(response.status).not.toBe(413);
  });
});

describe("canonical /mcp malformed JSON-RPC envelopes", () => {
  it("answers a body that is not JSON with a JSON-RPC parse error, not a 500", async () => {
    const { handleMcpRequestForTests } = await loadRoute();

    const response = await handleMcpRequestForTests(
      ctxThatMustNotBeUsed(),
      request("{ this is not json"),
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as {
      jsonrpc: string;
      error: { code: number; message: string };
      id: unknown;
    };
    // -32700 is the JSON-RPC "Parse error" code. A client that gets an HTML
    // error page or a 500 here cannot tell its own bug from an outage.
    expect(payload.jsonrpc).toBe("2.0");
    expect(payload.error.code).toBe(-32700);
    expect(payload.error.message).toMatch(/parse error/i);
    // An unparseable body has no id to correlate with, and inventing one would
    // be worse than null.
    expect(payload.id).toBeNull();
  });

  it("answers a JSON body with no method with a JSON-RPC invalid-request error", async () => {
    const { handleMcpRequestForTests } = await loadRoute();

    const response = await handleMcpRequestForTests(
      ctxThatMustNotBeUsed(),
      request(JSON.stringify({ jsonrpc: "2.0", id: 1 })),
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as {
      error: { code: number; message: string };
    };
    // -32600 is "Invalid Request": well-formed JSON, not a valid JSON-RPC
    // message. Distinct from the parse error above on purpose.
    expect(payload.error.code).toBe(-32600);
    expect(payload.error.message).toMatch(/JSON-RPC/i);
  });

  it("leaks no stack trace or internal path in either malformed-envelope reply", async () => {
    const { handleMcpRequestForTests } = await loadRoute();

    for (const body of ["{ this is not json", JSON.stringify({ jsonrpc: "2.0", id: 1 })]) {
      const response = await handleMcpRequestForTests(
        ctxThatMustNotBeUsed(),
        request(body),
      );
      const text = await response.text();
      expect(text, `leak in reply to ${body.slice(0, 20)}`).not.toMatch(
        /at Object\.|node_modules|\.ts:\d+|\/Users\/|convex\/httpRoutes/,
      );
    }
  });

  it("rejects a client that will not accept both JSON and SSE", async () => {
    const { handleMcpRequestForTests } = await loadRoute();

    // Streamable HTTP requires both. Found while writing these tests: the
    // negotiation runs before envelope parsing, so a client with a wrong Accept
    // header gets 406 rather than a confusing parse error.
    const response = await handleMcpRequestForTests(
      ctxThatMustNotBeUsed(),
      new Request(RESOURCE, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization: "Bearer synthetic.guards.token",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    );

    expect(response.status).toBe(406);
    const payload = (await response.json()) as { error: { message: string } };
    expect(payload.error.message).toMatch(/text\/event-stream/);
  });

  it("refuses a non-POST method on /mcp before parsing anything", async () => {
    const { handleMcpRequestForTests } = await loadRoute();

    const response = await handleMcpRequestForTests(
      ctxThatMustNotBeUsed(),
      new Request(RESOURCE, { method: "PUT" }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST,OPTIONS");
  });

  it("answers the CORS preflight without requiring a credential", async () => {
    const { handleMcpRequestForTests } = await loadRoute();

    const response = await handleMcpRequestForTests(
      ctxThatMustNotBeUsed(),
      new Request(RESOURCE, { method: "OPTIONS" }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("404s an unknown path rather than falling through to the tool layer", async () => {
    const { handleMcpRequestForTests } = await loadRoute();

    const response = await handleMcpRequestForTests(
      ctxThatMustNotBeUsed(),
      new Request("https://movingmanifest.test/mcp/not-a-real-path", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(404);
  });
});
