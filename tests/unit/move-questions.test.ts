import { describe, expect, it } from "vitest";

import { summarizeMoveQuestions } from "../../convex/lib/moveQuestions";

describe("move question summary", () => {
  it("surfaces PCS, evidence, inventory, and load questions", () => {
    const summary = summarizeMoveQuestions({
      move: {
        moveId: "move-1",
        type: "pcs",
        title: "PCS move",
        origin: "Utah",
        documentationProfileTypes: ["pcsMove", "insuranceClaim", "loadCrew"],
        pcsDependentStatus: "unknown",
      },
      items: [
        {
          itemId: "high-value",
          disposition: "undecided",
          status: "active",
          highValue: true,
          needsReview: true,
          requiresPersonalTransport: false,
          planningDefaultKeys: ["electronics"],
          weightConfidence: "low",
          volumeConfidence: "none",
        },
        {
          itemId: "boxed",
          disposition: "take",
          status: "active",
          highValue: false,
          needsReview: false,
          requiresPersonalTransport: false,
          planningDefaultKeys: [],
          weightConfidence: "manual",
          volumeConfidence: "manual",
        },
        {
          itemId: "deleted",
          disposition: "undecided",
          status: "active",
          highValue: true,
          needsReview: true,
          requiresPersonalTransport: true,
          planningDefaultKeys: ["firstNight"],
          deletedAt: 1,
        },
      ],
      boxes: [
        {
          boxId: "box-1",
          status: "open",
          assignmentWarnings: ["capacity"],
        },
        {
          boxId: "box-2",
          status: "loaded",
          destinationRoom: "Kitchen",
          assignedResourceId: "truck-1",
        },
      ],
      memberships: [{ boxId: "box-2", itemId: "boxed" }],
      photos: [
        {
          itemId: "boxed",
          photoType: "item",
          verificationStatus: "verified",
        },
        {
          boxId: "box-1",
          photoType: "boxContents",
          verificationStatus: "needsReview",
        },
      ],
    });

    expect(promptCount(summary, "move-route")).toBe(1);
    expect(promptCount(summary, "pcs-orders-allowance")).toBe(3);
    expect(promptCount(summary, "inventory-review")).toBe(1);
    expect(promptCount(summary, "inventory-disposition")).toBe(1);
    expect(promptCount(summary, "first-night-items")).toBe(1);
    expect(promptCount(summary, "priority-photo-evidence")).toBe(1);
    expect(promptCount(summary, "claim-value-evidence")).toBe(1);
    expect(promptCount(summary, "serial-model-evidence")).toBe(1);
    expect(promptCount(summary, "photo-review")).toBe(1);
    expect(promptCount(summary, "loose-load-items")).toBe(1);
    expect(promptCount(summary, "unassigned-boxes")).toBe(1);
    expect(promptCount(summary, "assignment-warnings")).toBe(1);
    expect(promptCount(summary, "claim-packet-readiness")).toBe(1);
    expect(summary.counts.critical).toBeGreaterThan(0);
    expect(summary.topPrompts[0].severity).toBe("critical");
  });

  it("ignores archived records and returns a clear state when core details exist", () => {
    const summary = summarizeMoveQuestions({
      move: {
        moveId: "move-1",
        type: "local",
        title: "Local move",
        origin: "Old house",
        destination: "New house",
        dateStart: "2026-07-01",
        dateEnd: "2026-07-02",
        documentationProfileTypes: ["personalFullRecord"],
      },
      items: [
        {
          itemId: "ready",
          disposition: "take",
          status: "packed",
          highValue: false,
          needsReview: false,
          requiresPersonalTransport: false,
          planningDefaultKeys: ["firstNight"],
          weightConfidence: "manual",
          volumeConfidence: "manual",
        },
        {
          itemId: "archived",
          disposition: "undecided",
          status: "archived",
          highValue: true,
          needsReview: true,
          requiresPersonalTransport: true,
          planningDefaultKeys: ["highValue"],
        },
      ],
      boxes: [
        {
          boxId: "box-1",
          status: "loaded",
          destinationRoom: "Kitchen",
          assignedResourceId: "truck-1",
        },
      ],
      memberships: [{ boxId: "box-1", itemId: "ready" }],
      photos: [
        {
          itemId: "ready",
          photoType: "item",
          verificationStatus: "verified",
        },
      ],
    });

    expect(summary.counts.openPrompts).toBe(0);
    expect(summary.counts.totalOpenItems).toBe(0);
    expect(summary.topPrompts).toEqual([]);
  });
});

function promptCount(
  summary: ReturnType<typeof summarizeMoveQuestions>,
  key: ReturnType<typeof summarizeMoveQuestions>["prompts"][number]["key"]
) {
  return summary.prompts.find((prompt) => prompt.key === key)?.count;
}
