const directImageUploadPaths = new Set(["photos/upload", "images/upload"]);
const maxDirectImageUploadBytes = 25 * 1024 * 1024;
const allowedRawImageMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const uploadFileFieldNames = new Set(["file", "image", "photo"]);
const uploadMetadataFields = new Set([
  "moveId",
  "itemId",
  "boxId",
  "spaceId",
  "transportResourceId",
  "transportZoneId",
  "room",
  "caption",
  "photoType",
  "privacyLevel",
  "visibilityScope",
  "source",
  "exifHandlingStatus",
  "confidence",
  "notes",
  "verificationStatus",
  "capturedAt",
  "fileName",
  "mimeType",
  "originalHash",
  "generateAiSuggestions",
]);
const numericUploadMetadataFields = new Set(["capturedAt"]);
const booleanUploadMetadataFields = new Set(["generateAiSuggestions"]);

export class RestApiBodyParseError extends Error {
  readonly status = 400;
  readonly code = "invalid_request_body";
}

export async function parseRestApiBody({
  request,
  method,
  path,
  query,
}: {
  request: Request;
  method: string;
  path: string;
  query: Record<string, string>;
}) {
  if (method === "GET" || method === "DELETE") {
    return undefined;
  }

  const contentType = normalizeMimeType(request.headers.get("content-type"));
  if (isDirectPhotoUploadPath(path)) {
    if (contentType === "multipart/form-data") {
      return await parseMultipartPhotoUpload(request);
    }
    if (contentType && allowedRawImageMimeTypes.has(contentType)) {
      return await parseRawPhotoUpload(request, query, contentType);
    }
  }

  if (contentType === "application/json") {
    try {
      return await request.json();
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function isDirectPhotoUploadPath(path: string) {
  return directImageUploadPaths.has(path.replace(/^\/+|\/+$/g, ""));
}

async function parseMultipartPhotoUpload(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new RestApiBodyParseError("Could not read multipart upload body.");
  }

  const metadata = metadataFromFormData(form);
  const file = uploadFileFromFormData(form);
  const size = typeof file.size === "number" ? file.size : undefined;
  if (size !== undefined) {
    assertDirectImageSize(size);
  }
  const bytes = await file.arrayBuffer();
  assertDirectImageSize(bytes.byteLength);

  return {
    ...metadata,
    fileBase64: base64FromArrayBuffer(bytes),
    fileName: metadata.fileName ?? file.name,
    mimeType:
      normalizeMimeType(String(metadata.mimeType ?? "")) ??
      normalizeMimeType(file.type),
  };
}

async function parseRawPhotoUpload(
  request: Request,
  query: Record<string, string>,
  contentType: string,
) {
  const bytes = await request.arrayBuffer();
  assertDirectImageSize(bytes.byteLength);
  const metadata = metadataFromQuery(query);

  return {
    ...metadata,
    fileBase64: base64FromArrayBuffer(bytes),
    fileName:
      metadata.fileName ??
      request.headers.get("x-assistwithmoving-file-name") ??
      // Legacy name for the same header: an older local MCP server still sends
      // it, and those installs upgrade independently of this deployment.
      request.headers.get("x-movingmanifest-file-name") ??
      request.headers.get("x-file-name") ??
      fileNameFromContentDisposition(request.headers.get("content-disposition")),
    mimeType: contentType,
  };
}

function uploadFileFromFormData(form: FormData) {
  const fileEntries = [...form.entries()].filter(
    ([name, value]) => uploadFileFieldNames.has(name) && isFileLike(value),
  );
  if (fileEntries.length !== 1) {
    throw new RestApiBodyParseError(
      "Multipart photo upload must include exactly one file field named file, image, or photo.",
    );
  }
  return fileEntries[0][1] as FileLike;
}

function metadataFromFormData(form: FormData) {
  const metadata: Record<string, string | number | boolean> = {};
  for (const [key, value] of form.entries()) {
    if (!uploadMetadataFields.has(key) || typeof value !== "string") {
      continue;
    }
    applyMetadataValue(metadata, key, value);
  }
  return metadata;
}

function metadataFromQuery(query: Record<string, string>) {
  const metadata: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(query)) {
    if (!uploadMetadataFields.has(key)) {
      continue;
    }
    applyMetadataValue(metadata, key, value);
  }
  return metadata;
}

function applyMetadataValue(
  metadata: Record<string, string | number | boolean>,
  key: string,
  value: string,
) {
  const trimmed = value.trim();
  if (!trimmed) return;
  if (numericUploadMetadataFields.has(key)) {
    const numberValue = Number(trimmed);
    if (Number.isFinite(numberValue)) {
      metadata[key] = numberValue;
    }
    return;
  }
  if (booleanUploadMetadataFields.has(key)) {
    const normalized = trimmed.toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      metadata[key] = true;
    } else if (["0", "false", "no", "off"].includes(normalized)) {
      metadata[key] = false;
    }
    return;
  }
  metadata[key] = trimmed;
}

function assertDirectImageSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new RestApiBodyParseError("Image upload body was empty.");
  }
  if (sizeBytes > maxDirectImageUploadBytes) {
    throw new RestApiBodyParseError("Images must be under 25 MB.");
  }
}

function normalizeMimeType(value: string | null | undefined) {
  return value?.trim().toLowerCase().split(";")[0] || undefined;
}

function fileNameFromContentDisposition(value: string | null) {
  if (!value) return undefined;

  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ""));
    } catch {
      return encoded[1].trim().replace(/^"|"$/g, "");
    }
  }

  return value.match(/filename="?([^";]+)"?/i)?.[1]?.trim();
}

function base64FromArrayBuffer(buffer: ArrayBuffer) {
  return base64FromBytes(new Uint8Array(buffer));
}

export function base64FromBytes(bytes: Uint8Array) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const triplet = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);

    result += alphabet[(triplet >> 18) & 0x3f];
    result += alphabet[(triplet >> 12) & 0x3f];
    result += hasSecond ? alphabet[(triplet >> 6) & 0x3f] : "=";
    result += hasThird ? alphabet[triplet & 0x3f] : "=";
  }

  return result;
}

type FileLike = {
  arrayBuffer: () => Promise<ArrayBuffer>;
  name?: string;
  size?: number;
  type?: string;
};

function isFileLike(value: FormDataEntryValue) {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as FileLike).arrayBuffer === "function"
  );
}
