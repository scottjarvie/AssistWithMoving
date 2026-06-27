// Pure, framework-agnostic data layer for the "Spaces and Transport" page.
//
// The page shows every "thing" in the move grouped by where it physically lives
// (a moveSpace), where it is loaded (a transport resource), or — when it is in
// neither — a "Needs a home" orphan bucket. Items also surface under disposition
// buckets (Trash / Sell / Give away) regardless of where they sit.
//
// An "entry" unifies the two kinds of placeable things on this page:
//   - a box (a.k.a. movable unit), and
//   - a LOOSE item: any non-archived item that is not packed inside a box.
//
// Note this is intentionally broader than src/lib/movable-units.ts, which only
// surfaces large/loose "movable unit" items via isLooseMovableUnitItem(). Here we
// want EVERY loose item (including the small one marked trash/sell), because the
// whole point of the page is to see and organize all of it.

import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { InventoryItem } from "@/lib/inventory-types";
import { calculateMovableUnitVolumeCuFt } from "@/lib/movable-units";

export type ItemDisposition = InventoryItem["disposition"];

export type OrganizerEntryKind = "box" | "item";

export type OrganizerEntry = {
  /** Stable composite id: `box:<id>` or `item:<id>`. */
  id: string;
  kind: OrganizerEntryKind;
  recordId: Id<"boxes"> | Id<"items">;
  /** Box code or item code (short label). */
  code: string;
  name: string;
  status: string;
  /** Items only — boxes have no disposition. */
  disposition?: ItemDisposition;
  /** "N items" for a box, "N qty" for a loose item. */
  countLabel: string;
  roomLabel: string;
  destinationLabel: string;
  estimatedWeightLb?: number;
  estimatedVolumeCuFt?: number;
  /** Where it physically sits now. */
  currentSpaceId?: Id<"moveSpaces">;
  /** Which transport resource / zone it is loaded onto. */
  assignedResourceId?: Id<"transportResources">;
  assignedZoneId?: Id<"transportZones">;
  assignmentLocked: boolean;
  /** Lowercased blob for client-side search. */
  searchText: string;
};

export type OrganizerBoxRecord = {
  box: Doc<"boxes">;
  itemCount?: number;
  weightSummary?: { valueLb?: number } | null;
};

export type OrganizerSummary = {
  total: number;
  boxes: number;
  looseItems: number;
  knownWeightLb: number;
  knownVolumeCuFt: number;
  missingWeight: number;
  inSpace: number;
  onTransport: number;
  orphans: number;
  trash: number;
  sell: number;
  giveaway: number;
};

const TRASH_DISPOSITIONS: ReadonlySet<ItemDisposition> = new Set(["dump"]);
const SELL_DISPOSITIONS: ReadonlySet<ItemDisposition> = new Set(["sell"]);
const GIVEAWAY_DISPOSITIONS: ReadonlySet<ItemDisposition> = new Set([
  "donate",
  "free",
]);

export function buildOrganizerEntries({
  boxes = [],
  items = [],
}: {
  boxes?: readonly OrganizerBoxRecord[];
  items?: readonly InventoryItem[];
}): OrganizerEntry[] {
  const boxEntries = boxes
    .filter((record) => !record.box.archivedAt)
    .map(entryFromBox);
  const looseEntries = items.filter(isLooseItem).map(entryFromItem);
  return [...boxEntries, ...looseEntries];
}

/**
 * A loose item is any non-archived, non-deleted item that is not currently
 * packed inside any box. Box membership is reported by the signals query as
 * `signals.boxCount`; absence of signals is treated as "not in a box".
 */
export function isLooseItem(item: InventoryItem): boolean {
  if (item.status === "archived" || item.deletedAt) return false;
  return (item.signals?.boxCount ?? 0) === 0;
}

function entryFromBox(record: OrganizerBoxRecord): OrganizerEntry {
  const { box } = record;
  const weight =
    box.actualWeightLb ??
    box.estimatedWeightLb ??
    record.weightSummary?.valueLb ??
    undefined;
  const volume =
    box.estimatedVolumeCuFt ?? calculateMovableUnitVolumeCuFt(box.dimensionsIn);
  const itemCount = record.itemCount ?? 0;
  const name = box.nickname ?? box.label ?? box.description ?? "Box";
  return {
    id: `box:${box._id}`,
    kind: "box",
    recordId: box._id,
    code: box.code,
    name,
    status: box.status,
    disposition: undefined,
    countLabel: `${itemCount} item${itemCount === 1 ? "" : "s"}`,
    roomLabel: box.room ?? "Room unset",
    destinationLabel: box.destinationRoom ?? "Destination unset",
    estimatedWeightLb: finite(weight) ? weight : undefined,
    estimatedVolumeCuFt: finite(volume) ? volume : undefined,
    currentSpaceId: box.currentSpaceId,
    assignedResourceId: box.assignedResourceId,
    assignedZoneId: box.assignedZoneId,
    assignmentLocked: box.assignmentLocked ?? false,
    searchText: lower([
      box.code,
      name,
      box.label,
      box.description,
      box.room,
      box.destinationRoom,
      box.status,
    ]),
  };
}

