"use node";

import { createHash } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v } from "convex/values";
import sharp from "sharp";

import { internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import {
  parseRestPath,
  restAgentAttributionFields,
  restError,
  restOk,
  restRateLimited,
  type RestRequestInput,
  type RestResponse,
  withRestRateLimitHeaders,
} from "./lib/restApi";
import {
  assertDerivativeUploadsAllowed,
  assertImageDerivativeUploadFileShape,
  assertOriginalUploadFileShape,
  fileExtensionForMediaMimeType,
  maxImageUploadBytes,
  mediaKindForMimeType,
  mediaObjectPrefix,
} from "./lib/mediaStorage";
import {
  serverDerivativeSpecs,
  type PhotoDerivativeVariant,
} from "./lib/imageDerivatives";
import {
  cloudflareImageDeliveryUrl,
  selectDerivativeRef,
  type PhotoDeliveryProvider,
} from "./lib/photoDelivery";
import { canUsePhotoDerivativeForAi } from "./lib/photoVisibility";

const uploadSessionTtlMs = 15 * 60 * 1000;
const photoTypes = [
  "item",
  "serialNumber",
  "condition",
  "damage",
  "boxContents",
  "boxLabel",
  "receipt",
  "room",
  "blueprint",
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
const displayUrlTtlSeconds = 5 * 60;
const photoDerivativeVariants = ["thumb", "card", "detail", "full"] as const;
const ingestionEvidenceVariants = [
  "original",
  ...photoDerivativeVariants,
] as const;
const restOAuthIdentityValidator = v.object({
  tokenIdentifier: v.string(),
  subject: v.string(),
  issuer: v.string(),
  oauthClientId: v.optional(v.string()),
  oauthTokenId: v.optional(v.string()),
  name: v.optional(v.string()),
  pictureUrl: v.optional(v.string()),
  email: v.optional(v.string()),
});
type ApiActionAuth = {
  householdId: Id<"households">;
  moveId?: Id<"moves">;
  apiKeyId: Id<"apiKeys">;
  apiKeyName?: string;
  createdByUserId: Id<"users">;
};
type DerivativeVariantSummary = {
  variant: PhotoDerivativeVariant;
  mimeType: string;
  width: number;
  height: number;
  fit: "cover" | "inside" | "clientProvided";
  status: "pending" | "ready" | "failed";
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
    oauthIdentity: v.optional(restOAuthIdentityValidator),
  },
  handler: async (ctx, args): Promise<RestResponse> => {
    const segments = parseRestPath(args.path);
    if (segments[0] === "uploads" && segments[1] === "init" && args.method === "POST") {
      return (await handleUploadInit(ctx, args)) as RestResponse;
    }
    if (
      (segments[0] === "photos" || segments[0] === "images") &&
      segments[1] === "upload" &&
      args.method === "POST"
    ) {
      return (await handlePhotoUpload(ctx, args)) as RestResponse;
    }
    if (segments[0] === "photos" && segments[1] === "finalize" && args.method === "POST") {
      return (await handlePhotoFinalize(ctx, args)) as RestResponse;
    }
    if (
      (segments[0] === "photos" || segments[0] === "images") &&
      segments[2] === "display-url" &&
      args.method === "GET"
    ) {
      return (await handlePhotoDisplayUrl(ctx, args, segments[1])) as RestResponse;
    }
    if (
      segments[0] === "moves" &&
      segments[2] === "ingestion-queue" &&
      segments[4] === "evidence" &&
      segments[6] === "url" &&
      args.method === "GET"
    ) {
      return (await handleIngestionEvidenceUrl(
        ctx,
        args,
        segments[1],
        segments[3],
        segments[5]
      )) as RestResponse;
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
      const requestedMimeType = requiredString(
        body.mimeType,
        "mimeType is required."
      );
      const sizeBytes = requiredNumber(body.sizeBytes, "sizeBytes is required.");
      const original = assertOriginalUploadFileShape({
        mimeType: requestedMimeType,
        sizeBytes,
      });
      const mimeType = original.mimeType;
      const config = requireB2Config();
      const objectKey = uploadObjectKey({ moveId, mimeType });
      const derivativeInputs = parseDerivativeUploads(body.derivatives);
      assertDerivativeUploadsAllowed(original.mediaKind, derivativeInputs.length);
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
          spaceId: optionalId<"moveSpaces">(body.spaceId),
          transportResourceId: optionalId<"transportResources">(
            body.transportResourceId
          ),
          transportZoneId: optionalId<"transportZones">(
            body.transportZoneId
          ),
          room: optionalString(body.room),
          originalStorageKey: objectKey,
          originalBucket: config.bucketName,
          mediaKind: original.mediaKind,
          expectedMimeType: original.mimeType,
          expectedSizeBytes: original.sizeBytes,
          derivativeUploads: derivativeUploads.map((derivative) => ({
            variant: derivative.variant,
            storageKey: derivative.storageKey,
            bucket: derivative.bucket,
            expectedMimeType: derivative.mimeType,
            expectedSizeBytes: derivative.sizeBytes,
            width: derivative.width,
            height: derivative.height,
          })),
          ...restAgentAttributionFields(body, auth, { defaultLabel: true }),
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
          ContentType: original.mimeType,
          ContentLength: original.sizeBytes,
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
            headers: { "Content-Type": original.mimeType },
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

async function handlePhotoUpload(ctx: ActionCtx, args: RestRequestInput) {
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
    let uploadSessionId: Id<"photoUploadSessions"> | undefined;
    try {
      const media = await loadDirectImageUploadMedia(body);
      const original = assertOriginalUploadFileShape({
        mimeType: media.mimeType,
        sizeBytes: media.bytes.byteLength,
      });
      if (original.mediaKind !== "image") {
        throw new Error(
          "Direct photo upload accepts JPEG, PNG, or WebP images. Use /uploads/init for audio or video."
        );
      }

      const metadata = await sharp(media.bytes, { failOn: "none" }).metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error("Could not read image dimensions.");
      }

      const config = requireB2Config();
      const objectKey = uploadObjectKey({
        moveId,
        mimeType: original.mimeType,
      });
      const expiresAt = Date.now() + uploadSessionTtlMs;
      const apiActor = {
        apiKeyId: String(auth.apiKeyId),
        createdByUserId: auth.createdByUserId,
      };

      uploadSessionId = await ctx.runMutation(
        internal.photos.createUploadSession,
        {
          householdId: auth.householdId,
          moveId,
          itemId: optionalId<"items">(body.itemId),
          boxId: optionalId<"boxes">(body.boxId),
          spaceId: optionalId<"moveSpaces">(body.spaceId),
          transportResourceId: optionalId<"transportResources">(
            body.transportResourceId
          ),
          transportZoneId: optionalId<"transportZones">(
            body.transportZoneId
          ),
          room: optionalString(body.room),
          originalStorageKey: objectKey,
          originalBucket: config.bucketName,
          mediaKind: original.mediaKind,
          expectedMimeType: original.mimeType,
          expectedSizeBytes: original.sizeBytes,
          derivativeUploads: [],
          ...restAgentAttributionFields(body, auth, { defaultLabel: true }),
          expiresAt,
          apiActor,
        }
      );

      await b2Client().send(
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: objectKey,
          Body: media.bytes,
          ContentType: original.mimeType,
          ContentLength: media.bytes.byteLength,
        })
      );

      const photoId = await ctx.runMutation(internal.photos.completeUploadSession, {
        householdId: auth.householdId,
        moveId,
        uploadSessionId,
        width: metadata.width,
        height: metadata.height,
        originalHash:
          optionalString(body.originalHash) ??
          createHash("sha256").update(media.bytes).digest("hex"),
        caption: optionalString(body.caption),
        photoType: optionalPhotoType(body.photoType),
        privacyLevel: optionalPrivacyLevel(body.privacyLevel),
        visibilityScope: optionalVisibilityScope(body.visibilityScope),
        source: optionalPhotoSource(body.source) ?? "api",
        exifHandlingStatus: optionalExifHandlingStatus(body.exifHandlingStatus),
        confidence: optionalConfidence(body.confidence),
        ...restAgentAttributionFields(body, auth, { defaultLabel: true }),
        notes: optionalString(body.notes),
        verificationStatus: optionalVerificationStatus(body.verificationStatus),
        capturedAt: optionalNumber(body.capturedAt),
        fileName: media.fileName,
        apiActor,
      });

      let derivativeStatus: "ready" | "failed" | undefined;
      let derivativeError: string | undefined;
      let derivativeRefs: Partial<Record<PhotoDerivativeVariant, string>> = {};
      try {
        const generated = await generateAndStoreImageDerivatives({
          bucketName: config.bucketName,
          moveId,
          originalStorageKey: objectKey,
        });
        await ctx.runMutation(internal.photos.markGeneratedDerivativesReady, {
          householdId: auth.householdId,
          moveId,
          photoId,
          derivativeRefs: generated.derivativeRefs,
          apiActor,
        });
        derivativeRefs = generated.derivativeRefs;
        derivativeStatus = "ready";
      } catch (error) {
        derivativeStatus = "failed";
        derivativeError = derivativeProcessingError(error);
        await ctx.runMutation(internal.photos.markGeneratedDerivativesFailed, {
          householdId: auth.householdId,
          moveId,
          photoId,
          derivativeError,
          apiActor,
        });
      }

      const aiReview = await maybeGeneratePhotoAiSuggestionsAfterUpload(
        ctx,
        args,
        moveId,
        photoId,
        optionalBoolean(body.generateAiSuggestions)
      );
      const mediaSummary = {
        source: media.source,
        fileName: media.fileName,
        mimeType: original.mimeType,
          sizeBytes: media.bytes.byteLength,
          width: metadata.width,
          height: metadata.height,
          display: await derivativeDisplayMediaForUpload({
            moveId,
            photoId,
            derivativeRefs,
            derivativeStatus,
          }),
        };
      const derivativeNote = derivativeNoteForStatus(derivativeStatus);
      const derivativeVariants = derivativeVariantsForStatus(derivativeStatus);
      const agentReview = directPhotoUploadAgentReview({
        body,
        data: {
          photoId,
          uploadSessionId,
          derivativeStatus,
          derivativeError,
          derivativeNote,
          derivativeVariants,
          aiReview,
          media: mediaSummary,
        },
      });

      return restOk(
        {
          data: {
            photoId,
            uploadSessionId,
            derivativeStatus,
            derivativeError,
            derivativeNote,
            derivativeVariants,
            aiReview,
            media: mediaSummary,
            agentReview,
          },
        },
        201
      );
    } catch (error) {
      if (uploadSessionId) {
        await ctx.runMutation(internal.photos.markUploadSessionFailed, {
          householdId: auth.householdId,
          moveId,
          uploadSessionId,
          apiActor: {
            apiKeyId: String(auth.apiKeyId),
            createdByUserId: auth.createdByUserId,
          },
        });
      }
      return restError({
        status: errorStatus(error),
        code: "photo_upload_failed",
        message: error instanceof Error ? error.message : "Photo upload failed.",
      });
    }
  });
}

