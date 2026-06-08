import { describe, expect, it } from "vitest";

import { getMovePlanningDefaults } from "../../convex/lib/planningDefaults";

describe("move planning defaults", () => {
  it("includes the required first-night and personal-transport defaults", () => {
    expect(getMovePlanningDefaults().map((defaultPreset) => defaultPreset.key))
      .toEqual([
        "firstNight",
        "doNotLetMoversTouch",
        "highValue",
        "documents",
        "medication",
        "electronics",
        "sensitive",
        "fragile",
        "irreplaceable",
        "restrictedReview",
      ]);
  });

  it("keeps sensitive defaults private by default", () => {
    const defaults = getMovePlanningDefaults();

    for (const key of [
      "doNotLetMoversTouch",
      "highValue",
      "documents",
      "medication",
      "electronics",
      "sensitive",
      "irreplaceable",
    ]) {
      expect(defaults.find((preset) => preset.key === key)).toMatchObject({
        sensitiveByDefault: true,
      });
    }
  });

  it("routes documents and medication to personal transport", () => {
    expect(
      getMovePlanningDefaults().filter((preset) =>
        ["documents", "medication"].includes(preset.key)
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "documents",
          handling: "personalTransport",
          recommendedResourceTypes: ["personalVehicle"],
        }),
        expect.objectContaining({
          key: "medication",
          handling: "personalTransport",
          recommendedResourceTypes: ["personalVehicle"],
        }),
      ])
    );
  });
});
