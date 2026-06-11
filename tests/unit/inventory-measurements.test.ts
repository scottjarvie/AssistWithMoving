import { describe, expect, it } from "vitest";

import {
  hasItemDimensions,
  itemDimensionsConfidenceForRead,
} from "@/lib/inventory-measurements";

describe("inventory measurement helpers", () => {
  it("detects positive item dimensions", () => {
    expect(hasItemDimensions(undefined)).toBe(false);
    expect(hasItemDimensions({ lengthIn: 0, widthIn: -1 })).toBe(false);
    expect(hasItemDimensions({ lengthIn: 30 })).toBe(true);
  });

  it("treats legacy dimensions without confidence as estimated", () => {
    expect(
      itemDimensionsConfidenceForRead({
        dimensionsIn: { lengthIn: 30, widthIn: 20, heightIn: 18 },
      }),
    ).toBe("medium");
  });

  it("preserves explicit confidence values and leaves dimensionless rows unset", () => {
    expect(
      itemDimensionsConfidenceForRead({
        dimensionsIn: { lengthIn: 30, widthIn: 20 },
        dimensionsConfidence: "manual",
      }),
    ).toBe("manual");
    expect(
      itemDimensionsConfidenceForRead({
        dimensionsIn: { lengthIn: 30, widthIn: 20 },
        dimensionsConfidence: "none",
      }),
    ).toBe("none");
    expect(itemDimensionsConfidenceForRead({})).toBeUndefined();
  });
});
