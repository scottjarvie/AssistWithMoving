import {
  buildFloorplanSubjects,
  validateFloorplanEvidenceGraph,
} from "@/lib/floorplans/evidence-engine";
import type {
  FloorplanAreaRole,
  FloorplanCanonicalSubject,
  FloorplanConnection,
  FloorplanConfidence,
  FloorplanDataQualityScore,
  FloorplanGapPriority,
  FloorplanMeasurement,
  FloorplanObservation,
  FloorplanPropertyZoneKind,
  FloorplanRelationship,
  FloorplanRelationshipType,
  FloorplanSpaceKind,
  FloorplanSolvedFixture,
  FloorplanSolvedOpening,
  FloorplanSolvedRoom,
  FloorplanSolvedWall,
  FloorplanSolvedZone,
  FloorplanSolveDiagnostic,
  FloorplanSolveResult,
  FloorplanSubjectKind,
  FloorplanUnresolvedGeometry,
  FloorplanWallOrientation,
} from "@/lib/floorplans/types";
import {
  calculateFloorplanAreas,
  countsTowardConditionedArea,
  defaultAreaRoleForSpace,
  squareFeetFromInches,
} from "@/lib/floorplans/calculations";

const solverVersion = "floorplans-evidence-graph-v2";
const defaultRoomWidthIn = 120;
const defaultRoomDepthIn = 120;
const defaultGapIn = 0;
const overlapToleranceIn = 0.5;
const defaultWallThicknessIn = 4.5;
const placementStepIn = 12;

export type FloorplanRoomConstraint = {
  id: string;
  label: string;
  kind?: FloorplanSpaceKind;
  areaRole?: FloorplanAreaRole;
  confidence?: FloorplanConfidence;
  xIn?: number;
  yIn?: number;
  widthIn?: number;
  depthIn?: number;
  clearWidthIn?: number;
  clearDepthIn?: number;
  wallThicknessIn?: number;
  accessNote?: string;
  unresolvedSubspaces?: string[];
  connectsTo?: FloorplanConnection[];
  widthRangeIn?: [number, number];
  depthRangeIn?: [number, number];
  containedIn?: string;
  partialOutside?: boolean;
  sourceMeasurementIds?: string[];
  sourceObservationIds?: string[];
  sourceRelationshipIds?: string[];
  relativeTo?: {
    roomId: string;
    relation: "rightOf" | "leftOf" | "above" | "below";
    align?: "start" | "center" | "end";
    gapIn?: number;
  };
};

export type FloorplanPropertyZoneConstraint = {
  id: string;
  label: string;
  kind: FloorplanPropertyZoneKind;
  areaRole?: FloorplanAreaRole;
  confidence?: FloorplanConfidence;
  xIn?: number;
  yIn?: number;
  widthIn?: number;
  depthIn?: number;
  widthRangeIn?: [number, number];
  depthRangeIn?: [number, number];
  sourceMeasurementIds?: string[];
  sourceObservationIds?: string[];
  sourceRelationshipIds?: string[];
  partialOutside?: boolean;
  note?: string;
};

export type FloorplanPuzzleInput = {
  rooms?: FloorplanRoomConstraint[];
  zones?: FloorplanPropertyZoneConstraint[];
  measurements?: FloorplanMeasurement[];
  observations?: FloorplanObservation[];
  relationships?: FloorplanRelationship[];
};

export type FloorplanOverlap = {
  firstRoomId: string;
  secondRoomId: string;
  areaSqIn: number;
  widthIn: number;
  depthIn: number;
};

type CompiledFloorplanGraph = {
  rooms: FloorplanRoomConstraint[];
  zones: FloorplanPropertyZoneConstraint[];
  diagnostics: FloorplanSolveDiagnostic[];
  observations: FloorplanObservation[];
  relationships: FloorplanRelationship[];
  measurements: FloorplanMeasurement[];
};

type SolvedRoomWithFlags = {
  room: FloorplanSolvedRoom;
  usedAssumedSize: boolean;
  usedAssumedWall: boolean;
};

type Rect = {
  id: string;
  xIn: number;
  yIn: number;
  widthIn: number;
  depthIn: number;
};

type RoomWallSide = "north" | "south" | "east" | "west";

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

