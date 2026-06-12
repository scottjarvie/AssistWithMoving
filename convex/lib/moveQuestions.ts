export type MoveQuestionSeverity = "critical" | "warning" | "info";

export type MoveQuestionCategory =
  | "setup"
  | "pcs"
  | "resources"
  | "inventory"
  | "evidence"
  | "load"
  | "packets";

export type MoveQuestionMove = {
  moveId: string;
  type: string;
  title: string;
  origin?: string;
  destination?: string;
  dateStart?: string;
  dateEnd?: string;
  documentationProfileTypes?: string[];
  moveLevelWeightAllowanceLb?: number;
  pcsBranch?: string;
  pcsRankPayGrade?: string;
  pcsDependentStatus?: string;
  pcsShipmentType?: string;
  pcsOrdersNumber?: string;
  pcsAllowanceNotes?: string;
  proGearNotes?: string;
  pcsTransportationOfficeNotes?: string;
  pcsRestrictedItemsNotes?: string;
};

export type MoveQuestionItem = {
  itemId: string;
  disposition: string;
  status: string;
  highValue: boolean;
  needsReview: boolean;
  requiresPersonalTransport: boolean;
  planningDefaultKeys: string[];
  valueCents?: number;
  replacementValueCents?: number;
  serialNumber?: string;
  modelNumber?: string;
  weightConfidence?: string;
  volumeConfidence?: string;
  deletedAt?: number;
};

export type MoveQuestionBox = {
  boxId: string;
  status: string;
  destinationRoom?: string;
  assignedResourceId?: string;
  assignmentWarnings?: string[];
  assignmentHardBlocks?: string[];
  archivedAt?: number;
};

export type MoveQuestionMembership = {
  boxId: string;
  itemId: string;
};

export type MoveQuestionPhoto = {
  itemId?: string;
  boxId?: string;
  photoType: string;
  verificationStatus: string;
  archivedAt?: number;
};

export type MoveQuestionCapacity = {
  maxWeightLb?: number;
  maxVolumeCuFt?: number;
  maxItemCount?: number;
  weightIsUnlimited?: boolean;
  volumeIsUnlimited?: boolean;
};

export type MoveQuestionResource = {
  resourceId: string;
  type: string;
  name: string;
  capacity: MoveQuestionCapacity;
  capacityReviewStatus?: string;
  rules: string[];
  archivedAt?: number;
};

export type MoveQuestionZone = {
  zoneId: string;
  resourceId: string;
  name: string;
  preferredTags: string[];
  archivedAt?: number;
};

export type MoveQuestionPrompt = {
  key: string;
  category: MoveQuestionCategory;
  severity: MoveQuestionSeverity;
  title: string;
  question: string;
  detail: string;
  count: number;
  anchor: string;
  actionLabel: string;
};

export type MoveQuestionInput = {
  move: MoveQuestionMove;
  items: MoveQuestionItem[];
  boxes: MoveQuestionBox[];
  memberships: MoveQuestionMembership[];
  photos: MoveQuestionPhoto[];
  resources: MoveQuestionResource[];
  zones: MoveQuestionZone[];
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
  "electronics",
  "sensitive",
  "irreplaceable",
  "restrictedReview",
]);

const capacityRelevantResourceTypes = new Set([
  "truck",
  "trailer",
  "personalVehicle",
  "storage",
  "custom",
]);

const rulesRelevantResourceTypes = new Set([
  "truck",
  "trailer",
  "personalVehicle",
  "professionalMovers",
  "militaryMovers",
  "storage",
  "dump",
  "sell",
  "donate",
  "free",
  "freeGiveaway",
  "custom",
]);

