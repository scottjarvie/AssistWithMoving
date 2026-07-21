import { ConvexError } from "convex/values";

export function assertOAuthImageSource(input: { url?: string; base64?: string }) {
  if (input.url) {
    throw new ConvexError(
      "add_images refuses remote URLs because the OAuth gateway cannot safely verify DNS and redirect targets. Fetch the user-approved image in the client and pass base64 instead.",
    );
  }
  if (!input.base64) throw new ConvexError("Provide base64 image data.");
}

export function assertOAuthImageBytes(
  bytes: Uint8Array,
  claimedMimeType?: string,
) {
  const detectedMimeType = detectImageMimeType(bytes);
  if (!detectedMimeType) {
    throw new ConvexError(
      "Could not verify a JPEG, PNG, or WebP signature in the base64 image data.",
    );
  }
  const normalizedClaim = claimedMimeType
    ?.trim()
    .toLowerCase()
    .split(";")[0];
  if (normalizedClaim && normalizedClaim !== detectedMimeType) {
    throw new ConvexError(
      `Image MIME type mismatch: content is ${detectedMimeType}, not ${normalizedClaim}.`,
    );
  }
  return detectedMimeType;
}

function detectImageMimeType(bytes: Uint8Array) {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a &&
    bytes[12] === 0x49 &&
    bytes[13] === 0x48 &&
    bytes[14] === 0x44 &&
    bytes[15] === 0x52
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return undefined;
}
