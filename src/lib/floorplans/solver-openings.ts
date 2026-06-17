import { overlapToleranceIn } from "@/lib/floorplans/solver-constants";
import {
  nearly,
  segmentLength,
  wallForRoomSide,
  type RoomWallSide,
} from "@/lib/floorplans/solver-walls";
import type {
  FloorplanObservation,
  FloorplanRelationship,
  FloorplanSolvedOpening,
  FloorplanSolvedRoom,
  FloorplanSolvedWall,
  FloorplanSolveDiagnostic,
  FloorplanUnresolvedGeometry,
  FloorplanWallOrientation,
} from "@/lib/floorplans/types";

type Rect = {
  xIn: number;
  yIn: number;
  widthIn: number;
  depthIn: number;
};

export function generateOpenings({
  rooms,
  walls,
  observations,
  relationships,
}: {
  rooms: FloorplanSolvedRoom[];
  walls: FloorplanSolvedWall[];
  observations: FloorplanObservation[];
  relationships: FloorplanRelationship[];
}) {
  const diagnostics: FloorplanSolveDiagnostic[] = [];
  const unresolved: FloorplanUnresolvedGeometry[] = [];
  const openings: FloorplanSolvedOpening[] = [];
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const openingObservations = observations.filter((observation) =>
    ["opening", "door", "doorway", "doorlessPassage", "window"].includes(
      observation.observationType,
    ),
  );

  for (const relationship of relationships.filter((entry) =>
    ["connectedTo", "accessesThrough", "doorlessPassageBetween"].includes(
      entry.relationshipType,
    ),
  )) {
    const first = roomById.get(relationship.fromSubjectKey);
    const second = roomById.get(relationship.toSubjectKey);
    const firstOpening = openingObservations.find(
      (entry) => entry.subjectKey === relationship.fromSubjectKey,
    );
    const secondOpening = openingObservations.find(
      (entry) => entry.subjectKey === relationship.toSubjectKey,
    );
    if ((!first || !second) && (firstOpening || secondOpening)) {
      const observation = firstOpening ?? secondOpening;
      const host = first ?? second;
      if (!observation || !host) continue;
      const placed = placeOpeningOnHostRoom({
        observation,
        host,
        walls,
        relationship,
      });
      if (placed) {
        openings.push(placed);
      } else {
        unresolved.push({
          id: `unresolved-opening-${relationship.id}`,
          label: observation.subjectLabel ?? observation.title,
          kind: "opening",
          subjectKey: observation.subjectKey,
          reason:
            "The relationship proves a doorway or passage, but it still needs a host wall side before CAD geometry can place it.",
          confidence: relationship.confidence,
          sourceRelationshipIds: [relationship.id],
          sourceObservationIds: relationship.sourceObservationIds,
        });
      }
      continue;
    }
    if (!first || !second) continue;
    const shared = sharedEdgeSegment(first, second);
    if (!shared) {
      unresolved.push({
        id: `unresolved-opening-${relationship.id}`,
        label: `${relationship.fromSubjectLabel} to ${relationship.toSubjectLabel}`,
        kind: "opening",
        subjectKey: relationship.fromSubjectKey,
        reason:
          "The relationship proves access, but the current solved rectangles do not share a wall. Add a direction, offset, or missing hall/wall measurement.",
        confidence: relationship.confidence,
        sourceRelationshipIds: [relationship.id],
        sourceObservationIds: relationship.sourceObservationIds,
      });
      continue;
    }
    const openingKind =
      relationship.relationshipType === "doorlessPassageBetween"
        ? "doorlessPassage"
        : "opening";
    const wall = nearestWallForSegment(walls, shared);
    openings.push({
      id: `opening-${relationship.id}`,
      label: `${relationship.fromSubjectLabel} to ${relationship.toSubjectLabel}`,
      kind: openingKind,
      confidence: relationship.confidence,
      xIn: (shared.x1In + shared.x2In) / 2,
      yIn: (shared.y1In + shared.y2In) / 2,
      widthIn: Math.min(48, Math.max(30, segmentLength(shared) * 0.55)),
      orientation: shared.orientation,
      wallId: wall?.id,
      connectsRoomIds: [first.id, second.id],
      note: relationship.notes,
      sourceRelationshipIds: [relationship.id],
      sourceObservationIds: relationship.sourceObservationIds,
      sourceMeasurementIds: relationship.sourceMeasurementIds,
    });
  }

  for (const relationship of relationships.filter(
    (entry) => entry.relationshipType === "openingIn",
  )) {
    const observation = openingObservations.find(
      (entry) => entry.subjectKey === relationship.fromSubjectKey,
    );
    const host = roomById.get(relationship.toSubjectKey);
    if (!host || !observation) continue;
    const placed = placeOpeningOnHostRoom({
      observation,
      host,
      walls,
      relationship,
    });
    if (placed) {
      openings.push(placed);
    } else {
      unresolved.push({
        id: `unresolved-opening-${relationship.id}`,
        label: relationship.fromSubjectLabel,
        kind: "opening",
        subjectKey: relationship.fromSubjectKey,
        reason:
          "The opening has a host room but no usable wall side. Add side or wall evidence.",
        confidence: relationship.confidence,
        sourceRelationshipIds: [relationship.id],
        sourceObservationIds: relationship.sourceObservationIds,
      });
    }
  }

  const attachedOpeningKeys = new Set(
    relationships.flatMap((relationship) => [
      relationship.fromSubjectKey,
      relationship.toSubjectKey,
    ]),
  );
  for (const observation of openingObservations) {
    if (!observation.subjectKey || attachedOpeningKeys.has(observation.subjectKey)) {
      continue;
    }
    unresolved.push({
      id: `floating-${observation.id}`,
      label: observation.title,
      kind: "opening",
      subjectKey: observation.subjectKey,
      reason:
        "This door/window/opening observation is not attached to a room or wall relationship yet.",
      confidence: observation.confidence,
      sourceObservationIds: [observation.id],
    });
  }

  if (unresolved.length) {
    diagnostics.push({
      id: "unresolved-openings",
      severity: "warning",
      title: "Some openings are unresolved",
      detail:
        "Openings must attach to a wall or connect two touching spaces before they can become CAD geometry.",
      observationIds: unresolved.flatMap((entry) => entry.sourceObservationIds ?? []),
      relationshipIds: unresolved.flatMap((entry) => entry.sourceRelationshipIds ?? []),
      impactScore: 78,
    });
  }

  return {
    openings: uniqueById(openings),
    unresolved,
    diagnostics,
  };
}

