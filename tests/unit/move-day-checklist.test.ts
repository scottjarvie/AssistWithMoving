import { describe, expect, it } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  buildMoveDayChecklist,
  parseMoveDayFilter,
} from "../../convex/lib/moveDayChecklist";

const householdId = "household1" as Id<"households">;
const moveId = "move1" as Id<"moves">;
const truckId = "resource1" as Id<"transportResources">;
const zoneId = "zone1" as Id<"transportZones">;

describe("Move Day checklist API helpers", () => {
  it("parses supported filters only", () => {
    expect(parseMoveDayFilter("ready")).toBe("ready");
    expect(parseMoveDayFilter("everything")).toBeUndefined();
  });

  it("builds a crew-safe checklist with counts, filtering, and assignment labels", () => {
    const result = buildMoveDayChecklist({
      householdId,
      move: moveDoc({
        _id: moveId,
        householdId,
        title: "PCS to Virginia",
        type: "pcs",
        status: "active",
      }),
      boxes: [
        boxDoc({
          _id: "box1" as Id<"boxes">,
          householdId,
          moveId,
          code: "B-001",
          label: "Kitchen load",
          status: "staged",
          assignedResourceId: truckId,
          assignedZoneId: zoneId,
          assignmentWarnings: ["fragile"],
        }),
        boxDoc({
          _id: "box2" as Id<"boxes">,
          householdId,
          moveId,
          code: "B-002",
          status: "loaded",
        }),
        boxDoc({
          _id: "box3" as Id<"boxes">,
          householdId,
          moveId,
          code: "B-003",
          status: "missing",
          moveDayNote: "Last seen by front door.",
        }),
        boxDoc({
          _id: "archived-box" as Id<"boxes">,
          householdId,
          moveId,
          code: "B-004",
          status: "sealed",
          archivedAt: 123,
        }),
      ],
      items: [
        itemDoc({
          _id: "item1" as Id<"items">,
          householdId,
          moveId,
          name: "Plate set",
          valueCents: 100_00,
          serialNumber: "SHOULD_NOT_LEAK",
        }),
        itemDoc({
          _id: "deleted-item" as Id<"items">,
          householdId,
          moveId,
          name: "Deleted item",
          deletedAt: 123,
        }),
      ],
      memberships: [
        membershipDoc({
          householdId,
          moveId,
          boxId: "box1" as Id<"boxes">,
          itemId: "item1" as Id<"items">,
          quantity: 2,
        }),
        membershipDoc({
          householdId,
          moveId,
          boxId: "box1" as Id<"boxes">,
          itemId: "deleted-item" as Id<"items">,
          quantity: 8,
        }),
      ],
      resources: [
        resourceDoc({
          _id: truckId,
          householdId,
          moveId,
          type: "truck",
          name: "Rental truck",
        }),
      ],
      zones: [
        zoneDoc({
          _id: zoneId,
          householdId,
          moveId,
          resourceId: truckId,
          name: "Front third",
        }),
      ],
      filter: "exceptions",
      search: "truck",
      now: 42,
    });

    expect(result.counts).toMatchObject({
      totalBoxes: 3,
      filteredBoxes: 1,
      readyBoxes: 1,
      completedBoxes: 1,
      exceptionBoxes: 1,
      warningBoxes: 1,
      progressPercent: 33,
    });
    expect(result.checklist).toEqual([
      expect.objectContaining({
        boxId: "box1",
        code: "B-001",
        itemCount: 2,
        assignedResourceName: "Rental truck",
        assignedZoneName: "Front third",
        needsAttention: true,
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("SHOULD_NOT_LEAK");
  });
});

function moveDoc(value: Partial<Doc<"moves">>) {
  return value as Doc<"moves">;
}

function boxDoc(value: Partial<Doc<"boxes">>) {
  return value as Doc<"boxes">;
}

function itemDoc(value: Partial<Doc<"items">>) {
  return value as Doc<"items">;
}

function membershipDoc(value: Partial<Doc<"boxItems">>) {
  return value as Doc<"boxItems">;
}

function resourceDoc(value: Partial<Doc<"transportResources">>) {
  return value as Doc<"transportResources">;
}

function zoneDoc(value: Partial<Doc<"transportZones">>) {
  return value as Doc<"transportZones">;
}
