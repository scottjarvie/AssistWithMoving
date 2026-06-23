import { anyApi, httpRouter } from "convex/server";
import type { FunctionReference } from "convex/server";

import { httpAction } from "./_generated/server";
import {
  ClerkWebhookPayloadError,
  normalizeClerkOrganization,
  normalizeClerkOrganizationFromMembership,
  normalizeClerkOrganizationMembership,
  normalizeClerkPublicUserFromMembership,
  normalizeClerkUser,
  verifyClerkWebhookRequest,
} from "./lib/clerk";
import {
  parseRestApiBody,
  RestApiBodyParseError,
} from "./lib/restUploadBody";
import {
  McpGateway,
  type McpAuthorizerHandler,
  type McpIdentityResolver,
} from "convex-mcp-gateway";
import { components } from "./_generated/api";
import { tools as mcpTools } from "./mcp";

const http = httpRouter();

const allowedDirectImageMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const maxDirectImageUploadBytes = 25 * 1024 * 1024;
const directImageFileFieldNames = new Set(["file", "image", "photo"]);
const directImageMetadataFields = new Set([
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
const numericDirectImageMetadataFields = new Set(["capturedAt"]);
const booleanDirectImageMetadataFields = new Set(["generateAiSuggestions"]);

type ParsedDirectImageUpload =
  | {
      kind: "jsonSourceUrl";
      body: Record<string, unknown>;
    }
  | {
      kind: "binary";
      body: Record<string, unknown>;
      bytes: Uint8Array;
      fileName?: string;
      mimeType: string;
    };

const internalMutations = anyApi as unknown as {
  audit: {
    record: FunctionReference<
      "mutation",
      "internal",
      {
        actorType: "system";
        category: "auth";
        action: string;
        objectTable?: string;
        objectId?: string;
        metadata?: Record<string, unknown>;
      },
      unknown
    >;
  };
  clerkUsers: {
    upsertFromWebhook: FunctionReference<
      "mutation",
      "internal",
      ReturnType<typeof normalizeClerkUser>
    >;
    disableFromWebhook: FunctionReference<
      "mutation",
      "internal",
      { clerkUserId: string }
    >;
    upsertOrganizationFromWebhook: FunctionReference<
      "mutation",
      "internal",
      ReturnType<typeof normalizeClerkOrganization>
    >;
    disableOrganizationFromWebhook: FunctionReference<
      "mutation",
      "internal",
      { clerkOrganizationId: string }
    >;
    upsertOrganizationMembershipFromWebhook: FunctionReference<
      "mutation",
      "internal",
      ReturnType<typeof normalizeClerkOrganizationMembership>
    >;
    disableOrganizationMembershipFromWebhook: FunctionReference<
      "mutation",
      "internal",
      { clerkOrganizationMembershipId: string }
    >;
  };
};

const internalActions = anyApi as unknown as {
  restApiActions: {
    handle: FunctionReference<
      "action",
      "internal",
      {
        method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
        path: string;
        query: Record<string, string>;
        authorization?: string;
        idempotencyKey?: string;
        body?: unknown;
      },
      {
        status: number;
        body: unknown;
        headers?: Record<string, string>;
      }
    >;
  };
};

const directImageUploadHttpAction = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/v1\/?/, "");
  const query = Object.fromEntries(url.searchParams.entries());
  const authorization = request.headers.get("authorization") ?? undefined;
  const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;

  if (!hasBearer(authorization)) {
    return Response.json(
      {
        error: {
          code: "unauthorized",
          message: "Use a Bearer API key.",
        },
      },
      { status: 401 },
    );
  }

  let parsed: ParsedDirectImageUpload;
  try {
    parsed = await parseDirectImageUploadRequest(request, query);
  } catch (error) {
    return Response.json(
      {
        error: {
          code: "invalid_image_upload",
          message:
            error instanceof Error
              ? error.message
              : "Image upload request could not be read.",
        },
      },
      { status: 400 },
    );
  }

  if (parsed.kind === "jsonSourceUrl") {
    const response = await ctx.runAction(internalActions.restApiActions.handle, {
      method: "POST",
      path,
      query,
      authorization,
      idempotencyKey,
      body: parsed.body,
    });
    return responseFromRest(response);
  }

  const dimensions = imageDimensions(parsed.bytes, parsed.mimeType);
  if (!dimensions) {
    return Response.json(
      {
        error: {
          code: "invalid_image_upload",
          message: "Could not read image dimensions.",
        },
      },
      { status: 400 },
    );
  }

  const originalHash =
    stringValue(parsed.body.originalHash) ?? (await sha256Hex(parsed.bytes));
  const initResponse = await ctx.runAction(internalActions.restApiActions.handle, {
    method: "POST",
    path: "uploads/init",
    query: {},
    authorization,
    body: {
      moveId: parsed.body.moveId,
      itemId: parsed.body.itemId,
      boxId: parsed.body.boxId,
      spaceId: parsed.body.spaceId,
      transportResourceId: parsed.body.transportResourceId,
      transportZoneId: parsed.body.transportZoneId,
      room: parsed.body.room,
      mimeType: parsed.mimeType,
      sizeBytes: parsed.bytes.byteLength,
    },
  });
  if (initResponse.status < 200 || initResponse.status >= 300) {
    return responseFromRest(initResponse);
  }

  const initData = bodyRecord(bodyRecord(initResponse.body).data);
  const uploadUrl = stringValue(initData.uploadUrl);
  const uploadHeaders = bodyRecord(initData.headers);
  const uploadSessionId = stringValue(initData.uploadSessionId);
  if (!uploadUrl || !uploadSessionId) {
    return Response.json(
      {
        error: {
          code: "photo_upload_failed",
          message: "Upload session response was incomplete.",
        },
      },
      { status: 502 },
    );
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: stringRecord(uploadHeaders),
    body: bytesToArrayBuffer(parsed.bytes),
  });
  if (!uploadResponse.ok) {
    return Response.json(
      {
        error: {
          code: "photo_upload_failed",
          message: `Photo storage rejected the upload with HTTP ${uploadResponse.status}.`,
        },
      },
      { status: 502 },
    );
  }

  const finalizeResponse = await ctx.runAction(
    internalActions.restApiActions.handle,
    {
      method: "POST",
      path: "photos/finalize",
      query: {},
      authorization,
      body: {
        ...parsed.body,
        uploadSessionId,
        mimeType: parsed.mimeType,
        fileName: parsed.fileName,
        width: dimensions.width,
        height: dimensions.height,
        originalHash,
        source: parsed.body.source ?? "api",
      },
    },
  );

  return responseFromRest(finalizeResponse);
});

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signingSecret =
      process.env.CLERK_WEBHOOK_SIGNING_SECRET ??
      process.env.CLERK_WEBHOOK_SECRET;

    if (!signingSecret) {
      await ctx.runMutation(internalMutations.audit.record, {
        actorType: "system",
        category: "auth",
        action: "clerk_webhook.signing_secret_missing",
        metadata: { endpoint: "clerk-webhook" },
      });
      return new Response("Webhook signing secret is not configured.", {
        status: 500,
      });
    }

    let event;
    try {
      event = await verifyClerkWebhookRequest(request, signingSecret);
    } catch {
      await ctx.runMutation(internalMutations.audit.record, {
        actorType: "system",
        category: "auth",
        action: "clerk_webhook.verification_failed",
        metadata: { endpoint: "clerk-webhook" },
      });
      return new Response("Webhook verification failed.", { status: 400 });
    }

    if (event.type === "user.created" || event.type === "user.updated") {
      await ctx.runMutation(
        internalMutations.clerkUsers.upsertFromWebhook,
        normalizeClerkUser(event.data)
      );

      return Response.json({ ok: true, handled: event.type });
    }

    if (event.type === "user.deleted") {
      if (!event.data.id) {
        return new Response("Deleted user payload is missing an id.", {
          status: 400,
        });
      }

      await ctx.runMutation(internalMutations.clerkUsers.disableFromWebhook, {
        clerkUserId: event.data.id,
      });

      return Response.json({ ok: true, handled: event.type });
    }

    if (
      event.type === "organization.created" ||
      event.type === "organization.updated"
    ) {
      await ctx.runMutation(
        internalMutations.clerkUsers.upsertOrganizationFromWebhook,
        normalizeClerkOrganization(event.data)
      );

      return Response.json({ ok: true, handled: event.type });
    }

    if (event.type === "organization.deleted") {
      if (!event.data.id) {
        return new Response("Deleted organization payload is missing an id.", {
          status: 400,
        });
      }

      await ctx.runMutation(
        internalMutations.clerkUsers.disableOrganizationFromWebhook,
        {
          clerkOrganizationId: event.data.id,
        }
      );

      return Response.json({ ok: true, handled: event.type });
    }

    if (
      event.type === "organizationMembership.created" ||
      event.type === "organizationMembership.updated"
    ) {
      try {
        const organization = normalizeClerkOrganizationFromMembership(event.data);
        const publicUser = normalizeClerkPublicUserFromMembership(event.data);

        if (organization) {
          await ctx.runMutation(
            internalMutations.clerkUsers.upsertOrganizationFromWebhook,
            organization
          );
        }

        if (publicUser) {
          await ctx.runMutation(
            internalMutations.clerkUsers.upsertFromWebhook,
            publicUser
          );
        }

        await ctx.runMutation(
          internalMutations.clerkUsers.upsertOrganizationMembershipFromWebhook,
          normalizeClerkOrganizationMembership(event.data)
        );
      } catch (error) {
        if (error instanceof ClerkWebhookPayloadError) {
          return new Response(error.message, { status: 400 });
        }
        throw error;
      }

      return Response.json({ ok: true, handled: event.type });
    }

    if (event.type === "organizationMembership.deleted") {
      if (!event.data.id) {
        return new Response(
          "Deleted organization membership payload is missing an id.",
          {
            status: 400,
          }
        );
      }

      await ctx.runMutation(
        internalMutations.clerkUsers.disableOrganizationMembershipFromWebhook,
        {
          clerkOrganizationMembershipId: event.data.id,
        }
      );

      return Response.json({ ok: true, handled: event.type });
    }

    return Response.json({ ok: true, ignored: event.type });
  }),
});

