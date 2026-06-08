import { describe, expect, it } from "vitest";

import {
  requiresOverrideReason,
  validateAssignment,
} from "../../convex/lib/assignmentValidation";

const baseBox = {
  estimatedWeightLb: 40,
  estimatedVolumeCuFt: 4,
  itemCount: 3,
  hasFragile: false,
  hasHighValue: false,
  hasSensitive: false,
  hasPersonalTransport: false,
  hasHazardous: false,
};

describe("assignment validation", () => {
  it("warns when resource capacity is exceeded", () => {
    const validation = validateAssignment({
      box: { ...baseBox, estimatedWeightLb: 120 },
      target: {
        resourceType: "truck",
        capacity: { maxWeightLb: 100, maxVolumeCuFt: 10 },
      },
    });

    expect(validation.softWarnings).toContain("resourceOverWeightCapacity");
    expect(validation.weightPercent).toBe(120);
    expect(requiresOverrideReason(validation)).toBe(true);
  });

  it("hard-blocks hazardous contents from professional movers", () => {
    const validation = validateAssignment({
      box: { ...baseBox, hasHazardous: true },
      target: {
        resourceType: "professionalMovers",
        capacity: {},
      },
    });

    expect(validation.hardBlocks).toContain("hazardousMoverRestricted");
  });

  it("warns when item count or dimensions exceed the target", () => {
    const validation = validateAssignment({
      box: {
        ...baseBox,
        itemCount: 8,
        dimensionsIn: { lengthIn: 72, widthIn: 20, heightIn: 20 },
      },
      target: {
        resourceType: "personalVehicle",
        capacity: {
          maxItemCount: 5,
          dimensions: { lengthIn: 60, widthIn: 30, heightIn: 30 },
        },
      },
    });

    expect(validation.softWarnings).toContain("resourceOverItemCount");
    expect(validation.softWarnings).toContain("boxExceedsResourceDimensions");
  });

  it("treats sensitive mover assignment as soft review work", () => {
    const validation = validateAssignment({
      box: { ...baseBox, hasHighValue: true },
      target: {
        resourceType: "militaryMovers",
        capacity: {},
      },
    });

    expect(validation.softWarnings).toContain("moverSensitiveReviewRequired");
    expect(validation.hardBlocks).toEqual([]);
  });

  it("does not require an override for a clean target", () => {
    const validation = validateAssignment({
      box: baseBox,
      target: {
        resourceType: "personalVehicle",
        capacity: { maxWeightLb: 500 },
      },
    });

    expect(validation.softWarnings).toEqual([]);
    expect(requiresOverrideReason(validation)).toBe(false);
  });
});