export function compileFloorplanEvidenceGraph(
  input: FloorplanPuzzleInput,
): CompiledFloorplanGraph {
  const activeObservations = (input.observations ?? []).filter(
    (observation) => observation.status === "active" || observation.status === "needsReview",
  );
  const activeRelationships = (input.relationships ?? []).filter(
    (relationship) => relationship.status === "active" || relationship.status === "needsReview",
  );
  const activeMeasurements = (input.measurements ?? []).filter(
    (measurement) => measurement.status === "active",
  );
  const explicitRooms = input.rooms ?? [];
  const explicitZones = input.zones ?? [];

  if (!activeObservations.length && !activeRelationships.length && !activeMeasurements.length) {
    return {
      rooms: explicitRooms,
      zones: explicitZones,
      diagnostics: explicitRooms.length
        ? []
        : [
            {
              id: "no-geometry-input",
              severity: "warning",
              title: "No evidence graph or explicit room constraints",
              detail:
                "The solver can only draw after AI/user observations, relationships, measurements, or explicit constraints exist.",
              impactScore: 95,
            },
          ],
      observations: activeObservations,
      relationships: activeRelationships,
      measurements: activeMeasurements,
    };
  }

  const diagnostics = validateFloorplanEvidenceGraph({
    observations: activeObservations,
    relationships: activeRelationships,
    measurements: activeMeasurements,
  });
  const subjects = buildFloorplanSubjects({
    observations: activeObservations,
    relationships: activeRelationships,
    measurements: activeMeasurements,
  });
  const canonicalLookup = canonicalSubjectLookup(subjects);
  const observations = canonicalizeObservations(activeObservations, canonicalLookup);
  const relationships = canonicalizeRelationships(activeRelationships, canonicalLookup);
  const measurements = canonicalizeMeasurements(activeMeasurements, canonicalLookup);
  const subjectByKey = new Map(subjects.map((subject) => [subject.subjectKey, subject]));
  const topologyHints = inferredTopologyHints({
    observations,
    relationships,
    subjectByKey,
  });
  const rooms = new Map<string, FloorplanRoomConstraint>();
  const zones = new Map<string, FloorplanPropertyZoneConstraint>();

  for (const subject of subjects) {
    const subjectMeasurements = measurementsForSubject(measurements, subject.subjectKey);
    const subjectObservations = observations.filter(
      (observation) => observation.subjectKey === subject.subjectKey,
    );
    const subjectRelationships = relationships.filter(
      (relationship) =>
        relationship.fromSubjectKey === subject.subjectKey ||
        relationship.toSubjectKey === subject.subjectKey,
    );

    if (isInteriorSpaceKind(subject.kind)) {
      rooms.set(subject.subjectKey, {
        ...roomConstraintFromMeasurements({
          id: subject.subjectKey,
          label: subject.subjectLabel,
          confidence: subject.confidence,
          measurements: subjectMeasurements,
          relativeTo:
            directionalRelativeTo(subject.subjectKey, relationships) ??
            topologyHints.get(subject.subjectKey),
        }),
        kind: spaceKindFromSubject(subject.kind),
        areaRole: subject.areaRole,
        accessNote: accessNoteFromRelationships(subject.subjectKey, subjectRelationships),
        connectsTo: connectionsForSubject(subject.subjectKey, relationships),
        sourceObservationIds: subjectObservations.map((observation) => observation.id),
        sourceRelationshipIds: subjectRelationships.map((relationship) => relationship.id),
      });
      continue;
    }

    if (
      isPropertySubject(
        subject.kind,
        subject.subjectKey,
        subjectObservations,
        subjectMeasurements,
      )
    ) {
      const zone = zoneConstraintFromSubject({
        subjectKey: subject.subjectKey,
        subjectLabel: subject.subjectLabel,
        kind: propertyZoneKindFromSubject(subject.kind, subject.subjectKey, subjectObservations),
        confidence: subject.confidence,
        measurements: subjectMeasurements,
        observations: subjectObservations,
        relationships: subjectRelationships,
      });
      if (zone) {
        zones.set(zone.id, zone);
      }
    }
  }

  for (const explicit of explicitRooms) {
    rooms.set(explicit.id, { ...rooms.get(explicit.id), ...explicit });
  }
  for (const explicit of explicitZones) {
    zones.set(explicit.id, { ...zones.get(explicit.id), ...explicit });
  }

  if (!rooms.size) {
    diagnostics.push({
      id: "no-canonical-room-subjects",
      severity: "warning",
      title: "No room or hall subjects found",
      detail:
        "Record roomName, hall, closet, bathroom, or kitchen observations before asking the solver for interior geometry.",
      impactScore: 95,
    });
  }

  const roomList = [...rooms.values()].sort(
    (left, right) => subjectPriority(right, subjectByKey) - subjectPriority(left, subjectByKey),
  );
  const zoneList = [...zones.values()];
  return {
    rooms: roomList,
    zones: zoneList,
    diagnostics,
    observations,
    relationships,
    measurements,
  };
}

function canonicalSubjectLookup(subjects: FloorplanCanonicalSubject[]) {
  const lookup = new Map<string, FloorplanCanonicalSubject>();
  for (const subject of subjects) {
    lookup.set(subject.subjectKey, subject);
    for (const memberKey of subject.memberSubjectKeys ?? []) {
      lookup.set(memberKey, subject);
    }
  }
  return lookup;
}

function canonicalizeObservations(
  observations: FloorplanObservation[],
  lookup: Map<string, FloorplanCanonicalSubject>,
) {
  return observations.map((observation) => {
    if (!observation.subjectKey) return observation;
    const subject = lookup.get(observation.subjectKey);
    if (!subject) return observation;
    return {
      ...observation,
      subjectKey: subject.subjectKey,
      subjectLabel: subject.subjectLabel,
      subjectKind:
        observation.subjectKind === "unknown" || !observation.subjectKind
          ? subject.kind
          : observation.subjectKind,
    };
  });
}

function canonicalizeMeasurements(
  measurements: FloorplanMeasurement[],
  lookup: Map<string, FloorplanCanonicalSubject>,
) {
  return measurements.map((measurement) => {
    const subject = lookup.get(measurement.subjectKey);
    if (!subject) return measurement;
    return {
      ...measurement,
      subjectKey: subject.subjectKey,
      subjectLabel: subject.subjectLabel,
    };
  });
}

function canonicalizeRelationships(
  relationships: FloorplanRelationship[],
  lookup: Map<string, FloorplanCanonicalSubject>,
) {
  return relationships.map((relationship) => {
    const from = lookup.get(relationship.fromSubjectKey);
    const to = lookup.get(relationship.toSubjectKey);
    return {
      ...relationship,
      fromSubjectKey: from?.subjectKey ?? relationship.fromSubjectKey,
      fromSubjectLabel: from?.subjectLabel ?? relationship.fromSubjectLabel,
      toSubjectKey: to?.subjectKey ?? relationship.toSubjectKey,
      toSubjectLabel: to?.subjectLabel ?? relationship.toSubjectLabel,
    };
  });
}

export function measurementsForSubject(
  measurements: FloorplanMeasurement[],
  subjectKey: string,
) {
  return measurements.filter(
    (measurement) =>
      measurement.status === "active" && measurement.subjectKey === subjectKey,
  );
}

export function roomConstraintFromMeasurements({
  id,
  label,
  confidence = "low",
  measurements,
  relativeTo,
  xIn,
  yIn,
}: {
  id: string;
  label: string;
  confidence?: FloorplanConfidence;
  measurements: FloorplanMeasurement[];
  relativeTo?: FloorplanRoomConstraint["relativeTo"];
  xIn?: number;
  yIn?: number;
}): FloorplanRoomConstraint {
  const width = bestMeasurementValue(measurements, "width");
  const depth = bestMeasurementValue(measurements, "depth");
  const clearWidth = bestMeasurementValue(measurements, "clearWidth");
  const clearDepth = bestMeasurementValue(measurements, "clearDepth");
  const wallThickness = bestMeasurementValue(measurements, "wallThickness");
  return {
    id,
    label,
    confidence,
    xIn,
    yIn,
    widthIn: width.valueIn,
    depthIn: depth.valueIn,
    clearWidthIn: clearWidth.valueIn,
    clearDepthIn: clearDepth.valueIn,
    wallThicknessIn: wallThickness.valueIn,
    widthRangeIn: width.rangeIn,
    depthRangeIn: depth.rangeIn,
    sourceMeasurementIds: [
      ...width.measurementIds,
      ...depth.measurementIds,
      ...clearWidth.measurementIds,
      ...clearDepth.measurementIds,
      ...wallThickness.measurementIds,
    ],
    relativeTo,
  };
}

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

