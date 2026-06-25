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
};

// Runs the full init → PUT → finalize flow for a single file and returns the
// finalized itemPhotos id. On any failure the upload session is cancelled (best
// effort) before the error is rethrown, so a half-open session is never left
// behind. This is the body that used to live in the form's uploadAttachment.
export async function uploadMediaFile({
  householdId,
  moveId,
  file,
  kind,
  deps,
  onProgress,
  signal,
}: UploadMediaArgs): Promise<Id<"itemPhotos">> {
  const isImage = kind === "image";
  const [dimensions, originalHash] = await Promise.all([
    isImage ? imageDimensions(file) : Promise.resolve(undefined),
    fileSha256Hex(file),
  ]);

  const session = await deps.initUpload({
    householdId,
    moveId,
    mimeType: file.type,
    sizeBytes: file.size,
  });
  const uploadSessionId = session.uploadSessionId as Id<"photoUploadSessions">;

  try {
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
    await deps
      .cancelUploadSession({ householdId, moveId, uploadSessionId })
      .catch(() => {});
    throw error;
  }
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
