// One-time (and re-runnable) deploy-owner OAuth configuration for the MCP
// gateway. This is internal so only Convex functions and admin-authenticated
// CLI calls can invoke it; it is not part of the browser-callable API.
//
//   npx convex run mcpSetup:configureOAuth '{
//     "authServerUrl": "https://clerk.movingmanifest.com",
//     "resourceUrl": "https://movingmanifest.com/mcp"
//   }'
//
// resourceUrl may instead be this deployment's own CONVEX_SITE_URL + /mcp.
// Both arguments are checked against deployment-owned exact values before the
// component can be updated, protecting against deploy-key/operator mistakes.
import { ConvexError, v } from "convex/values";
import { McpGateway } from "convex-mcp-gateway";

import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const gateway = new McpGateway(components.mcpGateway);

export const OAUTH_AUTH_SERVER_URL = "https://clerk.movingmanifest.com";
export const OAUTH_CUSTOM_RESOURCE_URL = "https://movingmanifest.com/mcp";

export function allowedOAuthConfig(deploymentSiteUrl: string | undefined) {
  if (!deploymentSiteUrl) {
    throw new ConvexError(
      "OAuth configuration refused: CONVEX_SITE_URL is unavailable for this deployment.",
    );
  }

  let site: URL;
  try {
    site = new URL(deploymentSiteUrl);
  } catch {
    throw new ConvexError(
      "OAuth configuration refused: CONVEX_SITE_URL is not a valid absolute URL.",
    );
  }

  if (
    site.protocol !== "https:" ||
    !site.hostname.endsWith(".convex.site") ||
    site.username !== "" ||
    site.password !== "" ||
    site.port !== "" ||
    site.pathname !== "/" ||
    site.search !== "" ||
    site.hash !== ""
  ) {
    throw new ConvexError(
      "OAuth configuration refused: CONVEX_SITE_URL must be this deployment's https://*.convex.site origin.",
    );
  }

  return {
    authServerUrl: OAUTH_AUTH_SERVER_URL,
    resourceUrls: [
      new URL("/mcp", site).toString(),
      OAUTH_CUSTOM_RESOURCE_URL,
    ],
  } as const;
}

export function validateOAuthConfig(
  args: { authServerUrl: string; resourceUrl: string },
  deploymentSiteUrl: string | undefined,
) {
  const allowed = allowedOAuthConfig(deploymentSiteUrl);
  if (args.authServerUrl !== allowed.authServerUrl) {
    throw new ConvexError(
      `OAuth configuration refused: authServerUrl must exactly equal ${allowed.authServerUrl}.`,
    );
  }
  if (!allowed.resourceUrls.includes(args.resourceUrl)) {
    throw new ConvexError(
      `OAuth configuration refused: resourceUrl must exactly equal one of: ${allowed.resourceUrls.join(", ")}.`,
    );
  }
  return args;
}

export const configureOAuth = internalMutation({
  args: {
    authServerUrl: v.string(),
    resourceUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const validated = validateOAuthConfig(args, process.env.CONVEX_SITE_URL);
    await gateway.setOAuthConfig(ctx, {
      authServerUrl: validated.authServerUrl,
      resourceUrl: validated.resourceUrl,
    });
    return { ok: true, ...validated };
  },
});
