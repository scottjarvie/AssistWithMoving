export type EstimateConfidence =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "manual"
  | "actual";

export type ItemDimensions = {
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
};

export function hasItemDimensions(dimensions: ItemDimensions | undefined) {
  return (
    positiveDimension(dimensions?.lengthIn) ||
    positiveDimension(dimensions?.widthIn) ||
    positiveDimension(dimensions?.heightIn)
  );
}

export function itemDimensionsConfidenceForRead({
  dimensionsIn,
  dimensionsConfidence,
}: {
  dimensionsIn?: ItemDimensions;
  dimensionsConfidence?: EstimateConfidence;
}): EstimateConfidence | undefined {
  if (dimensionsConfidence) {
    return dimensionsConfidence;
  }
  // Legacy rows can have dimensions without dimensionsConfidence. Treat those
  // as estimated so Layout Studio and API readers do not render them as unknown.
  if (hasItemDimensions(dimensionsIn)) {
    return "medium";
  }
  return undefined;
}

function positiveDimension(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
