import { describe, expect, it } from "vitest";

import {
  normalizeRuleList,
  normalizeSortOrder,
} from "../../convex/lib/moveFields";

describe("move field helpers", () => {
  it("normalizes rule lists without duplicates or empty values", () => {
    expect(
      normalizeRuleList([" no liquids ", "", "fragile top", "no liquids"])
    ).toEqual(["no liquids", "fragile top"]);
  });

  it("preserves finite sort orders and falls back for invalid values", () => {
    expect(normalizeSortOrder(10)).toBe(10);
    expect(Number.isFinite(normalizeSortOrder(undefined))).toBe(true);
  });
});
