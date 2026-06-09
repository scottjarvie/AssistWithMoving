import { describe, expect, it } from "vitest";

import { summarizePackingDebt } from "../../convex/lib/packingDebt";

describe("packing debt summary", () => {
  it("summarizes unfinished move decisions while ignoring archived records", () => {
    const summary = summarizePackingDebt({
      items: [
        {
          itemId: "item-review",
          disposition: "undecided",
          status: "active",
          highValue: true,
          needsReview: true,
          requiresPersonalTransport: false,
          planningDefaultKeys: [],
        },
        {
          itemId: "item-boxed",
          disposition: "take",
          status: "active",
          highValue: false,
          needsReview: false,
          requiresPersonalTransport: false,
          planningDefaultKeys: [],
        },
        {
          itemId: "item-loose",
          disposition: "personalTransport",
          status: "active",
          highValue: false,
          needsReview: false,
          requiresPersonalTransport: true,
          planningDefaultKeys: ["doNotLetMoversTouch"],
        },
        {
          itemId: "item-deleted",
          disposition: "undecided",
          status: "active",
          highValue: true,
          needsReview: true,
          requiresPersonalTransport: true,
          planningDefaultKeys: ["sensitive"],
          deletedAt: 123,
        },
      ],
      boxes: [
        {
          boxId: "box-active",
          status: "open",
          assignmentWarnings: ["capacity warning"],
        },
        {
          boxId: "box-assigned",
          destinationRoom: "Kitchen",
          status: "loaded",
          assignedResourceId: "resource-1",
        },
        {
          boxId: "box-archived",
          status: "open",
          archivedAt: 123,
        },
      ],
      memberships: [{ boxId: "box-assigned", itemId: "item-boxed" }],
      photos: [
        {
          itemId: "item-boxed",
          photoType: "condition",
          verificationStatus: "verified",
        },
        {
          boxId: "box-active",
          photoType: "boxContents",
          verificationStatus: "needsReview",
        },
        {
          itemId: "item-deleted",
          photoType: "item",
          verificationStatus: "unreviewed",
          archivedAt: 123,
        },
      ],
      pendingAiSuggestions: {
        textSuggestions: 2,
        photoSuggestions: 1,
        planningSuggestions: 3,
      },
    });

    expect(metric(summary, "needsReview")).toBe(1);
    expect(metric(summary, "undecidedDisposition")).toBe(1);
    expect(metric(summary, "unboxedItems")).toBe(2);
    expect(metric(summary, "highValueWithoutPhotos")).toBe(2);
    expect(metric(summary, "boxesMissingDestination")).toBe(1);
    expect(metric(summary, "boxesUnassigned")).toBe(1);
    expect(metric(summary, "boxesNotLoaded")).toBe(1);
    expect(metric(summary, "boxWarnings")).toBe(1);
    expect(metric(summary, "photosNeedingReview")).toBe(1);
    expect(metric(summary, "pendingAiSuggestions")).toBe(6);
    expect(summary.counts.activeItems).toBe(3);
    expect(summary.counts.activeBoxes).toBe(2);
    expect(summary.topActions[0].severity).toBe("critical");
  });

  it("returns a clear state when no packing debt is present", () => {
    const summary = summarizePackingDebt({
      items: [
        {
          itemId: "item-1",
          disposition: "take",
          status: "loaded",
          highValue: false,
          needsReview: false,
          requiresPersonalTransport: false,
          planningDefaultKeys: [],
        },
      ],
      boxes: [
        {
          boxId: "box-1",
          destinationRoom: "Kitchen",
          status: "loaded",
          assignedResourceId: "resource-1",
        },
      ],
      memberships: [{ boxId: "box-1", itemId: "item-1" }],
      photos: [
        {
          itemId: "item-1",
          photoType: "item",
          verificationStatus: "verified",
        },
      ],
      pendingAiSuggestions: {
        textSuggestions: 0,
        photoSuggestions: 0,
        planningSuggestions: 0,
      },
    });

    expect(summary.counts.openMetricCount).toBe(0);
    expect(summary.counts.totalOpenSignals).toBe(0);
    expect(summary.topActions).toEqual([]);
  });
});

function metric(
  summary: ReturnType<typeof summarizePackingDebt>,
  key: ReturnType<typeof summarizePackingDebt>["metrics"][number]["key"]
) {
  return summary.metrics.find((entry) => entry.key === key)?.count;
}