for (const path of [
  "/api/v1/photos/upload",
  "/api/v1/photos/upload/",
  "/api/v1/images/upload",
  "/api/v1/images/upload/",
] as const) {
  http.route({
    path,
    method: "POST",
    handler: directImageUploadHttpAction,
  });
}

for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"] as const) {
  http.route({
    pathPrefix: "/api/v1/",
    method,
    handler: httpAction(async (ctx, request) => {
      const url = new URL(request.url);
      const path = url.pathname.replace(/^\/api\/v1\/?/, "");
      const query = Object.fromEntries(url.searchParams.entries());
      let body;
      try {
        body = await parseRestApiBody({
          request,
          method,
          path,
          query,
        });
      } catch (error) {
        if (error instanceof RestApiBodyParseError) {
          return Response.json(
            { error: { code: error.code, message: error.message } },
            { status: error.status },
          );
        }
        throw error;
      }
      const response = await ctx.runAction(internalActions.restApiActions.handle, {
        method,
        path,
        query,
        authorization: request.headers.get("authorization") ?? undefined,
        idempotencyKey: request.headers.get("idempotency-key") ?? undefined,
        body,
      });

      return responseFromRest(response);
    }),
  });
}

async function parseDirectImageUploadRequest(
  request: Request,
  query: Record<string, string>,
): Promise<ParsedDirectImageUpload> {
  const contentType = normalizeMimeType(request.headers.get("content-type"));
  if (contentType === "multipart/form-data") {
    return await parseMultipartDirectImageUpload(request);
  }
  if (contentType && allowedDirectImageMimeTypes.has(contentType)) {
    const body = metadataFromQuery(query);
    const bytes = new Uint8Array(await request.arrayBuffer());
    const fileName =
      stringValue(body.fileName) ??
      request.headers.get("x-movingmanifest-file-name") ??
      request.headers.get("x-file-name") ??
      fileNameFromContentDisposition(request.headers.get("content-disposition"));
    return finalizeDirectImageUploadBody({
      body,
      bytes,
      fileName,
      mimeType: contentType,
    });
  }
  if (contentType === "application/json") {
    let body;
    try {
      body = bodyRecord(await request.json());
    } catch {
      throw new Error("Could not read JSON upload body.");
    }
    if (stringValue(body.sourceUrl)) {
      return { kind: "jsonSourceUrl" as const, body };
    }
    const dataUrl = stringValue(body.dataUrl);
    const fileBase64 = stringValue(body.fileBase64);
    const sourceCount = [dataUrl, fileBase64].filter(Boolean).length;
    if (sourceCount !== 1) {
      throw new Error("Provide exactly one of sourceUrl, dataUrl, or fileBase64.");
    }
    const parsed = dataUrl
      ? parseImageDataUrl(dataUrl)
      : {
          bytes: decodeBase64Image(fileBase64 ?? ""),
          mimeType: undefined,
        };
    return finalizeDirectImageUploadBody({
      body,
      bytes: parsed.bytes,
      fileName: stringValue(body.fileName),
      mimeType:
        normalizeMimeType(stringValue(body.mimeType)) ??
        parsed.mimeType ??
        sniffImageMimeType(parsed.bytes) ??
        mimeTypeForFilename(stringValue(body.fileName) ?? ""),
    });
  }

  throw new Error(
    "Use raw JPEG, PNG, or WebP bytes, multipart form data, or JSON with exactly one of sourceUrl, dataUrl, or fileBase64.",
  );
}

