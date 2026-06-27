// Shared media-upload primitive, extracted from ingestion-capture-form.tsx so
// both the capture form and the background MediaUploadProvider run the exact
// same init → PUT → finalize pipeline. Unlike the old in-form version, the PUT
// step's onProgress and AbortSignal are wired through to the caller so the
// background provider can show per-file progress and cancel in-flight uploads.

import type { useAction, useMutation } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  fileSha256Hex,
  imageDimensions,
  uploadFileWithProgress,
} from "@/lib/photo-upload";

export type MediaKind = "image" | "audio" | "video";

// The three Convex endpoints the upload pipeline drives. Callers pass the bound
// hooks (useAction/useMutation results) so this stays a pure helper with no
// hook calls of its own — it can run inside an async loop in any component.
export type UploadDeps = {
  initUpload: ReturnType<typeof useAction<typeof api.photos.initUpload>>;
  finalizeUpload: ReturnType<typeof useAction<typeof api.photos.finalizeUpload>>;
  cancelUploadSession: ReturnType<
    typeof useMutation<typeof api.photos.cancelUploadSession>
  >;
};

export type UploadMediaArgs = {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  file: File;
  kind: MediaKind;
  deps: UploadDeps;
  // 0–100 upload progress for the PUT step. No-op by default.
  onProgress?: (progress: number) => void;
  // Lets the caller cancel an in-flight upload (e.g. provider teardown).
  signal?: AbortSignal;
  // Fired before each automatic retry so the UI can show "retrying (n/total)".
  onRetry?: (attempt: number, maxAttempts: number, error: unknown) => void;
};

// Total attempts (1 initial + retries) for a single file. Most failures we see
// are transient — an expired presigned URL, a dropped mobile connection, a B2
// hiccup — so a couple of automatic retries turns "too many failing" into a
// rare hard failure that still surfaces the manual retry UI as a last resort.
export const UPLOAD_MAX_ATTEMPTS = 3;

// Runs the full init → PUT → finalize flow for a single file and returns the
// finalized itemPhotos id. Automatically retries transient failures with
// exponential backoff, RE-INITIALIZING a fresh upload session (and presigned
// URL) on each attempt — a retry must never reuse an expired URL. On every
// failed attempt the upload session is cancelled (best effort) so a half-open
// session is never left behind. Only after attempts are exhausted (or a
// permanent/validation error) does it throw.
export async function uploadMediaFile({
  householdId,
  moveId,
  file,
  kind,
  deps,
  onProgress,
  signal,
  onRetry,
}: UploadMediaArgs): Promise<Id<"itemPhotos">> {
  const isImage = kind === "image";
  const [dimensions, originalHash] = await Promise.all([
    isImage ? imageDimensions(file) : Promise.resolve(undefined),
    fileSha256Hex(file),
  ]);

  let lastError: unknown;
  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    let uploadSessionId: Id<"photoUploadSessions"> | undefined;
    try {
      const session = await deps.initUpload({
        householdId,
        moveId,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      uploadSessionId = session.uploadSessionId as Id<"photoUploadSessions">;

      await uploadFileWithProgress({
        file,
        uploadUrl: session.uploadUrl,
        contentType: session.headers["Content-Type"],
        onProgress: onProgress ?? (() => {}),
        signal: signal ?? new AbortController().signal,
      });

      const finalizeResult = normalizeFinalizeUploadResult(
        await deps.finalizeUpload({
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
        }),
      );
      return finalizeResult.photoId;
    } catch (error) {
      lastError = error;
      if (uploadSessionId) {
        await deps
          .cancelUploadSession({ householdId, moveId, uploadSessionId })
          .catch(() => {});
      }
      if (attempt >= UPLOAD_MAX_ATTEMPTS || !isRetryableUploadError(error, signal)) {
        throw error;
      }
      onRetry?.(attempt, UPLOAD_MAX_ATTEMPTS, error);
      await abortableDelay(retryDelayMs(attempt), signal);
    }
  }
  throw lastError;
}

// A retry only helps for transient failures. Bail immediately on caller cancels
// and on deterministic client/validation/permission errors, where re-uploading
// the same bytes to a fresh URL would fail identically.
export function isRetryableUploadError(
  error: unknown,
  signal?: AbortSignal,
): boolean {
  if (signal?.aborted) return false;
  const name = (error as { name?: string } | null)?.name;
  if (name === "AbortError") return false;
  const message = String(
    (error as { message?: string } | null)?.message ?? error,
  ).toLowerCase();
  const permanent = [
    "too large",
    "unsupported",
    "not allowed",
    "not configured",
    "permission",
    "forbidden",
    "invalid api key",
    "unauthorized",
    "did not return a photo id",
  ];
  if (permanent.some((needle) => message.includes(needle))) return false;
  return true;
}

function retryDelayMs(attempt: number): number {
  const base = Math.min(8000, 400 * 2 ** (attempt - 1));
  return base + Math.floor(Math.random() * 250);
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload aborted", "AbortError"));
      return;
    }
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Upload aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort);
  });
}

// finalizeUpload may return either a bare id string or an object with a photoId;
// normalize both into a typed id (kept identical to the form's old helper).
export function normalizeFinalizeUploadResult(value: unknown): {
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
