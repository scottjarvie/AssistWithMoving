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
  it("returns an OAuth protected-resource challenge before tool access", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";

    const response = await getMcpEndpoint(
      new Request("https://ignored.example/api/mcp")
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "unauthorized",
        message:
          "Connect with OAuth or provide a MovingManifest API key via 'Authorization: Bearer mmk_...'.",
      },
    });
    expect(response.headers.get("WWW-Authenticate")).toBe(
      'Bearer realm="MovingManifest MCP", resource_metadata="https://movingmanifest.test/.well-known/oauth-protected-resource/api/mcp", scope="openid profile email"'
    );
  });

  it("protects POST tool calls the same way when no OAuth token or API key is present", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";

    const response = await postMcpEndpoint(
      new Request("https://ignored.example/api/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
      })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain(
      'resource_metadata="https://movingmanifest.test/.well-known/oauth-protected-resource/api/mcp"'
    );
  });

  it("serves protected-resource metadata for the branded MCP resource", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";
    process.env.CLERK_JWT_ISSUER_DOMAIN = "https://clerk.example.test/";

    const response = await getProtectedResourceMetadata(
      new Request(
        "https://ignored.example/.well-known/oauth-protected-resource/api/mcp"
      )
    );

    await expect(response.json()).resolves.toEqual({
      resource: "https://movingmanifest.test/api/mcp",
      authorization_servers: ["https://clerk.example.test"],
      scopes_supported: ["openid", "profile", "email"],
      bearer_methods_supported: ["header"],
      resource_signing_alg_values_supported: ["RS256"],
      resource_name: "MovingManifest",
      resource_documentation: "https://movingmanifest.test/mcp",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
