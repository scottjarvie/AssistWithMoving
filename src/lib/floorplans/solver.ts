import {
  dimensionFromConstraint,
} from "@/lib/floorplans/solver-measurements";
export { measurementsForSubject } from "@/lib/floorplans/solver-measurements";
import {
  compileFloorplanEvidenceGraph,
} from "@/lib/floorplans/solver-compiler";
export {
  compileFloorplanEvidenceGraph,
  roomConstraintFromMeasurements,
} from "@/lib/floorplans/solver-compiler";
import {
  floorplanBounds,
  formatInches,
  normalizeOrigins,
  type FloorplanRect,
} from "@/lib/floorplans/solver-geometry";
export { formatInches } from "@/lib/floorplans/solver-geometry";
export { floorplanSolveToPlanOps } from "@/lib/floorplans/solver-plan-ops";
import { generateFixtures } from "@/lib/floorplans/solver-fixtures";
import {
  generateWalls,
  nearly,
  segmentLength,
  wallForRoomSide,
  type RoomWallSide,
} from "@/lib/floorplans/solver-walls";
import {
  connectedRoomIds,
  detectRoomOverlaps,
  pairKey,
} from "@/lib/floorplans/solver-validation";
export { detectRoomOverlaps } from "@/lib/floorplans/solver-validation";
export type { FloorplanOverlap } from "@/lib/floorplans/solver-validation";
import {
  rankedSolveGaps,
  scoreDataQuality,
} from "@/lib/floorplans/solver-quality";
import type {
  FloorplanPropertyZoneConstraint,
  FloorplanPuzzleInput,
  FloorplanRoomConstraint,
} from "@/lib/floorplans/solver-types";
export type {
  CompiledFloorplanGraph,
  FloorplanPropertyZoneConstraint,
  FloorplanPuzzleInput,
  FloorplanRoomConstraint,
} from "@/lib/floorplans/solver-types";
import {
  defaultGapIn,
  defaultRoomDepthIn,
  defaultRoomWidthIn,
  defaultWallThicknessIn,
  overlapToleranceIn,
  placementStepIn,
  solverVersion,
} from "@/lib/floorplans/solver-constants";
import type {
  FloorplanObservation,
  FloorplanRelationship,
  FloorplanSolvedOpening,
  FloorplanSolvedRoom,
  FloorplanSolvedWall,
  FloorplanSolvedZone,
  FloorplanSolveDiagnostic,
  FloorplanSolveResult,
  FloorplanUnresolvedGeometry,
  FloorplanWallOrientation,
} from "@/lib/floorplans/types";
import {
  calculateFloorplanAreas,
  countsTowardConditionedArea,
  defaultAreaRoleForSpace,
  squareFeetFromInches,
} from "@/lib/floorplans/calculations";

type SolvedRoomWithFlags = {
  room: FloorplanSolvedRoom;
  usedAssumedSize: boolean;
  usedAssumedWall: boolean;
};

type Rect = FloorplanRect;

