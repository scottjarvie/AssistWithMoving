"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { ImageOff, PackageOpen, PackagePlus, Search, Truck } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  isRowOpenIgnoredTarget,
  type OnBatchAction,
} from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AssignmentBadge } from "@/components/ui/status-badges";
import { ItemDetailSheet } from "@/components/item-detail-sheet";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { buildBoxLookupPath } from "@/lib/box-labels";
import { toastSaved, toastError } from "@/lib/toast";
import {
  compareBy,
  DEFAULT_SORT_FIELD,
  type SortableEntry,
  type SortFieldId,
} from "@/lib/inventory-sort";
import { SortMenu } from "@/components/inventory-sort-menu";
import { useScrollRestoration } from "@/components/use-scroll-restoration";
import {
  buildMovableUnits,
  summarizeMovableUnits,
  type MovableUnit,
} from "@/lib/movable-units";

type ResourcesWithZones = NonNullable<
  ReturnType<
    typeof useQuery<typeof api.transportResources.listForMoveWithZones>
  >
>;

type TripsWithSpaces = NonNullable<
  ReturnType<typeof useQuery<typeof api.transportTrips.listForMoveWithSpaces>>
>;

type BatchAssignResult = Awaited<
  ReturnType<
    ReturnType<typeof useMutation<typeof api.movableUnits.batchAssign>>
  >
>;

/**
 * Movable-unit batch assignment. This maps 1:1 onto the server
 * `movableUnits.batchAssign` mutation (the single validated batch path shared
 * with the agent/MCP applyAssignments lane): pick a transport method, then an
 * optional trip / zone / trip-space, or clear the assignment entirely.
 */
type MovableUnitBatchAction =
  | {
      type: "assign";
      resourceId?: string;
      tripId?: string;
      zoneId?: string;
      tripSpaceId?: string;
      overrideReason?: string;
      includeLocked: boolean;
      dryRun: boolean;
    }
  | { type: "unassign"; includeLocked: boolean; dryRun: boolean };

