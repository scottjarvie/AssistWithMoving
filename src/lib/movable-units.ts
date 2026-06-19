import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { InventoryItem } from "@/lib/inventory-types";

type WeightSummaryLike = {
  valueLb?: number;
  label?: string;
  source?: string;
};

type DimensionsLike = {
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
};

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

export type MovableUnitBoxRecord = {
  box: Doc<"boxes">;
  itemCount?: number;
  weightSummary?: WeightSummaryLike;
  contents?: unknown[];
};

export type MovableUnitKind = "box" | "looseItem";

export type MovableUnitMissingField = "weight" | "dimensions" | "volume";

export type MovableUnit = {
  id: string;
  kind: MovableUnitKind;
  recordId: Id<"boxes"> | Id<"items">;
  label: string;
  name: string;
  status: string;
  roomLabel: string;
  destinationLabel: string;
  itemCountLabel: string;
  estimatedWeightLb?: number;
  estimatedVolumeCuFt?: number;
  editableWeightLb?: number;
  editableVolumeCuFt?: number;
  dimensionsIn?: DimensionsLike;
  weightLabel: string;
  weightSourceLabel: string;
  dimensionsLabel: string;
  volumeLabel: string;
  assignedResourceId?: Id<"transportResources">;
  assignedZoneId?: Id<"transportZones">;
  assignmentLocked: boolean;
  assignmentLabel: string;
  assignmentState: "assigned" | "unassigned" | "owner";
  missingFields: MovableUnitMissingField[];
  followUps: string[];
  searchText: string;
};

export type MovableUnitSummary = {
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
};

export function buildMovableUnits({
  boxes = [],
  looseItems = [],
  resourceNamesById,
  zoneNamesById,
}: {
  boxes?: readonly MovableUnitBoxRecord[];
  looseItems?: readonly InventoryItem[];
  resourceNamesById?: ReadonlyMap<string, string>;
  zoneNamesById?: ReadonlyMap<string, string>;
}) {
  return [
    ...boxes
      .filter((record) => !record.box.archivedAt)
      .map((record) =>
        movableUnitFromBox(record, resourceNamesById, zoneNamesById),
      ),
    ...looseItems
      .filter(isLooseMovableUnitItem)
      .map((item) =>
        movableUnitFromLooseItem(item, resourceNamesById, zoneNamesById),
      ),
  ];
}

export function isLooseMovableUnitItem(item: InventoryItem) {
  if (item.status === "archived" || item.deletedAt) {
    return false;
  }
  if (
    item.aiTags?.some((tag) =>
      explicitLooseMovableUnitTags.has(tag.trim().toLowerCase()),
    )
  ) {
    return true;
  }
  if (item.assignedResourceId || item.assignedZoneId || item.assignmentLocked) {
    return true;
  }
  if (
    item.requiresPersonalTransport ||
    item.disposition === "personalTransport"
  ) {
    return true;
  }

  const categoryText = searchableText([item.category, item.subcategory]);
  if (largeMovableCategoryTerms.some((term) => categoryText.includes(term))) {
    return true;
  }

  const nameText = searchableText([item.name, item.category, item.subcategory]);
  if (largeMovableNameTerms.some((term) => nameText.includes(term))) {
    return true;
  }

  const quantity = itemQuantity(item.quantity);
  const weight = multiplyOptional(
    item.actualWeightLb ?? item.estimatedWeightLb,
    quantity,
  );
  if (isFiniteNumber(weight) && weight >= 25) {
    return true;
  }

  const volume = multiplyOptional(
    item.estimatedVolumeCuFt ??
      item.estimatedPackedVolumeCuFt ??
      calculateMovableUnitVolumeCuFt(item.dimensionsIn),
    quantity,
  );
  if (isFiniteNumber(volume) && volume >= 4) {
    return true;
  }

  const dimensions = item.dimensionsIn;
  const largestDimension = [
    dimensions?.lengthIn,
    dimensions?.widthIn,
    dimensions?.heightIn,
  ].filter(isFiniteNumber);
  return largestDimension.some((dimension) => dimension >= 36);
}

