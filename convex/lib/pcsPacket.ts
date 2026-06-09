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

export type PcsReadinessStatus = "ready" | "attention" | "missing";

export type PcsReadinessChecklistItem = {
  key: string;
  label: string;
  status: PcsReadinessStatus;
  detail: string;
  action: string;
};

export type PcsReadinessInput = {
  move: {
    pcsBranch?: string;
    pcsShipmentType?: string;
    pcsRankPayGrade?: string;
    pcsDependentStatus?: string;
    pcsOrdersNumber?: string;
    moveLevelWeightAllowanceLb?: number;
    pcsAllowanceNotes?: string;
    pcsTransportationOfficeNotes?: string;
    pcsRestrictedItemsNotes?: string;
    proGearNotes?: string;
  };
  summary: {
    itemCount: number;
    boxCount: number;
    totalEstimatedWeightLb: number;
    allowanceRemainingLb?: number;
    hhgCount: number;
    ppmCount: number;
    proGearCount: number;
    highValueCount: number;
    sensitiveCount: number;
    pcsEvidencePhotoCount: number;
  };
  counts: {
    needsReviewCount: number;
    restrictedCount: number;
    unboxedCount: number;
    highValueWithoutEvidenceCount: number;
    sensitiveWithoutEvidenceCount: number;
    boxesWithoutAssignmentCount: number;
  };
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

export function buildPcsReadinessChecklist(
  input: PcsReadinessInput
): PcsReadinessChecklistItem[] {
  const requiredPcsFields = [
    input.move.pcsBranch,
    input.move.pcsShipmentType,
    input.move.pcsRankPayGrade,
    input.move.pcsDependentStatus,
  ].filter(Boolean).length;
  const fieldStatus: PcsReadinessStatus =
    requiredPcsFields >= 4
      ? "ready"
      : requiredPcsFields >= 2
        ? "attention"
        : "missing";
  const allowanceStatus: PcsReadinessStatus =
    typeof input.move.moveLevelWeightAllowanceLb !== "number"
      ? "missing"
      : typeof input.summary.allowanceRemainingLb === "number" &&
          input.summary.allowanceRemainingLb < 0
        ? "attention"
        : "ready";
  const shipmentStatus: PcsReadinessStatus =
    input.summary.itemCount === 0
      ? "missing"
      : input.summary.hhgCount > 0 && input.summary.ppmCount > 0
        ? "ready"
        : "attention";
  const evidenceGapCount =
    input.counts.highValueWithoutEvidenceCount +
    input.counts.sensitiveWithoutEvidenceCount;
  const evidenceStatus: PcsReadinessStatus =
    input.summary.highValueCount + input.summary.sensitiveCount === 0
      ? "ready"
      : evidenceGapCount === 0 && input.summary.pcsEvidencePhotoCount > 0
        ? "ready"
        : "attention";
  const reviewStatus: PcsReadinessStatus =
    input.counts.needsReviewCount === 0 ? "ready" : "attention";
  const restrictedStatus: PcsReadinessStatus =
    input.counts.restrictedCount === 0
      ? "ready"
      : input.move.pcsRestrictedItemsNotes?.trim()
        ? "attention"
        : "missing";
  const proGearStatus: PcsReadinessStatus =
    input.summary.proGearCount === 0
      ? "ready"
      : input.move.proGearNotes?.trim()
        ? "attention"
        : "missing";
  const boxStatus: PcsReadinessStatus =
    input.summary.boxCount === 0
      ? "attention"
      : input.counts.boxesWithoutAssignmentCount === 0
        ? "ready"
        : "attention";
  const officeNotesStatus: PcsReadinessStatus =
    input.move.pcsTransportationOfficeNotes?.trim() ||
    input.move.pcsAllowanceNotes?.trim()
      ? "ready"
      : "attention";

  return [
    {
      key: "pcs-fields",
      label: "PCS field check",
      status: fieldStatus,
      detail: `${requiredPcsFields} of 4 core PCS fields are set.`,
      action:
        "Confirm branch, shipment type, rank/pay grade, and dependent status against current orders.",
    },
    {
      key: "orders-reference",
      label: "Orders/reference",
      status: input.move.pcsOrdersNumber?.trim() ? "ready" : "attention",
      detail: input.move.pcsOrdersNumber?.trim()
        ? "Orders or reference number is recorded in the owner packet."
        : "Orders/reference number is not recorded.",
      action:
        "Add the reference if it is useful for your transportation office packet; keep sensitive numbers out of recipient-safe exports unless needed.",
    },
    {
      key: "weight-allowance",
      label: "Weight allowance",
      status: allowanceStatus,
      detail:
        typeof input.move.moveLevelWeightAllowanceLb === "number"
          ? `${formatPcsChecklistNumber(input.summary.totalEstimatedWeightLb)} lb estimated; ${formatPcsChecklistNumber(input.move.moveLevelWeightAllowanceLb)} lb allowance.`
          : "No move-level weight allowance is set.",
      action:
        "Verify official weight allowance with the transportation office or current official guidance.",
    },
    {
      key: "shipment-split",
      label: "HHG / PPM split",
      status: shipmentStatus,
      detail: `${input.summary.hhgCount} HHG items and ${input.summary.ppmCount} PPM/personal items are classified.`,
      action:
        "Review personal transport, PPM, HHG, and mover-handled items before final submission or packing.",
    },
    {
      key: "evidence-coverage",
      label: "Evidence coverage",
      status: evidenceStatus,
      detail:
        evidenceGapCount > 0
          ? `${evidenceGapCount} high-value or sensitive items have no attached photo evidence.`
          : `${input.summary.pcsEvidencePhotoCount} PCS-tagged evidence photos are attached.`,
      action:
        "Attach reviewed evidence photos for high-value, sensitive, damaged, missing, or PCS-relevant items.",
    },
    {
      key: "inventory-review",
      label: "Inventory review",
      status: reviewStatus,
      detail:
        input.counts.needsReviewCount > 0
          ? `${input.counts.needsReviewCount} items still need review.`
          : "No items are currently marked as needing review.",
      action:
        "Clear draft, duplicate, restricted, and evidence-needed review flags before relying on the packet.",
    },
    {
      key: "restricted-items",
      label: "Restricted items",
      status: restrictedStatus,
      detail:
        input.counts.restrictedCount > 0
          ? `${input.counts.restrictedCount} hazardous or restricted-review items are present.`
          : "No hazardous or restricted-review items are flagged.",
      action:
        "Verify restricted items, chemicals, batteries, fuel, and similar categories with current mover/PCS rules.",
    },
    {
      key: "pro-gear",
      label: "Pro gear",
      status: proGearStatus,
      detail:
        input.summary.proGearCount > 0
          ? `${input.summary.proGearCount} possible pro gear items are listed.`
          : "No pro gear items were detected from item text.",
      action:
        "If pro gear matters for this move, confirm documentation and weight treatment with official guidance.",
    },
    {
      key: "box-load-readiness",
      label: "Box/load readiness",
      status: boxStatus,
      detail:
        input.summary.boxCount === 0
          ? "No boxes are recorded yet."
          : `${input.counts.boxesWithoutAssignmentCount} boxes are not assigned to a transport resource.`,
      action:
        "Assign boxes to HHG, PPM, personal vehicle, storage, or other resources before final load planning.",
    },
    {
      key: "office-notes",
      label: "Transportation office notes",
      status: officeNotesStatus,
      detail:
        officeNotesStatus === "ready"
          ? "Transportation office or allowance notes are recorded."
          : "No transportation office or allowance notes are recorded.",
      action:
        "Use notes for local office instructions, counseling outcomes, and user-verified requirements.",
    },
  ];
}

function formatPcsChecklistNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}
