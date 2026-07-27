import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  inventorySearchLimit,
  normalizeInventorySearchQuery,
  toMcpInventorySearchResult,
} from "../../convex/lib/inventorySearch";

const item = {
  _id: "item-1" as Id<"items">,
  name: "Road bike",
  room: undefined,
  category: undefined,
  quantity: 1,
  disposition: "take",
  status: "active",
  needsReview: false,
  privateNotes: "owner only",
  serialNumber: "PRIVATE-123",
} as Doc<"items">;

describe("inventory indexed search", () => {
  it("declares the move-filtered normalized-name search index", () => {
    const schema = readFileSync("convex/schema.ts", "utf8");

    expect(schema).toContain('.searchIndex("search_normalized_name", {');
    expect(schema).toContain('searchField: "normalizedName"');
    expect(schema).toMatch(
      /filterFields:\s*\[\s*"moveId",\s*"room",\s*"category",\s*"disposition",\s*"needsReview",\s*"deletedAt",?\s*\]/,
    );
  });

  it("normalizes indexed query text and treats blank text as fallback", () => {
    expect(normalizeInventorySearchQuery("  ROAD   Bike  ")).toBe("road bike");
    expect(normalizeInventorySearchQuery("   ")).toBeNull();
    expect(normalizeInventorySearchQuery(undefined)).toBeNull();
  });

  it("preserves the hosted search_inventory response projection", () => {
    const result = toMcpInventorySearchResult(item);

    expect(result).toEqual({
      itemId: "item-1",
      name: "Road bike",
      room: null,
      category: null,
      quantity: 1,
      disposition: "take",
      status: "active",
      needsReview: false,
    });
    expect(result).not.toHaveProperty("privateNotes");
    expect(result).not.toHaveProperty("serialNumber");
    expect(Object.keys(result)).toHaveLength(8);
  });

  it("keeps direct search at 50 and hosted search at 200 results", () => {
    expect(inventorySearchLimit(undefined, 50)).toBe(50);
    expect(inventorySearchLimit(500, 50)).toBe(50);
    expect(inventorySearchLimit(25, 50)).toBe(25);
    expect(inventorySearchLimit(undefined, 200)).toBe(200);
    expect(inventorySearchLimit(500, 200)).toBe(200);
  });
});
