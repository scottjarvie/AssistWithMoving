export type InventoryFilterKey =
  | "all"
  | "needsReview"
  | "highValue"
  | "personalTransport"
  | "firstNight"
  | "sellDonateDumpFree"
  | "packedOrLoaded"
  | "needsEvidence"
  | "unboxed"
  | "unassigned";

export type InventoryOwnerFilter = "all" | "unassigned" | string;

export type InventoryFilterableItem = {
  name: string;
  ownerPersonId?: string;
  room?: string;
  category?: string;
  disposition: string;
  status: string;
  ownerContact?: {
    name: string;
    role: string;
  };
  valueCents?: number;
  replacementValueCents?: number;
  serialNumber?: string;
  highValue: boolean;
  needsReview: boolean;
  agentLabel?: string;
  aiConfidenceScore?: number;
  requiresPersonalTransport: boolean;
  planningDefaultKeys: string[];
  signals?: {
    photoCount: number;
    evidencePhotoCount: number;
    boxCount: number;
    assignedBoxCount: number;
    assignmentCount: number;
    boxCodes: string[];
    assignedResourceNames: string[];
    assignedZoneNames: string[];
  };
};

export const inventorySavedFilters: {
  key: InventoryFilterKey;
  label: string;
  description: string;
}[] = [
  {
    key: "all",
    label: "All items",
    description: "Complete visible inventory.",
  },
  {
    key: "needsReview",
    label: "Needs review",
    description: "Drafts, AI items, or records requiring human review.",
  },
  {
    key: "highValue",
    label: "High value",
    description: "Items needing stronger evidence and privacy posture.",
  },
  {
    key: "personalTransport",
    label: "Personal transport",
    description: "Items that should stay with the owner unless overridden.",
  },
  {
    key: "firstNight",
    label: "First night",
    description: "Items needed immediately after arrival.",
  },
  {
    key: "sellDonateDumpFree",
    label: "Exit plan",
    description: "Sell, donate, dump, or free-giveaway items.",
  },
  {
    key: "packedOrLoaded",
    label: "Packed / loaded",
    description: "Items already packed, staged, or loaded.",
  },
  {
    key: "needsEvidence",
    label: "Needs evidence",
    description: "High-value, serialed, or protected items missing evidence photos.",
  },
  {
    key: "unboxed",
    label: "Unboxed",
    description: "Keep/mover/storage items not yet connected to any box.",
  },
  {
    key: "unassigned",
    label: "Unassigned load",
    description: "Packed items or boxes that have not been assigned to a resource.",
  },
];

export function filterInventoryItems<TItem extends InventoryFilterableItem>(
  items: TItem[],
  filterKey: InventoryFilterKey,
  search: string
) {
  const normalizedSearch = search.trim().toLowerCase();

  return items.filter((item) => {
    const matchesSearch = normalizedSearch
      ? [
          item.name,
          item.room,
          item.category,
          item.disposition,
          item.status,
          item.ownerContact?.name,
          item.ownerContact?.role,
          item.agentLabel,
          ...(item.signals?.boxCodes ?? []),
          ...(item.signals?.assignedResourceNames ?? []),
          ...(item.signals?.assignedZoneNames ?? []),
        ]
          .filter((value): value is string => typeof value === "string")
          .some((value) => value.toLowerCase().includes(normalizedSearch))
      : true;

    if (!matchesSearch) {
      return false;
    }

    switch (filterKey) {
      case "all":
        return true;
      case "needsReview":
        return (
          item.needsReview ||
          item.status === "draft" ||
          (typeof item.aiConfidenceScore === "number" &&
            item.aiConfidenceScore < 0.7)
        );
      case "highValue":
        return item.highValue;
      case "personalTransport":
        return (
          item.requiresPersonalTransport ||
          item.disposition === "personalTransport" ||
          item.planningDefaultKeys.includes("doNotLetMoversTouch")
        );
      case "firstNight":
        return item.planningDefaultKeys.includes("firstNight");
      case "sellDonateDumpFree":
        return ["sell", "donate", "dump", "free"].includes(item.disposition);
      case "packedOrLoaded":
        return ["packed", "staged", "loaded"].includes(item.status);
      case "needsEvidence": {
        const hasEvidenceTrigger =
          item.highValue ||
          Boolean(item.valueCents || item.replacementValueCents) ||
          Boolean(item.serialNumber) ||
          item.requiresPersonalTransport ||
          item.planningDefaultKeys.includes("doNotLetMoversTouch");
        return hasEvidenceTrigger && (item.signals?.evidencePhotoCount ?? 0) === 0;
      }
      case "unboxed":
        return (
          ["take", "mover", "personalTransport", "storage"].includes(
            item.disposition
          ) && (item.signals?.boxCount ?? 0) === 0
        );
      case "unassigned":
        return (
          ["packed", "staged", "loaded"].includes(item.status) ||
          (item.signals?.boxCount ?? 0) > 0
        )
          ? (item.signals?.assignmentCount ?? 0) === 0
          : false;
    }
  });
}

export function filterInventoryItemsByOwner<
  TItem extends InventoryFilterableItem,
>(items: TItem[], ownerFilter: InventoryOwnerFilter) {
  if (ownerFilter === "all") {
    return items;
  }

  return items.filter((item) => {
    if (ownerFilter === "unassigned") {
      return !item.ownerPersonId;
    }

    return item.ownerPersonId === ownerFilter;
  });
}
