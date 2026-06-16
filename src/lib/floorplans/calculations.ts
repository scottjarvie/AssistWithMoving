import type {
  FloorplanAreaRole,
  FloorplanAreaSummary,
  FloorplanAreaTarget,
  FloorplanCalculation,
  FloorplanConfidence,
  FloorplanConstraintStrength,
  FloorplanGapPriority,
  FloorplanMeasurement,
  FloorplanMeasurementType,
  FloorplanSolvedRoom,
  FloorplanSolvedZone,
  FloorplanSolveDiagnostic,
} from "@/lib/floorplans/types";

const squareInchesPerSquareFoot = 144;
const squareFeetPerAcre = 43560;
const areaTargetTolerancePercent = 4;

export function squareFeetFromInches(widthIn: number, depthIn: number) {
  return (widthIn * depthIn) / squareInchesPerSquareFoot;
}

export function defaultAreaRoleForSpace({
  kind,
  explicitRole,
}: {
  kind: string;
  explicitRole?: FloorplanAreaRole;
}): FloorplanAreaRole {
  if (explicitRole) return explicitRole;
  if (
    kind === "garage" ||
    kind === "carport" ||
    kind === "patio" ||
    kind === "deck" ||
    kind === "porch" ||
    kind === "shed"
  ) {
    return "excluded";
  }
  if (kind === "yard" || kind === "outdoor") return "outdoor";
  return "conditioned";
}

export function countsTowardConditionedArea(role: FloorplanAreaRole) {
  return role === "conditioned";
}

export function buildAreaTargetsFromMeasurements(
  measurements: FloorplanMeasurement[] = [],
): FloorplanAreaTarget[] {
  const active = measurements.filter(
    (measurement) => measurement.status === "active",
  );
  return active
    .filter((measurement) => areaTargetMeasurementTypes.has(measurement.measurementType))
    .map((measurement) => {
      const valueSqFt = squareFeetMeasurementValue(measurement);
      const minSqFt = squareFeetMeasurementMin(measurement);
      const maxSqFt = squareFeetMeasurementMax(measurement);
      return {
        id: `target-${measurement.id}`,
        label: measurement.subjectLabel,
        subjectKey: measurement.subjectKey,
        measurementType: measurement.measurementType as FloorplanAreaTarget["measurementType"],
        areaRole:
          measurement.areaRole ??
          areaRoleFromMeasurementType(measurement.measurementType),
        strength: measurement.constraintStrength ?? defaultConstraintStrength(measurement),
        valueSqFt,
        minSqFt,
        maxSqFt,
        confidence: measurement.confidence,
        sourceMeasurementIds: [measurement.id],
      };
    });
}

export function calculateFloorplanAreas({
  rooms,
  zones = [],
  measurements = [],
}: {
  rooms: FloorplanSolvedRoom[];
  zones?: FloorplanSolvedZone[];
  measurements?: FloorplanMeasurement[];
}) {
  const areaTargets = buildAreaTargetsFromMeasurements(measurements);
  const officialTarget = bestConditionedAreaTarget(areaTargets);
  const lotTarget = bestLotAreaTarget(areaTargets);
  const summary = summarizeAreas({
    rooms,
    zones,
    officialTarget,
    lotTarget,
  });
  const diagnostics = areaDiagnostics({
    areaTargets,
    summary,
  });
  const gaps = areaGapQuestions({
    summary,
    diagnostics,
  });
  const calculations = areaCalculations({
    rooms,
    zones,
    summary,
    diagnostics,
    inputMeasurementIds: [
      ...new Set(areaTargets.flatMap((target) => target.sourceMeasurementIds)),
    ],
  });
  return {
    areaTargets,
    summary,
    calculations,
    diagnostics,
    gaps,
  };
}

export function formatSquareFeet(value: number) {
  return `${Math.round(value).toLocaleString()} sq ft`;
}