export function summarizeMoveQuestions(input: MoveQuestionInput) {
  const activeItems = input.items.filter(
    (item) => !item.deletedAt && item.status !== "archived"
  );
  const activeItemIds = new Set(activeItems.map((item) => item.itemId));
  const activeBoxes = input.boxes.filter((box) => !box.archivedAt);
  const activeBoxIds = new Set(activeBoxes.map((box) => box.boxId));
  const activeMemberships = input.memberships.filter(
    (membership) =>
      activeItemIds.has(membership.itemId) && activeBoxIds.has(membership.boxId)
  );
  const boxedItemIds = new Set(
    activeMemberships.map((membership) => membership.itemId)
  );
  const activePhotos = input.photos.filter((photo) => !photo.archivedAt);
  const activeResources = input.resources.filter((resource) => !resource.archivedAt);
  const activeResourceIds = new Set(
    activeResources.map((resource) => resource.resourceId)
  );
  const activeZones = input.zones.filter(
    (zone) => !zone.archivedAt && activeResourceIds.has(zone.resourceId)
  );
  const itemIdsWithPhotos = new Set(
    activePhotos
      .map((photo) => photo.itemId)
      .filter((itemId): itemId is string => Boolean(itemId))
  );

  const prompts = [
    ...setupPrompts(input.move),
    ...pcsPrompts(input.move),
    ...resourcePrompts(activeResources, activeZones),
    ...inventoryPrompts(activeItems),
    ...evidencePrompts(activeItems, activePhotos, itemIdsWithPhotos),
    ...loadPrompts(activeItems, activeBoxes, boxedItemIds),
    ...packetPrompts(input.move, activeItems),
  ];
  const openPrompts = prompts
    .filter((prompt) => prompt.count > 0)
    .sort((left, right) => {
      const severityDelta =
        severityRank(right.severity) - severityRank(left.severity);
      return severityDelta || right.count - left.count;
    });

  return {
    prompts,
    topPrompts: openPrompts.slice(0, 6),
    counts: {
      totalPrompts: prompts.length,
      openPrompts: openPrompts.length,
      critical: openPrompts.filter((prompt) => prompt.severity === "critical")
        .length,
      warning: openPrompts.filter((prompt) => prompt.severity === "warning")
        .length,
      info: openPrompts.filter((prompt) => prompt.severity === "info").length,
      totalOpenItems: openPrompts.reduce((total, prompt) => total + prompt.count, 0),
    },
    categories: categoryCounts(openPrompts),
  };
}

function setupPrompts(move: MoveQuestionMove): MoveQuestionPrompt[] {
  const missingRouteFields = [
    !hasText(move.origin) ? "origin" : null,
    !hasText(move.destination) ? "destination" : null,
  ].filter(Boolean);
  const missingDateFields = [
    !hasText(move.dateStart) ? "start date" : null,
    !hasText(move.dateEnd) ? "end date" : null,
  ].filter(Boolean);

  return [
    prompt({
      key: "move-route",
      category: "setup",
      severity: "warning",
      title: "Move route",
      question: "What origin and destination should packets and labels use?",
      detail:
        missingRouteFields.length > 0
          ? `Missing ${missingRouteFields.join(" and ")}.`
          : "Origin and destination are set.",
      count: missingRouteFields.length,
      anchor: "#active-moves",
      actionLabel: "Move details",
    }),
    prompt({
      key: "move-dates",
      category: "setup",
      severity: "info",
      title: "Move dates",
      question: "What move window should planning and reminders assume?",
      detail:
        missingDateFields.length > 0
          ? `Missing ${missingDateFields.join(" and ")}.`
          : "Move dates are set.",
      count: missingDateFields.length,
      anchor: "#active-moves",
      actionLabel: "Move details",
    }),
  ];
}

