export const allowedPhotoMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const allowedAudioMimeTypes = [
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
] as const;

export const allowedVideoMimeTypes = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export const allowedMediaMimeTypes = [
  ...allowedPhotoMimeTypes,
  ...allowedAudioMimeTypes,
  ...allowedVideoMimeTypes,
] as const;

export const maxPhotoUploadBytes = 25 * 1024 * 1024;
export const maxAudioUploadBytes = 100 * 1024 * 1024;
export const maxVideoUploadBytes = 500 * 1024 * 1024;

export const photoDerivativeSpecs = [
  { variant: "thumb", width: 200, height: 200, fit: "cover", quality: 0.78 },
  { variant: "card", width: 600, height: 600, fit: "inside", quality: 0.82 },
  { variant: "detail", width: 1200, height: 1200, fit: "inside", quality: 0.86 },
  { variant: "full", width: 2400, height: 2400, fit: "inside", quality: 0.9 },
] as const;

export type PhotoUploadValidation = {
  ok: boolean;
  message?: string;
};

export type MediaKind = "image" | "audio" | "video";

export type PhotoDerivativeUpload = {
  variant: (typeof photoDerivativeSpecs)[number]["variant"];
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
};

export function validatePhotoUploadFile(file: Pick<File, "type" | "size">) {
  if (
    !allowedPhotoMimeTypes.includes(
      file.type as (typeof allowedPhotoMimeTypes)[number]
    )
  ) {
    return {
      ok: false,
      message: "Use a JPEG, PNG, or WebP image.",
    } satisfies PhotoUploadValidation;
  }

  if (file.size <= 0 || file.size > maxPhotoUploadBytes) {
    return {
      ok: false,
      message: "Use an image under 25 MB.",
    } satisfies PhotoUploadValidation;
  }

  return { ok: true } satisfies PhotoUploadValidation;
}

export function validateMediaUploadFile(file: Pick<File, "type" | "size">) {
  const mediaKind = mediaKindForMimeType(file.type);
  if (!mediaKind) {
    return {
      ok: false,
      message:
        "Use JPEG, PNG, WebP, MP3, M4A, AAC, WAV, WebM, OGG, MP4, or MOV.",
    } satisfies PhotoUploadValidation;
  }

  const maxBytes = maxUploadBytesForMediaKind(mediaKind);
  if (file.size <= 0 || file.size > maxBytes) {
    return {
      ok: false,
      message: sizeLimitMessage(mediaKind),
    } satisfies PhotoUploadValidation;
  }

  return { ok: true } satisfies PhotoUploadValidation;
}

export function mediaKindForMimeType(mimeType: string): MediaKind | null {
  const normalized = mimeType.trim().toLowerCase().split(";")[0] ?? "";
  if (
    allowedPhotoMimeTypes.includes(
      normalized as (typeof allowedPhotoMimeTypes)[number]
    )
  ) {
    return "image";
  }
  if (
    allowedAudioMimeTypes.includes(
      normalized as (typeof allowedAudioMimeTypes)[number]
    )
  ) {
    return "audio";
  }
  if (
    allowedVideoMimeTypes.includes(
      normalized as (typeof allowedVideoMimeTypes)[number]
    )
  ) {
    return "video";
  }
  return null;
}

export function maxUploadBytesForMediaKind(mediaKind: MediaKind) {
  switch (mediaKind) {
    case "image":
      return maxPhotoUploadBytes;
    case "audio":
      return maxAudioUploadBytes;
    case "video":
      return maxVideoUploadBytes;
  }
}

export function sizeLimitMessage(mediaKind: MediaKind) {
  switch (mediaKind) {
    case "image":
      return "Use an image under 25 MB.";
    case "audio":
      return "Use an audio file under 100 MB.";
    case "video":
      return "Use a video file under 500 MB.";
  }
}

export async function fileSha256Hex(file: File) {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function imageDimensions(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image dimensions."));
    };
    image.src = url;
  });
}

