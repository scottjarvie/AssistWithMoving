export const allowedPhotoMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const maxPhotoUploadBytes = 25 * 1024 * 1024;

export const photoDerivativeSpecs = [
  { variant: "thumb", maxSide: 200, quality: 0.78 },
  { variant: "card", maxSide: 600, quality: 0.82 },
  { variant: "detail", maxSide: 1200, quality: 0.86 },
  { variant: "full", maxSide: 2400, quality: 0.9 },
] as const;

export type PhotoUploadValidation = {
  ok: boolean;
  message?: string;
};

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
  maxSide,
}: {
  width: number;
  height: number;
  maxSide: number;
}) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
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
        maxSide: spec.maxSide,
      });
      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Could not create image derivative.");
      }
      context.drawImage(image, 0, 0, dimensions.width, dimensions.height);

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
        width: dimensions.width,
        height: dimensions.height,
      });
    }

    return derivatives;
  } finally {
    URL.revokeObjectURL(url);
  }
}

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

    function abortUpload() {
      request.abort();
      reject(new DOMException("Upload cancelled.", "AbortError"));
    }

    if (signal.aborted) {
      abortUpload();
      return;
    }

    signal.addEventListener("abort", abortUpload, { once: true });

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => {
      signal.removeEventListener("abort", abortUpload);
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${request.status}.`));
      }
    };
    request.onerror = () => {
      signal.removeEventListener("abort", abortUpload);
      reject(new Error("Upload failed."));
    };
    request.onabort = () => {
      signal.removeEventListener("abort", abortUpload);
      reject(new DOMException("Upload cancelled.", "AbortError"));
    };
    request.open("PUT", uploadUrl);
    request.setRequestHeader("Content-Type", contentType);
    request.send(file);
  });
}