function resourcePrompts(
  resources: MoveQuestionResource[],
  zones: MoveQuestionZone[]
): MoveQuestionPrompt[] {
  const zonesByResourceId = new Set(zones.map((zone) => zone.resourceId));
  const capacityRelevant = resources.filter(isCapacityRelevantResource);
  const unreviewedCapacity = capacityRelevant.filter(
    (resource) =>
      !resource.capacityReviewStatus ||
      resource.capacityReviewStatus === "unreviewed"
  );
  const missingCapacity = capacityRelevant.filter(hasCapacityGap);
  const missingZones = resources.filter(
    (resource) =>
      resource.type !== "unknown" && !zonesByResourceId.has(resource.resourceId)
  );
  const missingRules = resources.filter(
    (resource) =>
      rulesRelevantResourceTypes.has(resource.type) && resource.rules.length === 0
  );

  return [
    prompt({
      key: "transport-resources",
      category: "resources",
      severity: "critical",
      title: "Transport resources",
      question: "Which trucks, trailers, movers, storage, or disposition buckets exist?",
      detail:
        resources.length === 0
          ? "No active transport resources are set yet."
          : "Active transport resources are set.",
      count: resources.length === 0 ? 1 : 0,
      anchor: "#transport-resources",
      actionLabel: "Resources",
    }),
    prompt({
      key: "capacity-review",
      category: "resources",
      severity: "warning",
      title: "Capacity assumptions",
      question: "Which truck, trailer, vehicle, or storage capacities are actual vs. guesses?",
      detail:
        unreviewedCapacity.length > 0
          ? `${unreviewedCapacity.length} capacity-bearing resources still need estimated or confirmed review.`
          : "Capacity-bearing resources have been reviewed.",
      count: unreviewedCapacity.length,
      anchor: "#capacity-posture",
      actionLabel: "Capacity",
    }),
    prompt({
      key: "capacity-values",
      category: "resources",
      severity: "warning",
      title: "Capacity values",
      question: "Which capacity-bound resources need weight or volume limits?",
      detail:
        missingCapacity.length > 0
          ? `${missingCapacity.length} resources are missing weight or volume capacity unless intentionally unlimited.`
          : "Capacity-bound resources have weight or volume values or are marked unlimited.",
      count: missingCapacity.length,
      anchor: "#capacity-posture",
      actionLabel: "Capacity",
    }),
    prompt({
      key: "resource-zones",
      category: "resources",
      severity: "info",
      title: "Resource zones",
      question: "Which resources need zones for more precise loading or unloading?",
      detail:
        missingZones.length > 0
          ? `${missingZones.length} resources do not have active zones.`
          : "Active resources have zones.",
      count: missingZones.length,
      anchor: "#transport-resources",
      actionLabel: "Resources",
    }),
    prompt({
      key: "resource-rules",
      category: "resources",
      severity: "info",
      title: "Resource restrictions",
      question: "Which resources need rule notes for helpers, movers, pickup, donation, or disposal?",
      detail:
        missingRules.length > 0
          ? `${missingRules.length} resources have no rule or restriction notes.`
          : "Resource rule notes are present.",
      count: missingRules.length,
      anchor: "#transport-resources",
      actionLabel: "Resources",
    }),
  ];
}

function pcsPrompts(move: MoveQuestionMove): MoveQuestionPrompt[] {
  if (move.type !== "pcs") return [];

  const missingIdentityFields = [
    !hasText(move.pcsBranch) ? "branch" : null,
    !hasText(move.pcsRankPayGrade) ? "rank/pay grade" : null,
    !hasText(move.pcsShipmentType) ? "shipment type" : null,
    !hasText(move.pcsDependentStatus) || move.pcsDependentStatus === "unknown"
      ? "dependent status"
      : null,
  ].filter(Boolean);
  const missingOrdersFields = [
    !hasText(move.pcsOrdersNumber) ? "orders number" : null,
    !move.moveLevelWeightAllowanceLb ? "official allowance" : null,
    !hasText(move.pcsAllowanceNotes) ? "allowance notes" : null,
  ].filter(Boolean);
  const missingOfficeFields = [
    !hasText(move.pcsTransportationOfficeNotes)
      ? "transportation office notes"
      : null,
    !hasText(move.pcsRestrictedItemsNotes) ? "restricted item notes" : null,
  ].filter(Boolean);

  return [
    prompt({
      key: "pcs-identity",
      category: "pcs",
      severity: "warning",
      title: "PCS profile",
      question: "Which PCS identity fields should appear on the support packet?",
      detail:
        missingIdentityFields.length > 0
          ? `Missing ${missingIdentityFields.join(", ")}.`
          : "PCS identity fields are set.",
      count: missingIdentityFields.length,
      anchor: "#documentation-packets",
      actionLabel: "PCS packet",
    }),
    prompt({
      key: "pcs-orders-allowance",
      category: "pcs",
      severity: "critical",
      title: "Orders and allowance",
      question:
        "What official orders and allowance details has the transportation office confirmed?",
      detail:
        missingOrdersFields.length > 0
          ? `Missing ${missingOrdersFields.join(", ")}. Verify current official guidance before relying on packet totals.`
          : "Orders and allowance fields are set.",
      count: missingOrdersFields.length,
      anchor: "#documentation-packets",
      actionLabel: "PCS packet",
    }),
    prompt({
      key: "pcs-office-guidance",
      category: "pcs",
      severity: "warning",
      title: "PCS office guidance",
      question:
        "What has the transportation office said about restricted items, PBP&E, and shipment handling?",
      detail:
        missingOfficeFields.length > 0
          ? `Missing ${missingOfficeFields.join(", ")}.`
          : "Transportation office and restricted item notes are set.",
      count: missingOfficeFields.length,
      anchor: "#documentation-packets",
      actionLabel: "PCS packet",
    }),
  ];
}

