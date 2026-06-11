import {
  compassDirection,
  distancePointToSegment,
  polygonCentroid,
  wallOutwardNormal,
  type Point,
  type WallSegment,
} from "@/lib/plan-geometry";

export type NamedPlanRoom = {
  shortId: string;
  name?: string;
  room?: {
    points: Point[];
  };
};

export type NamedPlanWall = {
  shortId: string;
  name?: string;
  wall?: WallSegment;
};

export type WallDisplayName = {
  shortId: string;
  label: string;
  copyLabel: string;
  roomLabels: string[];
};

const boundaryToleranceIn = 2;

export function autoRoomName(room: NamedPlanRoom) {
  return room.name?.trim() || `Room ${numericSuffix(room.shortId)}`;
}

export function wallDisplayNames({
  walls,
  rooms,
  northAngleDeg,
}: {
  walls: NamedPlanWall[];
  rooms: NamedPlanRoom[];
  northAngleDeg: number;
}) {
  const perWall = new Map<string, string[]>();
  const directionalEntries: Array<{
    wall: NamedPlanWall;
    room: NamedPlanRoom;
    direction: string;
    sortValue: number;
  }> = [];

  for (const room of rooms) {
    if (!room.room?.points.length) {
      continue;
    }

    for (const wall of walls) {
      if (!wall.wall || !wallTouchesRoom(wall.wall, room.room.points)) {
        continue;
      }

      const normal = wallOutwardNormal(wall.wall, room.room.points);
      const angleDeg = (Math.atan2(normal.x, -normal.y) * 180) / Math.PI;
      const direction = compassLabel(compassDirection(angleDeg, northAngleDeg));
      directionalEntries.push({
        wall,
        room,
        direction,
        sortValue: wallSortValue(wall.wall, direction),
      });
    }
  }

  const grouped = new Map<string, typeof directionalEntries>();
  for (const entry of directionalEntries) {
    const key = `${entry.room.shortId}:${entry.direction}`;
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }

  for (const entries of grouped.values()) {
    const sorted = [...entries].sort((a, b) => a.sortValue - b.sortValue);
    for (const [index, entry] of sorted.entries()) {
      const roomName = autoRoomName(entry.room);
      const suffix = sorted.length > 1 ? ` ${index + 1}` : "";
      const roomLabel = `${roomName} ${entry.direction} wall${suffix}`;
      perWall.set(entry.wall.shortId, [
        ...(perWall.get(entry.wall.shortId) ?? []),
        roomLabel,
      ]);
    }
  }

  return new Map(
    walls.map((wall) => {
      const roomLabels = perWall.get(wall.shortId) ?? [];
      const label = wall.name?.trim() || roomLabels.join(" / ") || wall.shortId;
      return [
        wall.shortId,
        {
          shortId: wall.shortId,
          label,
          copyLabel: `${wall.shortId} — ${label}`,
          roomLabels,
        },
      ];
    }),
  );
}

export function entityDisplayPoint(entity: {
  wall?: WallSegment;
  room?: { points: Point[] };
  zone?: { points: Point[] };
  feature?: { x: number; y: number };
  annotation?: { x: number; y: number };
  opening?: { offsetAlongWallIn: number; widthIn: number };
}) {
  if (entity.wall) {
    return {
      x: (entity.wall.x1 + entity.wall.x2) / 2,
      y: (entity.wall.y1 + entity.wall.y2) / 2,
    };
  }
  if (entity.room) {
    return polygonCentroid(entity.room.points);
  }
  if (entity.zone) {
    return polygonCentroid(entity.zone.points);
  }
  if (entity.feature) {
    return { x: entity.feature.x, y: entity.feature.y };
  }
  if (entity.annotation) {
    return { x: entity.annotation.x, y: entity.annotation.y };
  }
  return { x: 0, y: 0 };
}

function wallTouchesRoom(wall: WallSegment, points: Point[]) {
  const start = { x: wall.x1, y: wall.y1 };
  const end = { x: wall.x2, y: wall.y2 };

  return points.some((current, index) => {
    const next = points[(index + 1) % points.length];
    if (!segmentsAreParallel(start, end, current, next)) {
      return false;
    }
    return (
      distancePointToSegment(start, current, next) <= boundaryToleranceIn ||
      distancePointToSegment(end, current, next) <= boundaryToleranceIn ||
      distancePointToSegment(current, start, end) <= boundaryToleranceIn ||
      distancePointToSegment(next, start, end) <= boundaryToleranceIn
    );
  });
}

function segmentsAreParallel(
  firstStart: Point,
  firstEnd: Point,
  secondStart: Point,
  secondEnd: Point,
) {
  const firstDx = firstEnd.x - firstStart.x;
  const firstDy = firstEnd.y - firstStart.y;
  const secondDx = secondEnd.x - secondStart.x;
  const secondDy = secondEnd.y - secondStart.y;
  const firstLength = Math.hypot(firstDx, firstDy);
  const secondLength = Math.hypot(secondDx, secondDy);
  if (firstLength < 1 || secondLength < 1) {
    return false;
  }
  const cross = Math.abs(firstDx * secondDy - firstDy * secondDx);
  return cross / (firstLength * secondLength) <= 0.02;
}

function wallSortValue(wall: WallSegment, direction: string) {
  const midpoint = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
  return direction.includes("north") || direction.includes("south")
    ? midpoint.x
    : midpoint.y;
}

function numericSuffix(shortId: string) {
  return shortId.replace(/^\D+/, "") || shortId;
}

function compassLabel(direction: ReturnType<typeof compassDirection>) {
  switch (direction) {
    case "N":
      return "north";
    case "NE":
      return "northeast";
    case "E":
      return "east";
    case "SE":
      return "southeast";
    case "S":
      return "south";
    case "SW":
      return "southwest";
    case "W":
      return "west";
    case "NW":
      return "northwest";
  }
}