async function parseMultipartDirectImageUpload(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new Error("Could not read multipart upload body.");
  }

  const body = metadataFromFormData(form);
  const file = uploadFileFromFormData(form);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileName = stringValue(body.fileName) ?? file.name;
  const mimeType =
    normalizeMimeType(stringValue(body.mimeType)) ??
    normalizeMimeType(file.type) ??
    sniffImageMimeType(bytes) ??
    mimeTypeForFilename(fileName ?? "");

  return finalizeDirectImageUploadBody({
    body,
    bytes,
    fileName,
    mimeType,
  });
}

function finalizeDirectImageUploadBody({
  body,
  bytes,
  fileName,
  mimeType,
}: {
  body: Record<string, unknown>;
  bytes: Uint8Array;
  fileName?: string;
  mimeType?: string;
}): Extract<ParsedDirectImageUpload, { kind: "binary" }> {
  if (bytes.byteLength <= 0) {
    throw new Error("Image upload body was empty.");
  }
  if (bytes.byteLength > maxDirectImageUploadBytes) {
    throw new Error("Images must be under 25 MB.");
  }
  if (!mimeType || !allowedDirectImageMimeTypes.has(mimeType)) {
    throw new Error("Direct image upload accepts JPEG, PNG, or WebP images.");
  }

  return {
    kind: "binary" as const,
    body: {
      ...body,
      fileName,
      mimeType,
    },
    bytes,
    fileName,
    mimeType,
  };
}

