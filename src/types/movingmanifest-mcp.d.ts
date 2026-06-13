// Type surface for the shared MCP tool registry (plain ESM, lives outside src/).
declare module "*/mcp-server/movingmanifest-mcp.mjs" {
  import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

  export interface MovingManifestApiConfig {
    baseUrl: string;
    apiKey: string;
  }

  export function registerTools(
    target: McpServer,
    apiConfig: MovingManifestApiConfig
  ): void;

  export function createMovingManifestMcpServer(
    apiConfig: MovingManifestApiConfig
  ): McpServer;
}