function inventoryPrompts(items: MoveQuestionItem[]): MoveQuestionPrompt[] {
  const lowConfidence = items.filter(
    (item) =>
      item.needsReview ||
      item.weightConfidence === "none" ||
      item.weightConfidence === "low" ||
      item.volumeConfidence === "none" ||
      item.volumeConfidence === "low"
  );
  const undecided = items.filter((item) => item.disposition === "undecided");
  const noFirstNight = items.length > 0
    ? items.filter((item) => item.planningDefaultKeys.includes("firstNight"))
        .length === 0
      ? 1
      : 0
    : 0;

  return [
    prompt({
      key: "inventory-review",
      category: "inventory",
      severity: "critical",
      title: "Inventory confidence",
      question: "Which AI-assisted or low-confidence records need human review?",
      detail:
        lowConfidence.length > 0
          ? `${lowConfidence.length} items need review or have low/empty estimate confidence.`
          : "No low-confidence inventory records detected.",
      count: lowConfidence.length,
      anchor: "#inventory",
      actionLabel: "Inventory",
    }),
    prompt({
      key: "inventory-disposition",
      category: "inventory",
      severity: "warning",
      title: "Item disposition",
      question: "What should happen to each undecided item?",
      detail:
        undecided.length > 0
          ? `${undecided.length} items still need keep, mover, personal transport, storage, sell, donate, dump, or free decisions.`
          : "All active items have a disposition.",
      count: undecided.length,
      anchor: "#inventory",
      actionLabel: "Inventory",
    }),
    prompt({
      key: "first-night-items",
      category: "inventory",
      severity: "info",
      title: "First-night kit",
      question: "Which items must stay accessible the first night?",
      detail:
        noFirstNight > 0
          ? "No active inventory is tagged for first-night access yet."
          : "At least one first-night item is tagged.",
      count: noFirstNight,
      anchor: "#inventory",
      actionLabel: "Inventory",
    }),
  ];
}

