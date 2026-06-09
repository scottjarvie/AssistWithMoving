export type EvidenceDensityItem = {
  itemId: string;
  name: string;
  room?: string;
  category?: string;
  disposition: string;
  status: string;
  condition: string;
  valueCents?: number;
  replacementValueCents?: number;
  highValue: boolean;
  needsReview: boolean;
  requiresPersonalTransport: boolean;
  planningDefaultKeys: string[];
  deletedAt?: number;
};

export type EvidenceDensityBox = {
  boxId: string;
  archivedAt?: number;
};

export type EvidenceDensityMembership = {
  boxId: string;
  itemId: string;
};

export type EvidenceDensityPhoto = {
  itemId?: string;
  photoType: string;
  archivedAt?: number;
};

export type EvidenceDensityInput = {
  items: EvidenceDensityItem[];
  boxes: EvidenceDensityBox[];
  memberships: EvidenceDensityMembership[];
  photos: EvidenceDensityPhoto[];
};

export type EvidenceDensityFactorKey =
  | "itemPhoto"
  | "serialPhoto"
  | "condition"
  | "value"
  | "receiptPhoto"
  | "boxAssociation";

export type EvidenceDensityFactor = {
  key: EvidenceDensityFactorKey;
  label: string;
  satisfied: boolean;
};

export type EvidenceDensityScore = {
  itemId: string;
  name: string;
  room?: string;
  category?: string;
  priority: "standard" | "watch" | "high";
  score: number;
  satisfiedCount: number;
  totalFactors: number;
  factors: EvidenceDensityFactor[];
  gaps: string[];
};

const evidencePriorityKeys = new Set([
  "doNotLetMoversTouch",
  "highValue",
  "documents",
  "medication",
  "sensitive",
  "irreplaceable",
  "restrictedReview",
]);

const factorLabels: Record<EvidenceDensityFactorKey, string> = {
  itemPhoto: "Item photo",
  serialPhoto: "Serial photo",
  condition: "Condition documented",
  value: "Value documented",
  receiptPhoto: "Receipt photo",
  boxAssociation: "Box association",
};

export function summarizeEvidenceDensity(input: EvidenceDensityInput) {
  const activeItems = input.items.filter(
    (item) => item.deletedAt === undefined && item.status !== "archived"
  );
  const activeBoxIds = new Set(
    input.boxes
      .filter((box) => box.archivedAt === undefined)
      .map((box) => box.boxId)
  );
  const activeMemberships = input.memberships.filter((membership) =>
    activeBoxIds.has(membership.boxId)
  );
  const itemIdsWithBoxes = new Set(
    activeMemberships.map((membership) => membership.itemId)
  );
  const photosByItemId = groupPhotosByItemId(
    input.photos.filter((photo) => photo.archivedAt === undefined)
  );

  const items = activeItems.map((item) =>
    scoreEvidenceDensityItem({
      item,
      photos: photosByItemId.get(item.itemId) ?? [],
      hasBoxAssociation: itemIdsWithBoxes.has(item.itemId),
    })
  );
  const priorityItems = items.filter((item) => item.priority !== "standard");
  const thinPriorityItems = priorityItems.filter((item) => item.score < 67);

  return {
    items,
    topGaps: [...items]
      .filter((item) => item.gaps.length > 0)
      .sort((left, right) => {
        const priorityDelta =
          priorityRank(right.priority) - priorityRank(left.priority);
        return priorityDelta || left.score - right.score;
      })
      .slice(0, 8),
    summary: {
      itemCount: items.length,
      priorityItemCount: priorityItems.length,
      thinPriorityItemCount: thinPriorityItems.length,
      averageScore: averageScore(items),
      priorityAverageScore: averageScore(priorityItems),
      completeItemCount: items.filter((item) => item.score === 100).length,
      zeroEvidenceItemCount: items.filter((item) => item.satisfiedCount === 0)
        .length,
    },
    gapCounts: countGaps(items),
  };
}

export function scoreEvidenceDensityItem({
  item,
  photos,
  hasBoxAssociation,
}: {
  item: EvidenceDensityItem;
  photos: EvidenceDensityPhoto[];
  hasBoxAssociation: boolean;
}): EvidenceDensityScore {
  const photoTypes = new Set(photos.map((photo) => photo.photoType));
  const factors: EvidenceDensityFactor[] = [
    factor("itemPhoto", photoTypes.has("item")),
    factor("serialPhoto", photoTypes.has("serialNumber")),
    factor(
      "condition",
      item.condition !== "unknown" ||
        photoTypes.has("condition") ||
        photoTypes.has("damage")
    ),
    factor(
      "value",
      typeof item.valueCents === "number" ||
        typeof item.replacementValueCents === "number"
    ),
    factor("receiptPhoto", photoTypes.has("receipt")),
    factor("boxAssociation", hasBoxAssociation),
  ];
  const satisfiedCount = factors.filter((entry) => entry.satisfied).length;

  return {
    itemId: item.itemId,
    name: item.name,
    room: item.room,
    category: item.category,
    priority: evidencePriority(item),
    score: Math.round((satisfiedCount / factors.length) * 100),
    satisfiedCount,
    totalFactors: factors.length,
    factors,
    gaps: factors
      .filter((entry) => !entry.satisfied)
      .map((entry) => entry.label),
  };
}

function factor(key: EvidenceDensityFactorKey, satisfied: boolean) {
  return {
    key,
    label: factorLabels[key],
    satisfied,
  };
}

function evidencePriority(item: EvidenceDensityItem) {
  const hasEvidenceKey = item.planningDefaultKeys.some((key) =>
    evidencePriorityKeys.has(key)
  );
  const value = Math.max(item.valueCents ?? 0, item.replacementValueCents ?? 0);

  if (
    item.status === "missing" ||
    item.status === "damaged" ||
    item.condition === "damaged" ||
    item.highValue ||
    value >= 100000
  ) {
    return "high";
  }

  if (
    item.needsReview ||
    item.requiresPersonalTransport ||
    hasEvidenceKey ||
    value > 0
  ) {
    return "watch";
  }

  return "standard";
}

function groupPhotosByItemId(photos: EvidenceDensityPhoto[]) {
  const photosByItemId = new Map<string, EvidenceDensityPhoto[]>();
  for (const photo of photos) {
    if (!photo.itemId) continue;
    photosByItemId.set(photo.itemId, [
      ...(photosByItemId.get(photo.itemId) ?? []),
      photo,
    ]);
  }
  return photosByItemId;
}

function averageScore(items: EvidenceDensityScore[]) {
  if (!items.length) return 0;
  return Math.round(
    items.reduce((total, item) => total + item.score, 0) / items.length
  );
}

function countGaps(items: EvidenceDensityScore[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const gap of item.gaps) {
      counts.set(gap, (counts.get(gap) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label)
    );
}

function priorityRank(priority: EvidenceDensityScore["priority"]) {
  switch (priority) {
    case "high":
      return 2;
    case "watch":
      return 1;
    case "standard":
      return 0;
  }
}
