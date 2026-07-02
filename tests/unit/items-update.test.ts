import { describe, expect, it } from "vitest";

import { weightConfidenceForActualUpdate } from "../../convex/items";

describe("items.update measurement normalization", () => {
  it("sets actual confidence when an agent writes a bare actual weight", () => {
    expect(weightConfidenceForActualUpdate({ actualWeightLb: 50 })).toBe(
      "actual",
    );
  });

  it("preserves explicit confidence and does not infer while clearing actual weight", () => {
    expect(
      weightConfidenceForActualUpdate({
        actualWeightLb: 50,
        weightConfidence: "manual",
      }),
    ).toBe("manual");
    expect(
      weightConfidenceForActualUpdate({
        actualWeightLb: 50,
        clearActualWeight: true,
      }),
    ).toBeUndefined();
  });
});
