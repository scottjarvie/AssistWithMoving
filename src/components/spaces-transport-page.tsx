"use client";

// The "Spaces and Transport" page: a single place to see everything in a move
// grouped by WHERE it lives — a physical space (room/yard/storage), a transport
// resource (truck/trailer/…), a "Needs a home" bucket for anything in neither,
// and disposition buckets (Trash / Sell / Give away). Pick a container on the
// left, see its contents and stats on the right, multi-select rows, and bulk
// move them to a space, assign them to transport, or set their disposition.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Boxes,
  Gift,
  Home,
  MapPin,
  Package,
  Search,
  Tag,
  Trash2,
  Truck,
  Warehouse,
  X,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { InventoryItem } from "@/lib/inventory-types";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import {
  buildOrganizerEntries,
  dispositionBucketFor,
  entriesInDispositionBucket,
  entriesInSpace,
  entriesOnResource,
  isOrphanEntry,
  orphanEntries,
  summarizeEntries,
  type OrganizerEntry,
} from "@/lib/space-organizer";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DispositionBadge,
  StatusBadge,
} from "@/components/ui/status-badges";

// --- types & small label maps -------------------------------------------

type SpaceDoc = Doc<"moveSpaces"> & { photoCount?: number };
type ResourceDoc = Doc<"transportResources"> & {
  zones?: Doc<"transportZones">[];
};

type ResourceReport = {
  resourceId: Id<"transportResources">;
  estimatedWeightLb: number;
  estimatedVolumeCuFt: number;
  maxWeightLb?: number;
  maxVolumeCuFt?: number;
  weightPercent?: number;
  volumePercent?: number;
};

type ContainerKind = "space" | "transport" | "orphan" | "disposition";

type Container = {
  id: string;
  kind: ContainerKind;
  name: string;
  subtitle: string;
  icon: typeof Home;
  entries: OrganizerEntry[];
  spaceId?: Id<"moveSpaces">;
  resourceId?: Id<"transportResources">;
  report?: ResourceReport;
  /** Disposition buckets are item-only lenses that may overlap spaces. */
  isLens?: boolean;
};

// Physical spaces only — transportResource/transportZone "mirror" kinds are
// deliberately excluded (they are ghost rooms managed by the transport system).
const PHYSICAL_SPACE_KINDS = new Set([
  "originRoom",
  "destinationRoom",
  "yardOutdoor",
  "storage",
  "custom",
]);

const SPACE_KIND_LABEL: Record<string, string> = {
  originRoom: "Origin room",
  destinationRoom: "Destination room",
  yardOutdoor: "Yard / outdoor",
  storage: "Storage",
  custom: "Custom space",
};

const RESOURCE_TYPE_LABEL: Record<string, string> = {
  truck: "Truck",
  trailer: "Trailer",
  personalVehicle: "Personal vehicle",
  professionalMovers: "Professional movers",
  militaryMovers: "Military movers",
  storage: "Storage",
  dump: "Dump",
  sell: "Sell",
  donate: "Donate",
  free: "Free",
  freeGiveaway: "Give away",
  unknown: "Transport",
  custom: "Transport",
};

const DISPOSITION_ACTIONS: { value: InventoryItem["disposition"]; label: string }[] =
  [
    { value: "take", label: "Keep" },
    { value: "sell", label: "Sell" },
    { value: "donate", label: "Donate" },
    { value: "dump", label: "Trash" },
    { value: "undecided", label: "Undecided" },
  ];

// --- page entry point ----------------------------------------------------

