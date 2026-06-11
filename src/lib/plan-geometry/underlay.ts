import type { Point } from ".";

export function parsePlanLengthInput(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(in|inch|inches|"|ft|foot|feet|'|m|meter|meters)?$/);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const unit = match[2] ?? "in";
  if (unit === "ft" || unit === "foot" || unit === "feet" || unit === "'") {
    return amount * 12;
  }
  if (unit === "m" || unit === "meter" || unit === "meters") {
    return amount / 0.0254;
  }
  return amount;
}

export function calibratedUnderlayScale({
  currentScaleInPerPx,
  firstPoint,
  secondPoint,
  realLengthIn,
}: {
  currentScaleInPerPx: number;
  firstPoint: Point;
  secondPoint: Point;
  realLengthIn: number;
}) {
  const planDistanceIn = Math.hypot(
    secondPoint.x - firstPoint.x,
    secondPoint.y - firstPoint.y,
  );
  if (
    !Number.isFinite(currentScaleInPerPx) ||
    currentScaleInPerPx <= 0 ||
    !Number.isFinite(realLengthIn) ||
    realLengthIn <= 0 ||
    planDistanceIn < 1
  ) {
    return null;
  }

  return (realLengthIn * currentScaleInPerPx) / planDistanceIn;
}