export function solveFloorplanPuzzle(input: FloorplanPuzzleInput): FloorplanSolveResult {
  const compiled = compileFloorplanEvidenceGraph(input);
  const diagnostics: FloorplanSolveDiagnostic[] = [...compiled.diagnostics];
  const rooms = placeRooms(compiled.rooms, diagnostics);
  const zones = solvePropertyZones(compiled.zones, rooms);
  const overlaps = detectRoomOverlaps(rooms);

  for (const overlap of overlaps) {
    diagnostics.push({
      id: `overlap-${overlap.firstRoomId}-${overlap.secondRoomId}`,
      severity: "conflict",
      title: "Rooms overlap",
      detail: `${overlap.firstRoomId} and ${overlap.secondRoomId} overlap by ${Math.round(
        overlap.areaSqIn,
      )} square inches. Rooms must touch or share walls, not occupy the same space.`,
      roomIds: [overlap.firstRoomId, overlap.secondRoomId],
      impactScore: 98,
    });
  }

  const walls = generateWalls(rooms);
  const openingResult = generateOpenings({
    rooms,
    walls,
    observations: compiled.observations,
    relationships: compiled.relationships,
  });
  const fixtureResult = generateFixtures({
    rooms,
    observations: compiled.observations,
    relationships: compiled.relationships,
  });
  const area = calculateFloorplanAreas({
    rooms,
    zones,
    measurements: compiled.measurements,
  });
  const missingAreaResult = missingAreaGeometry({
    areaSummary: area.summary,
    rooms,
    zones,
  });
  const unresolvedGeometry = [
    ...openingResult.unresolved,
    ...fixtureResult.unresolved,
    ...unresolvedSpaceGeometry(compiled.rooms, rooms),
    ...missingAreaResult.unresolved,
  ];
  diagnostics.push(
    ...openingResult.diagnostics,
    ...fixtureResult.diagnostics,
    ...missingAreaResult.diagnostics,
    ...validateSolvedAccess({
      rooms,
      openings: openingResult.openings,
      relationships: compiled.relationships,
    }),
  );
  diagnostics.push(...area.diagnostics);

  const dataQuality = scoreDataQuality({
    rooms,
    zones,
    openings: openingResult.openings,
    fixtures: fixtureResult.fixtures,
    unresolvedGeometry,
    diagnostics,
    measurements: compiled.measurements,
    relationships: compiled.relationships,
    areaSummary: area.summary,
  });
  const gaps = rankedSolveGaps({
    rooms,
    unresolvedGeometry,
    measurements: compiled.measurements,
    relationships: compiled.relationships,
    areaGaps: area.gaps,
    dataQuality,
  });

  const hasConflict = diagnostics.some((entry) => entry.severity === "conflict");
  const hasWarning =
    diagnostics.some((entry) => entry.severity === "warning") ||
    unresolvedGeometry.length > 0 ||
    dataQuality.overall < 82;

  return {
    solverVersion,
    status: hasConflict ? "conflict" : hasWarning ? "incomplete" : "valid",
    rooms,
    zones,
    walls,
    openings: openingResult.openings,
    fixtures: fixtureResult.fixtures,
    unresolvedGeometry,
    dataQuality,
    areaTargets: area.areaTargets,
    areaSummary: area.summary,
    calculations: area.calculations,
    gaps,
    diagnostics,
    bounds: floorplanBounds([
      ...rooms,
      ...zones,
      ...unresolvedGeometry.map((entry, index) => ({
        id: entry.id,
        xIn: entry.xIn ?? rooms[index % Math.max(rooms.length, 1)]?.xIn ?? 0,
        yIn: entry.yIn ?? rooms[index % Math.max(rooms.length, 1)]?.yIn ?? 0,
        widthIn: entry.widthIn ?? 36,
        depthIn: entry.depthIn ?? 36,
      })),
    ]),
  };
}

