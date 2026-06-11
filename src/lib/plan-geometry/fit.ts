import {
  distancePointToSegment,
  footprintCorners,
  footprintIntersectsWall,
  pointInPolygon,
  segmentIntersection,
  type Point,
  type WallSegment,
} from "@/lib/plan-geometry";

export type FitDimensions = {
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
};

export type FitRoom = {
  shortId: string;
  name?: string;
  points: Point[];
};

export type FitWall = {
  shortId: string;
  wall: WallSegment;
};

export type FitOpening = {
  shortId: string;
  wallShortId: string;
  widthIn: number;
  kind: "door" | "window" | "passage";
};

export type FitPlacement = {
  shortId: string;
  label: string;
  x: number;
  y: number;
  rotationDeg: number;
  footprint: {
    lengthIn: number;
    widthIn: number;
    measured: boolean;
  };
  dimensions?: FitDimensions;
};

export type FitIssue =
  | {
      type: "footprintOutsideRoom";
      severity: "warning";
      placementShortId: string;
      placementLabel: string;
      roomShortId?: string;
      roomLabel: string;
      message: string;
    }
  | {
      type: "footprintCrossesWall";
      severity: "warning";
      placementShortId: string;
      placementLabel: string;
      wallShortId: string;
      roomShortId?: string;
      roomLabel: string;
      message: string;
    }
  | {
      type: "doorFit";
      severity: "warning";
      placementShortId: string;
      placementLabel: string;
      doorShortIds: string[];
      roomShortId?: string;
      roomLabel: string;
      message: string;
    }
  | {
      type: "unknownSize";
      severity: "info";
      placementShortId: string;
      placementLabel: string;
      roomShortId?: string;
      roomLabel: string;
      message: string;
    };

export type FitReport = {
  issues: FitIssue[];
  doorIssues: Map<string, FitIssue[]>;
  durationMs: number;
};

export function analyzePlanFit({
  placements,
  rooms,
  walls,
  openings,
  now = () => performanceNow(),
}: {
  placements: FitPlacement[];
  rooms: FitRoom[];
  walls: FitWall[];
  openings: FitOpening[];
  now?: () => number;
}): FitReport {
  const start = now();
  const issues: FitIssue[] = [];
  const wallsByShortId = new Map(walls.map((wall) => [wall.shortId, wall]));
  const openingsByRoom = new Map<string, FitOpening[]>();

  for (const room of rooms) {
    openingsByRoom.set(
      room.shortId,
      openings.filter((opening) => {
        if (opening.kind === "window") {
          return false;
        }
        const wall = wallsByShortId.get(opening.wallShortId);
        return wall ? wallTouchesRoom(wall.wall, room.points) : false;
      }),
    );
  }

  for (const placement of placements) {
    const room = roomContainingPoint({ x: placement.x, y: placement.y }, rooms);
    const roomLabel = room ? roomDisplayLabel(room) : "Unassigned";
    const corners = footprintCorners(
      placement.x,
      placement.y,
      placement.footprint.lengthIn,
      placement.footprint.widthIn,
      placement.rotationDeg,
    );

    if (room && corners.some((corner) => !pointInPolygon(corner, room.points))) {
      issues.push({
        type: "footprintOutsideRoom",
        severity: "warning",
        placementShortId: placement.shortId,
        placementLabel: placement.label,
        roomShortId: room.shortId,
        roomLabel,
        message: `${placement.label} (${placement.shortId}) footprint extends outside ${roomLabel} (${room.shortId}).`,
      });
    }

    for (const wall of walls) {
      if (!footprintIntersectsWall(corners, wall.wall)) {
        continue;
      }
      issues.push({
        type: "footprintCrossesWall",
        severity: "warning",
        placementShortId: placement.shortId,
        placementLabel: placement.label,
        wallShortId: wall.shortId,
        roomShortId: room?.shortId,
        roomLabel,
        message: `${placement.label} (${placement.shortId}) footprint crosses wall ${wall.shortId}.`,
      });
    }

    const fitWidth = secondSmallestDimension(placement.dimensions);
    if (!fitWidth) {
      issues.push({
        type: "unknownSize",
        severity: "info",
        placementShortId: placement.shortId,
        placementLabel: placement.label,
        roomShortId: room?.shortId,
        roomLabel,
        message: `${placement.label} (${placement.shortId}) has unknown size, so doorway fit was skipped.`,
      });
      continue;
    }

    if (!room) {
      continue;
    }

    const roomOpenings = openingsByRoom.get(room.shortId) ?? [];
    if (!roomOpenings.length) {
      continue;
    }

    const passingOpenings = roomOpenings.filter((opening) =>
      itemPassesOpening(placement.dimensions, opening.widthIn),
    );
    if (passingOpenings.length) {
      continue;
    }

    const doorShortIds = roomOpenings.map((opening) => opening.shortId);
    const doorList = roomOpenings
      .map((opening) => `${opening.shortId}: ${opening.widthIn}"`)
      .join(", ");
    issues.push({
      type: "doorFit",
      severity: "warning",
      placementShortId: placement.shortId,
      placementLabel: placement.label,
      doorShortIds,
      roomShortId: room.shortId,
      roomLabel,
      message: `${placement.label} (${placement.shortId}) may not fit through any door of ${roomLabel} (${doorList}). Assumes you can tilt it; tall rigid items may differ.`,
    });
  }

  const doorIssues = new Map<string, FitIssue[]>();
  for (const issue of issues) {
    if (issue.type !== "doorFit") {
      continue;
    }
    for (const doorShortId of issue.doorShortIds) {
      const current = doorIssues.get(doorShortId) ?? [];
      current.push(issue);
      doorIssues.set(doorShortId, current);
    }
  }

  return {
    issues,
    doorIssues,
    durationMs: now() - start,
  };
}

