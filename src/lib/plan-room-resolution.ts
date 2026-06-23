import { pointInPolygon, polygonArea, type Point } from "./plan-geometry";

export type PlanRoomResolutionLevel = {
  levelId: string;
  name: string;
  levelType: "indoor" | "outdoor";
};

export type PlanRoomResolutionEntity = {
  entityId: string;
  levelId: string;
  shortId: string;
  name?: string;
  room?: {
    points: Point[];
  };
};

export type PlanRoomResolutionPlacement = {
  placementId: string;
  levelId: string;
  x: number;
  y: number;
  parentPlacementId?: string;
};

export type PlanResolvedRoom = {
  levelId: string;
  levelName: string;
  levelType: "indoor" | "outdoor";
  roomEntityId?: string;
  roomShortId?: string;
  roomName: string;
  moveSpaceKind: "destinationRoom" | "yardOutdoor";
  inheritedFromPlacementId?: string;
};

export function resolvePlacementRoom(input: {
  placementId: string;
  levels: PlanRoomResolutionLevel[];
  rooms: PlanRoomResolutionEntity[];
  placements: PlanRoomResolutionPlacement[];
}): PlanResolvedRoom | undefined {
  const placementById = new Map(
    input.placements.map((placement) => [placement.placementId, placement]),
  );
  const placement = placementById.get(input.placementId);
  if (!placement) {
    return undefined;
  }

  const visited = new Set<string>();
  let cursor: PlanRoomResolutionPlacement | undefined = placement;
  let inheritedFromPlacementId: string | undefined;
  while (cursor?.parentPlacementId && !visited.has(cursor.parentPlacementId)) {
    visited.add(cursor.placementId);
    inheritedFromPlacementId = cursor.parentPlacementId;
    cursor = placementById.get(cursor.parentPlacementId);
  }

  if (!cursor) {
    return undefined;
  }

  const level = input.levels.find((entry) => entry.levelId === cursor.levelId);
  if (!level) {
    return undefined;
  }

  const containingRooms = input.rooms
    .filter((room) => room.levelId === cursor.levelId && room.room)
    .filter((room) => pointInPolygon({ x: cursor.x, y: cursor.y }, room.room!.points))
    .sort((left, right) => {
      const leftArea = left.room ? polygonArea(left.room.points) : Number.MAX_VALUE;
      const rightArea = right.room ? polygonArea(right.room.points) : Number.MAX_VALUE;
      return leftArea - rightArea;
    });
  const room = containingRooms[0];
  const roomName = room?.name?.trim() || room?.shortId || level.name;

  return {
    levelId: level.levelId,
    levelName: level.name,
    levelType: level.levelType,
    roomEntityId: room?.entityId,
    roomShortId: room?.shortId,
    roomName,
    moveSpaceKind: level.levelType === "outdoor" ? "yardOutdoor" : "destinationRoom",
    inheritedFromPlacementId:
      inheritedFromPlacementId === placement.placementId
        ? undefined
        : inheritedFromPlacementId,
  };
}
