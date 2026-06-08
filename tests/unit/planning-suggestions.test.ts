import { describe, expect, it } from "vitest";

import {
  suggestAssignmentForBox,
  suggestEstimateForItem,
} from "../../convex/lib/planningSuggestions";

describe("AI planning suggestions", () => {
  it("suggests missing item estimates without overriding manual values", () => {
    const suggestion = suggestEstimateForItem({
      itemId: "item1",
      name: "garage toolbox",
      quantity: 1,
    });

    expect(suggestion).toMatchObject({
      itemId: "item1",
      confidence: "medium",
      estimateDraft: {
        category: "Tools",
        estimatedWeightLb: 45,
        estimatedVolumeCuFt: 3,
      },
    });

    expect(
      suggestEstimateForItem({
        itemId: "item2",
        name: "garage toolbox",
        estimatedWeightLb: 50,
      })
    ).toBeNull();
  });

  it("suggests a load assignment through shared validation", () => {
    const suggestion = suggestAssignmentForBox({
      box: {
        boxId: "box1",
        code: "B-001",
        estimatedWeightLb: 30,
        estimatedVolumeCuFt: 4,
        itemCount: 2,
        hasFragile: false,
        hasHighValue: false,
        hasSensitive: false,
        hasPersonalTransport: false,
        hasHazardous: false,
      },
      resources: [
        {
          resourceId: "truck1",
          type: "truck",
          name: "Truck",
          capacity: { maxWeightLb: 1000, maxVolumeCuFt: 100 },
        },
      ],
      zones: [
        {
          zoneId: "front",
          resourceId: "truck1",
          name: "Front",
          capacity: { maxWeightLb: 400, maxVolumeCuFt: 40 },
        },
      ],
    });

    expect(suggestion).toMatchObject({
      boxId: "box1",
      confidence: "medium",
      assignmentDraft: {
        assignedResourceId: "truck1",
        assignedZoneId: "front",
        assignmentHardBlocks: [],
      },
    });
  });

  it("skips locked or already assigned boxes", () => {
    const baseBox = {
      boxId: "box1",
      code: "B-001",
      estimatedWeightLb: 30,
      estimatedVolumeCuFt: 4,
      itemCount: 2,
      hasFragile: false,
      hasHighValue: false,
      hasSensitive: false,
      hasPersonalTransport: false,
      hasHazardous: false,
    };
    const resources = [
      {
        resourceId: "truck1",
        type: "truck",
        name: "Truck",
        capacity: { maxWeightLb: 1000, maxVolumeCuFt: 100 },
      },
    ];

    expect(
      suggestAssignmentForBox({
        box: { ...baseBox, assignmentLocked: true },
        resources,
        zones: [],
      })
    ).toBeNull();
    expect(
      suggestAssignmentForBox({
        box: { ...baseBox, assignedResourceId: "truck1" },
        resources,
        zones: [],
      })
    ).toBeNull();
  });

  it("carries validation warnings into assignment suggestions", () => {
    const suggestion = suggestAssignmentForBox({
      box: {
        boxId: "box1",
        code: "B-001",
        estimatedWeightLb: 80,
        estimatedVolumeCuFt: 4,
        itemCount: 2,
        hasFragile: true,
        hasHighValue: false,
        hasSensitive: false,
        hasPersonalTransport: false,
        hasHazardous: false,
      },
      resources: [
        {
          resourceId: "truck1",
          type: "truck",
          name: "Truck",
          capacity: { maxWeightLb: 1000, maxVolumeCuFt: 100 },
        },
      ],
      zones: [],
    });

    expect(suggestion?.confidence).toBe("low");
    expect(suggestion?.assignmentDraft.assignmentWarnings).toEqual(
      expect.arrayContaining(["heavyBox", "fragileContents"])
    );
    expect(suggestion?.assignmentDraft.overrideReason).toContain(
      "validation warnings"
    );
  });
});
