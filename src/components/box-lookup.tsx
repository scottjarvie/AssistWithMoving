"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Bot,
  ImageOff,
  MapPin,
  Pencil,
  Plus,
  Ruler,
  Truck,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { IngestionCaptureForm } from "@/components/ingestion-capture-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatOptionalNumber,
  parseOptionalNumber,
} from "@/lib/inventory-detail";
import { moveBoxesPath, moveWorkspaceAnchorPath } from "@/lib/move-links";
import {
  buildMovableUnits,
  calculateMovableUnitVolumeCuFt,
} from "@/lib/movable-units";

// The movable-unit detail page (MOVE-294). By default it renders exactly six
// things and nothing else: thumbnail, unit code, nickname, size (weight ·
// dimensions · volume), placement (origination · destination · present location
// · transport), and the items table. The page only grows when a unit holds many
// items. The removed clutter (estimates form, three add-item forms, AI-queue
// block, handoff prompt, checklist, jump-grid) returns behind affordances:
// clicking the size line opens an inline editor (MOVE-296); the items "+" and
// "Add AI instructions" buttons open the capture/ingress flow pre-targeted to
// this unit (MOVE-295, MOVE-297).
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
  const hasContext = Boolean(resolvedHouseholdId && resolvedMoveId);
  const queryArgs =
    resolvedHouseholdId && resolvedMoveId
      ? { householdId: resolvedHouseholdId, moveId: resolvedMoveId }
      : "skip";

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
  const resourcesWithZones = useQuery(
    api.transportResources.listForMoveWithZones,
    queryArgs,
  );
  const spaces = useQuery(api.moveSpaces.listForMove, queryArgs);
  const movePhotos = useQuery(
    api.photos.listForMove,
    resolvedHouseholdId && resolvedMoveId
      ? { householdId: resolvedHouseholdId, moveId: resolvedMoveId, limit: 250 }
      : "skip",
  );
  const updateBox = useMutation(api.boxes.update);

  const [editingSize, setEditingSize] = useState(false);
  const [savingSize, setSavingSize] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const openedFromLoadPlan = returnTo === "load-plan";
  const primaryBackHref =
    openedFromLoadPlan && moveId
      ? moveWorkspaceAnchorPath(moveId, "#load-plan")
      : moveBoxesPath(moveId);
  const primaryBackLabel = openedFromLoadPlan ? "Load plan" : "Boxes";

  const backRow = (
    <div className="mb-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 px-2">
        <Link href={primaryBackHref}>
          <ArrowLeft aria-hidden="true" />
          {primaryBackLabel}
        </Link>
      </Button>
    </div>
  );

  if (!hasContext) {
    return (
      <Shell>
        {backRow}
        <section className="rounded-lg border border-border bg-card p-5">
          <h1 className="text-lg font-semibold">Missing lookup context</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Open this unit from the Movable Units list or the load plan so it
            arrives with its household and move context.
          </p>
        </section>
      </Shell>
    );
  }

  if (boxRecord === undefined) {
    return (
      <Shell>
        {backRow}
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </Shell>
    );
  }

  if (boxRecord === null) {
    return (
      <Shell>
        {backRow}
        <section className="rounded-lg border border-border bg-card p-5">
          <h1 className="text-lg font-semibold">Unit not found</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This unit may have been archived or belongs to a different move.
          </p>
        </section>
      </Shell>
    );
  }

  const box = boxRecord.box;
  const resourceNamesById = new Map(
    resourcesWithZones?.map(({ resource }) => [
      String(resource._id),
      resource.name,
    ]) ?? [],
  );
  const zoneNamesById = new Map(
    resourcesWithZones?.flatMap(({ zones }) =>
      zones.map((zone) => [String(zone._id), zone.name] as const),
    ) ?? [],
  );
  const unit = buildMovableUnits({
    boxes: [boxRecord],
    resourceNamesById,
    zoneNamesById,
  })[0];

  const presentLocation = box.currentSpaceId
    ? (spaces?.find((space) => space._id === box.currentSpaceId)?.name ??
      "Loading…")
    : "Not set";
  const thumbnailPhotoId = (movePhotos ?? []).find(
    (photo) => photo.boxId === box._id,
  )?._id;
  const items = boxRecord.contents.filter(
    (entry): entry is NonNullable<typeof entry> => entry !== null,
  );

  const sizeParts = [
    unit?.missingFields.includes("weight") ? null : unit?.weightLabel,
    unit?.missingFields.includes("dimensions") ? null : unit?.dimensionsLabel,
    unit?.missingFields.includes("volume") ? null : unit?.volumeLabel,
  ].filter(Boolean) as string[];
  const sizeLabel = sizeParts.length ? sizeParts.join(" · ") : "Add size";

  const boxContextInstructions = buildBoxPhotoQueueInstructions({
    boxCode: box.code,
    boxId: box._id,
    room: box.room ?? undefined,
    destinationRoom: box.destinationRoom ?? undefined,
  });

  async function handleSaveSize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resolvedHouseholdId || !resolvedMoveId) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const weight = parseOptionalNumber(
      String(formData.get("estimatedWeightLb") ?? ""),
    );
    const dimensions = buildDimensionsPatch({
      lengthIn: String(formData.get("lengthIn") ?? ""),
      widthIn: String(formData.get("widthIn") ?? ""),
      heightIn: String(formData.get("heightIn") ?? ""),
    });
    const volume =
      parseOptionalNumber(String(formData.get("estimatedVolumeCuFt") ?? "")) ??
      calculateMovableUnitVolumeCuFt(dimensions);

    if (weight === undefined && dimensions === undefined && volume === undefined) {
      setMessage(`Add a weight, dimension, or volume before saving ${box.code}.`);
      return;
    }

    setSavingSize(true);
    setMessage(null);
    try {
      await updateBox({
        householdId: resolvedHouseholdId,
        moveId: resolvedMoveId,
        boxId: box._id,
        ...(weight !== undefined ? { estimatedWeightLb: weight } : {}),
        ...(dimensions !== undefined ? { dimensionsIn: dimensions } : {}),
        ...(volume !== undefined ? { estimatedVolumeCuFt: volume } : {}),
      });
      setEditingSize(false);
      setMessage(`${box.code} size updated.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : `Could not update the size for ${box.code}.`,
      );
    } finally {
      setSavingSize(false);
    }
  }

  return (
    <Shell>
      {backRow}

      {message ? (
        <div className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          {message}
        </div>
      ) : null}

      {/* Identity + size (essentials 1-4). */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-4">
          <BoxThumbnail
            householdId={resolvedHouseholdId ?? null}
            moveId={resolvedMoveId ?? null}
            photoId={thumbnailPhotoId}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="font-mono">{box.code}</Badge>
              <Badge variant="outline" className="capitalize">
                {box.status}
              </Badge>
            </div>
            <h1 className="mt-1.5 truncate text-xl font-semibold tracking-tight">
              {unit?.name ?? box.code}
            </h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCaptureOpen(true)}
            className="shrink-0"
          >
            <Bot aria-hidden="true" />
            <span className="hidden sm:inline">Add AI instructions</span>
            <span className="sm:hidden">AI</span>
          </Button>
        </div>

        <div className="mt-4">
          {editingSize ? (
            <form
              onSubmit={(event) => void handleSaveSize(event)}
              className="rounded-md border border-border bg-background/60 p-3"
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <SizeField
                  name="estimatedWeightLb"
                  label="Weight (lb)"
                  defaultValue={formatOptionalNumber(unit?.editableWeightLb)}
                />
                <SizeField
                  name="lengthIn"
                  label="Length (in)"
                  defaultValue={formatOptionalNumber(box.dimensionsIn?.lengthIn)}
                />
                <SizeField
                  name="widthIn"
                  label="Width (in)"
                  defaultValue={formatOptionalNumber(box.dimensionsIn?.widthIn)}
                />
                <SizeField
                  name="heightIn"
                  label="Height (in)"
                  defaultValue={formatOptionalNumber(box.dimensionsIn?.heightIn)}
                />
                <SizeField
                  name="estimatedVolumeCuFt"
                  label="Volume (cu ft)"
                  defaultValue={formatOptionalNumber(unit?.editableVolumeCuFt)}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Leave volume blank when length, width, and height are known — it
                is calculated for you.
              </p>
              <div className="mt-3 flex gap-2">
                <Button type="submit" size="sm" disabled={savingSize}>
                  {savingSize ? "Saving…" : "Save size"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={savingSize}
                  onClick={() => setEditingSize(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setEditingSize(true)}
              className="flex w-full items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
            >
              <Ruler
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span
                className={
                  sizeParts.length ? "" : "text-muted-foreground"
                }
              >
                {sizeLabel}
              </span>
              <Pencil
                className="ml-auto size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      </section>

      {/* Placement (essential 5). Read-only labels by default. */}
      <section className="mt-3 rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <PlacementField
            icon={MapPin}
            label="Origination"
            value={unit?.roomLabel ?? "origin unset"}
          />
          <PlacementField
            icon={MapPin}
            label="Destination"
            value={unit?.destinationLabel ?? "destination unset"}
          />
          <PlacementField
            icon={MapPin}
            label="Present location"
            value={presentLocation}
          />
          <PlacementField
            icon={Truck}
            label="Transport"
            value={unit?.assignmentLabel ?? "Needs load assignment"}
          />
        </div>
      </section>

      {/* Items (essential 6). Empty stays compact; only grows with contents. */}
      <section className="mt-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            Items{" "}
            <span className="font-normal text-muted-foreground">
              ({items.length})
            </span>
          </h2>
          <Button size="sm" variant="outline" onClick={() => setCaptureOpen(true)}>
            <Plus aria-hidden="true" />
            Add
          </Button>
        </div>

        {items.length ? (
          <div className="mt-3 overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Code</th>
                  <th className="px-3 py-2 text-left font-medium">Item</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map(({ membership, item }) => (
                  <tr key={membership._id}>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {item.code ?? "—"}
                    </td>
                    <td className="px-3 py-2">{item.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {membership.quantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No items yet — use Add to capture items into {box.code}.
          </p>
        )}
      </section>

      <Sheet open={captureOpen} onOpenChange={setCaptureOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>Add to {box.code}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <IngestionCaptureForm
              householdId={resolvedHouseholdId ?? null}
              moveId={resolvedMoveId ?? null}
              targetBoxCode={box.code}
              boxContextInstructions={boxContextInstructions}
              onCreated={() => {
                setCaptureOpen(false);
                setMessage(`Sent to the queue for ${box.code}.`);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">{children}</div>
  );
}

function PlacementField({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" aria-hidden="true" />
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm">{value}</div>
    </div>
  );
}

function SizeField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Input
        name={name}
        defaultValue={defaultValue}
        inputMode="decimal"
        className="h-9"
        aria-label={label}
      />
    </label>
  );
}

function BoxThumbnail({
  householdId,
  moveId,
  photoId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  photoId?: Id<"itemPhotos">;
}) {
  const getDisplayUrl = useAction(api.photos.getDisplayUrl);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!householdId || !moveId || !photoId) {
      return;
    }
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
    <div className="size-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
      {photoId && url ? (
        // B2/edge delivery URLs are short-lived and provider-controlled, so
        // Next image optimization is intentionally bypassed.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <ImageOff className="size-5" aria-hidden="true" />
        </div>
      )}
    </div>
  );
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
  const dimensions: { lengthIn?: number; widthIn?: number; heightIn?: number } =
    {};
  const parsedLength = parseOptionalNumber(lengthIn);
  const parsedWidth = parseOptionalNumber(widthIn);
  const parsedHeight = parseOptionalNumber(heightIn);
  if (parsedLength !== undefined) dimensions.lengthIn = parsedLength;
  if (parsedWidth !== undefined) dimensions.widthIn = parsedWidth;
  if (parsedHeight !== undefined) dimensions.heightIn = parsedHeight;
  return Object.keys(dimensions).length ? dimensions : undefined;
}

// Box handoff context folded into queued captures launched from this unit, so a
// connected AI agent packs the results into this existing box rather than
// creating a replacement. Kept here (rather than an on-page form) per MOVE-294.
function buildBoxPhotoQueueInstructions({
  boxCode,
  boxId,
  room,
  destinationRoom,
  extraInstructions,
}: {
  boxCode: string;
  boxId: Id<"boxes">;
  room?: string;
  destinationRoom?: string;
  extraInstructions?: string;
}) {
  const details = [
    `Open existing box ${boxCode} (${boxId}) and itemize anything captured with this entry.`,
    "Create item records for visible contents and attach the captured media to each item.",
    `Pack created items into this same existing box using boxId ${boxId} or boxCode ${boxCode}. Do not create a replacement box.`,
    "Mark uncertain names, quantities, condition, weight, dimensions, and disposition for review instead of guessing.",
  ];
  if (room) details.push(`Origin/current room hint: ${room}.`);
  if (destinationRoom) details.push(`Destination room hint: ${destinationRoom}.`);
  const cleanExtra = extraInstructions?.trim();
  if (cleanExtra) details.push(`User notes: ${cleanExtra}`);
  return details.join("\n");
}

// Copy-paste handoff prompt for users who want to drive their own AI agent
// against this existing box. Retained as an exported helper (the queue launcher
// covers the in-app path).
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
    "Mark uncertain names, quantities, condition, weight, dimensions, and disposition for review.",
    "After writing, verify with get_move_summary or get_agent_context and tell me what changed.",
  ]
    .filter(Boolean)
    .join("\n");
}
