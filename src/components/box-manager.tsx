"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Boxes,
  ClipboardList,
  PackagePlus,
  Printer,
  Trash2,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { PhotoEvidenceStrip } from "@/components/photo-evidence-strip";
import { PhotoUploadControl } from "@/components/photo-upload-control";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  buildBoxLabelSheetPath,
  buildBoxLookupPath,
} from "@/lib/box-labels";
import { boxStatusOptions } from "@/lib/box-options";
import {
  formatOptionalNumber,
  parseOptionalNumber,
} from "@/lib/inventory-detail";

type InventoryItem = Doc<"items">;
type TransportResourceWithZones = {
  resource: Doc<"transportResources">;
  zones: Doc<"transportZones">[];
};
type BoxRecord = NonNullable<
  ReturnType<typeof useQuery<typeof api.boxes.listForMove>>
>[number];

function BoxCard({
  householdId,
  moveId,
  boxRecord,
  items,
  resourcesWithZones,
  onMessage,
}: {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  boxRecord: BoxRecord;
  items: InventoryItem[];
  resourcesWithZones: TransportResourceWithZones[];
  onMessage: (message: string) => void;
}) {
  const { box, contents, itemCount, contentsEstimatedWeightLb } = boxRecord;
  const updateBox = useMutation(api.boxes.update);
  const addItem = useMutation(api.boxes.addItem);
  const removeItem = useMutation(api.boxes.removeItem);

  const [label, setLabel] = useState(box.label ?? "");
  const [room, setRoom] = useState(box.room ?? "");
  const [destinationRoom, setDestinationRoom] = useState(
    box.destinationRoom ?? ""
  );
  const [description, setDescription] = useState(box.description ?? "");
  const [status, setStatus] = useState(box.status);
  const [estimatedWeightLb, setEstimatedWeightLb] = useState(
    formatOptionalNumber(box.estimatedWeightLb)
  );
  const [actualWeightLb, setActualWeightLb] = useState(
    formatOptionalNumber(box.actualWeightLb)
  );
  const [estimatedVolumeCuFt, setEstimatedVolumeCuFt] = useState(
    formatOptionalNumber(box.estimatedVolumeCuFt)
  );
  const [assignedResourceId, setAssignedResourceId] = useState(
    box.assignedResourceId ?? ""
  );
  const [assignedZoneId, setAssignedZoneId] = useState(box.assignedZoneId ?? "");
  const [assignmentLocked, setAssignmentLocked] = useState(
    box.assignmentLocked ?? false
  );
  const [assignmentOverrideReason, setAssignmentOverrideReason] = useState(
    box.assignmentOverrideReason ?? ""
  );
  const [selectedItemId, setSelectedItemId] = useState("");
  const [saving, setSaving] = useState(false);

  const zones = useMemo(
    () =>
      resourcesWithZones.find(
        ({ resource }) => resource._id === assignedResourceId
      )?.zones ?? [],
    [assignedResourceId, resourcesWithZones]
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
          ? { assignedResourceId: assignedResourceId as Id<"transportResources"> }
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
        error instanceof Error ? error.message : `Could not save ${box.code}.`
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
          : `Could not add that item to ${box.code}.`
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
          : `Could not remove that item from ${box.code}.`
      );
    }
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{box.code}</p>
            <Badge variant={box.status === "damaged" ? "destructive" : "outline"}>
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
          <Button asChild size="sm" variant="outline">
            <Link
              href={buildBoxLabelSheetPath({
                householdId,
                moveId,
              })}
            >
              <Printer aria-hidden="true" />
              Labels
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Label" />
        <Input value={room} onChange={(event) => setRoom(event.target.value)} placeholder="Room" />
        <Input
          value={destinationRoom}
          onChange={(event) => setDestinationRoom(event.target.value)}
          placeholder="Destination room"
        />
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
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
        />
        <Input
          inputMode="decimal"
          value={actualWeightLb}
          onChange={(event) => setActualWeightLb(event.target.value)}
          placeholder="Actual lb"
        />
        <Input
          inputMode="decimal"
          value={estimatedVolumeCuFt}
          onChange={(event) => setEstimatedVolumeCuFt(event.target.value)}
          placeholder="Cu ft"
        />
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={assignedResourceId}
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
        className="mt-2"
        value={assignmentOverrideReason}
        onChange={(event) => setAssignmentOverrideReason(event.target.value)}
        placeholder="Override reason for load warnings"
      />

      {(box.assignmentWarnings?.length ?? 0) ||
      (box.assignmentHardBlocks?.length ?? 0) ? (
        <div className="mt-2 flex flex-wrap gap-1">
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
      ) : null}

      <Textarea
        className="mt-2"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Description or handling notes"
      />

      <div className="mt-3">
        <PhotoUploadControl
          householdId={householdId}
          moveId={moveId}
          boxId={box._id}
          room={box.room}
          label="Box photo"
        />
      </div>
      <div className="mt-3">
        <PhotoEvidenceStrip
          householdId={householdId}
          moveId={moveId}
          boxId={box._id}
        />
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={selectedItemId}
          onChange={(event) => setSelectedItemId(event.target.value)}
        >
          <option value="">Add item</option>
          {items.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" onClick={() => void handleAddItem()}>
          <PackagePlus aria-hidden="true" />
          Add
        </Button>
      </div>

      <div className="mt-3 rounded-md border border-border">
        {contents.length ? (
          <div className="divide-y divide-border">
            {contents.map((entry) =>
              entry ? (
                <div
                  key={entry.membership._id}
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
                    onClick={() => void handleRemoveItem(entry.membership._id)}
                  >
                    <Trash2 aria-hidden="true" />
                    <span className="sr-only">Remove item</span>
                  </Button>
                </div>
              ) : null
            )}
          </div>
        ) : (
          <div className="p-3 text-sm text-muted-foreground">No contents yet.</div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{itemCount} items</Badge>
          <Badge variant="outline">
            {box.actualWeightLb ?? box.estimatedWeightLb ?? contentsEstimatedWeightLb} lb
          </Badge>
          <Badge variant="outline">{box.estimatedVolumeCuFt ?? 0} cu ft</Badge>
        </div>
        <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Saving" : "Save box"}
        </Button>
      </div>
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
  const createBox = useMutation(api.boxes.create);

  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [room, setRoom] = useState("");
  const [destinationRoom, setDestinationRoom] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const visibleBoxes = boxes ?? [];
  const activeItems = (items ?? []).filter((item) => item.status !== "archived");

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
        label,
        room,
        destinationRoom,
      });
      setCode("");
      setLabel("");
      setRoom("");
      setDestinationRoom("");
      setMessage("Box created.");
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
              Create box codes, track contents, and keep room/load status current.
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
        <form
          className="grid gap-2 md:grid-cols-[120px_minmax(0,1fr)_160px_160px_auto]"
          onSubmit={handleCreate}
        >
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="B-001"
            disabled={!moveId}
          />
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Label"
            disabled={!moveId}
          />
          <Input
            value={room}
            onChange={(event) => setRoom(event.target.value)}
            placeholder="Room"
            disabled={!moveId}
          />
          <Input
            value={destinationRoom}
            onChange={(event) => setDestinationRoom(event.target.value)}
            placeholder="Destination"
            disabled={!moveId}
          />
          <Button type="submit" size="sm" disabled={!moveId || creating}>
            <Boxes aria-hidden="true" />
            Create
          </Button>
        </form>

        {boxes === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-5/6" />
          </div>
        ) : visibleBoxes.length ? (
          <>
            <div className="grid gap-3 2xl:grid-cols-2">
              {visibleBoxes.map((boxRecord) =>
                householdId && moveId ? (
                  <BoxCard
                    key={`${boxRecord.box._id}:${boxRecord.box.updatedAt}:${boxRecord.itemCount}`}
                    householdId={householdId}
                    moveId={moveId}
                    boxRecord={boxRecord}
                    items={activeItems}
                    resourcesWithZones={resourcesWithZones ?? []}
                    onMessage={setMessage}
                  />
                ) : null
              )}
            </div>

            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Weight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleBoxes.map(({ box, itemCount, contentsEstimatedWeightLb }) => (
                    <TableRow key={box._id}>
                      <TableCell className="font-medium">{box.code}</TableCell>
                      <TableCell>{box.status}</TableCell>
                      <TableCell>{box.room ?? "unassigned"}</TableCell>
                      <TableCell>{box.destinationRoom ?? "unassigned"}</TableCell>
                      <TableCell>{itemCount}</TableCell>
                      <TableCell>
                        {box.actualWeightLb ??
                          box.estimatedWeightLb ??
                          contentsEstimatedWeightLb}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            Create the first box or container to start grouping packed items.
          </div>
        )}

        {message ? (
          <p className="flex items-center gap-2 rounded-md border border-border p-3 text-sm text-muted-foreground">
            <ClipboardList className="size-4 text-primary" aria-hidden="true" />
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
