import {
  estimateItem,
  roundEstimate,
  type EstimateConfidence,
} from "../estimateEngine";
import { normalizeOptionalText } from "../moveFields";

type RestMovableUnitDimensions = {
  lengthIn?: unknown;
  widthIn?: unknown;
  heightIn?: unknown;
};

type RestMovableUnitItem = Record<string, unknown> & {
  _id: unknown;
  name?: unknown;
  category?: unknown;
  subcategory?: unknown;
  room?: unknown;
  destinationRoom?: unknown;
  status?: unknown;
  deletedAt?: unknown;
  quantity?: unknown;
  dimensionsIn?: RestMovableUnitDimensions;
  estimatedWeightLb?: unknown;
  estimatedWeightLowLb?: unknown;
  estimatedWeightHighLb?: unknown;
  actualWeightLb?: unknown;
  estimatedVolumeCuFt?: unknown;
  estimatedPackedVolumeCuFt?: unknown;
  weightConfidence?: unknown;
  volumeConfidence?: unknown;
  assignedResourceId?: unknown;
  assignedZoneId?: unknown;
  assignmentLocked?: unknown;
  requiresPersonalTransport?: unknown;
  disposition?: unknown;
  aiTags?: unknown;
};

type RestMovableUnitBox = Record<string, unknown> & {
  _id: unknown;
  code?: unknown;
  label?: unknown;
  room?: unknown;
  destinationRoom?: unknown;
  archivedAt?: unknown;
  dimensionsIn?: RestMovableUnitDimensions;
  estimatedWeightLb?: unknown;
  actualWeightLb?: unknown;
  estimatedVolumeCuFt?: unknown;
  assignedResourceId?: unknown;
  assignedZoneId?: unknown;
};

type RestMovableUnitBoxItem = Record<string, unknown> & {
  boxId: unknown;
  itemId: unknown;
  quantity?: unknown;
};

type RestMovableUnitMissingField = "weight" | "dimensions" | "volume";

const explicitLooseMovableUnitTags = new Set([
  "movable-unit",
  "loose-item",
  "loose-movable-unit",
  "move-as-is",
]);

const largeMovableCategoryTerms = [
  "large movable unit",
  "furniture",
  "appliance",
  "exercise",
  "fitness",
  "workshop equipment",
  "yard equipment",
  "outdoor equipment",
  "sports equipment",
];

const largeMovableNameTerms = [
  "appliance",
  "armoire",
  "bike",
  "bicycle",
  "bookcase",
  "bookshelf",
  "cabinet",
  "chair",
  "chest",
  "couch",
  "desk",
  "dresser",
  "dryer",
  "elliptical",
  "freezer",
  "fridge",
  "futon",
  "ladder",
  "mattress",
  "mower",
  "piano",
  "planer",
  "refrigerator",
  "saw",
  "shelf",
  "shovel",
  "sofa",
  "table",
  "tool chest",
  "toolbox",
  "treadmill",
  "washer",
  "workbench",
];

type RestMovableUnitExample = {
  kind: "box" | "looseItem";
  boxId?: unknown;
  itemId?: unknown;
  code?: unknown;
  name?: unknown;
};

type RestMovableUnitMeasurementPatchHint = {
  tool: "batch_upsert_movable_units";
  target: Pick<RestMovableUnitExample, "kind" | "boxId" | "itemId" | "code">;
  fieldsToUpdate: RestMovableUnitMissingField[];
};

type RestMovableUnitAssignmentPatchHint = {
  tool: "apply_assignments";
  target: Pick<RestMovableUnitExample, "kind" | "boxId" | "itemId">;
};

type RestMovableUnitGapExample = RestMovableUnitExample & {
  missingFields: RestMovableUnitMissingField[];
  measurementPatchHint: RestMovableUnitMeasurementPatchHint;
};

type RestMovableUnitAssignmentExample = RestMovableUnitExample & {
  assignmentPatchHint: RestMovableUnitAssignmentPatchHint;
};

