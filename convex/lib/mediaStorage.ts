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

// --- Pure image-dimension parsers -------------------------------------------
// Byte-level width/height readers for the supported image types. Duplicated
// verbatim from convex/http.ts (the REST direct-upload path keeps its own
// private copy) so the OAuth MCP gateway action can compute dimensions before
// finalizing an upload. These are pure functions — no ctx, Web-API only.
export function imageDimensions(
  bytes: Uint8Array,
  mimeType: string,
): { width: number; height: number } | null {
  switch (mimeType) {
    case "image/png":
      return pngDimensions(bytes);
    case "image/jpeg":
      return jpegDimensions(bytes);
    case "image/webp":
      return webpDimensions(bytes);
    default:
      return null;
  }
}

function pngDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return null;
  }
  return {
    width: readUint32BE(bytes, 16),
    height: readUint32BE(bytes, 20),
  };
}

function jpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset < bytes.length) {
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > bytes.length) return null;
    const length = readUint16BE(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if (isJpegStartOfFrame(marker)) {
      return {
        height: readUint16BE(bytes, offset + 3),
        width: readUint16BE(bytes, offset + 5),
      };
    }
    offset += length;
  }

  return null;
}

function webpDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 30 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 12) !== "WEBP"
  ) {
    return null;
  }

  const chunk = ascii(bytes, 12, 16);
  if (chunk === "VP8X") {
    return {
      width: 1 + readUint24LE(bytes, 24),
      height: 1 + readUint24LE(bytes, 27),
    };
  }
  if (chunk === "VP8 " && bytes.length >= 30) {
    return {
      width: readUint16LE(bytes, 26) & 0x3fff,
      height: readUint16LE(bytes, 28) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const b1 = bytes[21];
    const b2 = bytes[22];
    const b3 = bytes[23];
    const b4 = bytes[24];
    return {
      width: 1 + (((b2 & 0x3f) << 8) | b1),
      height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
    };
  }

  return null;
}

function isJpegStartOfFrame(marker: number | undefined) {
  return (
    marker !== undefined &&
    marker >= 0xc0 &&
    marker <= 0xcf &&
    ![0xc4, 0xc8, 0xcc].includes(marker)
  );
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function readUint16BE(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint16LE(bytes: Uint8Array, offset: number) {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint24LE(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  );
}

function readUint32BE(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] ?? 0) * 0x1000000 +
    (((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0))
  );
}
