import type { FloorplanMeasurement } from "@/lib/floorplans/types";

type PrincipalMeasurementType =
  | "width"
  | "depth"
  | "clearWidth"
  | "clearDepth"
  | "wallThickness";

export function measurementsForSubject(
  measurements: FloorplanMeasurement[],
  subjectKey: string,
) {
  return measurements.filter(
    (measurement) =>
      measurement.status === "active" && measurement.subjectKey === subjectKey,
  );
}

export function hasMeasurement(
  measurements: FloorplanMeasurement[],
  measurementType: FloorplanMeasurement["measurementType"],
) {
  return measurements.some(
    (measurement) =>
      measurement.measurementType === measurementType &&
      ["known", "derived", "range"].includes(measurement.kind),
  );
}

export function dimensionFromConstraint(
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

export function bestMeasurementValue(
  measurements: FloorplanMeasurement[],
  measurementType: PrincipalMeasurementType,
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

export function rectangularSizeFromArea(
  measurement: FloorplanMeasurement | undefined,
) {
  const valueSqFt =
    measurement?.value ?? midpoint(measurement?.minValue, measurement?.maxValue);
  if (!valueSqFt || valueSqFt <= 0) return undefined;
  const widthFt = Math.sqrt(valueSqFt);
  const depthFt = valueSqFt / widthFt;
  return {
    widthIn: widthFt * 12,
    depthIn: depthFt * 12,
  };
}

function midpoint(min: number | undefined, max: number | undefined) {
  if (typeof min === "number" && typeof max === "number") return (min + max) / 2;
  return undefined;
}
