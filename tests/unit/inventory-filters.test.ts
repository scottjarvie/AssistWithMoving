import { describe, expect, it } from "vitest";

import {
  filterInventoryItems,
  inventorySavedFilters,
  type InventoryFilterableItem,
} from "@/lib/inventory-filters";

const items: InventoryFilterableItem[] = [
  {
    name: "Camera bag",
    room: "Office",
    category: "Electronics",
    disposition: "personalTransport",
    status: "active",
    highValue: true,
    needsReview: false,
    requiresPersonalTransport: true,
    planningDefaultKeys: ["doNotLetMoversTouch"],
  },
  {
    name: "Guest sheets",
    room: "Bedroom",
    category: "Linens",
    disposition: "take",
    status: "packed",
    highValue: false,
    needsReview: false,
    requiresPersonalTransport: false,
    planningDefaultKeys: ["firstNight"],
  },
  {
    name: "Old desk",
    room: "Office",
    category: "Furniture",
    disposition: "donate",
    status: "draft",
    highValue: false,
    needsReview: true,
    requiresPersonalTransport: false,
    planningDefaultKeys: [],
  },
];

describe("inventory filters", () => {
  it("defines saved views used by the table", () => {
    expect(inventorySavedFilters.map((filter) => filter.key)).toEqual([
      "all",
      "needsReview",
      "highValue",
      "personalTransport",
      "firstNight",
      "sellDonateDumpFree",
      "packedOrLoaded",
    ]);
  });

  it("filters review and draft items", () => {
    expect(filterInventoryItems(items, "needsReview", "").map((item) => item.name))
      .toEqual(["Old desk"]);
  });

  it("filters personal transport and first-night items", () => {
    expect(
      filterInventoryItems(items, "personalTransport", "").map(
        (item) => item.name
      )
    ).toEqual(["Camera bag"]);
    expect(filterInventoryItems(items, "firstNight", "").map((item) => item.name))
      .toEqual(["Guest sheets"]);
  });

  it("combines saved filters with search", () => {
    expect(filterInventoryItems(items, "all", "office").map((item) => item.name))
      .toEqual(["Camera bag", "Old desk"]);
    expect(
      filterInventoryItems(items, "sellDonateDumpFree", "desk").map(
        (item) => item.name
      )
    ).toEqual(["Old desk"]);
  });
});