function summarizeAreas({
  rooms,
  zones,
  officialTarget,
  lotTarget,
}: {
  rooms: FloorplanSolvedRoom[];
  zones: FloorplanSolvedZone[];
  officialTarget?: FloorplanAreaTarget;
  lotTarget?: FloorplanAreaTarget;
}): FloorplanAreaSummary {
  const allSpaces = [...rooms, ...zones];
  const conditionedSqFt = sumArea(allSpaces, "conditioned");
  const unconditionedSqFt = sumArea(allSpaces, "unconditioned");
  const excludedSqFt = sumArea(allSpaces, "excluded");
  const outdoorSqFt = sumArea(allSpaces, "outdoor");
  const unknownSqFt = sumArea(allSpaces, "unknown");
  const footprintSqFt = conditionedSqFt + unconditionedSqFt + excludedSqFt + unknownSqFt;
  const grossSolvedSqFt = footprintSqFt + outdoorSqFt;
  const officialTargetSqFt = officialTarget?.valueSqFt;
  const varianceSqFt =
    typeof officialTargetSqFt === "number"
      ? conditionedSqFt - officialTargetSqFt
      : undefined;
  const variancePercent =
    typeof varianceSqFt === "number" && officialTargetSqFt
      ? (varianceSqFt / officialTargetSqFt) * 100
      : undefined;
  const lotSqFt = lotTarget?.valueSqFt;
  const lotCoveragePercent =
    lotSqFt && lotSqFt > 0 ? (footprintSqFt / lotSqFt) * 100 : undefined;

  return {
    conditionedSqFt,
    unconditionedSqFt,
    excludedSqFt,
    outdoorSqFt,
    unknownSqFt,
    footprintSqFt,
    grossSolvedSqFt,
    lotSqFt,
    lotCoveragePercent,
    officialTargetSqFt,
    targetStrength: officialTarget?.strength,
    varianceSqFt,
    variancePercent,
    status: areaStatus(variancePercent),
  };
}

function areaDiagnostics({
  areaTargets,
  summary,
}: {
  areaTargets: FloorplanAreaTarget[];
  summary: FloorplanAreaSummary;
}): FloorplanSolveDiagnostic[] {
  const diagnostics: FloorplanSolveDiagnostic[] = [];
  const target = areaTargets.find(
    (entry) =>
      entry.measurementType === "conditionedArea" ||
      (entry.measurementType === "area" && entry.areaRole === "conditioned"),
  );
  if (!target) {
    diagnostics.push({
      id: "missing-conditioned-area-target",
      severity: "info",
      title: "No official/suspected house square footage",
      detail:
        "The solver can compare geometry against a known or suspected conditioned square footage when the user or agent records it.",
      measurementIds: [],
    });
  } else if (
    summary.status !== "withinTarget" &&
    target.strength !== "displayOnly" &&
    typeof summary.varianceSqFt === "number"
  ) {
    diagnostics.push({
      id: "conditioned-area-variance",
      severity: target.strength === "hard" ? "conflict" : "warning",
      title: "Solved house area differs from target square footage",
      detail: `Solved conditioned area is ${formatSquareFeet(
        summary.conditionedSqFt,
      )}, target is ${formatSquareFeet(target.valueSqFt ?? 0)}, variance is ${formatSquareFeet(
        Math.abs(summary.varianceSqFt),
      )}.`,
      measurementIds: target.sourceMeasurementIds,
    });
  }

  if (summary.excludedSqFt > 0 && !areaTargets.some((target) => target.areaRole === "excluded")) {
    diagnostics.push({
      id: "excluded-area-modeled",
      severity: "info",
      title: "Excluded structures are modeled separately",
      detail:
        "Garage, patio, carport, deck, porch, shed, and similar spaces stay visible but do not count toward conditioned square footage unless evidence overrides the area role.",
    });
  }

  return diagnostics;
}

function areaGapQuestions({
  summary,
  diagnostics,
}: {
  summary: FloorplanAreaSummary;
  diagnostics: FloorplanSolveDiagnostic[];
}): FloorplanGapPriority[] {
  const gaps: FloorplanGapPriority[] = [];
  if (summary.status !== "noTarget" && summary.status !== "withinTarget") {
    gaps.push({
      id: "official-area-variance",
      question: "Which rooms, halls, closets, or excluded structures explain the square-footage variance?",
      category: "scale-largest-unknown",
      impactScore: 99,
      whyItHelps:
        "Official square footage is the strongest whole-house check; resolving this variance improves every downstream room placement.",
      answerFormat:
        "Confirm official conditioned sqft, excluded garage/patio sqft, or one outside house dimension.",
    });
  }
  if (summary.excludedSqFt === 0) {
    gaps.push({
      id: "excluded-structures",
      question: "Are there garages, carports, patios, decks, porches, or sheds that should be excluded from house square footage?",
      category: "resolve-conflicts",
      impactScore: 88,
      whyItHelps:
        "Excluded spaces can make a layout appear too large unless the solver knows they do not count toward official living area.",
      answerFormat:
        "List each excluded area and give dimensions if known, for example: garage 20 ft x 22 ft.",
    });
  }
  if (diagnostics.some((diagnostic) => diagnostic.id === "missing-conditioned-area-target")) {
    gaps.push({
      id: "official-conditioned-area",
      question: "Official or suspected conditioned square footage",
      category: "scale-largest-unknown",
      impactScore: 84,
      whyItHelps:
        "A whole-house area target lets the solver catch missing rooms, hidden halls, and excluded-area mistakes.",
      answerFormat: "One number, for example: official house area is 1,842 sq ft.",
    });
  }
  return gaps;
}

