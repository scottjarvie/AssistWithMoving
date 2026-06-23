import { describe, expect, it } from "vitest";

import {
  authorizedOAuthSmokeProofResults,
  classifyClerkValue,
  clerkEnvModeResults,
  oauthMetadataResults,
  oauthToolsetResults,
  parseEnvAssignments,
  restApiRuntimeResults,
  runCommand,
  validateAuthorizedOAuthSmokeProof,
  vercelSensitiveKeysFromJson,
} from "../../scripts/oauth-cutover-readiness.mjs";

describe("OAuth cutover readiness", () => {
  it("parses dotenv assignments without exposing quoted values", () => {
    const assignments = parseEnvAssignments(`
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_secret"
CLERK_JWT_ISSUER_DOMAIN='https://clerk.movingmanifest.com'
`);

    expect(assignments.get("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")).toBe(
      "pk_live_secret"
    );
    expect(assignments.get("CLERK_JWT_ISSUER_DOMAIN")).toBe(
      "https://clerk.movingmanifest.com"
    );
  });

  it("classifies Clerk values by mode instead of returning secrets", () => {
    expect(
      classifyClerkValue("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_secret")
    ).toBe("live");
    expect(classifyClerkValue("CLERK_SECRET_KEY", "sk_test_secret")).toBe(
      "test"
    );
    expect(
      classifyClerkValue(
        "CLERK_JWT_ISSUER_DOMAIN",
        "https://glorious-swine-50.clerk.accounts.dev"
      )
    ).toBe("dev-origin");
    expect(
      classifyClerkValue(
        "CLERK_JWT_ISSUER_DOMAIN",
        "https://clerk.movingmanifest.com"
      )
    ).toBe("production-origin");
    expect(classifyClerkValue("CLERK_SECRET_KEY", "")).toBe("blank");
  });

  it("blocks remote env values that are still blank or development-mode", () => {
    const assignments = parseEnvAssignments(`
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_secret
CLERK_SECRET_KEY=
CLERK_JWT_ISSUER_DOMAIN=https://glorious-swine-50.clerk.accounts.dev
`);

    const results = clerkEnvModeResults({
      source: "Vercel production",
      assignments,
      keys: [
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
        "CLERK_SECRET_KEY",
        "CLERK_JWT_ISSUER_DOMAIN",
      ],
      issuer: "https://clerk.movingmanifest.com",
    });

    expect(results).toEqual([
      {
        status: "blocked",
        label: "Vercel production NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
        detail: "mode=test; set production Clerk value; tracked by MOVE-63",
      },
      {
        status: "blocked",
        label: "Vercel production CLERK_SECRET_KEY",
        detail: "mode=blank; set production Clerk value; tracked by MOVE-63",
      },
      {
        status: "blocked",
        label: "Vercel production CLERK_JWT_ISSUER_DOMAIN",
        detail:
          "mode=dev-origin; set production Clerk value; tracked by MOVE-63",
      },
    ]);

    expect(JSON.stringify(results)).not.toContain("pk_test_secret");
    expect(JSON.stringify(results)).not.toContain("glorious-swine-50");
  });

  it("warns when Vercel sensitive values are unreadable instead of calling them blank", () => {
    const sensitiveKeys = vercelSensitiveKeysFromJson(
      JSON.stringify([
        {
          key: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
          type: "encrypted",
        },
        {
          key: "CLERK_SECRET_KEY",
          sensitive: true,
        },
        {
          key: "CLERK_WEBHOOK_SIGNING_SECRET",
          encrypted: true,
        },
      ])
    );
    const assignments = parseEnvAssignments(`
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
CLERK_SECRET_KEY=""
`);

    expect(
      clerkEnvModeResults({
        source: "Vercel production",
        assignments,
        keys: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"],
        issuer: "https://clerk.movingmanifest.com",
        unreadableKeys: sensitiveKeys,
      })
    ).toEqual([
      {
        status: "warn",
        label: "Vercel production NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
        detail:
          "mode=sensitive-unreadable; Vercel CLI cannot reveal this value, verify through live OAuth discovery; tracked by MOVE-63",
      },
      {
        status: "warn",
        label: "Vercel production CLERK_SECRET_KEY",
        detail:
          "mode=sensitive-unreadable; Vercel CLI cannot reveal this value, verify through live OAuth discovery; tracked by MOVE-63",
      },
    ]);
  });

  it("gates hosted OAuth publish on the trusted-helper toolset env", () => {
    expect(
      oauthToolsetResults({
        source: "Vercel production",
        value: "trusted-helper",
        strictMode: true,
      })
    ).toEqual([
      {
        status: "pass",
        label: "Vercel production MOVINGMANIFEST_MCP_OAUTH_TOOLSET",
        detail: "trusted-helper OAuth toolset enabled",
      },
    ]);

    expect(
      oauthToolsetResults({
        source: "Vercel production",
        value: "",
        strictMode: false,
      })
    ).toEqual([
      {
        status: "warn",
        label: "Vercel production MOVINGMANIFEST_MCP_OAUTH_TOOLSET",
        detail:
          "not set; set trusted-helper before hosted OAuth publish; tracked by MOVE-240",
      },
    ]);

    expect(
      oauthToolsetResults({
        source: "Vercel production",
        value: "full",
        strictMode: true,
      })
    ).toEqual([
      {
        status: "blocked",
        label: "Vercel production MOVINGMANIFEST_MCP_OAUTH_TOOLSET",
        detail:
          "mode=full; set trusted-helper before hosted OAuth publish; tracked by MOVE-240",
      },
    ]);
  });

  it("times out CLI helpers instead of hanging the cutover doctor", async () => {
    const result = await runCommand(
      process.execPath,
      ["-e", "setTimeout(() => {}, 10_000)"],
      { timeoutMs: 50 }
    );

    expect(result).toEqual(
      expect.objectContaining({
        code: 1,
        timedOut: true,
      })
    );
    expect(result.stderr).toContain("command timed out after 50ms");
  });

  it("passes the REST API runtime check when auth protection responds before OAuth smoke", () => {
    expect(
      restApiRuntimeResults({
        status: 401,
        bodyText:
          '{"error":{"code":"unauthorized","message":"Use a Bearer API key or OAuth access token."}}',
      })
    ).toEqual([
      {
        status: "pass",
        label: "REST API runtime",
        detail:
          "protected endpoint rejected unauthenticated request with HTTP 401 and advertises OAuth access-token support",
      },
    ]);

    expect(restApiRuntimeResults({ status: 403 })[0]).toMatchObject({
      status: "pass",
      label: "REST API runtime",
    });
  });

  it("blocks stale production REST builds that still look API-key-only", () => {
    expect(
      restApiRuntimeResults({
        status: 401,
        bodyText:
          '{"error":{"code":"unauthorized","message":"Use a Bearer API key."}}',
      })
    ).toEqual([
      {
        status: "blocked",
        label: "REST API runtime",
        detail:
          "GET /api/v1/me is still returning the old API-key-only auth message; deploy the current Convex REST OAuth backend before asking users to reconnect Claude again.",
      },
    ]);
  });

  it("blocks the REST API runtime check when Convex rewrite returns server errors", () => {
    expect(restApiRuntimeResults({ status: 500 })).toEqual([
      {
        status: "blocked",
        label: "REST API runtime",
        detail:
          "GET /api/v1/me returned HTTP 500; production Convex may be disabled; tracked by MOVE-217",
      },
    ]);
  });

  it("requires authorized OAuth browser proof for strict launch gating", () => {
    expect(
      authorizedOAuthSmokeProofResults({
        proof: false,
        strictMode: true,
        skipped: false,
      })
    ).toEqual([
      {
        status: "blocked",
        label: "Authorized OAuth browser smoke",
        detail:
          "not yet proven; run scripts/mcp-oauth-smoke.mjs --authorize --open-browser --box-intake-smoke --write-smoke --expect-trusted-helper-toolset --expected-email scott@thejarvie.com --endpoint https://movingmanifest.com/api/mcp, keep the terminal open, then sign in as scott@thejarvie.com; tracked by MOVE-238 under MOVE-215, with setup history in MOVE-63",
      },
    ]);

    expect(
      authorizedOAuthSmokeProofResults({
        proof: false,
        strictMode: false,
        skipped: false,
      })[0]
    ).toMatchObject({ status: "warn" });
  });

  it("allows metadata-only diagnostics to skip authorized OAuth browser proof explicitly", () => {
    expect(
      authorizedOAuthSmokeProofResults({
        proof: false,
        strictMode: true,
        skipped: true,
      })
    ).toEqual([
      {
        status: "warn",
        label: "Authorized OAuth browser smoke",
        detail:
          "skipped by --skip-authorized-smoke-proof; metadata can pass while production sign-in is still broken",
      },
    ]);
  });

  it("accepts only fresh authorized OAuth smoke proof for the inspected endpoint", () => {
    const proof = {
      schema: "movingmanifest.mcp-oauth-smoke-proof.v1",
      createdAt: "2026-06-15T13:30:00.000Z",
      endpoint: "https://movingmanifest.com/api/mcp",
      authorized: true,
      checks: {
        tokenExchange: true,
        mcpConnected: true,
        toolsListed: true,
        contextChecked: true,
        connectionEmailVerified: true,
        trustedHelperToolsetVerified: true,
        writeSmoke: true,
      },
    };

    expect(
      validateAuthorizedOAuthSmokeProof({
        proof,
        endpointUrl: "https://movingmanifest.com/api/mcp",
        now: Date.parse("2026-06-15T13:35:00.000Z"),
        maxAgeMs: 60 * 60 * 1000,
      })
    ).toEqual({
      status: "pass",
      detail:
        "proof 2026-06-15T13:30:00.000Z for https://movingmanifest.com/api/mcp",
    });

    expect(
      validateAuthorizedOAuthSmokeProof({
        proof: { ...proof, authorized: false },
        endpointUrl: "https://movingmanifest.com/api/mcp",
        now: Date.parse("2026-06-15T13:35:00.000Z"),
      })
    ).toMatchObject({
      status: "invalid",
      detail: "proof was not produced by an authorized OAuth smoke",
    });

    expect(
      validateAuthorizedOAuthSmokeProof({
        proof: { ...proof, endpoint: "https://example.com/api/mcp" },
        endpointUrl: "https://movingmanifest.com/api/mcp",
        now: Date.parse("2026-06-15T13:35:00.000Z"),
      })
    ).toMatchObject({
      status: "invalid",
      detail: expect.stringContaining("does not match"),
    });

    expect(
      validateAuthorizedOAuthSmokeProof({
        proof,
        endpointUrl: "https://movingmanifest.com/api/mcp",
        now: Date.parse("2026-06-17T13:35:00.000Z"),
        maxAgeMs: 60 * 60 * 1000,
      })
    ).toMatchObject({ status: "stale" });

    expect(
      validateAuthorizedOAuthSmokeProof({
        proof: {
          ...proof,
          checks: {
            tokenExchange: true,
            mcpConnected: true,
            toolsListed: true,
            contextChecked: true,
            trustedHelperToolsetVerified: true,
            writeSmoke: true,
          },
        },
        endpointUrl: "https://movingmanifest.com/api/mcp",
        now: Date.parse("2026-06-17T13:35:00.000Z"),
        maxAgeMs: 60 * 60 * 1000,
      })
    ).toEqual({
      status: "stale",
      detail:
        "proof is older than 60 minutes and missing required check(s): intended connection email",
    });

    expect(
      validateAuthorizedOAuthSmokeProof({
        proof: {
          ...proof,
          checks: { ...proof.checks, writeSmoke: false },
        },
        endpointUrl: "https://movingmanifest.com/api/mcp",
        now: Date.parse("2026-06-15T13:35:00.000Z"),
      })
    ).toMatchObject({
      status: "invalid",
      detail: "proof missing required check(s): MCP write smoke",
    });

    expect(
      validateAuthorizedOAuthSmokeProof({
        proof: {
          ...proof,
          checks: {
            ...proof.checks,
            trustedHelperToolsetVerified: false,
          },
        },
        endpointUrl: "https://movingmanifest.com/api/mcp",
        now: Date.parse("2026-06-15T13:35:00.000Z"),
      })
    ).toMatchObject({
      status: "invalid",
      detail: "proof missing required check(s): trusted-helper OAuth toolset",
    });

    expect(
      validateAuthorizedOAuthSmokeProof({
        proof: {
          ...proof,
          connectionEmail: "jarvie@gmail.com",
          expectedConnectionEmail: "scott@thejarvie.com",
          checks: {
            ...proof.checks,
            connectionEmailVerified: false,
          },
        },
        endpointUrl: "https://movingmanifest.com/api/mcp",
        now: Date.parse("2026-06-15T13:35:00.000Z"),
      })
    ).toMatchObject({
      status: "invalid",
      detail:
        "proof missing required check(s): intended connection email (expected scott@thejarvie.com, got jarvie@gmail.com)",
    });

    expect(
      validateAuthorizedOAuthSmokeProof({
        proof: {
          ...proof,
          connectionEmail: "jarvie@gmail.com",
          checks: {
            ...proof.checks,
            connectionEmailVerified: false,
          },
        },
        endpointUrl: "https://movingmanifest.com/api/mcp",
        now: Date.parse("2026-06-15T13:35:00.000Z"),
      })
    ).toMatchObject({
      status: "invalid",
      detail:
        "proof missing required check(s): intended connection email (got jarvie@gmail.com, not verified against --expected-email)",
    });
  });

  it("passes authorized OAuth browser smoke only from proof validation", () => {
    expect(
      authorizedOAuthSmokeProofResults({
        strictMode: true,
        skipped: false,
        proof: {
          status: "pass",
          detail:
            "proof 2026-06-15T13:30:00.000Z for https://movingmanifest.com/api/mcp",
        },
      })
    ).toEqual([
      {
        status: "pass",
        label: "Authorized OAuth browser smoke",
        detail:
          "proof 2026-06-15T13:30:00.000Z for https://movingmanifest.com/api/mcp",
      },
    ]);
  });

  it("passes OAuth metadata only when the live issuer and DCR are production-ready", () => {
    const results = oauthMetadataResults({
      endpointUrl: "https://movingmanifest.com/api/mcp",
      expectedIssuerUrl: "https://clerk.movingmanifest.com",
      resourceMetadata: {
        resource: "https://movingmanifest.com/api/mcp",
        authorization_servers: ["https://clerk.movingmanifest.com"],
        bearer_methods_supported: ["header"],
        resource_signing_alg_values_supported: ["RS256"],
        scopes_supported: ["openid", "profile", "email"],
      },
      authMetadata: {
        authorization_endpoint:
          "https://clerk.movingmanifest.com/oauth/authorize",
        registration_endpoint: "https://clerk.movingmanifest.com/oauth/register",
        token_endpoint: "https://clerk.movingmanifest.com/oauth/token",
        token_endpoint_auth_methods_supported: ["none"],
        code_challenge_methods_supported: ["S256"],
      },
    });

    expect(results.filter((result) => result.status === "blocked")).toEqual([]);
    expect(results).toContainEqual({
      status: "warn",
      label: "OAuth access token JWT mode",
      detail:
        "metadata cannot prove token shape; verify JWT access tokens with the authorized OAuth smoke after production cutover",
    });
    expect(results).toContainEqual({
      status: "pass",
      label: "Bearer token transport",
      detail: "header supported",
    });
    expect(results).toContainEqual({
      status: "pass",
      label: "Resource signing algorithm",
      detail: "RS256 supported",
    });
  });

  it("blocks OAuth metadata that still advertises a Clerk development issuer", () => {
    const results = oauthMetadataResults({
      endpointUrl: "https://movingmanifest.com/api/mcp",
      expectedIssuerUrl: "https://clerk.movingmanifest.com",
      resourceMetadata: {
        resource: "https://movingmanifest.com/api/mcp",
        authorization_servers: [
          "https://glorious-swine-50.clerk.accounts.dev",
        ],
        bearer_methods_supported: ["header"],
        resource_signing_alg_values_supported: ["RS256"],
        scopes_supported: ["openid", "profile", "email"],
      },
      authMetadata: {
        code_challenge_methods_supported: ["S256"],
      },
    });

    expect(results).toContainEqual({
      status: "blocked",
      label: "MCP authorization server",
      detail:
        "live endpoint still advertises Clerk development issuer; tracked by MOVE-63",
    });
    expect(results).toContainEqual({
      status: "blocked",
      label: "Dynamic client registration",
      detail: "registration_endpoint missing; enable DCR in Clerk production",
    });
  });

  it("warns when public-client token endpoint auth is not advertised", () => {
    const results = oauthMetadataResults({
      endpointUrl: "https://movingmanifest.com/api/mcp",
      expectedIssuerUrl: "https://clerk.movingmanifest.com",
      resourceMetadata: {
        resource: "https://movingmanifest.com/api/mcp",
        authorization_servers: ["https://clerk.movingmanifest.com"],
        bearer_methods_supported: ["header"],
        resource_signing_alg_values_supported: ["RS256"],
        scopes_supported: ["openid", "profile", "email"],
      },
      authMetadata: {
        authorization_endpoint:
          "https://clerk.movingmanifest.com/oauth/authorize",
        registration_endpoint: "https://clerk.movingmanifest.com/oauth/register",
        token_endpoint: "https://clerk.movingmanifest.com/oauth/token",
        token_endpoint_auth_methods_supported: ["client_secret_basic"],
        code_challenge_methods_supported: ["S256"],
      },
    });

    expect(results).toContainEqual({
      status: "warn",
      label: "Token endpoint auth",
      detail: "none not advertised; got client_secret_basic",
    });
  });

  it("blocks MCP resource metadata that omits bearer header or RS256 support", () => {
    const results = oauthMetadataResults({
      endpointUrl: "https://movingmanifest.com/api/mcp",
      expectedIssuerUrl: "https://clerk.movingmanifest.com",
      resourceMetadata: {
        resource: "https://movingmanifest.com/api/mcp",
        authorization_servers: ["https://clerk.movingmanifest.com"],
        scopes_supported: ["openid", "profile", "email"],
      },
      authMetadata: {
        authorization_endpoint:
          "https://clerk.movingmanifest.com/oauth/authorize",
        registration_endpoint: "https://clerk.movingmanifest.com/oauth/register",
        token_endpoint: "https://clerk.movingmanifest.com/oauth/token",
        token_endpoint_auth_methods_supported: ["none"],
        code_challenge_methods_supported: ["S256"],
      },
    });

    expect(results).toContainEqual({
      status: "blocked",
      label: "Bearer token transport",
      detail: "bearer_methods_supported must include header",
    });
    expect(results).toContainEqual({
      status: "blocked",
      label: "Resource signing algorithm",
      detail: "resource_signing_alg_values_supported must include RS256",
    });
  });
});
