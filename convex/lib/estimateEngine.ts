export type EstimateConfidence =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "manual"
  | "actual";

export type EstimateSource =
  | "actual"
  | "manual"
  | "dimensions"
  | "category"
  | "name"
  | "contents"
  | "unknown";

export type DimensionsIn = {
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
};

export type EstimableItem = {
  name: string;
  category?: string;
  quantity?: number;
  dimensionsIn?: DimensionsIn;
  estimatedWeightLb?: number;
  estimatedWeightLowLb?: number;
  estimatedWeightHighLb?: number;
  actualWeightLb?: number;
  estimatedVolumeCuFt?: number;
  estimatedPackedVolumeCuFt?: number;
  weightConfidence?: EstimateConfidence;
  volumeConfidence?: EstimateConfidence;
};

export type EstimateValue = {
  value: number;
  low?: number;
  high?: number;
  confidence: EstimateConfidence;
  source: EstimateSource;
};

export type ItemEstimate = {
  weight?: EstimateValue;
  volume?: EstimateValue;
  warnings: string[];
};

type BaselineEstimate = {
  aliases: string[];
  weightLb: number;
  volumeCuFt: number;
  confidence: EstimateConfidence;
};

const categoryBaselines: Record<string, BaselineEstimate> = {
  furniture: {
    aliases: ["furniture", "chair", "table", "dresser", "desk"],
    weightLb: 60,
    volumeCuFt: 18,
    confidence: "low",
  },
  electronics: {
    aliases: ["electronics", "tv", "monitor", "computer", "speaker"],
    weightLb: 20,
    volumeCuFt: 4,
    confidence: "low",
  },
  books: {
    aliases: ["book", "books", "documents", "paper"],
    weightLb: 35,
    volumeCuFt: 2,
    confidence: "medium",
  },
  kitchen: {
    aliases: ["kitchen", "dishes", "pan", "appliance"],
    weightLb: 25,
    volumeCuFt: 3,
    confidence: "low",
  },
  clothing: {
    aliases: ["clothing", "clothes", "wardrobe", "linen"],
    weightLb: 18,
    volumeCuFt: 5,
    confidence: "low",
  },
  tools: {
    aliases: ["tools", "tool", "garage", "hardware"],
    weightLb: 45,
    volumeCuFt: 3,
    confidence: "medium",
  },
  decor: {
    aliases: ["decor", "art", "lamp", "rug"],
    weightLb: 12,
    volumeCuFt: 4,
    confidence: "low",
  },
  box: {
    aliases: ["box", "bin", "tote"],
    weightLb: 25,
    volumeCuFt: 3,
    confidence: "low",
  },
};

const nameBaselines: Array<{
  pattern: RegExp;
  weightLb: number;
  volumeCuFt: number;
  confidence: EstimateConfidence;
}> = [
  { pattern: /\b(sofa|couch|sectional)\b/i, weightLb: 160, volumeCuFt: 65, confidence: "medium" },
  { pattern: /\b(mattress|bed)\b/i, weightLb: 85, volumeCuFt: 45, confidence: "medium" },
  { pattern: /\b(fridge|refrigerator)\b/i, weightLb: 250, volumeCuFt: 55, confidence: "medium" },
  { pattern: /\b(washer|dryer)\b/i, weightLb: 150, volumeCuFt: 25, confidence: "medium" },
  { pattern: /\b(bicycle|bike)\b/i, weightLb: 28, volumeCuFt: 16, confidence: "medium" },
  { pattern: /\b(bookcase|shelf|shelves)\b/i, weightLb: 70, volumeCuFt: 22, confidence: "medium" },
  { pattern: /\b(tv|television)\b/i, weightLb: 35, volumeCuFt: 6, confidence: "medium" },
];

function positiveNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function quantityMultiplier(quantity: number | undefined) {
  return positiveNumber(quantity) ?? 1;
}

export function volumeFromDimensions(dimensions: DimensionsIn | undefined) {
  const lengthIn = positiveNumber(dimensions?.lengthIn);
  const widthIn = positiveNumber(dimensions?.widthIn);
  const heightIn = positiveNumber(dimensions?.heightIn);

  if (!lengthIn || !widthIn || !heightIn) {
    return undefined;
  }

  return (lengthIn * widthIn * heightIn) / 1728;
}

// Resolve a box/item volume in cubic feet: prefer an explicit stored value,
// otherwise derive it from dimensions (L x W x H / 1728). Returns undefined when
// neither a stored value nor usable dimensions are available. Single source of
// truth so read/display callers stop hand-rolling `estimatedVolumeCuFt ?? 0`,
// which silently zeroes out a dims-only box.
export function boxVolumeCuFt(box: {
  estimatedVolumeCuFt?: number | null;
  dimensionsIn?: DimensionsIn;
}): number | undefined {
  const stored = positiveNumber(box.estimatedVolumeCuFt ?? undefined);
  if (stored) {
    return stored;
  }
  return volumeFromDimensions(box.dimensionsIn);
}

