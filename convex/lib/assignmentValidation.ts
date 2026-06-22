import { roundEstimate } from "./estimateEngine";

export type Capacity = {
  maxWeightLb?: number;
  maxVolumeCuFt?: number;
  maxItemCount?: number;
  // Optional floor-area limit for a trip-space (square feet). Only trip-spaces
  // supply this; resources/zones leave it undefined so existing validation is
  // unchanged for every caller that does not involve a trip-space.
  maxAreaSqFt?: number;
  dimensions?: {
    lengthIn?: number;
    widthIn?: number;
    heightIn?: number;
  };
  weightIsUnlimited?: boolean;
  volumeIsUnlimited?: boolean;
};

export type LoadableBox = {
  estimatedWeightLb: number;
  estimatedVolumeCuFt: number;
  // Optional floor footprint (square feet) used only for the trip-space area
  // soft warning. When omitted it is derived from dimensionsIn (L x W).
  footprintSqFt?: number;
  dimensionsIn?: {
    lengthIn?: number;
    widthIn?: number;
    heightIn?: number;
  };
  itemCount: number;
  hasFragile: boolean;
  hasHighValue: boolean;
  hasSensitive: boolean;
  hasPersonalTransport: boolean;
  hasHazardous: boolean;
};

export type AssignmentTarget = {
  resourceType?: string;
  capacity?: Capacity;
};

export type AssignmentValidation = {
  hardBlocks: string[];
  softWarnings: string[];
  weightPercent?: number;
  volumePercent?: number;
};

export function validateAssignment({
  box,
  target,
}: {
  box: LoadableBox;
  target?: AssignmentTarget;
}): AssignmentValidation {
  const hardBlocks: string[] = [];
  const softWarnings: string[] = [];
  const resourceType = target?.resourceType;
  const capacity = target?.capacity ?? {};

  if (!target) {
    return { hardBlocks, softWarnings: ["unassigned"] };
  }

  const weightPercent =
    capacity.maxWeightLb && !capacity.weightIsUnlimited
      ? roundEstimate((box.estimatedWeightLb / capacity.maxWeightLb) * 100)
      : undefined;
  const volumePercent =
    capacity.maxVolumeCuFt && !capacity.volumeIsUnlimited
      ? roundEstimate((box.estimatedVolumeCuFt / capacity.maxVolumeCuFt) * 100)
      : undefined;

  if (typeof weightPercent === "number" && weightPercent > 100) {
    softWarnings.push("resourceOverWeightCapacity");
  }
  if (typeof volumePercent === "number" && volumePercent > 100) {
    softWarnings.push("resourceOverVolumeCapacity");
  }
  if (capacity.maxItemCount && box.itemCount > capacity.maxItemCount) {
    softWarnings.push("resourceOverItemCount");
  }
  // Trip-space area limit: soft warning only, and only when a trip-space supplies
  // maxAreaSqFt. Routed through requiresOverrideReason() like the other soft
  // warnings. No-op for resource/zone targets (which never set maxAreaSqFt).
  if (capacity.maxAreaSqFt && capacity.maxAreaSqFt > 0) {
    const footprintSqFt = resolveFootprintSqFt(box);
    if (
      typeof footprintSqFt === "number" &&
      footprintSqFt > capacity.maxAreaSqFt
    ) {
      softWarnings.push("spaceOverAreaCapacity");
    }
  }
  if (boxExceedsDimensions(box.dimensionsIn, capacity.dimensions)) {
    softWarnings.push("boxExceedsResourceDimensions");
  }
  if (box.estimatedWeightLb > 65) {
    softWarnings.push("heavyBox");
  }
  if (box.hasFragile) {
    softWarnings.push("fragileContents");
  }
  if (box.hasHighValue || box.hasSensitive || box.hasPersonalTransport) {
    softWarnings.push("personalOrSensitiveContents");
  }
  if (
    box.hasHazardous &&
    (resourceType === "professionalMovers" || resourceType === "militaryMovers")
  ) {
    hardBlocks.push("hazardousMoverRestricted");
  }
  if (
    (box.hasHighValue || box.hasSensitive || box.hasPersonalTransport) &&
    (resourceType === "professionalMovers" || resourceType === "militaryMovers")
  ) {
    softWarnings.push("moverSensitiveReviewRequired");
  }

  return { hardBlocks, softWarnings, weightPercent, volumePercent };
}

export function requiresOverrideReason(validation: AssignmentValidation) {
  return validation.softWarnings.some((warning) => warning !== "unassigned");
}

// Map a trip-space record to the Capacity shape understood by validateAssignment.
// Only weight + area apply at the trip-space level; volume/item/dimension limits
// continue to come from the parent resource/zone.
export function tripSpaceToCapacity(space: {
  maxWeightLb?: number;
  maxAreaSqFt?: number;
}): Capacity {
  return {
    maxWeightLb: space.maxWeightLb,
    maxAreaSqFt: space.maxAreaSqFt,
  };
}

// Resolve a box/item floor footprint in square feet: prefer an explicit value,
// otherwise derive from the two largest dimensions (length x width / 144).
function resolveFootprintSqFt(box: LoadableBox): number | undefined {
  if (typeof box.footprintSqFt === "number" && box.footprintSqFt > 0) {
    return box.footprintSqFt;
  }
  const values = dimensionValues(box.dimensionsIn);
  if (values.length < 2) {
    return undefined;
  }
  const sorted = [...values].sort((a, b) => b - a);
  const [longest, second] = sorted;
  return (longest * second) / 144;
}

function boxExceedsDimensions(
  boxDimensions?: LoadableBox["dimensionsIn"],
  capacityDimensions?: Capacity["dimensions"]
) {
  const boxValues = dimensionValues(boxDimensions);
  const capacityValues = dimensionValues(capacityDimensions);
  if (boxValues.length !== 3 || capacityValues.length !== 3) {
    return false;
  }

  const sortedBox = [...boxValues].sort((a, b) => a - b);
  const sortedCapacity = [...capacityValues].sort((a, b) => a - b);
  return sortedBox.some((value, index) => value > sortedCapacity[index]);
}

function dimensionValues(
  dimensions?: {
    lengthIn?: number;
    widthIn?: number;
    heightIn?: number;
  }
) {
  return [
    dimensions?.lengthIn,
    dimensions?.widthIn,
    dimensions?.heightIn,
  ].filter((value): value is number => typeof value === "number" && value > 0);
}