export function fitWithin({
  width,
  height,
  maxWidth,
  maxHeight,
}: {
  width: number;
  height: number;
  maxWidth: number;
  maxHeight: number;
}) {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function coverDimensions({
  width,
  height,
  targetWidth,
  targetHeight,
}: {
  width: number;
  height: number;
  targetWidth: number;
  targetHeight: number;
}) {
  const scale = Math.max(targetWidth / width, targetHeight / height);
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  return {
    sourceX: Math.max(0, Math.round((scaledWidth - targetWidth) / 2 / scale)),
    sourceY: Math.max(0, Math.round((scaledHeight - targetHeight) / 2 / scale)),
    sourceWidth: Math.max(1, Math.round(targetWidth / scale)),
    sourceHeight: Math.max(1, Math.round(targetHeight / scale)),
    width: targetWidth,
    height: targetHeight,
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });
}

export async function createImageDerivatives(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not read image."));
      image.src = url;
    });

    const derivatives: PhotoDerivativeUpload[] = [];
    for (const spec of photoDerivativeSpecs) {
      const dimensions = fitWithin({
        width: image.naturalWidth,
        height: image.naturalHeight,
        maxWidth: spec.width,
        maxHeight: spec.height,
      });
      const canvas = document.createElement("canvas");
      canvas.width = spec.fit === "cover" ? spec.width : dimensions.width;
      canvas.height = spec.fit === "cover" ? spec.height : dimensions.height;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Could not create image derivative.");
      }
      if (spec.fit === "cover") {
        const cover = coverDimensions({
          width: image.naturalWidth,
          height: image.naturalHeight,
          targetWidth: spec.width,
          targetHeight: spec.height,
        });
        context.drawImage(
          image,
          cover.sourceX,
          cover.sourceY,
          cover.sourceWidth,
          cover.sourceHeight,
          0,
          0,
          cover.width,
          cover.height,
        );
      } else {
        context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
      }

      let mimeType = "image/webp";
      let blob = await canvasToBlob(canvas, mimeType, spec.quality);
      if (!blob) {
        mimeType = "image/jpeg";
        blob = await canvasToBlob(canvas, mimeType, spec.quality);
      }
      if (!blob) {
        throw new Error("Could not create image derivative.");
      }

      derivatives.push({
        variant: spec.variant,
        blob,
        mimeType,
        sizeBytes: blob.size,
        width: canvas.width,
        height: canvas.height,
      });
    }

    return derivatives;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Idle ceiling for a single PUT to B2. XHR's native timeout caps total request
// time, which breaks large files on slow-but-progressing links. Instead, retry
// only when no upload progress arrives for this window.
export const UPLOAD_STALL_TIMEOUT_MS = 45_000;

export function uploadFileWithProgress({
  file,
  uploadUrl,
  contentType,
  onProgress,
  signal,
}: {
  file: Blob;
  uploadUrl: string;
  contentType: string;
  onProgress: (progress: number) => void;
  signal: AbortSignal;
}) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    let stallTimer: ReturnType<typeof setTimeout> | undefined;

    function clearStallTimer() {
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = undefined;
      }
    }

    function armStallTimer() {
      clearStallTimer();
      stallTimer = setTimeout(() => {
        signal.removeEventListener("abort", abortUpload);
        reject(new Error("Upload timed out. Check your connection."));
        request.abort();
      }, UPLOAD_STALL_TIMEOUT_MS);
    }

    function abortUpload() {
      clearStallTimer();
      signal.removeEventListener("abort", abortUpload);
      request.abort();
      reject(new DOMException("Upload cancelled.", "AbortError"));
    }

    if (signal.aborted) {
      abortUpload();
      return;
    }

    signal.addEventListener("abort", abortUpload, { once: true });

    request.upload.onprogress = (event) => {
      armStallTimer();
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => {
      clearStallTimer();
      signal.removeEventListener("abort", abortUpload);
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${request.status}.`));
      }
    };
    request.onerror = () => {
      clearStallTimer();
      signal.removeEventListener("abort", abortUpload);
      reject(new Error("Upload failed."));
    };
    request.onabort = () => {
      clearStallTimer();
      signal.removeEventListener("abort", abortUpload);
      reject(new DOMException("Upload cancelled.", "AbortError"));
    };
    request.open("PUT", uploadUrl);
    request.setRequestHeader("Content-Type", contentType);
    request.send(file);
    armStallTimer();
  });
}
