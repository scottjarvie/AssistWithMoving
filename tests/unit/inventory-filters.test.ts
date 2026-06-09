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
    signals: {
      photoCount: 1,
      evidencePhotoCount: 0,
      boxCount: 0,
      assignedBoxCount: 0,
      assignmentCount: 0,
      boxCodes: [],
      assignedResourceNames: [],
      assignedZoneNames: [],
    },
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
    signals: {
      photoCount: 0,
      evidencePhotoCount: 0,
      boxCount: 1,
      assignedBoxCount: 0,
      assignmentCount: 0,
      boxCodes: ["B-002"],
      assignedResourceNames: [],
      assignedZoneNames: [],
    },
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
    signals: {
      photoCount: 0,
      evidencePhotoCount: 0,
      boxCount: 0,
      assignedBoxCount: 0,
      assignmentCount: 0,
      boxCodes: [],
      assignedResourceNames: [],
      assignedZoneNames: [],
    },
  },
  {
    name: "Toolbox",
    room: "Garage",
    category: "Tools",
    disposition: "mover",
    status: "packed",
    valueCents: 25000,
    serialNumber: "TB-100",
    highValue: true,
    needsReview: false,
    requiresPersonalTransport: false,
    planningDefaultKeys: [],
    signals: {
      photoCount: 3,
      evidencePhotoCount: 2,
      boxCount: 1,
      assignedBoxCount: 1,
      assignmentCount: 1,
      boxCodes: ["B-010"],
      assignedResourceNames: ["Military movers"],
      assignedZoneNames: ["High-value crate"],
    },
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
      "needsEvidence",
      "unboxed",
      "unassigned",
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
    expect(filterInventoryItems(items, "all", "military").map((item) => item.name))
      .toEqual(["Toolbox"]);
    expect(filterInventoryItems(items, "all", "B-002").map((item) => item.name))
      .toEqual(["Guest sheets"]);
  });

  it("filters evidence, box, and load planning gaps", () => {
    expect(
      filterInventoryItems(items, "needsEvidence", "").map((item) => item.name)
    ).toEqual(["Camera bag"]);
    expect(filterInventoryItems(items, "unboxed", "").map((item) => item.name))
      .toEqual(["Camera bag"]);
    expect(
      filterInventoryItems(items, "unassigned", "").map((item) => item.name)
    ).toEqual(["Guest sheets"]);
  });
});