function sharedEdgeSegment(first: Rect, second: Rect) {
  const firstRight = first.xIn + first.widthIn;
  const secondRight = second.xIn + second.widthIn;
  const firstBottom = first.yIn + first.depthIn;
  const secondBottom = second.yIn + second.depthIn;

  if (nearly(firstRight, second.xIn)) {
    const y1In = Math.max(first.yIn, second.yIn);
    const y2In = Math.min(firstBottom, secondBottom);
    if (y2In - y1In > overlapToleranceIn) {
      return {
        orientation: "vertical" as const,
        x1In: firstRight,
        y1In,
        x2In: firstRight,
        y2In,
      };
    }
  }
  if (nearly(first.xIn, secondRight)) {
    const y1In = Math.max(first.yIn, second.yIn);
    const y2In = Math.min(firstBottom, secondBottom);
    if (y2In - y1In > overlapToleranceIn) {
      return {
        orientation: "vertical" as const,
        x1In: first.xIn,
        y1In,
        x2In: first.xIn,
        y2In,
      };
    }
  }
  if (nearly(firstBottom, second.yIn)) {
    const x1In = Math.max(first.xIn, second.xIn);
    const x2In = Math.min(firstRight, secondRight);
    if (x2In - x1In > overlapToleranceIn) {
      return {
        orientation: "horizontal" as const,
        x1In,
        y1In: firstBottom,
        x2In,
        y2In: firstBottom,
      };
    }
  }
  if (nearly(first.yIn, secondBottom)) {
    const x1In = Math.max(first.xIn, second.xIn);
    const x2In = Math.min(firstRight, secondRight);
    if (x2In - x1In > overlapToleranceIn) {
      return {
        orientation: "horizontal" as const,
        x1In,
        y1In: first.yIn,
        x2In,
        y2In: first.yIn,
      };
    }
  }
  return null;
}

