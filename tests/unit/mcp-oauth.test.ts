import { afterEach, describe, expect, it, vi } from "vitest";

import {
  mcpBearerChallenge,
  mcpProtectedResourceMetadata,
  mcpProtectedResourceMetadataUrl,
  mcpResourceUrl,
} from "@/lib/mcp-oauth";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MCP OAuth helpers", () => {
  it("builds protected-resource metadata for the MCP endpoint", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";
    process.env.CLERK_JWT_ISSUER_DOMAIN = "https://clerk.example.test/";
    const request = new Request("https://ignored.example/api/mcp");

    expect(mcpResourceUrl(request)).toBe("https://movingmanifest.test/api/mcp");
    expect(mcpProtectedResourceMetadataUrl(request)).toBe(
      "https://movingmanifest.test/.well-known/oauth-protected-resource/api/mcp"
    );
    expect(mcpProtectedResourceMetadata(request)).toEqual({
      resource: "https://movingmanifest.test/api/mcp",
      authorization_servers: ["https://clerk.example.test"],
      scopes_supported: ["openid", "profile", "email"],
      bearer_methods_supported: ["header"],
      resource_signing_alg_values_supported: ["RS256"],
      resource_name: "MovingManifest",
      resource_documentation: "https://movingmanifest.test/mcp",
    });
  });

  it("returns an MCP Bearer challenge with resource metadata and scopes", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";
    const request = new Request("https://movingmanifest.test/api/mcp");

    expect(mcpBearerChallenge(request)).toBe(
      'Bearer realm="MovingManifest MCP", resource_metadata="https://movingmanifest.test/.well-known/oauth-protected-resource/api/mcp", scope="openid profile email"'
    );
  });

  it("uses the request origin for Vercel preview and deployment hosts", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.com";
    const request = new Request(
      "https://movingmanifest-git-oauth-jarvies-projects.vercel.app/api/mcp"
    );

    expect(mcpResourceUrl(request)).toBe(
      "https://movingmanifest-git-oauth-jarvies-projects.vercel.app/api/mcp"
    );
    expect(mcpProtectedResourceMetadataUrl(request)).toBe(
      "https://movingmanifest-git-oauth-jarvies-projects.vercel.app/.well-known/oauth-protected-resource/api/mcp"
    );
  });
});
