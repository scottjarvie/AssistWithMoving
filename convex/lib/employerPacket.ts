export type EmployerPacketMode = "submission" | "owner";

export type EmployerPacketItemInput = {
  disposition: string;
  status: string;
  quantity: number;
  estimatedWeightLb?: number;
  actualWeightLb?: number;
  estimatedVolumeCuFt?: number;
  valueCents?: number;
  highValue: boolean;
  requiresPersonalTransport: boolean;
  planningDefaultKeys: string[];
};

export type EmployerReadinessStatus = "ready" | "attention" | "missing";

export type EmployerReadinessChecklistItem = {
  key: string;
  label: string;
  status: EmployerReadinessStatus;
  detail: string;
  action: string;
};

export type EmployerReadinessInput = {
  mode: EmployerPacketMode;
  move: {
    origin?: string;
    destination?: string;
    dateStart?: string;
    dateEnd?: string;
  };
  visibility: {
    privateFieldsShown: boolean;
    valuesHidden: boolean;
    serialsHidden: boolean;
    privateNotesHidden: boolean;
  };
  summary: {
    itemCount: number;
    boxCount: number;
    resourceCount: number;
    storageBoxCount: number;
    shipmentWeightLb: number;
    shipmentVolumeCuFt: number;
  };
  counts: {
    shipmentItemCount: number;
    storageItemCount: number;
    excludedItemCount: number;
    personalTransportItemCount: number;
    needsReviewCount: number;
    unboxedShipmentItemCount: number;
    missingWeightCount: number;
    damagedOrMissingItemCount: number;
  };
};

export function employerRelocationCategory(item: EmployerPacketItemInput) {
  if (item.disposition === "storage") return "storage";
  if (
    item.disposition === "personalTransport" ||
    item.requiresPersonalTransport ||
    item.planningDefaultKeys.includes("doNotLetMoversTouch")
  ) {
    return "personalTransport";
  }
  if (item.disposition === "donate" || item.disposition === "sell" || item.disposition === "free") {
    return "excludedDisposition";
  }
  return "relocationShipment";
}

export function employerItemWeight(item: EmployerPacketItemInput) {
  return item.actualWeightLb ?? item.estimatedWeightLb ?? 0;
}

export function shouldShowEmployerPrivateFields(mode: EmployerPacketMode) {
  return mode === "owner";
}

export function employerPacketDisclaimer() {
  return "This packet is a move documentation aid for employer relocation review. It is not tax, legal, or reimbursement advice; verify requirements with the employer or relocation-benefit administrator.";
}

export function buildEmployerReadinessChecklist(
  input: EmployerReadinessInput
): EmployerReadinessChecklistItem[] {
  const hasRoute = Boolean(input.move.origin?.trim() && input.move.destination?.trim());
  const hasWindow = Boolean(input.move.dateStart?.trim() || input.move.dateEnd?.trim());
  const moveStatus: EmployerReadinessStatus = hasRoute
    ? hasWindow
      ? "ready"
      : "attention"
    : "missing";
  const shipmentStatus: EmployerReadinessStatus =
    input.counts.shipmentItemCount === 0
      ? "missing"
      : input.summary.shipmentWeightLb > 0 && input.summary.shipmentVolumeCuFt > 0
        ? "ready"
        : "attention";
  const boxResourceStatus: EmployerReadinessStatus =
    input.summary.boxCount === 0
      ? "missing"
      : input.summary.resourceCount === 0 ||
          input.counts.unboxedShipmentItemCount > 0
        ? "attention"
        : "ready";
  const storageStatus: EmployerReadinessStatus =
    input.counts.storageItemCount === 0
      ? "ready"
      : input.summary.storageBoxCount > 0
        ? "ready"
        : "attention";
  const reviewStatus: EmployerReadinessStatus =
    input.counts.needsReviewCount === 0 &&
    input.counts.damagedOrMissingItemCount === 0
      ? "ready"
      : "attention";
  const excludedStatus: EmployerReadinessStatus =
    input.counts.excludedItemCount + input.counts.personalTransportItemCount === 0
      ? "ready"
      : "attention";
  const privacyStatus: EmployerReadinessStatus =
    input.mode === "submission" &&
    input.visibility.valuesHidden &&
    input.visibility.serialsHidden &&
    input.visibility.privateNotesHidden
      ? "ready"
      : input.mode === "owner" && input.visibility.privateFieldsShown
        ? "attention"
        : "missing";

  return [
    {
      key: "move-overview",
      label: "Move overview",
      status: moveStatus,
      detail: hasRoute
        ? hasWindow
          ? "Origin, destination, and move window are recorded."
          : "Origin and destination are recorded; move window is not complete."
        : "Origin and destination are not both recorded.",
      action:
        "Add route and timing details before using this packet for employer relocation review.",
    },
    {
      key: "shipment-summary",
      label: "Relocation shipment summary",
      status: shipmentStatus,
      detail: `${input.counts.shipmentItemCount} shipment/storage items; ${formatEmployerReadinessNumber(input.summary.shipmentWeightLb)} lb and ${formatEmployerReadinessNumber(input.summary.shipmentVolumeCuFt)} cu ft summarized.`,
      action:
        "Confirm the shipment items and estimates match what the employer or relocation-benefit administrator expects.",
    },
    {
      key: "box-resource-coverage",
      label: "Box and resource coverage",
      status: boxResourceStatus,
      detail:
        input.summary.boxCount === 0
          ? "No boxes are recorded for this move."
          : `${input.counts.unboxedShipmentItemCount} shipment items are unboxed; ${input.summary.resourceCount} resources are listed.`,
      action:
        "Box shipment items and assign resources when the employer needs a shipment/load summary.",
    },
    {
      key: "storage-separation",
      label: "Storage separation",
      status: storageStatus,
      detail:
        input.counts.storageItemCount > 0
          ? `${input.counts.storageItemCount} storage items and ${input.summary.storageBoxCount} storage boxes are identified.`
          : "No storage items are marked in this packet.",
      action:
        "Keep storage records separate when relocation benefits treat storage differently from shipment.",
    },
    {
      key: "excluded-personal-items",
      label: "Excluded and personal items",
      status: excludedStatus,
      detail: `${input.counts.excludedItemCount} sell/donate/free items and ${input.counts.personalTransportItemCount} personal-transport items are excluded from the shipment list.`,
      action:
        "Review exclusions before sharing so employer-facing totals do not accidentally include non-reimbursable or personal items.",
    },
    {
      key: "review-exceptions",
      label: "Review and exception cleanup",
      status: reviewStatus,
      detail:
        input.counts.needsReviewCount || input.counts.damagedOrMissingItemCount
          ? `${input.counts.needsReviewCount} items need review; ${input.counts.damagedOrMissingItemCount} are damaged or missing.`
          : "No review, damaged, or missing item flags are present.",
      action:
        "Clear unresolved review flags or explain damaged/missing records before submitting packet data.",
    },
    {
      key: "recipient-privacy",
      label: "Employer recipient privacy",
      status: privacyStatus,
      detail:
        input.mode === "submission"
          ? "Submission mode hides values, serial numbers, private notes, and photos."
          : "Owner mode includes private fields for internal review.",
      action:
        "Use submission mode for employer-facing sharing unless the owner intentionally needs private details.",
    },
  ];
}

function formatEmployerReadinessNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}
