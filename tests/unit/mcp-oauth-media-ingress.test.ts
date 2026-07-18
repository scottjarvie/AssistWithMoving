import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { assertOAuthImageSource } from "../../convex/lib/mcpMediaIngress";

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
    expect(() => assertOAuthImageSource({ base64: "iVBORw0KGgo=" })).not.toThrow();
  });
});
