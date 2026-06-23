"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Boxes,
  Camera,
  CheckCircle2,
  CircleAlert,
  ClipboardPaste,
  Images,
  PackageCheck,
  Ruler,
  Truck,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { CopyTextButton } from "@/components/copy-text-button";
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
import { Textarea } from "@/components/ui/textarea";
import { formatBoxWeightSource, formatBoxWeightValue } from "@/lib/box-weight";
import {
  parseBulkInventoryText,
  type BulkInventoryRow,
} from "@/lib/bulk-inventory";
import {
  formatOptionalNumber,
  parseOptionalNumber,
} from "@/lib/inventory-detail";
import { moveBoxesPath, moveWorkspaceAnchorPath } from "@/lib/move-links";
import { calculateMovableUnitVolumeCuFt } from "@/lib/movable-units";

export function BoxLookup({
  householdId,
  moveId,
  boxId,
  returnTo,
}: {
  householdId?: string;
  moveId?: string;
  boxId: string;
  returnTo?: string;
}) {
  const resolvedHouseholdId = householdId as Id<"households"> | undefined;
  const resolvedMoveId = moveId as Id<"moves"> | undefined;
  const resolvedBoxId = boxId as Id<"boxes">;
  const boxRecord = useQuery(
    api.boxes.get,
    resolvedHouseholdId && resolvedMoveId
      ? {
          householdId: resolvedHouseholdId,
          moveId: resolvedMoveId,
          boxId: resolvedBoxId,
        }
      : "skip",
  );
  const createItem = useMutation(api.items.create);
  const updateBox = useMutation(api.boxes.update);
  const addItem = useMutation(api.boxes.addItem);
  const createQueueEntry = useMutation(api.ingestionQueue.createEntry);
  const updatePhoto = useMutation(api.photos.updateEvidence);
  const [quickItemName, setQuickItemName] = useState("");
  const [quickItemQuantity, setQuickItemQuantity] = useState("1");
  const [quickItemCategory, setQuickItemCategory] = useState("");
  const [quickItemNotes, setQuickItemNotes] = useState("");
  const [batchContentsText, setBatchContentsText] = useState("");
  const [batchContentRows, setBatchContentRows] = useState<BulkInventoryRow[]>(
    [],
  );
  const [photoItemName, setPhotoItemName] = useState("");
  const [photoItemQuantity, setPhotoItemQuantity] = useState("1");
  const [photoItemCategory, setPhotoItemCategory] = useState("");
  const [photoItemNotes, setPhotoItemNotes] = useState("");
  const [queuePhotoIds, setQueuePhotoIds] = useState<Id<"itemPhotos">[]>([]);
  const [queueInstructions, setQueueInstructions] = useState("");
  const [creatingQuickItem, setCreatingQuickItem] = useState(false);
  const [creatingBatchContents, setCreatingBatchContents] = useState(false);
  const [creatingQueueEntry, setCreatingQueueEntry] = useState(false);
  const [creatingPhotoItem, setCreatingPhotoItem] = useState(false);
  const [savingBoxEstimates, setSavingBoxEstimates] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const openedFromLoadPlan = returnTo === "load-plan";
  const displayedBoxCode = boxRecord ? boxRecord.box.code : "this box";
  const pageTitle = openedFromLoadPlan ? "Open box" : "Box lookup";
  const pageDescription = openedFromLoadPlan
    ? `Add visible contents and photos while ${displayedBoxCode} is open. Everything you add here stays packed in ${displayedBoxCode}.`
    : "QR labels resolve here after sign-in and permission checks.";
  const primaryBackHref =
    openedFromLoadPlan && moveId
      ? moveWorkspaceAnchorPath(moveId, "#load-plan")
      : moveBoxesPath(moveId);
  const primaryBackLabel = openedFromLoadPlan ? "Load plan" : "Boxes";
  const batchContentSummary = summarizeBatchContentRows(batchContentRows);

  async function createPackedItemInsideBox({
    itemName,
    quantityText,
    category,
    notes,
    photoId,
  }: {
    itemName: string;
    quantityText: string;
    category: string;
    notes: string;
    photoId?: Id<"itemPhotos">;
  }) {
    if (!resolvedHouseholdId || !resolvedMoveId || !boxRecord) {
      return;
    }

    if (!itemName) {
      return;
    }

    const quantity = parseOptionalNumber(quantityText) ?? 1;
    const cleanNotes = notes.trim();
    const itemId = await createItem({
      householdId: resolvedHouseholdId,
      moveId: resolvedMoveId,
      name: itemName,
      room: boxRecord.box.room ?? undefined,
      destinationRoom: boxRecord.box.destinationRoom ?? undefined,
      ...(boxRecord.box.destinationSpaceId
        ? { destinationSpaceId: boxRecord.box.destinationSpaceId }
        : {}),
      category: category.trim() || undefined,
      description:
        cleanNotes ||
        (photoId
          ? `Created from a photo while opening ${boxRecord.box.code}.`
          : `Created while opening ${boxRecord.box.code}.`),
      disposition: "mover",
      status: "packed",
      quantity,
      needsReview: true,
      reviewFlags: photoId
        ? ["boxContentsReview", "photoEvidenceReview"]
        : ["boxContentsReview"],
      aiTags: photoId
        ? ["box-content-capture", "photo-created-item"]
        : ["box-content-capture"],
      createdVia: "manual",
    });
    await addItem({
      householdId: resolvedHouseholdId,
      moveId: resolvedMoveId,
      boxId: boxRecord.box._id,
      itemId,
      quantity,
    });

    if (photoId) {
      await updatePhoto({
        householdId: resolvedHouseholdId,
        moveId: resolvedMoveId,
        photoId,
        itemId,
        boxId: boxRecord.box._id,
        room: boxRecord.box.room,
        caption: itemName,
        photoType: "item",
        notes:
          cleanNotes ||
          `Created ${itemName} from a photo while opening ${boxRecord.box.code}.`,
      });
    }

    return itemId;
  }

  async function handleQuickItemSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!boxRecord) {
      return;
    }

    const itemName = quickItemName.trim();
    if (!itemName) {
      return;
    }

    setCreatingQuickItem(true);
    setMessage(null);
    try {
      await createPackedItemInsideBox({
        itemName,
        quantityText: quickItemQuantity,
        category: quickItemCategory,
        notes: quickItemNotes,
      });
      setQuickItemName("");
      setQuickItemQuantity("1");
      setQuickItemCategory("");
      setQuickItemNotes("");
      setMessage(`${itemName} added to ${boxRecord.box.code}.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : `Could not add that item to ${boxRecord.box.code}.`,
      );
    } finally {
      setCreatingQuickItem(false);
    }
  }

  function handleParseBatchContents() {
    setBatchContentRows(parseBoxContentText(batchContentsText));
  }

  function updateBatchContentRow(
    rowId: string,
    patch: Partial<BulkInventoryRow>,
  ) {
    setBatchContentRows((currentRows) =>
      currentRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    );
  }

  async function handleCreateBatchContents() {
    if (!boxRecord) {
      return;
    }
    const selectedRows = batchContentRows.filter(
      (row) => row.selected && row.name.trim(),
    );
    if (!selectedRows.length) {
      return;
    }

    setCreatingBatchContents(true);
    setMessage(null);
    const savedRowIds: string[] = [];
    try {
      for (const row of selectedRows) {
        await createPackedItemInsideBox({
          itemName: row.name.trim(),
          quantityText: row.quantity,
          category: row.category,
          notes: row.description,
        });
        savedRowIds.push(row.id);
      }

      setBatchContentsText("");
      setBatchContentRows([]);
      setMessage(
        `${selectedRows.length} ${selectedRows.length === 1 ? "item was" : "items were"} added to ${boxRecord.box.code}.`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : `Could not add all contents to ${boxRecord.box.code}.`;
      if (savedRowIds.length) {
        const remainingCount = selectedRows.length - savedRowIds.length;
        setBatchContentRows((currentRows) =>
          currentRows.filter((row) => !savedRowIds.includes(row.id)),
        );
        setMessage(
          `${savedRowIds.length} ${savedRowIds.length === 1 ? "item was" : "items were"} added before the batch stopped. ${remainingCount} ${remainingCount === 1 ? "row still needs" : "rows still need"} review before retry. ${errorMessage}`,
        );
      } else {
        setMessage(
          `No batch contents were added to ${boxRecord.box.code}. Review the rows and try again. ${errorMessage}`,
        );
      }
    } finally {
      setCreatingBatchContents(false);
    }
  }

  async function handlePhotoItemUploaded(photo: { photoId: Id<"itemPhotos"> }) {
    if (!boxRecord) {
      return;
    }

    const itemName = photoItemName.trim();
    if (!itemName) {
      setMessage("Name the item before uploading a box-content photo.");
      return;
    }

    setCreatingPhotoItem(true);
    setMessage(null);
    try {
      await createPackedItemInsideBox({
        itemName,
        quantityText: photoItemQuantity,
        category: photoItemCategory,
        notes: photoItemNotes,
        photoId: photo.photoId,
      });
      setPhotoItemName("");
      setPhotoItemQuantity("1");
      setPhotoItemCategory("");
      setPhotoItemNotes("");
      setMessage(`${itemName} created inside ${boxRecord.box.code}.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : `Could not create that item inside ${boxRecord.box.code}.`,
      );
    } finally {
      setCreatingPhotoItem(false);
    }
  }

  function handleQueuePhotoUploaded(photo: { photoId: Id<"itemPhotos"> }) {
    setQueuePhotoIds((current) =>
      current.includes(photo.photoId) ? current : [...current, photo.photoId],
    );
    setMessage(
      `Photo ready for AI itemization in ${boxRecord?.box.code ?? "this box"}.`,
    );
  }

  async function handleCreatePhotoQueueEntry() {
    if (!resolvedHouseholdId || !resolvedMoveId || !boxRecord) {
      return;
    }
    if (queuePhotoIds.length === 0) {
      setMessage(
        "Upload one or more box-content photos before queueing AI work.",
      );
      return;
    }

    setCreatingQueueEntry(true);
    setMessage(null);
    const photoCount = queuePhotoIds.length;
    try {
      await createQueueEntry({
        householdId: resolvedHouseholdId,
        moveId: resolvedMoveId,
        instructions: buildBoxPhotoQueueInstructions({
          boxCode: boxRecord.box.code,
          boxId: boxRecord.box._id,
          room: boxRecord.box.room,
          destinationRoom: boxRecord.box.destinationRoom,
          estimateSummary: buildBoxEstimateInstructionSummary(boxRecord.box),
          extraInstructions: queueInstructions,
        }),
        ...(boxRecord.box.room ? { roomHint: boxRecord.box.room } : {}),
        dispositionHint: "mover",
        scopeHint: "packing",
        intent: "boxContents",
        targetBoxId: boxRecord.box._id,
        targetBoxCode: boxRecord.box.code,
        targetLabel:
          boxRecord.box.label ??
          `${boxRecord.box.code} open box contents`,
        mediaPhotoIds: queuePhotoIds,
      });
      setQueuePhotoIds([]);
      setQueueInstructions("");
      setMessage(
        `${photoCount} photo${photoCount === 1 ? "" : "s"} from ${boxRecord.box.code} queued for AI itemization.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : `Could not queue photos from ${boxRecord.box.code} for AI.`,
      );
    } finally {
      setCreatingQueueEntry(false);
    }
  }

  async function handleBoxEstimateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resolvedHouseholdId || !resolvedMoveId || !boxRecord) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const parsedWeight = parseOptionalNumber(
      String(formData.get("estimatedWeightLb") ?? ""),
    );
    const parsedDimensions = buildDimensionsPatch({
      lengthIn: String(formData.get("boxLengthIn") ?? ""),
      widthIn: String(formData.get("boxWidthIn") ?? ""),
      heightIn: String(formData.get("boxHeightIn") ?? ""),
    });
    const parsedVolume =
      parseOptionalNumber(String(formData.get("estimatedVolumeCuFt") ?? "")) ??
      calculateMovableUnitVolumeCuFt(parsedDimensions);

    if (
      parsedWeight === undefined &&
      parsedDimensions === undefined &&
      parsedVolume === undefined
    ) {
      setMessage(
        `Add a weight, dimension, or volume before saving ${boxRecord.box.code}.`,
      );
      return;
    }

    setSavingBoxEstimates(true);
    setMessage(null);
    try {
      await updateBox({
        householdId: resolvedHouseholdId,
        moveId: resolvedMoveId,
        boxId: boxRecord.box._id,
        ...(parsedWeight !== undefined
          ? { estimatedWeightLb: parsedWeight }
          : {}),
        ...(parsedDimensions !== undefined
          ? { dimensionsIn: parsedDimensions }
          : {}),
        ...(parsedVolume !== undefined
          ? { estimatedVolumeCuFt: parsedVolume }
          : {}),
      });
      setMessage(`${boxRecord.box.code} estimates updated.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : `Could not update estimates for ${boxRecord.box.code}.`,
      );
    } finally {
      setSavingBoxEstimates(false);
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">{pageTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {pageDescription}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={primaryBackHref}>
              <ArrowLeft aria-hidden="true" />
              {primaryBackLabel}
            </Link>
          </Button>
          {openedFromLoadPlan ? (
            <Button asChild variant="ghost">
              <Link href={moveBoxesPath(moveId)}>
                <Boxes aria-hidden="true" />
                Boxes
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {!householdId || !moveId ? (
        <Card>
          <CardHeader>
            <CardTitle>Missing lookup context</CardTitle>
            <CardDescription>
              Use the label generated from the box manager.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : boxRecord === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-4/5" />
        </div>
      ) : boxRecord ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Boxes className="size-5 text-primary" aria-hidden="true" />
              <CardTitle>{boxRecord.box.code}</CardTitle>
              <Badge variant="outline">{boxRecord.box.status}</Badge>
            </div>
            <CardDescription>
              {boxRecord.box.label ?? boxRecord.box.description ?? "Box"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {openedFromLoadPlan ? (
              <div className="flex items-start gap-2 rounded-md border border-primary/25 bg-primary/5 p-3 text-sm">
                <Truck
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <p className="leading-6 text-muted-foreground">
                  This is the existing rough box from the load plan. Add quick
                  contents, create one photo-backed item, or queue several open
                  box photos for AI without creating a replacement box.
                </p>
              </div>
            ) : null}
            {openedFromLoadPlan ? (
              <OpenBoxProgressSummary
                box={boxRecord.box}
                itemCount={boxRecord.itemCount}
                weightSummary={boxRecord.weightSummary}
              />
            ) : null}
            {openedFromLoadPlan ? (
              <div className="rounded-md border border-border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ClipboardPaste
                        className="size-4 text-primary"
                        aria-hidden="true"
                      />
                      Paste this into your assistant
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Use this when you are standing at the open box and want
                      the assistant to create contents inside this existing
                      rough box.
                    </p>
                  </div>
                  <CopyTextButton
                    text={buildOpenBoxAssistantPrompt({
                      boxCode: boxRecord.box.code,
                      boxId: boxRecord.box._id,
                      householdId: resolvedHouseholdId,
                      moveId: resolvedMoveId,
                      room: boxRecord.box.room,
                      destinationRoom: boxRecord.box.destinationRoom,
                    })}
                    label="Copy box handoff"
                    ariaLabel={`Copy assistant handoff for ${boxRecord.box.code}`}
                  />
                </div>
              </div>
            ) : null}
            {message ? (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
                role="status"
              >
                <span>{message}</span>
                {openedFromLoadPlan ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={primaryBackHref}>Review load plan</Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Room</p>
                <p className="font-medium">
                  {boxRecord.box.room ?? "unassigned"}
                </p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Destination</p>
                <p className="font-medium">
                  {boxRecord.box.destinationRoom ?? "unassigned"}
                </p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Items</p>
                <p className="font-medium">{boxRecord.itemCount}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Weight</p>
                <p className="font-medium">
                  {formatBoxWeightValue(boxRecord.weightSummary)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatBoxWeightSource(boxRecord.weightSummary)}
                </p>
              </div>
            </div>

            {openedFromLoadPlan ? (
              <OpenBoxActionShortcuts boxCode={boxRecord.box.code} />
            ) : null}

            <form
              id="box-estimates"
              className="scroll-mt-20 rounded-md border border-border bg-muted/20 p-3"
              onSubmit={(event) => void handleBoxEstimateSubmit(event)}
            >
              <div className="mb-3 flex items-start gap-2">
                <Ruler
                  className="mt-0.5 size-4 text-primary"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium">Box estimates</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Fill these while the rough box is open so the load plan has
                    weight, size, and volume before every item is fully named.
                  </p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <Input
                  name="estimatedWeightLb"
                  defaultValue={formatOptionalNumber(
                    boxRecord.box.estimatedWeightLb,
                  )}
                  inputMode="decimal"
                  placeholder="Weight lb"
                  aria-label={`Estimated weight for ${boxRecord.box.code}`}
                  disabled={savingBoxEstimates}
                />
                <Input
                  name="boxLengthIn"
                  defaultValue={formatOptionalNumber(
                    boxRecord.box.dimensionsIn?.lengthIn,
                  )}
                  inputMode="decimal"
                  placeholder="Length in"
                  aria-label={`Length in inches for ${boxRecord.box.code}`}
                  disabled={savingBoxEstimates}
                />
                <Input
                  name="boxWidthIn"
                  defaultValue={formatOptionalNumber(
                    boxRecord.box.dimensionsIn?.widthIn,
                  )}
                  inputMode="decimal"
                  placeholder="Width in"
                  aria-label={`Width in inches for ${boxRecord.box.code}`}
                  disabled={savingBoxEstimates}
                />
                <Input
                  name="boxHeightIn"
                  defaultValue={formatOptionalNumber(
                    boxRecord.box.dimensionsIn?.heightIn,
                  )}
                  inputMode="decimal"
                  placeholder="Height in"
                  aria-label={`Height in inches for ${boxRecord.box.code}`}
                  disabled={savingBoxEstimates}
                />
                <Input
                  name="estimatedVolumeCuFt"
                  defaultValue={formatOptionalNumber(
                    boxRecord.box.estimatedVolumeCuFt,
                  )}
                  inputMode="decimal"
                  placeholder="Volume cu ft"
                  aria-label={`Estimated volume for ${boxRecord.box.code}`}
                  disabled={savingBoxEstimates}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-5 text-muted-foreground">
                  Leave volume blank when length, width, and height are known;
                  MovingManifest will save the calculated cubic feet.
                </p>
                <Button type="submit" disabled={savingBoxEstimates}>
                  {savingBoxEstimates ? "Saving..." : "Save box estimates"}
                </Button>
              </div>
            </form>

            <form
              id="quick-box-item"
              className="scroll-mt-20 rounded-md border border-border bg-card p-3"
              onSubmit={(event) => void handleQuickItemSubmit(event)}
            >
              <div className="mb-3 flex items-start gap-2">
                <PackageCheck
                  className="mt-0.5 size-4 text-primary"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium">Add item by name</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Add a visible box content without a photo. It will be packed
                    into {boxRecord.box.code}.
                  </p>
                </div>
              </div>
              <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_88px]">
                <Input
                  value={quickItemName}
                  onChange={(event) => setQuickItemName(event.target.value)}
                  placeholder="Item name"
                  aria-label={`Quick item name inside ${boxRecord.box.code}`}
                  disabled={creatingQuickItem}
                />
                <Input
                  value={quickItemQuantity}
                  inputMode="decimal"
                  onChange={(event) => setQuickItemQuantity(event.target.value)}
                  placeholder="Qty"
                  aria-label={`Quick item quantity inside ${boxRecord.box.code}`}
                  disabled={creatingQuickItem}
                />
              </div>
              <Input
                className="mb-2"
                value={quickItemCategory}
                onChange={(event) => setQuickItemCategory(event.target.value)}
                placeholder="Category (optional)"
                aria-label={`Quick item category inside ${boxRecord.box.code}`}
                disabled={creatingQuickItem}
              />
              <Textarea
                className="mb-3"
                value={quickItemNotes}
                onChange={(event) => setQuickItemNotes(event.target.value)}
                placeholder="Notes from the open box (optional)"
                aria-label={`Quick item notes inside ${boxRecord.box.code}`}
                disabled={creatingQuickItem}
              />
              <Button
                type="submit"
                disabled={!quickItemName.trim() || creatingQuickItem}
              >
                {creatingQuickItem ? "Adding..." : "Add to box"}
              </Button>
            </form>

            <div
              id="box-content-list"
              className="scroll-mt-20 rounded-md border border-border bg-card p-3"
            >
              <div className="mb-3 flex items-start gap-2">
                <ClipboardPaste
                  className="mt-0.5 size-4 text-primary"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium">
                    Add several contents from a list
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Use this after opening a rough box and naming a handful of
                    contents. Every selected row will be created as a packed
                    item inside {boxRecord.box.code}.
                  </p>
                </div>
              </div>
              <Textarea
                className="min-h-24"
                value={batchContentsText}
                onChange={(event) => setBatchContentsText(event.target.value)}
                placeholder="Socket set, 3 circular saw blades, router bits | Tools | 2"
                aria-label={`Batch contents list for ${boxRecord.box.code}`}
                disabled={creatingBatchContents}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-5 text-muted-foreground">
                  Supports comma-separated notes or columns like Item | Category
                  | Qty | Notes. Names like{" "}
                  <code className="rounded-sm bg-muted px-1 py-0.5">
                    3 circular saw blades
                  </code>{" "}
                  become quantity 3 automatically.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      !batchContentsText.trim() || creatingBatchContents
                    }
                    onClick={handleParseBatchContents}
                  >
                    Parse contents
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      creatingBatchContents ||
                      !batchContentRows.some(
                        (row) => row.selected && row.name.trim(),
                      )
                    }
                    onClick={() => void handleCreateBatchContents()}
                  >
                    {creatingBatchContents ? "Adding..." : "Add selected"}
                  </Button>
                </div>
              </div>

              {batchContentRows.length ? (
                <>
                  <div
                    className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3"
                    aria-label={`Parsed contents summary for ${boxRecord.box.code}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        Ready to add to {boxRecord.box.code}
                      </p>
                      <Badge variant="outline">
                        {batchContentSummary.selectedCount} selected
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <BoxLookupMetric
                        label="Selected"
                        value={batchContentSummary.selectedCount}
                      />
                      <BoxLookupMetric
                        label="Total qty"
                        value={formatOptionalNumber(
                          batchContentSummary.totalQuantity,
                        )}
                      />
                      <BoxLookupMetric
                        label="Categorized"
                        value={batchContentSummary.categorizedCount}
                      />
                      <BoxLookupMetric
                        label="With notes"
                        value={batchContentSummary.notesCount}
                      />
                    </div>
                    {batchContentSummary.emptySelectedNames ? (
                      <p className="mt-2 text-xs leading-5 text-amber-600 dark:text-amber-400">
                        {batchContentSummary.emptySelectedNames} selected row
                        {batchContentSummary.emptySelectedNames === 1
                          ? ""
                          : "s"}{" "}
                        need an item name before saving.
                      </p>
                    ) : (
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        Review the rows below, then add the selected contents
                        into this existing box.
                      </p>
                    )}
                  </div>
                  <ParsedBoxContentMobileCards
                    boxCode={boxRecord.box.code}
                    disabled={creatingBatchContents}
                    rows={batchContentRows}
                    onUpdateRow={updateBatchContentRow}
                  />
                  <div className="mt-3 hidden overflow-x-auto rounded-md border border-border md:block">
                    <table
                      className="w-full min-w-[680px] text-left text-sm"
                      aria-label={`Parsed contents for ${boxRecord.box.code}`}
                    >
                      <thead className="bg-muted/35 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="w-14 px-3 py-2 font-medium">Use</th>
                          <th className="px-3 py-2 font-medium">Item</th>
                          <th className="w-24 px-3 py-2 font-medium">Qty</th>
                          <th className="w-40 px-3 py-2 font-medium">
                            Category
                          </th>
                          <th className="px-3 py-2 font-medium">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchContentRows.map((row) => (
                          <tr key={row.id} className="border-t border-border">
                            <td className="px-3 py-2 align-top">
                              <input
                                type="checkbox"
                                className="size-3.5 accent-primary"
                                checked={row.selected}
                                aria-label={`Use parsed content ${row.name}`}
                                disabled={creatingBatchContents}
                                onChange={(event) =>
                                  updateBatchContentRow(row.id, {
                                    selected: event.target.checked,
                                  })
                                }
                              />
                            </td>
                            <td className="px-3 py-2 align-top">
                              <Input
                                value={row.name}
                                className="h-8 text-xs"
                                aria-label={`Parsed content name ${row.id}`}
                                disabled={creatingBatchContents}
                                onChange={(event) =>
                                  updateBatchContentRow(row.id, {
                                    name: event.target.value,
                                  })
                                }
                              />
                            </td>
                            <td className="px-3 py-2 align-top">
                              <Input
                                value={row.quantity}
                                className="h-8 text-xs"
                                inputMode="decimal"
                                aria-label={`Parsed content quantity ${row.name}`}
                                disabled={creatingBatchContents}
                                onChange={(event) =>
                                  updateBatchContentRow(row.id, {
                                    quantity: event.target.value,
                                  })
                                }
                              />
                            </td>
                            <td className="px-3 py-2 align-top">
                              <Input
                                value={row.category}
                                className="h-8 text-xs"
                                aria-label={`Parsed content category ${row.name}`}
                                disabled={creatingBatchContents}
                                onChange={(event) =>
                                  updateBatchContentRow(row.id, {
                                    category: event.target.value,
                                  })
                                }
                              />
                            </td>
                            <td className="px-3 py-2 align-top">
                              <Input
                                value={row.description}
                                className="h-8 text-xs"
                                aria-label={`Parsed content notes ${row.name}`}
                                disabled={creatingBatchContents}
                                onChange={(event) =>
                                  updateBatchContentRow(row.id, {
                                    description: event.target.value,
                                  })
                                }
                              />
                              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                                {row.sourceLine}
                              </p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>

            <div
              id="box-photo-item"
              className="scroll-mt-20 rounded-md border border-primary/25 bg-primary/5 p-3"
            >
              <div className="mb-3 flex items-start gap-2">
                <Camera
                  className="mt-0.5 size-4 text-primary"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium">Add item from photo</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Use this while the box is open. Name what you see, upload an
                    original photo, and it will be packed into{" "}
                    {boxRecord.box.code}.
                  </p>
                </div>
              </div>
              <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_88px]">
                <Input
                  value={photoItemName}
                  onChange={(event) => setPhotoItemName(event.target.value)}
                  placeholder="Item name"
                  aria-label={`Photo item name inside ${boxRecord.box.code}`}
                />
                <Input
                  value={photoItemQuantity}
                  inputMode="decimal"
                  onChange={(event) => setPhotoItemQuantity(event.target.value)}
                  placeholder="Qty"
                  aria-label={`Photo item quantity inside ${boxRecord.box.code}`}
                />
              </div>
              <Input
                className="mb-2"
                value={photoItemCategory}
                onChange={(event) => setPhotoItemCategory(event.target.value)}
                placeholder="Category (optional)"
                aria-label={`Photo item category inside ${boxRecord.box.code}`}
              />
              <Textarea
                className="mb-3"
                value={photoItemNotes}
                onChange={(event) => setPhotoItemNotes(event.target.value)}
                placeholder="Notes from the open box (optional)"
                aria-label={`Photo item notes inside ${boxRecord.box.code}`}
              />
              <PhotoUploadControl
                householdId={resolvedHouseholdId ?? null}
                moveId={resolvedMoveId ?? null}
                boxId={boxRecord.box._id}
                room={boxRecord.box.room}
                label={`Photo for new item in ${boxRecord.box.code}`}
                photoType="item"
                uploadDisabled={!photoItemName.trim() || creatingPhotoItem}
                uploadDisabledMessage={
                  creatingPhotoItem
                    ? "Creating the item and attaching the photo."
                    : "Enter an item name before uploading the photo."
                }
                onUploaded={(photo) => void handlePhotoItemUploaded(photo)}
              />
            </div>

            <div
              id="box-ai-photo-queue"
              className="scroll-mt-20 rounded-md border border-border bg-card p-3"
            >
              <div className="mb-3 flex items-start gap-2">
                <Images
                  className="mt-0.5 size-4 text-primary"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium">Queue box photos for AI</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Use this when the box is open but you do not want to name
                    every item yet. Upload several original photos, then queue
                    them so an assistant can create item records inside{" "}
                    {boxRecord.box.code}. The queue includes this box ID so the
                    assistant updates the existing box instead of replacing it.
                  </p>
                </div>
              </div>
              <Textarea
                className="mb-3"
                value={queueInstructions}
                onChange={(event) => setQueueInstructions(event.target.value)}
                placeholder={`Optional notes for the assistant about ${boxRecord.box.code}`}
                aria-label={`AI queue instructions for ${boxRecord.box.code}`}
              />
              <PhotoUploadControl
                householdId={resolvedHouseholdId ?? null}
                moveId={resolvedMoveId ?? null}
                boxId={boxRecord.box._id}
                room={boxRecord.box.room}
                label={`Box-content photos for ${boxRecord.box.code}`}
                photoType="boxContents"
                multiple
                uploadDisabled={creatingQueueEntry}
                uploadDisabledMessage="Queue creation is in progress."
                onUploaded={(photo) => handleQueuePhotoUploaded(photo)}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-5 text-muted-foreground">
                  {queuePhotoIds.length
                    ? `${queuePhotoIds.length} photo${
                        queuePhotoIds.length === 1 ? "" : "s"
                      } ready to queue.`
                    : "Upload box-content photos first; they will stay attached to this box."}
                </p>
                <Button
                  type="button"
                  onClick={() => void handleCreatePhotoQueueEntry()}
                  disabled={queuePhotoIds.length === 0 || creatingQueueEntry}
                >
                  {creatingQueueEntry
                    ? "Queueing..."
                    : "Queue for AI itemization"}
                </Button>
              </div>
            </div>

            <div
              id="recorded-box-contents"
              aria-label={`Recorded contents for ${boxRecord.box.code}`}
              className="scroll-mt-20 rounded-md border border-border"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <PackageCheck
                    className="size-4 text-primary"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium">Recorded contents</p>
                </div>
                <Badge variant="outline">
                  {boxRecord.itemCount} item
                  {boxRecord.itemCount === 1 ? "" : "s"}
                </Badge>
              </div>
              {boxRecord.contents.length ? (
                <div className="divide-y divide-border">
                  {boxRecord.contents.map((entry) =>
                    entry ? (
                      <div
                        key={entry.membership._id}
                        className="flex items-center justify-between gap-3 p-3 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{entry.item.name}</span>
                        </div>
                        <Badge variant="outline">
                          x{entry.membership.quantity}
                        </Badge>
                      </div>
                    ) : null,
                  )}
                </div>
              ) : (
                <div className="p-3 text-sm text-muted-foreground">
                  No contents recorded.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Box not found</CardTitle>
            <CardDescription>
              The box may have been archived or you may not have access.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

function ParsedBoxContentMobileCards({
  boxCode,
  disabled,
  rows,
  onUpdateRow,
}: {
  boxCode: string;
  disabled: boolean;
  rows: BulkInventoryRow[];
  onUpdateRow: (rowId: string, patch: Partial<BulkInventoryRow>) => void;
}) {
  return (
    <div
      className="mt-3 grid gap-2 md:hidden"
      aria-label={`Parsed contents mobile cards for ${boxCode}`}
    >
      {rows.map((row) => {
        const rowLabel = row.name || row.id;

        return (
          <div
            key={row.id}
            className="rounded-md border border-border bg-background/70 p-3"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <label className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-3.5 shrink-0 accent-primary"
                  checked={row.selected}
                  aria-label={`Mobile use parsed content ${rowLabel}`}
                  disabled={disabled}
                  onChange={(event) =>
                    onUpdateRow(row.id, {
                      selected: event.target.checked,
                    })
                  }
                />
                <span className="truncate">{rowLabel}</span>
              </label>
              <Badge variant="outline">Qty {row.quantity || "1"}</Badge>
            </div>
            <div className="grid gap-2">
              <Input
                value={row.name}
                aria-label={`Mobile parsed content name ${row.id}`}
                disabled={disabled}
                onChange={(event) =>
                  onUpdateRow(row.id, { name: event.target.value })
                }
              />
              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                <Input
                  value={row.quantity}
                  inputMode="decimal"
                  aria-label={`Mobile parsed content quantity ${rowLabel}`}
                  disabled={disabled}
                  onChange={(event) =>
                    onUpdateRow(row.id, { quantity: event.target.value })
                  }
                />
                <Input
                  value={row.category}
                  aria-label={`Mobile parsed content category ${rowLabel}`}
                  placeholder="Category"
                  disabled={disabled}
                  onChange={(event) =>
                    onUpdateRow(row.id, { category: event.target.value })
                  }
                />
              </div>
              <Input
                value={row.description}
                aria-label={`Mobile parsed content notes ${rowLabel}`}
                placeholder="Notes"
                disabled={disabled}
                onChange={(event) =>
                  onUpdateRow(row.id, { description: event.target.value })
                }
              />
              <p className="text-[11px] leading-4 text-muted-foreground">
                {row.sourceLine}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OpenBoxProgressSummary({
  box,
  itemCount,
  weightSummary,
}: {
  box: Doc<"boxes">;
  itemCount: number;
  weightSummary: {
    valueLb?: number;
    label?: string;
    source?: string;
  } | undefined;
}) {
  const dimensions = formatDimensionsForInstruction(box.dimensionsIn);
  const calculatedVolume = calculateMovableUnitVolumeCuFt(box.dimensionsIn);
  const knownVolume = box.estimatedVolumeCuFt ?? calculatedVolume;
  const weightKnown =
    box.actualWeightLb !== undefined ||
    box.estimatedWeightLb !== undefined ||
    weightSummary?.valueLb !== undefined;
  const dimensionKnown = Boolean(dimensions);
  const volumeKnown = knownVolume !== undefined;
  const estimateGaps = [
    weightKnown ? null : "weight",
    dimensionKnown ? null : "dimensions",
    volumeKnown ? null : "volume",
  ].filter((gap): gap is string => Boolean(gap));
  const checklist = [
    {
      label: "Contents",
      value: `${itemCount} item${itemCount === 1 ? "" : "s"}`,
      detail:
        itemCount > 0
          ? "Already tied to this box."
          : "Add names, photos, or queue AI.",
      complete: itemCount > 0,
      href: itemCount > 0 ? "#recorded-box-contents" : "#quick-box-item",
    },
    {
      label: "Weight",
      value: formatBoxWeightValue(weightSummary),
      detail: formatBoxWeightSource(weightSummary),
      complete: weightKnown,
      href: "#box-estimates",
    },
    {
      label: "Dimensions",
      value: dimensions ?? "Missing dimensions",
      detail: dimensionKnown ? "Ready for load fit." : "Length, width, height.",
      complete: dimensionKnown,
      href: "#box-estimates",
    },
    {
      label: "Volume",
      value:
        knownVolume !== undefined
          ? `${formatOptionalNumber(knownVolume)} cu ft`
          : "Missing volume",
      detail:
        box.estimatedVolumeCuFt !== undefined
          ? "Saved estimate."
          : calculatedVolume !== undefined
            ? "Calculated from dimensions."
            : "Save dimensions or volume.",
      complete: volumeKnown,
      href: "#box-estimates",
    },
  ];

  return (
    <section
      aria-label={`Open-box progress for ${box.code}`}
      className="rounded-md border border-border bg-muted/20 p-3"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Open-box checklist</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Use this while {box.code} is open to see what still needs capture
            before returning to the load plan.
          </p>
        </div>
        <Badge variant={estimateGaps.length ? "outline" : "default"}>
          {estimateGaps.length
            ? `${estimateGaps.length} estimate gap${estimateGaps.length === 1 ? "" : "s"}`
            : "load-plan ready"}
        </Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {checklist.map((item) => (
          <a
            key={item.label}
            href={item.href}
            aria-label={`${item.label}: ${item.value}`}
            className="group flex min-w-0 items-start gap-2 rounded-md border border-border bg-background/65 p-3 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.complete ? (
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
            ) : (
              <CircleAlert
                className="mt-0.5 size-4 shrink-0 text-amber-500"
                aria-hidden="true"
              />
            )}
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">
                {item.label}
              </span>
              <span className="block truncate font-medium text-foreground">
                {item.value}
              </span>
              <span className="block text-xs leading-5 text-muted-foreground">
                {item.detail}
              </span>
            </span>
          </a>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        {estimateGaps.length
          ? `${box.code} still needs ${estimateGaps.join(", ")} before the load plan is fully useful.`
          : `${box.code} has enough estimates for load planning; keep adding contents or photos as needed.`}
      </p>
    </section>
  );
}

function OpenBoxActionShortcuts({ boxCode }: { boxCode: string }) {
  const actions = [
    {
      href: "#box-estimates",
      label: "Estimates",
      description: "Weight and size",
      icon: Ruler,
    },
    {
      href: "#quick-box-item",
      label: "Add item",
      description: "Name only",
      icon: PackageCheck,
    },
    {
      href: "#box-content-list",
      label: "Paste list",
      description: "Several contents",
      icon: ClipboardPaste,
    },
    {
      href: "#box-photo-item",
      label: "Photo item",
      description: "One named photo",
      icon: Camera,
    },
    {
      href: "#box-ai-photo-queue",
      label: "AI photos",
      description: "Queue several",
      icon: Images,
    },
    {
      href: "#recorded-box-contents",
      label: "Contents",
      description: "Recorded items",
      icon: Boxes,
    },
  ];

  return (
    <nav
      aria-label={`Open box actions for ${boxCode}`}
      className="rounded-md border border-border bg-card p-3"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Jump to box task</p>
        <Badge variant="outline">{boxCode}</Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;

          return (
            <a
              key={action.href}
              href={action.href}
              className="group flex min-w-0 items-center gap-2 rounded-md border border-border bg-background/65 px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block font-medium text-foreground">
                  {action.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {action.description}
                </span>
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function BoxLookupMetric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div
      className="rounded-md border border-border bg-background/70 px-3 py-2"
      aria-label={`${label}: ${value}`}
    >
      <div className="font-mono text-base font-semibold leading-none">
        {value}
      </div>
      <div className="mt-1 text-[11px] uppercase text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

export function buildOpenBoxAssistantPrompt({
  boxCode,
  boxId,
  householdId,
  moveId,
  room,
  destinationRoom,
}: {
  boxCode: string;
  boxId: Id<"boxes">;
  householdId?: Id<"households">;
  moveId?: Id<"moves">;
  room?: string;
  destinationRoom?: string;
}) {
  return [
    "Open https://movingmanifest.com/ai and help me itemize this existing rough box.",
    `Use existing box ${boxCode} with boxId ${boxId}. Do not create a replacement box.`,
    householdId ? `Household context: ${householdId}.` : "",
    moveId ? `Move context: ${moveId}.` : "",
    room ? `Origin room hint: ${room}.` : "",
    destinationRoom ? `Destination room hint: ${destinationRoom}.` : "",
    "If I give one photo plus a name, use add_box_item_from_photo for this box.",
    "If I name several contents from the open box, use batch_add_box_contents for this box.",
    "If I upload several box-content photos for later AI work, keep the queue tied to this boxId.",
    "Mark uncertain names, quantities, condition, weight, dimensions, and disposition for review.",
    "After writing, verify with get_move_summary or get_agent_context and tell me what changed.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildBoxPhotoQueueInstructions({
  boxCode,
  boxId,
  room,
  destinationRoom,
  estimateSummary,
  extraInstructions,
}: {
  boxCode: string;
  boxId: Id<"boxes">;
  room?: string;
  destinationRoom?: string;
  estimateSummary?: string;
  extraInstructions?: string;
}) {
  const details = [
    `Open existing box ${boxCode} (${boxId}) and itemize the box-content photos attached to this queue entry.`,
    "Before processing, use agent_workbench mode=intakeQueue so the workflow stays in the captured-work lane.",
    "Create item records for visible contents. Attach relevant queue media to each item with attachMediaPhotoIds.",
    "When submitting queue results, prefer committedItems plus boxAssignments that target this existing box.",
    "If this work is handled outside ingestion_queue submitResults, use batch_add_box_contents for several named contents in this same box.",
    `Pack created items into this same existing box with boxAssignments using boxId ${boxId} or boxCode ${boxCode}. Do not create a replacement box.`,
    "Mark uncertain item names, quantities, condition, weight, dimensions, and disposition for review instead of guessing aggressively.",
  ];

  if (estimateSummary) {
    details.push(`Current box planning context: ${estimateSummary}`);
  }

  if (room) {
    details.push(`Origin/current room hint: ${room}.`);
  }
  if (destinationRoom) {
    details.push(`Destination room hint: ${destinationRoom}.`);
  }

  const cleanExtra = extraInstructions?.trim();
  if (cleanExtra) {
    details.push(`User notes: ${cleanExtra}`);
  }

  return details.join("\n");
}

function buildDimensionsPatch({
  lengthIn,
  widthIn,
  heightIn,
}: {
  lengthIn: string;
  widthIn: string;
  heightIn: string;
}) {
  const dimensions: {
    lengthIn?: number;
    widthIn?: number;
    heightIn?: number;
  } = {};
  const parsedLength = parseOptionalNumber(lengthIn);
  const parsedWidth = parseOptionalNumber(widthIn);
  const parsedHeight = parseOptionalNumber(heightIn);

  if (parsedLength !== undefined) dimensions.lengthIn = parsedLength;
  if (parsedWidth !== undefined) dimensions.widthIn = parsedWidth;
  if (parsedHeight !== undefined) dimensions.heightIn = parsedHeight;

  return Object.keys(dimensions).length ? dimensions : undefined;
}

function parseBoxContentText(text: string): BulkInventoryRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) {
    return [];
  }

  if (lines.some((line) => line.includes("\t") || line.includes("|"))) {
    const delimiter = lines.some((line) => line.includes("\t")) ? "\t" : "|";
    const splitRows = lines.map((line) =>
      line.split(delimiter).map((cell) => cleanBoxContentCell(cell)),
    );
    const header = splitRows[0].map(normalizeBoxContentHeader);
    const hasHeader = header.some(Boolean);
    const rows = hasHeader ? splitRows.slice(1) : splitRows;

    return rows
      .map((cells, index) => {
        const sourceLine = lines[hasHeader ? index + 1 : index];
        const values: Partial<BulkInventoryRow> = hasHeader
          ? cells.reduce<Partial<BulkInventoryRow>>((accumulator, cell, i) => {
              const key = header[i];
              if (key) accumulator[key] = cell;
              return accumulator;
            }, {})
          : {
              ...boxContentValuesFromCells(cells),
            };
        return boxContentRowFromValues(index, {
          ...values,
          sourceLine,
        });
      })
      .filter((row): row is BulkInventoryRow => Boolean(row));
  }

  return parseBulkInventoryText(text).map((row) => ({ ...row, room: "" }));
}

function summarizeBatchContentRows(rows: BulkInventoryRow[]) {
  return rows.reduce(
    (summary, row) => {
      if (!row.selected) {
        return summary;
      }

      const cleanName = row.name.trim();
      if (!cleanName) {
        summary.emptySelectedNames += 1;
        return summary;
      }

      summary.selectedCount += 1;
      summary.totalQuantity += parseOptionalNumber(row.quantity) ?? 1;
      if (row.category.trim()) {
        summary.categorizedCount += 1;
      }
      if (row.description.trim()) {
        summary.notesCount += 1;
      }

      return summary;
    },
    {
      selectedCount: 0,
      totalQuantity: 0,
      categorizedCount: 0,
      notesCount: 0,
      emptySelectedNames: 0,
    },
  );
}

function boxContentRowFromValues(
  index: number,
  values: Partial<BulkInventoryRow> & { sourceLine: string },
): BulkInventoryRow | null {
  const rawName = cleanBoxContentCell(values.name ?? "");
  const rawQuantity = cleanBoxContentCell(values.quantity ?? "");
  const parsedName = parseBoxContentQuantityPrefix(rawName);
  const normalizedQuantity = normalizeBoxContentQuantity(rawQuantity);
  const name = rawQuantity ? rawName : parsedName.name;
  if (!name) {
    return null;
  }

  return {
    id: `box-content-${index}`,
    selected: true,
    name,
    room: "",
    category: cleanBoxContentCell(values.category ?? ""),
    disposition: "mover",
    quantity: normalizedQuantity ?? (rawQuantity || parsedName.quantity),
    description: cleanBoxContentCell(values.description ?? ""),
    sourceLine: values.sourceLine,
  };
}

function boxContentValuesFromCells(cells: string[]) {
  const possibleThirdValue = cleanBoxContentCell(cells[2] ?? "");
  const thirdCellIsQuantity = Boolean(
    normalizeBoxContentQuantity(possibleThirdValue),
  );

  return {
    name: cells[0],
    category: cells[1],
    quantity: thirdCellIsQuantity ? cells[2] : cells[3],
    description: thirdCellIsQuantity ? cells[3] : cells[2],
  };
}

const boxContentNumberWords = new Map([
  ["one", "1"],
  ["two", "2"],
  ["three", "3"],
  ["four", "4"],
  ["five", "5"],
  ["six", "6"],
  ["seven", "7"],
  ["eight", "8"],
  ["nine", "9"],
  ["ten", "10"],
  ["a", "1"],
  ["an", "1"],
]);

function parseBoxContentQuantityPrefix(value: string) {
  const cleaned = cleanBoxContentCell(value);
  const match = cleaned.match(
    /^(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\s+(.+)$/i,
  );

  if (!match) {
    return { quantity: "1", name: cleaned };
  }

  const quantity = normalizeBoxContentQuantity(match[1]);
  return {
    quantity: quantity ?? "1",
    name: cleanBoxContentCell(match[2]),
  };
}

function normalizeBoxContentQuantity(value: string) {
  const cleaned = cleanBoxContentCell(value);
  if (!cleaned) {
    return undefined;
  }

  const wordQuantity = boxContentNumberWords.get(cleaned.toLowerCase());
  if (wordQuantity) {
    return wordQuantity;
  }

  return parseOptionalNumber(cleaned) !== undefined ? cleaned : undefined;
}

function cleanBoxContentCell(value: string) {
  return value
    .trim()
    .replace(/^[-*•]\s*/, "")
    .replace(/\s+/g, " ");
}

function normalizeBoxContentHeader(value: string) {
  switch (value.trim().toLowerCase()) {
    case "item":
    case "items":
    case "name":
      return "name";
    case "category":
    case "type":
      return "category";
    case "qty":
    case "quantity":
    case "count":
      return "quantity";
    case "note":
    case "notes":
    case "description":
      return "description";
    default:
      return undefined;
  }
}

function buildBoxEstimateInstructionSummary(box: Doc<"boxes">) {
  const details: string[] = [];
  const missing: string[] = [];
  const weight = box.actualWeightLb ?? box.estimatedWeightLb;
  const dimensions = formatDimensionsForInstruction(box.dimensionsIn);

  if (weight !== undefined) {
    const weightKind =
      box.actualWeightLb !== undefined ? "actual" : "estimated";
    details.push(`${weightKind} weight ${weight} lb`);
  } else {
    missing.push("weight");
  }

  if (dimensions) {
    details.push(`dimensions ${dimensions}`);
  } else {
    missing.push("complete dimensions");
  }

  if (box.estimatedVolumeCuFt !== undefined) {
    details.push(`estimated volume ${box.estimatedVolumeCuFt} cu ft`);
  } else {
    missing.push("volume");
  }

  return [
    details.length ? details.join("; ") : "no manual estimates recorded",
    missing.length
      ? `missing ${missing.join(", ")}`
      : "no missing estimate fields",
  ].join("; ");
}

function formatDimensionsForInstruction(
  dimensions: Doc<"boxes">["dimensionsIn"],
) {
  const length = dimensions?.lengthIn;
  const width = dimensions?.widthIn;
  const height = dimensions?.heightIn;
  if (length === undefined || width === undefined || height === undefined) {
    return undefined;
  }

  return `${length} x ${width} x ${height} in`;
}
