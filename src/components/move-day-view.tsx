"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  PackageCheck,
  ScanLine,
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
import { cn } from "@/lib/utils";

type BoxRecord = NonNullable<
  ReturnType<typeof useQuery<typeof api.boxes.listForMove>>
>[number];
type BoxStatus = Doc<"boxes">["status"];
type ItemStatus = Doc<"items">["status"];
type CrewFilter = "all" | "ready" | "staged" | "loaded" | "exceptions";

const crewFilters: { key: CrewFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "staged", label: "Staged" },
  { key: "loaded", label: "Loaded" },
  { key: "exceptions", label: "Exceptions" },
];

const progressStatuses: BoxStatus[] = [
  "sealed",
  "staged",
  "loaded",
  "delivered",
  "missing",
  "damaged",
];

const statusActions: {
  boxStatus: BoxStatus;
  itemStatus?: ItemStatus;
  label: string;
  variant?: "default" | "outline" | "destructive";
}[] = [
  { boxStatus: "sealed", itemStatus: "packed", label: "Sealed", variant: "outline" },
  { boxStatus: "staged", itemStatus: "staged", label: "Staged", variant: "outline" },
  { boxStatus: "loaded", itemStatus: "loaded", label: "Loaded" },
  {
    boxStatus: "delivered",
    itemStatus: "delivered",
    label: "Delivered",
    variant: "outline",
  },
  {
    boxStatus: "missing",
    itemStatus: "missing",
    label: "Missing",
    variant: "destructive",
  },
  {
    boxStatus: "damaged",
    itemStatus: "damaged",
    label: "Damaged",
    variant: "destructive",
  },
];

