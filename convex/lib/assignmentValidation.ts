import { roundEstimate } from "./estimateEngine";

export type Capacity = {
  maxWeightLb?: number;
  maxVolumeCuFt?: number;
  maxItemCount?: number;
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
