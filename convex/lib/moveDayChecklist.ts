import type { Doc, Id } from "../_generated/dataModel";
import { boxStatuses } from "./moveFields";

export const moveDayFilters = [
  "all",
  "ready",
  "staged",
  "loaded",
  "exceptions",
] as const;

export type MoveDayFilter = (typeof moveDayFilters)[number];

export type MoveDayChecklistBox = {
  boxId: Id<"boxes">;
  code: string;
  label?: string;
  room?: string;
  destinationRoom?: string;
  status: Doc<"boxes">["status"];
  itemCount: number;
  assignedResourceId?: Id<"transportResources">;
  assignedResourceName?: string;
  assignedResourceType?: Doc<"transportResources">["type"];
  assignedZoneId?: Id<"transportZones">;
  assignedZoneName?: string;
  assignmentWarnings: string[];
  assignmentHardBlocks: string[];
  assignmentLocked: boolean;
  moveDayNote?: string;
  needsAttention: boolean;
};

export function parseMoveDayFilter(value: unknown): MoveDayFilter | undefined {
  return includesLiteral(moveDayFilters, value) ? value : undefined;
}

export function buildMoveDayChecklist({
  householdId,
  move,
  boxes,
  items,
  memberships,
  resources,
  zones,
  filter = "all",
  search,
  now = Date.now(),
}: {
  householdId: Id<"households">;
  move: Doc<"moves">;
  boxes: Doc<"boxes">[];
  items: Doc<"items">[];
  memberships: Doc<"boxItems">[];
  resources: Doc<"transportResources">[];
  zones: Doc<"transportZones">[];
  filter?: MoveDayFilter;
  search?: string;
  now?: number;
}) {
  const activeItemIds = new Set(
    items
      .filter(
        (item) =>
          item.householdId === householdId &&
          item.moveId === move._id &&
          !item.deletedAt
      )
      .map((item) => item._id)
  );
  const activeResources = resources.filter(
    (resource) =>
      resource.householdId === householdId &&
      resource.moveId === move._id &&
      !resource.archivedAt
  );
  const activeZones = zones.filter(
    (zone) =>
      zone.householdId === householdId &&
      zone.moveId === move._id &&
      !zone.archivedAt
  );
  const resourceById = new Map(
    activeResources.map((resource) => [resource._id, resource])
  );
  const zoneById = new Map(activeZones.map((zone) => [zone._id, zone]));
  const itemCountsByBoxId = new Map<Id<"boxes">, number>();

  for (const membership of memberships) {
    if (
      membership.householdId !== householdId ||
      membership.moveId !== move._id ||
      !activeItemIds.has(membership.itemId)
    ) {
      continue;
    }
    itemCountsByBoxId.set(
      membership.boxId,
      (itemCountsByBoxId.get(membership.boxId) ?? 0) + membership.quantity
    );
  }

  const checklist = boxes
    .filter(
      (box) =>
        box.householdId === householdId &&
        box.moveId === move._id &&
        !box.archivedAt
    )
    .map((box): MoveDayChecklistBox => {
      const resource = box.assignedResourceId
        ? resourceById.get(box.assignedResourceId)
        : undefined;
      const zone = box.assignedZoneId ? zoneById.get(box.assignedZoneId) : undefined;
      const assignmentWarnings = box.assignmentWarnings ?? [];
      const assignmentHardBlocks = box.assignmentHardBlocks ?? [];
      return {
        boxId: box._id,
        code: box.code,
        label: box.label,
        room: box.room,
        destinationRoom: box.destinationRoom,
        status: box.status,
        itemCount: itemCountsByBoxId.get(box._id) ?? 0,
        assignedResourceId: box.assignedResourceId,
        assignedResourceName: resource?.name,
        assignedResourceType: resource?.type,
        assignedZoneId: box.assignedZoneId,
        assignedZoneName: zone?.name,
        assignmentWarnings,
        assignmentHardBlocks,
        assignmentLocked: box.assignmentLocked ?? false,
        moveDayNote: box.moveDayNote,
        needsAttention:
          isMoveDayExceptionStatus(box.status) ||
          Boolean(assignmentWarnings.length || assignmentHardBlocks.length),
      };
    });

  const normalizedSearch = search?.trim();
  const filteredChecklist = checklist.filter(
    (box) =>
      matchesMoveDayFilter(box, filter) &&
      matchesMoveDaySearch(box, normalizedSearch)
  );

  return {
    move: {
      moveId: move._id,
      title: move.title,
      type: move.type,
      status: move.status,
    },
    filter: {
      mode: filter,
      query: normalizedSearch || undefined,
    },
    counts: moveDayCounts(checklist, filteredChecklist.length),
    checklist: filteredChecklist,
    generatedAt: now,
  };
}

function moveDayCounts(
  checklist: MoveDayChecklistBox[],
  filteredBoxes: number
) {
  const byStatus = Object.fromEntries(
    boxStatuses.map((status) => [status, 0])
  ) as Record<Doc<"boxes">["status"], number>;
  for (const box of checklist) {
    byStatus[box.status] += 1;
  }

  const completedBoxes = byStatus.loaded + byStatus.delivered;
  const totalBoxes = checklist.length;

  return {
    totalBoxes,
    filteredBoxes,
    readyBoxes: checklist.filter((box) => matchesMoveDayFilter(box, "ready"))
      .length,
    completedBoxes,
    exceptionBoxes: byStatus.missing + byStatus.damaged,
    warningBoxes: checklist.filter((box) => box.assignmentWarnings.length > 0)
      .length,
    blockedBoxes: checklist.filter((box) => box.assignmentHardBlocks.length > 0)
      .length,
    progressPercent: totalBoxes
      ? Math.round((completedBoxes / totalBoxes) * 100)
      : 0,
    byStatus,
  };
}

function matchesMoveDayFilter(
  box: MoveDayChecklistBox,
  filter: MoveDayFilter
) {
  switch (filter) {
    case "all":
      return true;
    case "ready":
      return ["sealed", "staged"].includes(box.status);
    case "staged":
      return box.status === "staged";
    case "loaded":
      return ["loaded", "delivered"].includes(box.status);
    case "exceptions":
      return box.needsAttention;
  }
}

function matchesMoveDaySearch(
  box: MoveDayChecklistBox,
  search: string | undefined
) {
  if (!search) return true;
  const query = search.toLowerCase();
  return [
    box.code,
    box.label,
    box.room,
    box.destinationRoom,
    box.status,
    box.assignedResourceName,
    box.assignedZoneName,
  ].some((value) => value?.toLowerCase().includes(query));
}

function isMoveDayExceptionStatus(status: Doc<"boxes">["status"]) {
  return status === "missing" || status === "damaged";
}

function includesLiteral<TValue extends string>(
  values: readonly TValue[],
  value: unknown
): value is TValue {
  return typeof value === "string" && values.includes(value as TValue);
}
