// Type surface for the shared MCP tool registry (plain ESM, lives outside src/).
declare module "*/mcp-server/assistwithmoving-mcp.mjs" {
  import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

  export interface AssistWithMovingApiConfig {
    baseUrl: string;
    apiKey: string;
  }

  export const ASSISTWITHMOVING_TRUSTED_HELPER_MCP_TOOLS: string[];

  export function createAllowedToolFilter(
    allowedToolNames?: readonly string[]
  ): (toolName: string) => boolean;

  export function registerTools(
    target: McpServer,
    apiConfig: AssistWithMovingApiConfig,
    options?: { allowedToolNames?: readonly string[] }
  ): void;

  export function createAssistWithMovingMcpServer(
    apiConfig: AssistWithMovingApiConfig,
    options?: { allowedToolNames?: readonly string[] }
  ): McpServer;
}
