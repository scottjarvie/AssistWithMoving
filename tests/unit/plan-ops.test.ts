import { describe, expect, it, vi } from "vitest";

import {
  countPlacementSources,
  createPlanBatchId,
  validatePlacementSource,
} from "../../src/lib/plan-ops";

describe("plan ops", () => {
  it("creates batch IDs with the provided prefix", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.123456);

    expect(createPlanBatchId("draw")).toMatch(/^draw_[a-z0-9]+_[a-z0-9]+$/);

    vi.restoreAllMocks();
  });

  it("counts placement sources", () => {
    expect(countPlacementSources({ itemId: "item1" })).toBe(1);
    expect(countPlacementSources({ itemId: "item1", boxId: "box1" })).toBe(2);
    expect(countPlacementSources({ itemId: "" })).toBe(0);
  });

  it("requires exactly one placement source", () => {
    expect(validatePlacementSource({ itemId: "item1" })).toBe(true);
    expect(validatePlacementSource({ templateKey: "queen-bed" })).toBe(true);
    expect(validatePlacementSource({})).toBe(false);
    expect(
      validatePlacementSource({
        itemId: "item1",
        plannedItemId: "planned1",
      }),
    ).toBe(false);
  });
});
