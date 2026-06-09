import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import {
  parseRestPath,
  restError,
  restOk,
  restRateLimited,
  type RestRequestInput,
  type RestResponse,
  withRestRateLimitHeaders,
} from "./lib/restApi";

const allowedPhotoMimeTypes = ["image/jpeg", "image/png", "image/webp"];
const maxPhotoUploadBytes = 25 * 1024 * 1024;
const uploadSessionTtlMs = 15 * 60 * 1000;
type PhotoDerivativeVariant = "thumb" | "card" | "detail" | "full";
const photoTypes = [
  "item",
  "serialNumber",
  "condition",
  "damage",
  "boxContents",
  "boxLabel",
  "receipt",
  "room",
  "other",
] as const;
const privacyLevels = [
  "normal",
  "sensitive",
  "private",
  "moverVisible",
  "reportVisible",
  "claimOnly",
  "hiddenFromGuests",
] as const;
const visibilityScopes = [
  "household",
  "moveCollaborators",
  "documentationScoped",
  "private",
] as const;
const photoSources = ["manualUpload", "api", "mcp", "import", "photoAI"] as const;
const exifHandlingStatuses = [
  "pending",
  "stripped",
  "retained",
  "failed",
  "notApplicable",
] as const;
const confidenceLevels = ["none", "low", "medium", "high", "manual", "actual"] as const;
const verificationStatuses = [
  "unreviewed",
  "verified",
  "needsReview",
  "rejected",
] as const;
type ApiActionAuth = {
  householdId: Id<"households">;
  moveId?: Id<"moves">;
  apiKeyId: Id<"apiKeys">;
  createdByUserId: Id<"users">;
};

export const handle = internalAction({
  args: {
    method: v.union(
      v.literal("GET"),
      v.literal("POST"),
      v.literal("PATCH"),
      v.literal("PUT"),
      v.literal("DELETE")
    ),
    path: v.string(),
    query: v.record(v.string(), v.string()),
    authorization: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    body: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<RestResponse> => {
    const segments = parseRestPath(args.path);
    if (segments[0] === "uploads" && segments[1] === "init" && args.method === "POST") {
      return (await handleUploadInit(ctx, args)) as RestResponse;
    }
    if (segments[0] === "photos" && segments[1] === "finalize" && args.method === "POST") {
      return (await handlePhotoFinalize(ctx, args)) as RestResponse;
    }

    return (await ctx.runMutation(internal.restApi.handle, args)) as RestResponse;
  },
});

async function handleUploadInit(ctx: ActionCtx, args: RestRequestInput) {
  if (!hasBearer(args.authorization)) return unknownAuthError();
  const body = bodyObject(args.body);
  const moveId = requiredId<"moves">(body.moveId, "moveId is required.");
  const authResult = await authenticateAction(ctx, args, moveId);
  if (!authResult.ok || !authResult.auth) {
    return authResult.response ?? unknownAuthError();
  }
  const auth = {
    ...(authResult.auth as ApiActionAuth),
    moveId: (authResult.auth as ApiActionAuth).moveId ?? moveId,
  };

  return await withActionRateLimit(ctx, args, auth, async () => {
    try {
      const mimeType = requiredString(body.mimeType, "mimeType is required.");
      const sizeBytes = requiredNumber(body.sizeBytes, "sizeBytes is required.");
      assertUploadFileShape({ mimeType, sizeBytes });
      const config = requireB2Config();
      const objectKey = uploadObjectKey({ moveId, mimeType });
      const derivativeInputs = parseDerivativeUploads(body.derivatives);
      const derivativeUploads = derivativeInputs.map((derivative) => ({
        ...derivative,
        storageKey: uploadObjectKey({
          moveId,
          mimeType: derivative.mimeType,
          prefix: "photo-derivatives",
        }),
        bucket: config.bucketName,
      }));
      const expiresAt = Date.now() + uploadSessionTtlMs;
      const uploadSessionId = await ctx.runMutation(
        internal.photos.createUploadSession,
        {
          householdId: auth.householdId,
          moveId,
          itemId: optionalId<"items">(body.itemId),
          boxId: optionalId<"boxes">(body.boxId),
          room: optionalString(body.room),
          originalStorageKey: objectKey,
          originalBucket: config.bucketName,
          expectedMimeType: mimeType,
          expectedSizeBytes: sizeBytes,
          derivativeUploads: derivativeUploads.map((derivative) => ({
            variant: derivative.variant,
            storageKey: derivative.storageKey,
            bucket: derivative.bucket,
            expectedMimeType: derivative.mimeType,
            expectedSizeBytes: derivative.sizeBytes,
            width: derivative.width,
            height: derivative.height,
          })),
          expiresAt,
          apiActor: {
            apiKeyId: String(auth.apiKeyId),
            createdByUserId: auth.createdByUserId,
          },
        }
      );

      const uploadUrl = await getSignedUrl(
        b2Client(),
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: objectKey,
          ContentType: mimeType,
          ContentLength: sizeBytes,
        }),
        { expiresIn: Math.floor(uploadSessionTtlMs / 1000) }
      );
      const signedDerivativeUploads = await Promise.all(
        derivativeUploads.map(async (derivative) => ({
          variant: derivative.variant,
          uploadUrl: await getSignedUrl(
            b2Client(),
            new PutObjectCommand({
              Bucket: config.bucketName,
              Key: derivative.storageKey,
              ContentType: derivative.mimeType,
              ContentLength: derivative.sizeBytes,
            }),
            { expiresIn: Math.floor(uploadSessionTtlMs / 1000) }
          ),
          method: "PUT" as const,
          headers: { "Content-Type": derivative.mimeType },
        }))
      );

      return restOk(
        {
          data: {
            uploadSessionId,
            uploadUrl,
            method: "PUT",
            headers: { "Content-Type": mimeType },
            derivativeUploads: signedDerivativeUploads,
            expiresAt,
          },
        },
        201
      );
    } catch (error) {
      return restError({
        status: errorStatus(error),
        code: "upload_init_failed",
        message: error instanceof Error ? error.message : "Upload init failed.",
      });
    }
  }, Date.now() + uploadSessionTtlMs);
}

