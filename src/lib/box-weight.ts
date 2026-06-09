type BoxWeightSummaryLike = {
  valueLb?: number;
  label?: string;
  source?: string;
};

export function formatBoxWeightValue(summary: BoxWeightSummaryLike | undefined) {
  return typeof summary?.valueLb === "number" && Number.isFinite(summary.valueLb)
    ? `${summary.valueLb.toLocaleString(undefined, { maximumFractionDigits: 1 })} lb`
    : "Missing weight";
}

export function formatBoxWeightSource(summary: BoxWeightSummaryLike | undefined) {
  return summary?.label ?? "missing";
}

export function formatBoxWeightWithSource(
  summary: BoxWeightSummaryLike | undefined
) {
  return `${formatBoxWeightValue(summary)} · ${formatBoxWeightSource(summary)}`;
}

export function isMissingBoxWeight(summary: BoxWeightSummaryLike | undefined) {
  return summary?.source === "missing" || summary?.valueLb === undefined;
}
