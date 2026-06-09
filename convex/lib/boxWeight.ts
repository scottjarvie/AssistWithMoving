import { roundEstimate } from "./estimateEngine";

export type BoxWeightSource =
  | "actual"
  | "manualEstimate"
  | "contentsDerived"
  | "missing";

export type BoxWeightSummary = {
  valueLb?: number;
  source: BoxWeightSource;
  label: string;
  detail: string;
};

export function resolveBoxWeight(input: {
  actualWeightLb?: number;
  estimatedWeightLb?: number;
  contentsEstimatedWeightLb?: number;
}): BoxWeightSummary {
  const actualWeight = positiveNumber(input.actualWeightLb);
  if (actualWeight !== undefined) {
    return {
      valueLb: roundEstimate(actualWeight),
      source: "actual",
      label: "actual",
      detail: "Measured box weight.",
    };
  }

  const manualEstimate = positiveNumber(input.estimatedWeightLb);
  if (manualEstimate !== undefined) {
    return {
      valueLb: roundEstimate(manualEstimate),
      source: "manualEstimate",
      label: "manual estimate",
      detail: "Manually entered box weight.",
    };
  }

  const contentsEstimate = positiveNumber(input.contentsEstimatedWeightLb);
  if (contentsEstimate !== undefined) {
    return {
      valueLb: roundEstimate(contentsEstimate),
      source: "contentsDerived",
      label: "contents-derived",
      detail: "Calculated from the items assigned to this box.",
    };
  }

  return {
    source: "missing",
    label: "missing",
    detail: "No measured, manual, or contents-derived weight is available.",
  };
}

function positiveNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}