export function summarizeMovableUnits(
  units: readonly MovableUnit[],
): MovableUnitSummary {
  return units.reduce(
    (summary, unit) => {
      summary.total += 1;
      if (unit.kind === "box") {
        summary.boxes += 1;
      } else {
        summary.looseItems += 1;
      }
      if (isFiniteNumber(unit.estimatedWeightLb)) {
        summary.knownWeightLb += unit.estimatedWeightLb;
      }
      if (isFiniteNumber(unit.estimatedVolumeCuFt)) {
        summary.knownVolumeCuFt += unit.estimatedVolumeCuFt;
      }
      if (unit.missingFields.includes("weight")) {
        summary.missingWeight += 1;
      }
      if (unit.missingFields.includes("dimensions")) {
        summary.missingDimensions += 1;
      }
      if (unit.missingFields.includes("volume")) {
        summary.missingVolume += 1;
      }
      if (unit.assignmentState === "unassigned") {
        summary.unassigned += 1;
      } else {
        summary.assigned += 1;
      }
      return summary;
    },
    {
      total: 0,
      boxes: 0,
      looseItems: 0,
      knownWeightLb: 0,
      knownVolumeCuFt: 0,
      missingWeight: 0,
      missingDimensions: 0,
      missingVolume: 0,
      assigned: 0,
      unassigned: 0,
    },
  );
}

function movableUnitFromBox(
  record: MovableUnitBoxRecord,
  resourceNamesById: ReadonlyMap<string, string> | undefined,
  zoneNamesById: ReadonlyMap<string, string> | undefined,
): MovableUnit {
  const { box } = record;
  const weight =
    box.actualWeightLb ??
    box.estimatedWeightLb ??
    record.weightSummary?.valueLb;
  const dimensions = describeDimensions(box.dimensionsIn);
  const volume = describeVolume({
    estimatedVolumeCuFt: box.estimatedVolumeCuFt,
    dimensionsIn: box.dimensionsIn,
  });
  const missingFields = missingMeasurementFields({
    hasWeight: isFiniteNumber(weight),
    dimensions,
    volume,
  });
  const assignment = describeBoxAssignment(
    box,
    resourceNamesById,
    zoneNamesById,
  );
  const followUps = [
    ...followUpsForMissingFields(missingFields),
    ...(record.itemCount ? [] : ["add contents later"]),
  ];

  return {
    id: `box:${box._id}`,
    kind: "box",
    recordId: box._id,
    label: box.code,
    name: box.label ?? box.description ?? "Box",
    status: box.status,
    roomLabel: box.room ?? "origin unset",
    destinationLabel: box.destinationRoom ?? "destination unset",
    itemCountLabel: `${record.itemCount ?? 0} item${record.itemCount === 1 ? "" : "s"}`,
    estimatedWeightLb: weight,
    estimatedVolumeCuFt: volume.valueCuFt,
    editableWeightLb:
      box.estimatedWeightLb ??
      box.actualWeightLb ??
      record.weightSummary?.valueLb,
    editableVolumeCuFt: box.estimatedVolumeCuFt,
    dimensionsIn: box.dimensionsIn,
    weightLabel: isFiniteNumber(weight)
      ? `${formatNumber(weight)} lb`
      : "Missing weight",
    weightSourceLabel: record.weightSummary?.label ?? "missing",
    dimensionsLabel: dimensions.label,
    volumeLabel: volume.label,
    assignedResourceId: box.assignedResourceId,
    assignedZoneId: box.assignedZoneId,
    assignmentLocked: box.assignmentLocked ?? false,
    assignmentLabel: assignment.label,
    assignmentState: assignment.state,
    missingFields,
    followUps,
    searchText: searchableText([
      box.code,
      box.label,
      box.description,
      box.room,
      box.destinationRoom,
      box.status,
      assignment.label,
      ...followUps,
    ]),
  };
}

