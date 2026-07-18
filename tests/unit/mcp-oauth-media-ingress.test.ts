import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { assertOAuthImageBytes, assertOAuthImageSource } from "../../convex/lib/mcpMediaIngress";

const pngBytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAADZrBkAAAAADUlEQVR42mP8z8BQDwAFgwJ/lpQqNwAAAABJRU5ErkJggg==", "base64"));

describe("OAuth MCP image ingress", () => {
  it("returns an actionable ConvexError for remote URLs", () => {
    expect(() => assertOAuthImageSource({ url: "https://images.example/photo.png" })).toThrowError(ConvexError);
    expect(() => assertOAuthImageSource({ url: "https://images.example/photo.png" })).toThrow(/pass base64 instead/i);
  });
  it("requires one base64 payload", () => {
    expect(() => assertOAuthImageSource({})).toThrowError(ConvexError);
    expect(() => assertOAuthImageSource({})).toThrow(/Provide base64 image data/i);
  });
  it("keeps base64 uploads available", () => {
    expect(() => assertOAuthImageSource({ base64: Buffer.from(pngBytes).toString("base64") })).not.toThrow();
    expect(assertOAuthImageBytes(pngBytes)).toBe("image/png");
  });
  it("rejects malformed signatures and claimed MIME mismatches", () => {
    expect(() => assertOAuthImageBytes(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toThrow(/JPEG, PNG, or WebP signature/i);
    expect(() => assertOAuthImageBytes(pngBytes, "image/jpeg")).toThrow(/content is image\/png, not image\/jpeg/i);
  });
});
