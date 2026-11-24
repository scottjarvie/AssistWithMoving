// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { assertConnectorContract, MCP_CONNECTOR_CONTRACT_VERSION } from "../../convex/lib/mcpConnector/contract";
import { movingConnectorInstructions } from "../../convex/lib/mcpConnector/instructions";
import { STATELESS_MOVING_TOOL_NAMES } from "../../convex/httpRoutes/mcp";
import { tools as legacyTools } from "../../convex/mcp";
import { listedMovingToolName } from "../../shared/moving-mcp-tool-names.mjs";
import { POST } from "../../src/app/api/mcp/route";

const authority = [
  "narrow your own connection with moving_reduce_connection",
  "Use opId and expectedVersion",
  "You can never widen, resume or restore it",
  "https://movingmanifest.com/settings/ai; signing in again changes nothing",
  "Archive and restore are allowed",
  "spending money and messaging are never available",
  "Household invitations stay website-only",
  "obvious secrets are refused",
  "The person and AI can unpublish with any active grant",
];
const workflowRules = [
  "counts exactly equal to what was found for the whole batch, including on the first call",
  "Business contact details are expected",
  "restorePrivately:true to revoke affected links",
  "Reopening never makes a person-reviewed suggestion withdrawable",
  "Never archive a flagged item to hide its question",
  "you may withdraw your own suggestion before they act",
  "Propose suggestions may be removed without blocking requested work",
];

it("has the exact shared 1.0.1 contract", () => {
  expect(MCP_CONNECTOR_CONTRACT_VERSION).toBe("1.0.1");
  const bytes = readFileSync("convex/lib/mcpConnector/contract.ts", "utf8").replace(/\r\n/g, "\n");
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("17aab26f605a5cf52bdbc7a8d8449f6ee0117cf7ac3ca12aec40d877031c3467");
});

it.each([
  { door: "canonical", names: STATELESS_MOVING_TOOL_NAMES, firstCall: "moving_get_move_brief" },
  { door: "legacy", names: legacyTools.map(tool => tool.name), firstCall: "moving_describe_connection" },
] as const)("keeps $door instructions and tool names within the contract at every access level", ({ door, names, firstCall }) => {
  const tools = names.map(listedMovingToolName);
  const checks = [...authority, "earlier restricted, unreleased OAuth connections set a floor", "Existing client ids keep their own limits"];
  const states = [
    { status: "active" },
    { status: "active", changedAt: 8.64e15, expiresAt: -8.64e15 },
    { status: "paused", changedAt: 8.64e15, expiresAt: -8.64e15 },
    { status: "expired", changedAt: 8.64e15, expiresAt: -8.64e15 },
    { status: "lookup-unavailable", changedAt: 8.64e15, expiresAt: -8.64e15 },
  ];
  for (const state of states) {
    const instructions = movingConnectorInstructions(door, state);
    assertConnectorContract(instructions, checks, tools, "moving");
    expect(instructions).toContain(firstCall);
    for (const rule of workflowRules) expect(instructions).toContain(rule);
    expect(instructions.split("\n\n")[2]).toMatch(/^This connection is [^.]+\.$/);
  }
});

async function apiKeyRequest(method: string, params?: Record<string, unknown>) {
  const response = await POST(new Request("https://movingmanifest.test/api/mcp", {
    method: "POST",
    headers: { authorization: "Bearer mmk_synthetic", "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }));
  expect(response.status).toBe(200);
  const body = await response.text();
  return JSON.parse(body.match(/^data: (.+)$/m)?.[1] ?? body).result;
}

afterEach(() => vi.unstubAllGlobals());

it("serves one API-key name per tool and keeps both call forms for a stopped or active key", async () => {
  let status = "active";
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: { status } })));
  for (const state of ["active", "paused"]) {
    status = state;
    const { instructions } = await apiKeyRequest("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x".repeat(1000), version: "test" } });
    const { tools } = await apiKeyRequest("tools/list");
    assertConnectorContract(instructions, [...authority, "with no forced end date"], tools, "moving");
    expect(tools.map((tool: { name: string }) => tool.name)).toContain("moving_upload_evidence_image");
    expect(tools.map((tool: { name: string }) => tool.name)).not.toContain("moving_upload_image");
    for (const rule of workflowRules) expect(instructions).toContain(rule);
    expect(instructions).toContain("Most write tools accept dryRun");
    const original = await apiKeyRequest("tools/call", { name: "get_api_capabilities", arguments: {} });
    const prefixed = await apiKeyRequest("tools/call", { name: "moving_get_api_capabilities", arguments: {} });
    expect(prefixed).toEqual(original);
    expect(prefixed.isError).not.toBe(true);
  }
});
