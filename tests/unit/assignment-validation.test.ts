import { describe, expect, it } from "vitest";

import {
  requiresOverrideReason,
  tripSpaceToCapacity,
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

  it("counts a dims-only box toward volume capacity via the dimensions fallback", () => {
    // No stored volume, but 60 x 48 x 48 in = 80 cu ft, which exceeds a 10 cu ft
    // zone -> volumePercent 800% and a soft over-volume warning.
    const validation = validateAssignment({
      box: {
        ...baseBox,
        estimatedVolumeCuFt: 0,
        dimensionsIn: { lengthIn: 60, widthIn: 48, heightIn: 48 },
      },
      target: {
        resourceType: "truck",
        capacity: { maxVolumeCuFt: 10 },
      },
    });

    expect(validation.volumePercent).toBe(800);
    expect(validation.softWarnings).toContain("resourceOverVolumeCapacity");
    // Volume over-capacity is a soft warning only, never a hard block.
    expect(validation.hardBlocks).toEqual([]);
  });

  it("uses the stored volume over dimensions and never double-counts", () => {
    // Stored 4 cu ft must win over the ~80 cu ft the dimensions would imply, so
    // volumePercent stays 40% (4/10) and no over-volume warning fires.
    const validation = validateAssignment({
      box: {
        ...baseBox,
        estimatedVolumeCuFt: 4,
        dimensionsIn: { lengthIn: 60, widthIn: 48, heightIn: 48 },
      },
      target: {
        resourceType: "truck",
        capacity: { maxVolumeCuFt: 10 },
      },
    });

    expect(validation.volumePercent).toBe(40);
    expect(validation.softWarnings).not.toContain("resourceOverVolumeCapacity");
  });

  it("leaves volumePercent undefined for a box with no stored volume or dimensions", () => {
    const validation = validateAssignment({
      box: { ...baseBox, estimatedVolumeCuFt: 0 },
      target: {
        resourceType: "truck",
        capacity: { maxVolumeCuFt: 10 },
      },
    });

    expect(validation.volumePercent).toBeUndefined();
    expect(validation.softWarnings).not.toContain("resourceOverVolumeCapacity");
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

  it("soft-warns when a trip-space area limit is exceeded by footprint", () => {
    const validation = validateAssignment({
      box: { ...baseBox, footprintSqFt: 12 },
      target: {
        resourceType: "trailer",
        capacity: tripSpaceToCapacity({ maxAreaSqFt: 8 }),
      },
    });

    expect(validation.softWarnings).toContain("spaceOverAreaCapacity");
    expect(requiresOverrideReason(validation)).toBe(true);
    expect(validation.hardBlocks).toEqual([]);
  });

  it("derives footprint from dimensions for the area warning", () => {
    const validation = validateAssignment({
      // 48in x 36in = 12 sqft floor footprint.
      box: { ...baseBox, dimensionsIn: { lengthIn: 48, widthIn: 36, heightIn: 24 } },
      target: {
        resourceType: "trailer",
        capacity: tripSpaceToCapacity({ maxAreaSqFt: 8 }),
      },
    });

    expect(validation.softWarnings).toContain("spaceOverAreaCapacity");
  });

  it("does not warn on area when footprint fits or no area limit is set", () => {
    const withinLimit = validateAssignment({
      box: { ...baseBox, footprintSqFt: 4 },
      target: {
        resourceType: "trailer",
        capacity: tripSpaceToCapacity({ maxAreaSqFt: 8 }),
      },
    });
    expect(withinLimit.softWarnings).not.toContain("spaceOverAreaCapacity");

    // No maxAreaSqFt supplied (resource/zone target): never area-warns, and
    // existing output stays unchanged.
    const noAreaLimit = validateAssignment({
      box: { ...baseBox, footprintSqFt: 999 },
      target: {
        resourceType: "trailer",
        capacity: { maxWeightLb: 500 },
      },
    });
    expect(noAreaLimit.softWarnings).toEqual([]);
  });
});
