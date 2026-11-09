// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { registerTools } from "../../mcp-server/assistwithmoving-mcp.mjs";
import { assistWithMovingRequest, withPublicationInput } from "../../mcp-server/assistwithmoving-api.mjs";
afterEach(() => vi.unstubAllGlobals());
it("HTTP/stdio write schemas expose the batch options and forward them through ordinary API helpers", async () => {
  const handlers = new Map<string, { options: { inputSchema: Record<string, unknown> }; handler: (input: unknown) => Promise<unknown> }>();
  registerTools({ registerTool: (name: string, options: { inputSchema: Record<string, unknown> }, handler: (input: unknown) => Promise<unknown>) => handlers.set(name, { options, handler }) }, { baseUrl: "https://example.test/api/v1", apiKey: "synthetic-credential" });
  const call = handlers.get("update_item")!;
  expect(call.options.inputSchema.acknowledgeContactDetails).toBeTruthy();
  expect(call.options.inputSchema.restorePrivately).toBeTruthy();
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => { void _url; void _init; return new Response(JSON.stringify({ data: {} }), { headers: { "content-type": "application/json" } }); }); vi.stubGlobal("fetch", fetch);
  await call.handler({ moveId: "move-one", itemId: "item-one", description: "shop@example.test", acknowledgeContactDetails: { emails: 1, phones: 0, addresses: 0 }, restorePrivately: true });
  expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toMatchObject({ acknowledgeContactDetails: { emails: 1, phones: 0, addresses: 0 }, restorePrivately: true });
});
it("concurrent request-local acknowledgements do not leak between callers", async () => {
  const bodies: unknown[] = []; vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => { void _url; bodies.push(JSON.parse(init.body as string)); return new Response("{}", { headers: { "content-type": "application/json" } }); }));
  const config = { baseUrl: "https://example.test/api/v1", apiKey: "synthetic-credential" };
  await Promise.all([1, 2].map(emails => withPublicationInput({ acknowledgeContactDetails: { emails, phones: 0, addresses: 0 } }, async () => { await Promise.resolve(); return assistWithMovingRequest(config, { method: "PATCH", path: "items", query: undefined, idempotencyKey: undefined, body: { emails } }); })));
  expect(bodies).toEqual(expect.arrayContaining([expect.objectContaining({ emails: 1, acknowledgeContactDetails: { emails: 1, phones: 0, addresses: 0 } }), expect.objectContaining({ emails: 2, acknowledgeContactDetails: { emails: 2, phones: 0, addresses: 0 } })]));
  await assistWithMovingRequest(config, { method: "PATCH", path: "items", query: undefined, idempotencyKey: undefined, body: { private: true } });
  expect(bodies[2]).toEqual({ private: true });
});