type RestMovableUnitMeasurementRouteGroup = {
  roomLabel: string;
  unitCount: number;
  missingWeight: number;
  missingDimensions: number;
  missingVolume: number;
  unassigned: number;
  priority: number;
  exampleNames: string[];
  gapExamples: RestMovableUnitGapExample[];
  assignmentExamples: RestMovableUnitAssignmentExample[];
};

export type RestMovableUnitSummary = {
  total: number;
  boxes: number;
  looseItems: number;
  knownWeightLb: number;
  knownVolumeCuFt: number;
  missingWeight: number;
  missingDimensions: number;
  missingVolume: number;
  assigned: number;
  unassigned: number;
  measurementRoute: RestMovableUnitMeasurementRouteGroup[];
  gapExamples: RestMovableUnitGapExample[];
  assignmentExamples: RestMovableUnitAssignmentExample[];
};

export function restMovableUnitSummary({
  boxes,
  items,
  boxItems,
  maxMeasurementRouteGroups = 6,
  maxMeasurementRouteExamplesPerGroup = 3,
  maxGapExamples = 8,
  maxAssignmentExamples = 8,
}: {
  boxes: readonly RestMovableUnitBox[];
  items: readonly RestMovableUnitItem[];
  boxItems: readonly RestMovableUnitBoxItem[];
  maxMeasurementRouteGroups?: number;
  maxMeasurementRouteExamplesPerGroup?: number;
  maxGapExamples?: number;
  maxAssignmentExamples?: number;
}): RestMovableUnitSummary {
  const activeBoxes = boxes.filter((box) => !box.archivedAt);
  const activeItems = items.filter(
    (item) => !item.deletedAt && item.status !== "archived",
  );
  const activeBoxIds = new Set(activeBoxes.map((box) => String(box._id)));
  const activeItemsById = new Map(
    activeItems.map((item) => [String(item._id), item]),
  );
  const boxedItemIds = new Set<string>();
  const boxMemberships = new Map<string, RestMovableUnitBoxItem[]>();

  for (const membership of boxItems) {
    const boxId = String(membership.boxId);
    const itemId = String(membership.itemId);
    if (!activeBoxIds.has(boxId) || !activeItemsById.has(itemId)) continue;
    boxedItemIds.add(itemId);
    const memberships = boxMemberships.get(boxId) ?? [];
    memberships.push(membership);
    boxMemberships.set(boxId, memberships);
  }

  const looseItems = activeItems.filter(
    (item) =>
      !boxedItemIds.has(String(item._id)) && isLooseMovableUnitRestItem(item),
  );
  const summary: RestMovableUnitSummary = {
    total: activeBoxes.length + looseItems.length,
    boxes: activeBoxes.length,
    looseItems: looseItems.length,
    knownWeightLb: 0,
    knownVolumeCuFt: 0,
    missingWeight: 0,
    missingDimensions: 0,
    missingVolume: 0,
    assigned: 0,
    unassigned: 0,
    measurementRoute: [],
    gapExamples: [],
    assignmentExamples: [],
  };
  const measurementRouteGroups =
    new Map<string, RestMovableUnitMeasurementRouteGroup>();

  const recordGap = (
    example: RestMovableUnitExample,
    missingFields: RestMovableUnitMissingField[],
  ) => {
    if (
      missingFields.length &&
      summary.gapExamples.length < Math.max(0, maxGapExamples)
    ) {
      summary.gapExamples.push({
        ...example,
        missingFields,
        measurementPatchHint: movableUnitMeasurementPatchHint(
          example,
          missingFields,
        ),
      });
    }
  };
  const recordAssignmentExample = (example: RestMovableUnitExample) => {
    if (
      summary.assignmentExamples.length < Math.max(0, maxAssignmentExamples)
    ) {
      summary.assignmentExamples.push({
        ...example,
        assignmentPatchHint: movableUnitAssignmentPatchHint(example),
      });
    }
  };
  const recordMeasurementRoute = ({
    example,
    missingFields,
    assignmentNeeded,
    roomLabel,
  }: {
    example: RestMovableUnitExample;
    missingFields: RestMovableUnitMissingField[];
    assignmentNeeded: boolean;
    roomLabel: string;
  }) => {
    if (!missingFields.length && !assignmentNeeded) return;

    const group =
      measurementRouteGroups.get(roomLabel) ??
      {
        roomLabel,
        unitCount: 0,
        missingWeight: 0,
        missingDimensions: 0,
        missingVolume: 0,
        unassigned: 0,
        priority: 0,
        exampleNames: [],
        gapExamples: [],
        assignmentExamples: [],
      };

    group.unitCount += 1;
    if (missingFields.includes("weight")) group.missingWeight += 1;
    if (missingFields.includes("dimensions")) group.missingDimensions += 1;
    if (missingFields.includes("volume")) group.missingVolume += 1;
    if (assignmentNeeded) group.unassigned += 1;
    if (
      example.name &&
      group.exampleNames.length < maxMeasurementRouteExamplesPerGroup
    ) {
      group.exampleNames.push(String(example.name));
    }
    if (
      missingFields.length &&
      group.gapExamples.length < maxMeasurementRouteExamplesPerGroup
    ) {
      group.gapExamples.push({
        ...example,
        missingFields,
        measurementPatchHint: movableUnitMeasurementPatchHint(
          example,
          missingFields,
        ),
      });
    }
    if (
      assignmentNeeded &&
      group.assignmentExamples.length < maxMeasurementRouteExamplesPerGroup
    ) {
      group.assignmentExamples.push({
        ...example,
        assignmentPatchHint: movableUnitAssignmentPatchHint(example),
      });
    }
    group.priority =
      group.unassigned * 50 +
      group.missingWeight * 40 +
      group.missingDimensions * 30 +
      group.missingVolume * 20 +
      group.unitCount;

    measurementRouteGroups.set(roomLabel, group);
  };

  for (const box of activeBoxes) {
    const memberships = boxMemberships.get(String(box._id)) ?? [];
    const contentsWeight = sumMembershipWeight(memberships, activeItemsById);
    const weight =
      finiteNumber(box.actualWeightLb) ??
      finiteNumber(box.estimatedWeightLb) ??
      contentsWeight;
    const volume =
      finiteNumber(box.estimatedVolumeCuFt) ??
      volumeFromDimensions(box.dimensionsIn);
    const missingFields = missingMovableUnitFields({
      weight,
      dimensionsIn: box.dimensionsIn,
      volume,
    });

    addKnownValues(summary, { weight, volume });
    const assigned = addAssignment(summary, box);
    addMissingCounts(summary, missingFields);
    const example = {
      kind: "box" as const,
      boxId: box._id,
      code: box.code,
      name: box.label,
    };
    if (!assigned) {
      recordAssignmentExample(example);
    }
    recordGap(example, missingFields);
    recordMeasurementRoute({
      example,
      missingFields,
      assignmentNeeded: !assigned,
      roomLabel: movableUnitRoomLabel(box),
    });
  }

  for (const item of looseItems) {
    const quantity = quantityMultiplier(item.quantity);
    const weight = multiplyOptional(
      finiteNumber(item.actualWeightLb) ?? finiteNumber(item.estimatedWeightLb),
      quantity,
    );
    const perUnitVolume =
      finiteNumber(item.estimatedVolumeCuFt) ??
      finiteNumber(item.estimatedPackedVolumeCuFt) ??
      volumeFromDimensions(item.dimensionsIn);
    const volume = multiplyOptional(perUnitVolume, quantity);
    const missingFields = missingMovableUnitFields({
      weight,
      dimensionsIn: item.dimensionsIn,
      volume,
    });

    addKnownValues(summary, { weight, volume });
    const assigned = addAssignment(summary, item);
    addMissingCounts(summary, missingFields);
    const example = {
      kind: "looseItem" as const,
      itemId: item._id,
      name: item.name,
    };
    if (!assigned) {
      recordAssignmentExample(example);
    }
    recordGap(example, missingFields);
    recordMeasurementRoute({
      example,
      missingFields,
      assignmentNeeded: !assigned,
      roomLabel: movableUnitRoomLabel(item),
    });
  }

  summary.knownWeightLb = roundEstimate(summary.knownWeightLb);
  summary.knownVolumeCuFt = roundEstimate(summary.knownVolumeCuFt);
  summary.measurementRoute = Array.from(measurementRouteGroups.values())
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.roomLabel.localeCompare(b.roomLabel);
    })
    .slice(0, Math.max(0, maxMeasurementRouteGroups));

  return summary;
}

