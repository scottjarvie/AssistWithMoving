"use client";

import Link from "next/link";
import { type ChangeEvent, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { FileImage, Loader2, Plus, Upload } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PendingBlueprintList } from "@/components/floorplans/pending-blueprint-list";
import { ResourceCards } from "@/components/floorplans/resource-cards";
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
import { Textarea } from "@/components/ui/textarea";
import {
  buildFloorplanAgentInstructions,
  capturedAtFromFile,
  normalizeCreateFloorPlanResult,
  normalizeFinalizeUploadResult,
  type PendingBlueprint,
  type UploadedBlueprint,
} from "@/lib/floorplans/upload-helpers";
import {
  fileSha256Hex,
  imageDimensions,
  mediaKindForMimeType,
  uploadFileWithProgress,
  validateMediaUploadFile,
} from "@/lib/photo-upload";

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
