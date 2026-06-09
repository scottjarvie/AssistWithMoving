import { describe, expect, it } from "vitest";

import { summarizeEvidenceDensity } from "../../convex/lib/evidenceDensity";

describe("evidence density summary", () => {
  it("scores complete item evidence across photos, value, condition, and box", () => {
    const summary = summarizeEvidenceDensity({
      items: [
        {
          itemId: "item-laptop",
          name: "Work laptop",
          room: "Office",
          category: "Electronics",
          disposition: "personalTransport",
          status: "active",
          condition: "good",
          valueCents: 180000,
          highValue: true,
          needsReview: false,
          requiresPersonalTransport: true,
          planningDefaultKeys: ["doNotLetMoversTouch"],
        },
      ],
      boxes: [{ boxId: "box-office" }],
      memberships: [{ boxId: "box-office", itemId: "item-laptop" }],
      photos: [
        { itemId: "item-laptop", photoType: "item" },
        { itemId: "item-laptop", photoType: "serialNumber" },
        { itemId: "item-laptop", photoType: "receipt" },
      ],
    });

    expect(summary.summary.itemCount).toBe(1);
    expect(summary.summary.averageScore).toBe(100);
    expect(summary.summary.priorityAverageScore).toBe(100);
    expect(summary.summary.completeItemCount).toBe(1);
    expect(summary.topGaps).toEqual([]);
    expect(summary.items[0]).toMatchObject({
      itemId: "item-laptop",
      priority: "high",
      score: 100,
      satisfiedCount: 6,
      gaps: [],
    });
  });

  it("reports thin priority evidence while ignoring deleted and archived records", () => {
    const summary = summarizeEvidenceDensity({
      items: [
        {
          itemId: "item-camera",
          name: "Missing camera",
          room: "Garage",
          category: "Camera",
          disposition: "mover",
          status: "missing",
          condition: "unknown",
          highValue: false,
          needsReview: false,
          requiresPersonalTransport: false,
          planningDefaultKeys: [],
        },
        {
          itemId: "item-deleted",
          name: "Deleted jewelry",
          disposition: "take",
          status: "active",
          condition: "unknown",
          highValue: true,
          needsReview: true,
          requiresPersonalTransport: false,
          planningDefaultKeys: ["highValue"],
          deletedAt: 0,
        },
        {
          itemId: "item-archived",
          name: "Archived piano",
          disposition: "mover",
          status: "archived",
          condition: "good",
          valueCents: 300000,
          highValue: true,
          needsReview: false,
          requiresPersonalTransport: false,
          planningDefaultKeys: [],
        },
      ],
      boxes: [{ boxId: "box-archived", archivedAt: 0 }],
      memberships: [{ boxId: "box-archived", itemId: "item-camera" }],
      photos: [
        {
          itemId: "item-camera",
          photoType: "item",
          archivedAt: 0,
        },
        {
          itemId: "item-deleted",
          photoType: "receipt",
        },
      ],
    });

    expect(summary.summary.itemCount).toBe(1);
    expect(summary.summary.priorityItemCount).toBe(1);
    expect(summary.summary.thinPriorityItemCount).toBe(1);
    expect(summary.summary.zeroEvidenceItemCount).toBe(1);
    expect(summary.topGaps[0]).toMatchObject({
      itemId: "item-camera",
      priority: "high",
      score: 0,
    });
    expect(summary.topGaps[0].gaps).toEqual([
      "Item photo",
      "Serial photo",
      "Condition documented",
      "Value documented",
      "Receipt photo",
      "Box association",
    ]);
    expect(gapCount(summary, "Box association")).toBe(1);
  });

  it("prioritizes high and watch evidence gaps before standard inventory", () => {
    const summary = summarizeEvidenceDensity({
      items: [
        {
          itemId: "item-standard",
          name: "Guest towels",
          disposition: "mover",
          status: "active",
          condition: "unknown",
          highValue: false,
          needsReview: false,
          requiresPersonalTransport: false,
          planningDefaultKeys: [],
        },
        {
          itemId: "item-watch",
          name: "Passport binder",
          disposition: "personalTransport",
          status: "active",
          condition: "unknown",
          highValue: false,
          needsReview: true,
          requiresPersonalTransport: false,
          planningDefaultKeys: ["documents"],
        },
        {
          itemId: "item-high",
          name: "Vintage amplifier",
          disposition: "mover",
          status: "active",
          condition: "good",
          valueCents: 125000,
          highValue: false,
          needsReview: false,
          requiresPersonalTransport: false,
          planningDefaultKeys: [],
        },
      ],
      boxes: [],
      memberships: [],
      photos: [],
    });

    expect(summary.topGaps.map((item) => item.itemId)).toEqual([
      "item-high",
      "item-watch",
      "item-standard",
    ]);
    expect(summary.items.find((item) => item.itemId === "item-high")).toMatchObject({
      priority: "high",
      score: 33,
    });
    expect(summary.items.find((item) => item.itemId === "item-watch")).toMatchObject({
      priority: "watch",
      score: 0,
    });
  });
});

function gapCount(
  summary: ReturnType<typeof summarizeEvidenceDensity>,
  label: string
) {
  return summary.gapCounts.find((entry) => entry.label === label)?.count;
}
