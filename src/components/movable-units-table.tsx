"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { PackageOpen, PackagePlus, Truck } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  type OnBatchAction,
} from "@/components/ui/data-table";
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
import { AssignmentBadge } from "@/components/ui/status-badges";
import { ItemDetailSheet } from "@/components/item-detail-sheet";
import { buildBoxLookupPath } from "@/lib/box-labels";
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
  const batchAssign = useMutation(api.movableUnits.batchAssign);
  const updateItem = useMutation(api.items.update);
  const router = useRouter();

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
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

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
            returnTo: "load-plan",
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

  const loading =
    boxes === undefined ||
    items === undefined ||
    resourcesWithZones === undefined ||
    tripsWithSpaces === undefined;

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
                  returnTo: "load-plan",
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
        cell: ({ row }) => (
          <span
            className={
              row.original.missingFields.includes("weight")
                ? "text-muted-foreground"
                : "font-medium"
            }
          >
            {row.original.weightLabel}
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
            <p>{row.original.dimensionsLabel}</p>
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
              {followUps.map((followUp) => (
                <Badge key={followUp} variant="outline">
                  {followUp}
                </Badge>
              ))}
            </div>
          );
        },
      },
    ],
    [householdId, moveId],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Truck className="size-4 text-primary" aria-hidden="true" />
          Movable units
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{summary.total} units</Badge>
          <Badge variant="outline">{summary.boxes} boxes</Badge>
          <Badge variant="outline">{summary.looseItems} loose</Badge>
          <Badge variant={summary.unassigned ? "destructive" : "outline"}>
            {summary.unassigned} unassigned
          </Badge>
          {summary.missingWeight ? (
            <Badge variant="outline">
              {summary.missingWeight} missing weight
            </Badge>
          ) : null}
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
        data={units}
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
        renderMobileCard={({ row, selected, onSelectedChange }) => (
          <MovableUnitCard
            unit={row}
            selected={selected}
            onSelectedChange={onSelectedChange}
            householdId={householdId}
            moveId={moveId}
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

      <ItemDetailSheet
        key={selectedLooseItem?._id ?? "no-loose-item"}
        householdId={householdId}
        moveId={moveId}
        item={selectedLooseItem}
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

function MovableUnitCard({
  unit,
  selected,
  onSelectedChange,
  householdId,
  moveId,
}: {
  unit: MovableUnit;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const followUps = visibleFollowUps(unit);
  const openBoxHref =
    unit.kind === "box" && householdId && moveId
      ? buildBoxLookupPath({
          boxId: unit.recordId as Id<"boxes">,
          householdId,
          moveId,
          returnTo: "load-plan",
        })
      : null;

  return (
    <div
      role="listitem"
      className="rounded-md border border-border bg-background/75 p-3"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={selected}
            aria-label={`Select ${unit.name}`}
            onCheckedChange={(checked) => onSelectedChange(checked === true)}
          />
          Select
        </label>
        {openBoxHref ? (
          <Button asChild size="sm" variant="outline">
            <Link href={openBoxHref} aria-label={`Open ${unit.label}`}>
              <PackageOpen aria-hidden="true" />
              Open box
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="mt-2 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={unit.kind === "box" ? "outline" : "secondary"}>
            {unit.label}
          </Badge>
          <Badge variant="outline">{unit.status}</Badge>
        </div>
        <p className="mt-1 truncate text-sm font-medium">{unit.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {unit.roomLabel} to {unit.destinationLabel}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md border border-border bg-muted/20 p-2">
          <p className="text-muted-foreground">Weight</p>
          <p className="mt-1 font-medium">{unit.weightLabel}</p>
        </div>
        <div className="rounded-md border border-border bg-muted/20 p-2">
          <p className="text-muted-foreground">Size</p>
          <p className="mt-1 font-medium">{unit.dimensionsLabel}</p>
          <p className="mt-1 text-muted-foreground">{unit.volumeLabel}</p>
        </div>
        <div className="rounded-md border border-border bg-muted/20 p-2">
          <p className="text-muted-foreground">Load</p>
          <div className="mt-1">
            <AssignmentBadge
              state={unit.assignmentState}
              label={unit.assignmentLabel}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {followUps.length ? (
          followUps.map((followUp) => (
            <Badge key={followUp} variant="outline">
              {followUp}
            </Badge>
          ))
        ) : (
          <Badge variant="secondary">ready to plan</Badge>
        )}
      </div>
    </div>
  );
}

function visibleFollowUps(unit: MovableUnit, limit = 3) {
  return unit.followUps.slice(0, limit);
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
