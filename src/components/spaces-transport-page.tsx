"use client";

// The "Spaces and Transport" page: a single place to see everything in a move
// grouped by WHERE it lives — a physical space (room/yard/storage), a transport
// resource (truck/trailer/…), a "Needs a home" bucket for anything in neither,
// and disposition lenses (Trash / Sell / Give away). Built mobile-first:
//  - tap a row to OPEN/edit the box or item (box detail page / item sheet);
//  - tap "Select" to enter selection mode, then tap whole rows to multi-select
//    (no fiddly checkboxes) and bulk move/assign/dispose;
//  - the container picker collapses on phones, hides empty containers behind a
//    "show empty" toggle, and sorts the fullest to the top;
//  - flat, dense framing instead of nested cards.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Gift,
  Home,
  ImageOff,
  ListChecks,
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
import { ItemDetailSheet } from "@/components/item-detail-sheet";
import { buildBoxLookupPath } from "@/lib/box-labels";
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
import { Skeleton } from "@/components/ui/skeleton";
import { DispositionBadge, StatusBadge } from "@/components/ui/status-badges";

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
};

type PhotoMap = ReadonlyMap<string, Id<"itemPhotos">>;

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

const DISPOSITION_ACTIONS: {
  value: InventoryItem["disposition"];
  label: string;
}[] = [
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
    <div className="space-y-4 p-3 sm:p-4 lg:p-6">
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
  const router = useRouter();
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
  const photosData = useQuery(api.photos.listForMove, {
    householdId,
    moveId,
    limit: 250,
  }) as Array<Doc<"itemPhotos">> | undefined;

  const placeInSpace = useMutation(api.movableUnits.batchPlaceInSpace);
  const assignTransport = useMutation(api.movableUnits.batchAssign);
  const updateItems = useMutation(api.items.batchUpdate);
  const updateItem = useMutation(api.items.update);

  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(
    null,
  );
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectMode, setSelectMode] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [overrideWarnings, setOverrideWarnings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loading =
    boxesData === undefined ||
    itemsData === undefined ||
    spacesData === undefined ||
    transportData === undefined;

  const entries = useMemo(
    () => buildOrganizerEntries({ boxes: boxesData ?? [], items: itemsData ?? [] }),
    [boxesData, itemsData],
  );

  const itemsById = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const item of itemsData ?? []) map.set(String(item._id), item);
    return map;
  }, [itemsData]);

  // Cover photo per entry: photos.listForMove is newest-first, so the first
  // photo seen for an item/box is its most recent — a good default thumbnail.
  // Keyed to match OrganizerEntry.id ("box:<id>" / "item:<id>").
  const photoByEntry = useMemo<PhotoMap>(() => {
    const map = new Map<string, Id<"itemPhotos">>();
    for (const photo of photosData ?? []) {
      if (photo.archivedAt) continue;
      if (photo.boxId) {
        const key = `box:${photo.boxId}`;
        if (!map.has(key)) map.set(key, photo._id);
      }
      if (photo.itemId) {
        const key = `item:${photo.itemId}`;
        if (!map.has(key)) map.set(key, photo._id);
      }
    }
    return map;
  }, [photosData]);

  const reportByResource = useMemo(() => {
    const map = new Map<string, ResourceReport>();
    for (const report of (reportData?.resourceReports ?? []) as ResourceReport[]) {
      map.set(String(report.resourceId), report);
    }
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
    });
    result.push({
      id: "disposition:sell",
      kind: "disposition",
      name: "Sell",
      subtitle: "Marked to sell",
      icon: Tag,
      entries: entriesInDispositionBucket(entries, "sell"),
    });
    result.push({
      id: "disposition:giveaway",
      kind: "disposition",
      name: "Give away",
      subtitle: "Donate or free",
      icon: Gift,
      entries: entriesInDispositionBucket(entries, "giveaway"),
    });
    return result;
  }, [entries, spacesData, transportData, reportByResource]);

  // Active container derived during render (avoids a setState-in-effect cascade):
  // the explicit pick when it still exists, else the fullest container.
  const effectiveContainerId = useMemo(() => {
    if (
      selectedContainerId &&
      containers.some((c) => c.id === selectedContainerId)
    ) {
      return selectedContainerId;
    }
    const fullest = [...containers]
      .filter((c) => c.entries.length > 0)
      .sort((a, b) => b.entries.length - a.entries.length)[0];
    return (fullest ?? containers[0])?.id ?? null;
  }, [selectedContainerId, containers]);

  const selectedContainer =
    containers.find((c) => c.id === effectiveContainerId) ?? null;

  function selectContainer(id: string) {
    setSelectedContainerId(id);
    setSelectedEntryIds(new Set());
    setSearch("");
    setPickerOpen(false); // collapse the mobile picker on choose
  }

  const globalSummary = useMemo(() => summarizeEntries(entries), [entries]);
  const physicalSpaces = useMemo(
    () => (spacesData ?? []).filter((s) => PHYSICAL_SPACE_KINDS.has(s.kind)),
    [spacesData],
  );

  const visibleEntries = useMemo(() => {
    if (!selectedContainer) return [];
    const q = search.trim().toLowerCase();
    const list = q
      ? selectedContainer.entries.filter((e) => e.searchText.includes(q))
      : selectedContainer.entries;
    return list;
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

  function enterSelectMode() {
    setSelectMode(true);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedEntryIds(new Set());
  }

  function selectAllVisible() {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      for (const e of visibleEntries) next.add(e.id);
      return next;
    });
  }

  function openEntry(entry: OrganizerEntry) {
    if (entry.kind === "box") {
      router.push(
        buildBoxLookupPath({
          householdId,
          moveId,
          boxId: entry.recordId as Id<"boxes">,
        }),
      );
      return;
    }
    const item = itemsById.get(String(entry.recordId));
    if (item) {
      setDetailItem(item);
      setDetailOpen(true);
    }
  }

  // The core gesture: a row tap selects (in select mode) or opens (otherwise).
  function onRowTap(entry: OrganizerEntry) {
    if (selectMode) toggleEntry(entry.id);
    else openEntry(entry);
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
      setMessage(summarize(result, spaceId ? "Moved" : "Removed from space"));
      exitSelectMode();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function runAssignTransport(resourceId: Id<"transportResources"> | null) {
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
      if (result.failed === 0) exitSelectMode();
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
      exitSelectMode();
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
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
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
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{globalSummary.total} things</Badge>
          <Badge variant="outline">{globalSummary.boxes} boxes</Badge>
          <Badge variant="outline">{globalSummary.looseItems} loose</Badge>
          <Badge variant={globalSummary.orphans > 0 ? "destructive" : "outline"}>
            {globalSummary.orphans} need a home
          </Badge>
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

      <div className="lg:grid lg:grid-cols-[18rem_1fr] lg:items-start lg:gap-4">
        {/* Container picker — collapsible on mobile, sticky rail on desktop. */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-background p-2.5 text-left lg:hidden"
            aria-expanded={pickerOpen}
          >
            {selectedContainer ? (
              <selectedContainer.icon
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {selectedContainer?.name ?? "Choose a space or transport"}
              </span>
              <span className="block text-[0.68rem] text-muted-foreground">
                Tap to switch container
              </span>
            </span>
            {selectedContainer ? (
              <Badge variant="secondary" className="shrink-0">
                {selectedContainer.entries.length}
              </Badge>
            ) : null}
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                pickerOpen && "rotate-180",
              )}
              aria-hidden
            />
          </button>

          <div
            className={cn(
              pickerOpen ? "block" : "hidden",
              "lg:block lg:sticky lg:top-4",
            )}
          >
            <ContainerRail
              containers={containers}
              selectedId={effectiveContainerId}
              onSelect={selectContainer}
            />
          </div>
        </div>

        {/* Detail */}
        <div className="mt-3 min-w-0 lg:mt-0">
          {selectedContainer ? (
            <ContainerDetail
              householdId={householdId}
              moveId={moveId}
              container={selectedContainer}
              visibleEntries={visibleEntries}
              selectedEntryIds={selectedEntryIds}
              selectMode={selectMode}
              photoByEntry={photoByEntry}
              onRowTap={onRowTap}
              onEnterSelect={enterSelectMode}
              onExitSelect={exitSelectMode}
              onSelectAll={selectAllVisible}
              search={search}
              onSearch={setSearch}
            />
          ) : (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Add a space or transport to start organizing.
            </p>
          )}
        </div>
      </div>

      {selectMode && selectedEntryIds.size > 0 ? (
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
          onDone={exitSelectMode}
        />
      ) : null}

      <ItemDetailSheet
        key={detailItem?._id ?? "none"}
        householdId={householdId}
        moveId={moveId}
        item={detailItem}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onSave={async (patch) => {
          if (!detailItem) return;
          await updateItem({ householdId, moveId, itemId: detailItem._id, ...patch });
          setMessage("Item details saved.");
        }}
      />
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
  const [showEmpty, setShowEmpty] = useState(false);

  const sections: { title: string; kind: ContainerKind }[] = [
    { title: "Spaces", kind: "space" },
    { title: "Transport", kind: "transport" },
    { title: "Needs a home", kind: "orphan" },
    { title: "By disposition", kind: "disposition" },
  ];

  // Fullest first; an empty container only shows if it's the active one or the
  // user opted to reveal empties.
  const emptyCount = containers.filter(
    (c) => c.entries.length === 0 && c.id !== selectedId,
  ).length;

  return (
    <div className="space-y-3">
      {sections.map(({ title, kind }) => {
        const all = containers
          .filter((c) => c.kind === kind)
          .sort((a, b) => b.entries.length - a.entries.length);
        const shown = all.filter(
          (c) => showEmpty || c.entries.length > 0 || c.id === selectedId,
        );
        if (shown.length === 0) return null;
        return (
          <section key={kind} className="space-y-1.5">
            <h2 className="px-0.5 text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </h2>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {shown.map((container) => (
                <ContainerTile
                  key={container.id}
                  container={container}
                  active={container.id === selectedId}
                  onSelect={() => onSelect(container.id)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {emptyCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={() => setShowEmpty((value) => !value)}
        >
          {showEmpty ? "Hide empty" : `Show ${emptyCount} empty`}
        </Button>
      ) : null}
    </div>
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
  householdId,
  moveId,
  container,
  visibleEntries,
  selectedEntryIds,
  selectMode,
  photoByEntry,
  onRowTap,
  onEnterSelect,
  onExitSelect,
  onSelectAll,
  search,
  onSearch,
}: {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  container: Container;
  visibleEntries: OrganizerEntry[];
  selectedEntryIds: Set<string>;
  selectMode: boolean;
  photoByEntry: PhotoMap;
  onRowTap: (entry: OrganizerEntry) => void;
  onEnterSelect: () => void;
  onExitSelect: () => void;
  onSelectAll: () => void;
  search: string;
  onSearch: (value: string) => void;
}) {
  const summary = useMemo(
    () => summarizeEntries(container.entries),
    [container.entries],
  );
  const Icon = container.icon;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{container.name}</p>
          <p className="text-xs text-muted-foreground">{container.subtitle}</p>
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

      {(summary.trash > 0 || summary.sell > 0 || summary.giveaway > 0) &&
      container.kind !== "disposition" ? (
        <div className="flex flex-wrap gap-1.5">
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

      {container.kind === "transport" && container.report ? (
        <div className="space-y-2 rounded-md bg-muted/30 p-2.5">
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

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search here"
            className="pl-8"
          />
        </div>
        {selectMode ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSelectAll}
              disabled={visibleEntries.length === 0}
            >
              All ({visibleEntries.length})
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onExitSelect}>
              Done
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEnterSelect}
            disabled={visibleEntries.length === 0}
          >
            <ListChecks className="size-4" aria-hidden /> Select
          </Button>
        )}
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
              householdId={householdId}
              moveId={moveId}
              entry={entry}
              photoId={photoByEntry.get(entry.id)}
              selectMode={selectMode}
              selected={selectedEntryIds.has(entry.id)}
              onTap={() => onRowTap(entry)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function EntryRow({
  householdId,
  moveId,
  entry,
  photoId,
  selectMode,
  selected,
  onTap,
}: {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  entry: OrganizerEntry;
  photoId?: Id<"itemPhotos">;
  selectMode: boolean;
  selected: boolean;
  onTap: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onTap}
        aria-pressed={selectMode ? selected : undefined}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md border p-2 text-left transition-colors",
          selected
            ? "border-primary bg-primary/5"
            : "border-border bg-background hover:bg-muted/40",
        )}
      >
        {selectMode ? (
          selected ? (
            <CheckCircle2 className="size-5 shrink-0 text-primary" aria-hidden />
          ) : (
            <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          )
        ) : null}

        <EntryThumbnail householdId={householdId} moveId={moveId} entry={entry} photoId={photoId} />

        {/* Name + meta get the lion's share of the width. */}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug">
            {entry.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {entry.code} · {entry.countLabel}
            {entry.estimatedWeightLb
              ? ` · ${formatNumber(entry.estimatedWeightLb)} lb`
              : ""}
          </p>
        </div>

        {/* Badges stack vertically in a narrow column to save horizontal room. */}
        <div className="flex shrink-0 flex-col items-end gap-1">
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

        {!selectMode ? (
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        ) : null}
      </button>
    </li>
  );
}

function EntryThumbnail({
  householdId,
  moveId,
  entry,
  photoId,
}: {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  entry: OrganizerEntry;
  photoId?: Id<"itemPhotos">;
}) {
  const getDisplayUrl = useAction(api.photos.getDisplayUrl);
  const [url, setUrl] = useState<string | null>(null);

  // Fetch the short-lived display URL for this entry's cover photo. The JSX
  // gates on `photoId && url`, so a not-yet-resolved or absent photo renders the
  // fallback icon — no synchronous reset needed.
  useEffect(() => {
    if (!photoId) return;
    let cancelled = false;
    void getDisplayUrl({ householdId, moveId, photoId, variant: "card" })
      .then((display) => {
        if (!cancelled) setUrl(display.url);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [getDisplayUrl, householdId, moveId, photoId]);

  return (
    <div className="size-11 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
      {photoId && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          {entry.kind === "box" ? (
            <Boxes className="size-4" aria-hidden />
          ) : photoId ? (
            <ImageOff className="size-4" aria-hidden />
          ) : (
            <Package className="size-4" aria-hidden />
          )}
        </div>
      )}
    </div>
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
  onDone,
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
  onDone: () => void;
}) {
  return (
    <div className="sticky bottom-3 z-10 mx-auto w-full">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/95 p-2.5 shadow-lg ring-1 ring-foreground/10 backdrop-blur">
        <Badge variant="secondary" className="shrink-0">
          {count} selected
        </Badge>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" disabled={busy}>
              <Home className="size-4" aria-hidden /> Space
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" disabled={busy}>
              <Truck className="size-4" aria-hidden /> Transport
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" disabled={busy}>
              <Tag className="size-4" aria-hidden /> Disposition
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
          Override
        </label>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={onDone}
          disabled={busy}
        >
          <X className="size-4" aria-hidden /> Done
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
        <p className="text-[0.68rem] text-muted-foreground">No capacity set</p>
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
