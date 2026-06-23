// MCP tool surface for the OAuth gateway. Each entry maps an MCP tool name to a
// Convex function in convex/mcpTools.ts; `identityArg: "caller"` tells the
// gateway to inject the verified caller identity into that argument (and strip
// it from the client-facing input schema, so it can't be spoofed). Annotated
// `McpToolRegistration[]` to avoid the codegen circular-type error.
import { v } from "convex/values";
import {
  defineMcpQuery,
  mcpCallerValidator,
  type McpToolRegistration,
} from "convex-mcp-gateway";

import { api } from "./_generated/api";

export const tools: McpToolRegistration[] = [
  defineMcpQuery({
    name: "get_agent_context",
    description:
      "Call FIRST. Returns who you are acting as and the households you can reach (id, name, role). Use a householdId from here for the other tools.",
    fn: api.mcpTools.getAgentContext,
    args: { caller: mcpCallerValidator },
    identityArg: "caller",
  }),
  defineMcpQuery({
    name: "list_moves",
    description:
      "List the active moves in a household (origin, destination, type, status). Pass a householdId from get_agent_context.",
    fn: api.mcpTools.listMovesForHousehold,
    args: { caller: mcpCallerValidator, householdId: v.id("households") },
    identityArg: "caller",
  }),
  defineMcpQuery({
    name: "get_move_summary",
    description: "Basic facts about one move (title, route, type, status, packets).",
    fn: api.mcpTools.getMoveSummary,
    args: {
      caller: mcpCallerValidator,
      householdId: v.id("households"),
      moveId: v.id("moves"),
    },
    identityArg: "caller",
  }),
];
