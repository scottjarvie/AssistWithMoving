export type LoadLockBox<TBoxId extends string = string> = {
  box: {
    _id: TBoxId;
    assignedResourceId?: string;
    assignmentLocked?: boolean;
  };
};

export type LoadLockSummary = {
  lockedCount: number;
  unlockedCount: number;
  lockedAssignedCount: number;
  lockedUnassignedCount: number;
};

export function summarizeLoadLocks<TBoxId extends string>(
  records: readonly LoadLockBox<TBoxId>[]
): LoadLockSummary {
  return records.reduce<LoadLockSummary>(
    (summary, record) => {
      if (!record.box.assignmentLocked) {
        summary.unlockedCount += 1;
        return summary;
      }

      summary.lockedCount += 1;
      if (record.box.assignedResourceId) {
        summary.lockedAssignedCount += 1;
      } else {
        summary.lockedUnassignedCount += 1;
      }
      return summary;
    },
    {
      lockedCount: 0,
      unlockedCount: 0,
      lockedAssignedCount: 0,
      lockedUnassignedCount: 0,
    }
  );
}

export function splitBulkAssignmentSelection<TBoxId extends string>(
  records: readonly LoadLockBox<TBoxId>[],
  selectedBoxIds: readonly TBoxId[],
  options: { includeLocked?: boolean } = {}
) {
  const recordById = new Map(records.map((record) => [record.box._id, record]));
  const assignableBoxIds: TBoxId[] = [];
  const skippedLockedBoxIds: TBoxId[] = [];
  const missingBoxIds: TBoxId[] = [];

  for (const boxId of selectedBoxIds) {
    const record = recordById.get(boxId);
    if (!record) {
      missingBoxIds.push(boxId);
      continue;
    }
    if (record.box.assignmentLocked && !options.includeLocked) {
      skippedLockedBoxIds.push(boxId);
      continue;
    }
    assignableBoxIds.push(boxId);
  }

  return { assignableBoxIds, skippedLockedBoxIds, missingBoxIds };
}