function placeRooms(
  constraints: FloorplanRoomConstraint[],
  diagnostics: FloorplanSolveDiagnostic[],
): FloorplanSolvedRoom[] {
  const solved: FloorplanSolvedRoom[] = [];
  const pending = [...constraints];

  while (pending.length) {
    const nextIndex = nextPlaceableIndex(pending, solved);
    const constraint = pending.splice(nextIndex, 1)[0];
    const relativeRoom = constraint.relativeTo
      ? solved.find((room) => room.id === constraint.relativeTo?.roomId)
      : undefined;
    const solvedRoom = solveRoom(constraint, relativeRoom);
    let room = solvedRoom.room;
    const before = { xIn: room.xIn, yIn: room.yIn };
    const hardPosition =
      typeof constraint.xIn === "number" && typeof constraint.yIn === "number";
    if (!hardPosition) {
      room = avoidCollisions(room, solved, constraint.relativeTo);
    }

    if (solvedRoom.usedAssumedSize) {
      diagnostics.push({
        id: `${constraint.id}-assumed-size`,
        severity: "warning",
        title: `${constraint.label} needs dimensions`,
        detail:
          "The solver used a placeholder rectangle or range midpoint because no hard width/depth evidence is available.",
        roomIds: [constraint.id],
        measurementIds: constraint.sourceMeasurementIds,
        observationIds: constraint.sourceObservationIds,
        relationshipIds: constraint.sourceRelationshipIds,
        impactScore: 82,
      });
    }
    if (solvedRoom.usedAssumedWall) {
      diagnostics.push({
        id: `${constraint.id}-assumed-wall-thickness`,
        severity: "info",
        title: `${constraint.label} wall thickness is assumed`,
        detail:
          "The solver reserves wall space using a 4.5 in default because no wall-thickness evidence was recorded.",
        roomIds: [constraint.id],
        measurementIds: constraint.sourceMeasurementIds,
        impactScore: 45,
      });
    }
    if (!room.connectsTo?.length && solved.length > 0) {
      diagnostics.push({
        id: `${constraint.id}-missing-circulation`,
        severity: "warning",
        title: `${constraint.label} needs access path evidence`,
        detail:
          "Every usable destination needs a route: through another room, a hall, an opening, or a door. No connection evidence is attached yet.",
        roomIds: [constraint.id],
        observationIds: constraint.sourceObservationIds,
        impactScore: 76,
      });
    }
    if (
      !hardPosition &&
      (Math.abs(room.xIn - before.xIn) > 0.01 ||
        Math.abs(room.yIn - before.yIn) > 0.01)
    ) {
      diagnostics.push({
        id: `${constraint.id}-collision-slide`,
        severity: "info",
        title: `${constraint.label} was shifted to avoid overlap`,
        detail:
          "The solver preserved the requested relationship as much as possible, then slid the space along the perpendicular axis so rooms touch but do not overlap.",
        roomIds: [constraint.id],
        relationshipIds: constraint.sourceRelationshipIds,
        impactScore: 38,
      });
    }
    solved.push(room);
  }

  return normalizeOrigins(solved);
}

function nextPlaceableIndex(
  pending: FloorplanRoomConstraint[],
  solved: FloorplanSolvedRoom[],
) {
  const explicitIndex = pending.findIndex(
    (room) => typeof room.xIn === "number" && typeof room.yIn === "number",
  );
  if (!solved.length) {
    return explicitIndex >= 0 ? explicitIndex : 0;
  }
  const relativeIndex = pending.findIndex((room) =>
    room.relativeTo
      ? solved.some((solvedRoom) => solvedRoom.id === room.relativeTo?.roomId)
      : false,
  );
  if (relativeIndex >= 0) return relativeIndex;
  const connectedIndex = pending.findIndex((room) =>
    room.connectsTo?.some((connection) =>
      solved.some((solvedRoom) => solvedRoom.id === connection.targetRoomId),
    ),
  );
  return connectedIndex >= 0 ? connectedIndex : 0;
}

function solveRoom(
  room: FloorplanRoomConstraint,
  relativeRoom: FloorplanSolvedRoom | undefined,
): SolvedRoomWithFlags {
  const widthIn = dimensionFromConstraint(
    room.widthIn,
    room.widthRangeIn,
    defaultRoomWidthIn,
  );
  const depthIn = dimensionFromConstraint(
    room.depthIn,
    room.depthRangeIn,
    defaultRoomDepthIn,
  );
  const usedAssumedSize = !widthIn.known || !depthIn.known;
  const size = {
    widthIn: widthIn.value,
    depthIn: depthIn.value,
  };
  const wallThicknessIn = room.wallThicknessIn ?? defaultWallThicknessIn;
  const kind = room.kind ?? "room";
  const areaRole = defaultAreaRoleForSpace({
    kind,
    explicitRole: room.areaRole,
  });
  const clearWidthIn =
    room.clearWidthIn ?? Math.max(0, size.widthIn - wallThicknessIn * 2);
  const clearDepthIn =
    room.clearDepthIn ?? Math.max(0, size.depthIn - wallThicknessIn * 2);
  const usedAssumedWall = room.wallThicknessIn === undefined;
  const origin =
    room.relativeTo && relativeRoom
      ? relativeOrigin(room, relativeRoom, size)
      : {
          xIn: room.xIn ?? 0,
          yIn: room.yIn ?? 0,
        };

  return {
    usedAssumedSize,
    usedAssumedWall,
    room: {
      id: room.id,
      label: room.label,
      kind,
      areaRole,
      confidence: room.confidence ?? (usedAssumedSize ? "low" : "medium"),
      xIn: origin.xIn,
      yIn: origin.yIn,
      widthIn: size.widthIn,
      depthIn: size.depthIn,
      clearWidthIn,
      clearDepthIn,
      wallThicknessIn,
      measurementLabel: `${formatInches(size.widthIn)} x ${formatInches(size.depthIn)}`,
      areaSqFt: squareFeetFromInches(size.widthIn, size.depthIn),
      countsTowardConditionedArea: countsTowardConditionedArea(areaRole),
      accessNote: room.accessNote,
      unresolvedSubspaces: room.unresolvedSubspaces,
      connectsTo: room.connectsTo,
      containedIn: room.containedIn,
      partialOutside: room.partialOutside,
      sourceMeasurementIds: room.sourceMeasurementIds ?? [],
    },
  };
}

