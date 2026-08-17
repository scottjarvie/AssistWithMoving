/**
 * MOVE-394 at the route, not just at the helper.
 *
 * `tests/unit/mcp-api-key-transport.test.ts` proves the two helpers behave —
 * `apiKeyFromRequest` ignores a `?key=` credential and `requestHasQueryStringKey`
 * detects one. Nothing proved that the *route* turns that into the right refusal:
 * before this file, the string `query_credentials_rejected` appeared in zero
 * tests. A correct helper wired to a handler that answered a generic 401, or that
 * echoed the key back, or that quietly accepted it, would have passed everything.
 *
 * This is a privacy protection, not a formatting nicety. A key in a URL has
 * already been written to browser history, proxy and server access logs,
 * referrer headers, and analytics. So the assertions below cover three things:
 * the refusal happens, it tells the caller to rotate, and the key itself never
 * appears anywhere the refusal can reach — response body, headers, or logs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DELETE as deleteMcpEndpoint,
  GET as getMcpEndpoint,
  POST as postMcpEndpoint,
} from "../../src/app/api/mcp/route";
import { generateApiKeySecret } from "../../convex/lib/apiKeys";

const originalEnv = { ...process.env };

/** A realistic key, so a leak test cannot pass on an unrealistic short string. */
let key: string;

/** Every console channel, captured so "never logged" is an actual assertion. */
let logged: string[];

beforeEach(() => {
  process.env = { ...originalEnv, NEXT_PUBLIC_APP_URL: "https://movingmanifest.test" };
  key = generateApiKeySecret();
  logged = [];
  for (const channel of ["log", "info", "warn", "error", "debug", "trace"] as const) {
    vi.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((arg) => String(arg)).join(" "));
    });
  }
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

function queryKeyRequest(method: string, body?: unknown) {
  return new Request(`https://ignored.example/api/mcp?key=${key}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function bodyText(response: Response) {
  return response.clone().text();
}

describe("/api/mcp refuses an API key supplied in the URL (MOVE-394)", () => {
  it("answers POST with 401 query_credentials_rejected and rotate guidance", async () => {
    const response = await postMcpEndpoint(
      queryKeyRequest("POST", { jsonrpc: "2.0", id: 1, method: "tools/list" }),
    );

    expect(response.status).toBe(401);

    const payload = (await response.json()) as {
      error: { code: string; message: string };
    };
    expect(payload.error.code).toBe("query_credentials_rejected");

    // The message has to do three jobs: say the URL form is refused, say where
    // the key belongs instead, and say the leaked key must be rotated. A refusal
    // that omits the rotation advice leaves an exposed credential in place.
    expect(payload.error.message).toMatch(/\?key=/);
    expect(payload.error.message).toMatch(/query string/i);
    expect(payload.error.message).toMatch(/Authorization: Bearer mmk_/);
    expect(payload.error.message).toMatch(/x-api-key/);
    expect(payload.error.message).toMatch(/rotate/i);
    // And it must explain *why*, or the next person re-adds the query form.
    expect(payload.error.message).toMatch(/log|history|referrer/i);
  });

  it("refuses the same way on GET and DELETE, not only POST", async () => {
    // All three verbs share one handler today. Asserting each one means a future
    // refactor that splits them cannot leave a URL-credential hole on one verb.
    for (const [verb, handler] of [
      ["GET", getMcpEndpoint],
      ["DELETE", deleteMcpEndpoint],
    ] as const) {
      const response = await handler(queryKeyRequest(verb));
      expect(response.status, `${verb} status`).toBe(401);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code, `${verb} code`).toBe(
        "query_credentials_rejected",
      );
    }
  });

  it("never echoes the key in the response body, headers, or any log line", async () => {
    const response = await postMcpEndpoint(
      queryKeyRequest("POST", { jsonrpc: "2.0", id: 1, method: "tools/list" }),
    );

    const text = await bodyText(response);
    expect(text, "refusal body must not contain the key").not.toContain(key);
    // Nor the secret half alone, in case something splits the prefix off.
    const secretPart = key.slice(key.indexOf("_", 4) + 1);
    if (secretPart.length > 8) {
      expect(text, "refusal body must not contain the key secret").not.toContain(
        secretPart,
      );
    }

    for (const [name, value] of response.headers.entries()) {
      expect(value, `header ${name} must not contain the key`).not.toContain(key);
    }

    // The whole point of rejecting URL credentials is to keep them out of logs.
    // A refusal that logs the offending URL would defeat its own purpose.
    for (const line of logged) {
      expect(line, "no log line may contain the key").not.toContain(key);
    }
  });

  it("still challenges without advertising OAuth on this door", async () => {
    const response = await postMcpEndpoint(
      queryKeyRequest("POST", { jsonrpc: "2.0", id: 1, method: "tools/list" }),
    );

    const challenge = response.headers.get("WWW-Authenticate");
    expect(challenge).toBeTruthy();
    // /api/mcp is key-only. Advertising resource metadata here is exactly what
    // dead-ends an OAuth client on the wrong door.
    expect(challenge).not.toContain("resource_metadata");
    expect(challenge).not.toContain(key);
  });

  it("distinguishes a URL credential from no credential at all", async () => {
    // Both are 401, but the codes differ, and that difference is the whole
    // reason `requestHasQueryStringKey` exists: a caller still on the legacy URL
    // form needs migration guidance, not a generic "send a key".
    const noCredential = await postMcpEndpoint(
      new Request("https://ignored.example/api/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    );
    const payload = (await noCredential.json()) as { error: { code: string } };

    expect(noCredential.status).toBe(401);
    expect(payload.error.code).toBe("unauthorized");
    expect(payload.error.code).not.toBe("query_credentials_rejected");
  });

  // A client that moved its key into a header but left the old `?key=` in its
  // configured URL must NOT be refused. That precedence is asserted directly on
  // the extractor in `tests/unit/mcp-api-key-transport.test.ts` ("a header key
  // still wins even if a stray ?key= is also present"), because reaching it
  // through the route means entering the real mcp-handler and its REST call —
  // out of scope for a transport-refusal test.

  it("ignores an empty ?key= rather than refusing a legitimate request", async () => {
    const response = await postMcpEndpoint(
      new Request("https://ignored.example/api/mcp?key=", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    );

    const payload = (await response.json()) as { error: { code: string } };
    // No key was actually supplied, so this is the ordinary missing-credential
    // case, not a leaked-credential case.
    expect(payload.error.code).toBe("unauthorized");
  });
});