async function maybeGeneratePhotoAiSuggestionsAfterUpload(
  ctx: ActionCtx,
  args: RestRequestInput,
  moveId: Id<"moves">,
  photoId: Id<"itemPhotos">,
  requested: boolean | undefined
) {
  if (!requested) return undefined;

  const response = await ctx.runMutation(internal.restApi.handle, {
    method: "POST",
    path: `/moves/${moveId}/ai-photo-suggestions/generate`,
    query: {},
    authorization: args.authorization,
    idempotencyKey: args.idempotencyKey
      ? `${args.idempotencyKey}:ai-photo-suggestions`
      : undefined,
    body: { photoId },
  });
  const body = bodyObject(response.body);
  if (response.status >= 200 && response.status < 300) {
    const data = bodyObject(body.data);
    return {
      status: "queued" as const,
      ...data,
    };
  }
  const error = bodyObject(body.error);
  const message = optionalString(error.message);

  return {
    status: "failed" as const,
    error:
      message ??
      "Photo uploaded, but AI review suggestions were not queued.",
  };
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
        width: optionalNumber(body.width),
        height: optionalNumber(body.height),
        originalHash: optionalString(body.originalHash),
        caption: optionalString(body.caption),
        photoType: optionalPhotoType(body.photoType),
        privacyLevel: optionalPrivacyLevel(body.privacyLevel),
        visibilityScope: optionalVisibilityScope(body.visibilityScope),
        source: optionalPhotoSource(body.source),
        exifHandlingStatus: optionalExifHandlingStatus(body.exifHandlingStatus),
        confidence: optionalConfidence(body.confidence),
        ...restAgentAttributionFields(body, auth, { defaultLabel: true }),
        notes: optionalString(body.notes),
        verificationStatus: optionalVerificationStatus(body.verificationStatus),
        capturedAt: optionalNumber(body.capturedAt),
        fileName: optionalString(body.fileName),
        apiActor: {
          apiKeyId: String(auth.apiKeyId),
          createdByUserId: auth.createdByUserId,
        },
      });

      let derivativeStatus: "pending" | "ready" | "failed" | undefined =
        imageDerivativeStatusForSession(session);
      let derivativeError: string | undefined;
      let derivativeRefs = derivativeRefsForUploadSession(session);
      if (shouldGenerateServerDerivatives(session)) {
        try {
          const generated = await generateAndStoreImageDerivatives({
            bucketName: session.originalBucket ?? config.bucketName,
            moveId,
            originalStorageKey: session.originalStorageKey,
          });
          await ctx.runMutation(internal.photos.markGeneratedDerivativesReady, {
            householdId: auth.householdId,
            moveId,
            photoId,
            derivativeRefs: generated.derivativeRefs,
            apiActor: {
              apiKeyId: String(auth.apiKeyId),
              createdByUserId: auth.createdByUserId,
            },
          });
          derivativeRefs = generated.derivativeRefs;
          derivativeStatus = "ready";
        } catch (error) {
          derivativeStatus = "failed";
          derivativeError = derivativeProcessingError(error);
          await ctx.runMutation(internal.photos.markGeneratedDerivativesFailed, {
            householdId: auth.householdId,
            moveId,
            photoId,
            derivativeError,
            apiActor: {
              apiKeyId: String(auth.apiKeyId),
              createdByUserId: auth.createdByUserId,
            },
          });
        }
      }

      const derivativeNote = derivativeNoteForStatus(derivativeStatus);
      const derivativeVariants = derivativeVariantsForSession({
        session,
        status: derivativeStatus,
      });
      const mediaSummary = {
        source: "uploadSession",
        fileName: optionalString(body.fileName),
        mimeType: session.expectedMimeType,
        sizeBytes: session.expectedSizeBytes,
        width: optionalNumber(body.width),
        height: optionalNumber(body.height),
        display: await derivativeDisplayMediaForUpload({
          moveId,
          photoId,
          derivativeRefs,
          derivativeStatus,
        }),
      };
      const agentReview = directPhotoUploadAgentReview({
        body,
        data: {
          photoId,
          uploadSessionId,
          derivativeStatus,
          derivativeError,
          derivativeNote,
          derivativeVariants,
          media: mediaSummary,
        },
      });

      return restOk(
        {
          data: {
            photoId,
            derivativeStatus,
            derivativeError,
            derivativeNote,
            derivativeVariants,
            media: mediaSummary,
            agentReview,
          },
        },
        201
      );
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

