import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { assertPriceCents } from "../../convex/saleListings";

describe("sale listing price validation", () => {
  it("accepts undefined and whole non-negative cents", () => {
    expect(() => assertPriceCents(undefined, "Price")).not.toThrow();
    expect(() => assertPriceCents(0, "Price")).not.toThrow();
    expect(() => assertPriceCents(1299, "Price")).not.toThrow();
  });

  it("rejects non-finite, negative, and fractional cents", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, 12.5]) {
      expect(() => assertPriceCents(value, "Price")).toThrow(ConvexError);
      expect(() => assertPriceCents(value, "Price")).toThrow(
        "Price must be a non-negative whole number of cents.",
      );
    }
  });
});
