export type PackingDebtItem = {
  itemId: string;
  disposition: string;
  status: string;
  highValue: boolean;
  needsReview: boolean;
  requiresPersonalTransport: boolean;
  planningDefaultKeys: string[];
  deletedAt?: number;
};

export type PackingDebtBox = {
  boxId: string;
  destinationRoom?: string;
  status: string;
  assignedResourceId?: string;
  assignmentWarnings?: string[];
  assignmentHardBlocks?: string[];
  archivedAt?: number;
};

export type PackingDebtMembership = {
  boxId: string;
  itemId: string;
};

export type PackingDebtPhoto = {
  itemId?: string;
  boxId?: string;
  photoType: string;
  verificationStatus: string;
  archivedAt?: number;
};

export type PackingDebtAiCounts = {
  textSuggestions: number;
  photoSuggestions: number;
  planningSuggestions: number;
};

export type PackingDebtSummaryInput = {
  items: PackingDebtItem[];
  boxes: PackingDebtBox[];
  memberships: PackingDebtMembership[];
  photos: PackingDebtPhoto[];
  pendingAiSuggestions: PackingDebtAiCounts;
};

export type PackingDebtMetricKey =
  | "needsReview"
  | "undecidedDisposition"
  | "unboxedItems"
  | "highValueWithoutPhotos"
  | "boxesMissingDestination"
  | "boxesUnassigned"
  | "boxesNotLoaded"
  | "boxWarnings"
  | "photosNeedingReview"
  | "pendingAiSuggestions";

export type PackingDebtMetric = {
  key: PackingDebtMetricKey;
  label: string;
  count: number;
  severity: "ok" | "info" | "warning" | "critical";
  anchor: string;
  help: string;
};

const loadRelevantDispositions = new Set([
  "undecided",
  "take",
  "mover",
  "personalTransport",
  "storage",
]);

const evidenceImportantKeys = new Set([
  "doNotLetMoversTouch",
  "highValue",
  "documents",
  "medication",
  "sensitive",
  "irreplaceable",
]);