function uploadFileFromFormData(form: FormData) {
  const fileEntries = [...form.entries()].filter(
    ([name, value]) => directImageFileFieldNames.has(name) && isFileLike(value),
  );
  if (fileEntries.length !== 1) {
    throw new Error(
      "Multipart photo upload must include exactly one file field named file, image, or photo.",
    );
  }
  return fileEntries[0][1] as FileLike;
}

function metadataFromFormData(form: FormData) {
  const metadata: Record<string, string | number | boolean> = {};
  for (const [key, value] of form.entries()) {
    if (!directImageMetadataFields.has(key) || typeof value !== "string") {
      continue;
    }
    applyMetadataValue(metadata, key, value);
  }
  return metadata;
}

function metadataFromQuery(query: Record<string, string>) {
  const metadata: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(query)) {
    if (!directImageMetadataFields.has(key)) {
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
  if (numericDirectImageMetadataFields.has(key)) {
    const numberValue = Number(trimmed);
    if (Number.isFinite(numberValue)) {
      metadata[key] = numberValue;
    }
    return;
  }
  if (booleanDirectImageMetadataFields.has(key)) {
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

function responseFromRest(response: {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}) {
  const contentType = response.headers?.["Content-Type"];
  if (contentType && !contentType.includes("application/json")) {
    return new Response(String(response.body ?? ""), {
      status: response.status,
      headers: response.headers,
    });
  }

  return Response.json(response.body, {
    status: response.status,
    headers: response.headers,
  });
}

function imageDimensions(bytes: Uint8Array, mimeType: string) {
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

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytesToArrayBuffer(bytes));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseImageDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(?:;[^,]*)?;base64,([\s\S]+)$/i);
  if (!match) {
    throw new Error("dataUrl must be a base64 image data URL.");
  }
  return {
    mimeType: normalizeMimeType(match[1]),
    bytes: decodeBase64Image(match[2]),
  };
}

function decodeBase64Image(value: string) {
  const normalized = value.replace(/\s/g, "");
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error("fileBase64 must contain base64 image data.");
  }
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function sniffImageMimeType(bytes: Uint8Array) {
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return undefined;
}

function normalizeMimeType(value: string | null | undefined) {
  return value?.trim().toLowerCase().split(";")[0] || undefined;
}

function mimeTypeForFilename(filename: string | undefined) {
  const extension = filename?.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return undefined;
  }
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

function bodyRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  return body as Record<string, unknown>;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function stringRecord(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function hasBearer(authorization: string | undefined) {
  return /^Bearer\s+.+$/i.test(authorization ?? "");
}

function bytesToArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function isFileLike(value: unknown): value is FileLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as FileLike).arrayBuffer === "function" &&
    typeof (value as FileLike).size === "number"
  );
}

