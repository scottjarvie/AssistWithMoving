export type ClaimPacketMode = "submission" | "owner";

export type ClaimPacketItemInput = {
  status: string;
  condition: string;
  quantity: number;
  valueCents?: number;
  replacementValueCents?: number;
  serialNumber?: string;
  modelNumber?: string;
  highValue: boolean;
  needsReview: boolean;
  reviewFlags: string[];
  planningDefaultKeys: string[];
};

export type ClaimEvidenceInput = ClaimPacketItemInput & {
  photoCount: number;
  damagePhotoCount: number;
  conditionPhotoCount: number;
  receiptPhotoCount: number;
};

export function claimRelevanceReasons(item: ClaimPacketItemInput) {
  const reasons = [];
  const reviewText = item.reviewFlags.join(" ").toLowerCase();
  const planningKeys = new Set(item.planningDefaultKeys);

  if (item.status === "damaged") reasons.push("Damaged status");
  if (item.status === "missing") reasons.push("Missing status");
  if (item.condition === "damaged") reasons.push("Damaged condition");
  if (item.highValue) reasons.push("High value");
  if (item.needsReview) reasons.push("Needs review");
  if (planningKeys.has("highValue")) reasons.push("High-value handling");
  if (planningKeys.has("irreplaceable")) reasons.push("Irreplaceable");
  if (reviewText.includes("claim")) reasons.push("Claim review flag");
  if (reviewText.includes("damage")) reasons.push("Damage review flag");
  if (reviewText.includes("missing")) reasons.push("Missing review flag");

  return Array.from(new Set(reasons));
}

export function isClaimRelevantItem(item: ClaimPacketItemInput) {
  return claimRelevanceReasons(item).length > 0;
}

export function claimSeverity(item: ClaimPacketItemInput) {
  const reasons = claimRelevanceReasons(item);
  const value = Math.max(
    item.valueCents ?? 0,
    item.replacementValueCents ?? 0
  );

  if (
    item.status === "missing" ||
    item.status === "damaged" ||
    item.condition === "damaged" ||
    value >= 100000
  ) {
    return "high";
  }

  if (item.highValue || reasons.length >= 2 || value >= 25000) {
    return "medium";
  }

  return "watch";
}

export function claimEvidenceWarnings(item: ClaimEvidenceInput) {
  const warnings = [];

  if (item.photoCount === 0) {
    warnings.push("No photos attached");
  }
  if (
    (item.status === "damaged" || item.condition === "damaged") &&
    item.damagePhotoCount === 0
  ) {
    warnings.push("Missing damage photo");
  }
  if (item.condition === "unknown" && item.conditionPhotoCount === 0) {
    warnings.push("Condition is not documented");
  }
  if (!item.valueCents && !item.replacementValueCents) {
    warnings.push("No value or replacement value");
  }
  if (item.highValue && !item.serialNumber && !item.modelNumber) {
    warnings.push("High-value item missing serial/model");
  }
  if (
    (item.valueCents || item.replacementValueCents) &&
    item.receiptPhotoCount === 0
  ) {
    warnings.push("No receipt photo");
  }

  return warnings;
}

export function claimEvidenceScore(item: ClaimEvidenceInput) {
  const warnings = claimEvidenceWarnings(item);
  const maxScore = 100;
  const penalty = warnings.length * 18;
  const photoBonus = Math.min(item.photoCount, 3) * 5;
  const specificBonus =
    (item.damagePhotoCount > 0 ? 8 : 0) +
    (item.conditionPhotoCount > 0 ? 6 : 0) +
    (item.receiptPhotoCount > 0 ? 6 : 0);

  return Math.max(0, Math.min(maxScore, maxScore - penalty + photoBonus + specificBonus));
}

export function shouldShowClaimOwnerFields(mode: ClaimPacketMode) {
  return mode === "owner";
}

export function claimPacketDisclaimer() {
  return "This packet is a move-claim documentation aid. It organizes available inventory and evidence metadata, but does not guarantee claim approval or replace insurer, mover, legal, or policy guidance.";
}
