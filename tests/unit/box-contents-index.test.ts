import { describe, expect, it } from "vitest";

import { buildBoxContentsIndex } from "../../convex/lib/boxContents";

type FixtureMembership = {
  _id: string;
  boxId: string;
  itemId: string;
  quantity: number;
};

type FixtureItem = {
  _id: string;
  name: string;
  deletedAt?: number;
};

const boxIds = ["box-empty", "box-a", "box-b"] as const;

// This is the insertion order returned by either by_move or by_box (within a
// single box) because both indexes use Convex's creation-time suffix.
const memberships: FixtureMembership[] = [
  { _id: "membership-a-1", boxId: "box-a", itemId: "item-1", quantity: 1 },
  { _id: "membership-b-1", boxId: "box-b", itemId: "item-1", quantity: 2 },
  {
    _id: "membership-a-deleted",
    boxId: "box-a",
    itemId: "item-deleted",
    quantity: 1,
  },
  { _id: "membership-a-2", boxId: "box-a", itemId: "item-2", quantity: 3 },
  {
    _id: "membership-b-missing",
    boxId: "box-b",
    itemId: "item-missing",
    quantity: 1,
  },
];

const items: FixtureItem[] = [
  { _id: "item-2", name: "Packing paper" },
  { _id: "item-deleted", name: "Discarded lamp", deletedAt: 42 },
  { _id: "item-1", name: "Books" },
];

function oldPerBoxContents(boxId: string) {
  return memberships
    .filter((membership) => membership.boxId === boxId)
    .map((membership) => {
      const item = items.find((candidate) => candidate._id === membership.itemId);
      return item && !item.deletedAt ? { membership, item } : null;
    })
    .filter(
      (
        entry,
      ): entry is {
        membership: FixtureMembership;
        item: FixtureItem;
      } => Boolean(entry),
    );
}

describe("buildBoxContentsIndex", () => {
  it("matches the old per-box logic for deleted items, cross-box memberships, and empty boxes", () => {
    const index = buildBoxContentsIndex(memberships, items);

    for (const boxId of boxIds) {
      expect(index.get(boxId) ?? []).toEqual(oldPerBoxContents(boxId));
    }
  });

  it("preserves by_box insertion ordering within each box", () => {
    const index = buildBoxContentsIndex(memberships, items);

    expect(index.get("box-a")?.map(({ membership }) => membership._id)).toEqual(
      ["membership-a-1", "membership-a-2"],
    );
    expect(index.get("box-b")?.map(({ membership }) => membership._id)).toEqual(
      ["membership-b-1"],
    );
  });
});
