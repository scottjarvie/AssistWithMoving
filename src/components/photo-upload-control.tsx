"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { Camera, FileImage, RotateCcw, Upload, X } from "lucide-react";

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

type UploadedPhoto = {
  photoId: Id<"itemPhotos">;
  width: number;
  height: number;
};

const uploadProgressWeights = {
  prepare: 0.1,
  original: 0.6,
  derivatives: 0.25,
  finalize: 0.05,
};

export function PhotoUploadControl({
  householdId,
  moveId,
  itemId,
  boxId,
  room,
  label = "Upload photo",
  photoType,
  privacyLevel = "normal",
  visibilityScope = "moveCollaborators",
  multiple = false,
  onUploaded,
}: PhotoUploadTarget & {
  label?: string;
  photoType?: "item" | "boxContents" | "blueprint";
  privacyLevel?: "normal" | "private";
  visibilityScope?: "moveCollaborators" | "private";
  multiple?: boolean;
  onUploaded?: (photo: UploadedPhoto) => void;
}) {
  const initUpload = useAction(api.photos.initUpload);
  const finalizeUpload = useAction(api.photos.finalizeUpload);
  const cancelUploadSession = useMutation(api.photos.cancelUploadSession);
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [uploadSessionId, setUploadSessionId] =
    useState<Id<"photoUploadSessions"> | null>(null);
  const [uploading, setUploading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadSessionRef = useRef<Id<"photoUploadSessions"> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedCount = files.length;

  function clearFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function acceptSelectedFiles(selectedFiles: FileList | File[] | null) {
    setProgress(0);
    setStatus(null);
    setUploadSessionId(null);
    uploadSessionRef.current = null;

    const nextFiles = Array.from(selectedFiles ?? []).slice(0, multiple ? undefined : 1);
    if (nextFiles.length === 0) {
      setFiles([]);
      return;
    }

    for (const selectedFile of nextFiles) {
      const validation = validatePhotoUploadFile(selectedFile);
      if (!validation.ok) {
        setFiles([]);
        clearFileInput();
        setStatus(validation.message ?? "Photo is not valid.");
        return;
      }
    }

    setFiles(nextFiles);
    setStatus(null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptSelectedFiles(event.target.files);
  }

  async function handleUpload() {
    if (!householdId || !moveId || files.length === 0) {
      return;
    }

    setUploading(true);
    setStatus(null);
    setProgress(0);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    let uploadedCount = 0;

    try {
      for (const [index, selectedFile] of files.entries()) {
        setStatus(formatUploadStatus(index, files.length, selectedFile.name));
        const uploadedPhoto = await uploadSingleFile({
          file: selectedFile,
          abortController,
          onProgress: (fileProgress) => {
            const totalProgress = (index + fileProgress) / files.length;
            setProgress(Math.round(totalProgress * 100));
          },
        });
        uploadedCount += 1;
        onUploaded?.(uploadedPhoto);
      }

      setProgress(100);
      setStatus(formatUploadSuccess(uploadedCount));
      setFiles([]);
      setCaption("");
      clearFileInput();
      setUploadSessionId(null);
      uploadSessionRef.current = null;
    } catch (error) {
      if (uploadedCount > 0) {
        setFiles(files.slice(uploadedCount));
      }
      setStatus(photoUploadFailureMessage(error, uploadedCount));
    } finally {
      abortControllerRef.current = null;
      setUploading(false);
    }
  }

  async function uploadSingleFile({
    file,
    abortController,
    onProgress,
  }: {
    file: File;
    abortController: AbortController;
    onProgress: (progress: number) => void;
  }) {
    let activeUploadSessionId: Id<"photoUploadSessions"> | null = null;

    try {
      onProgress(0);
      const [{ width, height }, originalHash, derivatives] = await Promise.all([
        imageDimensions(file),
        fileSha256Hex(file),
        createImageDerivatives(file),
      ]);
      onProgress(uploadProgressWeights.prepare);

      const session = await initUpload({
        householdId: householdId!,
        moveId: moveId!,
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
        onProgress: (nextProgress) => {
          onProgress(
            uploadProgressWeights.prepare +
              (nextProgress / 100) * uploadProgressWeights.original
          );
        },
        signal: abortController.signal,
      });

      const derivativeUploads = session.derivativeUploads ?? [];
      if (derivativeUploads.length > 0) {
        for (const [derivativeIndex, derivativeUpload] of derivativeUploads.entries()) {
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
            onProgress: (nextProgress) => {
              const derivativeProgress =
                (derivativeIndex + nextProgress / 100) / derivativeUploads.length;
              onProgress(
                uploadProgressWeights.prepare +
                  uploadProgressWeights.original +
                  derivativeProgress * uploadProgressWeights.derivatives
              );
            },
            signal: abortController.signal,
          });
        }
      }

      onProgress(
        uploadProgressWeights.prepare +
          uploadProgressWeights.original +
          uploadProgressWeights.derivatives
      );

      const photoId = (await finalizeUpload({
        householdId: householdId!,
        moveId: moveId!,
        uploadSessionId: activeUploadSessionId,
        width,
        height,
        originalHash,
        caption,
        photoType: photoType ?? (boxId ? "boxContents" : "item"),
        privacyLevel,
        visibilityScope,
        exifHandlingStatus: "pending",
        confidence: "manual",
        verificationStatus: "unreviewed",
      })) as Id<"itemPhotos">;

      onProgress(1);
      setUploadSessionId(null);
      uploadSessionRef.current = null;
      return { photoId, width, height };
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
      throw error;
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
    files.length > 0 &&
    !uploading &&
    Boolean(status) &&
    /cancelled|failed|rejected|not configured/i.test(status ?? "");

  const canSelectFiles = Boolean(householdId && moveId && !uploading);
  const visibleFiles = files.slice(0, 3);
  const hiddenFileCount = Math.max(files.length - visibleFiles.length, 0);

  return (
    <div
      className="rounded-md border border-border bg-card p-3"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (canSelectFiles) {
          acceptSelectedFiles(event.dataTransfer.files);
        }
      }}
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)]">
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Camera className="size-4 text-primary" aria-hidden="true" />
                {label}
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                JPEG, PNG, or WebP originals. Web versions are prepared during
                upload.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canSelectFiles}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileImage aria-hidden="true" />
              {multiple ? "Choose photos" : "Choose photo"}
            </Button>
          </div>
          <Input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture={multiple ? undefined : "environment"}
            multiple={multiple}
            aria-label={label}
            className="sr-only"
            disabled={!canSelectFiles}
            onChange={handleFileChange}
          />

          {selectedCount > 0 ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <FileImage className="size-3.5" aria-hidden="true" />
                {formatSelectedFiles(files)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {visibleFiles.map((file) => (
                  <span
                    key={`${file.name}:${file.size}:${file.lastModified}`}
                    className="max-w-full truncate rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
                    title={file.name}
                  >
                    {file.name} · {formatFileSize(file.size)}
                  </span>
                ))}
                {hiddenFileCount ? (
                  <span className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                    +{hiddenFileCount} more
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
              Drop photos here or choose files.
            </div>
          )}
        </div>

        <div className="grid content-start gap-2">
          <Input
            value={caption}
            disabled={uploading}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Caption (optional)"
            aria-label="Photo caption"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={files.length === 0 || uploading}
              onClick={() => void handleUpload()}
            >
              <Upload aria-hidden="true" />
              {files.length > 1 ? `Upload ${files.length}` : "Upload"}
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

function formatSelectedFiles(files: File[]) {
  if (files.length === 1) {
    return files[0]?.name ?? "1 photo selected";
  }
  return `${files.length} photos selected`;
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

function formatUploadStatus(index: number, total: number, fileName: string) {
  if (total === 1) {
    return `Uploading ${fileName}.`;
  }
  return `Uploading ${index + 1} of ${total}: ${fileName}.`;
}

function formatUploadSuccess(count: number) {
  return count === 1
    ? "Photo uploaded. Web versions ready."
    : `${count} photos uploaded. Web versions ready.`;
}

function photoUploadFailureMessage(error: unknown, uploadedCount = 0) {
  const prefix =
    uploadedCount > 0
      ? `${uploadedCount} ${uploadedCount === 1 ? "photo" : "photos"} uploaded. `
      : "";

  if (error instanceof DOMException && error.name === "AbortError") {
    return `${prefix}Upload cancelled.`;
  }

  const message = error instanceof Error ? error.message : "";
  if (
    /Backblaze B2 is not configured|NoSuchBucket|bad_auth_token|SignatureDoesNotMatch/i.test(
      message
    )
  ) {
    return `${prefix}Photo storage is not configured. Retry after setup is fixed.`;
  }

  if (
    /CORS|Failed to fetch|NetworkError|Upload failed|status 403|status 404/i.test(
      message
    )
  ) {
    return `${prefix}Photo storage rejected the upload. Check bucket CORS, credentials, and retry.`;
  }

  return `${prefix}Upload failed. Retry when ready.`;
}