function evidencePrompts(
  items: MoveQuestionItem[],
  photos: MoveQuestionPhoto[],
  itemIdsWithPhotos: Set<string>
): MoveQuestionPrompt[] {
  const priorityItems = items.filter(isEvidenceImportant);
  const priorityWithoutPhotos = priorityItems.filter(
    (item) => !itemIdsWithPhotos.has(item.itemId)
  );
  const priorityWithoutValue = priorityItems.filter(
    (item) =>
      typeof item.valueCents !== "number" &&
      typeof item.replacementValueCents !== "number"
  );
  const serialCandidateItems = items.filter(
    (item) =>
      item.highValue ||
      item.planningDefaultKeys.includes("electronics") ||
      item.planningDefaultKeys.includes("documents") ||
      item.status === "missing" ||
      item.status === "damaged"
  );
  const serialCandidatesWithoutSerial = serialCandidateItems.filter(
    (item) => !hasText(item.serialNumber) && !hasText(item.modelNumber)
  );
  const photosNeedingReview = photos.filter(
    (photo) =>
      photo.verificationStatus === "unreviewed" ||
      photo.verificationStatus === "needsReview"
  );

  return [
    prompt({
      key: "priority-photo-evidence",
      category: "evidence",
      severity: "critical",
      title: "Priority photo evidence",
      question: "Which valuable, sensitive, or owner-carry items still need photos?",
      detail:
        priorityWithoutPhotos.length > 0
          ? `${priorityWithoutPhotos.length} priority items have no item-linked photo evidence.`
          : "Priority items have item-linked photo evidence.",
      count: priorityWithoutPhotos.length,
      anchor: "#add-photos",
      actionLabel: "Photos",
    }),
    prompt({
      key: "claim-value-evidence",
      category: "evidence",
      severity: "warning",
      title: "Claim value evidence",
      question: "Which claim-sensitive items need value or replacement value records?",
      detail:
        priorityWithoutValue.length > 0
          ? `${priorityWithoutValue.length} priority items are missing value fields.`
          : "Priority items have value fields.",
      count: priorityWithoutValue.length,
      anchor: "#evidence-density",
      actionLabel: "Evidence",
    }),
    prompt({
      key: "serial-model-evidence",
      category: "evidence",
      severity: "warning",
      title: "Serial and model details",
      question: "Which electronics, documents, damaged, missing, or high-value items need serial/model details?",
      detail:
        serialCandidatesWithoutSerial.length > 0
          ? `${serialCandidatesWithoutSerial.length} candidate items are missing serial or model fields.`
          : "Serial/model fields are present for candidate items.",
      count: serialCandidatesWithoutSerial.length,
      anchor: "#evidence-density",
      actionLabel: "Evidence",
    }),
    prompt({
      key: "photo-review",
      category: "evidence",
      severity: "info",
      title: "Photo review",
      question: "Which uploaded photos are trusted enough for packets or AI suggestions?",
      detail:
        photosNeedingReview.length > 0
          ? `${photosNeedingReview.length} photos still need verification review.`
          : "No unreviewed photo evidence detected.",
      count: photosNeedingReview.length,
      anchor: "#photos",
      actionLabel: "Photos",
    }),
  ];
}

function loadPrompts(
  items: MoveQuestionItem[],
  boxes: MoveQuestionBox[],
  boxedItemIds: Set<string>
): MoveQuestionPrompt[] {
  const looseItems = items.filter(
    (item) =>
      loadRelevantDispositions.has(item.disposition) &&
      !boxedItemIds.has(item.itemId)
  );
  const unassignedBoxes = boxes.filter((box) => !box.assignedResourceId);
  const boxesMissingDestination = boxes.filter((box) => !hasText(box.destinationRoom));
  const boxesWithWarnings = boxes.filter(
    (box) =>
      (box.assignmentWarnings?.length ?? 0) > 0 ||
      (box.assignmentHardBlocks?.length ?? 0) > 0
  );

  return [
    prompt({
      key: "loose-load-items",
      category: "load",
      severity: "warning",
      title: "Loose load items",
      question: "Which move-relevant items should be boxed or treated as loose cargo?",
      detail:
        looseItems.length > 0
          ? `${looseItems.length} move-relevant items are not associated with an active box.`
          : "Move-relevant items are boxed or out of scope.",
      count: looseItems.length,
      anchor: "#boxes",
      actionLabel: "Boxes",
    }),
    prompt({
      key: "unassigned-boxes",
      category: "load",
      severity: "warning",
      title: "Load assignment",
      question: "Which boxes go in each truck, trailer, mover shipment, storage, sale, donation, or dump bucket?",
      detail:
        unassignedBoxes.length > 0
          ? `${unassignedBoxes.length} boxes are not assigned to a transport resource.`
          : "All active boxes have transport assignments.",
      count: unassignedBoxes.length,
      anchor: "#load-plan",
      actionLabel: "Load planner",
    }),
    prompt({
      key: "box-destinations",
      category: "load",
      severity: "info",
      title: "Unload destinations",
      question: "Which boxes need destination rooms for labels and unloading?",
      detail:
        boxesMissingDestination.length > 0
          ? `${boxesMissingDestination.length} boxes are missing destination rooms.`
          : "Active boxes have destination rooms.",
      count: boxesMissingDestination.length,
      anchor: "#boxes",
      actionLabel: "Boxes",
    }),
    prompt({
      key: "assignment-warnings",
      category: "load",
      severity: "critical",
      title: "Load warnings",
      question: "Which load assignments have capacity, restriction, or hard-block warnings?",
      detail:
        boxesWithWarnings.length > 0
          ? `${boxesWithWarnings.length} boxes have load assignment warnings or hard blocks.`
          : "No load assignment warnings detected.",
      count: boxesWithWarnings.length,
      anchor: "#load-plan",
      actionLabel: "Load planner",
    }),
  ];
}

