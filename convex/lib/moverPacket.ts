export type MoverPacketMode = "movingCompany" | "loadCrew" | "owner";

export type MoverPacketItemInput = {
  name: string;
  quantity: number;
  room?: string;
  destinationRoom?: string;
  status: string;
  condition: string;
  disposition: string;
  fragility: "low" | "medium" | "high";
  highValue: boolean;
  hazardousFlag: boolean;
  requiresPersonalTransport: boolean;
  planningDefaultKeys: string[];
  needsReview: boolean;
  reviewFlags: string[];
};

export type MoverReadinessStatus = "ready" | "attention" | "missing";

export type MoverReadinessChecklistItem = {
  key: string;
  label: string;
  status: MoverReadinessStatus;
  detail: string;
  action: string;
};

export type MoverReadinessInput = {
  mode: MoverPacketMode;
  visibility: {
    contentsShown: boolean;
    privateFieldsShown: boolean;
    valuesHidden: boolean;
    serialsHidden: boolean;
    privateNotesHidden: boolean;
  };
  summary: {
    boxCount: number;
    itemCount: number;
    attentionCount: number;
    blockerCount: number;
    unassignedCount: number;
  };
  counts: {
    boxesWithoutDestinationCount: number;
    boxesWithHandlingFlagsCount: number;
    boxesWithWarningsCount: number;
    boxesNotHandoffReadyCount: number;
  };
};

export function moverFlagsForItem(item: MoverPacketItemInput) {
  const flags = new Set<string>();
  if (item.fragility === "high") flags.add("fragile");
  if (item.highValue || item.planningDefaultKeys.includes("highValue")) {
    flags.add("high value");
  }
  if (
    item.requiresPersonalTransport ||
    item.disposition === "personalTransport" ||
    item.planningDefaultKeys.includes("doNotLetMoversTouch")
  ) {
    flags.add("do not move");
  }
  if (item.planningDefaultKeys.includes("firstNight")) flags.add("first night");
  if (item.hazardousFlag || item.planningDefaultKeys.includes("restrictedReview")) {
    flags.add("restricted review");
  }
  if (item.status === "damaged" || item.condition === "damaged") {
    flags.add("damage noted");
  }
  if (item.status === "missing") flags.add("missing");
  if (item.needsReview || item.reviewFlags.length) flags.add("needs review");
  return Array.from(flags);
}

export function moverBoxExceptionLevel({
  flags,
  warnings,
  assignedResource,
}: {
  flags: string[];
  warnings: string[];
  assignedResource?: string;
}) {
  if (warnings.length || flags.includes("do not move") || flags.includes("missing")) {
    return "blocker";
  }
  if (!assignedResource || flags.length) {
    return "attention";
  }
  return "clear";
}

export function shouldShowMoverContents(mode: MoverPacketMode) {
  return mode !== "loadCrew";
}

export function shouldShowMoverPrivateFields(mode: MoverPacketMode) {
  return mode === "owner";
}

export function buildMoverReadinessChecklist(
  input: MoverReadinessInput
): MoverReadinessChecklistItem[] {
  const boxStatus: MoverReadinessStatus =
    input.summary.boxCount > 0 ? "ready" : "missing";
  const assignmentStatus: MoverReadinessStatus =
    input.summary.boxCount === 0
      ? "missing"
      : input.summary.unassignedCount === 0
        ? "ready"
        : "attention";
  const exceptionStatus: MoverReadinessStatus =
    input.summary.blockerCount > 0
      ? "missing"
      : input.summary.attentionCount > 0
        ? "attention"
        : "ready";
  const destinationStatus: MoverReadinessStatus =
    input.counts.boxesWithoutDestinationCount === 0 ? "ready" : "attention";
  const handlingStatus: MoverReadinessStatus =
    input.counts.boxesWithHandlingFlagsCount === 0 &&
    input.counts.boxesWithWarningsCount === 0
      ? "ready"
      : "attention";
  const handoffStatus: MoverReadinessStatus =
    input.counts.boxesNotHandoffReadyCount === 0 ? "ready" : "attention";
  const privacyStatus: MoverReadinessStatus =
    input.mode === "owner" && input.visibility.privateFieldsShown
      ? "attention"
      : input.visibility.valuesHidden &&
          input.visibility.serialsHidden &&
          input.visibility.privateNotesHidden
        ? "ready"
        : "missing";

  return [
    {
      key: "box-list",
      label: "Box list",
      status: boxStatus,
      detail:
        input.summary.boxCount > 0
          ? `${input.summary.boxCount} boxes and ${input.summary.itemCount} boxed items are included.`
          : "No boxes are available for this packet.",
      action:
        "Create and label boxes before giving this packet to movers, packers, helpers, or a load crew.",
    },
    {
      key: "load-assignment",
      label: "Load assignment",
      status: assignmentStatus,
      detail: `${input.summary.unassignedCount} boxes are not assigned to a transport resource.`,
      action:
        "Assign boxes to trucks, trailers, movers, storage, or other resources before handoff.",
    },
    {
      key: "exception-review",
      label: "Exception review",
      status: exceptionStatus,
      detail: `${input.summary.blockerCount} blockers and ${input.summary.attentionCount} attention boxes are in this packet.`,
      action:
        "Resolve do-not-move, missing, assignment warning, and handling exceptions before relying on the packet.",
    },
    {
      key: "destination-coverage",
      label: "Destination coverage",
      status: destinationStatus,
      detail: `${input.counts.boxesWithoutDestinationCount} boxes have no destination room.`,
      action:
        "Set destination rooms so movers and helpers know where boxes should land.",
    },
    {
      key: "handling-flags",
      label: "Handling flags",
      status: handlingStatus,
      detail: `${input.counts.boxesWithHandlingFlagsCount} boxes have handling flags; ${input.counts.boxesWithWarningsCount} have assignment warnings.`,
      action:
        "Review fragile, first-night, high-value, restricted, damage, and warning labels with the crew.",
    },
    {
      key: "handoff-status",
      label: "Handoff status",
      status: handoffStatus,
      detail: `${input.counts.boxesNotHandoffReadyCount} boxes are not sealed, staged, loaded, delivered, missing, or damaged.`,
      action:
        "Update packing/loading status before using this as the active load-day handoff packet.",
    },
    {
      key: "recipient-privacy",
      label: "Mover recipient privacy",
      status: privacyStatus,
      detail:
        input.mode === "owner"
          ? "Owner mode can include private fields for internal review."
          : input.mode === "loadCrew"
            ? "Load crew mode hides contents and private fields."
            : "Moving company mode hides private values, serial numbers, and notes while showing allowed contents.",
      action:
        "Use moving-company or load-crew mode for recipient-safe handoff; reserve owner mode for private review.",
    },
  ];
}