export function summarizePackingDebt(input: PackingDebtSummaryInput) {
  const activeBoxes = input.boxes.filter((box) => !box.archivedAt);
  const activeBoxIds = new Set(activeBoxes.map((box) => box.boxId));
  const activeItems = input.items.filter(
    (item) => !item.deletedAt && item.status !== "archived"
  );
  const activeItemIds = new Set(activeItems.map((item) => item.itemId));
  const activeMemberships = input.memberships.filter(
    (membership) =>
      activeItemIds.has(membership.itemId) && activeBoxIds.has(membership.boxId)
  );
  const boxedItemIds = new Set(
    activeMemberships.map((membership) => membership.itemId)
  );
  const activePhotos = input.photos.filter((photo) => !photo.archivedAt);
  const itemPhotoIds = new Set(
    activePhotos
      .map((photo) => photo.itemId)
      .filter((itemId): itemId is string => Boolean(itemId))
  );

  const pendingAiSuggestions =
    input.pendingAiSuggestions.textSuggestions +
    input.pendingAiSuggestions.photoSuggestions +
    input.pendingAiSuggestions.planningSuggestions;

  const metrics: PackingDebtMetric[] = [
    {
      key: "needsReview",
      label: "Items needing review",
      count: activeItems.filter((item) => item.needsReview).length,
      severity: "critical",
      anchor: "#inventory",
      help: "Review AI-assisted, low-confidence, or manually flagged item records.",
    },
    {
      key: "undecidedDisposition",
      label: "Undecided disposition",
      count: activeItems.filter((item) => item.disposition === "undecided")
        .length,
      severity: "warning",
      anchor: "#inventory",
      help: "Choose whether each item is kept, moved, stored, sold, donated, dumped, or free.",
    },
    {
      key: "unboxedItems",
      label: "Loose load items",
      count: activeItems.filter(
        (item) =>
          loadRelevantDispositions.has(item.disposition) &&
          !boxedItemIds.has(item.itemId)
      ).length,
      severity: "info",
      anchor: "#load-plan",
      help: "Put loose move-relevant items into boxes or handle them as explicit loose cargo.",
    },
    {
      key: "highValueWithoutPhotos",
      label: "High-value without photos",
      count: activeItems.filter(
        (item) => isEvidenceImportant(item) && !itemPhotoIds.has(item.itemId)
      ).length,
      severity: "critical",
      anchor: "#add-photos",
      help: "Add photo evidence for valuable, sensitive, document, medication, or owner-carry items.",
    },
    {
      key: "boxesMissingDestination",
      label: "Boxes missing destination",
      count: activeBoxes.filter((box) => !box.destinationRoom?.trim()).length,
      severity: "warning",
      anchor: "#boxes",
      help: "Destination rooms make unloading, labels, and packet exports more useful.",
    },
    {
      key: "boxesUnassigned",
      label: "Boxes not assigned",
      count: activeBoxes.filter((box) => !box.assignedResourceId).length,
      severity: "warning",
      anchor: "#load-plan",
      help: "Assign boxes to a truck, trailer, mover shipment, storage, sell, donate, dump, or free bucket.",
    },
    {
      key: "boxesNotLoaded",
      label: "Boxes not loaded/delivered",
      count: activeBoxes.filter(
        (box) => box.status !== "loaded" && box.status !== "delivered"
      ).length,
      severity: "info",
      anchor: "#move-day",
      help: "Move Day status stays unfinished until boxes are loaded or delivered.",
    },
    {
      key: "boxWarnings",
      label: "Box assignment warnings",
      count: activeBoxes.filter(
        (box) =>
          (box.assignmentWarnings?.length ?? 0) > 0 ||
          (box.assignmentHardBlocks?.length ?? 0) > 0
      ).length,
      severity: "critical",
      anchor: "#load-plan",
      help: "Resolve capacity, restriction, or hard-block warnings before treating a load plan as final.",
    },
    {
      key: "photosNeedingReview",
      label: "Photos needing review",
      count: activePhotos.filter(
        (photo) =>
          photo.verificationStatus === "unreviewed" ||
          photo.verificationStatus === "needsReview"
      ).length,
      severity: "info",
      anchor: "#photos",
      help: "Review photo evidence so packets and AI suggestions use trusted records.",
    },
    {
      key: "pendingAiSuggestions",
      label: "Pending AI suggestions",
      count: pendingAiSuggestions,
      severity: "warning",
      anchor: "#ai-review-queue",
      help: "Approve, edit, or reject pending text, photo, and planning suggestions.",
    },
  ];

  const openMetrics = metrics.filter((metric) => metric.count > 0);

  return {
    metrics,
    topActions: openMetrics
      .sort((left, right) => {
        const severityDelta =
          severityRank(right.severity) - severityRank(left.severity);
        return severityDelta || right.count - left.count;
      })
      .slice(0, 5),
    counts: {
      activeItems: activeItems.length,
      activeBoxes: activeBoxes.length,
      activePhotos: activePhotos.length,
      activeMemberships: activeMemberships.length,
      pendingAiSuggestions,
      openMetricCount: openMetrics.length,
      totalOpenSignals: openMetrics.reduce(
        (sum, metric) => sum + metric.count,
        0
      ),
    },
  };
}

function isEvidenceImportant(item: PackingDebtItem) {
  return (
    item.highValue ||
    item.requiresPersonalTransport ||
    item.planningDefaultKeys.some((key) => evidenceImportantKeys.has(key))
  );
}

function severityRank(severity: PackingDebtMetric["severity"]) {
  switch (severity) {
    case "critical":
      return 3;
    case "warning":
      return 2;
    case "info":
      return 1;
    case "ok":
      return 0;
  }
}
