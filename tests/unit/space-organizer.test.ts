import { describe, expect, it } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { InventoryItem } from "@/lib/inventory-types";
import {
  buildOrganizerEntries,
  dispositionBucketFor,
  entriesInDispositionBucket,
  entriesInSpace,
  entriesOnResource,
  isLooseItem,
  isOrphanEntry,
  orphanEntries,
  summarizeEntries,
  type OrganizerBoxRecord,
} from "@/lib/space-organizer";

// Test fixtures cast minimal partials — the helpers only read a handful of
// fields, so we avoid constructing full Convex documents.
const SPACE_A = "space_a" as Id<"moveSpaces">;
const SPACE_B = "space_b" as Id<"moveSpaces">;
const TRUCK = "truck_1" as Id<"transportResources">;

function boxRecord(
  id: string,
  overrides: Partial<Doc<"boxes">> = {},
  extra: Partial<OrganizerBoxRecord> = {},
): OrganizerBoxRecord {
  return {
    box: {
      _id: id as Id<"boxes">,
      code: id.toUpperCase(),
      status: "open",
      ...overrides,
    } as Doc<"boxes">,
    itemCount: extra.itemCount ?? 0,
    weightSummary: extra.weightSummary ?? null,
  };
}

function item(
  id: string,
  overrides: Partial<InventoryItem> = {},
): InventoryItem {
  return {
    _id: id as Id<"items">,
    name: id,
    status: "active",
    disposition: "undecided",
    quantity: 1,
    ...overrides,
  } as InventoryItem;
}

describe("isLooseItem", () => {
  it("treats items not in a box as loose", () => {
    expect(isLooseItem(item("i1"))).toBe(true);
    expect(
      isLooseItem(item("i2", { signals: { boxCount: 0 } as never })),
    ).toBe(true);
  });

  it("excludes items packed in a box and archived/deleted items", () => {
    expect(
      isLooseItem(item("i3", { signals: { boxCount: 2 } as never })),
    ).toBe(false);
    expect(isLooseItem(item("i4", { status: "archived" }))).toBe(false);
    expect(isLooseItem(item("i5", { deletedAt: 123 }))).toBe(false);
  });
});

describe("buildOrganizerEntries", () => {
  it("merges boxes and only loose items, skipping archived boxes", () => {
    const entries = buildOrganizerEntries({
      boxes: [
        boxRecord("b1"),
        boxRecord("b2", { archivedAt: 999 }), // archived → skipped
      ],
      items: [
        item("loose1"),
        item("packed", { signals: { boxCount: 1 } as never }), // in a box → skipped
      ],
    });
    const ids = entries.map((e) => e.id).sort();
    expect(ids).toEqual(["box:b1", "item:loose1"]);
  });

  it("multiplies item weight/volume by quantity", () => {
    const [entry] = buildOrganizerEntries({
      items: [item("i", { quantity: 3, estimatedWeightLb: 10 })],
    });
    expect(entry.estimatedWeightLb).toBe(30);
  });
});

describe("grouping predicates", () => {
  const entries = buildOrganizerEntries({
    boxes: [boxRecord("inSpace", { currentSpaceId: SPACE_A })],
    items: [
      item("onTruck", { assignedResourceId: TRUCK }),
      item("orphan"),
      item("inSpaceB", { currentSpaceId: SPACE_B }),
    ],
  });

  it("filters entries by space", () => {
    expect(entriesInSpace(entries, SPACE_A).map((e) => e.id)).toEqual([
      "box:inSpace",
    ]);
    expect(entriesInSpace(entries, SPACE_B).map((e) => e.id)).toEqual([
      "item:inSpaceB",
    ]);
  });

  it("filters entries by transport resource", () => {
    expect(entriesOnResource(entries, TRUCK).map((e) => e.id)).toEqual([
      "item:onTruck",
    ]);
  });

  it("identifies orphans as having no space and no transport", () => {
    expect(orphanEntries(entries).map((e) => e.id)).toEqual(["item:orphan"]);
    const orphan = entries.find((e) => e.id === "item:orphan")!;
    expect(isOrphanEntry(orphan)).toBe(true);
    const onTruck = entries.find((e) => e.id === "item:onTruck")!;
    expect(isOrphanEntry(onTruck)).toBe(false);
  });
});

describe("disposition buckets", () => {
  it("maps dispositions to trash/sell/giveaway buckets", () => {
    expect(dispositionBucketFor("dump")).toBe("trash");
    expect(dispositionBucketFor("sell")).toBe("sell");
    expect(dispositionBucketFor("donate")).toBe("giveaway");
    expect(dispositionBucketFor("free")).toBe("giveaway");
    expect(dispositionBucketFor("take")).toBeUndefined();
    expect(dispositionBucketFor(undefined)).toBeUndefined();
  });

  it("filters entries into a disposition bucket (items only)", () => {
    const entries = buildOrganizerEntries({
      boxes: [boxRecord("b1")], // boxes have no disposition
      items: [
        item("trash1", { disposition: "dump" }),
        item("sell1", { disposition: "sell" }),
        item("keep1", { disposition: "take" }),
      ],
    });
    expect(entriesInDispositionBucket(entries, "trash").map((e) => e.id)).toEqual(
      ["item:trash1"],
    );
    expect(entriesInDispositionBucket(entries, "sell").map((e) => e.id)).toEqual(
      ["item:sell1"],
    );
  });
});

describe("summarizeEntries", () => {
  it("tallies counts, weights, placement, and disposition", () => {
    const entries = buildOrganizerEntries({
      boxes: [
        boxRecord("b1", { currentSpaceId: SPACE_A, estimatedWeightLb: 40 }),
      ],
      items: [
        item("onTruck", { assignedResourceId: TRUCK, estimatedWeightLb: 5 }),
        item("orphanTrash", { disposition: "dump" }),
        item("noWeight", { estimatedWeightLb: undefined }),
      ],
    });
    const summary = summarizeEntries(entries);
    expect(summary.total).toBe(4);
    expect(summary.boxes).toBe(1);
    expect(summary.looseItems).toBe(3);
    expect(summary.knownWeightLb).toBe(45);
    expect(summary.missingWeight).toBe(2); // orphanTrash + noWeight
    expect(summary.inSpace).toBe(1);
    expect(summary.onTransport).toBe(1);
    expect(summary.orphans).toBe(2); // orphanTrash + noWeight
    expect(summary.trash).toBe(1);
  });
});
