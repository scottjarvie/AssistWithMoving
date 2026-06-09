import {
  claimEvidenceScore,
  claimEvidenceWarnings,
  claimRelevanceReasons,
  claimSeverity,
  isClaimRelevantItem,
} from "./claimPacket";

export type ClaimCenterItem = {
  itemId: string;
  name: string;
  room?: string;
  category?: string;
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
  deletedAt?: number;
  updatedAt: number;
};

export type ClaimCenterPhoto = {
  photoId: string;
  itemId?: string;
  boxId?: string;
  claimId?: string;
  photoType: string;
  privacyLevel: string;
  verificationStatus: string;
  documentationProfileTypes: string[];
  archivedAt?: number;
};

export type ClaimCenterBoxMembership = {
  boxId: string;
  itemId: string;
};

export type ClaimCenterAuditEvent = {
  eventId: string;
  action: string;
  category: string;
  objectTable?: string;
  objectId?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
};

export type ClaimCenterInput = {
  items: ClaimCenterItem[];
  photos: ClaimCenterPhoto[];
  memberships: ClaimCenterBoxMembership[];
  auditEvents: ClaimCenterAuditEvent[];
};

export type ClaimCenterItemSummary = {
  itemId: string;
  name: string;
  room?: string;
  category?: string;
  status: string;
  condition: string;
  severity: "watch" | "medium" | "high";
  evidenceScore: number;
  evidenceWarnings: string[];
  relevanceReasons: string[];
  valueCents?: number;
  replacementValueCents?: number;
  photoCount: number;
  updatedAt: number;
};

export type ClaimCenterTimelineEvent = {
  eventId: string;
  action: string;
  label: string;
  detail: string;
  objectTable?: string;
  objectId?: string;
  itemId?: string;
  itemName?: string;
  createdAt: number;
};

const claimPhotoTypes = new Set([
  "condition",
  "damage",
  "serialNumber",
  "receipt",
]);

const claimChangedKeys = new Set([
  "status",
  "condition",
  "valueCents",
  "replacementValueCents",
  "highValue",
  "needsReview",
  "reviewFlags",
  "planningDefaultKeys",
  "serialNumber",
  "modelNumber",
]);

const claimPhotoChangedKeys = new Set([
  "claimId",
  "photoType",
  "privacyLevel",
  "verificationStatus",
  "documentationProfileTypes",
]);

export function summarizeClaimCenter(input: ClaimCenterInput) {
  const activeItems = input.items.filter(
    (item) => item.deletedAt === undefined && item.status !== "archived"
  );
  const activePhotos = input.photos.filter(
    (photo) => photo.archivedAt === undefined
  );
  const photosByItemId = groupPhotosByItemId(activePhotos);

  const claimItems = activeItems
    .filter((item) => isClaimRelevantItem(item))
    .map((item) => summarizeClaimItem(item, photosByItemId.get(item.itemId) ?? []));
  const claimItemIds = new Set(claimItems.map((item) => item.itemId));
  const claimPhotoIds = new Set(
    activePhotos
      .filter((photo) => isClaimPhoto(photo, claimItemIds))
      .map((photo) => photo.photoId)
  );
  const claimBoxIds = new Set(
    input.memberships
      .filter((membership) => claimItemIds.has(membership.itemId))
      .map((membership) => membership.boxId)
  );
  const itemNameById = new Map(
    activeItems.map((item) => [item.itemId, item.name])
  );

  return {
    summary: {
      claimItemCount: claimItems.length,
      highSeverityCount: claimItems.filter((item) => item.severity === "high")
        .length,
      damagedOrMissingCount: claimItems.filter((item) =>
        ["damaged", "missing"].includes(item.status)
      ).length,
      warningCount: claimItems.reduce(
        (total, item) => total + item.evidenceWarnings.length,
        0
      ),
      averageEvidenceScore: averageScore(claimItems),
      totalValueCents: claimItems.reduce(
        (total, item) => total + (item.valueCents ?? 0),
        0
      ),
      totalReplacementValueCents: claimItems.reduce(
        (total, item) => total + (item.replacementValueCents ?? 0),
        0
      ),
    },
    topItems: [...claimItems]
      .sort((left, right) => {
        const severityDelta =
          severityRank(right.severity) - severityRank(left.severity);
        return (
          severityDelta ||
          left.evidenceScore - right.evidenceScore ||
          right.evidenceWarnings.length - left.evidenceWarnings.length ||
          right.updatedAt - left.updatedAt
        );
      })
      .slice(0, 8),
    timeline: summarizeClaimTimeline({
      events: input.auditEvents,
      claimItemIds,
      claimPhotoIds,
      claimBoxIds,
      itemNameById,
    }).slice(0, 10),
  };
}

function summarizeClaimItem(
  item: ClaimCenterItem,
  photos: ClaimCenterPhoto[]
): ClaimCenterItemSummary {
  const counts = photoEvidenceCounts(photos);
  const evidenceInput = { ...item, ...counts };

  return {
    itemId: item.itemId,
    name: item.name,
    room: item.room,
    category: item.category,
    status: item.status,
    condition: item.condition,
    severity: claimSeverity(item),
    evidenceScore: claimEvidenceScore(evidenceInput),
    evidenceWarnings: claimEvidenceWarnings(evidenceInput),
    relevanceReasons: claimRelevanceReasons(item),
    valueCents: item.valueCents,
    replacementValueCents: item.replacementValueCents,
    photoCount: photos.length,
    updatedAt: item.updatedAt,
  };
}

