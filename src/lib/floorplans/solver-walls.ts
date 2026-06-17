import {
  defaultWallThicknessIn,
  overlapToleranceIn,
} from "@/lib/floorplans/solver-constants";
import { rangesOverlap } from "@/lib/floorplans/solver-validation";
import type {
  FloorplanConfidence,
  FloorplanSolvedRoom,
  FloorplanSolvedWall,
  FloorplanWallOrientation,
} from "@/lib/floorplans/types";

export type RoomWallSide = "north" | "south" | "east" | "west";

type WallEdgeDraft = {
  room: FloorplanSolvedRoom;
  side: RoomWallSide;
  orientation: FloorplanWallOrientation;
  lineIn: number;
  startIn: number;
  endIn: number;
  x1In: number;
  y1In: number;
  x2In: number;
  y2In: number;
};

export function generateWalls(
  rooms: FloorplanSolvedRoom[],
): FloorplanSolvedWall[] {
  const edges = rooms.flatMap(roomEdges);
  const walls: FloorplanSolvedWall[] = [];

  for (const edge of edges) {
    const breakpoints = wallBreakpoints(edge, edges);
    for (let index = 0; index < breakpoints.length - 1; index += 1) {
      const startIn = breakpoints[index];
      const endIn = breakpoints[index + 1];
      if (endIn - startIn <= overlapToleranceIn) continue;
      const matchingEdges = edges.filter(
        (candidate) =>
          candidate.orientation === edge.orientation &&
          nearly(candidate.lineIn, edge.lineIn) &&
          rangesOverlap(candidate.startIn, candidate.endIn, startIn, endIn),
      );
      const roomIds = unique(matchingEdges.map((candidate) => candidate.room.id));
      const sideByRoomId = Object.fromEntries(
        matchingEdges.map((candidate) => [candidate.room.id, candidate.side]),
      ) as FloorplanSolvedWall["sideByRoomId"];
      const confidence = weakestConfidence(
        matchingEdges.map((candidate) => candidate.room.confidence),
      );
      const wallThickness = average(
        matchingEdges.map(
          (candidate) => candidate.room.wallThicknessIn ?? defaultWallThicknessIn,
        ),
      );
      const segment = wallSegmentFromEdge(edge, startIn, endIn);
      walls.push({
        id: canonicalWallId(edge.orientation, edge.lineIn, startIn, endIn),
        label: wallLabel(matchingEdges, edge.side),
        orientation: edge.orientation,
        ...segment,
        thicknessIn: wallThickness,
        confidence,
        roomIds,
        sideByRoomId,
        exterior: roomIds.length === 1,
        inferred: true,
        sourceMeasurementIds: unique(
          matchingEdges.flatMap((candidate) => candidate.room.sourceMeasurementIds),
        ),
      });
    }
  }

  return dedupeWalls(walls).sort((left, right) => {
    if (left.orientation !== right.orientation) {
      return left.orientation.localeCompare(right.orientation);
    }
    return left.y1In - right.y1In || left.x1In - right.x1In;
  });
}

export function wallForRoomSide(
  walls: FloorplanSolvedWall[],
  roomId: string,
  side: RoomWallSide,
) {
  const horizontal = side === "north" || side === "south";
  const candidates = walls.filter(
    (wall) =>
      wall.roomIds.includes(roomId) &&
      wall.orientation === (horizontal ? "horizontal" : "vertical") &&
      wall.sideByRoomId?.[roomId] === side,
  );
  return candidates.sort((left, right) => segmentLength(right) - segmentLength(left))[0];
}

export function segmentLength(segment: {
  orientation: FloorplanWallOrientation;
  x1In: number;
  y1In: number;
  x2In: number;
  y2In: number;
}) {
  return segment.orientation === "horizontal"
    ? Math.abs(segment.x2In - segment.x1In)
    : Math.abs(segment.y2In - segment.y1In);
}

export function nearly(first: number, second: number, tolerance = overlapToleranceIn) {
  return Math.abs(first - second) <= tolerance;
}