function movableUnitRoomLabel(
  unit: RestMovableUnitBox | RestMovableUnitItem,
) {
  return (
    normalizeOptionalText(restString(unit.room)) ??
    normalizeOptionalText(restString(unit.destinationRoom)) ??
    "Unassigned room"
  );
}

function movableUnitMeasurementPatchHint(
  example: RestMovableUnitExample,
  missingFields: RestMovableUnitMissingField[],
): RestMovableUnitMeasurementPatchHint {
  return {
    tool: "batch_upsert_movable_units",
    target: compactObject({
      kind: example.kind,
      boxId: example.boxId,
      itemId: example.itemId,
      code: example.code,
    }),
    fieldsToUpdate: missingFields,
  };
}

function movableUnitAssignmentPatchHint(
  example: RestMovableUnitExample,
): RestMovableUnitAssignmentPatchHint {
  return {
    tool: "apply_assignments",
    target: compactObject({
      kind: example.kind,
      boxId: example.boxId,
      itemId: example.itemId,
    }),
  };
}

export function isLooseMovableUnitRestItem(item: RestMovableUnitItem) {
  if (item.deletedAt || item.status === "archived") {
    return false;
  }
  if (
    restStringArray(item.aiTags).some((tag) =>
      explicitLooseMovableUnitTags.has(tag.trim().toLowerCase()),
    )
  ) {
    return true;
  }
  if (item.assignedResourceId || item.assignedZoneId || item.assignmentLocked) {
    return true;
  }
  if (
    item.requiresPersonalTransport === true ||
    item.disposition === "personalTransport"
  ) {
    return true;
  }

  const categoryText = restSearchableText([item.category, item.subcategory]);
  if (largeMovableCategoryTerms.some((term) => categoryText.includes(term))) {
    return true;
  }

  const nameText = restSearchableText([
    item.name,
    item.category,
    item.subcategory,
  ]);
  if (largeMovableNameTerms.some((term) => nameText.includes(term))) {
    return true;
  }

  const quantity = quantityMultiplier(item.quantity);
  const weight = multiplyOptional(
    finiteNumber(item.actualWeightLb) ?? finiteNumber(item.estimatedWeightLb),
    quantity,
  );
  if (weight !== undefined && weight >= 25) {
    return true;
  }

  const volume = multiplyOptional(
    finiteNumber(item.estimatedVolumeCuFt) ??
      finiteNumber(item.estimatedPackedVolumeCuFt) ??
      volumeFromDimensions(item.dimensionsIn),
    quantity,
  );
  if (volume !== undefined && volume >= 4) {
    return true;
  }

  return [
    finiteNumber(item.dimensionsIn?.lengthIn),
    finiteNumber(item.dimensionsIn?.widthIn),
    finiteNumber(item.dimensionsIn?.heightIn),
  ].some((dimension) => dimension !== undefined && dimension >= 36);
}

