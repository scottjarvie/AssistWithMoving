import { overlapToleranceIn } from "@/lib/floorplans/solver-constants";
import type { FloorplanSolvedRoom } from "@/lib/floorplans/types";

export type FloorplanOverlap = {
  firstRoomId: string;
  secondRoomId: string;
  areaSqIn: number;
  widthIn: number;
  depthIn: number;
};

export function detectRoomOverlaps(
  rooms: FloorplanSolvedRoom[],
  toleranceIn = overlapToleranceIn,
): FloorplanOverlap[] {
  const overlaps: FloorplanOverlap[] = [];
  for (let firstIndex = 0; firstIndex < rooms.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < rooms.length; secondIndex += 1) {
      const first = rooms[firstIndex];
      const second = rooms[secondIndex];
      if (overlapAllowed(first, second)) {
        continue;
      }
      const widthIn =
        Math.min(first.xIn + first.widthIn, second.xIn + second.widthIn) -
        Math.max(first.xIn, second.xIn);
      const depthIn =
        Math.min(first.yIn + first.depthIn, second.yIn + second.depthIn) -
        Math.max(first.yIn, second.yIn);
      if (widthIn > toleranceIn && depthIn > toleranceIn) {
        overlaps.push({
          firstRoomId: first.id,
          secondRoomId: second.id,
          widthIn,
          depthIn,
          areaSqIn: widthIn * depthIn,
        });
      }
    }
  }
  return overlaps;
}

export function rangesOverlap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
  tolerance = overlapToleranceIn,
) {
  return Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart) > tolerance;
}

export function pairKey(firstId: string, secondId: string) {
  return [firstId, secondId].sort().join("::");
}

export function connectedRoomIds(startRoomId: string, realizedPairs: Set<string>) {
  const connected = new Set<string>([startRoomId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const pair of realizedPairs) {
      const [firstId, secondId] = pair.split("::");
      if (connected.has(firstId) && !connected.has(secondId)) {
        connected.add(secondId);
        changed = true;
      }
      if (connected.has(secondId) && !connected.has(firstId)) {
        connected.add(firstId);
        changed = true;
      }
    }
  }
  return connected;
}

function overlapAllowed(
  first: FloorplanSolvedRoom,
  second: FloorplanSolvedRoom,
) {
  return (
    first.containedIn === second.id ||
    second.containedIn === first.id ||
    first.partialOutside ||
    second.partialOutside
  );
}