function avoidCollisions(
  room: FloorplanSolvedRoom,
  placed: FloorplanSolvedRoom[],
  relativeTo?: FloorplanRoomConstraint["relativeTo"],
) {
  let candidate = { ...room };
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (!detectRoomOverlaps([...placed, candidate]).length) {
      return candidate;
    }
    const axis =
      relativeTo?.relation === "rightOf" || relativeTo?.relation === "leftOf"
        ? "y"
        : relativeTo?.relation === "above" || relativeTo?.relation === "below"
          ? "x"
          : attempt % 2 === 0
            ? "x"
            : "y";
    if (axis === "x") {
      candidate = { ...candidate, xIn: candidate.xIn + placementStepIn };
    } else {
      candidate = { ...candidate, yIn: candidate.yIn + placementStepIn };
    }
  }
  return candidate;
}

function solvePropertyZones(
  zones: FloorplanPropertyZoneConstraint[],
  rooms: FloorplanSolvedRoom[],
): FloorplanSolvedZone[] {
  const roomBounds = floorplanBounds(rooms);
  return zones.map((zone, index) => {
    const widthIn = dimensionFromConstraint(
      zone.widthIn,
      zone.widthRangeIn,
      zone.kind === "lot" ? Math.max(roomBounds.widthIn + 480, 720) : defaultRoomWidthIn,
    );
    const depthIn = dimensionFromConstraint(
      zone.depthIn,
      zone.depthRangeIn,
      zone.kind === "lot" ? Math.max(roomBounds.depthIn + 480, 720) : defaultRoomDepthIn,
    );
    const areaRole = defaultAreaRoleForSpace({
      kind: zone.kind,
      explicitRole: zone.areaRole,
    });
    const location = zoneLocationOrigin(zone, index, roomBounds, {
      widthIn: widthIn.value,
      depthIn: depthIn.value,
    });
    return {
      id: zone.id,
      label: zone.label,
      kind: zone.kind,
      areaRole,
      confidence: zone.confidence ?? (!widthIn.known || !depthIn.known ? "low" : "medium"),
      xIn: zone.xIn ?? location.xIn,
      yIn: zone.yIn ?? location.yIn,
      widthIn: widthIn.value,
      depthIn: depthIn.value,
      areaSqFt: squareFeetFromInches(widthIn.value, depthIn.value),
      countsTowardConditionedArea: countsTowardConditionedArea(areaRole),
      sourceMeasurementIds: zone.sourceMeasurementIds ?? [],
      partialOutside: zone.partialOutside,
      note: zone.note,
    } satisfies FloorplanSolvedZone;
  });
}