async function handlePhotoDisplayUrl(
  ctx: ActionCtx,
  args: RestRequestInput,
  photoIdSegment: string | undefined
) {
  if (!hasBearer(args.authorization)) return unknownAuthError();
  const moveId = requiredId<"moves">(args.query.moveId, "moveId query is required.");
  const photoId = requiredId<"itemPhotos">(photoIdSegment, "photoId is required.");
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
      const variant = optionalPhotoDerivativeVariant(args.query.variant) ?? "detail";
      const photo = await ctx.runQuery(internal.photos.getApiPhotoForDelivery, {
        householdId: auth.householdId,
        moveId,
        photoId,
      });
      if (!photo) {
        return restError({
          status: 404,
          code: "not_found",
          message: "Photo not found.",
        });
      }
      const mediaKind =
        photo.mediaKind ?? mediaKindForMimeType(photo.mimeType) ?? "image";
      if (mediaKind !== "image") {
        return restError({
          status: 400,
          code: "validation_error",
          message: "Display URLs are only available for image evidence.",
        });
      }
      if (!canUsePhotoDerivativeForAi(photo)) {
        return restError({
          status: 403,
          code: "insufficient_scope",
          message:
            "Photo privacy or derivative status does not allow API display delivery.",
        });
      }
      const selected = selectDerivativeRef(photo.derivativeRefs, variant);
      if (!selected) {
        return restError({
          status: 409,
          code: "derivative_not_ready",
          message: "Requested photo derivative is not ready yet.",
        });
      }

      const cloudflareUrl = cloudflareImageDeliveryUrl({
        accountHash: process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH,
        deliveryBaseUrl: process.env.CLOUDFLARE_IMAGE_DELIVERY_URL,
        deliveryDomain: process.env.CLOUDFLARE_IMAGE_DELIVERY_DOMAIN,
        imageId: photo.cloudflareImageId,
        variant: selected.variant,
      });
      const deliveryProvider: PhotoDeliveryProvider = cloudflareUrl
        ? "cloudflareImages"
        : "b2SignedUrl";
      let url = cloudflareUrl;
      if (!url) {
        const config = requireB2Config();
        url = await getSignedUrl(
          b2Client(),
          new GetObjectCommand({
            Bucket: config.bucketName,
            Key: selected.ref,
          }),
          { expiresIn: displayUrlTtlSeconds }
        );
      }

      return restOk({
        data: {
          photoId,
          moveId,
          url,
          expiresAt: Date.now() + displayUrlTtlSeconds * 1000,
          requestedVariant: variant,
          servedVariant: selected.variant,
          deliveryProvider,
          derivativeStatus: photo.derivativeStatus,
          width: photo.width,
          height: photo.height,
          mimeType: "image/webp",
        },
      });
    } catch (error) {
      return restError({
        status: errorStatus(error),
        code: "photo_display_url_failed",
        message:
          error instanceof Error ? error.message : "Photo display URL failed.",
      });
    }
  });
}