export function floorplanSolveToPlanOps(
  solve: FloorplanSolveResult,
  levelId: string,
) {
  const roomOps = solve.rooms.map((room) => ({
    type: "createEntity" as const,
    entity: {
      levelId,
      entityType: "room" as const,
      name: room.label,
      color: roomColor(room.confidence),
      locked: false,
      room: {
        fillColor: roomColor(room.confidence),
        points: rectanglePoints(room),
      },
    },
  }));
  const zoneOps = (solve.zones ?? [])
    .filter((zone) => zone.kind !== "lot")
    .map((zone) => ({
      type: "createEntity" as const,
      entity: {
        levelId,
        entityType: "zone" as const,
        name: zone.label,
        color: zoneColor(zone),
        locked: false,
        zone: {
          zoneKind: zoneKindForPlan(zone.kind),
          points: rectanglePoints(zone),
        },
      },
    }));
  const wallOps = (solve.walls ?? []).map((wall) => ({
    type: "createEntity" as const,
    entity: {
      levelId,
      entityType: "wall" as const,
      name: wall.label,
      locked: false,
      wall: {
        x1: wall.x1In,
        y1: wall.y1In,
        x2: wall.x2In,
        y2: wall.y2In,
        thicknessIn: wall.thicknessIn,
        heightIn: 96,
      },
    },
  }));
  const openingOps = (solve.openings ?? [])
    .filter((opening) => !opening.unresolved)
    .map((opening) => ({
      type: "createEntity" as const,
      entity: {
        levelId,
        entityType: "annotation" as const,
        name: opening.label,
        locked: false,
        annotation: {
          x: opening.xIn,
          y: opening.yIn,
          text: `${opening.kind}: ${opening.label}`,
          fontSizeIn: 5,
        },
      },
    }));
  const fixtureOps = (solve.fixtures ?? [])
    .filter((fixture) => !fixture.unresolved)
    .map((fixture) => ({
      type: "createEntity" as const,
      entity: {
        levelId,
        entityType: "feature" as const,
        name: fixture.label,
        locked: false,
        feature: {
          x: fixture.xIn,
          y: fixture.yIn,
          rotationDeg: 0,
          featureKind: planFeatureKind(fixture.kind),
          widthIn: fixture.widthIn,
          depthIn: fixture.depthIn,
          label: fixture.label,
        },
      },
    }));
  return [...roomOps, ...zoneOps, ...wallOps, ...openingOps, ...fixtureOps];
}

