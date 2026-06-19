import { describe, expect, it } from "vitest";

import { mcpReadonlyDiscoveryProofResults } from "../../scripts/mcp-readonly-discovery-proof.mjs";

describe("MCP read-only discovery proof", () => {
  it("passes when the expected discovery, read, and setup contracts are present", () => {
    const results = mcpReadonlyDiscoveryProofResults({
      tools: [
        {
          name: "get_api_capabilities",
          annotations: { readOnlyHint: true },
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "get_api_context",
          annotations: { readOnlyHint: true },
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "list_moves",
          annotations: { readOnlyHint: true },
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "get_move_summary",
          annotations: { readOnlyHint: true },
          inputSchema: { type: "object", properties: { moveId: {} } },
        },
        {
          name: "get_agent_context",
          annotations: { readOnlyHint: true },
          inputSchema: { type: "object", properties: { moveId: {} } },
        },
        {
          name: "setup_move",
          annotations: { readOnlyHint: false },
          inputSchema: { type: "object", properties: { dryRun: {} } },
        },
      ],
      capabilitiesPayload: {
        summary: { capabilityCount: 5 },
        capabilities: [
          { id: "apiContext" },
          {
            id: "moveSetup",
            mcpTools: ["list_moves", "setup_move", "get_move_summary"],
          },
          { id: "inventory" },
          { id: "photoEvidence" },
          { id: "documentationProfiles" },
        ],
      },
    });

    expect(results.every((result) => result.status === "pass")).toBe(true);
  });

  it("fails if setup_move stops advertising dryRun", () => {
    const results = mcpReadonlyDiscoveryProofResults({
      tools: [
        {
          name: "get_api_capabilities",
          annotations: { readOnlyHint: true },
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "get_api_context",
          annotations: { readOnlyHint: true },
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "list_moves",
          annotations: { readOnlyHint: true },
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "get_move_summary",
          annotations: { readOnlyHint: true },
          inputSchema: { type: "object", properties: { moveId: {} } },
        },
        {
          name: "get_agent_context",
          annotations: { readOnlyHint: true },
          inputSchema: { type: "object", properties: { moveId: {} } },
        },
        {
          name: "setup_move",
          annotations: { readOnlyHint: false },
          inputSchema: { type: "object", properties: {} },
        },
      ],
      capabilitiesPayload: {
        summary: { capabilityCount: 5 },
        capabilities: [
          { id: "apiContext" },
          {
            id: "moveSetup",
            mcpTools: ["list_moves", "setup_move", "get_move_summary"],
          },
          { id: "inventory" },
          { id: "photoEvidence" },
          { id: "documentationProfiles" },
        ],
      },
    });

    expect(results).toContainEqual(
      expect.objectContaining({
        status: "fail",
        label: "tool setup_move dryRun input",
      })
    );
  });
});