function restString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function restStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function restSearchableText(values: readonly unknown[]) {
  return values
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function sumMembershipWeight(
  memberships: readonly RestMovableUnitBoxItem[],
  activeItemsById: ReadonlyMap<string, RestMovableUnitItem>,
) {
  let total = 0;
  let hasValue = false;
  for (const membership of memberships) {
    const item = activeItemsById.get(String(membership.itemId));
    if (!item) continue;
    const estimate = estimateItem({
      name: typeof item.name === "string" ? item.name : "Item",
      category: typeof item.category === "string" ? item.category : undefined,
      quantity: quantityMultiplier(membership.quantity),
      dimensionsIn: normalizedDimensions(item.dimensionsIn),
      estimatedWeightLb: finiteNumber(item.estimatedWeightLb),
      estimatedWeightLowLb: finiteNumber(item.estimatedWeightLowLb),
      estimatedWeightHighLb: finiteNumber(item.estimatedWeightHighLb),
      actualWeightLb: finiteNumber(item.actualWeightLb),
      estimatedVolumeCuFt: finiteNumber(item.estimatedVolumeCuFt),
      estimatedPackedVolumeCuFt: finiteNumber(item.estimatedPackedVolumeCuFt),
      weightConfidence: estimateConfidence(item.weightConfidence),
      volumeConfidence: estimateConfidence(item.volumeConfidence),
    });
    if (estimate.weight?.value !== undefined) {
      total += estimate.weight.value;
      hasValue = true;
    }
  }
  return hasValue ? roundEstimate(total) : undefined;
}

function addKnownValues(
  summary: RestMovableUnitSummary,
  values: { weight?: number; volume?: number },
) {
  if (values.weight !== undefined) summary.knownWeightLb += values.weight;
  if (values.volume !== undefined) summary.knownVolumeCuFt += values.volume;
}

function addAssignment(
  summary: RestMovableUnitSummary,
  unit: {
    assignedResourceId?: unknown;
    assignedZoneId?: unknown;
    requiresPersonalTransport?: unknown;
    disposition?: unknown;
  },
) {
  if (
    unit.assignedResourceId ||
    unit.assignedZoneId ||
    unit.requiresPersonalTransport === true ||
    unit.disposition === "personalTransport"
  ) {
    summary.assigned += 1;
    return true;
  }
  summary.unassigned += 1;
  return false;
}

function addMissingCounts(
  summary: RestMovableUnitSummary,
  missingFields: readonly RestMovableUnitMissingField[],
) {
  if (missingFields.includes("weight")) summary.missingWeight += 1;
  if (missingFields.includes("dimensions")) summary.missingDimensions += 1;
  if (missingFields.includes("volume")) summary.missingVolume += 1;
}

function missingMovableUnitFields({
  weight,
  dimensionsIn,
  volume,
}: {
  weight?: number;
  dimensionsIn?: RestMovableUnitDimensions;
  volume?: number;
}) {
  const missingFields: RestMovableUnitMissingField[] = [];
  if (weight === undefined) missingFields.push("weight");
  if (!hasCompleteDimensions(dimensionsIn)) missingFields.push("dimensions");
  if (volume === undefined) missingFields.push("volume");
  return missingFields;
}

function hasCompleteDimensions(
  dimensions: RestMovableUnitDimensions | undefined,
) {
  return (
    finiteNumber(dimensions?.lengthIn) !== undefined &&
    finiteNumber(dimensions?.widthIn) !== undefined &&
    finiteNumber(dimensions?.heightIn) !== undefined
  );
}

function volumeFromDimensions(
  dimensions: RestMovableUnitDimensions | undefined,
) {
  const normalized = normalizedDimensions(dimensions);
  if (
    normalized.lengthIn === undefined ||
    normalized.widthIn === undefined ||
    normalized.heightIn === undefined
  ) {
    return undefined;
  }
  return roundEstimate(
    (normalized.lengthIn * normalized.widthIn * normalized.heightIn) / 1728,
  );
}

function normalizedDimensions(
  dimensions: RestMovableUnitDimensions | undefined,
) {
  return {
    lengthIn: finiteNumber(dimensions?.lengthIn),
    widthIn: finiteNumber(dimensions?.widthIn),
    heightIn: finiteNumber(dimensions?.heightIn),
  };
}

function quantityMultiplier(value: unknown) {
  const quantity = finiteNumber(value);
  return quantity !== undefined && quantity > 0 ? quantity : 1;
}

function multiplyOptional(value: number | undefined, multiplier: number) {
  return value === undefined ? undefined : roundEstimate(value * multiplier);
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

const estimateConfidenceValues = new Set<EstimateConfidence>([
  "none",
  "low",
  "medium",
  "high",
  "manual",
  "actual",
]);

function estimateConfidence(value: unknown) {
  return typeof value === "string" &&
    estimateConfidenceValues.has(value as EstimateConfidence)
    ? (value as EstimateConfidence)
    : undefined;
}

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