function areaCalculations({
  rooms,
  zones,
  summary,
  diagnostics,
  inputMeasurementIds,
}: {
  rooms: FloorplanSolvedRoom[];
  zones: FloorplanSolvedZone[];
  summary: FloorplanAreaSummary;
  diagnostics: FloorplanSolveDiagnostic[];
  inputMeasurementIds: string[];
}): FloorplanCalculation[] {
  const roomCalculations = rooms.map((room) =>
    calculation({
      id: `calc-room-area-${room.id}`,
      label: `${room.label} solved area`,
      value: room.areaSqFt,
      subjectKey: room.id,
      subjectLabel: room.label,
      confidence: room.confidence,
      inputMeasurementIds: room.sourceMeasurementIds,
      outputMeasurementType: "area",
    }),
  );
  const zoneCalculations = zones.map((zone) =>
    calculation({
      id: `calc-zone-area-${zone.id}`,
      label: `${zone.label} solved area`,
      value: zone.areaSqFt,
      subjectKey: zone.id,
      subjectLabel: zone.label,
      confidence: zone.confidence,
      inputMeasurementIds: zone.sourceMeasurementIds,
      outputMeasurementType:
        zone.areaRole === "outdoor" ? "lotArea" : "excludedArea",
    }),
  );
  const totals = [
    calculation({
      id: "calc-conditioned-total",
      label: "Solved conditioned area",
      value: summary.conditionedSqFt,
      subjectKey: "conditioned-area",
      subjectLabel: "Conditioned area",
      confidence: "medium",
      inputMeasurementIds,
      outputMeasurementType: "conditionedArea",
    }),
    calculation({
      id: "calc-excluded-total",
      label: "Solved excluded area",
      value: summary.excludedSqFt,
      subjectKey: "excluded-area",
      subjectLabel: "Excluded area",
      confidence: "medium",
      inputMeasurementIds,
      outputMeasurementType: "excludedArea",
    }),
    calculation({
      id: "calc-footprint-total",
      label: "Solved footprint area",
      value: summary.footprintSqFt,
      subjectKey: "footprint-area",
      subjectLabel: "Footprint area",
      confidence: "medium",
      inputMeasurementIds,
      outputMeasurementType: "footprintArea",
    }),
  ];
  if (typeof summary.varianceSqFt === "number") {
    totals.push(
      calculation({
        id: "calc-area-variance",
        label: "Conditioned area variance",
        value: summary.varianceSqFt,
        subjectKey: "conditioned-area-variance",
        subjectLabel: "Conditioned area variance",
        confidence: Math.abs(summary.variancePercent ?? 0) <= areaTargetTolerancePercent
          ? "medium"
          : "low",
        inputMeasurementIds,
        outputMeasurementType: "areaVariance",
        kind: "variance",
        diagnostics,
      }),
    );
    totals.push(
      calculation({
        id: "calc-missing-area-estimate",
        label:
          summary.varianceSqFt < 0
            ? "Missing conditioned area estimate"
            : "Extra conditioned area estimate",
        value: Math.abs(summary.varianceSqFt),
        subjectKey: "conditioned-area-gap",
        subjectLabel: "Conditioned area gap",
        confidence:
          Math.abs(summary.variancePercent ?? 0) <= areaTargetTolerancePercent
            ? "medium"
            : "low",
        inputMeasurementIds,
        outputMeasurementType: "areaVariance",
        kind: "missingArea",
        diagnostics,
      }),
    );
  }
  if (typeof summary.lotCoveragePercent === "number") {
    totals.push(
      calculation({
        id: "calc-lot-coverage",
        label: "Lot coverage",
        value: summary.lotCoveragePercent,
        subjectKey: "lot-coverage",
        subjectLabel: "Lot coverage",
        confidence: "medium",
        inputMeasurementIds,
        outputMeasurementType: "area",
        unit: "percent",
        kind: "coverage",
      }),
    );
  }
  return [...roomCalculations, ...zoneCalculations, ...totals];
}

