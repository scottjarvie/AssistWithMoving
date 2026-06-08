export type PcsPacketMode = "submission" | "owner";

export type PcsClassifiableItem = {
  name: string;
  description?: string;
  category?: string;
  subcategory?: string;
  disposition: string;
  status: string;
  condition: string;
  quantity: number;
  valueCents?: number;
  highValue: boolean;
  hazardousFlag: boolean;
  requiresPersonalTransport: boolean;
  needsReview: boolean;
  planningDefaultKeys: string[];
  reviewFlags: string[];
  aiTags: string[];
  privateNotes?: string;
};

export type PcsItemClassification = {
  hhg: boolean;
  ppm: boolean;
  proGear: boolean;
  highValue: boolean;
  claimsEvidence: boolean;
  sensitive: boolean;
  exception: boolean;
};

const highValueThresholdCents = 1_000_00;

export function classifyPcsItem(item: PcsClassifiableItem): PcsItemClassification {
  const text = [
    item.name,
    item.description,
    item.category,
    item.subcategory,
    item.privateNotes,
    ...item.aiTags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const personalKeys = new Set([
    "doNotLetMoversTouch",
    "documents",
    "medication",
    "sensitive",
    "firstNight",
  ]);
  const ppm =
    item.disposition === "personalTransport" ||
    item.requiresPersonalTransport ||
    item.planningDefaultKeys.some((key) => personalKeys.has(key));
  const claimsEvidence =
    item.status === "damaged" ||
    item.status === "missing" ||
    item.condition === "damaged" ||
    item.reviewFlags.length > 0;
  const highValue =
    item.highValue ||
    item.planningDefaultKeys.includes("highValue") ||
    (item.valueCents ?? 0) >= highValueThresholdCents;
  const sensitive =
    item.planningDefaultKeys.includes("sensitive") ||
    item.planningDefaultKeys.includes("documents") ||
    item.planningDefaultKeys.includes("medication") ||
    item.hazardousFlag;
  const proGear =
    /\b(pro gear|progear|professional gear|military gear|uniform|field gear)\b/.test(
      text
    );

  return {
    hhg: !ppm && ["take", "mover", "undecided"].includes(item.disposition),
    ppm,
    proGear,
    highValue,
    claimsEvidence,
    sensitive,
    exception:
      ppm ||
      proGear ||
      highValue ||
      claimsEvidence ||
      sensitive ||
      item.hazardousFlag ||
      item.needsReview === true,
  };
}

export function summarizePcsClassifications(
  classifications: PcsItemClassification[]
) {
  return {
    hhgCount: classifications.filter((entry) => entry.hhg).length,
    ppmCount: classifications.filter((entry) => entry.ppm).length,
    proGearCount: classifications.filter((entry) => entry.proGear).length,
    highValueCount: classifications.filter((entry) => entry.highValue).length,
    claimsEvidenceCount: classifications.filter((entry) => entry.claimsEvidence)
      .length,
    sensitiveCount: classifications.filter((entry) => entry.sensitive).length,
    exceptionCount: classifications.filter((entry) => entry.exception).length,
  };
}
