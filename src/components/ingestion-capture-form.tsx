"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import {
  Camera,
  FileAudio,
  FileImage,
  FileVideo,
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

// Mobile-first capture: photos/voice notes/clips plus typed (or dictated)
// directions become one ingestion-queue entry for the user's AI agent.
export function IngestionCaptureForm({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const initUpload = useAction(api.photos.initUpload);
  const finalizeUpload = useAction(api.photos.finalizeUpload);
  const cancelUploadSession = useMutation(api.photos.cancelUploadSession);
  const createEntry = useMutation(api.ingestionQueue.createEntry);

  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [instructions, setInstructions] = useState("");
  const [roomHint, setRoomHint] = useState("");
  const [saving, setSaving] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canAttachMedia = Boolean(householdId && moveId && !saving);
  const canSubmit =
    canAttachMedia && (instructions.trim().length > 0 || attachments.length > 0);

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
      room: roomHint.trim() || undefined,
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
      const mediaPhotoIds: Id<"itemPhotos">[] = [];
      for (const [index, attachment] of attachments.entries()) {
        setProgressLabel(
          `Uploading ${index + 1} of ${attachments.length} (${attachment.file.name})`
        );
        mediaPhotoIds.push(await uploadAttachment(attachment));
      }

      setProgressLabel("Saving queue entry");
      await createEntry({
        householdId,
        moveId,
        instructions: instructions.trim() || undefined,
        roomHint: roomHint.trim() || undefined,
        mediaPhotoIds,
      });

      setAttachments([]);
      setInstructions("");
      // Room hint intentionally kept: capture sessions usually walk one room.
      setStatus("Added to the queue. Ready for the next capture.");
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
          <Camera className="size-4 text-primary" aria-hidden="true" />
          Capture for your AI agent
        </CardTitle>
        <CardDescription>
          Snap photos, attach a voice note, and say what should happen. Your
          agent processes the queue later — nothing becomes inventory without
          your approval.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Camera className="size-4 text-primary" aria-hidden="true" />
                Add media for this capture
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Photos, voice notes, or short clips can travel with one set of
                agent directions.
              </p>
            </div>
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
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,audio/*,video/*"
            multiple
            className="sr-only"
            aria-label="Capture media"
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

        <Textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder="Directions for your agent — type or use voice dictation. Example: blue bin is holiday stuff, sell the lamp, everything else goes in the trailer."
          aria-label="Directions for your agent"
          className="min-h-24 text-base"
          autoCapitalize="sentences"
          autoCorrect="on"
          disabled={!householdId || !moveId || saving}
        />
        <Input
          value={roomHint}
          onChange={(event) => setRoomHint(event.target.value)}
          placeholder="Room (optional, kept between captures)"
          aria-label="Room hint"
          disabled={!householdId || !moveId || saving}
        />

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
            {attachments.length
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
