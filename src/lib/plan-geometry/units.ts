export type UnitSystem = "imperial" | "metric";

export function formatLengthInches(inches: number, unitSystem: UnitSystem) {
  if (unitSystem === "metric") {
    const meters = inches * 0.0254;
    return `${meters.toFixed(meters >= 10 ? 1 : 2)} m`;
  }

  const totalInches = Math.round(inches);
  const feet = Math.floor(totalInches / 12);
  const remainingInches = totalInches % 12;
  return feet > 0 ? `${feet}' ${remainingInches}"` : `${remainingInches}"`;
}

export function formatAreaSquareInches(
  squareInches: number,
  unitSystem: UnitSystem,
) {
  if (unitSystem === "metric") {
    const squareMeters = squareInches * 0.00064516;
    return `${squareMeters.toFixed(squareMeters >= 10 ? 1 : 2)} m2`;
  }

  return `${Math.round(squareInches / 144)} sq ft`;
}