type FileLike = {
  name?: string;
  type?: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

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

// --- Remote MCP gateway (OAuth 2.1; Clerk is the authorization server) ------
// The user's own AI agent connects here over Streamable HTTP. resolveIdentity
// validates the Clerk OAuth access token — Convex's local JWT validation can't
// verify it (its audience is the MCP resource, not "convex"), so we ask Clerk's
// userinfo endpoint. That resolved identity drives both the authorize gate and
// the `caller` injected into each tool. See convex/mcp.ts + convex/mcpTools.ts.
const mcpGatewayClient = new McpGateway(components.mcpGateway);

const resolveMcpIdentity: McpIdentityResolver = async (token) => {
  const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN?.trim();
  if (!issuer) {
    return null;
  }
  try {
    const response = await fetch(
      `${issuer.replace(/\/+$/, "")}/oauth/userinfo`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      return null;
    }
    const info = (await response.json()) as {
      sub?: string;
      user_id?: string;
    } & Record<string, unknown>;
    const subject = info.sub ?? info.user_id;
    return subject ? { subject, claims: info } : null;
  } catch {
    return null;
  }
};

const authorizeMcp: McpAuthorizerHandler = (_ctx, args) =>
  args.identity?.subject
    ? { allowed: true }
    : {
        allowed: false,
        reason: "Sign in with your MovingManifest account to use these tools.",
      };

const mcpHttpAction = httpAction((ctx, request) =>
  mcpGatewayClient.handleMcpRequest(ctx, request, {
    authorize: authorizeMcp,
    resolveIdentity: resolveMcpIdentity,
    tools: mcpTools,
    requireAuth: true,
    cors: true,
    serverInfo: { name: "movingmanifest", version: "0.2.0" },
  }),
);

for (const path of ["/mcp", "/mcp/"]) {
  for (const method of ["POST", "GET", "DELETE"] as const) {
    http.route({ path, method, handler: mcpHttpAction });
  }
}

const mcpMetadataAction = httpAction((ctx, request) =>
  mcpGatewayClient.serveProtectedResourceMetadata(ctx, request),
);
http.route({
  path: "/.well-known/oauth-protected-resource/mcp",
  method: "GET",
  handler: mcpMetadataAction,
});
http.route({
  pathPrefix: "/.well-known/oauth-protected-resource/",
  method: "GET",
  handler: mcpMetadataAction,
});

export default http;