async function handleIngestionEvidenceUrl(
  ctx: ActionCtx,
  args: RestRequestInput,
  rawMoveId: string,
  rawEntryId: string,
  rawPhotoId: string
) {
  if (!hasBearer(args.authorization)) return unknownAuthError();
  const moveId = requiredId<"moves">(rawMoveId, "moveId is required.");
  const entryId = requiredId<"ingestionQueueEntries">(
    rawEntryId,
    "entryId is required."
  );
  const photoId = requiredId<"itemPhotos">(rawPhotoId, "photoId is required.");
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
      const variant = ingestionEvidenceVariant(args.query.variant);
      const record = await ctx.runQuery(
        internal.ingestionQueue.getApiEvidenceForDelivery,
        {
          householdId: auth.householdId,
          moveId,
          entryId,
          photoId,
        }
      );
      if (!record) {
        return restError({
          status: 404,
          code: "not_found",
          message: "Ingestion queue evidence not found.",
        });
      }
      const { photo } = record;
      const mediaKind =
        photo.mediaKind ?? mediaKindForMimeType(photo.mimeType) ?? "image";
      const config = requireB2Config();
      let key = photo.originalStorageKey;
      let bucket = photo.originalBucket || config.bucketName;
      let mimeType = photo.mimeType;
      let servedVariant: "original" | PhotoDerivativeVariant = "original";

      if (variant !== "original") {
        if (mediaKind !== "image") {
          return restError({
            status: 400,
            code: "validation_error",
            message: "Derivative evidence URLs are only available for images.",
          });
        }
        const selected = selectDerivativeRef(photo.derivativeRefs, variant);
        if (!selected) {
          return restError({
            status: 409,
            code: "derivative_not_ready",
            message: "Requested evidence derivative is not ready yet.",
          });
        }
        const cloudflareUrl = cloudflareImageDeliveryUrl({
          accountHash: process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH,
          deliveryBaseUrl: process.env.CLOUDFLARE_IMAGE_DELIVERY_URL,
          deliveryDomain: process.env.CLOUDFLARE_IMAGE_DELIVERY_DOMAIN,
          imageId: photo.cloudflareImageId,
          variant: selected.variant,
        });
        if (cloudflareUrl) {
          return restOk({
            data: {
              entryId,
              photoId,
              moveId,
              url: cloudflareUrl,
              expiresAt: Date.now() + displayUrlTtlSeconds * 1000,
              requestedVariant: variant,
              servedVariant: selected.variant,
              mediaKind,
              deliveryProvider: "cloudflareImages",
              mimeType: "image/webp",
              derivativeStatus: photo.derivativeStatus,
            },
          });
        }
        key = selected.ref;
        bucket = config.bucketName;
        mimeType = "image/webp";
        servedVariant = selected.variant;
      }

      const url = await getSignedUrl(
        b2Client(),
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
        { expiresIn: displayUrlTtlSeconds }
      );

      return restOk({
        data: {
          entryId,
          photoId,
          moveId,
          url,
          expiresAt: Date.now() + displayUrlTtlSeconds * 1000,
          requestedVariant: variant,
          servedVariant,
          mediaKind,
          deliveryProvider: "b2SignedUrl",
          mimeType,
          derivativeStatus: photo.derivativeStatus,
        },
      });
    } catch (error) {
      return restError({
        status: errorStatus(error),
        code: "ingestion_evidence_url_failed",
        message:
          error instanceof Error
            ? error.message
            : "Ingestion evidence URL failed.",
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

function imageDerivativeStatusForSession(session: {
  expectedMimeType: string;
  mediaKind?: string;
  derivativeUploads?: unknown[];
}) {
  const mediaKind = session.mediaKind ?? mediaKindForMimeType(session.expectedMimeType);
  if (mediaKind !== "image") return undefined;
  return Array.isArray(session.derivativeUploads) && session.derivativeUploads.length > 0
    ? "ready"
    : "pending";
}

function shouldGenerateServerDerivatives(session: {
  expectedMimeType: string;
  mediaKind?: string;
  derivativeUploads?: unknown[];
}) {
  const mediaKind = session.mediaKind ?? mediaKindForMimeType(session.expectedMimeType);
  return (
    mediaKind === "image" &&
    (!Array.isArray(session.derivativeUploads) ||
      session.derivativeUploads.length === 0)
  );
}

async function generateAndStoreImageDerivatives({
  bucketName,
  moveId,
  originalStorageKey,
}: {
  bucketName: string;
  moveId: Id<"moves">;
  originalStorageKey: string;
}) {
  const client = b2Client();
  const original = await client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: originalStorageKey,
    })
  );
  const originalBytes = await objectBodyToBuffer(original.Body);
  const derivativeRefs: Partial<Record<PhotoDerivativeVariant, string>> = {};

  for (const spec of serverDerivativeSpecs) {
    const { data, info } = await sharp(originalBytes, { failOn: "none" })
      .rotate()
      .resize({
        width: spec.width,
        height: spec.height,
        fit: spec.fit,
        withoutEnlargement: spec.fit === "inside",
      })
      .webp({ quality: spec.quality })
      .toBuffer({ resolveWithObject: true });
    const storageKey = uploadObjectKey({
      moveId,
      mimeType: "image/webp",
      prefix: "photo-derivatives",
    });

    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: storageKey,
        Body: data,
        ContentType: "image/webp",
        ContentLength: data.byteLength,
        Metadata: {
          variant: spec.variant,
          width: String(info.width),
          height: String(info.height),
        },
      })
    );
    derivativeRefs[spec.variant] = storageKey;
  }

  return { derivativeRefs };
}