// The volume to STORE when writing an item/box. An explicit value always wins;
// otherwise derive it from dimensions (L x W x H / 1728) so a dims-only write
// (the common case from MCP/REST tools) persists a real estimatedVolumeCuFt
// instead of leaving it null. Returns undefined when neither is usable, which
// leaves the field unset — read-side rollups stay null-safe via boxVolumeCuFt.
export function resolveStoredVolumeCuFt(input: {
  estimatedVolumeCuFt?: number | null;
  dimensionsIn?: DimensionsIn;
}): number | undefined {
  const explicit = positiveNumber(input.estimatedVolumeCuFt ?? undefined);
  if (explicit) {
    return explicit;
  }
  return volumeFromDimensions(input.dimensionsIn);
}

// The new estimatedVolumeCuFt for an UPDATE patch, given which fields the caller
// supplied. An explicit volume wins; otherwise, if dimensions are being changed,
// recompute volume from the new dimensions ("set dims -> volume computed right
// then"). Returns `{ set: false }` to leave the stored volume untouched (neither
// volume nor dimensions changed).
export function volumeCuFtForUpdate(input: {
  volumeProvided: boolean;
  estimatedVolumeCuFt?: number | null;
  dimensionsProvided: boolean;
  dimensionsIn?: DimensionsIn;
}): { set: true; value: number | undefined } | { set: false } {
  if (input.volumeProvided) {
    return { set: true, value: input.estimatedVolumeCuFt ?? undefined };
  }
  if (input.dimensionsProvided) {
    return { set: true, value: volumeFromDimensions(input.dimensionsIn) };
  }
  return { set: false };
}

function baselineForItem(item: Pick<EstimableItem, "name" | "category">) {
  const category = item.category?.toLowerCase().trim();
  if (category) {
    const direct = categoryBaselines[category];
    if (direct) {
      return { ...direct, source: "category" as const };
    }
    const aliasMatch = Object.values(categoryBaselines).find((baseline) =>
      baseline.aliases.some((alias) => category.includes(alias))
    );
    if (aliasMatch) {
      return { ...aliasMatch, source: "category" as const };
    }
  }

  const nameMatch = nameBaselines.find((baseline) =>
    baseline.pattern.test(item.name)
  );
  if (nameMatch) {
    return { ...nameMatch, source: "name" as const };
  }

  return undefined;
}

export function estimateItem(item: EstimableItem): ItemEstimate {
  const warnings: string[] = [];
  const quantity = quantityMultiplier(item.quantity);
  const actualWeight = positiveNumber(item.actualWeightLb);
  const manualWeight = positiveNumber(item.estimatedWeightLb);
  const manualVolume =
    positiveNumber(item.estimatedPackedVolumeCuFt) ??
    positiveNumber(item.estimatedVolumeCuFt);
  const dimensionVolume = volumeFromDimensions(item.dimensionsIn);
  const baseline = baselineForItem(item);

  let weight: EstimateValue | undefined;
  let volume: EstimateValue | undefined;

  if (actualWeight) {
    weight = {
      value: actualWeight * quantity,
      confidence: "actual",
      source: "actual",
    };
  } else if (manualWeight) {
    weight = {
      value: manualWeight * quantity,
      low: positiveNumber(item.estimatedWeightLowLb),
      high: positiveNumber(item.estimatedWeightHighLb),
      confidence: item.weightConfidence === "actual" ? "manual" : item.weightConfidence ?? "manual",
      source: "manual",
    };
  } else if (baseline) {
    weight = {
      value: baseline.weightLb * quantity,
      confidence: baseline.confidence,
      source: baseline.source,
    };
  }

  if (manualVolume) {
    volume = {
      value: manualVolume * quantity,
      confidence: item.volumeConfidence ?? "manual",
      source: "manual",
    };
  } else if (dimensionVolume) {
    volume = {
      value: dimensionVolume * quantity,
      confidence: "high",
      source: "dimensions",
    };
  } else if (baseline) {
    volume = {
      value: baseline.volumeCuFt * quantity,
      confidence: baseline.confidence,
      source: baseline.source,
    };
  }

  if (!weight) {
    warnings.push("missingWeightEstimate");
  }
  if (!volume) {
    warnings.push("missingVolumeEstimate");
  }
  if (!dimensionVolume && !manualVolume) {
    warnings.push("missingDimensions");
  }

  return { weight, volume, warnings };
}

export function roundEstimate(value: number) {
  return Math.round(value * 10) / 10;
}

// A finite number or undefined — never NaN/Infinity (Convex rejects those when
// they're stored or returned from a query, which is how a null weight/volume
// turns a capacity recompute into a 500).
export function finiteOrUndefined(value: number | undefined | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// Capacity usage percent that can NEVER be NaN/Infinity. Returns undefined
// unless the used amount is a finite number and there is a real positive,
// non-unlimited max to divide by. Use everywhere weight/volume usage % is
// computed so a missing weight/volume (or a zero/unset capacity) can't crash.
export function finitePercent(
  used: number | undefined | null,
  max: number | undefined | null,
  unlimited?: boolean,
): number | undefined {
  if (unlimited) return undefined;
  const usedNum = finiteOrUndefined(used);
  const maxNum = finiteOrUndefined(max);
  if (usedNum === undefined || maxNum === undefined || maxNum <= 0) {
    return undefined;
  }
  return roundEstimate((usedNum / maxNum) * 100);
}

export function sumEstimateValues(values: Array<EstimateValue | undefined>) {
  return roundEstimate(
    values.reduce((sum, value) => sum + (value?.value ?? 0), 0)
  );
}