function roomEdges(room: FloorplanSolvedRoom): WallEdgeDraft[] {
  const right = room.xIn + room.widthIn;
  const bottom = room.yIn + room.depthIn;
  return [
    {
      room,
      side: "north",
      orientation: "horizontal",
      lineIn: room.yIn,
      startIn: room.xIn,
      endIn: right,
      x1In: room.xIn,
      y1In: room.yIn,
      x2In: right,
      y2In: room.yIn,
    },
    {
      room,
      side: "south",
      orientation: "horizontal",
      lineIn: bottom,
      startIn: room.xIn,
      endIn: right,
      x1In: room.xIn,
      y1In: bottom,
      x2In: right,
      y2In: bottom,
    },
    {
      room,
      side: "west",
      orientation: "vertical",
      lineIn: room.xIn,
      startIn: room.yIn,
      endIn: bottom,
      x1In: room.xIn,
      y1In: room.yIn,
      x2In: room.xIn,
      y2In: bottom,
    },
    {
      room,
      side: "east",
      orientation: "vertical",
      lineIn: right,
      startIn: room.yIn,
      endIn: bottom,
      x1In: right,
      y1In: room.yIn,
      x2In: right,
      y2In: bottom,
    },
  ];
}

function wallBreakpoints(edge: WallEdgeDraft, edges: WallEdgeDraft[]) {
  const breakpoints = [edge.startIn, edge.endIn];
  for (const candidate of edges) {
    if (candidate.room.id === edge.room.id) continue;
    if (candidate.orientation !== edge.orientation) continue;
    if (!nearly(candidate.lineIn, edge.lineIn)) continue;
    const overlapStart = Math.max(edge.startIn, candidate.startIn);
    const overlapEnd = Math.min(edge.endIn, candidate.endIn);
    if (overlapEnd - overlapStart <= overlapToleranceIn) continue;
    breakpoints.push(overlapStart, overlapEnd);
  }
  return uniqueNumbers(breakpoints).sort((left, right) => left - right);
}

function wallSegmentFromEdge(
  edge: WallEdgeDraft,
  startIn: number,
  endIn: number,
) {
  if (edge.orientation === "horizontal") {
    return {
      x1In: startIn,
      y1In: edge.lineIn,
      x2In: endIn,
      y2In: edge.lineIn,
    };
  }
  return {
    x1In: edge.lineIn,
    y1In: startIn,
    x2In: edge.lineIn,
    y2In: endIn,
  };
}

function canonicalWallId(
  orientation: FloorplanWallOrientation,
  lineIn: number,
  startIn: number,
  endIn: number,
) {
  return `wall-${orientation}-${roundKey(lineIn)}-${roundKey(startIn)}-${roundKey(endIn)}`;
}

function wallLabel(edges: WallEdgeDraft[], fallbackSide: RoomWallSide) {
  const uniqueEdges = uniqueByRoomSide(edges);
  if (uniqueEdges.length >= 2) {
    return `${uniqueEdges
      .map((edge) => edge.room.label)
      .slice(0, 2)
      .join(" / ")} shared wall`;
  }
  const edge = uniqueEdges[0];
  return edge ? `${edge.room.label} ${edge.side} wall` : `${fallbackSide} wall`;
}

function uniqueByRoomSide(edges: WallEdgeDraft[]) {
  const seen = new Set<string>();
  const uniqueEdges: WallEdgeDraft[] = [];
  for (const edge of edges) {
    const key = `${edge.room.id}:${edge.side}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueEdges.push(edge);
  }
  return uniqueEdges;
}

function dedupeWalls(walls: FloorplanSolvedWall[]) {
  const byKey = new Map<string, FloorplanSolvedWall>();
  for (const wall of walls) {
    const key = [
      wall.orientation,
      roundKey(wall.x1In),
      roundKey(wall.y1In),
      roundKey(wall.x2In),
      roundKey(wall.y2In),
    ].join(":");
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, wall);
      continue;
    }
    byKey.set(key, {
      ...existing,
      roomIds: unique([...existing.roomIds, ...wall.roomIds]),
      sideByRoomId: {
        ...(existing.sideByRoomId ?? {}),
        ...(wall.sideByRoomId ?? {}),
      },
      exterior: existing.exterior && wall.exterior,
      sourceMeasurementIds: unique([
        ...(existing.sourceMeasurementIds ?? []),
        ...(wall.sourceMeasurementIds ?? []),
      ]),
    });
  }
  return [...byKey.values()];
}

function average(values: number[]) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return defaultWallThicknessIn;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function uniqueNumbers(values: number[]) {
  return [...new Set(values.map(roundKey))];
}

function weakestConfidence(values: FloorplanConfidence[]) {
  const rank: Record<FloorplanConfidence, number> = {
    conflict: 0,
    low: 1,
    medium: 2,
    high: 3,
  };
  return values.reduce<FloorplanConfidence>(
    (weakest, value) => (rank[value] < rank[weakest] ? value : weakest),
    "high",
  );
}

function roundKey(value: number) {
  return Math.round(value * 10) / 10;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
