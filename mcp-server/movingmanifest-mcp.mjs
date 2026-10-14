#!/usr/bin/env node
// Compatibility entry point for local MCP client configs written before the
// AssistWithMoving rename (#192). It starts the same stdio server as
// assistwithmoving-mcp.mjs; MOVINGMANIFEST_* env vars still work through the
// fallback in assistwithmoving-api.mjs. New configs should point at
// assistwithmoving-mcp.mjs.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createApiConfig } from "./assistwithmoving-api.mjs";
import { createAssistWithMovingMcpServer } from "./assistwithmoving-mcp.mjs";

const server = createAssistWithMovingMcpServer(createApiConfig());
await server.connect(new StdioServerTransport());
