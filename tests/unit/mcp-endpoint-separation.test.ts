// Regression lock for the recurring "Invalid API key format" 401 on agent
// connections. There are TWO MCP doors and they must stay separate:
//
//   /api/mcp      — API-KEY door. Accepts mmk_ keys only. Must NOT advertise
//                   OAuth (doing so dead-ends OAuth clients).
//   /mcp          — canonical stateless OAUTH door for new clients.
//   /mcp/connect  — persisted OAUTH compatibility catalog for old clients.
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
import { GET as getCanonicalMetadata } from "../../src/app/.well-known/oauth-protected-resource/mcp/route";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

// The canonical OAuth front door is bare /mcp. /mcp/connect intentionally
// preserves a different compatibility catalog. /api/mcp is key-only.
const OAUTH_DOOR = "https://movingmanifest.com/mcp";
const API_KEY_DOOR = "https://movingmanifest.com/api/mcp";

describe("MCP door separation (canonical OAuth, compatibility OAuth, API key)", () => {
  it("keeps canonical stateless and persisted compatibility routes distinct", () => {
    const convexHttp = readFileSync("convex/http.ts", "utf8");
    const canonical = readFileSync("convex/httpRoutes/mcp.ts", "utf8");
    const compatibilityProxy = readFileSync("src/app/mcp/connect/route.ts", "utf8");

    expect(canonical).toContain('path: "/mcp"');
    expect(canonical).toContain('legacy: "stateless"');
    expect(convexHttp).toContain('"/mcp/legacy"');
    expect(compatibilityProxy).toContain('/mcp/legacy');
  });

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

  // The /mcp proxy rewrites the Convex gateway's 401 `resource_metadata` to
  // point at THIS document, so the gateway's own copy is never fetched by a
  // real client. Anything the product needs a client to know has to be here.
  // These assertions exist because the two copies silently drifted once: the
  // grant contract shipped to Convex and stayed invisible in production, where
  // the branded route said nothing about grants.
  //
  // The fix for that drift briefly over-corrected by putting the five moving.*
  // scopes into `scopes_supported`. That is wrong: RFC 9728 `scopes_supported`
  // is what a client may request of the authorization server, and Clerk cannot
  // mint product scopes. The grant contract is carried by the vendor block
  // instead — see the `productScopes` assertion below.
  describe("/mcp protected-resource metadata carries the grant contract", () => {
    it("advertises only the identity scopes Clerk can actually issue", async () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";
      process.env.CLERK_JWT_ISSUER_DOMAIN = "https://clerk.example.test/";
      const res = await getCanonicalMetadata(
        new Request(
          "https://x.example/.well-known/oauth-protected-resource/mcp",
        ),
      );
      const body = (await res.json()) as {
        resource: string;
        scopes_supported: string[];
      };
      expect(body.resource).toBe("https://movingmanifest.test/mcp");
      expect(body.scopes_supported).toEqual(["openid", "profile", "email"]);
      // Guard the regression directly: no product scope may leak into the
      // list a client hands to Clerk.
      for (const scope of body.scopes_supported) {
        expect(scope.startsWith("moving.")).toBe(false);
      }
    });

    it("tells a client that signing in is not authorization", async () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";
      process.env.CLERK_JWT_ISSUER_DOMAIN = "https://clerk.example.test/";
      const res = await getCanonicalMetadata(
        new Request(
          "https://x.example/.well-known/oauth-protected-resource/mcp",
        ),
      );
      const body = (await res.json()) as {
        client_id_metadata_document_supported: boolean;
        "x-assistwithmoving": {
          productGrantRequired: boolean;
          grantManager: string;
          productScopes: string[];
          doors: Record<string, string>;
        };
      };
      expect(body.client_id_metadata_document_supported).toBe(true);
      const moving = body["x-assistwithmoving"];
      expect(moving.productGrantRequired).toBe(true);
      // The five product scopes stay discoverable — as a vendor hint about
      // what /settings/ai can approve, not as something to request from Clerk.
      expect(moving.productScopes).toEqual([
        "moving.context.read",
        "moving.evidence.read",
        "moving.work.write",
        "moving.queue.work",
        "moving.archive",
      ]);
      expect(moving.grantManager).toBe("https://movingmanifest.test/settings/ai");
      expect(moving.doors.canonical).toBe("https://movingmanifest.test/mcp");
      expect(moving.doors.apiKeyOnly).toBe("https://movingmanifest.test/api/mcp");
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
      // Identity scopes only — what Clerk can actually issue. The product
      // ceiling is enforced from grant records and advertised in the
      // x-assistwithmoving vendor block, not here.
      expect(body.scopes_supported).toEqual(["openid", "profile", "email"]);
    });

    it("mcpOAuthConnectUrl resolves to the /mcp front door", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.test";
      expect(
        mcpOAuthConnectUrl(new Request("https://movingmanifest.test/api/mcp")),
      ).toBe("https://movingmanifest.test/mcp");
    });
  });

  // Canonical Queue work is now reachable over OAuth under a moving.queue.work
  // grant, so the Queue screen names both ways in. It still must not publish
  // either protocol URL: the endpoint belongs on the setup screen, not here.
  describe("user-facing agent surfaces advertise only their supported door", () => {
    it("the Queue screen names Queue access without publishing a protocol URL", () => {
      const src = readFileSync("src/components/queue-experience.tsx", "utf8");
      expect(src).toContain("API-key access is available");
      expect(src).toContain("cannot tell whether an AI client is currently online");
      // Authority for Queue work is a grant, and the grant screen is canonical.
      expect(src).toContain("grant that includes Queue work");
      expect(src).toContain('/settings/ai"');
      expect(src).not.toContain(OAUTH_DOOR);
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
