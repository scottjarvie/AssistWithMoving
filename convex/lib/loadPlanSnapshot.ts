import type { Doc, Id } from "../_generated/dataModel";
import { buildBoxContentsIndex } from "./boxContents";
import { resolveBoxWeight } from "./boxWeight";
import {
  boxVolumeCuFt,
  estimateItem,
  finitePercent,
  roundEstimate,
  sumEstimateValues,
  type EstimateValue,
} from "./estimateEngine";
import { isLooseMovableUnitRestItem } from "./restApi";
import type { visibilityForHouseholdRole } from "./roles";

type Visibility = ReturnType<typeof visibilityForHouseholdRole>;

export type LoadPlanSnapshotData = {
  householdId: Id<"households">;
  move: Doc<"moves"> | null;
  items: Doc<"items">[];
  boxItems: Doc<"boxItems">[];
  boxes: Doc<"boxes">[];
  photos: Doc<"itemPhotos">[];
  resources: Doc<"transportResources">[];
  zones: Doc<"transportZones">[];
  people: Doc<"movePeople">[];
};

type BoxCompositionData = Pick<
  LoadPlanSnapshotData,
  "items" | "boxItems" | "boxes"
>;
type ItemCompositionData = Pick<
  LoadPlanSnapshotData,
  | "householdId"
  | "items"
  | "boxItems"
  | "boxes"
  | "photos"
  | "resources"
  | "zones"
  | "people"
>;
type ResourceCompositionData = Pick<
  LoadPlanSnapshotData,
  "resources" | "zones"
>;
type EstimateCompositionData = Pick<
  LoadPlanSnapshotData,
  "move" | "items" | "boxItems" | "boxes" | "resources" | "zones"
>;

type MutableItemSignals = {
  photoCount: number;
  evidencePhotoCount: number;
  boxCount: number;
  assignedBoxCount: number;
  assignmentCount: number;
  boxCodes: string[];
  assignedResourceNames: string[];
  assignedZoneNames: string[];
};

type BucketTotals = {
  label: string;
  itemCount: number;
  estimatedWeightLb: number;
  estimatedVolumeCuFt: number;
  missingWeightCount: number;
  missingVolumeCount: number;
};

function compareIndexFields(
  firstValue: number,
  secondValue: number,
  firstCreationTime: number,
  secondCreationTime: number,
) {
  return firstValue - secondValue || firstCreationTime - secondCreationTime;
}

function newestItems(items: Doc<"items">[]) {
  return [...items].sort((first, second) =>
    compareIndexFields(
      second.updatedAt,
      first.updatedAt,
      second._creationTime,
      first._creationTime,
    ),
  );
}

function oldestItems(items: Doc<"items">[]) {
  return [...items].sort((first, second) =>
    compareIndexFields(
      first.updatedAt,
      second.updatedAt,
      first._creationTime,
      second._creationTime,
    ),
  );
}

function newestBoxes(boxes: Doc<"boxes">[]) {
  return [...boxes].sort((first, second) =>
    compareIndexFields(
      second.updatedAt,
      first.updatedAt,
      second._creationTime,
      first._creationTime,
    ),
  );
}

function oldestBoxes(boxes: Doc<"boxes">[]) {
  return [...boxes].sort((first, second) =>
    compareIndexFields(
      first.updatedAt,
      second.updatedAt,
      first._creationTime,
      second._creationTime,
    ),
  );
}

function sortedResources(resources: Doc<"transportResources">[]) {
  return [...resources].sort((first, second) =>
    compareIndexFields(
      first.sortOrder,
      second.sortOrder,
      first._creationTime,
      second._creationTime,
    ),
  );
}

function sortedZones(zones: Doc<"transportZones">[]) {
  return [...zones].sort((first, second) =>
    compareIndexFields(
      first.sortOrder,
      second.sortOrder,
      first._creationTime,
      second._creationTime,
    ),
  );
}

