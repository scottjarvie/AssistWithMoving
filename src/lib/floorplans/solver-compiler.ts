import {
  buildFloorplanSubjects,
  validateFloorplanEvidenceGraph,
} from "@/lib/floorplans/evidence-engine";
import {
  bestMeasurementValue,
  measurementsForSubject,
  rectangularSizeFromArea,
} from "@/lib/floorplans/solver-measurements";
import type {
  CompiledFloorplanGraph,
  FloorplanPropertyZoneConstraint,
  FloorplanPuzzleInput,
  FloorplanRoomConstraint,
} from "@/lib/floorplans/solver-types";
import type {
  FloorplanAreaRole,
  FloorplanCanonicalSubject,
  FloorplanConfidence,
  FloorplanConnection,
  FloorplanMeasurement,
  FloorplanObservation,
  FloorplanPropertyZoneKind,
  FloorplanRelationship,
  FloorplanRelationshipType,
  FloorplanSpaceKind,
  FloorplanSubjectKind,
} from "@/lib/floorplans/types";

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

export function isInteriorSpaceKind(kind: FloorplanSubjectKind) {
  return ["room", "hall", "closet", "bathroom", "kitchen"].includes(kind);
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
