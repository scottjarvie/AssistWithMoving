import { describe, expect, it } from "vitest";

import {
  groupPlacementChildren,
  isPlacementDescendant,
  placementBorderStyle,
  placementFootprintFromDimensions,
  totalContainedCount,
} from "../../src/lib/plan-placements";
import { planTemplateByKey, planTemplates } from "../../src/lib/plan-templates";

describe("plan placements", () => {
  it("ships the required furniture template catalog with heights", () => {
    expect(planTemplates.map((template) => template.key)).toEqual(
      expect.arrayContaining([
        "bed_twin",
        "bed_full",
        "bed_queen",
        "bed_king",
        "sofa",
        "loveseat",
        "dining_table",
        "desk",
        "dresser",
        "fridge",
        "washer",
        "dryer",
        "piano_upright",
        "bookshelf",
        "nightstand",
      ]),
    );
    expect(planTemplates.every((template) => template.heightIn > 0)).toBe(true);
    expect(planTemplateByKey("bed_queen")).toMatchObject({
      lengthIn: 80,
      widthIn: 60,
      heightIn: 24,
    });
  });

  it("uses the two largest item dimensions for the footprint", () => {
    expect(
      placementFootprintFromDimensions({
        lengthIn: 30,
        widthIn: 40,
        heightIn: 70,
      }),
    ).toEqual({ lengthIn: 70, widthIn: 40, measured: true });
  });

  it("uses the queen-bed footprint at room scale", () => {
    expect(
      placementFootprintFromDimensions({
        lengthIn: 80,
        widthIn: 60,
        heightIn: 24,
      }),
    ).toEqual({ lengthIn: 80, widthIn: 60, measured: true });
  });

  it("falls back to an unknown 24 inch chip without enough dimensions", () => {
    expect(placementFootprintFromDimensions({ lengthIn: 30 })).toEqual({
      lengthIn: 24,
      widthIn: 24,
      measured: false,
    });
  });

  it("maps measurement confidence to placement border styles", () => {
    const measured = { lengthIn: 80, widthIn: 60, measured: true };
    const unknown = { lengthIn: 24, widthIn: 24, measured: false };

    expect(placementBorderStyle(measured, "actual")).toEqual({
      dashArray: undefined,
      marker: undefined,
    });
    expect(placementBorderStyle(measured, "manual")).toEqual({
      dashArray: undefined,
      marker: undefined,
    });
    expect(placementBorderStyle(measured, "high")).toEqual({
      dashArray: "8 5",
      marker: undefined,
    });
    expect(placementBorderStyle(measured, "medium")).toEqual({
      dashArray: "8 5",
      marker: undefined,
    });
    expect(placementBorderStyle(measured, "low")).toEqual({
      dashArray: "8 5",
      marker: undefined,
    });
    expect(placementBorderStyle(measured, undefined)).toEqual({
      dashArray: "8 5",
      marker: undefined,
    });
    expect(placementBorderStyle(unknown, undefined)).toEqual({
      dashArray: "2 4",
      marker: "?",
    });
  });

  it("groups direct and nested contained placements for badge counts", () => {
    const placements = [
      { _id: "dresser" },
      { _id: "lamp", parentPlacementId: "dresser" },
      { _id: "bin", parentPlacementId: "dresser" },
      { _id: "cable", parentPlacementId: "bin" },
    ];
    const groups = groupPlacementChildren(placements);

    expect(groups.get("dresser")?.map((placement) => placement._id)).toEqual([
      "lamp",
      "bin",
    ]);
    expect(groups.get("dresser")).toHaveLength(2);
    expect(totalContainedCount("dresser", groups)).toBe(3);
    expect(isPlacementDescendant("cable", "dresser", placements)).toBe(true);
    expect(isPlacementDescendant("dresser", "cable", placements)).toBe(false);
  });

  it("does not loop forever when bad containment data has a cycle", () => {
    const placements = [
      { _id: "a", parentPlacementId: "b" },
      { _id: "b", parentPlacementId: "a" },
    ];
    const groups = groupPlacementChildren(placements);

    expect(totalContainedCount("a", groups)).toBe(2);
    expect(isPlacementDescendant("b", "a", placements)).toBe(true);
  });
});
