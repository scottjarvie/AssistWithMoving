import { defineApp } from "convex/server";
import mcpGateway from "convex-mcp-gateway/convex.config";

// Components for this deployment. The MCP gateway exposes selected Convex
// functions to the user's own AI agent over a remote MCP server with OAuth 2.1
// (Clerk is the authorization server). See convex/mcp.ts, convex/http.ts, and
// convex/lib/mcpIdentity.ts.
const app = defineApp();
app.use(mcpGateway);
export default app;
