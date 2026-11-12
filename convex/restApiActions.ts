"use node";

import { createHash } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { ConvexError, v } from "convex/values";
import { checkFileSize, usageLimitError } from "./lib/usageLimits/core";
import { transportLimits } from "../shared/media-limits.mjs";
import type { UploadRefusal } from "./lib/usageLimits/refusal";
import sharp from "sharp";

import { downloadPublicHttpsMedia } from "../mcp-server/media-ingress.mjs";

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
import {
  assertImageDerivativeUploadFileShape,
  assertOriginalUploadFileShape,
  fileExtensionForMediaMimeType,
  mediaKindForMimeType,
  mediaObjectPrefix,
} from "./lib/mediaStorage";
import {
  serverDerivativeSpecs,
  type PhotoDerivativeVariant,
} from "./lib/imageDerivatives";

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
type ApiActionAuth = {
  householdId: Id<"households">;
  moveId?: Id<"moves">;
  apiKeyId: Id<"apiKeys">;
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
  },
  handler: async (ctx, args): Promise<RestResponse> => {
    const segments = parseRestPath(args.path);
    if (segments[0] === "uploads" && segments[1] === "batch" && args.method === "POST") return handleUploadBatch(ctx, args);
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
    // GET /moves/{moveId}/photos/{photoId}/display-url?variant=detail — sign a
    // short-lived display URL for an already-authorized photo. Lives here (not
    // the query router) because signing B2/Cloudflare URLs needs an action. The
    // stdio/HTTP MCP server fetches these bytes server-side to return a native
    // inline image to the model (MOVE-317).
    if (
      segments[0] === "moves" &&
      segments[2] === "photos" &&
      segments[4] === "display-url" &&
      args.method === "GET"
    ) {
      return (await handlePhotoDisplayUrl(
        ctx,
        args,
        segments[1],
        segments[3],
      )) as RestResponse;
    }

    return (await ctx.runMutation(internal.restApi.handle, args)) as RestResponse;
  },
});

// Display variants the inline-image path may request. Excludes "original"
// (buildDisplayUrlResult rejects it — originals go through the audited download
// action). Default is "detail" (1200px) so agents can read fine print / model
// numbers off the photo.
const displayUrlVariants = new Set(["thumb", "card", "detail", "full"] as const);
type DisplayUrlVariant = "thumb" | "card" | "detail" | "full";