// Manual create-a-movable-unit (a numbered box/container). A movable unit is a
// box or a large loose item; "add a movable unit" creates a box, which gets the
// next B-number automatically. Size, placement, and contents are added after,
// from the unit's detail page — so this form stays intentionally tiny.
function AddMovableUnitDialog({
  householdId,
  moveId,
  open,
  onOpenChange,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createBox = useMutation(api.boxes.create);
  const [nickname, setNickname] = useState("");
  const [room, setRoom] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!householdId || !moveId || creating) {
      return;
    }
    setCreating(true);
    try {
      await createBox({
        householdId,
        moveId,
        nickname: nickname.trim() || undefined,
        room: room.trim() || undefined,
      });
      toastSaved("Movable unit added");
      setNickname("");
      setRoom("");
      onOpenChange(false);
    } catch (error) {
      toastError(
        error instanceof Error
          ? error.message
          : "Could not add the movable unit",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a movable unit</DialogTitle>
          <DialogDescription>
            Creates a numbered box/container with the next B-number. Add a name
            so it&apos;s easy to spot; set its size, placement, and contents from
            the unit&apos;s page after it&apos;s created.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">Name / nickname</span>
            <Input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="e.g. Kitchen pots"
              aria-label="Movable unit name"
              autoFocus
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">Room (optional)</span>
            <Input
              value={room}
              onChange={(event) => setRoom(event.target.value)}
              placeholder="e.g. Kitchen"
              aria-label="Movable unit room"
            />
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!moveId || creating}>
              {creating ? "Adding…" : "Add unit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MovableUnitsTable({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const boxes = useQuery(
    api.boxes.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const items = useQuery(
    api.items.listForMoveWithSignals,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const resourcesWithZones = useQuery(
    api.transportResources.listForMoveWithZones,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const tripsWithSpaces = useQuery(
    api.transportTrips.listForMoveWithSpaces,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const movePhotos = useQuery(
    api.photos.listForMove,
    householdId && moveId ? { householdId, moveId, limit: 250 } : "skip",
  );
  const batchAssign = useMutation(api.movableUnits.batchAssign);
  const updateItem = useMutation(api.items.update);
  const router = useRouter();

  // Manual "add a movable unit" (a numbered box/container) — the mobile Add menu
  // and the header button both open this dialog. Opens automatically when the
  // page is reached with #add-unit (e.g. from the mobile "Manually Add Movable
  // Unit" action), then strips the hash so a later navigation can re-trigger it.
  const [addUnitOpen, setAddUnitOpen] = useState(false);
  useEffect(() => {
    function syncFromHash() {
      if (window.location.hash === "#add-unit") {
        setAddUnitOpen(true);
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }
    }
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  // Row-open detail target. Box units navigate to the box detail route; loose
  // items open the same in-page ItemDetailSheet the Items table uses, so every
  // row in this table is consistently clickable.
  const [selectedLooseItemId, setSelectedLooseItemId] =
    useState<Id<"items"> | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "error">("info");
  // True once a dry-run preview reports soft warnings, so the batch toolbar
  // reveals the override-reason input (the server enforces the same gate).
  const [previewNeedsReason, setPreviewNeedsReason] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [sortField, setSortField] = useState<SortFieldId>(DEFAULT_SORT_FIELD);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  // A single active stat filter (click a stat chip to filter the list, click it
  // again to clear). Counts stay full-move accurate; only the rows are filtered.
  const [statFilter, setStatFilter] = useState<StatFilter>(null);
  const [search, setSearch] = useState("");

  const resourceNamesById = useMemo(
    () =>
      new Map(
        resourcesWithZones?.map(({ resource }) => [
          String(resource._id),
          resource.name,
        ]) ?? [],
      ),
    [resourcesWithZones],
  );
  const zoneNamesById = useMemo(
    () =>
      new Map(
        resourcesWithZones?.flatMap(({ zones }) =>
          zones.map((zone) => [String(zone._id), zone.name] as const),
        ) ?? [],
      ),
    [resourcesWithZones],
  );
  const boxedItemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const record of boxes ?? []) {
      for (const entry of record.contents) {
        if (entry) {
          ids.add(entry.item._id);
        }
      }
    }
    return ids;
  }, [boxes]);
  const looseItems = useMemo(
    () =>
      (items ?? []).filter(
        (item) => item.status !== "archived" && !boxedItemIds.has(item._id),
      ),
    [boxedItemIds, items],
  );
  const units = useMemo(
    () =>
      buildMovableUnits({
        boxes: boxes ?? [],
        looseItems,
        resourceNamesById,
        zoneNamesById,
      }),
    [boxes, looseItems, resourceNamesById, zoneNamesById],
  );
  const summary = useMemo(() => summarizeMovableUnits(units), [units]);
  // Rows actually shown — the full set, narrowed by the active stat chip and the
  // search box (each unit's prebuilt searchText covers name/code/nickname/room/
  // category/assignment/tags).
  const visibleUnits = useMemo(() => {
    const byStat = statFilter
      ? units.filter(matchesStatFilter(statFilter))
      : units;
    const q = search.trim().toLowerCase();
    const filtered = q
      ? byStat.filter((unit) => unit.searchText.includes(q))
      : byStat;
    const compare = compareBy(sortField);
    return [...filtered].sort((a, b) =>
      compare(unitToSortable(a), unitToSortable(b)),
    );
  }, [units, statFilter, search, sortField]);
  function toggleStatFilter(next: StatFilter) {
    setStatFilter((current) => (current === next ? null : next));
  }
  // All photos per box / loose item, keyed by MovableUnit.id, newest-first
  // (listForMove returns newest-first). The first is the cover thumbnail; the
  // full list feeds the lightbox so you can scroll through every photo.
  const photosByUnit = useMemo(() => {
    const map = new Map<string, Id<"itemPhotos">[]>();
    const push = (key: string, photoId: Id<"itemPhotos">) => {
      const list = map.get(key);
      if (list) list.push(photoId);
      else map.set(key, [photoId]);
    };
    for (const photo of movePhotos ?? []) {
      if (photo.archivedAt) continue;
      if (photo.boxId) push(`box:${photo.boxId}`, photo._id);
      if (photo.itemId) push(`looseItem:${photo.itemId}`, photo._id);
    }
    return map;
  }, [movePhotos]);
  const selectedLooseItem = useMemo(
    () => items?.find((item) => item._id === selectedLooseItemId) ?? null,
    [items, selectedLooseItemId],
  );

  const handleRowOpen = useCallback(
    (unit: MovableUnit) => {
      if (unit.kind === "box") {
        if (!householdId || !moveId) return;
        router.push(
          buildBoxLookupPath({
            boxId: unit.recordId as Id<"boxes">,
            householdId,
            moveId,
            returnTo: "movable-units",
          }),
        );
        return;
      }
      // Loose item -> open the in-page detail sheet.
      setSelectedLooseItemId(unit.recordId as Id<"items">);
      setDetailOpen(true);
    },
    [householdId, moveId, router],
  );

  // Jump straight to the weight & size editor (MOVE-343): boxes deep-link to the
  // detail page with the editor open; loose items open the in-page detail sheet.
  const handleEditSize = useCallback(
    (unit: MovableUnit) => {
      if (unit.kind === "box") {
        if (!householdId || !moveId) return;
        router.push(
          buildBoxLookupPath({
            boxId: unit.recordId as Id<"boxes">,
            householdId,
            moveId,
            returnTo: "movable-units",
            edit: "size",
          }),
        );
        return;
      }
      setSelectedLooseItemId(unit.recordId as Id<"items">);
      setDetailOpen(true);
    },
    [householdId, moveId, router],
  );

  const loading =
    boxes === undefined ||
    items === undefined ||
    resourcesWithZones === undefined ||
    tripsWithSpaces === undefined;

  // Land back on the row you opened: restore the list scroll position when
  // returning from a box detail page (rows here navigate away to /app/boxes/...).
  useScrollRestoration(!loading, moveId ?? undefined);

  const captureHref =
    moveId !== null ? `/app/moves/${moveId}/capture` : "/app/moves";

  // Single server batch path. Maps the selected MovableUnit rows to the
  // {kind, recordId} shape batchAssign expects (looseItem -> item), filters
  // locked rows client-side unless the user opts in, and surfaces the unified
  // per-row results (succeeded / failed + assignmentWarnings / hardBlocks).
  const handleBatchAction = useCallback<
    OnBatchAction<MovableUnit, MovableUnitBatchAction>
  >(
    async ({ action, rows, clearSelection }) => {
      if (!householdId || !moveId || !rows.length) {
        return;
      }

      const includeLocked = action.includeLocked;
      const assignableUnits = rows.filter(
        (unit) => includeLocked || !unit.assignmentLocked,
      );
      const skippedLockedCount = rows.length - assignableUnits.length;
      if (!assignableUnits.length) {
        setMessageTone("error");
        setMessage(
          skippedLockedCount
            ? `${skippedLockedCount} locked ${unitWord(skippedLockedCount)} skipped. Unlock first or include locked units deliberately.`
            : "No selected movable units are available for assignment.",
        );
        return;
      }

      const dryRun = action.dryRun;
      const target =
        action.type === "assign"
          ? {
              assignedResourceId: action.resourceId
                ? (action.resourceId as Id<"transportResources">)
                : undefined,
              assignedZoneId: action.zoneId
                ? (action.zoneId as Id<"transportZones">)
                : undefined,
              assignedTripId: action.tripId
                ? (action.tripId as Id<"transportTrips">)
                : undefined,
              assignedTripSpaceId: action.tripSpaceId
                ? (action.tripSpaceId as Id<"tripSpaces">)
                : undefined,
              assignmentOverrideReason: action.overrideReason,
            }
          : { clearAssignment: true };

      setMessage(null);
      try {
        const result = (await batchAssign({
          householdId,
          moveId,
          units: assignableUnits.map((unit) => ({
            kind: unit.kind === "box" ? ("box" as const) : ("item" as const),
            recordId: String(unit.recordId),
          })),
          target,
          dryRun,
        })) as BatchAssignResult;

        const verb = action.type === "assign" ? "assign" : "unassign";
        setMessageTone(result.failed > 0 ? "error" : "info");
        setMessage(
          summarizeBatchResult(result, {
            verb,
            dryRun,
            skippedLockedCount,
          }),
        );

        // Reveal the override-reason input when any row reports soft warnings;
        // hide it again once a clean preview/assign comes back.
        if (action.type === "assign") {
          const hadWarnings = result.results.some(
            (row) => (row.assignmentWarnings?.length ?? 0) > 0,
          );
          setPreviewNeedsReason(hadWarnings);
        }

        // Only a committed (non-dry-run) run with no failures clears selection,
        // so the user can fix or override the failures and retry.
        if (!dryRun && result.failed === 0) {
          clearSelection();
        }
      } catch (error) {
        setMessageTone("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not update the selected movable-unit assignments.",
        );
      }
    },
    [batchAssign, householdId, moveId],
  );

  const columns = useMemo<ColumnDef<MovableUnit, unknown>[]>(
    () => [
      {
        id: "thumbnail",
        meta: { label: "Photo", mobile: "primary", headClassName: "w-14" },
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <UnitThumbnail
            householdId={householdId}
            moveId={moveId}
            photoIds={photosByUnit.get(row.original.id) ?? []}
          />
        ),
      },
      {
        accessorKey: "name",
        meta: {
          label: "Unit",
          mobile: "primary",
          headClassName: "min-w-[16rem] w-[26%]",
          cellClassName: "max-w-[28rem] whitespace-normal",
        },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Unit" />
        ),
        cell: ({ row }) => {
          const unit = row.original;
          const openBoxHref =
            unit.kind === "box" && householdId && moveId
              ? buildBoxLookupPath({
                  boxId: unit.recordId as Id<"boxes">,
                  householdId,
                  moveId,
                  returnTo: "movable-units",
                })
              : null;
          return (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant={unit.kind === "box" ? "outline" : "secondary"}
                >
                  {unit.label}
                </Badge>
                <Badge variant="outline">{unit.status}</Badge>
              </div>
              <p className="mt-1 truncate font-medium">{unit.name}</p>
              {openBoxHref ? (
                <Button asChild size="sm" variant="ghost" className="mt-1">
                  <Link
                    href={openBoxHref}
                    aria-label={`Open ${unit.label} contents`}
                  >
                    <PackageOpen aria-hidden="true" />
                    Open box
                  </Link>
                </Button>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "location",
        accessorFn: (unit) => `${unit.roomLabel} ${unit.destinationLabel}`,
        meta: {
          label: "Location",
          mobile: "primary",
          cellClassName: "max-w-[16rem] whitespace-normal",
        },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Location" />
        ),
        cell: ({ row }) => (
          <div className="text-sm">
            <p>{row.original.roomLabel}</p>
            <p className="text-xs text-muted-foreground">
              to {row.original.destinationLabel}
            </p>
          </div>
        ),
      },
      {
        id: "weight",
        accessorFn: (unit) => unit.estimatedWeightLb ?? -1,
        meta: { label: "Weight", mobile: "primary", align: "start" },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Weight" />
        ),
        cell: ({ row }) =>
          row.original.missingFields.includes("weight") ? (
            <EditSizeButton
              unit={row.original}
              onEditSize={handleEditSize}
              className="text-sm text-muted-foreground"
            >
              {row.original.weightLabel}
            </EditSizeButton>
          ) : (
            <span className="font-medium">{row.original.weightLabel}</span>
          ),
      },
      {
        id: "density",
        accessorFn: (unit) => unit.densityLbPerCuFt ?? -1,
        meta: { label: "Density", mobile: "primary", align: "start" },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Density" />
        ),
        cell: ({ row }) => (
          <span
            className={
              row.original.densityLbPerCuFt === undefined
                ? "text-muted-foreground"
                : "font-medium"
            }
          >
            {row.original.densityLabel}
          </span>
        ),
      },
      {
        id: "size",
        meta: {
          label: "Size / volume",
          mobile: "expansion",
          cellClassName: "max-w-[14rem] whitespace-normal",
        },
        header: "Size / volume",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.missingFields.includes("dimensions") ? (
              <EditSizeButton unit={row.original} onEditSize={handleEditSize}>
                {row.original.dimensionsLabel}
              </EditSizeButton>
            ) : (
              <p>{row.original.dimensionsLabel}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {row.original.volumeLabel}
            </p>
          </div>
        ),
      },
      {
        id: "load",
        accessorFn: (unit) => unit.assignmentState,
        meta: { label: "Load", mobile: "primary", headClassName: "w-40" },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Load" />
        ),
        cell: ({ row }) => (
          <AssignmentBadge
            state={row.original.assignmentState}
            label={row.original.assignmentLabel}
            className="h-auto max-w-full whitespace-normal break-words text-left"
          />
        ),
      },
      {
        id: "followUp",
        meta: {
          label: "Follow-up",
          mobile: "expansion",
          cellClassName: "max-w-[16rem] whitespace-normal",
        },
        header: "Follow-up",
        enableSorting: false,
        cell: ({ row }) => {
          const followUps = visibleFollowUps(row.original);
          if (!followUps.length) {
            return <Badge variant="secondary">ready to plan</Badge>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {followUps.map((followUp) =>
                isSizeFollowUp(followUp) ? (
                  <EditSizeButton
                    key={followUp}
                    unit={row.original}
                    onEditSize={handleEditSize}
                    className="no-underline"
                  >
                    <Badge variant="outline">{followUp}</Badge>
                  </EditSizeButton>
                ) : (
                  <Badge key={followUp} variant="outline">
                    {followUp}
                  </Badge>
                ),
              )}
            </div>
          );
        },
      },
    ],
    [householdId, moveId, photosByUnit, handleEditSize],
  );

  return (
    <div className="min-w-0 space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search units by name, code, room…"
          className="pl-8"
          aria-label="Search movable units"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Truck className="size-4 text-primary" aria-hidden="true" />
          Movable units
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{summary.total} units</Badge>
          <StatChip
            label={`${summary.boxes} boxes`}
            active={statFilter === "boxes"}
            onClick={() => toggleStatFilter("boxes")}
          />
          <StatChip
            label={`${summary.looseItems} loose`}
            active={statFilter === "loose"}
            onClick={() => toggleStatFilter("loose")}
          />
          <StatChip
            label={`${summary.unassigned} unassigned`}
            active={statFilter === "unassigned"}
            tone={summary.unassigned ? "destructive" : "default"}
            onClick={() => toggleStatFilter("unassigned")}
          />
          {summary.missingWeight ? (
            <StatChip
              label={`${summary.missingWeight} missing weight`}
              active={statFilter === "missingWeight"}
              onClick={() => toggleStatFilter("missingWeight")}
            />
          ) : null}
          {statFilter ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setStatFilter(null)}
            >
              Clear filter
            </Button>
          ) : null}
          <SortMenu
            value={sortField}
            onChange={(field) => {
              setSortField(field);
              // Clear any column-header sort so the chosen preset is what shows.
              setSorting([]);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAddUnitOpen(true)}
            disabled={!moveId}
          >
            <PackagePlus aria-hidden="true" />
            Add unit
          </Button>
          <Button asChild size="sm">
            <Link href={captureHref}>
              <PackagePlus aria-hidden="true" />
              Add to Queue
            </Link>
          </Button>
        </div>
      </div>

      {message ? (
        <p
          className={
            messageTone === "error"
              ? "rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground"
              : "rounded-md border border-border p-3 text-sm text-muted-foreground"
          }
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}

      <DataTable
        data={visibleUnits}
        columns={columns}
        getRowId={(unit) => unit.id}
        onRowOpen={handleRowOpen}
        getRowOpenLabel={(unit) =>
          unit.kind === "box"
            ? `Open ${unit.label} contents`
            : `Open ${unit.name} details`
        }
        ariaLabel="Movable units"
        enableRowSelection
        loading={loading}
        pageSize={25}
        sorting={sorting}
        onSortingChange={setSorting}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        renderMobileCard={({ row, selected, onSelectedChange, onOpen }) => (
          <MovableUnitCard
            unit={row}
            selected={selected}
            onSelectedChange={onSelectedChange}
            onOpen={onOpen}
            onEditSize={handleEditSize}
            householdId={householdId}
            moveId={moveId}
            photoIds={photosByUnit.get(row.id) ?? []}
          />
        )}
        batchActions={({ selectedRows, clearSelection }) => (
          <MovableUnitBatchActions
            selectedRows={selectedRows}
            clearSelection={clearSelection}
            resourcesWithZones={resourcesWithZones ?? []}
            tripsWithSpaces={tripsWithSpaces ?? []}
            onBatchAction={handleBatchAction}
            showOverrideReason={previewNeedsReason}
          />
        )}
        emptyState={
          <EmptyState
            title="No movable units yet"
            description="Boxes and large loose items appear here once they exist for this move. Capture a few from a photo or paste to get started."
            action={
              <Button asChild size="sm">
                <Link href={captureHref}>
                  <PackagePlus aria-hidden="true" />
                  Add to Queue
                </Link>
              </Button>
            }
          />
        }
      />

      <AddMovableUnitDialog
        householdId={householdId}
        moveId={moveId}
        open={addUnitOpen}
        onOpenChange={setAddUnitOpen}
      />

      <ItemDetailSheet
        key={selectedLooseItem?._id ?? "no-loose-item"}
        householdId={householdId}
        moveId={moveId}
        item={selectedLooseItem}
        origin="movable-units"
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onSave={async (patch) => {
          if (!householdId || !moveId || !selectedLooseItem) return;
          await updateItem({
            householdId,
            moveId,
            itemId: selectedLooseItem._id,
            ...patch,
          });
          setMessage("Item details saved.");
        }}
      />
    </div>
  );
}

function MovableUnitBatchActions({
  selectedRows,
  clearSelection,
  resourcesWithZones,
  tripsWithSpaces,
  onBatchAction,
  showOverrideReason,
}: {
  selectedRows: MovableUnit[];
  clearSelection: () => void;
  resourcesWithZones: ResourcesWithZones;
  tripsWithSpaces: TripsWithSpaces;
  onBatchAction: OnBatchAction<MovableUnit, MovableUnitBatchAction>;
  // Revealed by the parent once a dry-run preview reports soft warnings, so the
  // override-reason input only appears when the target actually needs one.
  showOverrideReason: boolean;
}) {
  const [resourceId, setResourceId] = useState("");
  const [tripId, setTripId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [tripSpaceId, setTripSpaceId] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [includeLocked, setIncludeLocked] = useState(false);

  const zones = resourceId
    ? (resourcesWithZones.find(
        ({ resource }) => String(resource._id) === resourceId,
      )?.zones ?? [])
    : [];
  // Trips for the chosen method; a trip implies its resource, so picking a trip
  // narrows the space list and (server-side) derives the resource.
  const trips = resourceId
    ? tripsWithSpaces.filter(
        (trip) => String(trip.resourceId) === resourceId,
      )
    : tripsWithSpaces;
  const spaces = tripId
    ? (tripsWithSpaces.find((trip) => String(trip._id) === tripId)?.spaces ??
      [])
    : [];

  const lockedCount = selectedRows.filter(
    (unit) => unit.assignmentLocked,
  ).length;
  // The server can derive the resource from a trip, so either a method or a
  // trip is enough to assign.
  const canAssign = Boolean(resourceId || tripId);

  const buildAssignAction = (
    dryRun: boolean,
  ): MovableUnitBatchAction => ({
    type: "assign",
    resourceId: resourceId || undefined,
    tripId: tripId || undefined,
    zoneId: zoneId || undefined,
    tripSpaceId: tripSpaceId || undefined,
    overrideReason: overrideReason.trim() || undefined,
    includeLocked,
    dryRun,
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="sm">
          <Truck aria-hidden="true" />
          Assign load
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3">
        <div>
          <p className="text-sm font-medium">Assign selected units</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {selectedRows.length} selected
            {lockedCount && !includeLocked
              ? `, ${lockedCount} locked will be skipped`
              : ""}
          </p>
        </div>

        <Select
          value={resourceId}
          onValueChange={(value) => {
            setResourceId(value);
            setTripId("");
            setZoneId("");
            setTripSpaceId("");
          }}
        >
          <SelectTrigger size="sm" className="w-full" aria-label="Transport method">
            <SelectValue placeholder="Choose transport method" />
          </SelectTrigger>
          <SelectContent>
            {resourcesWithZones.map(({ resource }) => (
              <SelectItem key={resource._id} value={String(resource._id)}>
                {resource.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={tripId}
          onValueChange={(value) => {
            setTripId(value);
            setTripSpaceId("");
          }}
          disabled={trips.length === 0}
        >
          <SelectTrigger size="sm" className="w-full" aria-label="Trip">
            <SelectValue placeholder="Any trip" />
          </SelectTrigger>
          <SelectContent>
            {trips.map((trip) => (
              <SelectItem key={trip._id} value={String(trip._id)}>
                {trip.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={zoneId}
          onValueChange={setZoneId}
          disabled={!resourceId || zones.length === 0}
        >
          <SelectTrigger size="sm" className="w-full" aria-label="Zone">
            <SelectValue placeholder="Any zone" />
          </SelectTrigger>
          <SelectContent>
            {zones.map((zone) => (
              <SelectItem key={zone._id} value={String(zone._id)}>
                {zone.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={tripSpaceId}
          onValueChange={setTripSpaceId}
          disabled={!tripId || spaces.length === 0}
        >
          <SelectTrigger size="sm" className="w-full" aria-label="Trip space">
            <SelectValue placeholder="Any space" />
          </SelectTrigger>
          <SelectContent>
            {spaces.map((space) => (
              <SelectItem key={space._id} value={String(space._id)}>
                {space.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showOverrideReason ? (
          <div className="space-y-1">
            <label
              htmlFor="movable-unit-override-reason"
              className="text-xs font-medium text-foreground"
            >
              Override reason (target reported warnings)
            </label>
            <Input
              id="movable-unit-override-reason"
              value={overrideReason}
              placeholder="Why assign despite the warning?"
              className="h-8 text-sm"
              onChange={(event) => setOverrideReason(event.target.value)}
            />
          </div>
        ) : null}

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={includeLocked}
            aria-label="Include locked units"
            onCheckedChange={(checked) => setIncludeLocked(checked === true)}
          />
          Include locked units
        </label>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canAssign}
            onClick={() =>
              void onBatchAction({
                action: buildAssignAction(true),
                rows: selectedRows,
                clearSelection,
              })
            }
          >
            Preview
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canAssign}
            onClick={() =>
              void onBatchAction({
                action: buildAssignAction(false),
                rows: selectedRows,
                clearSelection,
              })
            }
          >
            Assign
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="col-span-2"
            onClick={() =>
              void onBatchAction({
                action: { type: "unassign", includeLocked, dryRun: false },
                rows: selectedRows,
                clearSelection,
              })
            }
          >
            Unassign
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Preview runs validation without saving. Targets over capacity require
          an override reason before they can be assigned.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function UnitThumbnail({
  householdId,
  moveId,
  photoIds = [],
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  photoIds?: readonly Id<"itemPhotos">[];
}) {
  const coverPhotoId = photoIds[0];
  const getDisplayUrl = useAction(api.photos.getDisplayUrl);
  const [url, setUrl] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!householdId || !moveId || !coverPhotoId) {
      return;
    }
    let cancelled = false;
    void getDisplayUrl({ householdId, moveId, photoId: coverPhotoId, variant: "card" })
      .then((display) => {
        if (!cancelled) setUrl(display.url);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [getDisplayUrl, householdId, moveId, coverPhotoId]);

  return (
    <>
      <button
        type="button"
        disabled={!coverPhotoId}
        aria-label={coverPhotoId ? "View photos" : "No photos"}
        // stopPropagation so opening the lightbox never also triggers row-open.
        onClick={(event) => {
          event.stopPropagation();
          setLightboxOpen(true);
        }}
        className="size-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted disabled:cursor-default"
      >
        {coverPhotoId && url ? (
          // B2/edge delivery URLs are short-lived and provider-controlled, so
          // Next image optimization is intentionally bypassed.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-4" aria-hidden="true" />
          </div>
        )}
      </button>
      {coverPhotoId ? (
        <PhotoLightbox
          householdId={householdId}
          moveId={moveId}
          photoIds={photoIds}
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
        />
      ) : null}
    </>
  );
}

function MovableUnitCard({
  unit,
  selected,
  onSelectedChange,
  onOpen,
  onEditSize,
  householdId,
  moveId,
  photoIds,
}: {
  unit: MovableUnit;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
  onOpen?: () => void;
  onEditSize: (unit: MovableUnit) => void;
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  photoIds?: readonly Id<"itemPhotos">[];
}) {
  const followUps = visibleFollowUps(unit);

  // The whole card opens detail (box → its page, loose item → the sheet). Taps
  // that land on the checkbox / a button / link are ignored by the shared guard
  // so they don't double-fire.
  function handleCardClick(event: ReactMouseEvent) {
    if (!onOpen || isRowOpenIgnoredTarget(event.target)) return;
    onOpen();
  }
  function handleCardKeyDown(event: ReactKeyboardEvent) {
    if (!onOpen) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    if (isRowOpenIgnoredTarget(event.target)) return;
    event.preventDefault();
    onOpen();
  }

  return (
    <div
      role={onOpen ? "button" : "listitem"}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `Open ${unit.name}` : undefined}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      className={cn(
        "rounded-md border border-border bg-background/75 p-3",
        onOpen &&
          "cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <UnitThumbnail
          householdId={householdId}
          moveId={moveId}
          photoIds={photoIds}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={unit.kind === "box" ? "outline" : "secondary"}>
              {unit.label}
            </Badge>
            <Badge variant="outline">{unit.status}</Badge>
          </div>
          {/* The name is the row's identity — let it wrap instead of truncating. */}
          <p className="mt-1 text-sm font-medium leading-snug">{unit.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {unit.roomLabel} to {unit.destinationLabel}
          </p>
        </div>
        {/* Big, comfortable selection target. */}
        <label
          className="-m-1 flex min-h-11 min-w-11 items-center justify-center p-1"
          aria-label={`Select ${unit.name}`}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onSelectedChange(checked === true)}
          />
        </label>
      </div>

      {/* One bordered container with dividers instead of three nested boxes. */}
      <div className="mt-3 grid grid-cols-2 divide-x divide-y divide-border rounded-md border border-border bg-muted/20 text-xs sm:grid-cols-3 sm:divide-y-0">
        <div className="p-2">
          <p className="text-muted-foreground">Weight</p>
          <p className="mt-0.5 font-medium">{unit.weightLabel}</p>
          {unit.densityLbPerCuFt === undefined ? null : (
            <p className="text-muted-foreground">{unit.densityLabel}</p>
          )}
        </div>
        <div className="p-2">
          <p className="text-muted-foreground">Size</p>
          <p className="mt-0.5 font-medium">{unit.dimensionsLabel}</p>
          <p className="text-muted-foreground">{unit.volumeLabel}</p>
        </div>
        <div className="col-span-2 p-2 sm:col-span-1">
          <p className="text-muted-foreground">Load</p>
          <div className="mt-0.5">
            <AssignmentBadge
              state={unit.assignmentState}
              label={unit.assignmentLabel}
              className="h-auto max-w-full whitespace-normal break-words text-left"
            />
          </div>
        </div>
      </div>

      {followUps.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {followUps.map((followUp) =>
            isSizeFollowUp(followUp) ? (
              <EditSizeButton
                key={followUp}
                unit={unit}
                onEditSize={onEditSize}
                className="no-underline"
              >
                <Badge variant="outline">{followUp}</Badge>
              </EditSizeButton>
            ) : (
              <Badge key={followUp} variant="outline">
                {followUp}
              </Badge>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function visibleFollowUps(unit: MovableUnit, limit = 3) {
  return unit.followUps.slice(0, limit);
}

// Follow-up chips that should deep-link to the weight & size editor (MOVE-343).
function isSizeFollowUp(followUp: string): boolean {
  return (
    followUp === "add weight" ||
    followUp === "add dimensions" ||
    followUp === "add volume"
  );
}

// --- clickable stat filters (MOVE-348) ----------------------------------

type StatFilter =
  | null
  | "boxes"
  | "loose"
  | "unassigned"
  | "missingWeight";

// Project a MovableUnit onto the shared sort shape (kind "looseItem" maps to the
// comparator's "item"; label is the box/item code).
function unitToSortable(unit: MovableUnit): SortableEntry {
  return {
    kind: unit.kind === "box" ? "box" : "item",
    createdAt: unit.createdAt,
    name: unit.name,
    code: unit.label,
    weightLb: unit.estimatedWeightLb,
    volumeCuFt: unit.estimatedVolumeCuFt,
  };
}

function matchesStatFilter(
  filter: Exclude<StatFilter, null>,
): (unit: MovableUnit) => boolean {
  switch (filter) {
    case "boxes":
      return (unit) => unit.kind === "box";
    case "loose":
      return (unit) => unit.kind === "looseItem";
    case "unassigned":
      return (unit) => unit.assignmentState === "unassigned";
    case "missingWeight":
      return (unit) => unit.missingFields.includes("weight");
  }
}

// Wraps a "missing weight/size" indicator so clicking it jumps to the editor
// (MOVE-343). stopPropagation keeps it from also triggering the row-open.
function EditSizeButton({
  unit,
  onEditSize,
  children,
  className,
}: {
  unit: MovableUnit;
  onEditSize: (unit: MovableUnit) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label="Add weight or size"
      onClick={(event) => {
        event.stopPropagation();
        onEditSize(unit);
      }}
      className={cn(
        "text-left underline decoration-dotted underline-offset-2 transition-colors hover:decoration-solid hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

// A stat chip that doubles as a filter toggle — pressed = primary fill.
function StatChip({
  label,
  active,
  tone = "default",
  onClick,
}: {
  label: string;
  active: boolean;
  tone?: "default" | "destructive";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center rounded-md border px-2 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : tone === "destructive"
            ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
            : "border-border bg-background text-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

function unitWord(count: number) {
  return count === 1 ? "unit" : "units";
}

// Roll the unified per-row results from movableUnits.batchAssign into one
// human-readable status line: counts, the unique soft warnings / hard blocks
// the server returned, and the locked rows skipped client-side.
function summarizeBatchResult(
  result: BatchAssignResult,
  {
    verb,
    dryRun,
    skippedLockedCount,
  }: { verb: "assign" | "unassign"; dryRun: boolean; skippedLockedCount: number },
) {
  const prefix = dryRun ? "Preview: " : "";
  const succeededVerb =
    verb === "assign"
      ? dryRun
        ? "will assign"
        : "assigned"
      : dryRun
        ? "will unassign"
        : "unassigned";

  const parts: string[] = [
    `${result.succeeded} ${unitWord(result.succeeded)} ${succeededVerb}`,
  ];
  if (result.failed > 0) {
    parts.push(`${result.failed} blocked`);
  }
  if (skippedLockedCount > 0) {
    parts.push(
      `${skippedLockedCount} locked ${unitWord(skippedLockedCount)} skipped`,
    );
  }

  const warnings = uniqueStrings(
    result.results.flatMap((row) => row.assignmentWarnings ?? []),
  );
  const hardBlocks = uniqueStrings(
    result.results.flatMap((row) => row.assignmentHardBlocks ?? []),
  );
  const errors = uniqueStrings(
    result.results
      .filter((row) => !row.ok && row.error)
      .map((row) => row.error as string),
  );

  let summary = `${prefix}${parts.join(", ")}.`;
  if (warnings.length) {
    summary += ` Warnings: ${warnings.join("; ")}.`;
  }
  if (hardBlocks.length) {
    summary += ` Hard blocks: ${hardBlocks.join("; ")}.`;
  }
  if (errors.length) {
    summary += ` ${errors.join("; ")}`;
  }
  return summary;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