async function objectBodyToBuffer(body: unknown) {
  if (!body) {
    throw new Error("Uploaded image object was empty.");
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }
  if (
    typeof (body as { transformToByteArray?: unknown }).transformToByteArray ===
    "function"
  ) {
    const bytes = await (
      body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();
    return Buffer.from(bytes);
  }
  if (typeof (body as { arrayBuffer?: unknown }).arrayBuffer === "function") {
    const arrayBuffer = await (
      body as { arrayBuffer: () => Promise<ArrayBuffer> }
    ).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  if (
    typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] ===
    "function"
  ) {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new Error("Could not read uploaded image bytes.");
}

function derivativeProcessingError(error: unknown) {
  if (error instanceof Error && error.message) {
    return `Server derivative processing failed: ${error.message}`;
  }
  return "Server derivative processing failed.";
}

function derivativeNoteForStatus(
  status: "pending" | "ready" | "failed" | undefined
) {
  switch (status) {
    case "ready":
      return "Original evidence was uploaded and MovingManifest created web-ready image derivatives for display and AI review.";
    case "pending":
      return "Original evidence was uploaded and web-ready image derivatives are pending.";
    case "failed":
      return "Original evidence was uploaded, but server-side derivative processing failed. The photo record remains available for review and retry.";
    default:
      return "Original image evidence was uploaded.";
  }
}

function derivativeVariantsForStatus(
  status: "pending" | "ready" | "failed" | undefined
): DerivativeVariantSummary[] | undefined {
  if (!status) return undefined;
  return serverDerivativeSpecs.map((spec) => ({
    variant: spec.variant,
    mimeType: "image/webp",
    width: spec.width,
    height: spec.height,
    fit: spec.fit,
    status,
  }));
}

function derivativeVariantsForSession({
  session,
  status,
}: {
  session: {
    derivativeUploads?: Array<{
      variant: PhotoDerivativeVariant;
      expectedMimeType: string;
      width: number;
      height: number;
    }>;
  };
  status: "pending" | "ready" | "failed" | undefined;
}): DerivativeVariantSummary[] | undefined {
  if (!status) return undefined;
  if (session.derivativeUploads?.length) {
    return session.derivativeUploads.map((derivative) => ({
      variant: derivative.variant,
      mimeType: derivative.expectedMimeType,
      width: derivative.width,
      height: derivative.height,
      fit: "clientProvided" as const,
      status,
    }));
  }
  return derivativeVariantsForStatus(status);
}

function derivativeRefsForUploadSession(session: {
  derivativeUploads?: Array<{
    variant: PhotoDerivativeVariant;
    storageKey: string;
  }>;
}) {
  return (session.derivativeUploads ?? []).reduce<
    Partial<Record<PhotoDerivativeVariant, string>>
  >((refs, derivative) => {
    refs[derivative.variant] = derivative.storageKey;
    return refs;
  }, {});
}

async function derivativeDisplayMediaForUpload({
  moveId,
  photoId,
  derivativeRefs,
  derivativeStatus,
}: {
  moveId: Id<"moves">;
  photoId: Id<"itemPhotos">;
  derivativeRefs: Partial<Record<PhotoDerivativeVariant, string>>;
  derivativeStatus: "pending" | "ready" | "failed" | undefined;
}) {
  const basePath = `/api/v1/photos/${photoId}/display-url?moveId=${moveId}`;
  const ready = derivativeStatus === "ready";
  const expiresAt = ready ? Date.now() + displayUrlTtlSeconds * 1000 : undefined;
  const variants = await Promise.all(
    photoDerivativeVariants.map(async (variant) => {
      const selected = ready ? selectDerivativeRef(derivativeRefs, variant) : null;
      const url = selected ? await signedDerivativeUrl(selected.ref) : null;
      return {
        variant,
        status: selected
          ? ("ready" as const)
          : derivativeStatus === "failed"
            ? ("failed" as const)
            : derivativeStatus
              ? ("pending" as const)
              : ("unsupported" as const),
        url,
        displayUrlPath: selected ? `${basePath}&variant=${variant}` : undefined,
        servedVariant: selected?.variant,
        deliveryProvider: selected ? ("b2SignedUrl" as const) : undefined,
        expiresAt: selected ? expiresAt : undefined,
      };
    })
  );
  const detail = variants.find((variant) => variant.variant === "detail");

  return {
    status: ready
      ? ("ready" as const)
      : derivativeStatus === "failed"
        ? ("failed" as const)
        : derivativeStatus
          ? ("pending" as const)
          : ("unsupported" as const),
    url: detail?.url ?? null,
    displayUrlPath: detail?.displayUrlPath,
    expiresAt: detail?.expiresAt,
    deliveryProvider: detail?.deliveryProvider,
    variants,
    note: ready
      ? "Short-lived derivative display URLs are ready."
      : derivativeStatus === "failed"
        ? "Derivative generation failed; retry or inspect derivativeError."
        : derivativeStatus
          ? "Image derivatives are not ready yet."
          : "Display derivatives are available only for image evidence.",
  };
}

async function signedDerivativeUrl(storageKey: string) {
  const config = requireB2Config();
  return await getSignedUrl(
    b2Client(),
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: storageKey,
    }),
    { expiresIn: displayUrlTtlSeconds }
  );
}

