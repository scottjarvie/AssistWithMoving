// One-time (and re-runnable) OAuth configuration for the MCP gateway. Run after
// deploy so the gateway advertises Clerk as the authorization server and knows
// its own public resource URL — this is what makes the WWW-Authenticate
// challenge carry a discoverable metadata URL so browser MCP clients (claude.ai)
// begin the OAuth flow.
//
//   npx convex run mcpSetup:configureOAuth '{
//     "authServerUrl": "https://clerk.movingmanifest.com",
//     "resourceUrl": "https://<deployment>.convex.site/mcp"
//   }'
//
// authServerUrl = the Clerk Frontend API URL (the OAuth authorization server).
//   dev:  https://<app>.clerk.accounts.dev   prod: https://clerk.movingmanifest.com
// resourceUrl   = this deployment's public MCP endpoint on .convex.site.
import { v } from "convex/values";
import { McpGateway } from "convex-mcp-gateway";

import { components } from "./_generated/api";
import { mutation } from "./_generated/server";

const gateway = new McpGateway(components.mcpGateway);

export const configureOAuth = mutation({
  args: {
    authServerUrl: v.string(),
    resourceUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await gateway.setOAuthConfig(ctx, {
      authServerUrl: args.authServerUrl,
      resourceUrl: args.resourceUrl,
    });
    return { ok: true, ...args };
  },
});