export function SpacesTransportPageContent() {
  const { householdId, moveId, loadingMoves } = useMoveWorkspace();

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {loadingMoves ? (
        <Skeleton className="h-44 rounded-md" />
      ) : moveId && householdId ? (
        <SpacesTransportWorkspace householdId={householdId} moveId={moveId} />
      ) : (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-base font-medium">No active move</p>
            <p className="text-sm text-muted-foreground">
              Select or create a move to organize its spaces and transport.
            </p>
            <Button asChild size="sm">
              <Link href="/app/moves">Go to moves</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// --- main workspace ------------------------------------------------------

function SpacesTransportWorkspace({
  householdId,
  moveId,
}: {
  householdId: Id<"households">;
  moveId: Id<"moves">;
}) {
  const boxesData = useQuery(api.boxes.listForMove, { householdId, moveId });
  const itemsData = useQuery(api.items.listForMoveWithSignals, {
    householdId,
    moveId,
  });
  const spacesData = useQuery(api.moveSpaces.listForMove, {
    householdId,
    moveId,
  }) as SpaceDoc[] | undefined;
  const transportData = useQuery(api.transportResources.listForMoveWithZones, {
    householdId,
    moveId,
  }) as ResourceDoc[] | undefined;
  const reportData = useQuery(api.estimates.reportForMove, {
    householdId,
    moveId,
  });

  const placeInSpace = useMutation(api.movableUnits.batchPlaceInSpace);
  const assignTransport = useMutation(api.movableUnits.batchAssign);
  const updateItems = useMutation(api.items.batchUpdate);

  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(
    null,
  );
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [overrideWarnings, setOverrideWarnings] = useState(false);
  const [busy, setBusy] = useState(false);

  const loading =
    boxesData === undefined ||
    itemsData === undefined ||
    spacesData === undefined ||
    transportData === undefined;

  const entries = useMemo(
    () =>
      buildOrganizerEntries({
        boxes: boxesData ?? [],
        items: itemsData ?? [],
      }),
    [boxesData, itemsData],
  );

  const reportByResource = useMemo(() => {
    const map = new Map<string, ResourceReport>();
    const reports = (reportData?.resourceReports ?? []) as ResourceReport[];
    for (const report of reports) map.set(String(report.resourceId), report);
    return map;
  }, [reportData]);

  const containers = useMemo<Container[]>(() => {
    const result: Container[] = [];

    for (const space of spacesData ?? []) {
      if (!PHYSICAL_SPACE_KINDS.has(space.kind)) continue;
      result.push({
        id: `space:${space._id}`,
        kind: "space",
        name: space.name,
        subtitle: SPACE_KIND_LABEL[space.kind] ?? "Space",
        icon: space.kind === "yardOutdoor" ? MapPin : Home,
        entries: entriesInSpace(entries, space._id),
        spaceId: space._id,
      });
    }

    for (const resource of transportData ?? []) {
      result.push({
        id: `transport:${resource._id}`,
        kind: "transport",
        name: resource.name,
        subtitle: RESOURCE_TYPE_LABEL[resource.type] ?? "Transport",
        icon: Truck,
        entries: entriesOnResource(entries, resource._id),
        resourceId: resource._id,
        report: reportByResource.get(String(resource._id)),
      });
    }

    result.push({
      id: "orphan",
      kind: "orphan",
      name: "Needs a home",
      subtitle: "No space and no transport",
      icon: AlertTriangle,
      entries: orphanEntries(entries),
    });

    result.push({
      id: "disposition:trash",
      kind: "disposition",
      name: "Trash",
      subtitle: "Marked to dump",
      icon: Trash2,
      entries: entriesInDispositionBucket(entries, "trash"),
      isLens: true,
    });
    result.push({
      id: "disposition:sell",
      kind: "disposition",
      name: "Sell",
      subtitle: "Marked to sell",
      icon: Tag,
      entries: entriesInDispositionBucket(entries, "sell"),
      isLens: true,
    });
    result.push({
      id: "disposition:giveaway",
      kind: "disposition",
      name: "Give away",
      subtitle: "Donate or free",
      icon: Gift,
      entries: entriesInDispositionBucket(entries, "giveaway"),
      isLens: true,
    });

    return result;
  }, [entries, spacesData, transportData, reportByResource]);

  // The active container is derived during render: the user's explicit pick when
  // it still exists, otherwise the first non-empty container (or the first).
  // Deriving avoids a setState-in-effect cascade.
  const effectiveContainerId = useMemo(() => {
    if (
      selectedContainerId &&
      containers.some((c) => c.id === selectedContainerId)
    ) {
      return selectedContainerId;
    }
    const firstWithEntries = containers.find((c) => c.entries.length > 0);
    return (firstWithEntries ?? containers[0])?.id ?? null;
  }, [selectedContainerId, containers]);

  const selectedContainer =
    containers.find((c) => c.id === effectiveContainerId) ?? null;

  // Switching containers clears the row selection + search so a hidden row can't
  // be acted on. Done in the click handler (not an effect) to avoid cascades; a
  // stale selection is harmless anyway since bulk actions filter to live ids.
  function selectContainer(id: string) {
    setSelectedContainerId(id);
    setSelectedEntryIds(new Set());
    setSearch("");
  }

  const globalSummary = useMemo(() => summarizeEntries(entries), [entries]);

  const physicalSpaces = useMemo(
    () => (spacesData ?? []).filter((s) => PHYSICAL_SPACE_KINDS.has(s.kind)),
    [spacesData],
  );

  const visibleEntries = useMemo(() => {
    if (!selectedContainer) return [];
    const q = search.trim().toLowerCase();
    if (!q) return selectedContainer.entries;
    return selectedContainer.entries.filter((e) => e.searchText.includes(q));
  }, [selectedContainer, search]);

  const selectedEntries = useMemo(
    () => entries.filter((e) => selectedEntryIds.has(e.id)),
    [entries, selectedEntryIds],
  );

  function toggleEntry(id: string) {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      for (const e of visibleEntries) next.add(e.id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedEntryIds(new Set());
  }

  const unitsPayload = useMemo(
    () =>
      selectedEntries.map((e) => ({
        kind: e.kind === "box" ? ("box" as const) : ("item" as const),
        recordId: String(e.recordId),
      })),
    [selectedEntries],
  );

  async function runMoveToSpace(spaceId: Id<"moveSpaces"> | null) {
    if (unitsPayload.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await placeInSpace({
        householdId,
        moveId,
        units: unitsPayload,
        target: spaceId
          ? { currentSpaceId: spaceId }
          : { clearCurrentSpace: true },
      });
      setMessage(
        summarize(result, spaceId ? "Moved" : "Removed from space"),
      );
      clearSelection();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function runAssignTransport(
    resourceId: Id<"transportResources"> | null,
  ) {
    if (unitsPayload.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await assignTransport({
        householdId,
        moveId,
        units: unitsPayload,
        target: resourceId
          ? {
              assignedResourceId: resourceId,
              assignmentOverrideReason: overrideWarnings
                ? "Bulk reassigned from Spaces & Transport"
                : undefined,
            }
          : { clearAssignment: true },
      });
      let note = summarize(result, resourceId ? "Assigned" : "Unassigned");
      if (result.failed > 0 && !overrideWarnings) {
        note +=
          " Some have load warnings — toggle “Override warnings” and retry to force them.";
      }
      setMessage(note);
      if (result.failed === 0) clearSelection();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function runSetDisposition(disposition: InventoryItem["disposition"]) {
    const itemIds = selectedEntries
      .filter((e) => e.kind === "item")
      .map((e) => e.recordId as Id<"items">);
    if (itemIds.length === 0) {
      setMessage("Disposition applies to loose items — none selected.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await updateItems({
        householdId,
        moveId,
        itemIds,
        patch: { disposition },
      });
      setMessage(summarize(result, "Updated"));
      clearSelection();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-md" />
        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <Skeleton className="h-72 rounded-md" />
          <Skeleton className="h-72 rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Warehouse className="size-5 text-muted-foreground" aria-hidden />
          <h1 className="text-lg font-semibold">Spaces &amp; Transport</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Everything in this move, grouped by where it lives. Pick a space or
          transport to see what&apos;s inside, then select and reassign.
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{globalSummary.total} things</Badge>
          <Badge variant="outline">{globalSummary.boxes} boxes</Badge>
          <Badge variant="outline">{globalSummary.looseItems} loose</Badge>
          <Badge variant={globalSummary.orphans > 0 ? "destructive" : "outline"}>
            {globalSummary.orphans} need a home
          </Badge>
          {globalSummary.trash > 0 ? (
            <Badge variant="outline">{globalSummary.trash} trash</Badge>
          ) : null}
          {globalSummary.sell > 0 ? (
            <Badge variant="outline">{globalSummary.sell} sell</Badge>
          ) : null}
        </div>
      </header>

      {message ? (
        <p
          className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground"
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr] lg:items-start">
        <ContainerRail
          containers={containers}
          selectedId={effectiveContainerId}
          onSelect={selectContainer}
        />

        <div className="min-w-0 space-y-4">
          {selectedContainer ? (
            <ContainerDetail
              container={selectedContainer}
              visibleEntries={visibleEntries}
              selectedEntryIds={selectedEntryIds}
              onToggleEntry={toggleEntry}
              onSelectAll={selectAllVisible}
              onClearSelection={clearSelection}
              search={search}
              onSearch={setSearch}
            />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Select a container to see its contents.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {selectedEntryIds.size > 0 ? (
        <BulkActionBar
          count={selectedEntryIds.size}
          spaces={physicalSpaces}
          resources={transportData ?? []}
          overrideWarnings={overrideWarnings}
          onOverrideWarningsChange={setOverrideWarnings}
          busy={busy}
          onMoveToSpace={runMoveToSpace}
          onAssignTransport={runAssignTransport}
          onSetDisposition={runSetDisposition}
          onClear={clearSelection}
        />
      ) : null}
    </div>
  );
}

// --- container rail (master list) ---------------------------------------

function ContainerRail({
  containers,
  selectedId,
  onSelect,
}: {
  containers: Container[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const spaces = containers.filter((c) => c.kind === "space");
  const transports = containers.filter((c) => c.kind === "transport");
  const orphan = containers.filter((c) => c.kind === "orphan");
  const dispositions = containers.filter((c) => c.kind === "disposition");

  return (
    <div className="space-y-4 lg:sticky lg:top-4">
      <RailSection title="Spaces" empty="No spaces yet" containers={spaces} selectedId={selectedId} onSelect={onSelect} />
      <RailSection title="Transport" empty="No transport yet" containers={transports} selectedId={selectedId} onSelect={onSelect} />
      <RailSection title="Needs a home" containers={orphan} selectedId={selectedId} onSelect={onSelect} />
      <RailSection title="By disposition" containers={dispositions} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}

function RailSection({
  title,
  empty,
  containers,
  selectedId,
  onSelect,
}: {
  title: string;
  empty?: string;
  containers: Container[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="px-0.5 text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {containers.length === 0 ? (
        <p className="px-0.5 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {containers.map((container) => (
            <ContainerTile
              key={container.id}
              container={container}
              active={container.id === selectedId}
              onSelect={() => onSelect(container.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ContainerTile({
  container,
  active,
  onSelect,
}: {
  container: Container;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = container.icon;
  const weight = container.entries.reduce(
    (sum, e) => sum + (e.estimatedWeightLb ?? 0),
    0,
  );
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-2 rounded-md border p-2.5 text-left transition-colors",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border bg-background hover:bg-muted/50",
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {container.name}
        </span>
        <span className="block truncate text-[0.68rem] text-muted-foreground">
          {container.subtitle}
          {weight > 0 ? ` · ${formatNumber(weight)} lb` : ""}
        </span>
      </span>
      <Badge
        variant={
          container.kind === "orphan" && container.entries.length > 0
            ? "destructive"
            : "secondary"
        }
        className="shrink-0"
      >
        {container.entries.length}
      </Badge>
    </button>
  );
}

// --- container detail (contents + stats) --------------------------------

function ContainerDetail({
  container,
  visibleEntries,
  selectedEntryIds,
  onToggleEntry,
  onSelectAll,
  onClearSelection,
  search,
  onSearch,
}: {
  container: Container;
  visibleEntries: OrganizerEntry[];
  selectedEntryIds: Set<string>;
  onToggleEntry: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  search: string;
  onSearch: (value: string) => void;
}) {
  const summary = useMemo(
    () => summarizeEntries(container.entries),
    [container.entries],
  );
  const Icon = container.icon;
  const selectedVisible = visibleEntries.filter((e) =>
    selectedEntryIds.has(e.id),
  ).length;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className="size-5 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-base font-semibold">{container.name}</p>
              <p className="text-xs text-muted-foreground">
                {container.subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatPill label="Things" value={String(summary.total)} />
          <StatPill
            label="Boxes / loose"
            value={`${summary.boxes} / ${summary.looseItems}`}
          />
          <StatPill label="Weight" value={`${formatNumber(summary.knownWeightLb)} lb`} />
          <StatPill
            label="Volume"
            value={`${formatNumber(summary.knownVolumeCuFt)} cu ft`}
          />
        </div>

        {/* Disposition / status hint row */}
        {(summary.trash > 0 || summary.sell > 0 || summary.giveaway > 0) &&
        container.kind !== "disposition" ? (
          <div className="flex flex-wrap gap-2">
            {summary.trash > 0 ? (
              <Badge variant="outline">{summary.trash} trash</Badge>
            ) : null}
            {summary.sell > 0 ? (
              <Badge variant="outline">{summary.sell} sell</Badge>
            ) : null}
            {summary.giveaway > 0 ? (
              <Badge variant="outline">{summary.giveaway} give away</Badge>
            ) : null}
          </div>
        ) : null}

        {/* Capacity (transport only) */}
        {container.kind === "transport" && container.report ? (
          <div className="space-y-2">
            <CapacityBar
              label="Weight"
              value={container.report.estimatedWeightLb}
              max={container.report.maxWeightLb}
              percent={container.report.weightPercent}
              unit="lb"
            />
            <CapacityBar
              label="Volume"
              value={container.report.estimatedVolumeCuFt}
              max={container.report.maxVolumeCuFt}
              percent={container.report.volumePercent}
              unit="cu ft"
            />
          </div>
        ) : null}

        <Separator />

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[10rem] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search in this container"
              className="pl-8"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSelectAll}
            disabled={visibleEntries.length === 0}
          >
            Select all ({visibleEntries.length})
          </Button>
          {selectedVisible > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClearSelection}>
              Clear
            </Button>
          ) : null}
        </div>

        {/* Entry list */}
        {visibleEntries.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {container.entries.length === 0
              ? "Nothing here yet."
              : "No matches for that search."}
          </p>
        ) : (
          <ul className="space-y-2">
            {visibleEntries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                checked={selectedEntryIds.has(entry.id)}
                onToggle={() => onToggleEntry(entry.id)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EntryRow({
  entry,
  checked,
  onToggle,
}: {
  entry: OrganizerEntry;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-md border p-2.5",
        checked ? "border-primary bg-primary/5" : "border-border bg-background",
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        aria-label={`Select ${entry.name}`}
      />
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {entry.kind === "box" ? (
          <Boxes className="size-4" aria-hidden />
        ) : (
          <Package className="size-4" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{entry.name}</span>
          <span className="text-xs text-muted-foreground">{entry.code}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{entry.countLabel}</span>
          <span aria-hidden>·</span>
          <span>{entry.roomLabel}</span>
          {entry.estimatedWeightLb ? (
            <>
              <span aria-hidden>·</span>
              <span>{formatNumber(entry.estimatedWeightLb)} lb</span>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        <StatusBadge status={entry.status} />
        {entry.kind === "item" &&
        entry.disposition &&
        dispositionBucketFor(entry.disposition) ? (
          <DispositionBadge disposition={entry.disposition} />
        ) : null}
        {isOrphanEntry(entry) ? (
          <Badge variant="outline" className="text-muted-foreground">
            no home
          </Badge>
        ) : null}
      </div>
    </li>
  );
}

// --- bulk action bar -----------------------------------------------------

function BulkActionBar({
  count,
  spaces,
  resources,
  overrideWarnings,
  onOverrideWarningsChange,
  busy,
  onMoveToSpace,
  onAssignTransport,
  onSetDisposition,
  onClear,
}: {
  count: number;
  spaces: SpaceDoc[];
  resources: ResourceDoc[];
  overrideWarnings: boolean;
  onOverrideWarningsChange: (value: boolean) => void;
  busy: boolean;
  onMoveToSpace: (spaceId: Id<"moveSpaces"> | null) => void;
  onAssignTransport: (resourceId: Id<"transportResources"> | null) => void;
  onSetDisposition: (disposition: InventoryItem["disposition"]) => void;
  onClear: () => void;
}) {
  return (
    <div className="sticky bottom-4 z-10 mx-auto w-full">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/95 p-3 shadow-lg ring-1 ring-foreground/10 backdrop-blur">
        <Badge variant="secondary" className="shrink-0">
          {count} selected
        </Badge>

        {/* Move to space */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" disabled={busy}>
              <Home className="size-4" aria-hidden /> Move to space
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>Move into…</DropdownMenuLabel>
            {spaces.length === 0 ? (
              <DropdownMenuItem disabled>No spaces yet</DropdownMenuItem>
            ) : (
              spaces.map((space) => (
                <DropdownMenuItem
                  key={space._id}
                  onSelect={() => onMoveToSpace(space._id)}
                >
                  {space.name}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onMoveToSpace(null)}>
              Remove from space
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Assign to transport */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" disabled={busy}>
              <Truck className="size-4" aria-hidden /> Assign transport
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>Load onto…</DropdownMenuLabel>
            {resources.length === 0 ? (
              <DropdownMenuItem disabled>No transport yet</DropdownMenuItem>
            ) : (
              resources.map((resource) => (
                <DropdownMenuItem
                  key={resource._id}
                  onSelect={() => onAssignTransport(resource._id)}
                >
                  {resource.name}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAssignTransport(null)}>
              Unassign transport
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Set disposition */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" disabled={busy}>
              <Tag className="size-4" aria-hidden /> Set disposition
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Mark items as…</DropdownMenuLabel>
            {DISPOSITION_ACTIONS.map((action) => (
              <DropdownMenuItem
                key={action.value}
                onSelect={() => onSetDisposition(action.value)}
              >
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox
            checked={overrideWarnings}
            onCheckedChange={(value) => onOverrideWarningsChange(value === true)}
          />
          Override warnings
        </label>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={onClear}
          disabled={busy}
        >
          <X className="size-4" aria-hidden /> Clear
        </Button>
      </div>
    </div>
  );
}

// --- small presentational helpers ---------------------------------------

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2">
      <p className="text-[0.62rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function CapacityBar({
  label,
  value,
  max,
  percent,
  unit,
}: {
  label: string;
  value: number;
  max?: number;
  percent?: number;
  unit: string;
}) {
  const pct = typeof percent === "number" ? percent : undefined;
  const over = pct !== undefined && pct > 100;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn(over && "font-medium text-destructive")}>
          {formatNumber(value)}
          {max ? ` / ${formatNumber(max)}` : ""} {unit}
          {pct !== undefined ? ` · ${Math.round(pct)}%` : ""}
        </span>
      </div>
      {pct !== undefined ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      ) : (
        <p className="text-[0.68rem] text-muted-foreground">
          No capacity set
        </p>
      )}
    </div>
  );
}

// --- pure utils ----------------------------------------------------------

type BatchResult = { succeeded: number; failed: number };

function summarize(result: BatchResult, verb: string): string {
  if (result.failed === 0) {
    return `${verb} ${result.succeeded} unit${result.succeeded === 1 ? "" : "s"}.`;
  }
  return `${verb} ${result.succeeded}, ${result.failed} could not be updated.`;
}

function errorText(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (typeof data === "string") return data;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
