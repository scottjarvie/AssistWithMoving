"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import {
  Camera,
  FileAudio,
  FileImage,
  FileVideo,
  Info,
  Loader2,
  Plus,
  X,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  fileSha256Hex,
  imageDimensions,
  mediaKindForMimeType,
  uploadFileWithProgress,
  validateMediaUploadFile,
} from "@/lib/photo-upload";

type PendingAttachment = {
  file: File;
  kind: "image" | "audio" | "video";
};

// Whether a batch of media becomes one entry per image (the agent treats each
// photo as its own item) or a single combined scene entry.
type CaptureScope = "perImage" | "combined";

// Mobile-first capture: photos/voice notes/clips plus typed (or dictated)
// directions become ingestion-queue entries for the user's AI agent. With
// multiple images the user picks whether each photo is its own item (the
// default — this is the fix for the old collapse-everything-into-one behavior)
// or whether the whole batch is one combined scene.
export function IngestionCaptureForm({
  householdId,
  moveId,
  onCreated,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  // Fired after at least one queue entry is successfully created — lets a host
  // surface (e.g. the capture Sheet) refresh a count or close.
  onCreated?: (created: { entryCount: number }) => void;
}) {
  const initUpload = useAction(api.photos.initUpload);
  const finalizeUpload = useAction(api.photos.finalizeUpload);
  const cancelUploadSession = useMutation(api.photos.cancelUploadSession);
  const createEntry = useMutation(api.ingestionQueue.createEntry);

  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [instructions, setInstructions] = useState("");
  const [scope, setScope] = useState<CaptureScope>("perImage");
  const [saving, setSaving] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const canAttachMedia = Boolean(householdId && moveId && !saving);
  const canSubmit =
    canAttachMedia && (instructions.trim().length > 0 || attachments.length > 0);

  const imageCount = attachments.filter(
    (attachment) => attachment.kind === "image",
  ).length;
  // The per-image scope only changes behavior when there are 2+ images to split.
  const scopeChoiceVisible = imageCount > 1;
  const perImage = scopeChoiceVisible && scope === "perImage";

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setStatus(null);

    const accepted: PendingAttachment[] = [];
    for (const file of files) {
      const validation = validateMediaUploadFile(file);
      const kind = mediaKindForMimeType(file.type);
      if (!validation.ok || !kind) {
        setStatus(validation.message ?? `${file.name} is not a supported file.`);
        continue;
      }
      accepted.push({ file, kind });
    }
    setAttachments((current) => [...current, ...accepted]);
  }

  async function uploadAttachment(attachment: PendingAttachment) {
    if (!householdId || !moveId) {
      throw new Error("Missing move context.");
    }

    const { file, kind } = attachment;
    const isImage = kind === "image";
    const [dimensions, originalHash] = await Promise.all([
      isImage ? imageDimensions(file) : Promise.resolve(undefined),
      fileSha256Hex(file),
    ]);

    const session = await initUpload({
      householdId,
      moveId,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    const uploadSessionId =
      session.uploadSessionId as Id<"photoUploadSessions">;

    try {
      const abortController = new AbortController();
      await uploadFileWithProgress({
        file,
        uploadUrl: session.uploadUrl,
        contentType: session.headers["Content-Type"],
        onProgress: () => {},
        signal: abortController.signal,
      });

      const finalizeResult = normalizeFinalizeUploadResult(await finalizeUpload({
        householdId,
        moveId,
        uploadSessionId,
        width: dimensions?.width,
        height: dimensions?.height,
        originalHash,
        photoType: isImage ? "item" : "other",
        privacyLevel: "normal",
        visibilityScope: "moveCollaborators",
        exifHandlingStatus: "pending",
        confidence: "manual",
        verificationStatus: "unreviewed",
      }));
      return finalizeResult.photoId;
    } catch (error) {
      await cancelUploadSession({
        householdId,
        moveId,
        uploadSessionId,
      }).catch(() => {});
      throw error;
    }
  }

  async function handleAddToQueue() {
    if (!householdId || !moveId || saving) {
      return;
    }
    if (!instructions.trim() && attachments.length === 0) {
      setStatus("Add a note, a photo, or a voice file first.");
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      const trimmedInstructions = instructions.trim() || undefined;

      // Upload every attachment first so a failure never leaves a half-created
      // batch of entries. We capture which uploaded ids are images so the
      // per-image split only fans out over photos (audio/video always ride
      // along on a single entry).
      const uploaded: Array<{ photoId: Id<"itemPhotos">; isImage: boolean }> =
        [];
      for (const [index, attachment] of attachments.entries()) {
        setProgressLabel(
          `Uploading ${index + 1} of ${attachments.length} (${attachment.file.name})`
        );
        uploaded.push({
          photoId: await uploadAttachment(attachment),
          isImage: attachment.kind === "image",
        });
      }

      let entryCount = 0;
      if (perImage) {
        // One queued entry per image. Non-image media is attached to the first
        // entry so nothing is dropped. Shared instructions/room hint travel with
        // every entry; scopeHint:"singleItem" tells the agent each is one item.
        const imageIds = uploaded
          .filter((media) => media.isImage)
          .map((media) => media.photoId);
        const extraMediaIds = uploaded
          .filter((media) => !media.isImage)
          .map((media) => media.photoId);

        for (const [index, photoId] of imageIds.entries()) {
          setProgressLabel(
            `Creating queue entry ${index + 1} of ${imageIds.length}`
          );
          await createEntry({
            householdId,
            moveId,
            instructions: trimmedInstructions,
            scopeHint: "singleItem",
            mediaPhotoIds:
              index === 0 ? [photoId, ...extraMediaIds] : [photoId],
          });
          entryCount += 1;
        }
      } else {
        // One combined entry holding all media. With multiple images the user
        // chose "one combined entry" (a scene); otherwise it is the natural
        // single-capture path.
        setProgressLabel("Saving queue entry");
        await createEntry({
          householdId,
          moveId,
          instructions: trimmedInstructions,
          scopeHint:
            scopeChoiceVisible && scope === "combined" ? "scene" : undefined,
          mediaPhotoIds: uploaded.map((media) => media.photoId),
        });
        entryCount = 1;
      }

      setAttachments([]);
      setInstructions("");
      setScope("perImage");
      // Room hint intentionally kept: capture sessions usually walk one room.
      setStatus(
        entryCount > 1
          ? `Added ${entryCount} captures to the queue. Ready for the next.`
          : "Added to the queue. Ready for the next capture."
      );
      onCreated?.({ entryCount });
    } catch (error) {
      setStatus(
        error instanceof Error && error.message
          ? error.message
          : "Could not save this capture. Check your connection and retry."
      );
    } finally {
      setProgressLabel(null);
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Add to Queue
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="How the queue works"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <Info className="size-4" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 text-xs leading-5">
              Drop photos, voice notes, and directions here. Your connected AI
              agent processes them later — nothing becomes inventory until you
              approve it.
            </PopoverContent>
          </Popover>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              Media
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="About adding media"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Info className="size-3.5" aria-hidden="true" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 text-xs leading-5">
                  Attach photos, voice notes, or short clips. They ride along
                  with your directions for the agent to process.
                </PopoverContent>
              </Popover>
            </span>
            <span className="ml-auto flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canAttachMedia}
                onClick={() => fileInputRef.current?.click()}
              >
                <FileImage aria-hidden="true" />
                Choose files
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canAttachMedia}
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera aria-hidden="true" />
                Camera
              </Button>
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,audio/*,video/*"
            multiple
            className="sr-only"
            aria-label="Choose media files"
            disabled={!canAttachMedia}
            onChange={handleFilesChange}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-label="Take a photo"
            disabled={!canAttachMedia}
            onChange={handleFilesChange}
          />
        </div>

        {attachments.length ? (
          <ul
            className="grid gap-2 sm:grid-cols-2"
            aria-label="Pending attachments"
          >
            {attachments.map((attachment, index) => (
              <li
                key={`${attachment.file.name}-${index}`}
                className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {attachmentIcon(attachment.kind)}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {attachment.file.name}
                    </span>
                    <span className="text-muted-foreground">
                      {formatFileSize(attachment.file.size)}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Badge variant="outline">{attachment.kind}</Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${attachment.file.name}`}
                    disabled={saving}
                    onClick={() =>
                      setAttachments((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index)
                      )
                    }
                  >
                    <X aria-hidden="true" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {scopeChoiceVisible ? (
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <p className="text-xs font-medium text-foreground">
              How should your agent treat these {imageCount} photos?
            </p>
            <div
              role="group"
              aria-label="Capture scope"
              className="mt-2 grid grid-cols-2 gap-2"
            >
              <Button
                type="button"
                size="sm"
                variant={scope === "perImage" ? "default" : "outline"}
                aria-pressed={scope === "perImage"}
                disabled={saving}
                onClick={() => setScope("perImage")}
              >
                One entry per photo
              </Button>
              <Button
                type="button"
                size="sm"
                variant={scope === "combined" ? "default" : "outline"}
                aria-pressed={scope === "combined"}
                disabled={saving}
                onClick={() => setScope("combined")}
              >
                One combined entry
              </Button>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {scope === "perImage"
                ? "Each photo becomes its own queued capture — best when every photo is a separate item."
                : "All photos stay in a single capture — best for one scene, room, or box shot from several angles."}
            </p>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label
            htmlFor="capture-directions"
            className="text-sm font-medium text-foreground"
          >
            Directions/Requests
          </label>
          <Textarea
            id="capture-directions"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            aria-label="Directions/Requests"
            className="min-h-40 text-base"
            autoCapitalize="sentences"
            autoCorrect="on"
            disabled={!householdId || !moveId || saving}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={!canSubmit}
            onClick={() => void handleAddToQueue()}
          >
            {saving ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus aria-hidden="true" />
            )}
            {perImage
              ? `Add ${imageCount} entries to queue`
              : attachments.length
                ? `Add ${attachments.length} ${attachments.length === 1 ? "file" : "files"} to queue`
                : "Add note to queue"}
          </Button>
          {!canSubmit && moveId ? (
            <span className="text-xs text-muted-foreground">
              Add a note or media first.
            </span>
          ) : null}
        </div>

        {progressLabel ? (
          <p className="text-xs text-muted-foreground" role="status">
            {progressLabel}
          </p>
        ) : null}
        {status ? (
          <p
            className="text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {status}
          </p>
        ) : null}
      </CardContent>
    </Card>
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

function attachmentIcon(kind: PendingAttachment["kind"]) {
  if (kind === "audio") {
    return (
      <FileAudio className="size-4 shrink-0 text-primary" aria-hidden="true" />
    );
  }
  if (kind === "video") {
    return (
      <FileVideo className="size-4 shrink-0 text-primary" aria-hidden="true" />
    );
  }
  return (
    <FileImage className="size-4 shrink-0 text-primary" aria-hidden="true" />
  );
}

function formatFileSize(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
