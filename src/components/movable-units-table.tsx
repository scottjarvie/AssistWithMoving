"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { PackageOpen, Truck } from "lucide-react";

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
import { buildBoxLookupPath } from "@/lib/box-labels";
import {
  buildMovableUnits,
  type MovableUnit,
} from "@/lib/movable-units";

type ResourcesWithZones = NonNullable<
  ReturnType<
    typeof useQuery<typeof api.transportResources.listForMoveWithZones>
  >
>;

/**
 * Movable-unit batch assignment, shaped so a future server batch mutation can
 * replace the client-side fan-out without changing callers.
 */
type MovableUnitBatchAction =
  | {
      type: "assign";
      resourceId: string;
      zoneId?: string;
      overrideReason?: string;
      includeLocked: boolean;
    }
  | { type: "unassign"; includeLocked: boolean };

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
  const updateBox = useMutation(api.boxes.update);
  const updateItem = useMutation(api.items.update);

  const [message, setMessage] = useState<string | null>(null);
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

  const loading =
    boxes === undefined ||
    items === undefined ||
    resourcesWithZones === undefined;

  // Mirrors load-planner-board.tsx assignMovableUnits: branch box -> boxes.update
  // and looseItem -> items.update, honoring assignmentLocked + overrideReason.
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
        setMessage(
          skippedLockedCount
            ? `${skippedLockedCount} locked ${unitWord(skippedLockedCount)} skipped. Unlock first or include locked units deliberately.`
            : "No selected movable units are available for assignment.",
        );
        return;
      }

      const assignmentPatch =
        action.type === "assign"
          ? {
              assignedResourceId:
                action.resourceId as Id<"transportResources">,
              ...(action.zoneId
                ? { assignedZoneId: action.zoneId as Id<"transportZones"> }
                : { clearAssignedZone: true }),
              assignmentOverrideReason: action.overrideReason,
            }
          : { clearAssignedResource: true };

      setMessage(null);
      try {
        await Promise.all(
          assignableUnits.map((unit) =>
            unit.kind === "box"
              ? updateBox({
                  householdId,
                  moveId,
                  boxId: unit.recordId as Id<"boxes">,
                  ...assignmentPatch,
                })
              : updateItem({
                  householdId,
                  moveId,
                  itemId: unit.recordId as Id<"items">,
                  ...assignmentPatch,
                }),
          ),
        );
        clearSelection();
        setMessage(
          `${assignableUnits.length} movable ${unitWord(
            assignableUnits.length,
          )} ${action.type === "assign" ? "assigned" : "unassigned"}${
            skippedLockedCount
              ? `; ${skippedLockedCount} locked ${unitWord(skippedLockedCount)} skipped`
              : ""
          }.`,
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not update the selected movable-unit assignments.",
        );
      }
    },
    [householdId, moveId, updateBox, updateItem],
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
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{units.length} units</Badge>
          <Badge variant="outline">
            {units.filter((unit) => unit.kind === "box").length} boxes
          </Badge>
          <Badge variant="outline">
            {units.filter((unit) => unit.kind === "looseItem").length} loose
          </Badge>
        </div>
      </div>

      {message ? (
        <p
          className="rounded-md border border-border p-3 text-sm text-muted-foreground"
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
            onBatchAction={handleBatchAction}
          />
        )}
        emptyState={
          <EmptyState
            title="No movable units yet"
            description="Boxes and large loose items appear here once they exist for this move."
          />
        }
      />
    </div>
  );
}

function MovableUnitBatchActions({
  selectedRows,
  clearSelection,
  resourcesWithZones,
  onBatchAction,
}: {
  selectedRows: MovableUnit[];
  clearSelection: () => void;
  resourcesWithZones: ResourcesWithZones;
  onBatchAction: OnBatchAction<MovableUnit, MovableUnitBatchAction>;
}) {
  const [resourceId, setResourceId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [includeLocked, setIncludeLocked] = useState(false);

  const zones = resourceId
    ? (resourcesWithZones.find(
        ({ resource }) => String(resource._id) === resourceId,
      )?.zones ?? [])
    : [];
  const lockedCount = selectedRows.filter(
    (unit) => unit.assignmentLocked,
  ).length;

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
            setZoneId("");
          }}
        >
          <SelectTrigger size="sm" className="w-full" aria-label="Resource">
            <SelectValue placeholder="Choose resource" />
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
            disabled={!resourceId}
            onClick={() =>
              void onBatchAction({
                action: {
                  type: "assign",
                  resourceId,
                  zoneId: zoneId || undefined,
                  includeLocked,
                },
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
            onClick={() =>
              void onBatchAction({
                action: { type: "unassign", includeLocked },
                rows: selectedRows,
                clearSelection,
              })
            }
          >
            Unassign
          </Button>
        </div>
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
