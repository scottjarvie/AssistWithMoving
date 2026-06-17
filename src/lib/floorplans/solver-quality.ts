import {
  hasMeasurement,
  measurementsForSubject,
} from "@/lib/floorplans/solver-measurements";
import type {
  FloorplanDataQualityScore,
  FloorplanGapPriority,
  FloorplanMeasurement,
  FloorplanRelationship,
  FloorplanSolvedFixture,
  FloorplanSolvedOpening,
  FloorplanSolvedRoom,
  FloorplanSolvedZone,
  FloorplanSolveDiagnostic,
  FloorplanSolveResult,
  FloorplanUnresolvedGeometry,
} from "@/lib/floorplans/types";

export function scoreDataQuality({
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

export function rankedSolveGaps({
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

function uniqueById<T extends { id: string }>(values: T[]) {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}