function nearestWallForSegment(
  walls: FloorplanSolvedWall[],
  segment: {
    orientation: FloorplanWallOrientation;
    x1In: number;
    y1In: number;
    x2In: number;
    y2In: number;
  },
) {
  const segmentLine = segment.orientation === "horizontal" ? segment.y1In : segment.x1In;
  const segmentStart =
    segment.orientation === "horizontal"
      ? Math.min(segment.x1In, segment.x2In)
      : Math.min(segment.y1In, segment.y2In);
  const segmentEnd =
    segment.orientation === "horizontal"
      ? Math.max(segment.x1In, segment.x2In)
      : Math.max(segment.y1In, segment.y2In);
  const segmentMidpoint = (segmentStart + segmentEnd) / 2;
  return walls
    .filter((wall) => wall.orientation === segment.orientation)
    .map((wall) => {
      const wallLine = wall.orientation === "horizontal" ? wall.y1In : wall.x1In;
      const wallStart =
        wall.orientation === "horizontal"
          ? Math.min(wall.x1In, wall.x2In)
          : Math.min(wall.y1In, wall.y2In);
      const wallEnd =
        wall.orientation === "horizontal"
          ? Math.max(wall.x1In, wall.x2In)
          : Math.max(wall.y1In, wall.y2In);
      const overlap = Math.max(
        0,
        Math.min(wallEnd, segmentEnd) - Math.max(wallStart, segmentStart),
      );
      const containsMidpoint =
        segmentMidpoint >= wallStart - overlapToleranceIn &&
        segmentMidpoint <= wallEnd + overlapToleranceIn;
      return {
        wall,
        score:
          (nearly(wallLine, segmentLine, 6) ? 1000 : 0) +
          overlap +
          (containsMidpoint ? 100 : 0),
      };
    })
    .filter((entry) => entry.score >= 100)
    .sort((left, right) => right.score - left.score)[0]?.wall;
}

function placeOpeningOnHostRoom({
  observation,
  host,
  walls,
  relationship,
}: {
  observation: FloorplanObservation;
  host: FloorplanSolvedRoom;
  walls: FloorplanSolvedWall[];
  relationship: FloorplanRelationship;
}): FloorplanSolvedOpening | null {
  const placement = openingWallForHost({ observation, host, walls });
  if (!placement) return null;
  const { wall, side } = placement;
  if (!wall) return null;
  const widthIn =
    numberFromNormalized(observation.normalized?.widthIn) ??
    numberFromNormalized(observation.normalized?.openingWidthIn) ??
    (observation.observationType === "window" ? 48 : 36);
  const horizontal = wall.orientation === "horizontal";
  return {
    id: `opening-${observation.id}`,
    label: observation.subjectLabel ?? observation.title,
    kind: observation.observationType === "window"
      ? "window"
      : observation.observationType === "doorlessPassage"
        ? "doorlessPassage"
        : observation.observationType === "door"
          ? "door"
          : observation.observationType === "doorway"
            ? "doorway"
          : "opening",
    confidence: observation.confidence,
    xIn: horizontal ? (wall.x1In + wall.x2In) / 2 : wall.x1In,
    yIn: horizontal ? wall.y1In : (wall.y1In + wall.y2In) / 2,
    widthIn,
    orientation: wall.orientation,
    wallId: wall.id,
    hostRoomId: host.id,
    swing:
      observation.observationType === "door"
        ? {
            hinge: "left",
            orientation: side === "south" ? "up" : side === "north" ? "down" : side === "east" ? "left" : "right",
          }
        : undefined,
    note: relationship.notes ?? observation.notes,
    sourceObservationIds: [observation.id],
    sourceRelationshipIds: [relationship.id],
    sourceMeasurementIds: observation.relatedMeasurementIds,
  };
}

function openingWallForHost({
  observation,
  host,
  walls,
}: {
  observation: FloorplanObservation;
  host: FloorplanSolvedRoom;
  walls: FloorplanSolvedWall[];
}) {
  const explicitSide = openingSide(observation);
  if (explicitSide) {
    const explicitWall = wallForRoomSide(walls, host.id, explicitSide);
    if (explicitWall) {
      return { wall: explicitWall, side: explicitSide };
    }
  }

  const hostWalls = walls.filter((wall) => wall.roomIds.includes(host.id));
  const exteriorWalls = hostWalls.filter((wall) => wall.exterior);
  const candidates =
    observation.observationType === "window" && exteriorWalls.length
      ? exteriorWalls
      : hostWalls;
  const wall = candidates.sort((left, right) => {
    const exteriorScore = Number(right.exterior) - Number(left.exterior);
    if (exteriorScore) return exteriorScore;
    return segmentLength(right) - segmentLength(left);
  })[0];
  const side = wall?.sideByRoomId?.[host.id];
  if (!wall || !side) return null;
  return { wall, side };
}

function openingSide(observation: FloorplanObservation): RoomWallSide | undefined {
  const side = observation.normalized?.side ?? observation.normalized?.wallSide;
  if (side === "north" || side === "south" || side === "east" || side === "west") {
    return side;
  }
  const text = `${observation.rawText ?? ""} ${observation.notes ?? ""}`.toLowerCase();
  if (text.includes("back") || text.includes("rear") || text.includes("top")) return "north";
  if (text.includes("front") || text.includes("bottom")) return "south";
  if (text.includes("right") || text.includes("east")) return "east";
  if (text.includes("left") || text.includes("west")) return "west";
  return undefined;
}

function uniqueById<T extends { id: string }>(values: T[]) {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

function numberFromNormalized(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