export function formatInches(valueIn: number) {
  const sign = valueIn < 0 ? "-" : "";
  const absolute = Math.abs(valueIn);
  const feet = Math.floor(absolute / 12);
  const rawInches = absolute - feet * 12;
  const roundedInches = Math.round(rawInches);
  const inches =
    Math.abs(rawInches - roundedInches) < 0.01
      ? String(roundedInches)
      : rawInches.toFixed(1).replace(/\.0$/, "");
  if (!feet) return `${sign}${inches} in`;
  if (Number(inches) === 0) return `${sign}${feet} ft`;
  return `${sign}${feet} ft ${inches} in`;
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

function generateWalls(rooms: FloorplanSolvedRoom[]): FloorplanSolvedWall[] {
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

function generateFixtures({
  rooms,
  observations,
  relationships,
}: {
  rooms: FloorplanSolvedRoom[];
  observations: FloorplanObservation[];
  relationships: FloorplanRelationship[];
}) {
  const fixtures: FloorplanSolvedFixture[] = [];
  const unresolved: FloorplanUnresolvedGeometry[] = [];
  const diagnostics: FloorplanSolveDiagnostic[] = [];
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const fixtureObservations = observations.filter((observation) =>
    observation.observationType === "fixture" ||
    (observation.normalized && typeof observation.normalized.fixtures === "string"),
  );

  for (const observation of fixtureObservations) {
    const hostKey = hostRoomForObservation(observation, relationships);
    const host = hostKey ? roomById.get(hostKey) : undefined;
    const fixtureKinds = fixtureKindsFromObservation(observation);
    if (!host) {
      unresolved.push({
        id: `unresolved-fixture-${observation.id}`,
        label: observation.title,
        kind: "fixture",
        subjectKey: observation.subjectKey,
        reason:
          "The fixture evidence exists, but it is not tied to a solved room yet.",
        confidence: observation.confidence,
        sourceObservationIds: [observation.id],
      });
      continue;
    }
    fixtureKinds.forEach((kind, index) => {
      const size = fixtureSize(kind);
      const position = fixturePosition(host, index, size);
      fixtures.push({
        id: `${observation.id}-${kind}-${index}`,
        label: fixtureLabel(kind),
        kind,
        confidence: observation.confidence,
        xIn: position.xIn,
        yIn: position.yIn,
        widthIn: size.widthIn,
        depthIn: size.depthIn,
        hostRoomId: host.id,
        sourceObservationIds: [observation.id],
      });
    });
  }

  if (unresolved.length) {
    diagnostics.push({
      id: "unresolved-fixtures",
      severity: "warning",
      title: "Some fixtures are unresolved",
      detail:
        "Fixtures need a host room and preferably a wall/counter side before they can be placed confidently.",
      observationIds: unresolved.flatMap((entry) => entry.sourceObservationIds ?? []),
      impactScore: 62,
    });
  }

  return { fixtures, unresolved, diagnostics };
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

function scoreDataQuality({
  rooms,
  zones,
  openings,
  fixtures,
  unresolvedGeometry,
  diagnostics,
  measurements,
  relationships,
  areaSummary,
}: {
  rooms: FloorplanSolvedRoom[];
  zones: FloorplanSolvedZone[];
  openings: FloorplanSolvedOpening[];
  fixtures: FloorplanSolvedFixture[];
  unresolvedGeometry: FloorplanUnresolvedGeometry[];
  diagnostics: FloorplanSolveDiagnostic[];
  measurements: FloorplanMeasurement[];
  relationships: FloorplanRelationship[];
  areaSummary: FloorplanSolveResult["areaSummary"];
}): FloorplanDataQualityScore {
  const roomDimensionSlots = Math.max(rooms.length * 2, 1);
  const measuredDimensions = rooms.reduce((count, room) => {
    const subjectMeasurements = measurementsForSubject(measurements, room.id);
    return (
      count +
      (hasMeasurement(subjectMeasurements, "width") ? 1 : 0) +
      (hasMeasurement(subjectMeasurements, "depth") ? 1 : 0)
    );
  }, 0);
  const dimensions = clampScore((measuredDimensions / roomDimensionSlots) * 100);
  const topology = clampScore(
    (relationships.filter((relationship) =>
      ["connectedTo", "accessesThrough", "doorlessPassageBetween"].includes(
        relationship.relationshipType,
      ),
    ).length /
      Math.max(rooms.length - 1, 1)) *
      90,
  );
  const area =
    areaSummary.status === "withinTarget"
      ? 100
      : areaSummary.status === "noTarget"
        ? 58
        : clampScore(100 - Math.abs(areaSummary.variancePercent ?? 35) * 2.2);
  const openingTotal =
    openings.length + unresolvedGeometry.filter((entry) => entry.kind === "opening").length;
  const openingsScore = openingTotal
    ? clampScore((openings.length / openingTotal) * 100)
    : 62;
  const hasPropertyEvidence =
    zones.length > 0 ||
    measurements.some((measurement) =>
      ["lotArea", "excludedArea", "footprintArea"].includes(measurement.measurementType),
    );
  const property = hasPropertyEvidence
    ? clampScore((zones.length ? 64 : 32) + (areaSummary.lotSqFt ? 28 : 0))
    : 100;
  const conflictPenalty = diagnostics.filter((entry) => entry.severity === "conflict").length * 18;
  const unresolvedPenalty = Math.min(22, unresolvedGeometry.length * 4);
  const overall = clampScore(
    dimensions * 0.28 +
      topology * 0.2 +
      area * 0.2 +
      openingsScore * 0.16 +
      property * 0.16 -
      conflictPenalty -
      unresolvedPenalty,
  );

  return {
    overall,
    dimensions,
    topology,
    area,
    openings: openingsScore,
    property,
    summary: qualitySummary(overall, rooms.length, fixtures.length, unresolvedGeometry.length),
    drivers: [
      {
        id: "dimensions",
        label: "Room dimensions",
        score: dimensions,
        note: `${measuredDimensions} of ${roomDimensionSlots} principal room dimensions are supported by active evidence.`,
      },
      {
        id: "topology",
        label: "Topology and access",
        score: topology,
        note: `${relationships.length} active relationships are available for room adjacency, access, openings, and exclusions.`,
      },
      {
        id: "area",
        label: "Area reconciliation",
        score: area,
        note:
          areaSummary.status === "noTarget"
            ? "No official or suspected conditioned square footage has been recorded."
            : `Solved area status is ${areaSummary.status}.`,
      },
      {
        id: "openings",
        label: "Openings and fixtures",
        score: openingsScore,
        note: `${openings.length} openings and ${fixtures.length} fixtures are placed; ${unresolvedGeometry.length} geometry marks remain unresolved.`,
      },
      {
        id: "property",
        label: "Property scope",
        score: property,
        note: hasPropertyEvidence
          ? `${zones.length} property or excluded-area zones are represented.`
          : "No property evidence was supplied, so the solver is treating this as house-only.",
      },
    ],
  };
}

function rankedSolveGaps({
  rooms,
  unresolvedGeometry,
  measurements,
  relationships,
  areaGaps,
  dataQuality,
}: {
  rooms: FloorplanSolvedRoom[];
  unresolvedGeometry: FloorplanUnresolvedGeometry[];
  measurements: FloorplanMeasurement[];
  relationships: FloorplanRelationship[];
  areaGaps: FloorplanGapPriority[];
  dataQuality: FloorplanDataQualityScore;
}) {
  const gaps: FloorplanGapPriority[] = [...areaGaps];
  const dimensionGaps = rooms
    .map((room) => {
      const roomMeasurements = measurementsForSubject(measurements, room.id);
      const missing: string[] = [];
      if (!hasMeasurement(roomMeasurements, "width")) missing.push("width");
      if (!hasMeasurement(roomMeasurements, "depth")) missing.push("depth");
      return { room, missing };
    })
    .filter((entry) => entry.missing.length > 0)
    .sort((left, right) => right.room.areaSqFt - left.room.areaSqFt);

  for (const entry of dimensionGaps.slice(0, 4)) {
    gaps.push({
      id: `cad-dimensions-${entry.room.id}`,
      question: `Confirm ${entry.missing.join(" and ")} for ${entry.room.label}.`,
      category: "scale-largest-unknown",
      impactScore: Math.min(98, 70 + Math.round(entry.room.areaSqFt / 18)),
      whyItHelps:
        "This is one of the largest weakly scaled spaces in the generated layout, so one measurement improves several downstream wall and area calculations.",
      answerFormat: "Width and depth in feet/inches, or a photo with both labels visible.",
    });
  }

  if (!measurements.some((measurement) => measurement.measurementType === "wallThickness")) {
    gaps.push({
      id: "cad-wall-thickness",
      question: "Confirm exterior or interior wall thickness if available.",
      category: "mover-path",
      impactScore: 74,
      whyItHelps:
        "Wall thickness changes clear usable space, door placement, and whether adjacent rooms fit inside the exterior shell.",
      answerFormat: "One number, for example 4.5 in interior walls or 6 in exterior walls.",
    });
  }

  if (dataQuality.topology < 70) {
    gaps.push({
      id: "cad-directional-topology",
      question: "For each connected room, confirm whether it is left, right, above, or below the room it touches.",
      category: "resolve-conflicts",
      impactScore: 90,
      whyItHelps:
        "Directional relationships let the CAD solver preserve the sketch layout instead of using a generic non-overlapping placement.",
      answerFormat:
        "Examples: Kitchen is right of Front living room; Hall runs left-to-right from Kitchen; Room 2 is below the Hall.",
    });
  }

  if (unresolvedGeometry.some((entry) => entry.kind === "opening")) {
    gaps.push({
      id: "cad-attach-openings",
      question: "Attach unresolved doors, doorways, windows, and passages to a wall or pair of rooms.",
      category: "mover-path",
      impactScore: 86,
      whyItHelps:
        "Openings define how movers and furniture travel through the home; floating openings cannot become CAD geometry.",
      answerFormat:
        "For each mark: source image number, opening label, host wall/room, and whether it is a door, doorway, window, or doorless passage.",
    });
  }

  if (!relationships.some((relationship) => relationship.relationshipType === "countsTowardArea")) {
    gaps.push({
      id: "cad-area-inclusion-rules",
      question: "Confirm which structures count toward official square footage and which are excluded.",
      category: "resolve-conflicts",
      impactScore: 72,
      whyItHelps:
        "Area inclusion rules prevent patios, carports, sheds, and detached buildings from distorting the house square-footage check.",
      answerFormat: "List included/excluded structures, for example: carport excluded, patio excluded.",
    });
  }

  return uniqueById(gaps).sort((left, right) => right.impactScore - left.impactScore);
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

function dimensionFromConstraint(
  value: number | undefined,
  range: [number, number] | undefined,
  fallback: number,
) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return { value, known: true };
  }
  if (range) {
    const [min, max] = range;
    if (
      Number.isFinite(min) &&
      Number.isFinite(max) &&
      min > 0 &&
      max >= min
    ) {
      return { value: (min + max) / 2, known: true };
    }
  }
  return { value: value ?? fallback, known: false };
}

function bestMeasurementValue(
  measurements: FloorplanMeasurement[],
  measurementType:
    | "width"
    | "depth"
    | "clearWidth"
    | "clearDepth"
    | "wallThickness",
) {
  const candidates = measurements.filter(
    (measurement) => measurement.measurementType === measurementType,
  );
  const known = candidates.find((measurement) => measurement.kind === "known");
  const derived = candidates.find((measurement) => measurement.kind === "derived");
  const range = candidates.find((measurement) => measurement.kind === "range");
  const assumption = candidates.find(
    (measurement) => measurement.kind === "assumption",
  );
  const selected = known ?? derived ?? range ?? assumption;
  return {
    valueIn: selected?.valueIn,
    rangeIn:
      selected?.minIn !== undefined && selected.maxIn !== undefined
        ? ([selected.minIn, selected.maxIn] as [number, number])
        : undefined,
    measurementIds: selected ? [selected.id] : [],
  };
}

function directionalRelativeTo(
  subjectKey: string,
  relationships: FloorplanRelationship[],
): FloorplanRoomConstraint["relativeTo"] {
  for (const relationship of relationships) {
    if (!isDirectionalRelationship(relationship.relationshipType)) continue;
    if (relationship.fromSubjectKey === subjectKey) {
      return {
        roomId: relationship.toSubjectKey,
        relation: relationshipTypeToRelative(relationship.relationshipType),
        align: alignmentFromRelationship(relationship),
      };
    }
    if (relationship.toSubjectKey === subjectKey) {
      return {
        roomId: relationship.fromSubjectKey,
        relation: inverseRelation(relationshipTypeToRelative(relationship.relationshipType)),
        align: alignmentFromRelationship(relationship),
      };
    }
  }
  return undefined;
}

function inferredTopologyHints({
  observations,
  relationships,
  subjectByKey,
}: {
  observations: FloorplanObservation[];
  relationships: FloorplanRelationship[];
  subjectByKey: Map<string, { kind: FloorplanSubjectKind; subjectLabel: string }>;
}) {
  const hints = new Map<string, NonNullable<FloorplanRoomConstraint["relativeTo"]>>();
  const hallOrientations = hallOrientationBySubject(observations, subjectByKey);
  const activeConnections = relationships.filter((relationship) =>
    ["connectedTo", "accessesThrough", "doorlessPassageBetween"].includes(
      relationship.relationshipType,
    ),
  );

  for (const relationship of activeConnections) {
    const textDirection = relativeFromRelationshipText(relationship);
    if (textDirection) {
      setTopologyHint(hints, relationship.toSubjectKey, {
        roomId: relationship.fromSubjectKey,
        relation: textDirection,
        align: alignmentFromRelationship(relationship),
      });
      setTopologyHint(hints, relationship.fromSubjectKey, {
        roomId: relationship.toSubjectKey,
        relation: inverseRelation(textDirection),
        align: alignmentFromRelationship(relationship),
      });
    }
  }

  for (const relationship of activeConnections) {
    const fromKind = subjectByKey.get(relationship.fromSubjectKey)?.kind;
    const toKind = subjectByKey.get(relationship.toSubjectKey)?.kind;
    const fromHallOrientation = hallOrientations.get(relationship.fromSubjectKey);
    const toHallOrientation = hallOrientations.get(relationship.toSubjectKey);

    if (fromKind === "hall" && toKind && isInteriorSpaceKind(toKind)) {
      setTopologyHint(
        hints,
        relationship.toSubjectKey,
        hallConnectedRoomHint({
          hallKey: relationship.fromSubjectKey,
          relationship,
          roomKey: relationship.toSubjectKey,
          orientation: fromHallOrientation,
          subjectByKey,
        }),
      );
    }

    if (toKind === "hall" && fromKind && isInteriorSpaceKind(fromKind)) {
      const hallHint = hallSelfHint({
        otherKey: relationship.fromSubjectKey,
        orientation: toHallOrientation,
        relationship,
        subjectByKey,
      });
      if (hallHint) {
        setTopologyHint(hints, relationship.toSubjectKey, hallHint);
      }
      setTopologyHint(
        hints,
        relationship.fromSubjectKey,
        hallConnectedRoomHint({
          hallKey: relationship.toSubjectKey,
          relationship,
          roomKey: relationship.fromSubjectKey,
          orientation: toHallOrientation,
          subjectByKey,
        }),
      );
    }
  }

  return hints;
}

function setTopologyHint(
  hints: Map<string, NonNullable<FloorplanRoomConstraint["relativeTo"]>>,
  subjectKey: string,
  hint: FloorplanRoomConstraint["relativeTo"],
) {
  if (!hint || hints.has(subjectKey) || subjectKey === hint.roomId) return;
  hints.set(subjectKey, hint);
}

function hallOrientationBySubject(
  observations: FloorplanObservation[],
  subjectByKey: Map<string, { kind: FloorplanSubjectKind }>,
) {
  const orientations = new Map<string, "horizontal" | "vertical">();
  for (const observation of observations) {
    if (!observation.subjectKey || subjectByKey.get(observation.subjectKey)?.kind !== "hall") {
      continue;
    }
    const value = `${observation.normalized?.orientation ?? ""} ${observation.rawText ?? ""} ${observation.notes ?? ""}`.toLowerCase();
    if (
      value.includes("left-to-right") ||
      value.includes("horizontal") ||
      value.includes("east-west")
    ) {
      orientations.set(observation.subjectKey, "horizontal");
    } else if (
      value.includes("top-to-bottom") ||
      value.includes("vertical") ||
      value.includes("north-south")
    ) {
      orientations.set(observation.subjectKey, "vertical");
    }
  }
  return orientations;
}

function relativeFromRelationshipText(
  relationship: FloorplanRelationship,
): NonNullable<FloorplanRoomConstraint["relativeTo"]>["relation"] | undefined {
  const text = `${relationship.notes ?? ""} ${relationship.fromSubjectLabel} ${relationship.toSubjectLabel}`.toLowerCase();
  if (text.includes("right of") || text.includes("east of")) return "rightOf";
  if (text.includes("left of") || text.includes("west of")) return "leftOf";
  if (text.includes("above") || text.includes("north of")) return "above";
  if (text.includes("below") || text.includes("south of")) return "below";
  if (text.includes(" to the right") || text.includes(" east/right")) return "rightOf";
  if (text.includes(" to the left") || text.includes(" west/left")) return "leftOf";
  return undefined;
}

function hallSelfHint({
  otherKey,
  orientation,
  relationship,
  subjectByKey,
}: {
  otherKey: string;
  orientation: "horizontal" | "vertical" | undefined;
  relationship: FloorplanRelationship;
  subjectByKey: Map<string, { kind: FloorplanSubjectKind; subjectLabel: string }>;
}): FloorplanRoomConstraint["relativeTo"] {
  const otherKind = subjectByKey.get(otherKey)?.kind;
  const text = `${relationship.notes ?? ""} ${relationship.fromSubjectLabel} ${relationship.toSubjectLabel}`.toLowerCase();
  if (otherKind === "kitchen" && orientation === "horizontal") {
    return {
      roomId: otherKey,
      relation: text.includes("left") || text.includes("west") ? "leftOf" : "rightOf",
      align: "start",
    };
  }
  return undefined;
}

function hallConnectedRoomHint({
  hallKey,
  relationship,
  roomKey,
  orientation,
  subjectByKey,
}: {
  hallKey: string;
  relationship: FloorplanRelationship;
  roomKey: string;
  orientation: "horizontal" | "vertical" | undefined;
  subjectByKey: Map<string, { kind: FloorplanSubjectKind; subjectLabel: string }>;
}): FloorplanRoomConstraint["relativeTo"] {
  if (!orientation) return undefined;
  const room = subjectByKey.get(roomKey);
  if (!room || room.kind === "hall") return undefined;
  const text = `${relationship.notes ?? ""} ${room.subjectLabel}`.toLowerCase();
  const align = alignmentFromRelationship(relationship);

  if (orientation === "horizontal") {
    if (text.includes("upper") || text.includes("top") || text.includes("north")) {
      return { roomId: hallKey, relation: "above", align };
    }
    if (text.includes("lower") || text.includes("bottom") || text.includes("south")) {
      return { roomId: hallKey, relation: "below", align };
    }
    return {
      roomId: hallKey,
      relation: hallSideForRoom(roomKey, "horizontal"),
      align,
    };
  }

  if (text.includes("left") || text.includes("west")) {
    return { roomId: hallKey, relation: "leftOf", align };
  }
  if (text.includes("right") || text.includes("east")) {
    return { roomId: hallKey, relation: "rightOf", align };
  }
  return {
    roomId: hallKey,
    relation: hallSideForRoom(roomKey, "vertical"),
    align,
  };
}

function hallSideForRoom(
  subjectKey: string,
  orientation: "horizontal" | "vertical",
): NonNullable<FloorplanRoomConstraint["relativeTo"]>["relation"] {
  const hash = [...subjectKey].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  if (orientation === "horizontal") {
    return hash % 2 === 0 ? "below" : "above";
  }
  return hash % 2 === 0 ? "rightOf" : "leftOf";
}

function relationshipTypeToRelative(
  type: Extract<FloorplanRelationshipType, "leftOf" | "rightOf" | "above" | "below">,
) {
  if (type === "leftOf") return "leftOf";
  if (type === "rightOf") return "rightOf";
  if (type === "above") return "above";
  return "below";
}

function inverseRelation(
  relation: NonNullable<FloorplanRoomConstraint["relativeTo"]>["relation"],
) {
  if (relation === "leftOf") return "rightOf";
  if (relation === "rightOf") return "leftOf";
  if (relation === "above") return "below";
  return "above";
}

function isDirectionalRelationship(
  type: FloorplanRelationshipType,
): type is Extract<FloorplanRelationshipType, "leftOf" | "rightOf" | "above" | "below"> {
  return type === "leftOf" || type === "rightOf" || type === "above" || type === "below";
}

function alignmentFromRelationship(
  relationship: FloorplanRelationship,
): "start" | "center" | "end" {
  const notes = `${relationship.notes ?? ""}`.toLowerCase();
  if (notes.includes("center")) return "center";
  if (notes.includes("end") || notes.includes("bottom") || notes.includes("right edge")) {
    return "end";
  }
  return "start";
}

function connectionsForSubject(
  subjectKey: string,
  relationships: FloorplanRelationship[],
): FloorplanConnection[] {
  return relationships
    .filter((relationship) =>
      ["connectedTo", "accessesThrough", "doorlessPassageBetween"].includes(
        relationship.relationshipType,
      ),
    )
    .filter(
      (relationship) =>
        relationship.fromSubjectKey === subjectKey ||
        relationship.toSubjectKey === subjectKey,
    )
    .map((relationship) => {
      const fromSelf = relationship.fromSubjectKey === subjectKey;
      return {
        targetRoomId: fromSelf
          ? relationship.toSubjectKey
          : relationship.fromSubjectKey,
        label: fromSelf
          ? relationship.toSubjectLabel
          : relationship.fromSubjectLabel,
        kind:
          relationship.relationshipType === "doorlessPassageBetween"
            ? "doorlessPassage"
            : relationship.relationshipType === "accessesThrough"
              ? "throughRoom"
              : "opening",
        confidence: relationship.confidence,
        note: relationship.notes,
      };
    });
}

function accessNoteFromRelationships(
  subjectKey: string,
  relationships: FloorplanRelationship[],
) {
  const connection = relationships.find((relationship) =>
    ["connectedTo", "accessesThrough", "doorlessPassageBetween"].includes(
      relationship.relationshipType,
    ),
  );
  if (!connection) return undefined;
  return connection.notes ?? `${subjectKey} has recorded access topology.`;
}

function zoneConstraintFromSubject({
  subjectKey,
  subjectLabel,
  kind,
  confidence,
  measurements,
  observations,
  relationships,
}: {
  subjectKey: string;
  subjectLabel: string;
  kind: FloorplanPropertyZoneKind;
  confidence: FloorplanConfidence;
  measurements: FloorplanMeasurement[];
  observations: FloorplanObservation[];
  relationships: FloorplanRelationship[];
}): FloorplanPropertyZoneConstraint | undefined {
  if (subjectKey === "scott-house") return undefined;
  const width = bestMeasurementValue(measurements, "width");
  const depth = bestMeasurementValue(measurements, "depth");
  const area = measurements.find((measurement) =>
    ["lotArea", "excludedArea", "footprintArea", "area"].includes(
      measurement.measurementType,
    ),
  );
  const areaSize = rectangularSizeFromArea(area);
  const areaRole =
    measurements.find((measurement) => measurement.areaRole)?.areaRole ??
    normalizedAreaRole(observations) ??
    (relationships.some((relationship) => relationship.relationshipType === "excludedFromArea")
      ? "excluded"
      : undefined);
  return {
    id: subjectKey,
    label: subjectLabel,
    kind,
    areaRole,
    confidence,
    widthIn: width.valueIn ?? areaSize?.widthIn,
    depthIn: depth.valueIn ?? areaSize?.depthIn,
    widthRangeIn: width.rangeIn,
    depthRangeIn: depth.rangeIn,
    sourceMeasurementIds: [
      ...width.measurementIds,
      ...depth.measurementIds,
      ...(area ? [area.id] : []),
    ],
    sourceObservationIds: observations.map((observation) => observation.id),
    sourceRelationshipIds: relationships.map((relationship) => relationship.id),
    note: observations.map((observation) => observation.notes).filter(Boolean).join(" "),
  };
}

function rectangularSizeFromArea(measurement: FloorplanMeasurement | undefined) {
  const valueSqFt = measurement?.value ?? midpoint(measurement?.minValue, measurement?.maxValue);
  if (!valueSqFt || valueSqFt <= 0) return undefined;
  const widthFt = Math.sqrt(valueSqFt);
  const depthFt = valueSqFt / widthFt;
  return {
    widthIn: widthFt * 12,
    depthIn: depthFt * 12,
  };
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

function isInteriorSpaceKind(kind: FloorplanSubjectKind) {
  return ["room", "hall", "closet", "bathroom", "kitchen"].includes(kind);
}

function spaceKindFromSubject(kind: FloorplanSubjectKind): FloorplanSpaceKind {
  if (kind === "hall") return "hall";
  if (kind === "closet") return "closet";
  if (kind === "bathroom") return "bath";
  if (kind === "kitchen") return "kitchen";
  return "room";
}

function isPropertySubject(
  kind: FloorplanSubjectKind,
  subjectKey: string,
  observations: FloorplanObservation[],
  measurements: FloorplanMeasurement[],
) {
  if (kind === "lot" || kind === "zone" || kind === "structure") return true;
  if (subjectKey.includes("patio") || subjectKey.includes("carport")) return true;
  if (
    observations.some((observation) =>
      ["patio", "carport", "shed", "exteriorStructure", "lotFeature"].includes(
        observation.observationType,
      ),
    )
  ) {
    return true;
  }
  return measurements.some(
    (measurement) =>
      ["lot", "zone", "structure", "areaGroup", "shell"].includes(
        measurement.subjectType,
      ) &&
      ["lotArea", "excludedArea", "footprintArea"].includes(
        measurement.measurementType,
      ),
  );
}

function propertyZoneKindFromSubject(
  kind: FloorplanSubjectKind,
  subjectKey: string,
  observations: FloorplanObservation[],
): FloorplanPropertyZoneKind {
  if (kind === "lot") return "lot";
  if (subjectKey.includes("carport")) return "carport";
  if (subjectKey.includes("patio")) return "patio";
  if (subjectKey.includes("shed")) return "shed";
  if (subjectKey.includes("workshop")) return "custom";
  if (observations.some((observation) => observation.observationType === "carport")) {
    return "carport";
  }
  if (observations.some((observation) => observation.observationType === "patio")) {
    return "patio";
  }
  if (observations.some((observation) => observation.observationType === "shed")) {
    return "shed";
  }
  return "custom";
}

function normalizedAreaRole(
  observations: FloorplanObservation[],
): FloorplanAreaRole | undefined {
  for (const observation of observations) {
    const role = observation.normalized?.areaRole;
    if (
      role === "conditioned" ||
      role === "unconditioned" ||
      role === "excluded" ||
      role === "outdoor" ||
      role === "unknown"
    ) {
      return role;
    }
  }
  return undefined;
}

function subjectPriority(
  room: FloorplanRoomConstraint,
  subjectByKey: Map<string, { knownMeasurementCount: number; relationshipIds: string[] }>,
) {
  const subject = subjectByKey.get(room.id);
  const relationshipScore = subject?.relationshipIds.length ?? room.connectsTo?.length ?? 0;
  const measurementScore =
    subject?.knownMeasurementCount ?? (room.widthIn && room.depthIn ? 2 : 0);
  const kindScore = room.kind === "room" ? 4 : room.kind === "kitchen" ? 3 : 2;
  return measurementScore * 10 + relationshipScore * 4 + kindScore;
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

function wallForRoomSide(
  walls: FloorplanSolvedWall[],
  roomId: string,
  side: "north" | "south" | "east" | "west",
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

function hostRoomForObservation(
  observation: FloorplanObservation,
  relationships: FloorplanRelationship[],
) {
  if (observation.subjectKind && isInteriorSpaceKind(observation.subjectKind)) {
    return observation.subjectKey;
  }
  const relationship = relationships.find(
    (entry) =>
      entry.fromSubjectKey === observation.subjectKey &&
      ["partOf", "contains", "openingIn", "connectedTo"].includes(entry.relationshipType),
  );
  if (relationship) return relationship.toSubjectKey;
  const hostRoom = observation.normalized?.hostRoom;
  return typeof hostRoom === "string" ? slugify(hostRoom) : observation.subjectKey;
}

function fixtureKindsFromObservation(
  observation: FloorplanObservation,
): FloorplanSolvedFixture["kind"][] {
  const source =
    observation.observationType === "fixture"
      ? `${observation.rawText ?? observation.title}`
      : String(observation.normalized?.fixtures ?? "");
  const text = source.toLowerCase();
  const kinds: FloorplanSolvedFixture["kind"][] = [];
  if (text.includes("sink")) kinds.push("sink");
  if (text.includes("toilet")) kinds.push("toilet");
  if (text.includes("tub")) kinds.push("tub");
  if (text.includes("shower")) kinds.push("shower");
  if (text.includes("washer")) kinds.push("washer");
  if (text.includes("dryer")) kinds.push("dryer");
  if (text.includes("stove") || text.includes("range")) kinds.push("stove");
  if (text.includes("fireplace")) kinds.push("fireplace");
  if (text.includes("water heater")) kinds.push("waterHeater");
  if (text.includes("cabinet")) kinds.push("cabinet");
  if (text.includes("counter")) kinds.push("counter");
  return kinds.length ? kinds : ["unknown"];
}

function fixtureSize(kind: FloorplanSolvedFixture["kind"]) {
  if (kind === "fireplace") return { widthIn: 96, depthIn: 14 };
  if (kind === "stove") return { widthIn: 30, depthIn: 26 };
  if (kind === "sink") return { widthIn: 30, depthIn: 24 };
  if (kind === "washer" || kind === "dryer") return { widthIn: 27, depthIn: 30 };
  if (kind === "tub" || kind === "shower") return { widthIn: 60, depthIn: 32 };
  if (kind === "toilet") return { widthIn: 28, depthIn: 30 };
  if (kind === "waterHeater") return { widthIn: 28, depthIn: 28 };
  if (kind === "cabinet" || kind === "counter") return { widthIn: 72, depthIn: 24 };
  return { widthIn: 30, depthIn: 30 };
}

function fixturePosition(
  host: FloorplanSolvedRoom,
  index: number,
  size: { widthIn: number; depthIn: number },
) {
  const columns = Math.max(1, Math.floor((host.widthIn - 24) / Math.max(size.widthIn + 12, 36)));
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    xIn: host.xIn + 12 + column * (size.widthIn + 12),
    yIn: host.yIn + 12 + row * (size.depthIn + 12),
  };
}

function fixtureLabel(kind: FloorplanSolvedFixture["kind"]) {
  const labels: Record<FloorplanSolvedFixture["kind"], string> = {
    sink: "Sink",
    toilet: "Toilet",
    tub: "Tub",
    shower: "Shower",
    washer: "Washer",
    dryer: "Dryer",
    stove: "Stove",
    fireplace: "Fireplace",
    waterHeater: "Water heater",
    cabinet: "Cabinet",
    counter: "Counter",
    pool: "Pool",
    unknown: "Fixture",
  };
  return labels[kind];
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

function normalizeOrigins(rooms: FloorplanSolvedRoom[]) {
  if (!rooms.length) return rooms;
  const minXIn = Math.min(...rooms.map((room) => room.xIn));
  const minYIn = Math.min(...rooms.map((room) => room.yIn));
  return rooms.map((room) => ({
    ...room,
    xIn: room.xIn - minXIn,
    yIn: room.yIn - minYIn,
  }));
}

function floorplanBounds(rooms: Rect[]): FloorplanSolveResult["bounds"] {
  if (!rooms.length) {
    return {
      minXIn: 0,
      minYIn: 0,
      maxXIn: 0,
      maxYIn: 0,
      widthIn: 0,
      depthIn: 0,
    };
  }
  const minXIn = Math.min(...rooms.map((room) => room.xIn));
  const minYIn = Math.min(...rooms.map((room) => room.yIn));
  const maxXIn = Math.max(...rooms.map((room) => room.xIn + room.widthIn));
  const maxYIn = Math.max(...rooms.map((room) => room.yIn + room.depthIn));
  return {
    minXIn,
    minYIn,
    maxXIn,
    maxYIn,
    widthIn: maxXIn - minXIn,
    depthIn: maxYIn - minYIn,
  };
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

function rectanglePoints(rect: Rect) {
  return [
    { x: rect.xIn, y: rect.yIn },
    { x: rect.xIn + rect.widthIn, y: rect.yIn },
    { x: rect.xIn + rect.widthIn, y: rect.yIn + rect.depthIn },
    { x: rect.xIn, y: rect.yIn + rect.depthIn },
  ];
}

function hasMeasurement(
  measurements: FloorplanMeasurement[],
  measurementType: FloorplanMeasurement["measurementType"],
) {
  return measurements.some(
    (measurement) =>
      measurement.measurementType === measurementType &&
      ["known", "derived", "range"].includes(measurement.kind),
  );
}

function midpoint(min: number | undefined, max: number | undefined) {
  if (typeof min === "number" && typeof max === "number") return (min + max) / 2;
  return undefined;
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

function rangesOverlap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
  tolerance = overlapToleranceIn,
) {
  return Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart) > tolerance;
}

function pairKey(firstId: string, secondId: string) {
  return [firstId, secondId].sort().join("::");
}

function connectedRoomIds(startRoomId: string, realizedPairs: Set<string>) {
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

function segmentLength(segment: {
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

function nearly(first: number, second: number, tolerance = overlapToleranceIn) {
  return Math.abs(first - second) <= tolerance;
}

function roundKey(value: number) {
  return Math.round(value * 10) / 10;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function qualitySummary(
  overall: number,
  roomCount: number,
  fixtureCount: number,
  unresolvedCount: number,
) {
  if (!roomCount) return "No room geometry could be generated from the evidence graph yet.";
  if (overall >= 82) {
    return `Strong draft: ${roomCount} spaces, ${fixtureCount} fixtures, and ${unresolvedCount} unresolved marks.`;
  }
  if (overall >= 58) {
    return `Usable review draft: ${roomCount} spaces generated, but the data still has important holes.`;
  }
  return `Low-confidence attempt: ${roomCount} spaces generated so the user can see what is known and what needs better evidence.`;
}

function roomColor(confidence: FloorplanConfidence) {
  if (confidence === "high") return "#1f5244";
  if (confidence === "medium") return "#254960";
  if (confidence === "conflict") return "#7f1d1d";
  return "#3f3932";
}

function zoneColor(zone: FloorplanSolvedZone) {
  if (zone.kind === "carport" || zone.kind === "garage") return "#71532a";
  if (zone.kind === "patio" || zone.kind === "deck" || zone.kind === "porch") {
    return "#64748b";
  }
  return "#48503a";
}

function zoneKindForPlan(kind: FloorplanPropertyZoneKind) {
  if (kind === "driveway") return "driveway";
  if (kind === "shed") return "shed";
  if (kind === "garden") return "garden";
  if (kind === "fence") return "fence";
  if (kind === "patio" || kind === "deck" || kind === "porch") return "patio";
  return "custom";
}

function planFeatureKind(kind: FloorplanSolvedFixture["kind"]) {
  if (kind === "sink") return "sink";
  if (kind === "toilet") return "toilet";
  if (kind === "tub") return "tub";
  if (kind === "shower") return "shower";
  if (kind === "waterHeater") return "waterHeater";
  if (kind === "fireplace") return "fireplace";
  if (kind === "counter" || kind === "cabinet") return "counter";
  return "custom";
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

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