export function MoveDayView({
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
  const resourcesWithZones = useQuery(
    api.transportResources.listForMoveWithZones,
    householdId && moveId ? { householdId, moveId } : "skip"
  );
  const updateBox = useMutation(api.boxes.update);
  const updateItem = useMutation(api.items.update);

  const [lookup, setLookup] = useState("");
  const [filter, setFilter] = useState<CrewFilter>("ready");
  const [safeView, setSafeView] = useState(true);
  const [updatingBoxId, setUpdatingBoxId] = useState<Id<"boxes"> | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const resourceNameById = useMemo(() => {
    const resources = new Map<string, string>();
    for (const entry of resourcesWithZones ?? []) {
      resources.set(entry.resource._id, entry.resource.name);
    }
    return resources;
  }, [resourcesWithZones]);
  const zoneNameById = useMemo(() => {
    const zones = new Map<string, string>();
    for (const entry of resourcesWithZones ?? []) {
      for (const zone of entry.zones) {
        zones.set(zone._id, zone.name);
      }
    }
    return zones;
  }, [resourcesWithZones]);

  const activeBoxes = useMemo(() => boxes ?? [], [boxes]);
  const filteredBoxes = useMemo(() => {
    const normalizedLookup = lookup.trim().toLowerCase();
    return activeBoxes.filter((record) => {
      if (!matchesCrewFilter(record, filter)) {
        return false;
      }
      if (!normalizedLookup) {
        return true;
      }
      const haystack = [
        record.box.code,
        record.box.label,
        record.box.room,
        record.box.destinationRoom,
        record.box.status,
      ];
      return haystack.some((value) =>
        value?.toLowerCase().includes(normalizedLookup)
      );
    });
  }, [activeBoxes, filter, lookup]);

  const statusCounts = useMemo(() => {
    const counts = new Map<BoxStatus, number>();
    for (const status of progressStatuses) {
      counts.set(status, 0);
    }
    for (const record of activeBoxes) {
      counts.set(record.box.status, (counts.get(record.box.status) ?? 0) + 1);
    }
    return counts;
  }, [activeBoxes]);
  const completedCount =
    (statusCounts.get("loaded") ?? 0) + (statusCounts.get("delivered") ?? 0);
  const exceptionCount =
    (statusCounts.get("missing") ?? 0) + (statusCounts.get("damaged") ?? 0);
  const progressPercent = activeBoxes.length
    ? Math.round((completedCount / activeBoxes.length) * 100)
    : 0;

  async function setBoxStatus(
    record: BoxRecord,
    boxStatus: BoxStatus,
    itemStatus?: ItemStatus
  ) {
    if (!householdId || !moveId) {
      return;
    }

    setUpdatingBoxId(record.box._id);
    setMessage(null);
    try {
      await updateBox({
        householdId,
        moveId,
        boxId: record.box._id,
        status: boxStatus,
      });
      if (itemStatus) {
        await Promise.all(
          record.contents
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
            .map((entry) =>
              updateItem({
                householdId,
                moveId,
                itemId: entry.item._id,
                status: itemStatus,
              })
            )
        );
      }
      setMessage(`${record.box.code} marked ${boxStatus}.`);
    } catch {
      setMessage(`Could not update ${record.box.code}.`);
    } finally {
      setUpdatingBoxId(null);
    }
  }

  const loading = boxes === undefined || resourcesWithZones === undefined;

  return (
    <Card id="move-day">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-4 text-primary" aria-hidden="true" />
              Move Day
            </CardTitle>
            <CardDescription>
              Mobile-first load crew checklist with safe fields, lookup, and
              real-time status updates.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{progressPercent}% loaded/delivered</Badge>
            {exceptionCount ? (
              <Badge variant="destructive">{exceptionCount} exceptions</Badge>
            ) : (
              <Badge variant="outline">no exceptions</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="pl-8"
                value={lookup}
                onChange={(event) => setLookup(event.target.value)}
                placeholder="Scan or type a box code, room, destination, or status"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {crewFilters.map((option) => (
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
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Crew-safe mode</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Hides values, serials, private notes, and photo details.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-3.5 accent-primary"
                  checked={safeView}
                  onChange={(event) => setSafeView(event.target.checked)}
                />
                Safe
              </label>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <MoveDayMetric label="Sealed" value={statusCounts.get("sealed") ?? 0} />
              <MoveDayMetric label="Staged" value={statusCounts.get("staged") ?? 0} />
              <MoveDayMetric label="Loaded" value={statusCounts.get("loaded") ?? 0} />
              <MoveDayMetric
                label="Delivered"
                value={statusCounts.get("delivered") ?? 0}
              />
              <MoveDayMetric
                label="Missing"
                value={statusCounts.get("missing") ?? 0}
              />
              <MoveDayMetric
                label="Damaged"
                value={statusCounts.get("damaged") ?? 0}
              />
            </div>
          </div>
        </div>

        {message ? (
          <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-5/6" />
          </div>
        ) : filteredBoxes.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {filteredBoxes.slice(0, 80).map((record) => (
              <MoveDayBoxCard
                key={record.box._id}
                record={record}
                safeView={safeView}
                resourceName={
                  record.box.assignedResourceId
                    ? resourceNameById.get(record.box.assignedResourceId)
                    : undefined
                }
                zoneName={
                  record.box.assignedZoneId
                    ? zoneNameById.get(record.box.assignedZoneId)
                    : undefined
                }
                updating={updatingBoxId === record.box._id}
                onSetStatus={(boxStatus, itemStatus) =>
                  void setBoxStatus(record, boxStatus, itemStatus)
                }
              />
            ))}
            {filteredBoxes.length > 80 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                {filteredBoxes.length - 80} more boxes hidden by the crew view
                limit. Use scan/search or filters to narrow the list.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            No boxes match this move-day filter.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MoveDayBoxCard({
  record,
  safeView,
  resourceName,
  zoneName,
  updating,
  onSetStatus,
}: {
  record: BoxRecord;
  safeView: boolean;
  resourceName?: string;
  zoneName?: string;
  updating: boolean;
  onSetStatus: (boxStatus: BoxStatus, itemStatus?: ItemStatus) => void;
}) {
  const { box, contents, itemCount } = record;
  const hasException = box.status === "missing" || box.status === "damaged";
  const hasWarnings =
    (box.assignmentWarnings?.length ?? 0) > 0 ||
    (box.assignmentHardBlocks?.length ?? 0) > 0;

  return (
    <div
      className={cn(
        "rounded-md border border-border p-3",
        hasException && "border-destructive/50 bg-destructive/5"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PackageCheck className="size-4 text-primary" aria-hidden="true" />
            <p className="font-medium">{box.code}</p>
            <Badge variant={hasException ? "destructive" : "outline"}>
              {box.status}
            </Badge>
            {hasWarnings ? (
              <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {box.label ?? box.room ?? "Unlabeled box"}
          </p>
        </div>
        <Badge variant="secondary">{itemCount} items</Badge>
      </div>

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <MoveDayField label="From" value={box.room ?? "unset"} />
        <MoveDayField label="To" value={box.destinationRoom ?? "unset"} />
        <MoveDayField
          label="Load"
          value={[resourceName, zoneName].filter(Boolean).join(" / ") || "unset"}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
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
        {box.assignmentLocked ? <Badge variant="outline">locked</Badge> : null}
      </div>

      {!safeView && contents.length ? (
        <div className="mt-3 rounded-md border border-border">
          {contents.slice(0, 6).map((entry) =>
            entry ? (
              <div
                key={entry.membership._id}
                className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0"
              >
                <span className="min-w-0 truncate">{entry.item.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  x{entry.membership.quantity}
                </span>
              </div>
            ) : null
          )}
          {contents.length > 6 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {contents.length - 6} more contents hidden.
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {statusActions.map((action) => (
          <Button
            key={action.boxStatus}
            type="button"
            size="sm"
            variant={action.variant ?? "default"}
            disabled={updating || box.status === action.boxStatus}
            onClick={() => onSetStatus(action.boxStatus, action.itemStatus)}
          >
            {action.boxStatus === "loaded" ? (
              <Truck aria-hidden="true" />
            ) : action.boxStatus === "delivered" ? (
              <CheckCircle2 aria-hidden="true" />
            ) : (
              <ScanLine aria-hidden="true" />
            )}
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function MoveDayField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  );
}

function MoveDayMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="font-mono text-lg font-semibold">{value}</div>
      <div className="mt-0.5 text-muted-foreground">{label}</div>
    </div>
  );
}

function matchesCrewFilter(record: BoxRecord, filter: CrewFilter) {
  switch (filter) {
    case "all":
      return true;
    case "ready":
      return ["sealed", "staged"].includes(record.box.status);
    case "staged":
      return record.box.status === "staged";
    case "loaded":
      return ["loaded", "delivered"].includes(record.box.status);
    case "exceptions":
      return (
        ["missing", "damaged"].includes(record.box.status) ||
        Boolean(
          record.box.assignmentWarnings?.length ||
            record.box.assignmentHardBlocks?.length
        )
      );
  }
}
