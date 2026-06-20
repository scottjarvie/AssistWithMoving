// Type surface for the shared MCP tool registry (plain ESM, lives outside src/).
declare module "*/mcp-server/movingmanifest-mcp.mjs" {
  import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

  export interface MovingManifestApiConfig {
    baseUrl: string;
    apiKey: string;
  }

  export const MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS: string[];

  export function createAllowedToolFilter(
    allowedToolNames?: readonly string[]
  ): (toolName: string) => boolean;

  export function registerTools(
    target: McpServer,
    apiConfig: MovingManifestApiConfig,
    options?: { allowedToolNames?: readonly string[] }
  ): void;

  export function createMovingManifestMcpServer(
    apiConfig: MovingManifestApiConfig,
    options?: { allowedToolNames?: readonly string[] }
  ): McpServer;
}