async function handlePhotoFinalize(ctx: ActionCtx, args: RestRequestInput) {
  if (!hasBearer(args.authorization)) return unknownAuthError();
  const body = bodyObject(args.body);
  const moveId = requiredId<"moves">(body.moveId, "moveId is required.");
  const uploadSessionId = requiredId<"photoUploadSessions">(
    body.uploadSessionId,
    "uploadSessionId is required."
  );
  const authResult = await authenticateAction(ctx, args, moveId);
  if (!authResult.ok || !authResult.auth) {
    return authResult.response ?? unknownAuthError();
  }
  const auth = {
    ...(authResult.auth as ApiActionAuth),
    moveId: (authResult.auth as ApiActionAuth).moveId ?? moveId,
  };

  return await withActionRateLimit(ctx, args, auth, async () => {
    try {
      const config = requireB2Config();
      const session = await ctx.runQuery(internal.photos.getUploadSession, {
        householdId: auth.householdId,
        moveId,
        uploadSessionId,
        apiActor: {
          apiKeyId: String(auth.apiKeyId),
          createdByUserId: auth.createdByUserId,
        },
      });
      await assertUploadedObject(config.bucketName, session.originalStorageKey, {
        sizeBytes: session.expectedSizeBytes,
        mimeType: session.expectedMimeType,
      });
      for (const derivative of session.derivativeUploads ?? []) {
        await assertUploadedObject(derivative.bucket, derivative.storageKey, {
          sizeBytes: derivative.expectedSizeBytes,
          mimeType: derivative.expectedMimeType,
        });
      }

      const photoId = await ctx.runMutation(internal.photos.completeUploadSession, {
        householdId: auth.householdId,
        moveId,
        uploadSessionId,
        width: requiredNumber(body.width, "width is required."),
        height: requiredNumber(body.height, "height is required."),
        originalHash: optionalString(body.originalHash),
        caption: optionalString(body.caption),
        photoType: optionalPhotoType(body.photoType),
        privacyLevel: optionalPrivacyLevel(body.privacyLevel),
        visibilityScope: optionalVisibilityScope(body.visibilityScope),
        source: optionalPhotoSource(body.source),
        exifHandlingStatus: optionalExifHandlingStatus(body.exifHandlingStatus),
        confidence: optionalConfidence(body.confidence),
        notes: optionalString(body.notes),
        verificationStatus: optionalVerificationStatus(body.verificationStatus),
        capturedAt: optionalNumber(body.capturedAt),
        apiActor: {
          apiKeyId: String(auth.apiKeyId),
          createdByUserId: auth.createdByUserId,
        },
      });

      return restOk({ data: { photoId } }, 201);
    } catch (error) {
      await ctx.runMutation(internal.photos.markUploadSessionFailed, {
        householdId: auth.householdId,
        moveId,
        uploadSessionId,
        apiActor: {
          apiKeyId: String(auth.apiKeyId),
          createdByUserId: auth.createdByUserId,
        },
      });
      return restError({
        status: errorStatus(error),
        code: "upload_finalize_failed",
        message: error instanceof Error ? error.message : "Upload finalization failed.",
      });
    }
  });
}

