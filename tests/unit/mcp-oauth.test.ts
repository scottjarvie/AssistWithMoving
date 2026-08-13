import { afterEach, describe, expect, it, vi } from "vitest";

import {
  mcpBearerChallenge,
  mcpOAuthConnectUrl,
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
  it("builds KEY-ONLY protected-resource metadata for /api/mcp (no OAuth advertised)", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";
    // Even if a Clerk issuer is configured, /api/mcp must NOT advertise it — it
    // is the API-key door and cannot consume OAuth tokens. See mcp-oauth.ts.
    process.env.CLERK_JWT_ISSUER_DOMAIN = "https://clerk.example.test/";
    const request = new Request("https://ignored.example/api/mcp");

    expect(mcpResourceUrl(request)).toBe("https://movingmanifest.test/api/mcp");
    expect(mcpProtectedResourceMetadataUrl(request)).toBe(
      "https://movingmanifest.test/.well-known/oauth-protected-resource/api/mcp"
    );
    expect(mcpProtectedResourceMetadata(request)).toEqual({
      resource: "https://movingmanifest.test/api/mcp",
      authorization_servers: [],
      bearer_methods_supported: ["header"],
      resource_name: "Assist With Moving",
      resource_documentation: "https://movingmanifest.test/mcp/guide",
    });
  });

  it("points OAuth clients at the /mcp front door", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";
    const request = new Request("https://ignored.example/api/mcp");

    expect(mcpOAuthConnectUrl(request)).toBe(
      "https://movingmanifest.test/mcp"
    );
  });

  it("returns a KEY-ONLY Bearer challenge that routes OAuth clients to the /mcp front door", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";
    const request = new Request("https://movingmanifest.test/api/mcp");

    const challenge = mcpBearerChallenge(request);

    expect(challenge).toBe(
      'Bearer realm="Assist With Moving MCP API key", error="invalid_token", error_description="This endpoint accepts Assist With Moving API keys (mmk_...). To connect with OAuth sign-in instead, point your agent at https://movingmanifest.test/mcp."'
    );
    // The /api/mcp challenge must never lure OAuth clients into a dead-end flow.
    expect(challenge).not.toContain("resource_metadata");
    expect(challenge.toLowerCase()).not.toContain("clerk");
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
