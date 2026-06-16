"use client";

import Link from "next/link";
import Image from "next/image";
import { type ChangeEvent, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { CheckCircle2, FileImage, Loader2, Plus, Upload, X } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  fileSha256Hex,
  imageDimensions,
  mediaKindForMimeType,
  uploadFileWithProgress,
  validateMediaUploadFile,
} from "@/lib/photo-upload";
import { floorplanResources } from "@/lib/floorplans/sample-data";

type PendingBlueprint = {
  id: string;
  contextNote: string;
  file: File;
  useForAi: boolean;
  width?: number;
  height?: number;
  dimensionsStatus: "pending" | "ready" | "failed";
};

type UploadedBlueprint = {
  contextNote: string;
  photoId: Id<"itemPhotos">;
  fileName: string;
  useForAi: boolean;
  width?: number;
  height?: number;
};

export function ResourcesUploadPanel({
  mode,
  householdId,
  moveId,
  onResourceSelect,
  targetPlanId,
}: {
  mode: "public" | "move";
  householdId?: Id<"households"> | null;
  moveId?: Id<"moves"> | null;
  onResourceSelect?: (resourceId: string) => void;
  targetPlanId?: Id<"floorPlans"> | null;
}) {
  if (mode === "move") {
    return (
      <MoveResourcesUploadPanel
        householdId={householdId ?? null}
        moveId={moveId ?? null}
        onResourceSelect={onResourceSelect}
        targetPlanId={targetPlanId ?? null}
      />
    );
  }

  return <PublicResourcesPanel onResourceSelect={onResourceSelect} />;
}