function movableUnitFromLooseItem(
  item: InventoryItem,
  resourceNamesById: ReadonlyMap<string, string> | undefined,
  zoneNamesById: ReadonlyMap<string, string> | undefined,
): MovableUnit {
  const quantity = itemQuantity(item.quantity);
  const weight = multiplyOptional(
    item.actualWeightLb ?? item.estimatedWeightLb,
    quantity,
  );
  const dimensions = describeDimensions(item.dimensionsIn);
  const volume = describeVolume({
    estimatedVolumeCuFt:
      item.estimatedVolumeCuFt ?? item.estimatedPackedVolumeCuFt,
    dimensionsIn: item.dimensionsIn,
  });
  const totalVolume = multiplyOptional(volume.valueCuFt, quantity);
  const missingFields = missingMeasurementFields({
    hasWeight: isFiniteNumber(weight),
    dimensions,
    volume,
  });
  const assignment = describeLooseItemAssignment(
    item,
    resourceNamesById,
    zoneNamesById,
  );
  const followUps = [
    ...followUpsForMissingFields(missingFields),
    ...(item.needsReview ? ["review assumptions"] : []),
    ...(item.signals?.photoCount ? [] : ["add photo when convenient"]),
  ];

  return {
    id: `looseItem:${item._id}`,
    kind: "looseItem",
    recordId: item._id,
    label: "Loose item",
    name: item.name,
    status: item.status,
    roomLabel: item.room ?? "origin unset",
    destinationLabel:
      item.destinationRoom ??
      (item.destinationSpaceId ? "space assigned" : "destination unset"),
    itemCountLabel: `${item.quantity ?? 1} qty`,
    estimatedWeightLb: weight,
    estimatedVolumeCuFt: totalVolume,
    editableWeightLb: item.estimatedWeightLb ?? item.actualWeightLb,
    editableVolumeCuFt:
      item.estimatedVolumeCuFt ?? item.estimatedPackedVolumeCuFt,
    dimensionsIn: item.dimensionsIn,
    weightLabel: isFiniteNumber(weight)
      ? `${formatNumber(weight)} lb`
      : describeWeightRange(item),
    weightSourceLabel: isFiniteNumber(item.actualWeightLb)
      ? "actual"
      : isFiniteNumber(item.estimatedWeightLb)
        ? item.weightConfidence
          ? `estimated · ${item.weightConfidence}`
          : "estimated"
        : "missing",
    dimensionsLabel: dimensions.label,
    volumeLabel: formatVolumeLabelForQuantity(volume, totalVolume, quantity),
    assignedResourceId: item.assignedResourceId,
    assignedZoneId: item.assignedZoneId,
    assignmentLocked: item.assignmentLocked ?? false,
    assignmentLabel: assignment.label,
    assignmentState: assignment.state,
    missingFields,
    followUps,
    searchText: searchableText([
      item.name,
      item.description,
      item.room,
      item.destinationRoom,
      item.category,
      item.subcategory,
      item.status,
      assignment.label,
      ...(item.aiTags ?? []),
      ...followUps,
    ]),
  };
}

function describeBoxAssignment(
  box: Doc<"boxes">,
  resourceNamesById: ReadonlyMap<string, string> | undefined,
  zoneNamesById: ReadonlyMap<string, string> | undefined,
) {
  const resourceName = box.assignedResourceId
    ? resourceNamesById?.get(String(box.assignedResourceId))
    : undefined;
  const zoneName = box.assignedZoneId
    ? zoneNamesById?.get(String(box.assignedZoneId))
    : undefined;

  if (resourceName || zoneName) {
    return {
      state: "assigned" as const,
      label: [resourceName ?? "Assigned", zoneName].filter(Boolean).join(" / "),
    };
  }

  return { state: "unassigned" as const, label: "Needs load assignment" };
}

function describeLooseItemAssignment(
  item: InventoryItem,
  resourceNamesById: ReadonlyMap<string, string> | undefined,
  zoneNamesById: ReadonlyMap<string, string> | undefined,
) {
  const resourceName = item.assignedResourceId
    ? resourceNamesById?.get(String(item.assignedResourceId))
    : undefined;
  const zoneName = item.assignedZoneId
    ? zoneNamesById?.get(String(item.assignedZoneId))
    : undefined;

  if (item.assignedResourceId || item.assignedZoneId) {
    return {
      state: "assigned" as const,
      label: [resourceName ?? "Assigned", zoneName].filter(Boolean).join(" / "),
    };
  }

  if (item.signals?.assignedResourceNames.length) {
    return {
      state: "assigned" as const,
      label: [
        item.signals.assignedResourceNames.join(", "),
        item.signals.assignedZoneNames.join(", "),
      ]
        .filter(Boolean)
        .join(" / "),
    };
  }

  if (
    item.requiresPersonalTransport ||
    item.disposition === "personalTransport"
  ) {
    return { state: "owner" as const, label: "Personal transport" };
  }

  return { state: "unassigned" as const, label: "Needs load assignment" };
}

