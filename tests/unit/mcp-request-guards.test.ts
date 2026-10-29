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
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { GRANT_CONSENT_POLICY, grantCatalogFingerprint } from "../../convex/lib/aiGrants";
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

  it("validates metadata without domain scopes and still gives connection guidance", async () => {
    verifyMock.mockResolvedValue(verifiedToken(metadataClientId));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ctx = {
      runMutation: vi.fn(async () => ({ grants: [] })),
      runQuery: vi.fn(async () => ({ scopes: [] })),
      runAction: vi.fn(async () => metadata),
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
    expect(result.client.registrationMethod).toBe("clientIdMetadataDocument");
    expect(ctx.runAction).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed on grant lookup failure after required safe metadata validation", async () => {
    verifyMock.mockResolvedValue(verifiedToken(metadataClientId));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ctx = {
      runMutation: vi.fn(async () => ({ grants: [] })),
      runQuery: vi.fn(async () => { throw new Error("synthetic grant outage"); }),
      runAction: vi.fn(async () => metadata),
    } as any;
    const { handleMcpRequestForTests } = await loadRoute();
    const response = await handleMcpRequestForTests(ctx, listTools());
    expect(response.status).toBe(200);
    expect((await response.json()).result.tools).toHaveLength(2);
    expect(ctx.runAction).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates via the protected Node action before atomically connecting and reading grants", async () => {
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
    expect(order).toEqual(["metadata", "connect", "grant"]);
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
    expect(ctx.runMutation).not.toHaveBeenCalled();
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


describe("R1 metadata validation has no rejected-client database effects", () => {
  const clientId = "https://atomic-client.example/client.json";
  const valid = JSON.stringify({ client_id: clientId, redirect_uris: ["https://atomic-client.example/callback"] });
  const consent = { consentPolicyVersion: GRANT_CONSENT_POLICY, catalogFingerprint: grantCatalogFingerprint() };
  async function fixture(unbound: boolean) {
    const t = convexTest(schema, import.meta.glob("../../convex/**/*.ts"));
    const householdId = await t.run(async ctx => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", { clerkUserId: SUBJECT, email: "metadata@example.test", name: "Synthetic metadata owner", appRole: "member", status: "active", createdAt: now, updatedAt: now, lastSeenAt: now });
      const householdId = await ctx.db.insert("households", { name: "Synthetic metadata", ownerUserId: userId, createdByUserId: userId, createdAt: now, updatedAt: now });
      await ctx.db.insert("householdMemberships", { householdId, userId, role: "owner", status: "active", apiAccessStatus: "enabled", createdByUserId: userId, createdAt: now, updatedAt: now });
      return householdId;
    });
    const owner = t.withIdentity({ subject: SUBJECT });
    if (unbound) await owner.mutation(api.aiGrants.approve, { ...consent, householdId, label: "Unbound approval" });
    const snapshot = () => t.run(async ctx => ({ grants: await ctx.db.query("aiGrants").collect(), activities: await ctx.db.query("aiGrantActivities").collect(), audits: await ctx.db.query("auditLogs").collect() }));
    return { t, owner, householdId, snapshot };
  }
  function listRequest() {
    const req = request(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "atomic-test", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} } } }));
    req.headers.set("mcp-protocol-version", "2026-07-28");
    req.headers.set("mcp-method", "tools/list");
    return req;
  }
  // Actual HTTP/gateway handlers and direct internal legacy handlers share a
  // real DB. Only token verification and the protected outbound fetch are fake.
  for (const claim of ["https://client.example", "https://CLIENT.example:443", "https://client.example/a/../"]) {
    for (const firstDoor of ["canonical", "persisted"]) {
      it(`keeps reductions across both doors and normalized tokens: ${claim}, first ${firstDoor}`, async () => {
        const f = await fixture(false);
        const normalized = new URL(claim).toString();
        const ctx = {
          runQuery: (ref: any, args: any) => f.t.query(ref, args),
          runMutation: (ref: any, args: any) => f.t.mutation(ref, args),
          runAction: async () => JSON.stringify({ client_id: normalized, redirect_uris: ["https://client.example/callback"] }),
        } as any;
        const { createLegacyGrantGate } = await import("../../convex/http");
        const { handleMcpRequestForTests } = await loadRoute();
        const canonical = async (id = claim) => {
          const token = verifiedToken(id);
          verifyMock.mockResolvedValue({ ...token, payload: { ...token.payload, client_id: normalized } });
          const response = await handleMcpRequestForTests(ctx, listRequest());
          expect(response.status).toBe(200);
          return (await response.json()).result.tools.map((tool: any) => tool.name);
        };
        const persisted = (id = claim) => createLegacyGrantGate(ctx)({} as any, { identity: { subject: SUBJECT, claims: { client_id: id, azp: normalized } }, toolName: "list_moves", mode: "list" } as any);
        if (firstDoor === "canonical") await canonical(); else expect((await persisted()).allowed).toBe(true);
        const initial = await f.snapshot();
        expect(initial.grants).toHaveLength(1);
        expect(initial.grants[0]).toMatchObject({ clientId: normalized, scopeChoice: "full", moveScope: "allMoves", expiryChoice: "none" });
        const expiresAt = Date.now() + 200_000;
        const caller = { subject: SUBJECT, claims: { client_id: claim } };
        await f.t.mutation(internal.aiGrants.reduceLegacyConnection, { caller, expectedVersion: 1, scopes: ["moving.queue.work"], expiresAt });
        expect(await canonical()).not.toContain("get_move_brief");
        expect((await persisted()).allowed).toBe(false);
        expect(await canonical(normalized)).not.toContain("get_move_brief");
        expect((await persisted(normalized)).allowed).toBe(false);
        expect((await f.t.query(internal.mcpTools.getAgentContext, { caller })).connectionVersion).toBe(2);
        const narrowed = await f.snapshot();
        expect(narrowed.grants).toHaveLength(1);
        expect(narrowed.grants[0]).toMatchObject({ expiresAt, scopes: ["moving.queue.work"] });
        await expect(f.t.mutation(internal.aiGrants.reduceLegacyConnection, { caller, expectedVersion: 1, scopes: [] })).rejects.toThrow(/changed/);
        expect(await f.snapshot()).toEqual(narrowed);
        await f.t.mutation(internal.aiGrants.reduceConnection, { subject: SUBJECT, clientId: normalized, expectedVersion: 2, expiresAt: expiresAt - 10_000, scopes: [] });
        expect(await canonical()).toEqual(["describe_connection", "reduce_connection"]);
        expect((await persisted()).allowed).toBe(false);
        await f.t.mutation(internal.aiGrants.reduceLegacyConnection, { caller, expectedVersion: 3, action: "pause" });
        expect(await canonical()).toEqual(["describe_connection", "reduce_connection"]);
        expect((await persisted(normalized)).allowed).toBe(false);
        const row = (await f.snapshot()).grants[0];
        await f.owner.mutation(api.aiGrants.revoke, { grantId: row._id, expectedVersion: row.version });
        const revoked = await f.snapshot();
        await canonical(normalized);
        expect((await persisted()).allowed).toBe(false);
        expect(await f.snapshot()).toEqual(revoked);
      });
    }
  }

  for (const door of ["canonical", "persisted"]) {
    for (const restriction of ["expired", "revoke-during-metadata", "invalid-metadata"]) {
      it(`honors raw history on ${door}: ${restriction}`, async () => {
        const f = await fixture(false);
        const claim = "https://CLIENT.example:443";
        const normalized = "https://client.example/";
        await f.t.mutation(internal.aiGrants.touchLegacyConnection, { subject: SUBJECT, clientId: `legacy:${claim}` });
        const row = (await f.snapshot()).grants[0];
        if (restriction === "expired") await f.t.run(ctx => ctx.db.patch(row._id, { expiresAt: Date.now() - 1, expiryChoice: undefined }));
        let expected = await f.snapshot();
        const ctx = {
          runQuery: (ref: any, args: any) => f.t.query(ref, args),
          runMutation: (ref: any, args: any) => f.t.mutation(ref, args),
          runAction: async () => {
            if (restriction === "revoke-during-metadata") {
              await f.owner.mutation(api.aiGrants.revoke, { grantId: row._id, expectedVersion: row.version });
              expected = await f.snapshot();
            }
            return JSON.stringify({ client_id: restriction === "invalid-metadata" ? "https://unrelated.example/" : normalized, redirect_uris: ["https://client.example/callback"] });
          },
        } as any;
        if (door === "canonical") {
          verifyMock.mockResolvedValue(verifiedToken(claim));
          const { handleMcpRequestForTests } = await loadRoute();
          const response = await handleMcpRequestForTests(ctx, listRequest());
          expect(response.status).toBe(restriction === "invalid-metadata" ? 401 : 200);
          if (response.status === 200) expect((await response.json()).result.tools.map((tool: any) => tool.name)).toEqual(["describe_connection", "reduce_connection"]);
        } else {
          vi.spyOn(console, "error").mockImplementation(() => undefined);
          const { createLegacyGrantGate } = await import("../../convex/http");
          expect((await createLegacyGrantGate(ctx)({} as any, { identity: { subject: SUBJECT, claims: { client_id: claim } }, toolName: "list_moves", mode: "list" } as any)).allowed).toBe(false);
        }
        expect(await f.snapshot()).toEqual(expected);
      });
    }
  }

  it.each([
    { client_id: "sibling-b", azp: "sibling-a" },
    { client_id: "legacy:https://client.example/", azp: "legacy:https://client.example/" },
  ])("rejects ambiguous or supplied history-alias claims %j on both doors and direct legacy handlers without effects", async (invalidClaims) => {
    const f = await fixture(true);
    const before = await f.snapshot();
    const token = verifiedToken("sibling-a");
    const claims = { ...token.payload, ...invalidClaims };
    verifyMock.mockResolvedValue({ ...token, payload: claims });
    const ctx = {
      runQuery: (ref: any, args: any) => f.t.query(ref, args),
      runMutation: (ref: any, args: any) => f.t.mutation(ref, args),
      runAction: vi.fn(),
    } as any;
    const { createLegacyGrantGate } = await import("../../convex/http");
    const { handleMcpRequestForTests } = await loadRoute();
    expect((await handleMcpRequestForTests(ctx, listRequest())).status).toBe(401);
    expect((await createLegacyGrantGate(ctx)({} as any, { identity: { subject: SUBJECT, claims }, toolName: "list_moves", mode: "list" } as any)).allowed).toBe(false);
    const caller = { subject: SUBJECT, claims };
    await expect(f.t.query(internal.mcpTools.getAgentContext, { caller })).rejects.toThrow(/unambiguous/);
    await expect(f.t.mutation(internal.aiGrants.reduceLegacyConnection, { caller, expectedVersion: 1, scopes: [] })).rejects.toThrow(/unambiguous/);
    expect(ctx.runAction).not.toHaveBeenCalled();
    expect(await f.snapshot()).toEqual(before);
  });

  it("serializes first contact through both real doors after metadata validation", async () => {
    const f = await fixture(true);
    const claim = "https://CLIENT.example:443";
    const normalized = "https://client.example/";
    verifyMock.mockResolvedValue(verifiedToken(claim));
    const ctx = {
      runQuery: (ref: any, args: any) => f.t.query(ref, args),
      runMutation: (ref: any, args: any) => f.t.mutation(ref, args),
      runAction: async () => JSON.stringify({ client_id: normalized, redirect_uris: ["https://client.example/callback"] }),
    } as any;
    const { createLegacyGrantGate } = await import("../../convex/http");
    const { handleMcpRequestForTests } = await loadRoute();
    const [canonical, persisted] = await Promise.all([
      handleMcpRequestForTests(ctx, listRequest()),
      createLegacyGrantGate(ctx)({} as any, { identity: { subject: SUBJECT, claims: { client_id: claim } }, toolName: "list_moves", mode: "list" } as any),
    ]);
    expect(canonical.status).toBe(200);
    expect(persisted.allowed).toBe(true);
    const after = await f.snapshot();
    expect(after.grants).toHaveLength(1);
    expect(after.grants[0].clientId).toBe(normalized);
    expect(after.activities.filter(row => row.type === "clientBound")).toHaveLength(1);
  });

  for (const invalid of ["unreachable", "malformed", "wrong-id"]) {
    it(`also refuses ${invalid} on the persisted compatibility door before binding`, async () => {
      const f = await fixture(true);
      const before = await f.snapshot();
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { createLegacyGrantGate } = await import("../../convex/http");
      const gate = createLegacyGrantGate({
        runMutation: (ref: any, args: any) => f.t.mutation(ref, args),
        runAction: async () => {
          if (invalid === "unreachable") throw new Error("Synthetic unreachable metadata");
          return invalid === "malformed" ? "[" : valid.replace(clientId, "https://other.example/client.json");
        },
      } as any);
      const result = await gate({} as any, { identity: { subject: SUBJECT, claims: { client_id: clientId } }, toolName: "list_moves", mode: "list" } as any);
      expect(result.allowed).toBe(false);
      expect(await f.snapshot()).toEqual(before);
    });
  }
  it("binds a validated first contact once, without widening its unbound chosen approval", async () => {
    const f = await fixture(true);
    const row = (await f.snapshot()).grants[0];
    await f.owner.mutation(api.aiGrants.updateLimits, { ...consent, grantId: row._id, expectedVersion: 1, scopes: ["moving.context.read"], scopeIntent: "chosen", expiresInDays: 3, expiryIntent: "chosen" });
    const chosen = (await f.snapshot()).grants[0];
    verifyMock.mockResolvedValue(verifiedToken(clientId));
    const { handleMcpRequestForTests } = await loadRoute();
    const ctx = {
      runQuery: (ref: any, args: any) => f.t.query(ref, args),
      runMutation: (ref: any, args: any) => f.t.mutation(ref, args),
      runAction: async () => valid,
    } as any;
    expect((await handleMcpRequestForTests(ctx, listRequest())).status).toBe(200);
    const bound = (await f.snapshot()).grants[0];
    expect(bound).toMatchObject({ clientId, scopes: chosen.scopes, expiresAt: chosen.expiresAt, version: chosen.version });
    const after = await f.snapshot();
    expect((await handleMcpRequestForTests(ctx, listRequest())).status).toBe(200);
    expect(await f.snapshot()).toEqual(after);
  });
  for (const unbound of [false, true]) {
    for (const invalid of ["unreachable", "malformed", "wrong-id"]) {
      it(`leaves grants, bindings, slots and receipts exact for ${invalid}, unbound=${unbound}`, async () => {
        const f = await fixture(unbound);
        const before = await f.snapshot();
        verifyMock.mockResolvedValue(verifiedToken(clientId));
        const { handleMcpRequestForTests } = await loadRoute();
        const ctx = {
          runQuery: (ref: any, args: any) => f.t.query(ref, args),
          runMutation: vi.fn((ref: any, args: any) => f.t.mutation(ref, args)),
          runAction: async () => {
            if (invalid === "unreachable") throw new Error("Synthetic unreachable metadata");
            return invalid === "malformed" ? "[" : valid.replace(clientId, "https://other.example/client.json");
          },
        } as any;
        expect((await handleMcpRequestForTests(ctx, listRequest())).status).toBe(401);
        expect(ctx.runMutation).not.toHaveBeenCalled();
        expect(await f.snapshot()).toEqual(before);
      });
    }
  }
  for (const unbound of [false, true]) {
    it(`re-reads alias refusal committed during metadata I/O; unbound=${unbound}`, async () => {
      const f = await fixture(unbound);
      verifyMock.mockResolvedValue(verifiedToken(clientId));
      const { handleMcpRequestForTests } = await loadRoute();
      let refusedSnapshot: Awaited<ReturnType<typeof f.snapshot>>;
      const ctx = {
        runQuery: (ref: any, args: any) => f.t.query(ref, args),
        runMutation: (ref: any, args: any) => f.t.mutation(ref, args),
        runAction: async () => {
          // Another request binds the alias and the person revokes it while
          // this request is waiting on the required metadata document.
          await f.t.mutation(internal.aiGrants.touchLegacyConnection, { subject: SUBJECT, clientId: `legacy:${clientId}` });
          const row = (await f.snapshot()).grants[0];
          await f.owner.mutation(api.aiGrants.revoke, { grantId: row._id, expectedVersion: row.version });
          refusedSnapshot = await f.snapshot();
          return valid;
        },
      } as any;
      const response = await handleMcpRequestForTests(ctx, listRequest());
      expect(response.status).toBe(200);
      expect((await response.json()).result.tools.map((tool: any) => tool.name)).toEqual(["describe_connection", "reduce_connection"]);
      expect(await f.snapshot()).toEqual(refusedSnapshot!);
      expect((await f.snapshot()).grants).toHaveLength(1);
    });
  }
  it("binds valid metadata only once and honors a refusal over an old unbound duplicate", async () => {
    const f = await fixture(true);
    await f.owner.mutation(api.aiGrants.approve, { ...consent, householdId: f.householdId, label: "Newer approval" });
    verifyMock.mockResolvedValue(verifiedToken(clientId));
    let afterRefusal: Awaited<ReturnType<typeof f.snapshot>>;
    const ctx = {
      runQuery: (ref: any, args: any) => f.t.query(ref, args),
      runMutation: (ref: any, args: any) => f.t.mutation(ref, args),
      runAction: async () => {
        const rows = (await f.snapshot()).grants;
        const latest = rows[rows.length - 1];
        await f.owner.mutation(api.aiGrants.revoke, { grantId: latest._id, expectedVersion: latest.version });
        afterRefusal = await f.snapshot();
        return valid;
      },
    } as any;
    const { handleMcpRequestForTests } = await loadRoute();
    const response = await handleMcpRequestForTests(ctx, listRequest());
    expect((await response.json()).result.tools).toHaveLength(2);
    expect(await f.snapshot()).toEqual(afterRefusal!);
    expect((await f.snapshot()).grants.every(row => row.clientId === undefined)).toBe(true);
  });
});