function packetPrompts(
  move: MoveQuestionMove,
  items: MoveQuestionItem[]
): MoveQuestionPrompt[] {
  const profileTypes = move.documentationProfileTypes ?? [];
  const hasClaimPacket =
    profileTypes.includes("insuranceClaim") || move.type === "claimsInventory";
  const claimRelevantItems = items.filter(
    (item) =>
      item.status === "missing" ||
      item.status === "damaged" ||
      item.highValue ||
      item.needsReview
  );
  const hasLoadCrewPacket = profileTypes.includes("loadCrew");
  const moverUnsafeItems = items.filter(
    (item) =>
      item.requiresPersonalTransport ||
      item.disposition === "personalTransport" ||
      item.planningDefaultKeys.includes("doNotLetMoversTouch")
  );

  return [
    prompt({
      key: "claim-packet-readiness",
      category: "packets",
      severity: "warning",
      title: "Claims packet readiness",
      question: "Which claim-sensitive records should be reviewed before exporting?",
      detail:
        hasClaimPacket && claimRelevantItems.length > 0
          ? `${claimRelevantItems.length} claim-sensitive items should be reviewed before packet export.`
          : "No active claim packet review prompt.",
      count: hasClaimPacket ? claimRelevantItems.length : 0,
      anchor: "#claims-center",
      actionLabel: "Claims",
    }),
    prompt({
      key: "crew-safe-packet",
      category: "packets",
      severity: "info",
      title: "Crew-safe packet",
      question: "Which personal-transport or do-not-move items must be hidden or called out for helpers?",
      detail:
        hasLoadCrewPacket && moverUnsafeItems.length > 0
          ? `${moverUnsafeItems.length} owner-carry or do-not-move items need crew-safe handling.`
          : "No active crew-safe packet prompt.",
      count: hasLoadCrewPacket ? moverUnsafeItems.length : 0,
      anchor: "#documentation-packets",
      actionLabel: "Packets",
    }),
  ];
}

function prompt(input: MoveQuestionPrompt): MoveQuestionPrompt {
  return input;
}

function isEvidenceImportant(item: MoveQuestionItem) {
  const maxValue = Math.max(item.valueCents ?? 0, item.replacementValueCents ?? 0);
  return (
    item.highValue ||
    item.requiresPersonalTransport ||
    item.status === "missing" ||
    item.status === "damaged" ||
    maxValue >= 100000 ||
    item.planningDefaultKeys.some((key) => evidenceImportantKeys.has(key))
  );
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function severityRank(severity: MoveQuestionSeverity) {
  switch (severity) {
    case "critical":
      return 3;
    case "warning":
      return 2;
    case "info":
      return 1;
  }
}

function categoryCounts(prompts: MoveQuestionPrompt[]) {
  return prompts.reduce(
    (counts, prompt) => {
      counts[prompt.category] = (counts[prompt.category] ?? 0) + 1;
      return counts;
    },
    {} as Partial<Record<MoveQuestionCategory, number>>
  );
}

function isCapacityRelevantResource(resource: MoveQuestionResource) {
  return capacityRelevantResourceTypes.has(resource.type);
}

function hasCapacityGap(resource: MoveQuestionResource) {
  const capacity = resource.capacity;
  const hasWeight =
    capacity.weightIsUnlimited ||
    (typeof capacity.maxWeightLb === "number" && capacity.maxWeightLb > 0);
  const hasVolume =
    capacity.volumeIsUnlimited ||
    (typeof capacity.maxVolumeCuFt === "number" && capacity.maxVolumeCuFt > 0);

  return !hasWeight && !hasVolume;
}
