// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { downloadPublicHttpsMedia } from "../../mcp-server/media-ingress.mjs";
const lookupFn = async () => [{ address: "93.184.216.34", family: 4 }];
describe("media-policy admission before source reads", () => {
  it("returns structured FILE_TOO_LARGE before reading an over-cap declared body", async () => {
    const beforeRead = vi.fn(), body = vi.fn(), destroy = vi.fn();
    const pending = downloadPublicHttpsMedia("https://synthetic.example/image", { maxBytes: 10, fileKind: "image", lookupFn, beforeRead, requestFn: async () => ({ status: 200, headers: new Headers({ "content-length": "11" }), body: { [Symbol.asyncIterator]: body }, destroy }) });
    await expect(pending).rejects.toMatchObject({ payload: { error: { code: "FILE_TOO_LARGE", max: 10, got: 11 } } });
    expect(beforeRead).not.toHaveBeenCalled(); expect(body).not.toHaveBeenCalled(); expect(destroy).toHaveBeenCalled();
  });
  it.each([undefined, "5"])("runs the allowance check before the first body byte, length %s", async length => {
    const events: string[] = [];
    async function* body() { events.push("body"); yield Buffer.from("hello"); }
    const result = await downloadPublicHttpsMedia("https://synthetic.example/image", { maxBytes: 10, fileKind: "image", lookupFn, beforeRead: async declared => { events.push("reserve"); expect(declared).toBe(length ? 5 : null); }, requestFn: async () => ({ status: 200, headers: new Headers(length ? { "content-length": length } : {}), body: body() }) });
    expect(result.bytes.toString()).toBe("hello"); expect(events).toEqual(["reserve", "body"]);
  });
  it("destroys the connection without reading a body when admission refuses", async () => {
    const destroy = vi.fn(), body = vi.fn();
    await expect(downloadPublicHttpsMedia("https://synthetic.example/image", { maxBytes: 10, fileKind: "image", lookupFn, beforeRead: async () => { throw new Error("Synthetic allowance refusal"); }, requestFn: async () => ({ status: 200, headers: new Headers({ "content-length": "5" }), body: { [Symbol.asyncIterator]: body }, destroy }) })).rejects.toThrow("Synthetic allowance refusal");
    expect(body).not.toHaveBeenCalled(); expect(destroy).toHaveBeenCalled();
  });
});