function directPhotoUploadAgentReview({
  body,
  data,
}: {
  body: Record<string, unknown>;
  data: {
    photoId: Id<"itemPhotos">;
    uploadSessionId: Id<"photoUploadSessions">;
    derivativeStatus?: "pending" | "ready" | "failed";
    derivativeError?: string;
    derivativeNote: string;
    derivativeVariants?: DerivativeVariantSummary[];
    aiReview?: unknown;
    media: Record<string, unknown>;
  };
}) {
  const target = evidenceTargetFromUploadBody(body);
  const photoType = optionalPhotoType(body.photoType) ?? defaultPhotoTypeForTarget(target);
  const privacyLevel = optionalPrivacyLevel(body.privacyLevel) ?? "normal";
  const aiReview = bodyObject(data.aiReview);
  const aiReviewStatus = optionalString(aiReview.status);
  const decisions = pruneUndefined({
    attachmentTarget: target,
    room: optionalString(body.room),
    caption: optionalString(body.caption),
    photoType,
    privacyLevel,
    visibilityScope:
      optionalVisibilityScope(body.visibilityScope) ?? "moveCollaborators",
    source: optionalPhotoSource(body.source) ?? "api",
    confidence: optionalConfidence(body.confidence),
    notes: optionalString(body.notes),
    verificationStatus:
      optionalVerificationStatus(body.verificationStatus) ?? "unreviewed",
    capturedAt: optionalNumber(body.capturedAt),
    generateAiSuggestions: optionalBoolean(body.generateAiSuggestions),
  });
  const summary = [
    "Uploaded image evidence",
    `for ${target.label}`,
    decisions.caption
      ? `with caption "${String(decisions.caption)}"`
      : "without a caption",
    `as ${photoType} evidence`,
    `with ${privacyLevel} privacy`,
    `and derivative status ${data.derivativeStatus ?? "unknown"}`,
    aiReviewStatus ? `AI review ${aiReviewStatus}` : undefined,
  ]
    .filter(Boolean)
    .join(", ");

  return pruneUndefined({
    userFacingSummary: `${summary}.`,
    photoId: data.photoId,
    uploadSessionId: data.uploadSessionId,
    decisions,
    media: data.media,
    derivativeStatus: data.derivativeStatus,
    derivativeError: data.derivativeError,
    derivativeNote: data.derivativeNote,
    derivativeVariants: data.derivativeVariants,
    aiReviewStatus,
    aiReview: data.aiReview,
    correctionPrompt:
      "Tell the user these choices were used so they can correct only the caption, target, privacy, type, quantity, or AI suggestions that look wrong.",
  });
}