export function redactItemForVisibility<Item extends Doc<"items">>(
  item: Item,
  visibility: Visibility,
) {
  return {
    ...item,
    valueCents: visibility.estimatedValue ? item.valueCents : undefined,
    replacementValueCents: visibility.estimatedValue
      ? item.replacementValueCents
      : undefined,
    serialNumber: visibility.serialNumber ? item.serialNumber : undefined,
    modelNumber: visibility.serialNumber ? item.modelNumber : undefined,
    privateNotes: visibility.privateNotes ? item.privateNotes : undefined,
    // AI/research prose frequently restates market value, purchase price, and
    // researched serials, so it follows the same visibility wall.
    aiSummary: visibility.research ? item.aiSummary : undefined,
    researchSummary: visibility.research ? item.researchSummary : undefined,
    researchSources: visibility.research ? item.researchSources : undefined,
    researchNotes: visibility.research ? item.researchNotes : undefined,
  };
}

function defaultItemSignals(): MutableItemSignals {
  return {
    photoCount: 0,
    evidencePhotoCount: 0,
    boxCount: 0,
    assignedBoxCount: 0,
    assignmentCount: 0,
    boxCodes: [],
    assignedResourceNames: [],
    assignedZoneNames: [],
  };
}

function signalsForItem(
  signalsByItemId: Map<string, MutableItemSignals>,
  itemId: Id<"items">,
) {
  const key = String(itemId);
  const existing = signalsByItemId.get(key);
  if (existing) return existing;
  const next = defaultItemSignals();
  signalsByItemId.set(key, next);
  return next;
}

function pushUnique(values: string[], value: string | undefined, limit = 4) {
  if (!value || values.includes(value) || values.length >= limit) return;
  values.push(value);
}

function isEvidencePhoto(photo: Doc<"itemPhotos">) {
  return (
    photo.claimId ||
    photo.privacyLevel === "claimOnly" ||
    ["condition", "damage", "serialNumber", "receipt"].includes(
      photo.photoType,
    ) ||
    photo.documentationProfileTypes.some((type) =>
      ["insuranceClaim", "pcsMove", "movingCompany"].includes(type),
    )
  );
}

export function composeBoxRows(
  data: BoxCompositionData,
  includeArchived = false,
) {
  const contentsByBox = buildBoxContentsIndex(data.boxItems, data.items);

  return newestBoxes(data.boxes)
    .filter((box) => includeArchived || !box.archivedAt)
    .map((box) => {
      const contents = contentsByBox.get(box._id) ?? [];
      const itemCount = contents.reduce(
        (sum, entry) => sum + entry.membership.quantity,
        0,
      );
      const contentsEstimatedWeightLb = sumEstimateValues(
        contents.map((entry) =>
          estimateItem({
            ...entry.item,
            quantity: entry.membership.quantity,
          }).weight,
        ),
      );
      const weightSummary = resolveBoxWeight({
        actualWeightLb: box.actualWeightLb,
        estimatedWeightLb: box.estimatedWeightLb,
        contentsEstimatedWeightLb,
      });

      return {
        box,
        contents,
        itemCount,
        contentsEstimatedWeightLb,
        weightSummary,
      };
    });
}

