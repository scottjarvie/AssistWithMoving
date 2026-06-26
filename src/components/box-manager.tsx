"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Boxes,
  Camera,
  ClipboardPenLine,
  ClipboardList,
  PackagePlus,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  Truck,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { PhotoEvidenceStrip } from "@/components/photo-evidence-strip";
import { PhotoUploadControl } from "@/components/photo-upload-control";
import { MoveWorkspaceTabList } from "@/components/move-workspace-tab-list";
import { useHashTab } from "@/components/use-hash-tab";
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
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { buildBoxLabelSheetPath, buildBoxLookupPath } from "@/lib/box-labels";
import {
  formatBoxWeightSource,
  formatBoxWeightValue,
  isMissingBoxWeight,
} from "@/lib/box-weight";
import { boxStatusOptions } from "@/lib/box-options";
import {
  formatOptionalNumber,
  parseOptionalNumber,
} from "@/lib/inventory-detail";
import { calculateMovableUnitVolumeCuFt } from "@/lib/movable-units";

type InventoryItem = Doc<"items">;
type TransportResourceWithZones = {
  resource: Doc<"transportResources">;
  zones: Doc<"transportZones">[];
};
type BoxRecord = NonNullable<
  ReturnType<typeof useQuery<typeof api.boxes.listForMove>>
>[number];
type BoxCardTask = "contents" | "details" | "photos" | "load";
type BoxTask = "boxes" | "add" | BoxCardTask | "labels";
type BoxStatusFilter = "all" | Doc<"boxes">["status"];

const boxTaskTabs: { value: BoxTask; label: string; description: string }[] = [
  {
    value: "boxes",
    label: "Boxes",
    description:
      "Scan existing boxes before opening contents, details, photos, or labels.",
  },
  {
    value: "add",
    label: "Add box",
    description:
      "Create a new code, label, and room target without crowding the box list.",
  },
  {
    value: "contents",
    label: "Contents",
    description: "Choose one box, then manage the items packed inside it.",
  },
  {
    value: "details",
    label: "Details",
    description:
      "Choose one box, then edit label, room, weight, volume, and notes.",
  },
  {
    value: "photos",
    label: "Photos",
    description: "Choose one box, then add or review box evidence photos.",
  },
  {
    value: "load",
    label: "Load",
    description:
      "Choose one box, then assign it to a resource, zone, or exception flow.",
  },
  {
    value: "labels",
    label: "Labels",
    description: "Print box labels separately from editing box records.",
  },
];

const boxTaskHashes = {
  "#add-box": "add",
  "#box-contents": "contents",
  "#box-details": "details",
  "#box-labels": "labels",
  "#box-load": "load",
  "#box-photos": "photos",
  "#boxes": "boxes",
} as const;

const boxCardTaskMeta: Record<
  BoxCardTask,
  { title: string; description: string; cta: string }
> = {
  contents: {
    title: "Pick a box for contents",
    description:
      "Choose one box, then add or remove the packed items inside it.",
    cta: "Open contents",
  },
  details: {
    title: "Pick a box for details",
    description:
      "Choose one box, then edit its label, rooms, weight, volume, and notes.",
    cta: "Edit details",
  },
  photos: {
    title: "Pick a box for photos",
    description:
      "Choose one box, then upload evidence photos and review what is attached.",
    cta: "Add photos",
  },
  load: {
    title: "Pick a box for load assignment",
    description:
      "Choose one box, then assign it to a truck, trailer, zone, mover, or storage flow.",
    cta: "Assign load",
  },
};

function boxTaskIcon(task: BoxCardTask) {
  switch (task) {
    case "contents":
      return <PackagePlus aria-hidden="true" />;
    case "details":
      return <ClipboardPenLine aria-hidden="true" />;
    case "photos":
      return <Camera aria-hidden="true" />;
    case "load":
      return <Truck aria-hidden="true" />;
  }
}

