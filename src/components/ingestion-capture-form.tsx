"use client";

import { type ChangeEvent, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { Camera, Loader2, Plus, X } from "lucide-react";

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
  createImageDerivatives,
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
    const [dimensions, originalHash, derivatives] = await Promise.all([
      isImage ? imageDimensions(file) : Promise.resolve(undefined),
      fileSha256Hex(file),
      isImage ? createImageDerivatives(file) : Promise.resolve([]),
    ]);

    const session = await initUpload({
      householdId,
      moveId,
      room: roomHint.trim() || undefined,
      mimeType: file.type,
      sizeBytes: file.size,
      derivatives: derivatives.length
        ? derivatives.map((derivative) => ({
            variant: derivative.variant,
            mimeType: derivative.mimeType,
            sizeBytes: derivative.sizeBytes,
            width: derivative.width,
            height: derivative.height,
          }))
        : undefined,
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
      for (const derivativeUpload of session.derivativeUploads) {
        const derivative = derivatives.find(
          (entry) => entry.variant === derivativeUpload.variant
        );
        if (!derivative) {
          throw new Error("Derivative upload is missing.");
        }
        await uploadFileWithProgress({
          file: derivative.blob,
          uploadUrl: derivativeUpload.uploadUrl,
          contentType: derivativeUpload.headers["Content-Type"],
          onProgress: () => {},
          signal: abortController.signal,
        });
      }

      const photoId = await finalizeUpload({
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
      });
      return photoId as Id<"itemPhotos">;
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
        <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            Add photos, audio, or video
          </span>
          <span className="text-xs">
            Tap to use the camera or pick files. Voice memos attach as audio.
          </span>
          <input
            type="file"
            accept="image/*,audio/*,video/*"
            multiple
            className="sr-only"
            aria-label="Capture media"
            disabled={!moveId || saving}
            onChange={handleFilesChange}
          />
        </label>

        {attachments.length ? (
          <ul className="space-y-1.5" aria-label="Pending attachments">
            {attachments.map((attachment, index) => (
              <li
                key={`${attachment.file.name}-${index}`}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-xs"
              >
                <span className="min-w-0 truncate">{attachment.file.name}</span>
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
          disabled={!moveId || saving}
        />
        <Input
          value={roomHint}
          onChange={(event) => setRoomHint(event.target.value)}
          placeholder="Room (optional, kept between captures)"
          aria-label="Room hint"
          disabled={!moveId || saving}
        />

        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={!moveId || saving}
          onClick={() => void handleAddToQueue()}
        >
          {saving ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus aria-hidden="true" />
          )}
          Add to queue
        </Button>

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