export function composeItemsWithSignals(
  data: ItemCompositionData,
  visibility: Visibility,
) {
  const visibleItems = newestItems(data.items);
  const visibleItemIds = new Set(visibleItems.map((item) => String(item._id)));
  const boxById = new Map(
    data.boxes
      .filter(
        (box) => box.householdId === data.householdId && !box.archivedAt,
      )
      .map((box) => [String(box._id), box]),
  );
  const resourceById = new Map(
    data.resources
      .filter(
        (resource) =>
          resource.householdId === data.householdId && !resource.archivedAt,
      )
      .map((resource) => [String(resource._id), resource]),
  );
  const zoneById = new Map(
    data.zones
      .filter(
        (zone) => zone.householdId === data.householdId && !zone.archivedAt,
      )
      .map((zone) => [String(zone._id), zone]),
  );
  const ownerContactById = new Map(
    data.people
      .filter(
        (person) =>
          person.householdId === data.householdId && !person.archivedAt,
      )
      .map((person) => [
        String(person._id),
        {
          _id: person._id,
          name: person.name,
          role: person.role,
        },
      ]),
  );
  const signalsByItemId = new Map<string, MutableItemSignals>();

  for (const photo of data.photos) {
    if (
      photo.householdId !== data.householdId ||
      photo.archivedAt ||
      !photo.itemId ||
      !visibleItemIds.has(String(photo.itemId))
    ) {
      continue;
    }
    const signals = signalsForItem(signalsByItemId, photo.itemId);
    signals.photoCount += 1;
    if (isEvidencePhoto(photo)) {
      signals.evidencePhotoCount += 1;
    }
  }

  for (const membership of data.boxItems) {
    if (
      membership.householdId !== data.householdId ||
      !visibleItemIds.has(String(membership.itemId))
    ) {
      continue;
    }
    const box = boxById.get(String(membership.boxId));
    if (!box) continue;
    const signals = signalsForItem(signalsByItemId, membership.itemId);
    signals.boxCount += 1;
    pushUnique(signals.boxCodes, box.code);

    if (box.assignedResourceId || box.assignedZoneId) {
      signals.assignedBoxCount += 1;
      signals.assignmentCount += 1;
      const resource = box.assignedResourceId
        ? resourceById.get(String(box.assignedResourceId))
        : null;
      const zone = box.assignedZoneId
        ? zoneById.get(String(box.assignedZoneId))
        : null;
      pushUnique(signals.assignedResourceNames, resource?.name);
      pushUnique(signals.assignedZoneNames, zone?.name);
    }
  }

  for (const item of visibleItems) {
    if (!item.assignedResourceId && !item.assignedZoneId) continue;
    const signals = signalsForItem(signalsByItemId, item._id);
    signals.assignmentCount += 1;
    const resource = item.assignedResourceId
      ? resourceById.get(String(item.assignedResourceId))
      : null;
    const zone = item.assignedZoneId
      ? zoneById.get(String(item.assignedZoneId))
      : null;
    pushUnique(signals.assignedResourceNames, resource?.name);
    pushUnique(signals.assignedZoneNames, zone?.name);
  }

  return visibleItems.map((item) => ({
    ...redactItemForVisibility(item, visibility),
    signals: signalsByItemId.get(String(item._id)) ?? defaultItemSignals(),
    ownerContact: item.ownerPersonId
      ? ownerContactById.get(String(item.ownerPersonId))
      : undefined,
  }));
}

export function composeResourcesWithZones(data: ResourceCompositionData) {
  const zonesByResource = new Map<
    Id<"transportResources">,
    Doc<"transportZones">[]
  >();
  for (const zone of sortedZones(data.zones)) {
    if (zone.archivedAt) continue;
    const zones = zonesByResource.get(zone.resourceId);
    if (zones) {
      zones.push(zone);
    } else {
      zonesByResource.set(zone.resourceId, [zone]);
    }
  }

  return sortedResources(data.resources)
    .filter((resource) => !resource.archivedAt)
    .map((resource) => ({
      resource,
      zones: zonesByResource.get(resource._id) ?? [],
    }));
}

function emptyBucket(label: string): BucketTotals {
  return {
    label,
    itemCount: 0,
    estimatedWeightLb: 0,
    estimatedVolumeCuFt: 0,
    missingWeightCount: 0,
    missingVolumeCount: 0,
  };
}

function addToBucket(
  bucket: BucketTotals,
  estimate: {
    weight?: EstimateValue;
    volume?: EstimateValue;
    warnings: string[];
  },
) {
  bucket.itemCount += 1;
  bucket.estimatedWeightLb = roundEstimate(
    bucket.estimatedWeightLb + (estimate.weight?.value ?? 0),
  );
  bucket.estimatedVolumeCuFt = roundEstimate(
    bucket.estimatedVolumeCuFt + (estimate.volume?.value ?? 0),
  );
  if (estimate.warnings.includes("missingWeightEstimate")) {
    bucket.missingWeightCount += 1;
  }
  if (estimate.warnings.includes("missingVolumeEstimate")) {
    bucket.missingVolumeCount += 1;
  }
}

function bucketFor(map: Map<string, BucketTotals>, key: string, label = key) {
  const existing = map.get(key);
  if (existing) return existing;
  const bucket = emptyBucket(label);
  map.set(key, bucket);
  return bucket;
}

