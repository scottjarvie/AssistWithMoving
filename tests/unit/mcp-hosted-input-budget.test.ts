// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { POST } from "../../src/app/api/mcp/route";
import { boundHostedMcpRequest, MAX_HOSTED_MCP_REQUEST_BYTES } from "../../src/lib/mcp-input-limits";

afterEach(() => vi.unstubAllGlobals());

function toolRequest(items: unknown[]) {
  return new Request("https://moving.test/api/mcp", {
    method: "POST",
    headers: { authorization: "Bearer mmk_synthetic_invalid", "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "batch_upsert_items", arguments: { moveId: "synthetic-move", items, dryRun: true } } }),
  });
}

async function result(response: Response) {
  const text = await response.text();
  const payload = text.startsWith("event:") || text.startsWith("data:") ? text.split("\n").filter(line => line.startsWith("data:")).at(-1)?.slice(5).trim() : text;
  return JSON.parse(payload || "null");
}

test("a fabricated key cannot reach schema expansion or REST with an array bomb", async () => {
  const rest = vi.fn<typeof fetch>(async () => Response.json({ accepted: true }));
  vi.stubGlobal("fetch", rest);
  const response = await POST(toolRequest(Array.from({ length: 80_000 }, () => ({}))));
  expect(response.status).toBe(200);
  const body = await result(response);
  expect(body.result.isError).toBe(true);
  expect(JSON.stringify(body.result)).toContain("maximum of 65536 elements");
  expect(JSON.stringify(body.result)).not.toMatch(/invalid_union|invalid_type/);
  expect(rest).not.toHaveBeenCalled();
});

test("one hundred supported inventory rows still reach the REST adapter", async () => {
  const rest = vi.fn<typeof fetch>(async () => Response.json({ accepted: true }));
  vi.stubGlobal("fetch", rest);
  const response = await POST(toolRequest(Array.from({ length: 100 }, (_, i) => ({ name: `Synthetic ${i}`, notes: "Synthetic fixture" }))));
  expect(response.status).toBe(200);
  expect((await result(response)).result.isError).not.toBe(true);
  expect(rest).toHaveBeenCalledOnce();
  expect(JSON.parse(rest.mock.calls[0][1]?.body as string).items).toHaveLength(100);
});

test("streamed bytes enforce the cap even when content-length is false", async () => {
  const rest = vi.fn();
  vi.stubGlobal("fetch", rest);
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(MAX_HOSTED_MCP_REQUEST_BYTES + 1)); }, cancel });
  const init: RequestInit & { duplex: "half" } = { method: "POST", body: stream, duplex: "half", headers: { authorization: "Bearer mmk_synthetic_invalid", "content-length": "1", "content-type": "application/json" } };
  const response = await POST(new Request("https://moving.test/api/mcp", init));
  expect(response.status).toBe(413);
  expect(cancel).toHaveBeenCalledOnce();
  expect(rest).not.toHaveBeenCalled();
});

test("the byte reader preserves a media-sized JSON string below the host limit", async () => {
  const body = JSON.stringify({ imageBase64: "A".repeat(4_500_000) });
  const request = await boundHostedMcpRequest(new Request("https://moving.test/api/mcp", { method: "POST", body }));
  expect(request).toBeInstanceOf(Request);
  expect(await (request as Request).text()).toBe(body);
});