function PublicResourcesPanel({
  onResourceSelect,
}: {
  onResourceSelect?: (resourceId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const idRef = useRef(0);
  const [pending, setPending] = useState<PendingBlueprint[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const selectedForAiCount = pending.filter((entry) => entry.useForAi).length;

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setStatus(null);

    const accepted: PendingBlueprint[] = [];
    for (const file of files) {
      const validation = validateMediaUploadFile(file);
      const kind = mediaKindForMimeType(file.type);
      if (!validation.ok || kind !== "image") {
        setStatus(validation.message ?? `${file.name} is not a supported image file.`);
        continue;
      }

      const blueprint: PendingBlueprint = {
        id: `local_blueprint_${idRef.current}`,
        contextNote: "",
        file,
        useForAi: true,
        dimensionsStatus: "pending",
      };
      idRef.current += 1;
      accepted.push(blueprint);
      void imageDimensions(file)
        .then((dimensions) => {
          setPending((current) =>
            current.map((entry) =>
              entry.id === blueprint.id
                ? {
                    ...entry,
                    width: dimensions.width,
                    height: dimensions.height,
                    dimensionsStatus: "ready",
                  }
                : entry,
            ),
          );
        })
        .catch(() => {
          setPending((current) =>
            current.map((entry) =>
              entry.id === blueprint.id
                ? { ...entry, dimensionsStatus: "failed" }
                : entry,
            ),
          );
        });
    }

    setPending((current) => [...current, ...accepted]);
  }

  return (
    <div className="space-y-3" data-testid="resources-upload-panel">
      <Card size="sm">
        <CardHeader>
          <div>
            <CardTitle>Resources & Upload</CardTitle>
            <CardDescription>
              Upload one image or many, add context to each source, and choose the cleanest set for AI review.
            </CardDescription>
          </div>
          <CardAction>
            <Badge variant="secondary">Local staging</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Upload className="size-4 text-primary" aria-hidden="true" />
                  Stage floorplan evidence
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Local staging lets you sort evidence before saving it to a move. Nothing is uploaded until you create or open a move.
                </p>
              </div>
              <Button
                onClick={() => fileInputRef.current?.click()}
                size="sm"
                type="button"
                variant="outline"
              >
                <FileImage aria-hidden="true" />
                Choose images
              </Button>
            </div>
            <Input
              ref={fileInputRef}
              accept="image/*"
              aria-label="Choose floorplan images"
              className="sr-only"
              multiple
              onChange={handleFilesChange}
              type="file"
            />
          </div>

          {pending.length ? (
            <PendingBlueprintList
              onContextChange={(id, contextNote) =>
                setPending((current) =>
                  current.map((entry) =>
                    entry.id === id ? { ...entry, contextNote } : entry,
                  ),
                )
              }
              onRemove={(id) =>
                setPending((current) => current.filter((entry) => entry.id !== id))
              }
              onToggleUseForAi={(id) =>
                setPending((current) =>
                  current.map((entry) =>
                    entry.id === id ? { ...entry, useForAi: !entry.useForAi } : entry,
                  ),
                )
              }
              onUseAll={() =>
                setPending((current) =>
                  current.map((entry) => ({ ...entry, useForAi: true })),
                )
              }
              onUseNone={() =>
                setPending((current) =>
                  current.map((entry) => ({ ...entry, useForAi: false })),
                )
              }
              pending={pending}
              saving={false}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <Link href="/sign-up">
                <Plus aria-hidden="true" />
                Save and run AI
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            {pending.length ? (
              <span className="text-xs text-muted-foreground">
                {selectedForAiCount} image{selectedForAiCount === 1 ? "" : "s"} marked for AI review.
              </span>
            ) : null}
          </div>

          {status ? (
            <p aria-live="polite" className="text-xs text-muted-foreground" role="status">
              {status}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <ResourceCards onResourceSelect={onResourceSelect} />
    </div>
  );
}

function MoveResourcesUploadPanel({
  householdId,
  moveId,
  onResourceSelect,
  targetPlanId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  onResourceSelect?: (resourceId: string) => void;
  targetPlanId: Id<"floorPlans"> | null;
}) {
  const initUpload = useAction(api.photos.initUpload);
  const finalizeUpload = useAction(api.photos.finalizeUpload);
  const cancelUploadSession = useMutation(api.photos.cancelUploadSession);
  const createEntry = useMutation(api.ingestionQueue.createEntry);
  const createFloorPlan = useMutation(api.floorPlans.createFloorPlan);
  const activePlanDocument = useQuery(
    api.floorPlans.getActiveDocumentForMove,
    householdId && moveId ? { householdId, moveId } : "skip",
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const idRef = useRef(0);
  const [pending, setPending] = useState<PendingBlueprint[]>([]);
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const activePlanId = targetPlanId ?? activePlanDocument?.plan?._id ?? null;
  const canUpload = Boolean(householdId && moveId && !saving);
  const canQueue = canUpload && pending.length > 0;

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setStatus(null);

    const accepted: PendingBlueprint[] = [];
    for (const file of files) {
      const validation = validateMediaUploadFile(file);
      const kind = mediaKindForMimeType(file.type);
      if (!validation.ok || kind !== "image") {
        setStatus(validation.message ?? `${file.name} is not a supported image file.`);
        continue;
      }

      const blueprint: PendingBlueprint = {
        id: `blueprint_${idRef.current}`,
        contextNote: "",
        file,
        useForAi: true,
        dimensionsStatus: "pending",
      };
      idRef.current += 1;
      accepted.push(blueprint);
      void imageDimensions(file)
        .then((dimensions) => {
          setPending((current) =>
            current.map((entry) =>
              entry.id === blueprint.id
                ? {
                    ...entry,
                    width: dimensions.width,
                    height: dimensions.height,
                    dimensionsStatus: "ready",
                  }
                : entry,
            ),
          );
        })
        .catch(() => {
          setPending((current) =>
            current.map((entry) =>
              entry.id === blueprint.id
                ? { ...entry, dimensionsStatus: "failed" }
                : entry,
            ),
          );
        });
    }

    setPending((current) => [...current, ...accepted]);
  }

  async function ensurePlanId() {
    if (!householdId || !moveId) {
      throw new Error("Missing move context.");
    }
    if (activePlanId) {
      return activePlanId;
    }

    const result = await createFloorPlan({
      householdId,
      moveId,
      name: "Destination floorplan",
      kind: "destination",
    });
    return normalizeCreateFloorPlanResult(result).planId;
  }

  async function uploadBlueprint(
    blueprint: PendingBlueprint,
  ): Promise<UploadedBlueprint> {
    if (!householdId || !moveId) {
      throw new Error("Missing move context.");
    }

    const selectedDimensions =
      blueprint.width !== undefined && blueprint.height !== undefined
        ? { width: blueprint.width, height: blueprint.height }
        : undefined;
    const [dimensions, originalHash] = await Promise.all([
      Promise.resolve(selectedDimensions ?? imageDimensions(blueprint.file)),
      fileSha256Hex(blueprint.file),
    ]);

    const session = await initUpload({
      householdId,
      moveId,
      mimeType: blueprint.file.type,
      sizeBytes: blueprint.file.size,
    });
    const uploadSessionId = session.uploadSessionId as Id<"photoUploadSessions">;

    try {
      const abortController = new AbortController();
      await uploadFileWithProgress({
        file: blueprint.file,
        uploadUrl: session.uploadUrl,
        contentType: session.headers["Content-Type"],
        onProgress: () => {},
        signal: abortController.signal,
      });

      const finalized = normalizeFinalizeUploadResult(await finalizeUpload({
        householdId,
        moveId,
        uploadSessionId,
        width: dimensions.width,
        height: dimensions.height,
        originalHash,
        fileName: blueprint.file.name,
        photoType: "blueprint",
        privacyLevel: "normal",
        visibilityScope: "moveCollaborators",
        source: "manualUpload",
        exifHandlingStatus: "pending",
        confidence: "manual",
        verificationStatus: "unreviewed",
        capturedAt: capturedAtFromFile(blueprint.file),
      }));

      return {
        contextNote: blueprint.contextNote.trim(),
        photoId: finalized.photoId,
        fileName: blueprint.file.name,
        useForAi: blueprint.useForAi,
        width: dimensions.width,
        height: dimensions.height,
      };
    } catch (error) {
      await cancelUploadSession({
        householdId,
        moveId,
        uploadSessionId,
      }).catch(() => {});
      throw error;
    }
  }

  async function handleQueueBlueprints() {
    if (!canQueue || selectedForAiCount === 0) return;
    setSaving(true);
    setStatus(null);

    try {
      setProgressLabel("Preparing floorplan");
      const planId = await ensurePlanId();
      const uploaded: UploadedBlueprint[] = [];
      for (const [index, blueprint] of pending.entries()) {
        setProgressLabel(`Uploading blueprint ${index + 1} of ${pending.length}`);
        uploaded.push(await uploadBlueprint(blueprint));
      }
      const selectedForAi = uploaded.filter((entry) => entry.useForAi);

      setProgressLabel("Creating floorplan queue entry");
      await createEntry({
        householdId: householdId as Id<"households">,
        moveId: moveId as Id<"moves">,
        instructions: buildFloorplanAgentInstructions({
          batchInstructions: instructions,
          selectedForAi,
          uploaded,
        }),
        scopeHint: "floorPlan",
        targetPlanId: planId,
        mediaPhotoIds: selectedForAi.map((entry) => entry.photoId),
      });

      setPending([]);
      setInstructions("");
      setStatus(
        `Stored ${uploaded.length} blueprint ${uploaded.length === 1 ? "image" : "images"} and queued ${selectedForAi.length} for the floorplan agent.`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error && error.message
          ? error.message
          : "Could not queue these floorplan images.",
      );
    } finally {
      setProgressLabel(null);
      setSaving(false);
    }
  }

  const selectedForAiCount = pending.filter((entry) => entry.useForAi).length;
  const hasPendingSelection = selectedForAiCount > 0;

  return (
    <div className="space-y-3" data-testid="resources-upload-panel">
      <Card size="sm">
        <CardHeader>
          <div>
            <CardTitle>Resources & Upload</CardTitle>
            <CardDescription>
              Upload sketches, blueprints, and room measurements. They are stored as blueprint media and queued for the floorplan agent.
            </CardDescription>
          </div>
          <CardAction>
            <Badge variant={activePlanId ? "default" : "secondary"}>
              {activePlanId ? "Plan linked" : "Plan will be created"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Upload className="size-4 text-primary" aria-hidden="true" />
                  Add blueprint evidence
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Images become <code>photoType: &quot;blueprint&quot;</code> and the queue entry uses <code>scopeHint: &quot;floorPlan&quot;</code>.
                </p>
              </div>
              <Button
                disabled={!canUpload}
                onClick={() => fileInputRef.current?.click()}
                size="sm"
                type="button"
                variant="outline"
              >
                <FileImage aria-hidden="true" />
                Choose images
              </Button>
            </div>
            <Input
              ref={fileInputRef}
              accept="image/*"
              aria-label="Choose floorplan images"
              className="sr-only"
              disabled={!canUpload}
              multiple
              onChange={handleFilesChange}
              type="file"
            />
          </div>

          {pending.length ? (
            <PendingBlueprintList
              onContextChange={(id, contextNote) =>
                setPending((current) =>
                  current.map((entry) =>
                    entry.id === id ? { ...entry, contextNote } : entry,
                  ),
                )
              }
              onRemove={(id) =>
                setPending((current) => current.filter((entry) => entry.id !== id))
              }
              onToggleUseForAi={(id) =>
                setPending((current) =>
                  current.map((entry) =>
                    entry.id === id ? { ...entry, useForAi: !entry.useForAi } : entry,
                  ),
                )
              }
              onUseAll={() =>
                setPending((current) =>
                  current.map((entry) => ({ ...entry, useForAi: true })),
                )
              }
              onUseNone={() =>
                setPending((current) =>
                  current.map((entry) => ({ ...entry, useForAi: false })),
                )
              }
              pending={pending}
              saving={saving}
            />
          ) : null}

          <Textarea
            aria-label="Floorplan agent instructions"
            className="min-h-24"
            disabled={!canUpload}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Optional notes. Example: one floor only; the right bedroom wing is rough; bonus room and laundry sketches have the best dimensions."
            value={instructions}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={!canQueue || !hasPendingSelection}
              onClick={() => void handleQueueBlueprints()}
              size="sm"
              type="button"
            >
              {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
              Queue floorplan evidence
            </Button>
            {!householdId || !moveId ? (
              <span className="text-xs text-muted-foreground">Open a move before uploading durable evidence.</span>
            ) : pending.length && !hasPendingSelection ? (
              <span className="text-xs text-muted-foreground">
                Mark at least one image for AI review before queueing.
              </span>
            ) : null}
          </div>

          {progressLabel ? (
            <p className="text-xs text-muted-foreground" role="status">
              {progressLabel}
            </p>
          ) : null}
          {status ? (
            <p aria-live="polite" className="text-xs text-muted-foreground" role="status">
              {status}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <ResourceCards onResourceSelect={onResourceSelect} />
    </div>
  );
}

function PendingBlueprintList({
  onContextChange,
  onRemove,
  onToggleUseForAi,
  onUseAll,
  onUseNone,
  pending,
  saving,
}: {
  onContextChange: (id: string, contextNote: string) => void;
  onRemove: (id: string) => void;
  onToggleUseForAi: (id: string) => void;
  onUseAll: () => void;
  onUseNone: () => void;
  pending: PendingBlueprint[];
  saving: boolean;
}) {
  const selectedForAiCount = pending.filter((entry) => entry.useForAi).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">
          Pending images
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {selectedForAiCount} of {pending.length} marked for AI review
          </span>
        </div>
        <div className="flex gap-1.5">
          <Button
            disabled={saving}
            onClick={onUseAll}
            size="sm"
            type="button"
            variant="outline"
          >
            Use all
          </Button>
          <Button
            disabled={saving}
            onClick={onUseNone}
            size="sm"
            type="button"
            variant="outline"
          >
            Use none
          </Button>
        </div>
      </div>
      <ul aria-label="Pending floorplan images" className="space-y-2">
        {pending.map((entry) => (
          <li
            className="grid gap-2 rounded-md border border-border bg-background/65 p-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto]"
            key={entry.id}
          >
            <div className="min-w-0 space-y-2">
              <span className="flex min-w-0 items-center gap-2">
                <FileImage
                  className="size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{entry.file.name}</span>
                  <span className="text-muted-foreground">
                    {formatFileSize(entry.file.size)}
                    {entry.width && entry.height
                      ? `, ${entry.width}x${entry.height}`
                      : ""}
                  </span>
                </span>
              </span>
              <Textarea
                aria-label={`Context for ${entry.file.name}`}
                className="min-h-16 text-xs"
                disabled={saving}
                onChange={(event) => onContextChange(entry.id, event.target.value)}
                placeholder="What should the AI know? Example: This is the kitchen; use it for cabinet and hallway clues."
                value={entry.contextNote}
              />
            </div>
            <span className="flex shrink-0 items-start justify-between gap-1.5 sm:justify-end">
              <Button
                aria-pressed={entry.useForAi}
                className="gap-1.5"
                disabled={saving}
                onClick={() => onToggleUseForAi(entry.id)}
                size="sm"
                type="button"
                variant={entry.useForAi ? "default" : "outline"}
              >
                {entry.useForAi ? (
                  <CheckCircle2 aria-hidden="true" />
                ) : (
                  <FileImage aria-hidden="true" />
                )}
                Use for AI
              </Button>
              <Button
                aria-label={`Remove ${entry.file.name}`}
                disabled={saving}
                onClick={() => onRemove(entry.id)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResourceCards({
  onResourceSelect,
}: {
  onResourceSelect?: (resourceId: string) => void;
}) {
  const [reviewResourceId, setReviewResourceId] = useState<string | null>(null);
  const reviewResource =
    floorplanResources.find((resource) => resource.id === reviewResourceId) ?? null;

  return (
    <>
      <div className="grid gap-2">
        {floorplanResources.map((resource, index) => (
          <Card
            className="transition hover:ring-primary/45"
            key={resource.id}
            size="sm"
          >
            <CardHeader>
              <div>
                <CardTitle>{resource.title}</CardTitle>
                <CardDescription>{resource.description}</CardDescription>
              </div>
              <CardAction>
                <Badge variant={resource.status === "sample" ? "secondary" : "default"}>
                  {resource.status}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              {resource.imageSrc ? (
                <button
                  aria-label={`Review ${resource.title}`}
                  className="group relative block w-full overflow-hidden rounded-md border border-border bg-background text-left"
                  onClick={() => {
                    setReviewResourceId(resource.id);
                    onResourceSelect?.(resource.id);
                  }}
                  type="button"
                >
                  <Image
                    alt=""
                    className="h-28 w-full object-cover transition group-hover:scale-[1.02]"
                    height={240}
                    loading={index === 0 ? "eager" : "lazy"}
                    sizes="(min-width: 1024px) 380px, 100vw"
                    src={resource.imageSrc}
                    unoptimized
                    width={420}
                  />
                  <span className="absolute bottom-2 right-2 rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-foreground shadow-sm">
                    Review image
                  </span>
                </button>
              ) : null}
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {resource.fileName ? <Badge variant="outline">{resource.fileName}</Badge> : null}
                {resource.dimensionsLabel ? <Badge variant="outline">{resource.dimensionsLabel}</Badge> : null}
                {resource.capturedAtLabel ? <Badge variant="outline">{resource.capturedAtLabel}</Badge> : null}
              </div>
              <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
                {resource.proves.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
      <ResourceImageReviewSheet
        onOpenChange={(open) => {
          if (!open) setReviewResourceId(null);
        }}
        resource={reviewResource}
      />
    </>
  );
}

function ResourceImageReviewSheet({
  onOpenChange,
  resource,
}: {
  onOpenChange: (open: boolean) => void;
  resource: (typeof floorplanResources)[number] | null;
}) {
  const open = Boolean(resource?.imageSrc);
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="h-[92dvh] max-h-[92dvh] sm:max-w-none lg:w-[70vw] lg:max-w-[70vw]" side="bottom">
        <SheetHeader>
          <SheetTitle>{resource?.title ?? "Evidence image"}</SheetTitle>
          <SheetDescription>
            Review this source image before accepting or changing extracted measurements.
          </SheetDescription>
        </SheetHeader>
        {resource?.imageSrc ? (
          <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="overflow-auto rounded-md border border-border bg-background">
                <Image
                  alt={resource.title}
                  className="h-auto min-w-[720px] max-w-none lg:min-w-0 lg:w-full"
                  height={1200}
                  loading="eager"
                  sizes="(min-width: 1024px) 70vw, 720px"
                  src={resource.imageSrc}
                  unoptimized
                  width={1800}
                />
              </div>
              <div className="space-y-3 text-sm">
                <div className="rounded-md border border-border bg-card p-3">
                  <div className="font-medium">What this source proves</div>
                  <ul className="mt-2 space-y-2 text-muted-foreground">
                    {resource.proves.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md border border-border bg-card p-3 text-muted-foreground">
                  <div className="font-medium text-foreground">Resource metadata</div>
                  <div className="mt-2 grid gap-1">
                    {resource.fileName ? <div>File: {resource.fileName}</div> : null}
                    {resource.dimensionsLabel ? <div>Image size: {resource.dimensionsLabel}</div> : null}
                    {resource.capturedAtLabel ? <div>Source: {resource.capturedAtLabel}</div> : null}
                    <div>Status: {resource.status}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function normalizeFinalizeUploadResult(value: unknown): {
  photoId: Id<"itemPhotos">;
} {
  if (typeof value === "string") {
    return { photoId: value as Id<"itemPhotos"> };
  }
  if (value && typeof value === "object") {
    const result = value as { photoId?: string };
    if (result.photoId) {
      return { photoId: result.photoId as Id<"itemPhotos"> };
    }
  }
  throw new Error("Upload finalization did not return a photo id.");
}

function normalizeCreateFloorPlanResult(value: unknown): {
  planId: Id<"floorPlans">;
} {
  if (typeof value === "string") {
    return { planId: value as Id<"floorPlans"> };
  }
  if (value && typeof value === "object") {
    const result = value as { planId?: string };
    if (result.planId) {
      return { planId: result.planId as Id<"floorPlans"> };
    }
  }
  throw new Error("Floorplan creation did not return a plan id.");
}

function capturedAtFromFile(file: File) {
  return Number.isFinite(file.lastModified) && file.lastModified > 0
    ? file.lastModified
    : Date.now();
}

function buildFloorplanAgentInstructions({
  batchInstructions,
  selectedForAi,
  uploaded,
}: {
  batchInstructions: string;
  selectedForAi: UploadedBlueprint[];
  uploaded: UploadedBlueprint[];
}) {
  const trimmedInstructions = batchInstructions.trim();
  const selectedLines = selectedForAi.map((entry, index) => {
    const dimensions =
      entry.width && entry.height ? `${entry.width}x${entry.height}` : "size unknown";
    const context = entry.contextNote || "No user context provided.";
    return `${index + 1}. ${entry.fileName} (${dimensions}) photoId=${entry.photoId}: ${context}`;
  });
  const excludedLines = uploaded
    .filter((entry) => !entry.useForAi)
    .map((entry) => `- ${entry.fileName}`);

  return [
    trimmedInstructions ||
      "Interpret these floorplan and blueprint images, record observations, relationships, measurements, assumptions, conflicts, and gap questions, then propose Layout Studio plan updates for review only when the graph supports it.",
    "",
    "AI review image set:",
    ...selectedLines,
    excludedLines.length
      ? [
          "",
          "Uploaded but not selected for this AI pass:",
          ...excludedLines,
          "Do not use unselected images for this pass unless the user explicitly selects them later.",
        ].join("\n")
      : "",
    "",
    "Use the per-image user context as high-confidence guidance, but still record provenance and uncertainty for extracted observations.",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}