function summarizeClaimTimeline({
  events,
  claimItemIds,
  claimPhotoIds,
  claimBoxIds,
  itemNameById,
}: {
  events: ClaimCenterAuditEvent[];
  claimItemIds: Set<string>;
  claimPhotoIds: Set<string>;
  claimBoxIds: Set<string>;
  itemNameById: Map<string, string>;
}) {
  return events
    .filter((event) =>
      isClaimTimelineEvent(event, claimItemIds, claimPhotoIds, claimBoxIds)
    )
    .sort((left, right) => right.createdAt - left.createdAt)
    .map((event) => {
      const itemId = claimItemIdForEvent(event, claimItemIds);
      return {
        eventId: event.eventId,
        action: event.action,
        label: timelineLabel(event),
        detail: timelineDetail(event),
        objectTable: event.objectTable,
        objectId: event.objectId,
        itemId,
        itemName: itemId ? itemNameById.get(itemId) : undefined,
        createdAt: event.createdAt,
      };
    });
}

function isClaimTimelineEvent(
  event: ClaimCenterAuditEvent,
  claimItemIds: Set<string>,
  claimPhotoIds: Set<string>,
  claimBoxIds: Set<string>
) {
  if (event.objectTable === "items" && event.objectId) {
    if (claimItemIds.has(event.objectId)) return true;
    return changedKeys(event).some((key) => claimChangedKeys.has(key));
  }

  if (event.objectTable === "itemPhotos" && event.objectId) {
    if (claimPhotoIds.has(event.objectId)) return true;
    return changedKeys(event).some((key) => claimPhotoChangedKeys.has(key));
  }

  if (event.objectTable === "boxes" && event.objectId) {
    if (claimBoxIds.has(event.objectId)) return true;
    const metadataItemId = stringMetadata(event, "itemId");
    return Boolean(metadataItemId && claimItemIds.has(metadataItemId));
  }

  return event.category === "documentation" && event.action.includes("claim");
}

function timelineLabel(event: ClaimCenterAuditEvent) {
  switch (event.action) {
    case "item.created":
      return "Item added";
    case "item.updated":
      return "Item updated";
    case "item.archived":
      return "Item archived";
    case "box.item_added":
      return "Item boxed";
    case "box.item_removed":
      return "Item removed from box";
    case "box.updated":
      return "Box updated";
    case "photo.metadata_updated":
      return "Photo evidence updated";
    case "photo.archived":
      return "Photo archived";
    case "photo.original_download_url_created":
      return "Original photo accessed";
    default:
      return event.action
        .split(".")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function timelineDetail(event: ClaimCenterAuditEvent) {
  const statusFrom = stringMetadata(event, "statusFrom");
  const statusTo = stringMetadata(event, "statusTo");
  if (statusFrom && statusTo && statusFrom !== statusTo) {
    return `Status changed from ${statusFrom} to ${statusTo}.`;
  }

  const keys = changedKeys(event).filter((key) => claimChangedKeys.has(key));
  if (keys.length) {
    return `Claim-relevant fields changed: ${keys.join(", ")}.`;
  }

  if (event.action === "box.item_added") {
    return "Claim-relevant item was connected to a box.";
  }
  if (event.action === "box.item_removed") {
    return "Claim-relevant item was removed from a box.";
  }
  if (event.objectTable === "itemPhotos") {
    return "Photo evidence metadata changed.";
  }

  return "Claim-relevant audit event recorded.";
}

function claimItemIdForEvent(
  event: ClaimCenterAuditEvent,
  claimItemIds: Set<string>
) {
  if (event.objectTable === "items" && event.objectId) {
    return claimItemIds.has(event.objectId) ? event.objectId : undefined;
  }

  const metadataItemId = stringMetadata(event, "itemId");
  return metadataItemId && claimItemIds.has(metadataItemId)
    ? metadataItemId
    : undefined;
}

function isClaimPhoto(photo: ClaimCenterPhoto, claimItemIds: Set<string>) {
  return (
    Boolean(photo.itemId && claimItemIds.has(photo.itemId)) ||
    Boolean(photo.claimId) ||
    photo.privacyLevel === "claimOnly" ||
    claimPhotoTypes.has(photo.photoType) ||
    photo.documentationProfileTypes.includes("insuranceClaim")
  );
}

function groupPhotosByItemId(photos: ClaimCenterPhoto[]) {
  const photosByItemId = new Map<string, ClaimCenterPhoto[]>();
  for (const photo of photos) {
    if (!photo.itemId) continue;
    photosByItemId.set(photo.itemId, [
      ...(photosByItemId.get(photo.itemId) ?? []),
      photo,
    ]);
  }
  return photosByItemId;
}

function photoEvidenceCounts(photos: ClaimCenterPhoto[]) {
  return {
    photoCount: photos.length,
    damagePhotoCount: photos.filter((photo) => photo.photoType === "damage")
      .length,
    conditionPhotoCount: photos.filter(
      (photo) => photo.photoType === "condition"
    ).length,
    receiptPhotoCount: photos.filter((photo) => photo.photoType === "receipt")
      .length,
  };
}

function changedKeys(event: ClaimCenterAuditEvent) {
  const keys = event.metadata?.changedKeys;
  return Array.isArray(keys)
    ? keys.filter((key): key is string => typeof key === "string")
    : [];
}

function stringMetadata(event: ClaimCenterAuditEvent, key: string) {
  const value = event.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function averageScore(items: ClaimCenterItemSummary[]) {
  if (!items.length) return 0;
  return Math.round(
    items.reduce((total, item) => total + item.evidenceScore, 0) /
      items.length
  );
}

function severityRank(severity: ClaimCenterItemSummary["severity"]) {
  switch (severity) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "watch":
      return 1;
  }
}
