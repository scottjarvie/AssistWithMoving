"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { Camera, RotateCcw, Upload, X } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createImageDerivatives,
  fileSha256Hex,
  imageDimensions,
  uploadFileWithProgress,
  validatePhotoUploadFile,
} from "@/lib/photo-upload";

type PhotoUploadTarget = {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  itemId?: Id<"items">;
  boxId?: Id<"boxes">;
  room?: string;
};

export function PhotoUploadControl({
  householdId,
  moveId,
  itemId,
  boxId,
  room,
  label = "Upload photo",
}: PhotoUploadTarget & {
  label?: string;
}) {
  const initUpload = useAction(api.photos.initUpload);
  const finalizeUpload = useAction(api.photos.finalizeUpload);
  const cancelUploadSession = useMutation(api.photos.cancelUploadSession);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [uploadSessionId, setUploadSessionId] =
    useState<Id<"photoUploadSessions"> | null>(null);
  const [uploading, setUploading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadSessionRef = useRef<Id<"photoUploadSessions"> | null>(null);

  function acceptSelectedFile(selectedFile: File | null) {
    setProgress(0);
    setStatus(null);
    setUploadSessionId(null);
    uploadSessionRef.current = null;

    if (!selectedFile) {
      setFile(null);
      return;
    }

    const validation = validatePhotoUploadFile(selectedFile);
    if (!validation.ok) {
      setFile(null);
      setStatus(validation.message ?? "Photo is not valid.");
      return;
    }

    setFile(selectedFile);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptSelectedFile(event.target.files?.[0] ?? null);
  }

  async function handleUpload() {
    if (!householdId || !moveId || !file) {
      return;
    }

    setUploading(true);
    setStatus(null);
    setProgress(0);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    let activeUploadSessionId: Id<"photoUploadSessions"> | null = null;

    try {
      const [{ width, height }, originalHash, derivatives] = await Promise.all([
        imageDimensions(file),
        fileSha256Hex(file),
        createImageDerivatives(file),
      ]);
      const session = await initUpload({
        householdId,
        moveId,
        itemId,
        boxId,
        room,
        mimeType: file.type,
        sizeBytes: file.size,
        derivatives: derivatives.map((derivative) => ({
          variant: derivative.variant,
          mimeType: derivative.mimeType,
          sizeBytes: derivative.sizeBytes,
          width: derivative.width,
          height: derivative.height,
        })),
      });
      activeUploadSessionId =
        session.uploadSessionId as Id<"photoUploadSessions">;
      setUploadSessionId(activeUploadSessionId);
      uploadSessionRef.current = activeUploadSessionId;

      await uploadFileWithProgress({
        file,
        uploadUrl: session.uploadUrl,
        contentType: session.headers["Content-Type"],
        onProgress: (nextProgress) =>
          setProgress(Math.round(nextProgress * 0.7)),
        signal: abortController.signal,
      });
      for (const derivativeUpload of session.derivativeUploads) {
        const derivative = derivatives.find(
          (entry) => entry.variant === derivativeUpload.variant
        );
        if (!derivative) {
          throw new Error("Derivative upload is missing.");
        }
        const derivativeIndex = session.derivativeUploads.indexOf(derivativeUpload);
        await uploadFileWithProgress({
          file: derivative.blob,
          uploadUrl: derivativeUpload.uploadUrl,
          contentType: derivativeUpload.headers["Content-Type"],
          onProgress: (nextProgress) => {
            const derivativeProgress =
              (derivativeIndex + nextProgress / 100) /
              session.derivativeUploads.length;
            setProgress(Math.round(70 + derivativeProgress * 25));
          },
          signal: abortController.signal,
        });
      }
      setProgress(96);

      await finalizeUpload({
        householdId,
        moveId,
        uploadSessionId: activeUploadSessionId,
        width,
        height,
        originalHash,
        caption,
        photoType: boxId ? "boxContents" : "item",
        privacyLevel: "normal",
        visibilityScope: "moveCollaborators",
        exifHandlingStatus: "pending",
        confidence: "manual",
        verificationStatus: "unreviewed",
      });

      setStatus("Photo uploaded.");
      setFile(null);
      setCaption("");
      setUploadSessionId(null);
      uploadSessionRef.current = null;
    } catch (error) {
      if (
        householdId &&
        moveId &&
        activeUploadSessionId &&
        !(error instanceof DOMException && error.name === "AbortError")
      ) {
        await cancelUploadSession({
          householdId,
          moveId,
          uploadSessionId: activeUploadSessionId,
        });
      }
      setStatus(
        error instanceof DOMException && error.name === "AbortError"
          ? "Upload cancelled."
          : "Upload failed. Retry when ready."
      );
    } finally {
      abortControllerRef.current = null;
      setUploading(false);
    }
  }

  async function handleCancel() {
    abortControllerRef.current?.abort();
    const activeUploadSessionId = uploadSessionRef.current ?? uploadSessionId;
    if (householdId && moveId && activeUploadSessionId) {
      await cancelUploadSession({
        householdId,
        moveId,
        uploadSessionId: activeUploadSessionId,
      });
    }
    uploadSessionRef.current = null;
    setUploading(false);
  }

  const canRetry =
    file &&
    !uploading &&
    (status === "Upload failed. Retry when ready." ||
      status === "Upload cancelled.");

  return (
    <div
      className="rounded-md border border-border p-3"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        acceptSelectedFile(event.dataTransfer.files?.[0] ?? null);
      }}
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Camera className="size-4 text-primary" aria-hidden="true" />
        {label}
      </div>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          aria-label={label}
          disabled={!householdId || !moveId || uploading}
          onChange={handleFileChange}
        />
        <Input
          value={caption}
          disabled={uploading}
          onChange={(event) => setCaption(event.target.value)}
          placeholder="Caption"
          aria-label="Photo caption"
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!file || uploading}
            onClick={() => void handleUpload()}
          >
            <Upload aria-hidden="true" />
            Upload
          </Button>
          {uploading ? (
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              onClick={() => void handleCancel()}
            >
              <X aria-hidden="true" />
              <span className="sr-only">Cancel upload</span>
            </Button>
          ) : canRetry ? (
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              onClick={() => void handleUpload()}
            >
              <RotateCcw aria-hidden="true" />
              <span className="sr-only">Retry upload</span>
            </Button>
          ) : null}
        </div>
      </div>
      {uploading ? (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
      {status ? (
        <p
          className="mt-2 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}