function evidenceTargetFromUploadBody(body: Record<string, unknown>) {
  const itemId = optionalString(body.itemId);
  if (itemId) {
    return { type: "item", id: itemId, label: `item ${itemId}` };
  }
  const boxId = optionalString(body.boxId);
  if (boxId) {
    return { type: "box", id: boxId, label: `box ${boxId}` };
  }
  const spaceId = optionalString(body.spaceId);
  if (spaceId) {
    return { type: "space", id: spaceId, label: `space ${spaceId}` };
  }
  const transportResourceId = optionalString(body.transportResourceId);
  if (transportResourceId) {
    return {
      type: "transportResource",
      id: transportResourceId,
      label: `transport resource ${transportResourceId}`,
    };
  }
  const transportZoneId = optionalString(body.transportZoneId);
  if (transportZoneId) {
    return {
      type: "transportZone",
      id: transportZoneId,
      label: `transport zone ${transportZoneId}`,
    };
  }
  const room = optionalString(body.room);
  if (room) {
    return { type: "room", label: `room ${room}`, room };
  }
  return { type: "move", label: "the move" };
}

function defaultPhotoTypeForTarget(target: { type: string }) {
  switch (target.type) {
    case "item":
      return "item";
    case "box":
      return "boxContents";
    case "space":
    case "room":
      return "room";
    default:
      return "other";
  }
}

function pruneUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );
}

async function loadDirectImageUploadMedia(body: Record<string, unknown>) {
  const sourceUrl = optionalString(body.sourceUrl);
  const dataUrl = optionalString(body.dataUrl);
  const fileBase64 = optionalString(body.fileBase64);
  const sourceCount = [sourceUrl, dataUrl, fileBase64].filter(Boolean).length;
  if (sourceCount !== 1) {
    throw new Error("Provide exactly one of sourceUrl, dataUrl, or fileBase64.");
  }

  if (sourceUrl) {
    return await loadRemoteImageUploadMedia({
      sourceUrl,
      fileName: optionalString(body.fileName),
      mimeType: optionalString(body.mimeType),
    });
  }

  if (dataUrl) {
    const parsed = parseImageDataUrl(dataUrl);
    return finalizeLoadedImageUploadMedia({
      bytes: parsed.bytes,
      source: "dataUrl",
      fileName: optionalString(body.fileName),
      mimeType:
        optionalString(body.mimeType) ??
        parsed.mimeType ??
        sniffImageMimeType(parsed.bytes),
    });
  }

  const bytes = decodeBase64Image(fileBase64 ?? "");
  return finalizeLoadedImageUploadMedia({
    bytes,
    source: "fileBase64",
    fileName: optionalString(body.fileName),
    mimeType:
      optionalString(body.mimeType) ??
      sniffImageMimeType(bytes) ??
      mimeTypeForFilename(optionalString(body.fileName)),
  });
}

