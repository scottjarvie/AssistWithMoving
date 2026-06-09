import { describe, expect, it } from "vitest";

import {
  splitBulkAssignmentSelection,
  summarizeLoadLocks,
} from "../../src/lib/load-locks";

describe("load lock helpers", () => {
  const boxes = [
    {
      box: {
        _id: "box_1",
        assignedResourceId: "truck_1",
        assignmentLocked: true,
      },
    },
    {
      box: {
        _id: "box_2",
        assignedResourceId: "truck_1",
        assignmentLocked: false,
      },
    },
    {
      box: {
        _id: "box_3",
        assignmentLocked: true,
      },
    },
  ];

  it("summarizes locked assignments separately from unassigned locks", () => {
    expect(summarizeLoadLocks(boxes)).toEqual({
      lockedCount: 2,
      unlockedCount: 1,
      lockedAssignedCount: 1,
      lockedUnassignedCount: 1,
    });
  });

  it("skips locked boxes during bulk assignment by default", () => {
    expect(
      splitBulkAssignmentSelection(boxes, ["box_1", "box_2", "box_missing"])
    ).toEqual({
      assignableBoxIds: ["box_2"],
      skippedLockedBoxIds: ["box_1"],
      missingBoxIds: ["box_missing"],
    });
  });

  it("allows deliberately included locked boxes", () => {
    expect(
      splitBulkAssignmentSelection(boxes, ["box_1", "box_2"], {
        includeLocked: true,
      })
    ).toEqual({
      assignableBoxIds: ["box_1", "box_2"],
      skippedLockedBoxIds: [],
      missingBoxIds: [],
    });
  });
});
