import { describe, expect, it } from "vitest";

import {
  addDuplicateReviewFlag,
  duplicateReviewFlag,
  findInventoryDuplicateGroups,
  hasDuplicateReviewFlag,
  removeDuplicateReviewFlag,
} from "../../convex/lib/inventoryDuplicates";

const baseItem = {
  status: "active",
  deletedAt: undefined,
  room: "Garage",
  category: "Tools",
};

describe("inventory duplicate detection", () => {
  it("groups likely duplicates with descriptor and location noise", () => {
    const groups = findInventoryDuplicateGroups([
      { ...baseItem, _id: "item1", name: "Red toolbox" },
      { ...baseItem, _id: "item2", name: "Tool box" },
      { ...baseItem, _id: "item3", name: "Garage toolbox" },
      { ...baseItem, _id: "item4", name: "Camping lantern" },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].itemIds).toEqual(["item1", "item2", "item3"]);
    expect(groups[0].matchLabel).toBe("box tool");
    expect(groups[0].reasons).toContain(
      "Same core item terms after ignoring color/location words"
    );
  });

  it("uses room and category context for short names", () => {
    const groups = findInventoryDuplicateGroups([
      { ...baseItem, _id: "item1", name: "Chair", category: "Furniture" },
      { ...baseItem, _id: "item2", name: "Old chair", category: "Furniture" },
      {
        ...baseItem,
        _id: "item3",
        name: "Desk chair",
        room: "Office",
        category: "Furniture",
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].itemIds).toEqual(["item1", "item2"]);
    expect(groups[0].reasons).toContain(
      "Same room and category with matching item terms"
    );
  });

  it("ignores archived or deleted records", () => {
    const groups = findInventoryDuplicateGroups([
      { ...baseItem, _id: "item1", name: "Camera bag" },
      { ...baseItem, _id: "item2", name: "Camera bag", status: "archived" },
      {
        ...baseItem,
        _id: "item3",
        name: "Camera bag",
        deletedAt: 123,
      },
    ]);

    expect(groups).toEqual([]);
  });

  it("normalizes duplicate review flags", () => {
    const flags = addDuplicateReviewFlag([
      " high value ",
      duplicateReviewFlag.toUpperCase(),
    ]);

    expect(flags).toEqual(["high value", duplicateReviewFlag]);
    expect(hasDuplicateReviewFlag(flags)).toBe(true);
    expect(removeDuplicateReviewFlag(flags)).toEqual(["high value"]);
  });
});