async function authenticateAction(
  ctx: ActionCtx,
  args: RestRequestInput,
  moveId: Id<"moves">
) {
  return await ctx.runMutation(internal.restApi.authenticateActionRequest, {
    ...args,
    moveId,
  });
}

async function withActionIdempotency(
  ctx: ActionCtx,
  args: RestRequestInput,
  auth: {
    householdId: Id<"households">;
    moveId?: Id<"moves">;
    apiKeyId: Id<"apiKeys">;
  },
  createResponse: () => Promise<RestResponse>,
  idempotencyExpiresAt?: number
) {
  const idempotency = await ctx.runMutation(internal.restApi.checkIdempotency, {
    method: args.method,
    path: args.path,
    body: args.body,
    apiKeyId: auth.apiKeyId,
    idempotencyKey: args.idempotencyKey,
  });
  if (idempotency.replay) {
    return idempotency.replay;
  }
  const response = await createResponse();
  await ctx.runMutation(internal.restApi.storeIdempotency, {
    householdId: auth.householdId,
    moveId: auth.moveId,
    apiKeyId: auth.apiKeyId,
    idempotencyKey: args.idempotencyKey,
    requestHash: idempotency.requestHash ?? undefined,
    response: response.body,
    status: response.status,
    expiresAt: idempotencyExpiresAt,
  });
  return response;
}

async function withActionRateLimit(
  ctx: ActionCtx,
  args: RestRequestInput,
  auth: {
    householdId: Id<"households">;
    moveId?: Id<"moves">;
    apiKeyId: Id<"apiKeys">;
  },
  createResponse: () => Promise<RestResponse>,
  idempotencyExpiresAt?: number
) {
  const segments = parseRestPath(args.path);
  const rateLimit = await ctx.runMutation(internal.restApi.checkRateLimit, {
    householdId: auth.householdId,
    moveId: auth.moveId,
    apiKeyId: auth.apiKeyId,
    action: `${args.method} /api/v1/${segments.join("/")}`,
  });
  if (!rateLimit.allowed) {
    return restRateLimited(rateLimit);
  }

  const response = await withActionIdempotency(
    ctx,
    args,
    auth,
    createResponse,
    idempotencyExpiresAt
  );
  return withRestRateLimitHeaders(response, rateLimit);
}

function requireB2Config() {
  const endpoint = process.env.B2_ENDPOINT;
  const region = process.env.B2_REGION ?? "us-west-004";
  const bucketName = process.env.B2_BUCKET_NAME;
  const applicationKeyId = process.env.B2_APPLICATION_KEY_ID;
  const applicationKey = process.env.B2_APPLICATION_KEY;

  if (!endpoint || !bucketName || !applicationKeyId || !applicationKey) {
    throw new Error("Backblaze B2 is not configured.");
  }

  return {
    endpoint,
    region,
    bucketName,
    applicationKeyId,
    applicationKey,
  };
}

