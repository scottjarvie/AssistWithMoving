// Shared sort spec for every inventory-style list (Spaces & Transport detail,
// Items page, Movable Units). The goal is ONE source of truth for the option
// labels + the comparison rules so the three surfaces never drift. Two surfaces
// (Spaces & Transport, Movable Units) sort a plain array with `compareBy`; the
// Items page is a tanstack table, so it maps a preset to a SortingState via
// `toTanstackSorting`.

export type SortFieldId =
  | "added"
  | "alpha"
  | "weight"
  | "volume"
  | "density"
  | "boxNumber"
  | "itemNumber";

export const INVENTORY_SORT_OPTIONS: {
  id: SortFieldId;
  label: string;
  short: string;
}[] = [
  { id: "added", label: "Recently added", short: "Added" },
  { id: "alpha", label: "Name (A–Z)", short: "A–Z" },
  { id: "weight", label: "Weight (heavy → light)", short: "Weight" },
  { id: "volume", label: "Cubic feet (large → small)", short: "ft³" },
  { id: "density", label: "Density (heaviest per ft³)", short: "Density" },
  { id: "boxNumber", label: "Box number (items last)", short: "Box #" },
  { id: "itemNumber", label: "Item number (boxes last)", short: "Item #" },
];

export const DEFAULT_SORT_FIELD: SortFieldId = "added";

// The minimal shape the comparator needs — both OrganizerEntry and MovableUnit
// can project onto this.
export type SortableEntry = {
  kind: "box" | "item";
  createdAt?: number;
  name: string;
  code?: string;
  weightLb?: number;
  volumeCuFt?: number;
};

// Natural ordering so "B-2" precedes "B-10" (not a naive string sort) and names
// compare case-insensitively.
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function isFinite_(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function byName(a: SortableEntry, b: SortableEntry): number {
  return collator.compare(a.name ?? "", b.name ?? "");
}

function byCode(a: SortableEntry, b: SortableEntry): number {
  return collator.compare(a.code ?? "", b.code ?? "");
}

// Numbers descending (heavy/large first); a MISSING value always sorts LAST,
// regardless of direction, so blanks never masquerade as zero at the top.
function numericDescMissingLast(av?: number, bv?: number): number {
  const aMissing = !isFinite_(av);
  const bMissing = !isFinite_(bv);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return bv - av;
}

// Weight per cubic foot. Undefined when either input is missing or volume is 0,
// so density-less entries sort last like any other missing measurement.
function densityOf(entry: SortableEntry): number | undefined {
  if (
    !isFinite_(entry.weightLb) ||
    !isFinite_(entry.volumeCuFt) ||
    entry.volumeCuFt <= 0
  ) {
    return undefined;
  }
  return entry.weightLb / entry.volumeCuFt;
}

// For boxNumber/itemNumber the "wrong" kind is pinned to the end (per Scott's
// spec: sorting by box number puts loose items last, and vice versa).
function kindRank(field: SortFieldId, kind: "box" | "item"): number {
  if (field === "boxNumber") return kind === "box" ? 0 : 1;
  if (field === "itemNumber") return kind === "item" ? 0 : 1;
  return 0;
}

export function compareBy(
  field: SortFieldId,
): (a: SortableEntry, b: SortableEntry) => number {
  switch (field) {
    case "added":
      return (a, b) => {
        const aMissing = !isFinite_(a.createdAt);
        const bMissing = !isFinite_(b.createdAt);
        if (aMissing && bMissing) return byName(a, b);
        if (aMissing) return 1;
        if (bMissing) return -1;
        return b.createdAt! - a.createdAt!; // newest first
      };
    case "alpha":
      return byName;
    case "weight":
      return (a, b) =>
        numericDescMissingLast(a.weightLb, b.weightLb) || byName(a, b);
    case "volume":
      return (a, b) =>
        numericDescMissingLast(a.volumeCuFt, b.volumeCuFt) || byName(a, b);
    case "density":
      return (a, b) =>
        numericDescMissingLast(densityOf(a), densityOf(b)) || byName(a, b);
    case "boxNumber":
      return (a, b) =>
        kindRank("boxNumber", a.kind) - kindRank("boxNumber", b.kind) ||
        byCode(a, b);
    case "itemNumber":
      return (a, b) =>
        kindRank("itemNumber", a.kind) - kindRank("itemNumber", b.kind) ||
        byCode(a, b);
  }
}

// Map a preset to a tanstack SortingState for the Items page (single-kind, so
// the box/item pinning is moot there — both code presets just sort by code).
// The accessor column ids must exist on that table.
export function toTanstackSorting(
  field: SortFieldId,
): { id: string; desc: boolean }[] {
  switch (field) {
    case "added":
      return [{ id: "createdAt", desc: true }];
    case "alpha":
      return [{ id: "name", desc: false }];
    case "weight":
      return [{ id: "weight", desc: true }];
    case "volume":
      return [{ id: "volume", desc: true }];
    case "density":
      return [{ id: "density", desc: true }];
    case "boxNumber":
    case "itemNumber":
      return [{ id: "code", desc: false }];
  }
}
