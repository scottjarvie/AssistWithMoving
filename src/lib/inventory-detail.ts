export function formatOptionalNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : "";
}

export function formatOptionalCurrencyCents(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? (value / 100).toFixed(2)
    : "";
}

export function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseOptionalCurrencyCents(value: string) {
  const parsed = parseOptionalNumber(value);
  return typeof parsed === "number" ? Math.round(parsed * 100) : undefined;
}

export function parseCommaList(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}
