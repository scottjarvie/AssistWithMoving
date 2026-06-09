export const mediaKinds = ["image", "audio", "video"] as const;

export type MediaKind = (typeof mediaKinds)[number];

export const allowedImageMimeTypes = [
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
  ...allowedImageMimeTypes,
  ...allowedAudioMimeTypes,
  ...allowedVideoMimeTypes,
] as const;

export const maxImageUploadBytes = 25 * 1024 * 1024;
export const maxAudioUploadBytes = 100 * 1024 * 1024;
export const maxVideoUploadBytes = 500 * 1024 * 1024;

export type UploadFileShape = {
  mimeType: string;
  sizeBytes: number;
};

export type NormalizedUploadFileShape = UploadFileShape & {
  mediaKind: MediaKind;
  maxBytes: number;
};

export function normalizeMimeType(mimeType: string) {
  return mimeType.trim().toLowerCase().split(";")[0] ?? "";
}

export function mediaKindForMimeType(mimeType: string): MediaKind | null {
  const normalized = normalizeMimeType(mimeType);
  if (isAllowedImageMimeType(normalized)) return "image";
  if (isAllowedAudioMimeType(normalized)) return "audio";
  if (isAllowedVideoMimeType(normalized)) return "video";
  return null;
}

export function assertOriginalUploadFileShape({
  mimeType,
  sizeBytes,
}: UploadFileShape): NormalizedUploadFileShape {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const mediaKind = mediaKindForMimeType(normalizedMimeType);
  if (!mediaKind) {
    throw new Error(
      "Unsupported media type. Use JPEG, PNG, WebP, MP3, M4A, AAC, WAV, WebM, OGG, MP4, or MOV.",
    );
  }

  const maxBytes = maxUploadBytesForMediaKind(mediaKind);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) {
    throw new Error(sizeLimitMessage(mediaKind));
  }

  return {
    mimeType: normalizedMimeType,
    mediaKind,
    sizeBytes,
    maxBytes,
  };
}

export function assertImageDerivativeUploadFileShape({
  mimeType,
  sizeBytes,
}: UploadFileShape): NormalizedUploadFileShape {
  const normalizedMimeType = normalizeMimeType(mimeType);
  if (!isAllowedImageMimeType(normalizedMimeType)) {
    throw new Error("Image derivatives must be JPEG, PNG, or WebP.");
  }
  if (
    !Number.isFinite(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > maxImageUploadBytes
  ) {
    throw new Error("Image derivatives must be under 25 MB.");
  }

  return {
    mimeType: normalizedMimeType,
    mediaKind: "image",
    sizeBytes,
    maxBytes: maxImageUploadBytes,
  };
}

export function assertDerivativeUploadsAllowed(
  mediaKind: MediaKind,
  derivativeCount: number,
) {
  if (mediaKind !== "image" && derivativeCount > 0) {
    throw new Error("Audio and video uploads cannot include image derivatives.");
  }
}

export function assertImageDimensions({
  mediaKind,
  width,
  height,
}: {
  mediaKind: MediaKind;
  width?: number;
  height?: number;
}) {
  if (mediaKind !== "image") return;
  if (!isPositiveFiniteNumber(width) || !isPositiveFiniteNumber(height)) {
    throw new Error("Image uploads require positive width and height.");
  }
}

export function mediaObjectPrefix(mediaKind: MediaKind) {
  switch (mediaKind) {
    case "image":
      return "photos";
    case "audio":
      return "audio";
    case "video":
      return "videos";
  }
}

export function fileExtensionForMediaMimeType(mimeType: string) {
  switch (normalizeMimeType(mimeType)) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "audio/mpeg":
      return "mp3";
    case "audio/mp4":
      return "m4a";
    case "audio/aac":
      return "aac";
    case "audio/wav":
      return "wav";
    case "audio/webm":
      return "weba";
    case "audio/ogg":
      return "ogg";
    case "video/mp4":
      return "mp4";
    case "video/quicktime":
      return "mov";
    case "video/webm":
      return "webm";
    default:
      throw new Error("Unsupported media type.");
  }
}

export function maxUploadBytesForMediaKind(mediaKind: MediaKind) {
  switch (mediaKind) {
    case "image":
      return maxImageUploadBytes;
    case "audio":
      return maxAudioUploadBytes;
    case "video":
      return maxVideoUploadBytes;
  }
}

export function sizeLimitMessage(mediaKind: MediaKind) {
  switch (mediaKind) {
    case "image":
      return "Images must be under 25 MB.";
    case "audio":
      return "Audio uploads must be under 100 MB.";
    case "video":
      return "Video uploads must be under 500 MB.";
  }
}

function isAllowedImageMimeType(
  mimeType: string,
): mimeType is (typeof allowedImageMimeTypes)[number] {
  return allowedImageMimeTypes.includes(
    mimeType as (typeof allowedImageMimeTypes)[number],
  );
}

function isAllowedAudioMimeType(
  mimeType: string,
): mimeType is (typeof allowedAudioMimeTypes)[number] {
  return allowedAudioMimeTypes.includes(
    mimeType as (typeof allowedAudioMimeTypes)[number],
  );
}

function isAllowedVideoMimeType(
  mimeType: string,
): mimeType is (typeof allowedVideoMimeTypes)[number] {
  return allowedVideoMimeTypes.includes(
    mimeType as (typeof allowedVideoMimeTypes)[number],
  );
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
