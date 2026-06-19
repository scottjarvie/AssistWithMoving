import { describe, expect, it, vi } from "vitest";

import {
  bearerChallengeParams,
  oauthDiscoveryProofResults,
  runOauthDiscoveryProbe,
} from "../../scripts/mcp-oauth-discovery-proof.mjs";

describe("MCP OAuth discovery proof", () => {
  it("parses Bearer challenge params", () => {
    expect(
      bearerChallengeParams(
        'Bearer realm="MovingManifest MCP", resource_metadata="https://movingmanifest.test/.well-known/oauth-protected-resource/api/mcp", scope="openid profile email"'
      )
    ).toEqual({
      realm: "MovingManifest MCP",
      resource_metadata:
        "https://movingmanifest.test/.well-known/oauth-protected-resource/api/mcp",
      scope: "openid profile email",
    });
  });

  it("passes for the expected protected-resource and auth-server metadata", () => {
    const results = oauthDiscoveryProofResults({
      endpointUrl: "https://movingmanifest.test/api/mcp",
      endpointStatus: 401,
      challenge: {
        resource_metadata:
          "https://movingmanifest.test/.well-known/oauth-protected-resource/api/mcp",
      },
      resourceMetadata: {
        resource: "https://movingmanifest.test/api/mcp",
        authorization_servers: ["https://clerk.example.test"],
        scopes_supported: ["openid", "profile", "email"],
      },
      authMetadata: {
        registration_endpoint: "https://clerk.example.test/oauth/register",
        authorization_endpoint: "https://clerk.example.test/oauth/authorize",
        token_endpoint: "https://clerk.example.test/oauth/token",
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
      },
    });

    expect(results.every((result) => result.status === "pass")).toBe(true);
  });

  it("blocks when the OAuth challenge omits resource_metadata", () => {
    expect(
      oauthDiscoveryProofResults({
        endpointUrl: "https://movingmanifest.test/api/mcp",
        endpointStatus: 401,
        challenge: {},
        resourceMetadata: null,
        authMetadata: null,
      })
    ).toContainEqual(
      expect.objectContaining({
        status: "blocked",
        label: "MCP challenge metadata URL",
      })
    );
  });

  it("uses read-only GET discovery calls only", async () => {
    const fetchFn = vi.fn(async (url) => {
      if (url === "https://movingmanifest.test/api/mcp") {
        return new Response("{}", {
          status: 401,
          headers: {
            "WWW-Authenticate":
              'Bearer resource_metadata="https://movingmanifest.test/.well-known/oauth-protected-resource/api/mcp", scope="openid profile email"',
          },
        });
      }
      if (
        url ===
        "https://movingmanifest.test/.well-known/oauth-protected-resource/api/mcp"
      ) {
        return Response.json({
          resource: "https://movingmanifest.test/api/mcp",
          authorization_servers: ["https://clerk.example.test"],
          scopes_supported: ["openid", "profile", "email"],
        });
      }
      if (
        url ===
        "https://clerk.example.test/.well-known/oauth-authorization-server"
      ) {
        return Response.json({
          registration_endpoint: "https://clerk.example.test/oauth/register",
          authorization_endpoint: "https://clerk.example.test/oauth/authorize",
          token_endpoint: "https://clerk.example.test/oauth/token",
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const proof = await runOauthDiscoveryProbe({
      endpointUrl: "https://movingmanifest.test/api/mcp",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(fetchFn.mock.calls.map(([url]) => String(url))).not.toContain(
      "https://clerk.example.test/oauth/register"
    );
    expect(proof.probe.noMutation).toContain("No OAuth registration");
  });
});