export function itemPassesOpening(
  dimensions: FitDimensions | undefined,
  openingWidthIn: number,
  clearanceIn = 1,
) {
  const fitWidth = secondSmallestDimension(dimensions);
  if (!fitWidth) {
    return null;
  }

  return fitWidth < openingWidthIn - clearanceIn;
}

export function secondSmallestDimension(
  dimensions: FitDimensions | undefined,
) {
  const values = [
    dimensions?.lengthIn,
    dimensions?.widthIn,
    dimensions?.heightIn,
  ].filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0,
  );

  if (values.length < 2) {
    return null;
  }

  return [...values].sort((a, b) => a - b)[1]!;
}

function roomContainingPoint(point: Point, rooms: FitRoom[]) {
  return rooms.find((room) => pointInPolygon(point, room.points));
}

function wallTouchesRoom(wall: WallSegment, roomPoints: Point[]) {
  const wallStart = { x: wall.x1, y: wall.y1 };
  const wallEnd = { x: wall.x2, y: wall.y2 };
  const touchToleranceIn = 1;

  for (let index = 0; index < roomPoints.length; index += 1) {
    const current = roomPoints[index]!;
    const next = roomPoints[(index + 1) % roomPoints.length]!;
    if (segmentIntersection(wallStart, wallEnd, current, next)) {
      return true;
    }
    if (
      distancePointToSegment(wallStart, current, next) <= touchToleranceIn ||
      distancePointToSegment(wallEnd, current, next) <= touchToleranceIn ||
      distancePointToSegment(current, wallStart, wallEnd) <= touchToleranceIn ||
      distancePointToSegment(next, wallStart, wallEnd) <= touchToleranceIn
    ) {
      return true;
    }
  }
  return false;
}

function roomDisplayLabel(room: FitRoom) {
  return room.name?.trim() || `Room ${room.shortId}`;
}

function performanceNow() {
  if (typeof performance !== "undefined") {
    return performance.now();
  }
  return Date.now();
}