function generateOpenings({
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

function validateSolvedAccess({
  rooms,
  openings,
  relationships,
}: {
  rooms: FloorplanSolvedRoom[];
  openings: FloorplanSolvedOpening[];
  relationships: FloorplanRelationship[];
}): FloorplanSolveDiagnostic[] {
  const diagnostics: FloorplanSolveDiagnostic[] = [];
  const roomIds = new Set(rooms.map((room) => room.id));
  const realizedPairs = new Set(
    openings
      .flatMap((opening) => {
        if (!opening.connectsRoomIds || opening.connectsRoomIds.length < 2) return [];
        return [pairKey(opening.connectsRoomIds[0], opening.connectsRoomIds[1])];
      }),
  );
  const accessRelationships = relationships.filter(
    (relationship) =>
      ["connectedTo", "accessesThrough", "doorlessPassageBetween"].includes(
        relationship.relationshipType,
      ) &&
      roomIds.has(relationship.fromSubjectKey) &&
      roomIds.has(relationship.toSubjectKey),
  );
  const unrealized = accessRelationships.filter(
    (relationship) =>
      !realizedPairs.has(pairKey(relationship.fromSubjectKey, relationship.toSubjectKey)),
  );

  if (unrealized.length) {
    diagnostics.push({
      id: "unrealized-access-relationships",
      severity: "warning",
      title: "Some access routes are not physically realized",
      detail:
        "The evidence graph says these rooms connect, but the current rectangles do not share enough wall for a doorway/passage. Add direction, hall width, or missing room dimensions.",
      roomIds: unique(
        unrealized.flatMap((relationship) => [
          relationship.fromSubjectKey,
          relationship.toSubjectKey,
        ]),
      ),
      relationshipIds: unrealized.map((relationship) => relationship.id),
      impactScore: 88,
    });
  }

  if (rooms.length > 1) {
    const connected = connectedRoomIds(rooms[0].id, realizedPairs);
    const isolated = rooms.filter((room) => !connected.has(room.id));
    if (isolated.length) {
      diagnostics.push({
        id: "generated-access-graph-disconnected",
        severity: "warning",
        title: "Generated access graph is disconnected",
        detail: `${isolated
          .slice(0, 5)
          .map((room) => room.label)
          .join(", ")} are not connected by realized openings/passages in the current draft.`,
        roomIds: isolated.map((room) => room.id),
        impactScore: 84,
      });
    }
  }

  return diagnostics;
}

function unresolvedSpaceGeometry(
  constraints: FloorplanRoomConstraint[],
  rooms: FloorplanSolvedRoom[],
): FloorplanUnresolvedGeometry[] {
  const solvedIds = new Set(rooms.map((room) => room.id));
  return constraints
    .filter((constraint) => !solvedIds.has(constraint.id))
    .map((constraint) => ({
      id: `unresolved-space-${constraint.id}`,
      label: constraint.label,
      kind: "space" as const,
      subjectKey: constraint.id,
      reason:
        "The subject exists in the graph but did not produce solved room geometry.",
      confidence: constraint.confidence ?? "low",
      sourceObservationIds: constraint.sourceObservationIds,
      sourceRelationshipIds: constraint.sourceRelationshipIds,
      sourceMeasurementIds: constraint.sourceMeasurementIds,
    }));
}

function missingAreaGeometry({
  areaSummary,
  rooms,
  zones,
}: {
  areaSummary: FloorplanSolveResult["areaSummary"];
  rooms: FloorplanSolvedRoom[];
  zones: FloorplanSolvedZone[];
}) {
  const unresolved: FloorplanUnresolvedGeometry[] = [];
  const diagnostics: FloorplanSolveDiagnostic[] = [];
  const missingSqFt =
    areaSummary.status === "underTarget" && areaSummary.varianceSqFt
      ? Math.abs(areaSummary.varianceSqFt)
      : 0;
  if (!areaSummary.officialTargetSqFt || missingSqFt < 25) {
    return { unresolved, diagnostics };
  }

  const bounds = floorplanBounds([...rooms, ...zones]);
  const widthIn = Math.max(96, Math.min(bounds.widthIn || 240, Math.sqrt(missingSqFt) * 12));
  const depthIn = Math.max(72, (missingSqFt * 144) / widthIn);
  unresolved.push({
    id: "missing-conditioned-area",
    label: `${Math.round(missingSqFt).toLocaleString()} sq ft unexplained conditioned area`,
    kind: "missingArea",
    subjectKey: "conditioned-area-target",
    xIn: bounds.maxXIn + 36,
    yIn: bounds.minYIn,
    widthIn,
    depthIn,
    areaSqFt: missingSqFt,
    reason:
      "The generated rooms do not reconcile to the official conditioned square footage target. This placeholder represents area the evidence graph has not explained yet.",
    confidence: "low",
  });
  diagnostics.push({
    id: "missing-conditioned-area-region",
    severity: "warning",
    title: "Official square footage is not explained by solved rooms",
    detail: `The current room graph is about ${Math.round(
      missingSqFt,
    ).toLocaleString()} sq ft under the listed conditioned area. The solver added an unresolved area region instead of stretching known rooms.`,
    subjectKeys: ["conditioned-area-target"],
    impactScore: 92,
  });
  return { unresolved, diagnostics };
}

function relativeOrigin(
  room: FloorplanRoomConstraint,
  relativeRoom: FloorplanSolvedRoom,
  size: { widthIn: number; depthIn: number },
) {
  const relation = room.relativeTo?.relation ?? "rightOf";
  const gapIn = room.relativeTo?.gapIn ?? defaultGapIn;
  const align = room.relativeTo?.align ?? "start";
  const xAligned = alignedOrigin(
    relativeRoom.xIn,
    relativeRoom.widthIn,
    size.widthIn,
    align,
  );
  const yAligned = alignedOrigin(
    relativeRoom.yIn,
    relativeRoom.depthIn,
    size.depthIn,
    align,
  );

  if (relation === "rightOf") {
    return { xIn: relativeRoom.xIn + relativeRoom.widthIn + gapIn, yIn: yAligned };
  }
  if (relation === "leftOf") {
    return { xIn: relativeRoom.xIn - size.widthIn - gapIn, yIn: yAligned };
  }
  if (relation === "below") {
    return { xIn: xAligned, yIn: relativeRoom.yIn + relativeRoom.depthIn + gapIn };
  }
  return { xIn: xAligned, yIn: relativeRoom.yIn - size.depthIn - gapIn };
}

function alignedOrigin(
  anchorStart: number,
  anchorSize: number,
  ownSize: number,
  align: "start" | "center" | "end",
) {
  if (align === "center") {
    return anchorStart + (anchorSize - ownSize) / 2;
  }
  if (align === "end") {
    return anchorStart + anchorSize - ownSize;
  }
  return anchorStart;
}

function zoneLocationOrigin(
  zone: FloorplanPropertyZoneConstraint,
  index: number,
  bounds: FloorplanSolveResult["bounds"],
  size: { widthIn: number; depthIn: number },
) {
  if (zone.kind === "lot") {
    return {
      xIn: bounds.minXIn - Math.max(240, (size.widthIn - bounds.widthIn) / 2),
      yIn: bounds.minYIn - Math.max(240, (size.depthIn - bounds.depthIn) / 2),
    };
  }
  if (zone.kind === "patio" || zone.kind === "deck" || zone.kind === "porch") {
    return { xIn: bounds.minXIn + bounds.widthIn * 0.45, yIn: bounds.minYIn - size.depthIn };
  }
  if (zone.kind === "carport" || zone.kind === "driveway") {
    return { xIn: bounds.minXIn - size.widthIn, yIn: bounds.maxYIn - size.depthIn };
  }
  if (zone.kind === "shed" || zone.kind === "garage" || zone.kind === "custom") {
    return {
      xIn: bounds.minXIn - size.widthIn + index * 24,
      yIn: bounds.minYIn - size.depthIn - index * 24,
    };
  }
  return { xIn: bounds.maxXIn + index * 24, yIn: bounds.maxYIn + index * 24 };
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

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function uniqueById<T extends { id: string }>(values: T[]) {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

function numberFromNormalized(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

