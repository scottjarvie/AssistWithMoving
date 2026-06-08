export type InventoryFilterKey =
  | "all"
  | "needsReview"
  | "highValue"
  | "personalTransport"
  | "firstNight"
  | "sellDonateDumpFree"
  | "packedOrLoaded";

export type InventoryFilterableItem = {
  name: string;
  room?: string;
  category?: string;
  disposition: string;
  status: string;
  highValue: boolean;
  needsReview: boolean;
  requiresPersonalTransport: boolean;
  planningDefaultKeys: string[];
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
];

export function filterInventoryItems<TItem extends InventoryFilterableItem>(
  items: TItem[],
  filterKey: InventoryFilterKey,
  search: string
) {
  const normalizedSearch = search.trim().toLowerCase();

  return items.filter((item) => {
    const matchesSearch = normalizedSearch
      ? [item.name, item.room, item.category, item.disposition, item.status]
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
        return item.needsReview || item.status === "draft";
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
    }
  });
}
