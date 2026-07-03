"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Bot,
  ImageOff,
  ImagePlus,
  Images,
  MapPin,
  Pencil,
  Plus,
  Ruler,
  ShieldCheck,
  Trash2,
  Truck,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { IngestionCaptureForm } from "@/components/ingestion-capture-form";
import { PhotoEvidenceStrip } from "@/components/photo-evidence-strip";
import { PhotoUploadControl } from "@/components/photo-upload-control";
import { PhotoPickerDialog } from "@/components/photo-picker-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SpaceSelect } from "@/components/space-select";
import { useOptionalMoveWorkspace } from "@/components/move-workspace-context";
import { toastSaved, toastError } from "@/lib/toast";
import { physicalSpaceNames } from "@/lib/space-kinds";
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
  edit,
}: {
  householdId?: string;
  moveId?: string;
  boxId: string;
  returnTo?: string;
  edit?: string;
}) {
  const resolvedHouseholdId = householdId as Id<"households"> | undefined;
  const resolvedMoveId = moveId as Id<"moves"> | undefined;
  const resolvedBoxId = boxId as Id<"boxes">;
  const hasContext = Boolean(resolvedHouseholdId && resolvedMoveId);
  const auth = useConvexAuth();
  const queryArgs =
    resolvedHouseholdId && resolvedMoveId && auth.isAuthenticated
      ? { householdId: resolvedHouseholdId, moveId: resolvedMoveId }
      : "skip";

  const boxRecord = useQuery(
    api.boxes.get,
    resolvedHouseholdId && resolvedMoveId && auth.isAuthenticated
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
    resolvedHouseholdId && resolvedMoveId && auth.isAuthenticated
      ? { householdId: resolvedHouseholdId, moveId: resolvedMoveId, limit: 250 }
      : "skip",
  );
  const updateBox = useMutation(api.boxes.update);
  const removeBox = useMutation(api.boxes.remove);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Optional: the box page is always rendered under MoveWorkspaceProvider in the
  // app, but tests render BoxLookup standalone — so read the context optionally
  // and skip the sync when it's absent rather than throwing.
  const selectMove = useOptionalMoveWorkspace()?.selectMove;

  // Sync the box's move into workspace context. The box page reads its move from
  // the query string but the global back targets (/app/movable-units,
  // /app/spaces-transport, /app/items) carry no move id and resolve the active
  // move from context. Without this sync, a multi-move user who deep-links or
  // scans a box belonging to a non-default move lands Back on the WRONG move's
  // list. selectMove safely no-ops if the move isn't accessible to this user.
  useEffect(() => {
    if (resolvedMoveId && selectMove) {
      selectMove(resolvedMoveId);
    }
  }, [resolvedMoveId, selectMove]);

  // Deep-linked from the list's "missing weight/size" indicators (MOVE-343).
  const [editingSize, setEditingSize] = useState(edit === "size");
  const [editingDetails, setEditingDetails] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [savingSize, setSavingSize] = useState(false);
  const [editingPlacement, setEditingPlacement] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Return the user to wherever they opened the unit from. The default (no
  // returnTo — e.g. a deep link or QR scan) lands on Movable Units, the home
  // for boxes now; its label must match where it actually goes (it used to say
  // "Boxes" but navigate to Movable Units).
  const back =
    returnTo === "load-plan" && moveId
      ? {
          href: moveWorkspaceAnchorPath(moveId, "#load-plan"),
          label: "Load plan",
        }
      : returnTo === "movable-units"
        ? { href: "/app/movable-units", label: "Movable Units" }
        : returnTo === "spaces-transport"
          ? { href: "/app/spaces-transport", label: "Spaces & Transport" }
          : returnTo === "items"
            ? { href: "/app/items", label: "Items" }
            : { href: moveBoxesPath(moveId), label: "Movable Units" };
  const primaryBackHref = back.href;
  const primaryBackLabel = back.label;
  const currentSearch = searchParams.toString();
  const currentPath = currentSearch ? `${pathname}?${currentSearch}` : pathname;
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(currentPath)}`;

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

  if (auth.isLoading) {
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

  if (!auth.isAuthenticated) {
    return (
      <Shell>
        {backRow}
        <section className="rounded-lg border border-border bg-card p-5">
          <h1 className="text-lg font-semibold">Sign in required</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Sign in before opening this unit lookup.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={signInHref}>
              <ShieldCheck aria-hidden="true" />
              Sign in
            </Link>
          </Button>
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
  // One editor covers BOTH weight and dimensions, so name it that way (MOVE-341).
  const hasSize = sizeParts.length > 0;
  const sizeLabel = hasSize ? sizeParts.join(" · ") : "Add weight & size";

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
      toastSaved(`${box.code} size updated`);
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : `Could not update the size for ${box.code}.`;
      setMessage(detail);
      toastError(detail);
    } finally {
      setSavingSize(false);
    }
  }

  // Rename the unit (its display name = nickname) and edit its description.
  async function handleSaveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resolvedHouseholdId || !resolvedMoveId) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const nickname = String(formData.get("nickname") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    setSavingDetails(true);
    setMessage(null);
    try {
      await updateBox({
        householdId: resolvedHouseholdId,
        moveId: resolvedMoveId,
        boxId: box._id,
        nickname,
        description,
      });
      setEditingDetails(false);
      setMessage(`${box.code} updated.`);
      toastSaved(`${box.code} updated`);
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : `Could not update ${box.code}.`;
      setMessage(detail);
      toastError(detail);
    } finally {
      setSavingDetails(false);
    }
  }

  // Permanently delete the unit: remove it + its photos, and unpack any items
  // inside so they survive as loose items. Navigate back afterwards since this
  // page would otherwise show "not found".
  async function handleRemoveBox() {
    if (!resolvedHouseholdId || !resolvedMoveId) return;
    setRemoving(true);
    setMessage(null);
    try {
      await removeBox({
        householdId: resolvedHouseholdId,
        moveId: resolvedMoveId,
        boxId: box._id,
      });
      toastSaved(`${box.code} removed`);
      router.push(primaryBackHref);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : `Could not remove ${box.code}.`;
      setMessage(detail);
      toastError(detail);
      setRemoving(false);
      setConfirmRemove(false);
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
          <button
            type="button"
            onClick={() => setUploaderOpen(true)}
            aria-label="Add photos to this unit"
            className="group relative shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-ring"
          >
            <BoxThumbnail
              householdId={resolvedHouseholdId ?? null}
              moveId={resolvedMoveId ?? null}
              photoId={thumbnailPhotoId}
            />
            <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/0 text-white opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
              <ImagePlus className="size-5" aria-hidden="true" />
            </span>
          </button>
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

        <div className="mt-3">
          {editingDetails ? (
            <form
              onSubmit={(event) => void handleSaveDetails(event)}
              className="space-y-2 rounded-md border border-border bg-background/60 p-3"
            >
              <label className="block text-xs">
                <span className="mb-1 block text-muted-foreground">Name</span>
                <Input
                  name="nickname"
                  defaultValue={box.nickname ?? ""}
                  placeholder="e.g. Kitchen pots & pans"
                  aria-label="Unit name"
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-muted-foreground">
                  Description
                </span>
                <Textarea
                  name="description"
                  defaultValue={box.description ?? ""}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setEditingDetails(false);
                    }
                  }}
                  placeholder="What's inside or any notes"
                  aria-label="Unit description"
                  rows={2}
                />
              </label>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={savingDetails}>
                  {savingDetails ? "Saving…" : "Save name & description"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={savingDetails}
                  onClick={() => setEditingDetails(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                {box.description || "No description yet."}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => setEditingDetails(true)}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Rename / edit</span>
              </Button>
            </div>
          )}
        </div>

        {confirmRemove ? (
          <div className="mt-3 space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <p className="text-muted-foreground">
              Permanently delete {box.code}? The unit and its photos are removed;
              any items packed inside are unpacked back to loose items (they
              survive).{" "}
              <span className="font-medium text-foreground">
                This can&apos;t be undone.
              </span>
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={removing}
                onClick={() => void handleRemoveBox()}
              >
                {removing ? "Removing…" : `Remove ${box.code}`}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={removing}
                onClick={() => setConfirmRemove(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 text-destructive hover:text-destructive"
            onClick={() => setConfirmRemove(true)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Remove {box.code}
          </Button>
        )}

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
                  {savingSize ? "Saving…" : "Save weight & size"}
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
              <span className={hasSize ? "" : "text-muted-foreground"}>
                {sizeLabel}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                {hasSize ? "Edit weight & size" : null}
                <Pencil className="size-3.5" aria-hidden="true" />
              </span>
            </button>
          )}
        </div>
      </section>

      {/* Placement (essential 5). Quiet labels by default; the whole line is
          editable on click, mirroring the size affordance above. */}
      <section className="mt-3 rounded-lg border border-border bg-card p-4">
        {editingPlacement ? (
          <PlacementEditor
            box={box}
            spaces={spaces ?? []}
            resources={resourcesWithZones ?? []}
            householdId={resolvedHouseholdId!}
            moveId={resolvedMoveId!}
            onSaved={(saved) => {
              setEditingPlacement(false);
              setMessage(saved);
              toastSaved(saved);
            }}
            onCancel={() => setEditingPlacement(false)}
            message={message}
            onMessage={setMessage}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingPlacement(true)}
            className="flex w-full items-start gap-2 rounded-md text-left transition-colors hover:bg-muted/40"
          >
            <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
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
            <Pencil
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        )}
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
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-md border border-border">
            {items.map(({ membership, item }) => (
              <BoxItemRow
                key={membership._id}
                item={item}
                quantity={membership.quantity}
                householdId={resolvedHouseholdId ?? null}
                moveId={resolvedMoveId ?? null}
                onMessage={setMessage}
              />
            ))}
          </ul>
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

      {/* Click the thumbnail to add photos straight to this unit (MOVE-342). */}
      <Sheet open={uploaderOpen} onOpenChange={setUploaderOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>Photos for {box.code}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4 px-4 pb-4">
            <PhotoUploadControl
              householdId={resolvedHouseholdId ?? null}
              moveId={resolvedMoveId ?? null}
              boxId={box._id}
              room={box.room}
              label="Add photos"
              multiple
              onUploaded={() => {
                setMessage(`Photo added to ${box.code}.`);
                toastSaved(`Photo added to ${box.code}`);
              }}
            />
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPhotoPickerOpen(true)}
              >
                <Images className="size-4" aria-hidden="true" />
                Choose from existing photos
              </Button>
              <PhotoPickerDialog
                householdId={resolvedHouseholdId ?? null}
                moveId={resolvedMoveId ?? null}
                target={{ kind: "box", boxId: box._id }}
                targetLabel={box.code}
                open={photoPickerOpen}
                onOpenChange={setPhotoPickerOpen}
                onAttached={() => {
                  setMessage(`Photo attached to ${box.code}.`);
                  toastSaved(`Photo attached to ${box.code}`);
                }}
              />
            </div>
            <PhotoEvidenceStrip
              householdId={resolvedHouseholdId ?? null}
              moveId={resolvedMoveId ?? null}
              boxId={box._id}
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

function PlacementEditor({
  box,
  spaces,
  resources,
  householdId,
  moveId,
  onSaved,
  onCancel,
  message,
  onMessage,
}: {
  box: Doc<"boxes">;
  spaces: ReadonlyArray<{ _id: Id<"moveSpaces">; name: string; kind: string }>;
  resources: ReadonlyArray<{
    resource: { _id: Id<"transportResources">; name: string };
    zones: ReadonlyArray<{ _id: Id<"transportZones">; name: string }>;
  }>;
  householdId: Id<"households">;
  moveId: Id<"moves">;
  onSaved: (message: string) => void;
  onCancel: () => void;
  message: string | null;
  onMessage: (message: string | null) => void;
}) {
  const updateBox = useMutation(api.boxes.update);
  // Origination / Destination are SPACE-only pickers (no transports).
  const spaceNameOptions = physicalSpaceNames(spaces);
  const [room, setRoom] = useState(box.room ?? "");
  const [destinationRoom, setDestinationRoom] = useState(
    box.destinationRoom ?? "",
  );
  // Present location is a SINGLE value — a room OR a transport, never both.
  const [spaceId, setSpaceId] = useState<string>(box.currentSpaceId ?? "");
  const [resourceId, setResourceId] = useState<string>(
    box.assignedResourceId ?? "",
  );
  const [zoneId, setZoneId] = useState<string>(box.assignedZoneId ?? "");
  const [overrideReason, setOverrideReason] = useState("");
  const [needsOverride, setNeedsOverride] = useState(false);
  const [saving, setSaving] = useState(false);
  // Mirrors the page-level message, but rendered right next to the field —
  // the shared banner lives at the top of a long page and is easy to miss
  // once you've scrolled down to Present location (MOVE-362).
  const [formError, setFormError] = useState<string | null>(null);

  const selectClass =
    "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";
  const zonesForResource =
    resources.find((entry) => String(entry.resource._id) === resourceId)
      ?.zones ?? [];

  // One picker, two groups: pick a Space OR a Transport. Encode as
  // "space:<id>" / "transport:<id>" so a single <select> drives both axes.
  const presentValue = resourceId
    ? `transport:${resourceId}`
    : spaceId
      ? `space:${spaceId}`
      : "";
  const visibleFormError = message === null ? null : formError;
  function onPresentChange(value: string) {
    setNeedsOverride(false);
    setOverrideReason("");
    setFormError(null);
    if (value.startsWith("space:")) {
      setSpaceId(value.slice("space:".length));
      setResourceId("");
      setZoneId("");
    } else if (value.startsWith("transport:")) {
      setResourceId(value.slice("transport:".length));
      setSpaceId("");
      setZoneId("");
    } else {
      setSpaceId("");
      setResourceId("");
      setZoneId("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    onMessage(null);
    setFormError(null);
    const reason = overrideReason.trim();
    try {
      await updateBox({
        householdId,
        moveId,
        boxId: box._id,
        room,
        destinationRoom,
        // Present location is mutually exclusive: a transport clears the room,
        // a room clears the transport. Neither touches origination/destination.
        ...(resourceId
          ? {
              assignedResourceId: resourceId as Id<"transportResources">,
              ...(zoneId
                ? { assignedZoneId: zoneId as Id<"transportZones"> }
                : { clearAssignedZone: true }),
              clearCurrentSpace: true,
              ...(reason ? { assignmentOverrideReason: reason } : {}),
            }
          : {
              clearAssignedResource: true,
              clearAssignedZone: true,
              ...(spaceId
                ? { currentSpaceId: spaceId as Id<"moveSpaces"> }
                : { clearCurrentSpace: true }),
            }),
        // Loading onto a transport marks the unit physically loaded; moving it
        // back to a room reverts a loaded box to staged. Other statuses stand.
        ...(resourceId
          ? { status: "loaded" as const }
          : box.status === "loaded"
            ? { status: "staged" as const }
            : {}),
      });
      onSaved(`${box.code} placement updated.`);
    } catch (error) {
      const messageText =
        error instanceof Error
          ? error.message
          : `Could not update placement for ${box.code}.`;
      // A soft capacity warning is overridable — reveal a reason field so the
      // user can acknowledge it and retry. Hard blocks stay blocked.
      if (
        resourceId &&
        !reason &&
        /override|warning|capacity|heav|exceed/i.test(messageText)
      ) {
        setNeedsOverride(true);
      }
      setFormError(messageText);
      onMessage(messageText);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="rounded-md border border-border bg-background/60 p-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
            Origination space
          </span>
          <SpaceSelect
            value={room}
            onChange={setRoom}
            spaceNames={spaceNameOptions}
            ariaLabel="Origination space"
            className="h-9"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
            Destination space
          </span>
          <SpaceSelect
            value={destinationRoom}
            onChange={setDestinationRoom}
            spaceNames={spaceNameOptions}
            ariaLabel="Destination space"
            className="h-9"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
            Present location — a space or a transport
          </span>
          <select
            className={selectClass}
            value={presentValue}
            onChange={(event) => onPresentChange(event.target.value)}
            aria-label="Present location"
          >
            <option value="">Not set</option>
            <optgroup label="Spaces">
              {spaces.map((space) => (
                <option key={space._id} value={`space:${space._id}`}>
                  {space.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Transportation">
              {resources.length === 0 ? (
                <option value="" disabled>
                  Add a truck or trailer first
                </option>
              ) : (
                resources.map((entry) => (
                  <option
                    key={entry.resource._id}
                    value={`transport:${entry.resource._id}`}
                  >
                    {entry.resource.name}
                  </option>
                ))
              )}
            </optgroup>
          </select>
          {resourceId && zonesForResource.length ? (
            <select
              className={`${selectClass} mt-2`}
              value={zoneId}
              onChange={(event) => setZoneId(event.target.value)}
              aria-label="Transport zone"
            >
              <option value="">No specific zone</option>
              {zonesForResource.map((zone) => (
                <option key={zone._id} value={zone._id}>
                  {zone.name}
                </option>
              ))}
            </select>
          ) : null}
          {visibleFormError ? (
            <p
              className={`mt-2 rounded-md border px-2 py-1.5 text-xs ${
                needsOverride
                  ? "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
              }`}
            >
              {visibleFormError}
            </p>
          ) : null}
          {needsOverride ? (
            <Input
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              placeholder="Reason to load despite the capacity warning"
              className="mt-2 h-9"
              aria-label="Capacity override reason"
            />
          ) : null}
        </label>
      </div>
      <datalist id="placement-rooms">
        {spaces.map((space) => (
          <option key={space._id} value={space.name} />
        ))}
      </datalist>
      <p className="mt-2 text-xs text-muted-foreground">
        Origination and destination are free text. Present location is a single
        choice — a room/space OR a transport (loading it onto a truck marks the
        unit loaded). Pick a transport with zones to choose a zone.
      </p>
      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving…" : "Save placement"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
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

// One item inside the box. The name gets its own full-width line (it used to be
// squeezed in a narrow table column) and is inline-editable (MOVE-340).
function BoxItemRow({
  item,
  quantity,
  householdId,
  moveId,
  onMessage,
}: {
  item: { _id: Id<"items">; name: string; code?: string };
  quantity: number;
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  onMessage: (message: string | null) => void;
}) {
  const updateItem = useMutation(api.items.update);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!householdId || !moveId || !trimmed || trimmed === item.name) {
      setName(item.name);
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await updateItem({ householdId, moveId, itemId: item._id, name: trimmed });
      onMessage(`Renamed to “${trimmed}”.`);
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : "Couldn't rename that item.",
      );
      setName(item.name);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  return (
    <li className="px-3 py-2.5">
      {editing ? (
        <Input
          value={name}
          autoFocus
          disabled={saving}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            } else if (event.key === "Escape") {
              setName(item.name);
              setEditing(false);
            }
          }}
          aria-label="Item name"
          className="h-9"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit name: ${item.name}`}
          className="block w-full break-words text-left text-sm font-medium hover:underline"
        >
          {item.name}
        </button>
      )}
      <p className="mt-0.5 text-xs text-muted-foreground">
        {item.code ?? "no code"} · {quantity} qty
      </p>
    </li>
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
