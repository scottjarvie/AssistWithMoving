import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GET as getMcpEndpoint,
  POST as postMcpEndpoint,
} from "../../src/app/api/mcp/route";
import { GET as getProtectedResourceMetadata } from "../../src/app/.well-known/oauth-protected-resource/[[...resource]]/route";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("remote MCP OAuth discovery route behavior", () => {
  it("returns a KEY-ONLY challenge before tool access (no OAuth lure)", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";

    const response = await getMcpEndpoint(
      new Request("https://ignored.example/api/mcp")
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "unauthorized",
        message:
          "This endpoint accepts an Assist With Moving API key via 'Authorization: Bearer mmk_...'. To connect with OAuth sign-in instead (no key needed), point your agent at https://movingmanifest.com/mcp.",
      },
    });
    const challenge = response.headers.get("WWW-Authenticate");
    expect(challenge).toBe(
      'Bearer realm="Assist With Moving MCP API key", error="invalid_token", error_description="This endpoint accepts Assist With Moving API keys (mmk_...). To connect with OAuth sign-in instead, point your agent at https://movingmanifest.test/mcp."'
    );
    // /api/mcp must not advertise OAuth — that is what dead-ends OAuth clients.
    expect(challenge).not.toContain("resource_metadata");
  });

  it("protects POST tool calls the same way when no API key is present", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";

    const response = await postMcpEndpoint(
      new Request("https://ignored.example/api/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
      })
    );

    expect(response.status).toBe(401);
    const challenge = response.headers.get("WWW-Authenticate");
    expect(challenge).toContain("https://movingmanifest.test/mcp");
    expect(challenge).not.toContain("https://movingmanifest.test/api/mcp");
    expect(challenge).not.toContain("resource_metadata");
  });

  it("serves KEY-ONLY protected-resource metadata for /api/mcp (no auth server)", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";
    // A configured Clerk issuer must NOT leak into the /api/mcp metadata.
    process.env.CLERK_JWT_ISSUER_DOMAIN = "https://clerk.example.test/";

    const response = await getProtectedResourceMetadata(
      new Request(
        "https://ignored.example/.well-known/oauth-protected-resource/api/mcp"
      )
    );

    await expect(response.json()).resolves.toEqual({
      resource: "https://movingmanifest.test/api/mcp",
      authorization_servers: [],
      bearer_methods_supported: ["header"],
      resource_name: "Assist With Moving",
      resource_documentation: "https://movingmanifest.test/mcp/guide",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