async function handlePhotoDisplayUrl(
  ctx: ActionCtx,
  args: RestRequestInput,
  moveIdRaw: string | undefined,
  photoIdRaw: string | undefined
) {
  if (!hasBearer(args.authorization)) return unknownAuthError();
  const moveId = requiredId<"moves">(moveIdRaw, "moveId is required.");
  const photoId = requiredId<"itemPhotos">(photoIdRaw, "photoId is required.");
  const authResult = await authenticateAction(ctx, args, moveId);
  if (!authResult.ok || !authResult.auth) {
    return authResult.response ?? unknownAuthError();
  }
  const auth = {
    ...(authResult.auth as ApiActionAuth),
    moveId: (authResult.auth as ApiActionAuth).moveId ?? moveId,
  };

  return await withActionRateLimit(ctx, args, auth, async () => {
    const requested = optionalString(args.query.variant);
    const variant: DisplayUrlVariant =
      requested && displayUrlVariants.has(requested as DisplayUrlVariant)
        ? (requested as DisplayUrlVariant)
        : "detail";
    const result = await ctx.runAction(
      internal.photos.getDisplayUrlForApiActor,
      {
        householdId: auth.householdId,
        moveId,
        photoId,
        variant,
      }
    );
    return restOk({ data: result });
  });
}

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
      const result = await ctx.runAction(internal.photos.initUploadForActor, {
        householdId: auth.householdId, moveId,
        operationId: optionalString(body.operationId) ?? args.idempotencyKey,
        itemId: optionalId<"items">(body.itemId), boxId: optionalId<"boxes">(body.boxId),
        spaceId: optionalId<"moveSpaces">(body.spaceId),
        transportResourceId: optionalId<"transportResources">(body.transportResourceId),
        transportZoneId: optionalId<"transportZones">(body.transportZoneId), room: optionalString(body.room),
        mimeType: requiredString(body.mimeType, "mimeType is required."), sizeBytes: requiredNumber(body.sizeBytes, "sizeBytes is required."),
        derivatives: parseDerivativeUploads(body.derivatives),
        apiActor: { apiKeyId: String(auth.apiKeyId), createdByUserId: auth.createdByUserId, acknowledgeContactDetails: body.acknowledgeContactDetails as { emails: number; phones: number; addresses: number } | undefined, restorePrivately: body.restorePrivately as boolean | undefined },
      });
      if (result.refusal) return { status: 413, body: { error: result.refusal } };
      return restOk({ data: result }, 201);
    } catch (error) {
      if (error instanceof ConvexError && typeof error.data === "object" && error.data?.code === "USAGE_LIMIT_REACHED") return { status: 413, body: { error: error.data } };
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
    let transferFailed = false;
    try {
      const callerOperation = optionalString(body.operationId) ?? args.idempotencyKey;
      if (callerOperation) { const replay = await ctx.runQuery(internal.photos.completedOperation, { householdId: auth.householdId, moveId, actorUserId: auth.createdByUserId, operationId: callerOperation }); if (replay) return restOk({ data: { ...replay, storage: await ctx.runQuery(internal.usageLimits.summaryInternal, { householdId: auth.householdId }), uploadLimits: await ctx.runQuery(internal.usageLimits.policyInternal, { householdId: auth.householdId }) } }, 201); }
      const policy = await ctx.runQuery(internal.usageLimits.policyInternal, { householdId: auth.householdId });
      const operationId = optionalString(body.operationId) ?? args.idempotencyKey ?? (policy.requiresOperationId ? undefined : crypto.randomUUID());
      if (!operationId) return { status: 400, body: { error: { code: "OPERATION_ID_REQUIRED", message: "Send an operationId or idempotency key and reuse it when retrying this upload." } } };
      let fetchReservation: Id<"uploadReservations"> | undefined;
      let media: Awaited<ReturnType<typeof loadDirectImageUploadMedia>>;
      try {
        media = await loadDirectImageUploadMedia(body, policy.maxFileBytes.image, async declared => {
          const held = await ctx.runMutation(internal.usageLimits.reserveFetch, { householdId: auth.householdId, key: `${moveId}:${auth.createdByUserId}:${operationId}`, bytes: declared ?? 1, unknownLength: declared === null });
          if (held.refusal) { const error = new Error(held.refusal.message); Object.assign(error, { payload: { error: held.refusal } }); throw error; }
          fetchReservation = held.reservationId;
        });
        if (fetchReservation) {
          const resized = await ctx.runMutation(internal.usageLimits.finishFetch, { householdId: auth.householdId, reservationId: fetchReservation, bytes: media.bytes.byteLength });
          if (resized.refusal) { await ctx.runMutation(internal.usageLimits.releaseFetch, { id: fetchReservation }); await ctx.runMutation(internal.usageLimits.recordActionRefusal, { householdId: auth.householdId, actorUserId: auth.createdByUserId, code: resized.refusal.code, message: resized.refusal.message }).catch(() => null); return { status: 413, body: { error: resized.refusal } }; }
        }
      } catch (error) {
        if (fetchReservation) await ctx.runMutation(internal.usageLimits.releaseFetch, { id: fetchReservation });
        const refusal = (error as { payload?: { error?: UploadRefusal } }).payload?.error;
        if (refusal) { await ctx.runMutation(internal.usageLimits.recordActionRefusal, { householdId: auth.householdId, actorUserId: auth.createdByUserId, code: refusal.code, message: refusal.message }).catch(() => null); return { status: 413, body: { error: refusal } }; }
        throw error;
      }
      const sizeRefusal = checkFileSize("image", media.bytes.byteLength, policy.maxFileBytes.image);
      if (sizeRefusal) { await ctx.runMutation(internal.usageLimits.recordActionRefusal, { householdId: auth.householdId, actorUserId: auth.createdByUserId, code: sizeRefusal.code, message: sizeRefusal.message }).catch(() => null); return { status: 413, body: { error: sizeRefusal } }; }
      const original = assertOriginalUploadFileShape({
        mimeType: media.mimeType,
        sizeBytes: media.bytes.byteLength,
      }, Number.MAX_SAFE_INTEGER);
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
      let objectKey = uploadObjectKey({
        moveId,
        mimeType: original.mimeType,
      });
      const expiresAt = Date.now() + uploadSessionTtlMs;
      const apiActor = {
        acknowledgeContactDetails: body.acknowledgeContactDetails as { emails: number; phones: number; addresses: number } | undefined,
        restorePrivately: body.restorePrivately as boolean | undefined,
        apiKeyId: String(auth.apiKeyId),
        createdByUserId: auth.createdByUserId,
      };

      const begun = await ctx.runMutation(
        internal.photos.tryCreateUploadSession,
        {
          operationId,
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
          expiresAt,
          apiActor,
        }
      );

      if (begun.refusal) { if (fetchReservation) await ctx.runMutation(internal.usageLimits.releaseFetch, { id: fetchReservation }); return { status: 413, body: { error: begun.refusal } }; }
      uploadSessionId = begun.uploadSessionId!;
      const persisted = await ctx.runQuery(internal.photos.getUploadSession, { householdId: auth.householdId, moveId, uploadSessionId, apiActor });
      if (persisted.completedPhotoId) return restOk({ data: { photoId: persisted.completedPhotoId, uploadSessionId, storage: await ctx.runQuery(internal.usageLimits.summaryInternal, { householdId: auth.householdId }) } }, 201);
      objectKey = persisted.originalStorageKey;
      let originalExists = false;
      try { const head = await b2Client().send(new HeadObjectCommand({ Bucket: config.bucketName, Key: objectKey })); originalExists = head.ContentLength === media.bytes.byteLength; if (!originalExists) throw new Error("An earlier upload at this operation id has different bytes."); }
      catch (error) { if (!["NotFound", "NoSuchKey"].includes((error as { name?: string }).name ?? "")) throw error; }
      if (!originalExists) try { await b2Client().send(
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: objectKey,
          Body: media.bytes,
          ContentType: original.mimeType,
          ContentLength: media.bytes.byteLength,
        })
      ); } catch (error) { transferFailed = true; throw error; }

      const finished = await ctx.runMutation(internal.photos.tryCompleteUploadSession, {
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
        notes: optionalString(body.notes),
        verificationStatus: optionalVerificationStatus(body.verificationStatus),
        capturedAt: optionalNumber(body.capturedAt),
        apiActor,
      });

      if (finished.refusal) return { status: 413, body: { error: finished.refusal } };
      const photoId = finished.photoId!;
      let derivativeStatus: "ready" | "failed" | undefined;
      let derivativeError: string | undefined;
      try {
        const generated = await generateAndStoreImageDerivatives({
          onPrepare: (storageKey, bytes) => ctx.runMutation(internal.photos.prepareStoredDerivative, { photoId, storageKey, bytes }),
          onStored: (variant, storageKey, bytes) => ctx.runMutation(internal.photos.recordStoredDerivative, { photoId, variant, storageKey, bytes }),
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
        }).catch(() => { /* Accepted original and durable copy intents remain counted. */ });
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
            uploadLimits: await ctx.runQuery(internal.usageLimits.policyInternal, { householdId: auth.householdId }),
            storage: await ctx.runQuery(internal.usageLimits.summaryInternal, { householdId: auth.householdId }),
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
      if (uploadSessionId && (transferFailed || (error instanceof Error && /does not match|invalid|unsupported|USAGE_LIMIT_REACHED|FILE_TOO_LARGE/i.test(error.message)))) {
        await ctx.runMutation(internal.photos.markUploadSessionFailed, {
          ...(transferFailed ? { code: "UPLOAD_TRANSFER_FAILED", reason: error instanceof Error ? error.message : "Upload transfer failed." } : {}),
          householdId: auth.householdId,
          moveId,
          uploadSessionId,
          apiActor: {
            acknowledgeContactDetails: body.acknowledgeContactDetails as { emails: number; phones: number; addresses: number } | undefined,
            restorePrivately: body.restorePrivately as boolean | undefined,
            apiKeyId: String(auth.apiKeyId),
            createdByUserId: auth.createdByUserId,
          },
        });
      }
      if (error instanceof ConvexError && typeof error.data === "object" && error.data?.code === "USAGE_LIMIT_REACHED") return { status: 413, body: { error: error.data } };
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
            acknowledgeContactDetails: body.acknowledgeContactDetails as { emails: number; phones: number; addresses: number } | undefined,
            restorePrivately: body.restorePrivately as boolean | undefined,
          apiKeyId: String(auth.apiKeyId),
          createdByUserId: auth.createdByUserId,
        },
      });
      if (session.completedPhotoId) return restOk({ data: { photoId: session.completedPhotoId, uploadSessionId, derivativeStatus: session.completedPhoto?.derivativeStatus, derivativeError: session.completedPhoto?.derivativeError, derivativeNote: derivativeNoteForStatus(session.completedPhoto?.derivativeStatus), derivativeVariants: derivativeVariantsForStatus(session.completedPhoto?.derivativeStatus), storage: await ctx.runQuery(internal.usageLimits.summaryInternal, { householdId: auth.householdId }) } }, 201);
      await ctx.runMutation(internal.photos.startFinalize, { householdId: auth.householdId, moveId, uploadSessionId, apiActor: { apiKeyId: String(auth.apiKeyId), createdByUserId: auth.createdByUserId } });
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

      const finished = await ctx.runMutation(internal.photos.tryCompleteUploadSession, {
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
        notes: optionalString(body.notes),
        verificationStatus: optionalVerificationStatus(body.verificationStatus),
        capturedAt: optionalNumber(body.capturedAt),
        apiActor: {
            acknowledgeContactDetails: body.acknowledgeContactDetails as { emails: number; phones: number; addresses: number } | undefined,
            restorePrivately: body.restorePrivately as boolean | undefined,
          apiKeyId: String(auth.apiKeyId),
          createdByUserId: auth.createdByUserId,
        },
      });

      if (finished.refusal) return { status: 413, body: { error: finished.refusal } };
      const photoId = finished.photoId!;
      let derivativeStatus: "pending" | "ready" | "failed" | undefined =
        imageDerivativeStatusForSession(session);
      let derivativeError: string | undefined;
      if (shouldGenerateServerDerivatives(session)) {
        try {
          const generated = await generateAndStoreImageDerivatives({
          onPrepare: (storageKey, bytes) => ctx.runMutation(internal.photos.prepareStoredDerivative, { photoId, storageKey, bytes }),
          onStored: (variant, storageKey, bytes) => ctx.runMutation(internal.photos.recordStoredDerivative, { photoId, variant, storageKey, bytes }),
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
            acknowledgeContactDetails: body.acknowledgeContactDetails as { emails: number; phones: number; addresses: number } | undefined,
            restorePrivately: body.restorePrivately as boolean | undefined,
              apiKeyId: String(auth.apiKeyId),
              createdByUserId: auth.createdByUserId,
            },
          });
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
            acknowledgeContactDetails: body.acknowledgeContactDetails as { emails: number; phones: number; addresses: number } | undefined,
            restorePrivately: body.restorePrivately as boolean | undefined,
              apiKeyId: String(auth.apiKeyId),
              createdByUserId: auth.createdByUserId,
            },
          }).catch(() => { /* Accepted original and durable copy intents remain counted. */ });
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
            uploadLimits: await ctx.runQuery(internal.usageLimits.policyInternal, { householdId: auth.householdId }),
            storage: await ctx.runQuery(internal.usageLimits.summaryInternal, { householdId: auth.householdId }),
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
      if (error instanceof Error && /does not match|unsupported|invalid|USAGE_LIMIT_REACHED|FILE_TOO_LARGE/i.test(error.message)) await ctx.runMutation(internal.photos.markUploadSessionFailed, {
        code: "UPLOAD_VALIDATION_FAILED", reason: error.message,
        householdId: auth.householdId,
        moveId,
        uploadSessionId,
        apiActor: {
            acknowledgeContactDetails: body.acknowledgeContactDetails as { emails: number; phones: number; addresses: number } | undefined,
            restorePrivately: body.restorePrivately as boolean | undefined,
          apiKeyId: String(auth.apiKeyId),
          createdByUserId: auth.createdByUserId,
        },
      });
      if (error instanceof ConvexError && typeof error.data === "object" && error.data?.code === "USAGE_LIMIT_REACHED") return { status: 413, body: { error: error.data } };
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
    method: args.method, path: args.path, query: args.query, authorization: args.authorization, body: args.body,
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
    const replay = idempotency.replay;
    const payload = bodyObject(replay.body), data = bodyObject(payload.data);
    if ("storage" in data || /^(?:\/?uploads|\/?(?:photos|images)\/(?:upload|finalize))/.test(args.path)) return { ...replay, body: { ...payload, data: { ...data, uploadLimits: await ctx.runQuery(internal.usageLimits.policyInternal, { householdId: auth.householdId }), storage: await ctx.runQuery(internal.usageLimits.summaryInternal, { householdId: auth.householdId }) } } };
    return replay;
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
  onStored, onPrepare,
  bucketName,
  moveId,
  originalStorageKey,
}: {
  onPrepare: (storageKey: string, bytes: number) => Promise<unknown>;
  onStored: (variant: PhotoDerivativeVariant, storageKey: string, bytes: number) => Promise<unknown>;
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

    await onPrepare(storageKey, data.byteLength);
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
    await onStored(spec.variant, storageKey, data.byteLength);
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
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
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
      return "Original evidence was uploaded and Assist With Moving created web-ready image derivatives for display and AI review.";
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

async function loadDirectImageUploadMedia(body: Record<string, unknown>, cap = transportLimits.image, beforeRead?: (declared: number | null) => Promise<void>) {
  const finish = (input: Parameters<typeof finalizeLoadedImageUploadMedia>[0]) => finalizeLoadedImageUploadMedia({ ...input, cap });
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
      cap, beforeRead,
    });
  }

  if (dataUrl) {
    const parsed = parseImageDataUrl(dataUrl);
    return finish({
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
  return finish({
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
  mimeType, cap, beforeRead,
}: {
  cap: number; beforeRead?: (declared: number | null) => Promise<void>;
  sourceUrl: string;
  fileName?: string;
  mimeType?: string;
}) {
  const remote = await downloadPublicHttpsMedia(sourceUrl, {
    maxBytes: Math.min(cap, transportLimits.image), fileKind: "image", beforeRead,
  });
  const bytes = remote.bytes;
  return finalizeLoadedImageUploadMedia({
    bytes, cap,
    source: "sourceUrl",
    fileName: fileName ?? filenameFromUrl(remote.finalUrl),
    mimeType:
      mimeType ??
      normalizeHeaderMimeType(remote.contentType) ??
      sniffImageMimeType(bytes) ??
      mimeTypeForFilename(fileName ?? remote.finalUrl.pathname),
  });
}

function finalizeLoadedImageUploadMedia({
  bytes,
  cap = transportLimits.image,
  source,
  fileName,
  mimeType,
}: {
  bytes: Buffer;
  cap?: number;
  source: "sourceUrl" | "dataUrl" | "fileBase64";
  fileName?: string;
  mimeType?: string;
}) {
  if (bytes.byteLength <= 0) {
    throw new Error("Image upload data was empty.");
  }
  const refusal = checkFileSize("image", bytes.byteLength, Math.min(cap, transportLimits.image));
  if (refusal) throw Object.assign(new Error(refusal.message), { payload: { error: refusal } });
  const detectedMimeType = sniffImageMimeType(bytes);
  if (!detectedMimeType) {
    throw new Error(
      "Could not verify a JPEG, PNG, or WebP image from the file signature."
    );
  }
  const requestedMimeType = normalizeHeaderMimeType(mimeType);
  if (requestedMimeType && requestedMimeType !== detectedMimeType) {
    throw new Error(
      `Image MIME type mismatch: content is ${detectedMimeType}, not ${requestedMimeType}.`,
    );
  }

  return {
    bytes,
    source,
    fileName,
    mimeType: detectedMimeType,
  };
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
    }, Number.MAX_SAFE_INTEGER);
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

/** Existing API-key batch aliases enter here; no file is stored before admission. */
async function handleUploadBatch(ctx: ActionCtx, args: RestRequestInput): Promise<RestResponse> {
  if (!hasBearer(args.authorization)) return unknownAuthError();
  const body = bodyObject(args.body);
  const moveId = requiredId<"moves">(body.moveId, "moveId is required.");
  const authResult = await authenticateAction(ctx, args, moveId);
  if (!authResult.ok || !authResult.auth) return authResult.response ?? unknownAuthError();
  const auth = { ...(authResult.auth as ApiActionAuth), moveId };
  return withActionRateLimit(ctx, args, auth, async () => {
    const images = Array.isArray(body.images) ? body.images : [];
    const policy = await ctx.runQuery(internal.usageLimits.policyInternal, { householdId: auth.householdId });
    const results: Array<{ index: number; ok: boolean; photoId?: string; error?: string; code?: string; result?: unknown }> = images.map((_, index) => ({ index, ok: false }));
    const prepared: Array<{ index: number; metadata: Record<string, unknown>; media: Awaited<ReturnType<typeof loadDirectImageUploadMedia>>; operationId: string }> = [];
    if (!optionalString(body.operationId) && !args.idempotencyKey && policy.requiresOperationId) return { status: 400, body: { error: { code: "OPERATION_ID_REQUIRED", message: "Send an operationId or idempotency key and reuse it when retrying this batch." } } };
    const operationId = optionalString(body.operationId) ?? args.idempotencyKey ?? crypto.randomUUID();
    const apiActor = { apiKeyId: String(auth.apiKeyId), createdByUserId: auth.createdByUserId, acknowledgeContactDetails: body.acknowledgeContactDetails as { emails: number; phones: number; addresses: number } | undefined, restorePrivately: body.restorePrivately as boolean | undefined };
    const heldByThisCall: Array<Id<"uploadReservations">> = [];
    try {
    for (const [index, image] of images.entries()) {
      const metadata: Record<string, unknown> = { ...body, ...bodyObject(image), moveId };
      let fetchId: Id<"uploadReservations"> | undefined;
      try {
        const itemOperationId = optionalString(metadata.idempotencyKey) ?? `${operationId}:${index}`;
        const replay = await ctx.runQuery(internal.photos.completedOperation, { householdId: auth.householdId, moveId, actorUserId: auth.createdByUserId, operationId: itemOperationId });
        if (replay) { results[index] = { index, ok: true, photoId: replay.photoId, result: { data: replay } }; continue; }
        const media = await loadDirectImageUploadMedia(metadata, policy.maxFileBytes.image, async declared => {
          const held = await ctx.runMutation(internal.usageLimits.reserveFetch, { householdId: auth.householdId, key: `${moveId}:${auth.createdByUserId}:${itemOperationId}`, bytes: declared ?? 1, unknownLength: declared === null });
          if (held.refusal) throw Object.assign(new Error(held.refusal.message), { payload: { error: held.refusal } });
          fetchId = held.reservationId;
          if (held.created && fetchId) heldByThisCall.push(fetchId);
        });
        if (fetchId) { const resized = await ctx.runMutation(internal.usageLimits.finishFetch, { householdId: auth.householdId, reservationId: fetchId, bytes: media.bytes.byteLength }); if (resized.refusal) throw Object.assign(new Error(resized.refusal.message), { payload: { error: resized.refusal } }); }

        const refusal = checkFileSize("image", media.bytes.byteLength, policy.maxFileBytes.image);
        if (refusal) { results[index] = { index, ok: false, code: refusal.code, error: refusal.message }; if (!body.continueOnError) break; continue; }
        await ctx.runQuery(internal.photos.checkUploadTargets, { moveId, itemId: optionalId<"items">(metadata.itemId), boxId: optionalId<"boxes">(metadata.boxId), spaceId: optionalId<"moveSpaces">(metadata.spaceId), transportResourceId: optionalId<"transportResources">(metadata.transportResourceId), transportZoneId: optionalId<"transportZones">(metadata.transportZoneId) });
        prepared.push({ index, metadata, media, operationId: optionalString(metadata.idempotencyKey) ?? `${operationId}:${index}` });
      } catch (error) {
        if (fetchId && heldByThisCall.includes(fetchId)) await ctx.runMutation(internal.usageLimits.releaseFetch, { id: fetchId });
        const refusal = (error as { payload?: { error?: UploadRefusal } }).payload?.error;
        if (refusal) await ctx.runMutation(internal.usageLimits.recordActionRefusal, { householdId: auth.householdId, actorUserId: auth.createdByUserId, code: refusal.code, message: refusal.message }).catch(() => null);
        if (refusal?.code === "USAGE_LIMIT_REACHED") {
          let ownHeld = 0;
          for (const id of heldByThisCall) { const held = await ctx.runQuery(internal.usageLimits.reservationInternal, { id }); if (held?.status === "reserved") ownHeld += refusal.unit === "bytes" ? held.bytes : 1; }
          for (const id of heldByThisCall) await ctx.runMutation(internal.usageLimits.releaseFetch, { id });
          const partial = usageLimitError({ ...refusal, used: Math.max(0, refusal.used - ownHeld), remaining: refusal.remaining + ownHeld });
          const lowerBound = usageLimitError({ ...partial, requested: prepared.reduce((sum, p) => sum + p.media.bytes.byteLength, 0) + refusal.requested });
          return { status: 413, body: { error: refusal.unit === "bytes" ? { ...lowerBound, batchTotalUnknown: true, message: lowerBound.message.replace("this needs ", "this needs at least ") + " The full batch total is unknown. Retry a smaller batch once there is room." } : usageLimitError({ ...partial, requested: images.length }), results } };
        }
        results[index] = { index, ok: false, code: refusal?.code, error: refusal?.message ?? (error instanceof Error ? error.message : "Invalid media.") };
        if (!body.continueOnError) break;
      }
    }
    const bucket = requireB2Config().bucketName;
    const admission = await ctx.runMutation(internal.photos.tryCreateUploadBatch, {
      requestBytes: new TextEncoder().encode(JSON.stringify(images)).length,
      files: prepared.map(p => ({ householdId: auth.householdId, moveId, operationId: p.operationId, itemId: optionalId<"items">(p.metadata.itemId), boxId: optionalId<"boxes">(p.metadata.boxId), spaceId: optionalId<"moveSpaces">(p.metadata.spaceId), room: optionalString(p.metadata.room), transportResourceId: optionalId<"transportResources">(p.metadata.transportResourceId), transportZoneId: optionalId<"transportZones">(p.metadata.transportZoneId), originalStorageKey: uploadObjectKey({ moveId, mimeType: p.media.mimeType }), originalBucket: bucket, expectedMimeType: p.media.mimeType, expectedSizeBytes: p.media.bytes.byteLength, derivativeUploads: [], expiresAt: Date.now() + uploadSessionTtlMs, apiActor })),
    });
    if (admission.refusal) { for (const id of heldByThisCall) await ctx.runMutation(internal.usageLimits.releaseFetch, { id }); return { status: 413, body: { error: admission.refusal, results } }; }
    let stopped = false;
    for (const [position, p] of prepared.entries()) {
      if (stopped) {
        const unused = admission.results![position];
        if (unused.created && unused.uploadSessionId) {
          await ctx.runMutation(internal.photos.discardUnstartedBatchItem, { householdId: auth.householdId, moveId, sessionId: unused.uploadSessionId, fresh: unused.fresh ?? false });
        }
        continue;
      }
      const slot = admission.results![position];
      if (!slot.uploadSessionId) { results[p.index] = { index: p.index, ok: false, code: slot.code, error: slot.error }; stopped = !body.continueOnError; continue; }
      const response = await handlePhotoUpload(ctx, { ...args, path: "photos/upload", idempotencyKey: p.operationId, body: { ...p.metadata, sourceUrl: undefined, dataUrl: undefined, fileBase64: p.media.bytes.toString("base64"), mimeType: p.media.mimeType, operationId: p.operationId } });
      const payload = bodyObject(response.body);
      const data = bodyObject(payload.data), error = bodyObject(payload.error);
      results[p.index] = response.status < 300 ? { index: p.index, ok: true, photoId: optionalString(data.photoId), result: data } : { index: p.index, ok: false, code: optionalString(error.code), error: optionalString(error.message) };
      if (response.status >= 300 && !body.continueOnError) stopped = true;
    }
    for (const id of heldByThisCall) await ctx.runMutation(internal.usageLimits.releaseFetch, { id });
    const firstFailure = results.findIndex(row => !row.ok && row.error);
    if (!body.continueOnError && firstFailure >= 0) return { status: 400, body: { error: { code: "batch_upload_failed", message: results[firstFailure].error }, partialResults: results.slice(0, firstFailure + 1) } };
    return restOk({ data: { uploadLimits: await ctx.runQuery(internal.usageLimits.policyInternal, { householdId: auth.householdId }), imageCount: images.length, uploadedCount: results.filter(r => r.ok).length, failedCount: results.filter(r => !r.ok).length, results, storage: await ctx.runQuery(internal.usageLimits.summaryInternal, { householdId: auth.householdId }) } });
    } finally {
      // Only holds created by this call are ours to return. The release mutation
      // protects reservations already adopted by a live or completed session.
      for (const id of heldByThisCall) await ctx.runMutation(internal.usageLimits.releaseFetch, { id });
    }
  });
}