function entryFromItem(item: InventoryItem): OrganizerEntry {
  const quantity = item.quantity && item.quantity > 0 ? item.quantity : 1;
  const unitWeight = item.actualWeightLb ?? item.estimatedWeightLb;
  const weight = finite(unitWeight) ? unitWeight * quantity : undefined;
  const unitVolume =
    item.estimatedVolumeCuFt ??
    item.estimatedPackedVolumeCuFt ??
    calculateMovableUnitVolumeCuFt(item.dimensionsIn);
  const volume = finite(unitVolume) ? unitVolume * quantity : undefined;
  const name = item.nickname ?? item.name;
  return {
    id: `item:${item._id}`,
    kind: "item",
    recordId: item._id,
    code: item.code ?? "Item",
    name,
    status: item.status,
    disposition: item.disposition,
    countLabel: `${quantity} qty`,
    roomLabel: item.room ?? "Room unset",
    destinationLabel: item.destinationRoom ?? "Destination unset",
    estimatedWeightLb: weight,
    estimatedVolumeCuFt: volume,
    currentSpaceId: item.currentSpaceId,
    assignedResourceId: item.assignedResourceId,
    assignedZoneId: item.assignedZoneId,
    assignmentLocked: item.assignmentLocked ?? false,
    searchText: lower([
      item.code,
      name,
      item.description,
      item.room,
      item.destinationRoom,
      item.category,
      item.subcategory,
      item.status,
      item.disposition,
      ...(item.aiTags ?? []),
    ]),
  };
}

// --- grouping predicates -------------------------------------------------

export function entriesInSpace(
  entries: readonly OrganizerEntry[],
  spaceId: Id<"moveSpaces">,
): OrganizerEntry[] {
  return entries.filter((e) => e.currentSpaceId === spaceId);
}

export function entriesOnResource(
  entries: readonly OrganizerEntry[],
  resourceId: Id<"transportResources">,
): OrganizerEntry[] {
  return entries.filter((e) => e.assignedResourceId === resourceId);
}

/** No physical space AND not loaded onto any transport — needs a home. */
export function isOrphanEntry(entry: OrganizerEntry): boolean {
  return (
    !entry.currentSpaceId && !entry.assignedResourceId && !entry.assignedZoneId
  );
}

export function orphanEntries(
  entries: readonly OrganizerEntry[],
): OrganizerEntry[] {
  return entries.filter(isOrphanEntry);
}

export type DispositionBucket = "trash" | "sell" | "giveaway";

export function dispositionBucketFor(
  disposition: ItemDisposition | undefined,
): DispositionBucket | undefined {
  if (!disposition) return undefined;
  if (TRASH_DISPOSITIONS.has(disposition)) return "trash";
  if (SELL_DISPOSITIONS.has(disposition)) return "sell";
  if (GIVEAWAY_DISPOSITIONS.has(disposition)) return "giveaway";
  return undefined;
}

export function entriesInDispositionBucket(
  entries: readonly OrganizerEntry[],
  bucket: DispositionBucket,
): OrganizerEntry[] {
  return entries.filter((e) => dispositionBucketFor(e.disposition) === bucket);
}

// --- stats ---------------------------------------------------------------

export function summarizeEntries(
  entries: readonly OrganizerEntry[],
): OrganizerSummary {
  return entries.reduce<OrganizerSummary>(
    (summary, entry) => {
      summary.total += 1;
      if (entry.kind === "box") summary.boxes += 1;
      else summary.looseItems += 1;

      if (finite(entry.estimatedWeightLb)) {
        summary.knownWeightLb += entry.estimatedWeightLb;
      } else {
        summary.missingWeight += 1;
      }
      if (finite(entry.estimatedVolumeCuFt)) {
        summary.knownVolumeCuFt += entry.estimatedVolumeCuFt;
      }

      if (entry.currentSpaceId) summary.inSpace += 1;
      if (entry.assignedResourceId || entry.assignedZoneId) {
        summary.onTransport += 1;
      }
      if (isOrphanEntry(entry)) summary.orphans += 1;

      const bucket = dispositionBucketFor(entry.disposition);
      if (bucket === "trash") summary.trash += 1;
      else if (bucket === "sell") summary.sell += 1;
      else if (bucket === "giveaway") summary.giveaway += 1;

      return summary;
    },
    {
      total: 0,
      boxes: 0,
      looseItems: 0,
      knownWeightLb: 0,
      knownVolumeCuFt: 0,
      missingWeight: 0,
      inSpace: 0,
      onTransport: 0,
      orphans: 0,
      trash: 0,
      sell: 0,
      giveaway: 0,
    },
  );
}

// --- small utils ---------------------------------------------------------

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function lower(values: Array<string | undefined | null>): string {
  return values.filter(Boolean).join(" ").toLowerCase();
}