function describeDimensions(dimensions: DimensionsLike | undefined) {
  const parts = [
    dimensionPart(dimensions?.lengthIn),
    dimensionPart(dimensions?.widthIn),
    dimensionPart(dimensions?.heightIn),
  ];
  const complete = parts.every((part) => part !== "?");
  const hasAny = parts.some((part) => part !== "?");
  return {
    complete,
    hasAny,
    label: hasAny ? `${parts.join(" x ")} in` : "Missing dimensions",
  };
}

function describeVolume({
  estimatedVolumeCuFt,
  dimensionsIn,
}: {
  estimatedVolumeCuFt?: number;
  dimensionsIn?: DimensionsLike;
}) {
  if (isFiniteNumber(estimatedVolumeCuFt)) {
    return {
      available: true,
      valueCuFt: estimatedVolumeCuFt,
      label: `${formatNumber(estimatedVolumeCuFt)} cu ft`,
    };
  }
  const calculated = calculateMovableUnitVolumeCuFt(dimensionsIn);
  if (isFiniteNumber(calculated)) {
    return {
      available: true,
      valueCuFt: calculated,
      label: `${formatNumber(calculated)} cu ft from size`,
    };
  }
  return { available: false, valueCuFt: undefined, label: "Missing volume" };
}

function formatVolumeLabelForQuantity(
  volume: ReturnType<typeof describeVolume>,
  totalVolume: number | undefined,
  quantity: number,
) {
  if (!isFiniteNumber(totalVolume)) {
    return volume.label;
  }
  if (quantity > 1) {
    return `${formatNumber(totalVolume)} cu ft total`;
  }
  if (volume.label.includes("from size")) {
    return `${formatNumber(totalVolume)} cu ft from size`;
  }
  return `${formatNumber(totalVolume)} cu ft`;
}

function missingMeasurementFields({
  hasWeight,
  dimensions,
  volume,
}: {
  hasWeight: boolean;
  dimensions: ReturnType<typeof describeDimensions>;
  volume: ReturnType<typeof describeVolume>;
}) {
  const fields: MovableUnitMissingField[] = [];
  if (!hasWeight) fields.push("weight");
  if (!dimensions.complete) fields.push("dimensions");
  if (!volume.available) fields.push("volume");
  return fields;
}

function followUpsForMissingFields(fields: readonly MovableUnitMissingField[]) {
  return fields.map((field) => {
    switch (field) {
      case "weight":
        return "add weight";
      case "dimensions":
        return "add dimensions";
      case "volume":
        return "add volume";
    }
  });
}

function describeWeightRange(item: InventoryItem) {
  if (
    isFiniteNumber(item.estimatedWeightLowLb) &&
    isFiniteNumber(item.estimatedWeightHighLb)
  ) {
    return `${formatNumber(item.estimatedWeightLowLb)}-${formatNumber(item.estimatedWeightHighLb)} lb est.`;
  }
  return "Missing weight";
}

export function calculateMovableUnitVolumeCuFt(
  dimensions: DimensionsLike | undefined,
) {
  if (
    !isFiniteNumber(dimensions?.lengthIn) ||
    !isFiniteNumber(dimensions?.widthIn) ||
    !isFiniteNumber(dimensions?.heightIn)
  ) {
    return undefined;
  }
  return (
    Math.round(
      ((dimensions.lengthIn * dimensions.widthIn * dimensions.heightIn) /
        1728) *
        100,
    ) / 100
  );
}

function dimensionPart(value: number | undefined) {
  return isFiniteNumber(value) ? formatNumber(value) : "?";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function itemQuantity(value: number | undefined) {
  return isFiniteNumber(value) && value > 0 ? value : 1;
}

function multiplyOptional(value: number | undefined, multiplier: number) {
  return isFiniteNumber(value) ? value * multiplier : undefined;
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function searchableText(values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ").toLowerCase();
}
