"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Boxes,
  CheckSquare,
  PackageOpen,
  Search,
  Truck,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  formatBoxWeightSource,
  formatBoxWeightValue,
  isMissingBoxWeight,
} from "@/lib/box-weight";
import { buildLoadPlanPacketPath } from "@/lib/load-plan-packet";
import { cn } from "@/lib/utils";

type BoxRecord = NonNullable<
  ReturnType<typeof useQuery<typeof api.boxes.listForMove>>
>[number];
type EstimateReport = NonNullable<
  ReturnType<typeof useQuery<typeof api.estimates.reportForMove>>
>;
type BoxReport = EstimateReport["boxReports"][number];
type PlannerFilter =
  | "all"
  | "unassigned"
  | "warnings"
  | "fragile"
  | "highValue"
  | "firstNight"
  | "notPacked";

const plannerFilters: { key: PlannerFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unassigned", label: "Unassigned" },
  { key: "warnings", label: "Warnings" },
  { key: "fragile", label: "Fragile" },
  { key: "highValue", label: "High value" },
  { key: "firstNight", label: "First night" },
  { key: "notPacked", label: "Not packed" },
];

export function LoadPlannerBoard({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const boxes = useQuery(
    api.boxes.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  );
  const items = useQuery(
    api.items.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  );
  const resourcesWithZones = useQuery(
    api.transportResources.listForMoveWithZones,
    householdId && moveId ? { householdId, moveId } : "skip"
  );
  const report = useQuery(
    api.estimates.reportForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  );
  const updateBox = useMutation(api.boxes.update);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PlannerFilter>("all");
  const [selectedBoxIds, setSelectedBoxIds] = useState<Id<"boxes">[]>([]);
  const [targetResourceId, setTargetResourceId] = useState("");
  const [targetZoneId, setTargetZoneId] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const reportByBoxId = useMemo(
    () =>
      new Map(
        report?.boxReports.map((boxReport) => [boxReport.boxId, boxReport]) ?? []
      ),
    [report]
  );
  const reportByResourceId = useMemo(
    () =>
      new Map(
        report?.resourceReports.map((resourceReport) => [
          resourceReport.resourceId,
          resourceReport,
        ]) ?? []
      ),
    [report]
  );
  const zoneOptions = useMemo(
    () =>
      resourcesWithZones?.find(
        ({ resource }) => resource._id === targetResourceId
      )?.zones ?? [],
    [resourcesWithZones, targetResourceId]
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
  const allUnboxedItems = useMemo(
    () =>
      (items ?? [])
        .filter((item) => item.status !== "archived" && !boxedItemIds.has(item._id)),
    [boxedItemIds, items]
  );
  const unboxedItems = allUnboxedItems.slice(0, 12);

  const filteredBoxes = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return (boxes ?? []).filter((record) => {
      if (!matchesPlannerFilter(record, reportByBoxId.get(record.box._id), filter)) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        record.box.code,
        record.box.label,
        record.box.room,
        record.box.destinationRoom,
        ...record.contents
          .map((entry) => entry?.item.name)
          .filter((value): value is string => typeof value === "string"),
      ];
      return haystack.some((value) =>
        value?.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [boxes, filter, reportByBoxId, search]);

  const selectedTargetZones = targetResourceId ? zoneOptions : [];
  const visibleSelectedCount = selectedBoxIds.filter((boxId) =>
    filteredBoxes.some((record) => record.box._id === boxId)
  ).length;
  async function assignBoxes(
    boxIds: Id<"boxes">[],
    resourceId: Id<"transportResources"> | null,
    zoneId?: Id<"transportZones">
  ) {
    if (!householdId || !moveId || !boxIds.length) {
      return;
    }

    setAssigning(true);
    setMessage(null);
    try {
      await Promise.all(
        boxIds.map((boxId) =>
          updateBox({
            householdId,
            moveId,
            boxId,
            ...(resourceId
              ? { assignedResourceId: resourceId }
              : { clearAssignedResource: true }),
            ...(zoneId ? { assignedZoneId: zoneId } : { clearAssignedZone: true }),
            assignmentOverrideReason: overrideReason,
          })
        )
      );
      setSelectedBoxIds((current) =>
        current.filter((boxId) => !boxIds.includes(boxId))
      );
      setMessage(
        resourceId
          ? `${boxIds.length} box assignment updated.`
          : `${boxIds.length} box assignment cleared.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update the selected assignments."
      );
    } finally {
      setAssigning(false);
    }
  }

  function toggleBox(boxId: Id<"boxes">) {
    setSelectedBoxIds((current) =>
      current.includes(boxId)
        ? current.filter((id) => id !== boxId)
        : [...current, boxId]
    );
  }

  function selectVisibleBoxes() {
    setSelectedBoxIds(
      filteredBoxes.slice(0, 100).map((record) => record.box._id)
    );
  }

  const loading =
    boxes === undefined ||
    resourcesWithZones === undefined ||
    report === undefined ||
    items === undefined;

  return (
    <Card id="load-plan">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Truck className="size-4 text-primary" aria-hidden="true" />
              Load planner
            </CardTitle>
            <CardDescription>
              Assign boxes to resources and zones while capacity and restriction
              warnings stay visible.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{boxes?.length ?? 0} boxes</Badge>
            <Badge variant="outline">{allUnboxedItems.length} unpacked queue</Badge>
            {householdId && moveId ? (
              <>
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={buildLoadPlanPacketPath({
                      householdId,
                      moveId,
                      mode: "crew",
                    })}
                  >
                    Crew packet
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={buildLoadPlanPacketPath({
                      householdId,
                      moveId,
                      mode: "owner",
                    })}
                  >
                    Owner packet
                  </Link>
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  className="pl-8"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search box codes, rooms, labels, or contents"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={selectVisibleBoxes}
                disabled={!filteredBoxes.length}
              >
                <CheckSquare aria-hidden="true" />
                Select visible
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {plannerFilters.map((option) => (
                <Button
                  key={option.key}
                  type="button"
                  size="sm"
                  variant={filter === option.key ? "default" : "outline"}
                  onClick={() => setFilter(option.key)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Bulk assignment</p>
                <p className="text-xs text-muted-foreground">
                  {visibleSelectedCount} selected in the current view
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!selectedBoxIds.length || assigning}
                onClick={() => setSelectedBoxIds([])}
              >
                Clear
              </Button>
            </div>
            <div className="mt-3 grid gap-2">
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={targetResourceId}
                aria-label="Bulk assignment resource"
                onChange={(event) => {
                  setTargetResourceId(event.target.value);
                  setTargetZoneId("");
                }}
              >
                <option value="">Choose resource</option>
                {resourcesWithZones?.map(({ resource }) => (
                  <option key={resource._id} value={resource._id}>
                    {resource.name}
                  </option>
                ))}
              </select>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={targetZoneId}
                aria-label="Bulk assignment zone"
                disabled={!targetResourceId}
                onChange={(event) => setTargetZoneId(event.target.value)}
              >
                <option value="">Any zone</option>
                {selectedTargetZones.map((zone) => (
                  <option key={zone._id} value={zone._id}>
                    {zone.name}
                  </option>
                ))}
              </select>
              <Textarea
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                placeholder="Override reason when warnings are expected"
                aria-label="Assignment override reason"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!selectedBoxIds.length || !targetResourceId || assigning}
                  onClick={() =>
                    void assignBoxes(
                      selectedBoxIds,
                      targetResourceId as Id<"transportResources">,
                      targetZoneId
                        ? (targetZoneId as Id<"transportZones">)
                        : undefined
                    )
                  }
                >
                  Assign
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!selectedBoxIds.length || assigning}
                  onClick={() => void assignBoxes(selectedBoxIds, null)}
                >
                  Unassign
                </Button>
              </div>
            </div>
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

        {loading ? (
          <div className="grid gap-3 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-64 rounded-md" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-[320px_repeat(2,minmax(0,1fr))] 2xl:grid-cols-[320px_repeat(3,minmax(0,1fr))]">
            <AssignmentPanel
              title="Unassigned"
              subtitle="Needs a resource before load day"
              boxes={filteredBoxes.filter(
                (record) => !record.box.assignedResourceId
              )}
              selectedBoxIds={selectedBoxIds}
              reportByBoxId={reportByBoxId}
              onToggleBox={toggleBox}
              onDropBox={(boxId) => void assignBoxes([boxId], null)}
            />
            {resourcesWithZones?.map(({ resource, zones }) => (
              <ResourcePanel
                key={resource._id}
                resource={resource}
                zones={zones}
                boxes={filteredBoxes.filter(
                  (record) => record.box.assignedResourceId === resource._id
                )}
                selectedBoxIds={selectedBoxIds}
                reportByBoxId={reportByBoxId}
                resourceReport={reportByResourceId.get(resource._id)}
                onToggleBox={toggleBox}
                onAssign={(boxIds, zoneId) =>
                  void assignBoxes(boxIds, resource._id, zoneId)
                }
              />
            ))}
          </div>
        )}

        <div className="rounded-md border border-border p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Unboxed item queue</p>
              <p className="mt-1 text-xs text-muted-foreground">
                These items still need a box or container before the load plan
                can assign them cleanly.
              </p>
            </div>
            <PackageOpen className="size-4 text-primary" aria-hidden="true" />
          </div>
          {unboxedItems.length ? (
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {unboxedItems.map((item) => (
                <div
                  key={item._id}
                  className="rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div className="font-medium">{item.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="outline">{item.room ?? "room unset"}</Badge>
                    <Badge variant="outline">{item.status}</Badge>
                    {item.highValue ? (
                      <Badge variant="secondary">high value</Badge>
                    ) : null}
                    {item.requiresPersonalTransport ? (
                      <Badge variant="secondary">personal</Badge>
                    ) : null}
                    {item.planningDefaultKeys.includes("firstNight") ? (
                      <Badge variant="secondary">first night</Badge>
                    ) : null}
                  </div>
                </div>
              ))}
              {allUnboxedItems.length > unboxedItems.length ? (
                <div className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                  {allUnboxedItems.length - unboxedItems.length} more unboxed
                  items hidden by the queue limit.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No active unboxed items in the current move.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ResourcePanel({
  resource,
  zones,
  boxes,
  selectedBoxIds,
  reportByBoxId,
  resourceReport,
  onToggleBox,
  onAssign,
}: {
  resource: Doc<"transportResources">;
  zones: Doc<"transportZones">[];
  boxes: BoxRecord[];
  selectedBoxIds: Id<"boxes">[];
  reportByBoxId: Map<Id<"boxes">, BoxReport>;
  resourceReport?: EstimateReport["resourceReports"][number];
  onToggleBox: (boxId: Id<"boxes">) => void;
  onAssign: (boxIds: Id<"boxes">[], zoneId?: Id<"transportZones">) => void;
}) {
  return (
    <div className="rounded-md border border-border">
      <div className="border-b border-border p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{resource.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{resource.type}</p>
          </div>
          <Badge variant="outline">{boxes.length} boxes</Badge>
        </div>
        <div className="mt-3 grid gap-2 text-xs">
          <CapacityLine
            label="Weight"
            value={resourceReport?.estimatedWeightLb ?? 0}
            max={resourceReport?.maxWeightLb}
            percent={resourceReport?.weightPercent}
            unit="lb"
          />
          <CapacityLine
            label="Volume"
            value={resourceReport?.estimatedVolumeCuFt ?? 0}
            max={resourceReport?.maxVolumeCuFt}
            percent={resourceReport?.volumePercent}
            unit="cu ft"
          />
        </div>
      </div>
      <DropSection
        title="Any zone"
        boxes={boxes.filter((record) => !record.box.assignedZoneId)}
        selectedBoxIds={selectedBoxIds}
        reportByBoxId={reportByBoxId}
        onToggleBox={onToggleBox}
        onDropBox={(boxId) => onAssign([boxId])}
      />
      {zones.map((zone) => (
        <DropSection
          key={zone._id}
          title={zone.name}
          subtitle={zone.description}
          boxes={boxes.filter((record) => record.box.assignedZoneId === zone._id)}
          selectedBoxIds={selectedBoxIds}
          reportByBoxId={reportByBoxId}
          onToggleBox={onToggleBox}
          onDropBox={(boxId) => onAssign([boxId], zone._id)}
        />
      ))}
    </div>
  );
}

function AssignmentPanel({
  title,
  subtitle,
  boxes,
  selectedBoxIds,
  reportByBoxId,
  onToggleBox,
  onDropBox,
}: {
  title: string;
  subtitle?: string;
  boxes: BoxRecord[];
  selectedBoxIds: Id<"boxes">[];
  reportByBoxId: Map<Id<"boxes">, BoxReport>;
  onToggleBox: (boxId: Id<"boxes">) => void;
  onDropBox: (boxId: Id<"boxes">) => void;
}) {
  return (
    <div className="rounded-md border border-border">
      <div className="border-b border-border p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{title}</p>
            {subtitle ? (
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <Badge variant="outline">{boxes.length}</Badge>
        </div>
      </div>
      <DropSection
        title="Queue"
        boxes={boxes}
        selectedBoxIds={selectedBoxIds}
        reportByBoxId={reportByBoxId}
        onToggleBox={onToggleBox}
        onDropBox={onDropBox}
      />
    </div>
  );
}

function DropSection({
  title,
  subtitle,
  boxes,
  selectedBoxIds,
  reportByBoxId,
  onToggleBox,
  onDropBox,
}: {
  title: string;
  subtitle?: string;
  boxes: BoxRecord[];
  selectedBoxIds: Id<"boxes">[];
  reportByBoxId: Map<Id<"boxes">, BoxReport>;
  onToggleBox: (boxId: Id<"boxes">) => void;
  onDropBox: (boxId: Id<"boxes">) => void;
}) {
  return (
    <div
      className="min-h-28 border-b border-border p-3 last:border-b-0"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        const boxId = event.dataTransfer.getData("text/plain");
        if (boxId) {
          onDropBox(boxId as Id<"boxes">);
        }
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <Badge variant="secondary">{boxes.length}</Badge>
      </div>
      <div className="space-y-2">
        {boxes.slice(0, 60).map((record) => (
          <BoxTile
            key={record.box._id}
            record={record}
            selected={selectedBoxIds.includes(record.box._id)}
            report={reportByBoxId.get(record.box._id)}
            onToggle={() => onToggleBox(record.box._id)}
          />
        ))}
        {boxes.length > 60 ? (
          <div className="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">
            {boxes.length - 60} more boxes hidden by the board limit. Use search
            or filters to narrow this lane.
          </div>
        ) : null}
        {!boxes.length ? (
          <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            Drop a box here or assign selected boxes with the bulk controls.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BoxTile({
  record,
  selected,
  report,
  onToggle,
}: {
  record: BoxRecord;
  selected: boolean;
  report?: BoxReport;
  onToggle: () => void;
}) {
  const { box, itemCount } = record;
  const warningCount =
    (box.assignmentWarnings?.length ?? 0) +
    (box.assignmentHardBlocks?.length ?? 0) +
    (report?.warnings.length ?? 0);
  const weightSummary = report?.weightSummary ?? record.weightSummary;

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-background p-2 text-sm",
        selected && "border-primary bg-primary/5"
      )}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", box._id);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <label className="flex min-w-0 items-start gap-2">
          <input
            type="checkbox"
            className="mt-1 size-3.5 accent-primary"
            checked={selected}
            aria-label={`Select ${box.code}`}
            onChange={onToggle}
          />
          <span className="min-w-0">
            <span className="block truncate font-medium">{box.code}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {box.label ?? box.room ?? "Unlabeled"}
            </span>
          </span>
        </label>
        {warningCount ? (
          <AlertTriangle className="mt-0.5 size-4 text-destructive" />
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge variant="outline">{box.status}</Badge>
        <Badge variant="outline">
          <Boxes aria-hidden="true" />
          {itemCount}
        </Badge>
        <Badge variant={isMissingBoxWeight(weightSummary) ? "secondary" : "outline"}>
          {formatBoxWeightValue(weightSummary)}
        </Badge>
        <Badge variant="outline">{formatBoxWeightSource(weightSummary)}</Badge>
        {box.assignmentLocked ? (
          <Badge variant="secondary">locked</Badge>
        ) : null}
      </div>
      {warningCount ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {report?.warnings.map((warning) => (
            <Badge key={warning} variant="outline">
              {warning}
            </Badge>
          ))}
          {box.assignmentWarnings?.map((warning) => (
            <Badge key={warning} variant="secondary">
              {warning}
            </Badge>
          ))}
          {box.assignmentHardBlocks?.map((block) => (
            <Badge key={block} variant="destructive">
              {block}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CapacityLine({
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
  const overCapacity = typeof percent === "number" && percent > 100;
  return (
    <div>
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span>
          {formatNumber(value)}
          {max ? ` / ${formatNumber(max)}` : ""} {unit}
        </span>
      </div>
      {typeof percent === "number" ? (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full", overCapacity ? "bg-destructive" : "bg-primary")}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function matchesPlannerFilter(
  record: BoxRecord,
  report: BoxReport | undefined,
  filter: PlannerFilter
) {
  switch (filter) {
    case "all":
      return true;
    case "unassigned":
      return !record.box.assignedResourceId;
    case "warnings":
      return Boolean(
        report?.warnings.length ||
          record.box.assignmentWarnings?.length ||
          record.box.assignmentHardBlocks?.length
      );
    case "fragile":
      return record.contents.some((entry) => entry?.item.fragility === "high");
    case "highValue":
      return record.contents.some((entry) => entry?.item.highValue);
    case "firstNight":
      return record.contents.some((entry) =>
        entry?.item.planningDefaultKeys.includes("firstNight")
      );
    case "notPacked":
      return !["sealed", "staged", "loaded", "delivered"].includes(
        record.box.status
      );
  }
}

function formatNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
    : "0";
}