// Display volume for a box badge: prefer the stored estimatedVolumeCuFt, else
// derive it from dimensions (matching the movable-units view) so a dims-only box
// shows its real volume instead of a misleading "0 cu ft".
function boxBadgeVolumeCuFt(box: {
  estimatedVolumeCuFt?: number | null;
  dimensionsIn?: Doc<"boxes">["dimensionsIn"];
}): number {
  if (
    typeof box.estimatedVolumeCuFt === "number" &&
    Number.isFinite(box.estimatedVolumeCuFt) &&
    box.estimatedVolumeCuFt > 0
  ) {
    return box.estimatedVolumeCuFt;
  }
  return calculateMovableUnitVolumeCuFt(box.dimensionsIn) ?? 0;
}

function BoxCard({
  householdId,
  moveId,
  boxRecord,
  items,
  resourcesWithZones,
  task,
  onMessage,
}: {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  boxRecord: BoxRecord;
  items: InventoryItem[];
  resourcesWithZones: TransportResourceWithZones[];
  task: BoxCardTask;
  onMessage: (message: string) => void;
}) {
  const { box, contents, itemCount, weightSummary } = boxRecord;
  const updateBox = useMutation(api.boxes.update);
  const addItem = useMutation(api.boxes.addItem);
  const removeItem = useMutation(api.boxes.removeItem);

  const [label, setLabel] = useState(box.label ?? "");
  const [room, setRoom] = useState(box.room ?? "");
  const [destinationRoom, setDestinationRoom] = useState(
    box.destinationRoom ?? "",
  );
  const [description, setDescription] = useState(box.description ?? "");
  const [status, setStatus] = useState(box.status);
  const [estimatedWeightLb, setEstimatedWeightLb] = useState(
    formatOptionalNumber(box.estimatedWeightLb),
  );
  const [actualWeightLb, setActualWeightLb] = useState(
    formatOptionalNumber(box.actualWeightLb),
  );
  const [estimatedVolumeCuFt, setEstimatedVolumeCuFt] = useState(
    formatOptionalNumber(box.estimatedVolumeCuFt),
  );
  const [assignedResourceId, setAssignedResourceId] = useState(
    box.assignedResourceId ?? "",
  );
  const [assignedZoneId, setAssignedZoneId] = useState(
    box.assignedZoneId ?? "",
  );
  const [assignmentLocked, setAssignmentLocked] = useState(
    box.assignmentLocked ?? false,
  );
  const [assignmentOverrideReason, setAssignmentOverrideReason] = useState(
    box.assignmentOverrideReason ?? "",
  );
  const [selectedItemId, setSelectedItemId] = useState("");
  const [saving, setSaving] = useState(false);

  const zones = useMemo(
    () =>
      resourcesWithZones.find(
        ({ resource }) => resource._id === assignedResourceId,
      )?.zones ?? [],
    [assignedResourceId, resourcesWithZones],
  );

  async function handleSave() {
    setSaving(true);
    try {
      const estimatedWeight = parseOptionalNumber(estimatedWeightLb);
      const actualWeight = parseOptionalNumber(actualWeightLb);
      const estimatedVolume = parseOptionalNumber(estimatedVolumeCuFt);
      await updateBox({
        householdId,
        moveId,
        boxId: box._id,
        label,
        room,
        destinationRoom,
        description,
        status,
        ...(estimatedWeight !== undefined
          ? { estimatedWeightLb: estimatedWeight }
          : {}),
        ...(actualWeight !== undefined ? { actualWeightLb: actualWeight } : {}),
        ...(estimatedVolume !== undefined
          ? { estimatedVolumeCuFt: estimatedVolume }
          : {}),
        ...(assignedResourceId
          ? {
              assignedResourceId:
                assignedResourceId as Id<"transportResources">,
            }
          : { clearAssignedResource: true }),
        ...(assignedZoneId
          ? { assignedZoneId: assignedZoneId as Id<"transportZones"> }
          : { clearAssignedZone: true }),
        assignmentLocked,
        assignmentOverrideReason,
      });
      onMessage(`${box.code} saved.`);
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : `Could not save ${box.code}.`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAddItem() {
    if (!selectedItemId) {
      return;
    }

    try {
      await addItem({
        householdId,
        moveId,
        boxId: box._id,
        itemId: selectedItemId as Id<"items">,
      });
      setSelectedItemId("");
      onMessage(`Item added to ${box.code}.`);
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : `Could not add that item to ${box.code}.`,
      );
    }
  }

  async function handleRemoveItem(boxItemId: Id<"boxItems">) {
    try {
      await removeItem({
        householdId,
        moveId,
        boxItemId,
      });
      onMessage(`Item removed from ${box.code}.`);
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : `Could not remove that item from ${box.code}.`,
      );
    }
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{box.code}</p>
            <Badge
              variant={box.status === "damaged" ? "destructive" : "outline"}
            >
              {box.status}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {box.label ?? box.description ?? "Unlabeled box"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link
              href={buildBoxLookupPath({
                householdId,
                moveId,
                boxId: box._id,
              })}
            >
              <Boxes aria-hidden="true" />
              Lookup
            </Link>
          </Button>
        </div>
      </div>

      {task === "details" ? (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Label"
              aria-label="Box label"
            />
            <Input
              value={room}
              onChange={(event) => setRoom(event.target.value)}
              placeholder="Room"
              aria-label="Box room"
            />
            <Input
              value={destinationRoom}
              onChange={(event) => setDestinationRoom(event.target.value)}
              placeholder="Destination room"
              aria-label="Box destination room"
            />
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={status}
              aria-label="Box status"
              onChange={(event) =>
                setStatus(event.target.value as typeof status)
              }
            >
              {boxStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <Input
              inputMode="decimal"
              value={estimatedWeightLb}
              onChange={(event) => setEstimatedWeightLb(event.target.value)}
              placeholder="Estimated lb"
              aria-label="Estimated box weight in pounds"
            />
            <Input
              inputMode="decimal"
              value={actualWeightLb}
              onChange={(event) => setActualWeightLb(event.target.value)}
              placeholder="Actual lb"
              aria-label="Actual box weight in pounds"
            />
            <Input
              inputMode="decimal"
              value={estimatedVolumeCuFt}
              onChange={(event) => setEstimatedVolumeCuFt(event.target.value)}
              placeholder="Cu ft"
              aria-label="Estimated box volume in cubic feet"
            />
          </div>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description or handling notes"
            aria-label="Box description or handling notes"
          />
        </div>
      ) : null}

      {task === "load" ? (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={assignedResourceId}
              aria-label="Assigned transport resource"
              onChange={(event) => {
                setAssignedResourceId(event.target.value);
                setAssignedZoneId("");
              }}
            >
              <option value="">Resource</option>
              {resourcesWithZones.map(({ resource }) => (
                <option key={resource._id} value={resource._id}>
                  {resource.name}
                </option>
              ))}
            </select>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={assignedZoneId}
              aria-label="Assigned transport zone"
              disabled={!assignedResourceId}
              onChange={(event) => setAssignedZoneId(event.target.value)}
            >
              <option value="">Zone</option>
              {zones.map((zone) => (
                <option key={zone._id} value={zone._id}>
                  {zone.name}
                </option>
              ))}
            </select>
            <label className="flex h-8 items-center gap-2 rounded-md border border-input bg-background px-2 text-sm">
              <input
                type="checkbox"
                checked={assignmentLocked}
                onChange={(event) => setAssignmentLocked(event.target.checked)}
              />
              Locked
            </label>
          </div>
          <Input
            value={assignmentOverrideReason}
            onChange={(event) =>
              setAssignmentOverrideReason(event.target.value)
            }
            placeholder="Override reason for load warnings"
            aria-label="Assignment override reason"
          />
          {(box.assignmentWarnings?.length ?? 0) ||
          (box.assignmentHardBlocks?.length ?? 0) ? (
            <div className="flex flex-wrap gap-1">
              {box.assignmentWarnings?.map((warning) => (
                <Badge key={warning} variant="outline">
                  {warning}
                </Badge>
              ))}
              {box.assignmentHardBlocks?.map((block) => (
                <Badge key={block} variant="destructive">
                  {block}
                </Badge>
              ))}
              {box.assignmentLocked ? (
                <Badge variant="secondary">locked assignment</Badge>
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
              No load assignment warnings for this box.
            </div>
          )}
        </div>
      ) : null}

      {task === "photos" ? (
        <div className="mt-3 space-y-3">
          <PhotoUploadControl
            householdId={householdId}
            moveId={moveId}
            boxId={box._id}
            room={box.room}
            label="Box photos"
            multiple
          />
          <PhotoEvidenceStrip
            householdId={householdId}
            moveId={moveId}
            boxId={box._id}
          />
        </div>
      ) : null}

      {task === "contents" ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={selectedItemId}
              aria-label="Item to add to box"
              onChange={(event) => setSelectedItemId(event.target.value)}
            >
              <option value="">Add item</option>
              {items.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleAddItem()}
            >
              <PackagePlus aria-hidden="true" />
              Add
            </Button>
          </div>

          <div
            className="rounded-md border border-border"
            role="list"
            aria-label={`Contents for ${box.code}`}
          >
            {contents.length ? (
              <div className="divide-y divide-border">
                {contents.map((entry) =>
                  entry ? (
                    <div
                      key={entry.membership._id}
                      role="listitem"
                      className="flex items-center justify-between gap-2 p-2 text-sm"
                    >
                      <span>
                        {entry.item.name}
                        <span className="ml-2 text-xs text-muted-foreground">
                          x{entry.membership.quantity}
                        </span>
                      </span>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        onClick={() =>
                          void handleRemoveItem(entry.membership._id)
                        }
                      >
                        <Trash2 aria-hidden="true" />
                        <span className="sr-only">Remove item</span>
                      </Button>
                    </div>
                  ) : null,
                )}
              </div>
            ) : (
              <div
                role="listitem"
                className="p-3 text-sm text-muted-foreground"
              >
                No contents yet.
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{itemCount} items</Badge>
          <Badge
            variant={
              isMissingBoxWeight(weightSummary) ? "secondary" : "outline"
            }
          >
            {formatBoxWeightValue(weightSummary)}
          </Badge>
          <Badge variant="outline">
            {formatBoxWeightSource(weightSummary)}
          </Badge>
          <Badge variant="outline">{boxBadgeVolumeCuFt(box)} cu ft</Badge>
        </div>
        {task === "details" || task === "load" ? (
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving" : "Save box"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function BoxOverviewCard({
  householdId,
  moveId,
  boxRecord,
  onOpenTask,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  boxRecord: BoxRecord;
  onOpenTask: (task: BoxCardTask, boxId: Id<"boxes">) => void;
}) {
  const { box, contents, itemCount, weightSummary } = boxRecord;
  const visibleContents = contents
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .slice(0, 2);
  const hiddenContentCount = Math.max(itemCount - visibleContents.length, 0);

  return (
    <div
      role="listitem"
      className="rounded-md border border-border bg-card p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{box.code}</p>
            <Badge
              variant={box.status === "damaged" ? "destructive" : "outline"}
            >
              {box.status}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-2 max-w-[42rem] text-sm text-muted-foreground">
            {box.label ?? box.description ?? "Unlabeled box"}
          </p>
        </div>
        {householdId && moveId ? (
          <Button asChild size="sm" variant="outline">
            <Link
              href={buildBoxLookupPath({
                householdId,
                moveId,
                boxId: box._id,
              })}
            >
              <Boxes aria-hidden="true" />
              Lookup
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <BoxSummaryField label="Room" value={box.room ?? "unassigned"} />
        <BoxSummaryField
          label="Destination"
          value={box.destinationRoom ?? "unassigned"}
        />
        <BoxSummaryField label="Items" value={String(itemCount)} />
        <BoxSummaryField
          label="Weight"
          value={formatBoxWeightValue(weightSummary)}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline">{boxBadgeVolumeCuFt(box)} cu ft</Badge>
        <Badge
          variant={isMissingBoxWeight(weightSummary) ? "secondary" : "outline"}
        >
          {formatBoxWeightSource(weightSummary)}
        </Badge>
        {box.assignedResourceId ? (
          <Badge variant="secondary">load assigned</Badge>
        ) : (
          <Badge variant="outline">load unassigned</Badge>
        )}
        {box.assignmentLocked ? (
          <Badge variant="secondary">locked</Badge>
        ) : null}
      </div>

      <div className="mt-3 rounded-md border border-border/70 bg-muted/25 p-2">
        {visibleContents.length ? (
          <div className="flex flex-wrap gap-1.5 text-xs">
            {visibleContents.map((entry) => (
              <Badge key={entry.membership._id} variant="outline">
                {entry.item.name} x{entry.membership.quantity}
              </Badge>
            ))}
            {hiddenContentCount ? (
              <Badge variant="outline">+{hiddenContentCount} more</Badge>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No contents yet.</p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Contents for ${box.code}`}
          onClick={() => onOpenTask("contents", box._id)}
        >
          <PackagePlus aria-hidden="true" />
          Contents
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Details for ${box.code}`}
          onClick={() => onOpenTask("details", box._id)}
        >
          <ClipboardPenLine aria-hidden="true" />
          Details
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Photos for ${box.code}`}
          onClick={() => onOpenTask("photos", box._id)}
        >
          <Camera aria-hidden="true" />
          Photos
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Load for ${box.code}`}
          onClick={() => onOpenTask("load", box._id)}
        >
          <Truck aria-hidden="true" />
          Load
        </Button>
      </div>
    </div>
  );
}

function BoxTaskPickerCard({
  boxRecord,
  task,
  onSelect,
}: {
  boxRecord: BoxRecord;
  task: BoxCardTask;
  onSelect: (task: BoxCardTask, boxId: Id<"boxes">) => void;
}) {
  const { box, contents, itemCount, weightSummary } = boxRecord;
  const visibleContents = contents
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .slice(0, 3);
  const hiddenContentCount = Math.max(itemCount - visibleContents.length, 0);
  const meta = boxCardTaskMeta[task];

  return (
    <div
      role="listitem"
      className="rounded-md border border-border bg-card p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{box.code}</p>
            <Badge
              variant={box.status === "damaged" ? "destructive" : "outline"}
            >
              {box.status}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-2 max-w-[42rem] break-words text-sm text-muted-foreground">
            {box.label ?? box.description ?? "Unlabeled box"}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => onSelect(task, box._id)}
          aria-label={`${meta.cta} for ${box.code}`}
        >
          {boxTaskIcon(task)}
          {meta.cta}
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <BoxSummaryField label="Room" value={box.room ?? "unassigned"} />
        <BoxSummaryField
          label="Destination"
          value={box.destinationRoom ?? "unassigned"}
        />
        <BoxSummaryField label="Items" value={String(itemCount)} />
        <BoxSummaryField
          label="Weight"
          value={formatBoxWeightValue(weightSummary)}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline">{boxBadgeVolumeCuFt(box)} cu ft</Badge>
        <Badge
          variant={isMissingBoxWeight(weightSummary) ? "secondary" : "outline"}
        >
          {formatBoxWeightSource(weightSummary)}
        </Badge>
        {box.assignedResourceId ? (
          <Badge variant="secondary">load assigned</Badge>
        ) : (
          <Badge variant="outline">load unassigned</Badge>
        )}
      </div>

      {task === "contents" || task === "photos" ? (
        <div className="mt-3 rounded-md border border-border/70 bg-muted/25 p-2">
          {visibleContents.length ? (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {visibleContents.map((entry) => (
                <Badge key={entry.membership._id} variant="outline">
                  {entry.item.name} x{entry.membership.quantity}
                </Badge>
              ))}
              {hiddenContentCount ? (
                <Badge variant="outline">+{hiddenContentCount} more</Badge>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No contents yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function BoxSummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border/70 px-2 py-1.5">
      <p className="text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

export function BoxManager({
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
    api.items.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const resourcesWithZones = useQuery(
    api.transportResources.listForMoveWithZones,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const createBox = useMutation(api.boxes.create);

  const [code, setCode] = useState("");
  // Box vs Tote drives the auto-generated code prefix (B-### vs T-###), each
  // with its own running sequence. Only used when no explicit code is typed.
  const [kind, setKind] = useState<"box" | "tote">("box");
  const [label, setLabel] = useState("");
  const [room, setRoom] = useState("");
  const [destinationRoom, setDestinationRoom] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [activeTask, setActiveTask] = useHashTab<BoxTask>(
    "boxes",
    boxTaskHashes,
  );
  const [selectedBoxId, setSelectedBoxId] = useState<Id<"boxes"> | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BoxStatusFilter>("all");

  const visibleBoxes = useMemo(() => boxes ?? [], [boxes]);
  const activeItems = useMemo(
    () => (items ?? []).filter((item) => item.status !== "archived"),
    [items],
  );
  const filteredBoxes = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return visibleBoxes.filter(({ box, contents }) => {
      if (statusFilter !== "all" && box.status !== statusFilter) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      const haystack = [
        box.code,
        box.label,
        box.room,
        box.destinationRoom,
        box.description,
        ...contents
          .map((entry) => entry?.item.name)
          .filter((value): value is string => typeof value === "string"),
      ];
      return haystack.some((value) =>
        value?.toLowerCase().includes(normalizedSearch),
      );
    });
  }, [search, statusFilter, visibleBoxes]);
  const emptyBoxes = visibleBoxes.filter((record) => record.itemCount === 0);
  const missingWeightBoxes = visibleBoxes.filter((record) =>
    isMissingBoxWeight(record.weightSummary),
  );
  const exceptionBoxes = visibleBoxes.filter((record) =>
    ["missing", "damaged"].includes(record.box.status),
  );
  const hasActiveBoxFilters =
    search.trim().length > 0 || statusFilter !== "all";
  const selectedBoxRecord = useMemo(
    () =>
      selectedBoxId
        ? (visibleBoxes.find((record) => record.box._id === selectedBoxId) ??
          null)
        : null,
    [selectedBoxId, visibleBoxes],
  );

  function openBoxTask(task: BoxCardTask, boxId: Id<"boxes">) {
    setSelectedBoxId(boxId);
    setActiveTask(task);
  }

  function handleActiveTaskChange(value: string) {
    const task = value as BoxTask;
    setActiveTask(task);
    if (!["contents", "details", "photos", "load"].includes(task)) {
      setSelectedBoxId(null);
    }
  }

  function clearBoxFilters() {
    setSearch("");
    setStatusFilter("all");
  }

  function renderBoxActionStrip() {
    return (
      <div className="rounded-md border border-border bg-background p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">Box actions</h3>
            <p className="text-xs text-muted-foreground">
              {filteredBoxes.length} shown / {visibleBoxes.length} total
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => setActiveTask("add")}>
              <PackagePlus aria-hidden="true" />
              Add box
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setActiveTask("labels")}
            >
              <Printer aria-hidden="true" />
              Labels
            </Button>
            {hasActiveBoxFilters ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={clearBoxFilters}
              >
                <RotateCcw aria-hidden="true" />
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  function renderBoxFilterControls() {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-border p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px] lg:min-w-[520px]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="pl-8"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search codes, rooms, labels, or contents"
              aria-label="Search boxes"
            />
          </div>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={statusFilter}
            aria-label="Box status filter"
            onChange={(event) =>
              setStatusFilter(event.target.value as BoxStatusFilter)
            }
          >
            <option value="all">All statuses</option>
            {boxStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  function renderBoxTaskCards(task: BoxCardTask, emptyText: string) {
    if (boxes === undefined) {
      return (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-5/6" />
        </div>
      );
    }

    if (!visibleBoxes.length) {
      return (
        <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          {emptyText}
        </div>
      );
    }

    if (!selectedBoxRecord) {
      const meta = boxCardTaskMeta[task];

      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-muted/20 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{meta.title}</p>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                {meta.description}
              </p>
            </div>
            <Badge variant="secondary">{filteredBoxes.length} matches</Badge>
          </div>
          {renderBoxFilterControls()}
          {filteredBoxes.length ? (
            <div
              role="list"
              aria-label={meta.title}
              className="grid gap-3 2xl:grid-cols-2"
            >
              {filteredBoxes.map((boxRecord) => (
                <BoxTaskPickerCard
                  key={`${task}:picker:${boxRecord.box._id}`}
                  boxRecord={boxRecord}
                  task={task}
                  onSelect={openBoxTask}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              No boxes match the current search or status filter.
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/30 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              Focused on {selectedBoxRecord.box.code}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {selectedBoxRecord.box.label ??
                selectedBoxRecord.box.description ??
                "Unlabeled box"}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSelectedBoxId(null)}
          >
            Change box
          </Button>
        </div>
        <div className="grid gap-3 2xl:grid-cols-2">
          {householdId && moveId ? (
            <BoxCard
              key={`${task}:${selectedBoxRecord.box._id}:${selectedBoxRecord.box.updatedAt}:${selectedBoxRecord.itemCount}`}
              householdId={householdId}
              moveId={moveId}
              boxRecord={selectedBoxRecord}
              items={activeItems}
              resourcesWithZones={resourcesWithZones ?? []}
              task={task}
              onMessage={setMessage}
            />
          ) : null}
        </div>
      </div>
    );
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!householdId || !moveId) {
      return;
    }

    setCreating(true);
    setMessage(null);
    try {
      await createBox({
        householdId,
        moveId,
        code: code || undefined,
        containerType: kind === "tote" ? "plasticTote" : undefined,
        label,
        room,
        destinationRoom,
      });
      setCode("");
      setLabel("");
      setRoom("");
      setDestinationRoom("");
      setMessage(kind === "tote" ? "Tote created." : "Box created.");
      setActiveTask("boxes");
    } catch {
      setMessage("Could not create that box.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card id="boxes">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Box manager</CardTitle>
            <CardDescription>
              Create box codes, track contents, and keep room/load status
              current.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{visibleBoxes.length} boxes</Badge>
            {householdId && moveId ? (
              <Button asChild size="sm" variant="outline">
                <Link href={buildBoxLabelSheetPath({ householdId, moveId })}>
                  <Printer aria-hidden="true" />
                  Print labels
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? (
          <p className="flex items-center gap-2 rounded-md border border-border p-3 text-sm text-muted-foreground">
            <ClipboardList className="size-4 text-primary" aria-hidden="true" />
            {message}
          </p>
        ) : null}
        <Tabs
          value={activeTask}
          onValueChange={handleActiveTaskChange}
          className="gap-4"
        >
          <MoveWorkspaceTabList tabs={boxTaskTabs} activeValue={activeTask} />

          <TabsContent value="boxes" id="boxes" className="space-y-4">
            {renderBoxActionStrip()}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <BoxMetric label="Total" value={visibleBoxes.length} />
              <BoxMetric label="Empty" value={emptyBoxes.length} />
              <BoxMetric label="Exceptions" value={exceptionBoxes.length} />
              <BoxMetric
                label="Missing weight"
                value={missingWeightBoxes.length}
              />
            </div>

            {renderBoxFilterControls()}

            {boxes === undefined ? (
              <div className="space-y-2">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-5/6" />
              </div>
            ) : visibleBoxes.length ? (
              filteredBoxes.length ? (
                <div
                  role="list"
                  aria-label="Box records"
                  className="grid gap-3 xl:grid-cols-2"
                >
                  {filteredBoxes.map((boxRecord) => (
                    <BoxOverviewCard
                      key={boxRecord.box._id}
                      householdId={householdId}
                      moveId={moveId}
                      boxRecord={boxRecord}
                      onOpenTask={openBoxTask}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                  No boxes match the current search or status filter.
                </div>
              )
            ) : (
              <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                Create the first box or container to start grouping packed
                items.
              </div>
            )}
          </TabsContent>

          <TabsContent value="add" id="add-box" className="space-y-4">
            <form
              aria-label="Create box"
              className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[110px_120px_minmax(0,1fr)_150px_150px_auto]"
              onSubmit={handleCreate}
            >
              <select
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as "box" | "tote")
                }
                aria-label="New unit type"
                disabled={!moveId}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="box">Box</option>
                <option value="tote">Tote</option>
              </select>
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder={kind === "tote" ? "T-001 (auto)" : "B-001 (auto)"}
                aria-label="New unit code"
                disabled={!moveId}
              />
              <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Label"
                aria-label="New box label"
                disabled={!moveId}
              />
              <Input
                value={room}
                onChange={(event) => setRoom(event.target.value)}
                placeholder="Room"
                aria-label="New box room"
                disabled={!moveId}
              />
              <Input
                value={destinationRoom}
                onChange={(event) => setDestinationRoom(event.target.value)}
                placeholder="Destination"
                aria-label="New box destination room"
                disabled={!moveId}
              />
              <Button type="submit" size="sm" disabled={!moveId || creating}>
                <Boxes aria-hidden="true" />
                Create
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="contents" id="box-contents" className="space-y-4">
            {renderBoxTaskCards(
              "contents",
              "Create boxes before adding packed contents.",
            )}
          </TabsContent>

          <TabsContent value="details" id="box-details" className="space-y-4">
            {renderBoxTaskCards(
              "details",
              "Create boxes before editing labels, rooms, weights, and notes.",
            )}
          </TabsContent>

          <TabsContent value="photos" id="box-photos" className="space-y-4">
            {renderBoxTaskCards(
              "photos",
              "Create boxes before adding box photos.",
            )}
          </TabsContent>

          <TabsContent value="load" id="box-load" className="space-y-4">
            {renderBoxTaskCards(
              "load",
              "Create boxes before assigning them to trucks, trailers, zones, or movers.",
            )}
          </TabsContent>

          <TabsContent value="labels" id="box-labels" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">{visibleBoxes.length} labels</Badge>
                <Badge
                  variant={exceptionBoxes.length ? "destructive" : "outline"}
                >
                  {exceptionBoxes.length} exceptions
                </Badge>
              </div>
              {householdId && moveId ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={buildBoxLabelSheetPath({ householdId, moveId })}>
                    <Printer aria-hidden="true" />
                    Print labels
                  </Link>
                </Button>
              ) : null}
            </div>

            {visibleBoxes.length ? (
              <>
                <div
                  role="list"
                  aria-label="Box labels"
                  className="grid gap-3 md:hidden"
                >
                  {visibleBoxes.map(({ box }) => (
                    <BoxLabelCard
                      key={box._id}
                      box={box}
                      householdId={householdId}
                      moveId={moveId}
                    />
                  ))}
                </div>

                <div className="hidden rounded-md border border-border md:block">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-28">Code</TableHead>
                        <TableHead>Label</TableHead>
                        <TableHead className="w-36">Room</TableHead>
                        <TableHead className="w-36">Destination</TableHead>
                        <TableHead className="w-28">Lookup</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleBoxes.map(({ box }) => (
                        <TableRow key={box._id}>
                          <TableCell className="font-medium">
                            {box.code}
                          </TableCell>
                          <TableCell>
                            <span className="line-clamp-2 break-words">
                              {box.label ?? "unlabeled"}
                            </span>
                          </TableCell>
                          <TableCell className="truncate">
                            {box.room ?? "unassigned"}
                          </TableCell>
                          <TableCell className="truncate">
                            {box.destinationRoom ?? "unassigned"}
                          </TableCell>
                          <TableCell>
                            {householdId && moveId ? (
                              <Button asChild size="sm" variant="outline">
                                <Link
                                  href={buildBoxLookupPath({
                                    householdId,
                                    moveId,
                                    boxId: box._id,
                                  })}
                                >
                                  Lookup
                                </Link>
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                Create boxes before printing labels.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function BoxMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-normal">{value}</p>
    </div>
  );
}

function BoxLabelCard({
  box,
  householdId,
  moveId,
}: {
  box: Doc<"boxes">;
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  return (
    <div
      role="listitem"
      className="rounded-md border border-border bg-card p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium">{box.code}</p>
          <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">
            {box.label ?? "unlabeled"}
          </p>
        </div>
        {householdId && moveId ? (
          <Button asChild size="sm" variant="outline">
            <Link
              href={buildBoxLookupPath({
                householdId,
                moveId,
                boxId: box._id,
              })}
            >
              Lookup
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <BoxSummaryField label="Room" value={box.room ?? "unassigned"} />
        <BoxSummaryField
          label="Destination"
          value={box.destinationRoom ?? "unassigned"}
        />
      </div>
    </div>
  );
}