async function loadRemoteImageUploadMedia({
  sourceUrl,
  fileName,
  mimeType,
}: {
  sourceUrl: string;
  fileName?: string;
  mimeType?: string;
}) {
  const url = parseRemoteImageUrl(sourceUrl);
  const response = await fetch(url, {
    redirect: "error",
    headers: { accept: "image/jpeg,image/png,image/webp" },
  });
  if (!response.ok) {
    throw new Error(`Could not download sourceUrl: HTTP ${response.status}.`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxImageUploadBytes) {
    throw new Error("Images must be under 25 MB.");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  return finalizeLoadedImageUploadMedia({
    bytes,
    source: "sourceUrl",
    fileName: fileName ?? filenameFromUrl(url),
    mimeType:
      mimeType ??
      normalizeHeaderMimeType(response.headers.get("content-type")) ??
      sniffImageMimeType(bytes) ??
      mimeTypeForFilename(fileName ?? url.pathname),
  });
}

function finalizeLoadedImageUploadMedia({
  bytes,
  source,
  fileName,
  mimeType,
}: {
  bytes: Buffer;
  source: "sourceUrl" | "dataUrl" | "fileBase64";
  fileName?: string;
  mimeType?: string;
}) {
  if (bytes.byteLength <= 0) {
    throw new Error("Image upload data was empty.");
  }
  if (bytes.byteLength > maxImageUploadBytes) {
    throw new Error("Images must be under 25 MB.");
  }
  if (!mimeType) {
    throw new Error(
      "Could not determine MIME type. Pass mimeType for base64 uploads."
    );
  }

  return {
    bytes,
    source,
    fileName,
    mimeType,
  };
}

function parseRemoteImageUrl(sourceUrl: string) {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error("sourceUrl must be a valid HTTP or HTTPS URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("sourceUrl must be an HTTP or HTTPS URL.");
  }
  if (url.username || url.password) {
    throw new Error("sourceUrl must not include credentials.");
  }
  if (isBlockedRemoteHostname(url.hostname)) {
    throw new Error("sourceUrl must point to a public image URL.");
  }

  return url;
}

function isBlockedRemoteHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return true;
  }

  const ipv4 = normalized.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return true;
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function parseImageDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(?:;[^,]*)?;base64,([\s\S]+)$/i);
  if (!match) {
    throw new Error("dataUrl must be a base64 image data URL.");
  }
  return {
    mimeType: normalizeHeaderMimeType(match[1]),
    bytes: decodeBase64Image(match[2]),
  };
}

function decodeBase64Image(value: string) {
  const normalized = value.replace(/\s/g, "");
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error("fileBase64 must contain base64 image data.");
  }
  return Buffer.from(normalized, "base64");
}

function normalizeHeaderMimeType(value: string | null | undefined) {
  return value?.trim().toLowerCase().split(";")[0] || undefined;
}

function filenameFromUrl(url: URL) {
  const name = url.pathname.split("/").filter(Boolean).pop();
  return name || undefined;
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

function sniffImageMimeType(bytes: Buffer) {
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
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return undefined;
}

function uploadObjectKey({
  moveId,
  mimeType,
  prefix,
}: {
  moveId: string;
  mimeType: string;
  prefix?: string;
}) {
  const mediaKind = mediaKindForMimeType(mimeType);
  if (!mediaKind) {
    throw new Error("Unsupported media type.");
  }
  return `moves/${moveId}/${prefix ?? mediaObjectPrefix(mediaKind)}/${crypto.randomUUID()}.${fileExtensionForMediaMimeType(
    mimeType
  )}`;
}

function parseDerivativeUploads(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const derivative = bodyObject(entry);
    const requestedMimeType = requiredString(
      derivative.mimeType,
      "derivative mimeType is required."
    );
    const sizeBytes = requiredNumber(
      derivative.sizeBytes,
      "derivative sizeBytes is required."
    );
    const normalized = assertImageDerivativeUploadFileShape({
      mimeType: requestedMimeType,
      sizeBytes,
    });
    const parsed = {
      variant: requiredDerivativeVariant(derivative.variant),
      mimeType: normalized.mimeType,
      sizeBytes: normalized.sizeBytes,
      width: requiredNumber(derivative.width, "derivative width is required."),
      height: requiredNumber(derivative.height, "derivative height is required."),
    };
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

function optionalBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return undefined;
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

function optionalPhotoDerivativeVariant(value: unknown) {
  return optionalLiteral(photoDerivativeVariants, value);
}

function ingestionEvidenceVariant(value: unknown) {
  return optionalLiteral(ingestionEvidenceVariants, value) ?? "original";
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
