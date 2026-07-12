import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { api, internal } from "../../convex/_generated/api";
import {
  configureOAuth,
  OAUTH_AUTH_SERVER_URL,
  OAUTH_CUSTOM_RESOURCE_URL,
  validateOAuthConfig,
} from "../../convex/mcpSetup";

const DEPLOYMENT_SITE_URL = "https://trusted-deployment-123.convex.site";
const DEPLOYMENT_RESOURCE_URL = `${DEPLOYMENT_SITE_URL}/mcp`;

// These compile-time assertions lock the generated client surface: deploy-owner
// code can address the internal function, while browser clients cannot obtain a
// public FunctionReference for it.
type HasNestedKey<
  T,
  ModuleName extends PropertyKey,
  FunctionName extends PropertyKey,
> = ModuleName extends keyof T
  ? FunctionName extends keyof T[ModuleName]
    ? true
    : false
  : false;
type IsPubliclyExposed = HasNestedKey<typeof api, "mcpSetup", "configureOAuth">;
type IsInternallyExposed = HasNestedKey<
  typeof internal,
  "mcpSetup",
  "configureOAuth"
>;
const isPubliclyExposed: IsPubliclyExposed = false;
const isInternallyExposed: IsInternallyExposed = true;
const configureOAuthHandler = (
  configureOAuth as unknown as {
    _handler: (
      ctx: unknown,
      args: { authServerUrl: string; resourceUrl: string },
    ) => Promise<unknown>;
  }
)._handler;

function convexErrorData(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    return (error as ConvexError<string>).data;
  }
  throw new Error("Expected a ConvexError");
}

describe("MCP OAuth configuration lock", () => {
  it("is internal-only, so an unauthenticated client cannot call it", () => {
    expect(isPubliclyExposed).toBe(false);
    expect(isInternallyExposed).toBe(true);
    expect(configureOAuth.isInternal).toBe(true);
    expect("isPublic" in configureOAuth).toBe(false);
  });

  it.each([
    "https://evil.example",
    "https://clerk.movingmanifest.com.evil.example",
    "https://clerk.movingmanifest.com/",
  ])(
    "rejects hostile or non-exact issuer %s in the internal mutation handler",
    async (authServerUrl) => {
      process.env.CONVEX_SITE_URL = DEPLOYMENT_SITE_URL;
      await expect(
        configureOAuthHandler({}, {
          authServerUrl,
          resourceUrl: DEPLOYMENT_RESOURCE_URL,
        }),
      ).rejects.toMatchObject({
        data: expect.stringContaining("authServerUrl must exactly equal"),
      });
    },
  );

  it.each([
    "https://evil.example/mcp",
    "https://other-deployment-456.convex.site/mcp",
    "https://movingmanifest.com/mcp/",
  ])(
    "rejects hostile or non-exact resource %s in the internal mutation handler",
    async (resourceUrl) => {
      process.env.CONVEX_SITE_URL = DEPLOYMENT_SITE_URL;
      await expect(
        configureOAuthHandler({}, {
          authServerUrl: OAUTH_AUTH_SERVER_URL,
          resourceUrl,
        }),
      ).rejects.toMatchObject({
        data: expect.stringContaining("resourceUrl must exactly equal one of"),
      });
    },
  );

  it.each([DEPLOYMENT_RESOURCE_URL, OAUTH_CUSTOM_RESOURCE_URL])(
    "allows only the deployment-owned resource %s",
    (resourceUrl) => {
      expect(
        validateOAuthConfig(
          { authServerUrl: OAUTH_AUTH_SERVER_URL, resourceUrl },
          DEPLOYMENT_SITE_URL,
        ),
      ).toEqual({ authServerUrl: OAUTH_AUTH_SERVER_URL, resourceUrl });
    },
  );

  it("fails closed when the deployment site identity is missing or malformed", () => {
    expect(
      convexErrorData(() =>
        validateOAuthConfig(
          {
            authServerUrl: OAUTH_AUTH_SERVER_URL,
            resourceUrl: OAUTH_CUSTOM_RESOURCE_URL,
          },
          undefined,
        ),
      ),
    ).toContain("CONVEX_SITE_URL is unavailable");

    expect(
      convexErrorData(() =>
        validateOAuthConfig(
          {
            authServerUrl: OAUTH_AUTH_SERVER_URL,
            resourceUrl: OAUTH_CUSTOM_RESOURCE_URL,
          },
          "https://attacker.example",
        ),
      ),
    ).toContain("must be this deployment's https://*.convex.site origin");
  });
});