export function composeEstimateReport(data: EstimateCompositionData) {
  const items = oldestItems(data.items);
  const boxes = oldestBoxes(data.boxes);
  const resources = sortedResources(data.resources);
  const zones = sortedZones(data.zones);
  const activeItems = items.filter((item) => !item.deletedAt);
  const activeBoxes = boxes.filter((box) => !box.archivedAt);
  const contentsByBox = buildBoxContentsIndex(data.boxItems, items);
  const activeBoxIds = new Set(activeBoxes.map((box) => String(box._id)));
  const boxedItemIds = new Set(
    data.boxItems
      .filter((membership) => activeBoxIds.has(String(membership.boxId)))
      .map((membership) => String(membership.itemId)),
  );
  const roomBuckets = new Map<string, BucketTotals>();
  const dispositionBuckets = new Map<string, BucketTotals>();
  const ownerBuckets = new Map<string, BucketTotals>();
  const itemEstimates = activeItems.map((item) => {
    const estimate = estimateItem(item);
    addToBucket(bucketFor(roomBuckets, item.room ?? "unassigned"), estimate);
    addToBucket(bucketFor(dispositionBuckets, item.disposition), estimate);
    addToBucket(
      bucketFor(ownerBuckets, item.ownerPersonId ?? "unassigned"),
      estimate,
    );
    return {
      itemId: item._id,
      name: item.name,
      room: item.room,
      disposition: item.disposition,
      estimate,
    };
  });

  const looseItemReports = activeItems
    .filter(
      (item) =>
        item.status !== "archived" &&
        !boxedItemIds.has(String(item._id)) &&
        isLooseMovableUnitRestItem(item),
    )
    .map((item) => {
      const estimate = estimateItem(item);
      return {
        itemId: item._id,
        name: item.name,
        room: item.room,
        destinationRoom: item.destinationRoom,
        status: item.status,
        disposition: item.disposition,
        quantity: item.quantity ?? 1,
        requiresPersonalTransport: item.requiresPersonalTransport,
        assignedResourceId: item.assignedResourceId,
        assignedZoneId: item.assignedZoneId,
        estimatedWeightLb: roundEstimate(estimate.weight?.value ?? 0),
        estimatedVolumeCuFt: roundEstimate(estimate.volume?.value ?? 0),
        warnings: estimate.warnings,
      };
    });

  const boxReports = activeBoxes.map((box) => {
    const contents = contentsByBox.get(box._id) ?? [];
    const contentEstimates = contents.map(({ item, membership }) =>
      estimateItem({ ...item, quantity: membership.quantity }),
    );
    const contentsWeight = sumEstimateValues(
      contentEstimates.map((estimate) => estimate.weight),
    );
    const contentsVolume = sumEstimateValues(
      contentEstimates.map((estimate) => estimate.volume),
    );
    const weightSummary = resolveBoxWeight({
      actualWeightLb: box.actualWeightLb,
      estimatedWeightLb: box.estimatedWeightLb,
      contentsEstimatedWeightLb: contentsWeight,
    });
    const estimatedWeightLb = weightSummary.valueLb ?? 0;
    const estimatedVolumeCuFt = boxVolumeCuFt(box) ?? contentsVolume;
    const warnings: string[] = [];
    if (weightSummary.source === "missing") {
      warnings.push("missingBoxWeightEstimate");
    }
    if (boxVolumeCuFt(box) === undefined && contentsVolume === 0) {
      warnings.push("missingBoxVolumeEstimate");
    }
    if (estimatedWeightLb > 65) warnings.push("overweightBox");

    return {
      boxId: box._id,
      code: box.code,
      label: box.label,
      room: box.room,
      assignedResourceId: box.assignedResourceId,
      assignedZoneId: box.assignedZoneId,
      assignmentLocked: box.assignmentLocked ?? false,
      assignmentOverrideReason: box.assignmentOverrideReason,
      assignmentWarnings: box.assignmentWarnings ?? [],
      assignmentHardBlocks: box.assignmentHardBlocks ?? [],
      itemCount: contents.reduce(
        (sum, entry) => sum + entry.membership.quantity,
        0,
      ),
      estimatedWeightLb: roundEstimate(estimatedWeightLb),
      weightSource: weightSummary.source,
      weightSourceLabel: weightSummary.label,
      weightSummary,
      estimatedVolumeCuFt: roundEstimate(estimatedVolumeCuFt),
      warnings,
    };
  });

  const resourceReports = resources.map((resource) => {
    const assignedBoxes = boxReports.filter(
      (box) => box.assignedResourceId === resource._id,
    );
    const assignedLooseItems = looseItemReports.filter(
      (item) => item.assignedResourceId === resource._id,
    );
    const estimatedWeightLb = roundEstimate(
      assignedBoxes.reduce((sum, box) => sum + box.estimatedWeightLb, 0) +
        assignedLooseItems.reduce(
          (sum, item) => sum + item.estimatedWeightLb,
          0,
        ),
    );
    const estimatedVolumeCuFt = roundEstimate(
      assignedBoxes.reduce((sum, box) => sum + box.estimatedVolumeCuFt, 0) +
        assignedLooseItems.reduce(
          (sum, item) => sum + item.estimatedVolumeCuFt,
          0,
        ),
    );
    return {
      resourceId: resource._id,
      name: resource.name,
      type: resource.type,
      estimatedWeightLb,
      estimatedVolumeCuFt,
      assignedBoxCount: assignedBoxes.length,
      assignedLooseItemCount: assignedLooseItems.length,
      assignedUnitCount: assignedBoxes.length + assignedLooseItems.length,
      maxWeightLb: resource.capacity.maxWeightLb,
      maxVolumeCuFt: resource.capacity.maxVolumeCuFt,
      weightPercent: finitePercent(
        estimatedWeightLb,
        resource.capacity.maxWeightLb,
        resource.capacity.weightIsUnlimited,
      ),
      volumePercent: finitePercent(
        estimatedVolumeCuFt,
        resource.capacity.maxVolumeCuFt,
        resource.capacity.volumeIsUnlimited,
      ),
    };
  });

  const zoneReports = zones.map((zone) => {
    const assignedBoxes = boxReports.filter(
      (box) => box.assignedZoneId === zone._id,
    );
    const assignedLooseItems = looseItemReports.filter(
      (item) => item.assignedZoneId === zone._id,
    );
    return {
      zoneId: zone._id,
      resourceId: zone.resourceId,
      name: zone.name,
      estimatedWeightLb: roundEstimate(
        assignedBoxes.reduce((sum, box) => sum + box.estimatedWeightLb, 0) +
          assignedLooseItems.reduce(
            (sum, item) => sum + item.estimatedWeightLb,
            0,
          ),
      ),
      estimatedVolumeCuFt: roundEstimate(
        assignedBoxes.reduce((sum, box) => sum + box.estimatedVolumeCuFt, 0) +
          assignedLooseItems.reduce(
            (sum, item) => sum + item.estimatedVolumeCuFt,
            0,
          ),
      ),
      assignedBoxCount: assignedBoxes.length,
      assignedLooseItemCount: assignedLooseItems.length,
      assignedUnitCount: assignedBoxes.length + assignedLooseItems.length,
    };
  });

  const totalEstimatedWeightLb = sumEstimateValues(
    itemEstimates.map((item) => item.estimate.weight),
  );
  const totalEstimatedVolumeCuFt = sumEstimateValues(
    itemEstimates.map((item) => item.estimate.volume),
  );

  return {
    moveAllowanceLb: data.move?.moveLevelWeightAllowanceLb,
    totalEstimatedWeightLb,
    totalEstimatedVolumeCuFt,
    missingWeightCount: itemEstimates.filter((item) =>
      item.estimate.warnings.includes("missingWeightEstimate"),
    ).length,
    missingVolumeCount: itemEstimates.filter((item) =>
      item.estimate.warnings.includes("missingVolumeEstimate"),
    ).length,
    roomTotals: Array.from(roomBuckets.values()),
    dispositionTotals: Array.from(dispositionBuckets.values()),
    ownerTotals: Array.from(ownerBuckets.values()),
    boxReports,
    looseItemReports,
    resourceReports,
    zoneReports,
    itemEstimates: itemEstimates.slice(0, 100),
  };
}

export function composeLoadPlanSnapshot(
  data: LoadPlanSnapshotData,
  visibility: Visibility,
) {
  return {
    boxes: composeBoxRows(data),
    items: composeItemsWithSignals(
      { ...data, items: data.items.filter((item) => !item.deletedAt) },
      visibility,
    ),
    resourcesWithZones: composeResourcesWithZones(data),
    report: composeEstimateReport(data),
  };
}
