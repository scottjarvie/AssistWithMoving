"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { useMutation } from "convex/react";
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
  mediaKindForMimeType,
  validateMediaUploadFile,
} from "@/lib/photo-upload";
import { useMediaUpload } from "@/components/media-upload-provider";

type PendingAttachment = {
  file: File;
  kind: "image" | "audio" | "video";
};

// Whether a batch of media becomes one entry per image (the agent treats each
// photo as its own item) or a single combined entry holding the whole batch.
type CaptureScope = "perImage" | "combined";

// Mobile-first capture: photos/voice notes/clips plus typed (or dictated)
// directions become ingestion-queue entries for the user's AI agent. With
// multiple images the user defaults to ONE combined entry and can opt IN to
// splitting into one entry per photo. Submitting saves the entry immediately and
// uploads the photos in the BACKGROUND, so the form is free for the next capture
// right away (see media-upload-provider).
export function IngestionCaptureForm({
  householdId,
  moveId,
  onCreated,
  targetBoxCode,
  boxContextInstructions,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  // Fired after at least one queue entry is successfully created — lets a host
  // surface (e.g. the capture Sheet) refresh a count or close.
  onCreated?: (created: { entryCount: number }) => void;
  // When the capture is launched from a specific movable unit, the unit code is
  // shown as a target badge and boxContextInstructions is merged into every
  // queued entry so the agent packs the results into that existing box.
  targetBoxCode?: string;
  boxContextInstructions?: string;
}) {
  const createEntry = useMutation(api.ingestionQueue.createEntry);
  const { enqueue } = useMediaUpload();

  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [instructions, setInstructions] = useState("");
  // Default to one combined entry; the user opts IN to splitting per photo.
  const [scope, setScope] = useState<CaptureScope>("combined");
  const [saving, setSaving] = useState(false);
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
      // When launched from a movable unit, fold the box handoff context into
      // every entry so the agent packs results into that existing box.
      const effectiveInstructions = boxContextInstructions
        ? [boxContextInstructions, trimmedInstructions].filter(Boolean).join("\n\n")
        : trimmedInstructions;

      // Split images out so the per-image fan-out only covers photos; audio/video
      // always ride along on a single entry (index 0 in the split path).
      const imageAttachments = attachments.filter(
        (attachment) => attachment.kind === "image",
      );
      const nonImageAttachments = attachments.filter(
        (attachment) => attachment.kind !== "image",
      );

      let entryCount = 0;
      if (perImage) {
        // One queued entry per image. createEntry runs FIRST (empty media,
        // expectedMediaCount = how many files we will upload for it); the
        // background uploader then attaches each photo as it finishes. Non-image
        // media folds into the first entry so nothing is dropped.
        for (const [index, attachment] of imageAttachments.entries()) {
          const extras = index === 0 ? nonImageAttachments : [];
          const entryId = await createEntry({
            householdId,
            moveId,
            instructions: effectiveInstructions,
            scopeHint: "singleItem",
            mediaPhotoIds: [],
            expectedMediaCount: 1 + extras.length,
          });
          enqueue(
            { entryId, householdId, moveId },
            [attachment, ...extras].map((item) => ({
              file: item.file,
              kind: item.kind,
            })),
          );
          entryCount += 1;
        }
      } else {
        // One combined entry holding all media. createEntry first (empty media,
        // expectedMediaCount = total attachments), then every file uploads in
        // the background and attaches to that entry.
        const entryId = await createEntry({
          householdId,
          moveId,
          instructions: effectiveInstructions,
          scopeHint:
            scopeChoiceVisible && scope === "combined" ? "scene" : undefined,
          mediaPhotoIds: [],
          expectedMediaCount: attachments.length,
        });
        if (attachments.length > 0) {
          enqueue(
            { entryId, householdId, moveId },
            attachments.map((attachment) => ({
              file: attachment.file,
              kind: attachment.kind,
            })),
          );
        }
        entryCount = 1;
      }

      // Free the form immediately — uploads continue in the background.
      setAttachments([]);
      setInstructions("");
      setScope("combined");
      // Room hint intentionally kept: capture sessions usually walk one room.
      const hadMedia = attachments.length > 0;
      setStatus(
        hadMedia
          ? entryCount > 1
            ? `Added ${entryCount} captures — photos uploading in the background. Ready for the next.`
            : "Added to the queue — photos uploading in the background. Ready for the next capture."
          : "Added to the queue. Ready for the next capture.",
      );
      onCreated?.({ entryCount });
    } catch (error) {
      // createEntry failed — keep the form intact so the user can retry.
      setStatus(
        error instanceof Error && error.message
          ? error.message
          : "Could not save this capture. Check your connection and retry."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card size="sm">
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
        {targetBoxCode ? (
          <Badge variant="secondary" className="w-fit gap-1.5">
            Adding to {targetBoxCode}
          </Badge>
        ) : null}
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-2 sm:p-3">
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
          <div className="rounded-md border border-border bg-muted/20 p-2 sm:p-3">
            <p className="text-xs font-medium text-foreground">
              How should your agent treat these {imageCount} photos?
            </p>
            <div
              role="group"
              aria-label="Capture scope"
              className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              <Button
                type="button"
                variant={scope === "combined" ? "default" : "outline"}
                aria-pressed={scope === "combined"}
                disabled={saving}
                onClick={() => setScope("combined")}
              >
                One entry
              </Button>
              <Button
                type="button"
                variant={scope === "perImage" ? "default" : "outline"}
                aria-pressed={scope === "perImage"}
                disabled={saving}
                onClick={() => setScope("perImage")}
              >
                Separate entries
              </Button>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {scope === "perImage"
                ? "Each photo becomes its own queued capture (one entry per photo) — best when every photo is a separate item."
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
