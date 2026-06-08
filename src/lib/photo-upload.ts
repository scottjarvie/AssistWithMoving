export const allowedPhotoMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const maxPhotoUploadBytes = 25 * 1024 * 1024;

export type PhotoUploadValidation = {
  ok: boolean;
  message?: string;
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

export function uploadFileWithProgress({
  file,
  uploadUrl,
  contentType,
  onProgress,
  signal,
}: {
  file: File;
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