function calculation({
  id,
  label,
  value,
  subjectKey,
  subjectLabel,
  confidence,
  inputMeasurementIds,
  outputMeasurementType,
  unit = "sqft",
  kind = "area",
  diagnostics,
}: {
  id: string;
  label: string;
  value: number;
  subjectKey: string;
  subjectLabel: string;
  confidence: FloorplanConfidence;
  inputMeasurementIds: string[];
  outputMeasurementType: FloorplanMeasurementType;
  unit?: FloorplanCalculation["unit"];
  kind?: FloorplanCalculation["kind"];
  diagnostics?: FloorplanSolveDiagnostic[];
}): FloorplanCalculation {
  return {
    id,
    label,
    kind,
    formulaName: "floorplans.area-reconciliation.v1",
    unit,
    value,
    displayValue:
      unit === "percent" ? `${Math.round(value * 10) / 10}%` : formatSquareFeet(value),
    confidence,
    inputMeasurementIds,
    outputMeasurementType,
    subjectKey,
    subjectLabel,
    diagnostics,
  };
}

const areaTargetMeasurementTypes = new Set<string>([
  "area",
  "grossArea",
  "conditionedArea",
  "excludedArea",
  "lotArea",
  "footprintArea",
]);

function squareFeetMeasurementValue(measurement: FloorplanMeasurement) {
  if (typeof measurement.value === "number") {
    return measurement.unit === "acre"
      ? measurement.value * squareFeetPerAcre
      : measurement.value;
  }
  if (typeof measurement.valueIn === "number") {
    return measurement.valueIn / squareInchesPerSquareFoot;
  }
  return undefined;
}

function squareFeetMeasurementMin(measurement: FloorplanMeasurement) {
  if (typeof measurement.minValue === "number") {
    return measurement.unit === "acre"
      ? measurement.minValue * squareFeetPerAcre
      : measurement.minValue;
  }
  if (typeof measurement.minIn === "number") {
    return measurement.minIn / squareInchesPerSquareFoot;
  }
  return undefined;
}

function squareFeetMeasurementMax(measurement: FloorplanMeasurement) {
  if (typeof measurement.maxValue === "number") {
    return measurement.unit === "acre"
      ? measurement.maxValue * squareFeetPerAcre
      : measurement.maxValue;
  }
  if (typeof measurement.maxIn === "number") {
    return measurement.maxIn / squareInchesPerSquareFoot;
  }
  return undefined;
}

function areaRoleFromMeasurementType(
  measurementType: FloorplanMeasurement["measurementType"],
): FloorplanAreaRole {
  if (measurementType === "conditionedArea") return "conditioned";
  if (measurementType === "excludedArea") return "excluded";
  if (measurementType === "lotArea") return "outdoor";
  if (measurementType === "grossArea" || measurementType === "footprintArea") {
    return "unknown";
  }
  return "conditioned";
}

function defaultConstraintStrength(
  measurement: FloorplanMeasurement,
): FloorplanConstraintStrength {
  if (measurement.constraintStrength) return measurement.constraintStrength;
  if (measurement.kind === "known" && measurement.confidence === "high") return "strong";
  if (measurement.kind === "assumption" || measurement.kind === "range") return "soft";
  return "displayOnly";
}

function bestConditionedAreaTarget(targets: FloorplanAreaTarget[]) {
  return bestAreaTarget(
    targets.filter(
      (target) =>
        target.areaRole === "conditioned" &&
        typeof target.valueSqFt === "number" &&
        target.strength !== "displayOnly",
    ),
  );
}

function bestLotAreaTarget(targets: FloorplanAreaTarget[]) {
  return bestAreaTarget(
    targets.filter(
      (target) =>
        target.measurementType === "lotArea" && typeof target.valueSqFt === "number",
    ),
  );
}

function bestAreaTarget(targets: FloorplanAreaTarget[]) {
  return targets
    .map((target, index) => ({
      index,
      score:
        constraintStrengthRank(target.strength) * 100 +
        confidenceRank(target.confidence) * 10 +
        index,
      target,
    }))
    .sort((a, b) => b.score - a.score)[0]?.target;
}

function constraintStrengthRank(strength: FloorplanConstraintStrength) {
  if (strength === "hard") return 4;
  if (strength === "strong") return 3;
  if (strength === "soft") return 2;
  return 1;
}

function confidenceRank(confidence: FloorplanConfidence) {
  if (confidence === "high") return 4;
  if (confidence === "medium") return 3;
  if (confidence === "low") return 2;
  return 1;
}

function sumArea(
  spaces: Array<FloorplanSolvedRoom | FloorplanSolvedZone>,
  role: FloorplanAreaRole,
) {
  return spaces
    .filter((space) => space.areaRole === role)
    .reduce((total, space) => total + space.areaSqFt, 0);
}

function areaStatus(variancePercent: number | undefined): FloorplanAreaSummary["status"] {
  if (variancePercent === undefined) return "noTarget";
  if (Math.abs(variancePercent) <= areaTargetTolerancePercent) return "withinTarget";
  return variancePercent < 0 ? "underTarget" : "overTarget";
}
