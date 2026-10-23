// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- SDK envelopes and stubbed ActionCtx are synthetic. */
/** Prove the opt-in SDK budget applies before inventory schema/writer work. */
import { createMcpHandler } from "@modelcontextprotocol/server";
import { getFunctionName } from "convex/server";
import { expect, test } from "vitest";
import { createMovingServer, MAX_MCP_REQUEST_BYTES } from "../../convex/httpRoutes/mcp";

async function call(input: Record<string, unknown>, name = "save_inventory") {
  const writes: { name: string; input: any }[] = [];
  const ctx = { runMutation: async (ref: any, input: any) => { writes.push({ name: getFunctionName(ref), input }); return { accepted: true }; } } as any;
  const handler = createMcpHandler(() => createMovingServer(ctx, { issuer: "https://budget.example.test", subject: "synthetic-budget-owner", clientId: "synthetic-budget-ai" }).server, { legacy: "stateless", responseMode: "json", maxRequestBodySize: MAX_MCP_REQUEST_BYTES });
  const body = JSON.stringify({ jsonrpc: "2.0", id: "synthetic-budget", method: "tools/call", params: { name, arguments: { moveId: "synthetic-move", operationId: "synthetic-budget-call", reason: "Synthetic budget proof", ...input }, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "budget-test", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} } } });
  expect(new TextEncoder().encode(body).byteLength).toBeLessThan(MAX_MCP_REQUEST_BYTES);
  try {
    const response = await handler.fetch(new Request("https://budget.example.test/mcp", { method: "POST", headers: { "content-type": "application/json", "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/call", "mcp-name": name }, body }));
    expect(response.status).toBe(200);
    return { body: await response.json() as any, writes };
  } finally { await handler.close(); }
}

test("compact oversized inventory arguments fail before schema expansion or any mutation", async () => {
  const result = await call({ items: Array.from({ length: 100_000 }, () => ({})) });
  expect(result.body.result.isError).toBe(true);
  expect(JSON.stringify(result.body.result)).toContain("maximum of 65536 elements");
  expect(JSON.stringify(result.body.result)).not.toMatch(/invalid_type|invalid_union/);
  expect(result.writes).toEqual([]);
});

test("one hundred inventory rows retain their review flags and source provenance", async () => {
  const items = Array.from({ length: 100 }, (_, index) => ({ createKey: `synthetic-item-${index}`, name: "Synthetic item", reviewFlags: Array.from({ length: 30 }, (_, flag) => `flag-${flag}`), researchSources: Array.from({ length: 30 }, () => ({ title: "Synthetic source", url: "https://example.test/source", summary: "Synthetic finding", status: "checked", checkedAt: 1 })) }));
  const result = await call({ items });
  expect(result.body.result.isError).not.toBe(true);
  const write = result.writes.find(item => item.name.endsWith(":saveInventory"));
  expect(write?.input.items).toHaveLength(100);
});

test("a near-byte-limit complete result retains inventory and planning references together", async () => {
  const itemIds = Array.from({ length: 40 }, (_, i) => String(i).padStart(32, "a"));
  const boxIds = Array.from({ length: 30 }, (_, i) => String(i).padStart(32, "b"));
  const records = (kind: "decision" | "estimate" | "planResult") => Array.from({ length: 30 }, (_, i) => ({ stableKey: `${kind}-${i}`, kind, title: "X", summary: "X", alternatives: Array(20).fill("X"), assumptions: Array(30).fill("X"), relatedItemIds: itemIds, relatedBoxIds: boxIds, ...(kind === "decision" ? { decision: "X" } : kind === "estimate" ? { estimateMetric: "X", estimateValue: 1 } : { body: "X" }) }));
  const input = {
    resultKey: "synthetic-complete", title: "X", summary: "X", body: "X",
    items: Array.from({ length: 100 }, (_, i) => ({ createKey: `item-${i}`, name: "X", reviewFlags: Array(30).fill("X"), researchSources: Array.from({ length: 30 }, () => ({ title: "", url: "https://x.co", summary: "", status: "checked", checkedAt: 1 })) })),
    decisions: records("decision"), estimates: records("estimate"), planSections: records("planResult"),
  };
  const result = await call(input, "save_complete_result");
  expect(result.body.result.isError).not.toBe(true);
  const write = result.writes.find(item => item.name.endsWith(":saveCompleteResult"));
  expect(write?.input.items).toHaveLength(100);
  expect(write?.input.decisions).toHaveLength(30);
  expect(write?.input.estimates).toHaveLength(30);
  expect(write?.input.planSections).toHaveLength(30);
});