function b2Client() {
  const config = requireB2Config();
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.applicationKeyId,
      secretAccessKey: config.applicationKey,
    },
  });
}

async function assertUploadedObject(
  bucket: string,
  key: string,
  expected: { sizeBytes: number; mimeType: string }
) {
  const head = await b2Client().send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
  if (head.ContentLength !== expected.sizeBytes) {
    throw new Error("Uploaded object size does not match the session.");
  }
  if (head.ContentType && head.ContentType !== expected.mimeType) {
    throw new Error("Uploaded object type does not match the session.");
  }
}

function assertUploadFileShape({
  mimeType,
  sizeBytes,
}: {
  mimeType: string;
  sizeBytes: number;
}) {
  if (!allowedPhotoMimeTypes.includes(mimeType)) {
    throw new Error("Unsupported image type.");
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxPhotoUploadBytes) {
    throw new Error("Image must be under 25 MB.");
  }
}

function uploadObjectKey({
  moveId,
  mimeType,
  prefix = "photos",
}: {
  moveId: string;
  mimeType: string;
  prefix?: string;
}) {
  return `moves/${moveId}/${prefix}/${crypto.randomUUID()}.${fileExtensionForMimeType(
    mimeType
  )}`;
}

function fileExtensionForMimeType(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      throw new Error("Unsupported image type.");
  }
}

function parseDerivativeUploads(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const derivative = bodyObject(entry);
    const parsed = {
      variant: requiredDerivativeVariant(derivative.variant),
      mimeType: requiredString(derivative.mimeType, "derivative mimeType is required."),
      sizeBytes: requiredNumber(derivative.sizeBytes, "derivative sizeBytes is required."),
      width: requiredNumber(derivative.width, "derivative width is required."),
      height: requiredNumber(derivative.height, "derivative height is required."),
    };
    assertUploadFileShape(parsed);
    return parsed;
  });
}

function bodyObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  return body as Record<string, unknown>;
}

function requiredString(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }
  return value.trim();
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function hasBearer(authorization: string | undefined) {
  return /^Bearer\s+.+$/i.test(authorization ?? "");
}

function requiredNumber(value: unknown, message: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(message);
  }
  return value;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requiredId<TableName extends TableNames>(value: unknown, message: string) {
  return requiredString(value, message) as Id<TableName>;
}

function optionalId<TableName extends TableNames>(value: unknown) {
  return typeof value === "string" && value ? (value as Id<TableName>) : undefined;
}

function requiredDerivativeVariant(value: unknown): PhotoDerivativeVariant {
  if (
    value === "thumb" ||
    value === "card" ||
    value === "detail" ||
    value === "full"
  ) {
    return value;
  }
  throw new Error("Unsupported derivative variant.");
}

function optionalPhotoType(value: unknown) {
  return optionalLiteral(photoTypes, value);
}

function optionalPrivacyLevel(value: unknown) {
  return optionalLiteral(privacyLevels, value);
}

function optionalVisibilityScope(value: unknown) {
  return optionalLiteral(visibilityScopes, value);
}

function optionalPhotoSource(value: unknown) {
  return optionalLiteral(photoSources, value);
}

function optionalExifHandlingStatus(value: unknown) {
  return optionalLiteral(exifHandlingStatuses, value);
}

function optionalConfidence(value: unknown) {
  return optionalLiteral(confidenceLevels, value);
}

function optionalVerificationStatus(value: unknown) {
  return optionalLiteral(verificationStatuses, value);
}

function optionalLiteral<const Values extends readonly string[]>(
  values: Values,
  value: unknown
) {
  if (typeof value !== "string") return undefined;
  return values.includes(value) ? (value as Values[number]) : undefined;
}

function unknownAuthError() {
  return restError({
    status: 401,
    code: "unauthorized",
    message: "Use a Bearer API key.",
  });
}

function errorStatus(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("api key") || message.includes("bearer")) return 401;
  if (message.includes("not allowed") || message.includes("scope")) return 403;
  if (message.includes("not found") || message.includes("not active")) return 404;
  if (message.includes("idempotency")) return 409;
  return 400;
}
