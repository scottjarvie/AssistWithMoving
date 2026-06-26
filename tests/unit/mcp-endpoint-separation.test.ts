// Regression lock for the recurring "Invalid API key format" 401 on agent
// connections. There are TWO MCP doors and they must stay separate:
//
//   /api/mcp      — API-KEY door. Accepts mmk_ keys only. Must NOT advertise
//                   OAuth (doing so dead-ends OAuth clients).
//   /mcp/connect  — OAUTH door. Advertises Clerk + scopes. This is the URL
//                   surfaced to OAuth clients (claude.ai, Cowork).
//
// If any of these tests fail, someone re-crossed the doors — typically by
// pointing a user-facing "connect" URL at /api/mcp, or by making /api/mcp
// advertise Clerk OAuth again. See src/lib/mcp-oauth.ts.
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  mcpBearerChallenge,
  mcpOAuthConnectUrl,
  mcpProtectedResourceMetadata,
} from "@/lib/mcp-oauth";
import { GET as getMcpEndpoint } from "../../src/app/api/mcp/route";
import { GET as getApiMcpMetadata } from "../../src/app/.well-known/oauth-protected-resource/[[...resource]]/route";
import { GET as getConnectMetadata } from "../../src/app/.well-known/oauth-protected-resource/mcp/connect/route";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

// The canonical OAuth front door is the bare /mcp (/mcp/connect is a working
// alias). The API-key door is /api/mcp and must never advertise OAuth.
const OAUTH_DOOR = "https://movingmanifest.com/mcp";
const API_KEY_DOOR = "https://movingmanifest.com/api/mcp";

describe("MCP two-door separation (API key vs OAuth)", () => {
  describe("/api/mcp (API-key door) must NOT advertise OAuth", () => {
    it("emits a key-only protected-resource doc with no authorization server", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";
      process.env.CLERK_JWT_ISSUER_DOMAIN = "https://clerk.example.test/";
      const meta = mcpProtectedResourceMetadata(
        new Request("https://movingmanifest.test/api/mcp"),
      );
      expect(meta.authorization_servers).toEqual([]);
      expect(JSON.stringify(meta).toLowerCase()).not.toContain("clerk");
    });

    it("emits a key-only 401 challenge that routes OAuth clients to the /mcp front door", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";
      const challenge = mcpBearerChallenge(
        new Request("https://movingmanifest.test/api/mcp"),
      );
      expect(challenge).toContain("https://movingmanifest.test/mcp");
      expect(challenge).not.toContain("https://movingmanifest.test/api/mcp");
      expect(challenge).not.toContain("resource_metadata");
      expect(challenge.toLowerCase()).not.toContain("clerk");
      // Defense-in-depth: re-adding an OAuth `scope=` (even without
      // resource_metadata) would re-advertise OAuth on the key-only door.
      expect(challenge.toLowerCase()).not.toContain("scope");
    });

    it("returns 401 with no OAuth advertisement from the live route", async () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";
      const res = await getMcpEndpoint(new Request("https://x.example/api/mcp"));
      expect(res.status).toBe(401);
      expect(res.headers.get("WWW-Authenticate")).not.toContain(
        "resource_metadata",
      );
    });

    it("serves a key-only well-known doc (no auth server) for /api/mcp", async () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";
      process.env.CLERK_JWT_ISSUER_DOMAIN = "https://clerk.example.test/";
      const res = await getApiMcpMetadata(
        new Request(
          "https://x.example/.well-known/oauth-protected-resource/api/mcp",
        ),
      );
      const body = (await res.json()) as { authorization_servers: string[] };
      expect(body.authorization_servers).toEqual([]);
    });
  });

  describe("/mcp/connect (OAuth door) MUST advertise OAuth", () => {
    it("advertises Clerk + scopes and points at /mcp/connect", async () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";
      process.env.CLERK_JWT_ISSUER_DOMAIN = "https://clerk.example.test/";
      const res = await getConnectMetadata(
        new Request(
          "https://x.example/.well-known/oauth-protected-resource/mcp/connect",
        ),
      );
      const body = (await res.json()) as {
        resource: string;
        authorization_servers: string[];
        scopes_supported: string[];
      };
      expect(body.resource).toBe("https://movingmanifest.test/mcp/connect");
      expect(body.authorization_servers).toEqual(["https://clerk.example.test"]);
      expect(body.scopes_supported).toEqual(["openid", "profile", "email"]);
    });

    it("mcpOAuthConnectUrl resolves to the /mcp front door", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";
      expect(
        mcpOAuthConnectUrl(new Request("https://movingmanifest.test/api/mcp")),
      ).toBe("https://movingmanifest.test/mcp");
    });
  });

  // The bug that keeps recurring is user-facing copy/constants pointing OAuth
  // clients at /api/mcp. Lock the connect URL surfaced in each entry point.
  describe("user-facing 'connect your agent' surfaces use the OAuth door", () => {
    it("the in-app onboarding banner shows /mcp/connect, not /api/mcp", () => {
      const src = readFileSync(
        "src/components/connect-agent-onboarding.tsx",
        "utf8",
      );
      expect(src).toContain(OAUTH_DOOR);
      expect(src).not.toContain(API_KEY_DOOR);
    });

    it("the AI start page's hosted MCP endpoint is the OAuth door", () => {
      const src = readFileSync("src/app/(marketing)/ai/start/page.tsx", "utf8");
      expect(src).toContain(`remoteMcpEndpoint = "${OAUTH_DOOR}"`);
    });

    it("the /mcp/guide page sends OAuth clients to the /mcp front door", () => {
      const src = readFileSync(
        "src/app/(marketing)/mcp/guide/page.tsx",
        "utf8",
      );
      // OAuth endpoint + its discovery doc must be the /mcp front door...
      expect(src).toContain(`remoteEndpointUrl = "${OAUTH_DOOR}"`);
      expect(src).toContain("/.well-known/oauth-protected-resource/mcp");
      // ...and /api/mcp may appear ONLY as the labelled, advanced key-only door.
      expect(src).toContain("API-key door");
    });
  });
});
