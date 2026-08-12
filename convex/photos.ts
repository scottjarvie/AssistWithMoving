import { ConvexError, v } from "convex/values";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  type ActionCtx,
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  query,
} from "./_generated/server";
import { requireAppAdmin } from "./lib/admin";
import { requireMoveForSubject } from "./lib/mcpIdentity";
import { recordAuditEvent } from "./lib/audit";
import { assertHouseholdEntitlement } from "./lib/billing";
import {
  cloudflareImageDeliveryUrl,
  selectDerivativeRef,
  type PhotoDeliveryProvider,
  type PhotoDisplayVariant,
} from "./lib/photoDelivery";
import {
  documentationProfileTypeValidator,
  estimateConfidenceValidator,
  exifHandlingStatusValidator,
  normalizeOptionalText,
  photoPrivacyLevelValidator,
  photoSourceValidator,
  photoTypeValidator,
  photoVerificationStatusValidator,
  photoVisibilityScopeValidator,
} from "./lib/moveFields";
import {
  canViewPhotoAssets,
  canDownloadOriginalPhoto,
  redactPhotoForVisibility,
} from "./lib/photoVisibility";
import {
  defaultPhotoUploadCleanupGraceMs,
  shouldCleanupExpiredUploadSession,
  type StorageObjectRef,
  unreferencedUploadSessionStorageRefs,
  uploadSessionStorageRefs,
} from "./lib/photoCleanup";
import {
  assertDerivativeUploadsAllowed,
  assertImageDerivativeUploadFileShape,
  assertImageDimensions,
  assertOriginalUploadFileShape,
  fileExtensionForMediaMimeType,
  mediaKindForMimeType,
  mediaObjectPrefix,
} from "./lib/mediaStorage";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";

const uploadSessionTtlMs = 15 * 60 * 1000;

const derivativeRefsValidator = v.object({
  thumb: v.optional(v.string()),
  card: v.optional(v.string()),
  detail: v.optional(v.string()),
  full: v.optional(v.string()),
});

const photoWriteArgs = {
  itemId: v.optional(v.union(v.id("items"), v.null())),
  boxId: v.optional(v.union(v.id("boxes"), v.null())),
  spaceId: v.optional(v.id("moveSpaces")),
  transportResourceId: v.optional(v.id("transportResources")),
  transportZoneId: v.optional(v.id("transportZones")),
  room: v.optional(v.string()),
  claimId: v.optional(v.string()),
  documentationProfileTypes: v.optional(
    v.array(documentationProfileTypeValidator),
  ),
  originalHash: v.optional(v.string()),
  derivativeRefs: v.optional(derivativeRefsValidator),
  cloudflareImageId: v.optional(v.string()),
  caption: v.optional(v.string()),
  photoType: v.optional(photoTypeValidator),
  privacyLevel: v.optional(photoPrivacyLevelValidator),
  visibilityScope: v.optional(photoVisibilityScopeValidator),
  source: v.optional(photoSourceValidator),
  exifHandlingStatus: v.optional(exifHandlingStatusValidator),
  confidence: v.optional(estimateConfidenceValidator),
  notes: v.optional(v.string()),
  verificationStatus: v.optional(photoVerificationStatusValidator),
  aiProcessed: v.optional(v.boolean()),
  capturedAt: v.optional(v.number()),
};

const photoUpdateArgs = {
  ...photoWriteArgs,
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  mimeType: v.optional(v.string()),
  sizeBytes: v.optional(v.number()),
};

const uploadSessionIdValidator = v.id("photoUploadSessions");
const displayUrlTtlSeconds = 5 * 60;
const photoDerivativeVariantValidator = v.union(
  v.literal("thumb"),
  v.literal("card"),
  v.literal("detail"),
  v.literal("full"),
);
const photoDisplayVariantValidator = v.union(
  v.literal("thumb"),
  v.literal("card"),
  v.literal("detail"),
  v.literal("full"),
  v.literal("original"),
);
const apiPhotoActorValidator = v.object({
  apiKeyId: v.string(),
  createdByUserId: v.id("users"),
});
const maxPhotoCleanupBatchSize = 100;
const cleanupDeleteResultValidator = v.object({
  uploadSessionId: uploadSessionIdValidator,
  attemptedObjectCount: v.number(),
  deletedObjectCount: v.number(),
  error: v.optional(v.string()),
});

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

// B2 can normalize a stored object's Content-Type (drop/alter parameters, remap
// an alias), so an exact string compare on finalize would reject a perfectly
// good upload. Compare only the base type (before any ";" parameters), case-
// insensitively.
function contentTypesMatch(actual: string, expected: string): boolean {
  const base = (value: string) => value.split(";")[0].trim().toLowerCase();
  return base(actual) === base(expected);
}

function b2Client() {
  const config = requireB2Config();

  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    // Backblaze B2 is S3-compatible but does NOT accept the x-amz-sdk-checksum-*
    // headers that recent @aws-sdk/client-s3 versions fold into the SigV4
    // signature of a presigned PUT URL. The browser's raw XHR PUT never sends
    // those headers, so B2 rejects the upload with SignatureDoesNotMatch / 403 —
    // a blanket failure for a large share of uploads. Computing checksums only
    // WHEN_REQUIRED keeps presigned PUT URLs clean so the browser PUT verifies.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.applicationKeyId,
      secretAccessKey: config.applicationKey,
    },
  });
}

async function deleteStorageObject(ref: StorageObjectRef) {
  await b2Client().send(
    new DeleteObjectCommand({
      Bucket: ref.bucket,
      Key: ref.storageKey,
    }),
  );
}

function cleanupStorageError(error: unknown) {
  if (error instanceof Error) {
    return error.name === "Error"
      ? "Storage object cleanup failed."
      : `Storage object cleanup failed: ${error.name}`;
  }
  return "Storage object cleanup failed.";
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
    mimeType,
  )}`;
}

async function assertPhotoTargets(
  ctx: MutationCtx,
  args: {
    moveId: Doc<"moves">["_id"];
    itemId?: Doc<"items">["_id"] | null;
    boxId?: Doc<"boxes">["_id"] | null;
    spaceId?: Doc<"moveSpaces">["_id"];
    transportResourceId?: Doc<"transportResources">["_id"];
    transportZoneId?: Doc<"transportZones">["_id"];
  },
) {
  if (args.itemId) {
    const item = await ctx.db.get(args.itemId);
    if (!item || item.moveId !== args.moveId || item.deletedAt) {
      throw new Error("Invalid photo item target.");
    }
  }

  if (args.boxId) {
    const box = await ctx.db.get(args.boxId);
    if (!box || box.moveId !== args.moveId || box.archivedAt) {
      throw new Error("Invalid photo box target.");
    }
  }

  if (args.spaceId) {
    const space = await ctx.db.get(args.spaceId);
    if (!space || space.moveId !== args.moveId || space.status === "archived") {
      throw new Error("Invalid photo space target.");
    }
  }

  if (args.transportResourceId) {
    const resource = await ctx.db.get(args.transportResourceId);
    if (!resource || resource.moveId !== args.moveId || resource.archivedAt) {
      throw new Error("Invalid photo transport resource target.");
    }
  }

  if (args.transportZoneId) {
    const zone = await ctx.db.get(args.transportZoneId);
    if (!zone || zone.moveId !== args.moveId || zone.archivedAt) {
      throw new Error("Invalid photo transport zone target.");
    }
  }
}

async function assertMoveInHousehold(
  ctx: MutationCtx,
  args: {
    householdId: Doc<"households">["_id"];
    moveId: Doc<"moves">["_id"];
  },
) {
  const move = await ctx.db.get(args.moveId);
  if (
    !move ||
    move.householdId !== args.householdId ||
    move.status === "archived"
  ) {
    throw new Error("Move not found.");
  }
}

function redactPhotos(
  photos: Doc<"itemPhotos">[],
  visibility: Parameters<typeof redactPhotoForVisibility>[1],
) {
  return photos
    .filter((photo) => !photo.archivedAt)
    .map((photo) => redactPhotoForVisibility(photo, visibility));
}

export const listForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    verificationStatus: v.optional(photoVerificationStatusValidator),
    privacyLevel: v.optional(photoPrivacyLevelValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const policy = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 250);
    const photos = await ctx.db
      .query("itemPhotos")
      .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .take(limit);

    return redactPhotos(
      photos
        .filter((photo) =>
          args.verificationStatus
            ? photo.verificationStatus === args.verificationStatus
            : true,
        )
        .filter((photo) =>
          args.privacyLevel ? photo.privacyLevel === args.privacyLevel : true,
        ),
      policy.visibility,
    );
  },
});

export const listForItem = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    itemId: v.id("items"),
  },
  handler: async (ctx, args) => {
    const policy = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );
    const photos = await ctx.db
      .query("itemPhotos")
      .withIndex("by_item_created", (q) => q.eq("itemId", args.itemId))
      .order("desc")
      .collect();

    return redactPhotos(
      photos.filter((photo) => photo.moveId === args.moveId),
      policy.visibility,
    );
  },
});

export const listForBox = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    boxId: v.id("boxes"),
  },
  handler: async (ctx, args) => {
    const policy = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );
    const photos = await ctx.db
      .query("itemPhotos")
      .withIndex("by_box_created", (q) => q.eq("boxId", args.boxId))
      .order("desc")
      .collect();

    return redactPhotos(
      photos.filter((photo) => photo.moveId === args.moveId),
      policy.visibility,
    );
  },
});

export const listReviewQueue = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const policy = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
    const photos = await ctx.db
      .query("itemPhotos")
      .withIndex("by_move_verification", (q) =>
        q.eq("moveId", args.moveId).eq("verificationStatus", "needsReview"),
      )
      .take(limit);

    return redactPhotos(photos, policy.visibility);
  },
});

export const evidenceSummary = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );
    const [photos, items] = await Promise.all([
      ctx.db
        .query("itemPhotos")
        .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("items")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .collect(),
    ]);
    const activePhotos = photos.filter((photo) => !photo.archivedAt);
    const itemPhotoCounts = activePhotos.reduce<Record<string, number>>(
      (counts, photo) => {
        if (photo.itemId) {
          counts[photo.itemId] = (counts[photo.itemId] ?? 0) + 1;
        }
        return counts;
      },
      {},
    );
    const activeItems = items.filter((item) => !item.deletedAt);
    const evidenceGaps = activeItems
      .filter(
        (item) =>
          (item.highValue ||
            item.requiresPersonalTransport ||
            item.planningDefaultKeys.includes("highValue") ||
            item.planningDefaultKeys.includes("sensitive") ||
            item.planningDefaultKeys.includes("irreplaceable")) &&
          !itemPhotoCounts[item._id],
      )
      .slice(0, 12)
      .map((item) => ({
        itemId: item._id,
        name: item.name,
        room: item.room,
        highValue: item.highValue,
        requiresPersonalTransport: item.requiresPersonalTransport,
        planningDefaultKeys: item.planningDefaultKeys,
      }));

    return {
      photoCount: activePhotos.length,
      unassignedCount: activePhotos.filter(
        (photo) => !photo.itemId && !photo.boxId && !photo.room,
      ).length,
      needsReviewCount: activePhotos.filter(
        (photo) => photo.verificationStatus === "needsReview",
      ).length,
      sensitiveCount: activePhotos.filter(
        (photo) => photo.privacyLevel !== "normal",
      ).length,
      pendingDerivativeCount: activePhotos.filter(
        (photo) => photo.derivativeStatus === "pending",
      ).length,
      failedDerivativeCount: activePhotos.filter(
        (photo) => photo.derivativeStatus === "failed",
      ).length,
      highValueItemCount: activeItems.filter((item) => item.highValue).length,
      highValueWithoutPhotoCount: evidenceGaps.length,
      evidenceGaps,
    };
  },
});

// Validator + type for the optional API-key actor that lets the REST/API-key
// and OAuth-MCP paths upload without ctx.auth (they authorize before calling in
// and pass createdByUserId). When omitted, the internal upload functions run the
// usual ctx.auth permission check.
type ApiPhotoActor = {
  apiKeyId: string;
  createdByUserId: Doc<"users">["_id"];
};

const initUploadArgs = {
  householdId: v.id("households"),
  moveId: v.id("moves"),
  itemId: v.optional(v.id("items")),
  boxId: v.optional(v.id("boxes")),
  spaceId: v.optional(v.id("moveSpaces")),
  transportResourceId: v.optional(v.id("transportResources")),
  transportZoneId: v.optional(v.id("transportZones")),
  room: v.optional(v.string()),
  mimeType: v.string(),
  sizeBytes: v.number(),
  derivatives: v.optional(
    v.array(
      v.object({
        variant: photoDerivativeVariantValidator,
        mimeType: v.string(),
        sizeBytes: v.number(),
        width: v.number(),
        height: v.number(),
      }),
    ),
  ),
};

type InitUploadArgs = {
  householdId: Doc<"households">["_id"];
  moveId: Doc<"moves">["_id"];
  itemId?: Doc<"items">["_id"];
  boxId?: Doc<"boxes">["_id"];
  spaceId?: Doc<"moveSpaces">["_id"];
  transportResourceId?: Doc<"transportResources">["_id"];
  transportZoneId?: Doc<"transportZones">["_id"];
  room?: string;
  mimeType: string;
  sizeBytes: number;
  derivatives?: Array<{
    variant: "thumb" | "card" | "detail" | "full";
    mimeType: string;
    sizeBytes: number;
    width: number;
    height: number;
  }>;
};

type InitUploadResult = {
  uploadSessionId: string;
  uploadUrl: string;
  method: "PUT";
  headers: { "Content-Type": string };
  derivativeUploads: Array<{
    variant: "thumb" | "card" | "detail" | "full";
    uploadUrl: string;
    method: "PUT";
    headers: { "Content-Type": string };
  }>;
  expiresAt: number;
};

// Extracted body of initUpload. When `apiActor` is undefined this behaves
// EXACTLY as the public action did (ctx.auth permission path); when provided it
// forwards the actor into createUploadSession so callers that authorize outside
// ctx.auth (REST API key, OAuth MCP bridge) can upload.
async function runInitUpload(
  ctx: ActionCtx,
  args: InitUploadArgs,
  apiActor?: ApiPhotoActor,
): Promise<InitUploadResult> {
  {
    const original = assertOriginalUploadFileShape(args);
    const normalizedDerivatives = (args.derivatives ?? []).map((derivative) => {
      const normalized = assertImageDerivativeUploadFileShape({
        mimeType: derivative.mimeType,
        sizeBytes: derivative.sizeBytes,
      });
      return {
        ...derivative,
        mimeType: normalized.mimeType,
      };
    });
    assertDerivativeUploadsAllowed(
      original.mediaKind,
      normalizedDerivatives.length,
    );

    const config = requireB2Config();
    const objectKey = uploadObjectKey({
      moveId: args.moveId,
      mimeType: original.mimeType,
    });
    const derivativeUploads =
      normalizedDerivatives.map((derivative) => ({
        ...derivative,
        storageKey: uploadObjectKey({
          moveId: args.moveId,
          mimeType: derivative.mimeType,
          prefix: "photo-derivatives",
        }),
        bucket: config.bucketName,
      })) ?? [];
    const expiresAt = Date.now() + uploadSessionTtlMs;
    const uploadSessionId = await ctx.runMutation(
      internal.photos.createUploadSession,
      {
        householdId: args.householdId,
        moveId: args.moveId,
        itemId: args.itemId,
        boxId: args.boxId,
        spaceId: args.spaceId,
        transportResourceId: args.transportResourceId,
        transportZoneId: args.transportZoneId,
        room: args.room,
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
        expiresAt,
        apiActor,
      },
    );

    const uploadUrl = await getSignedUrl(
      b2Client(),
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: objectKey,
        ContentType: original.mimeType,
        ContentLength: original.sizeBytes,
      }),
      { expiresIn: Math.floor(uploadSessionTtlMs / 1000) },
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
          { expiresIn: Math.floor(uploadSessionTtlMs / 1000) },
        ),
        method: "PUT" as const,
        headers: { "Content-Type": derivative.mimeType },
      })),
    );

    return {
      uploadSessionId,
      uploadUrl,
      method: "PUT",
      headers: { "Content-Type": original.mimeType },
      derivativeUploads: signedDerivativeUploads,
      expiresAt,
    };
  }
}

export const initUpload = action({
  args: initUploadArgs,
  handler: async (ctx, args): Promise<InitUploadResult> => {
    return runInitUpload(ctx, args);
  },
});

// Internal-only bridge entry point for callers that authorize OUTSIDE ctx.auth
// (REST API key, OAuth MCP gateway). NOT client-callable: the apiActor path skips
// the permission check, so a client must never be able to supply createdByUserId.
export const initUploadForActor = internalAction({
  args: {
    ...initUploadArgs,
    apiActor: apiPhotoActorValidator,
  },
  handler: async (ctx, args): Promise<InitUploadResult> => {
    return runInitUpload(ctx, args, args.apiActor);
  },
});

const finalizeUploadArgs = {
  householdId: v.id("households"),
  moveId: v.id("moves"),
  uploadSessionId: uploadSessionIdValidator,
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  originalHash: v.optional(v.string()),
  caption: v.optional(v.string()),
  photoType: v.optional(photoTypeValidator),
  privacyLevel: v.optional(photoPrivacyLevelValidator),
  visibilityScope: v.optional(photoVisibilityScopeValidator),
  source: v.optional(photoSourceValidator),
  exifHandlingStatus: v.optional(exifHandlingStatusValidator),
  confidence: v.optional(estimateConfidenceValidator),
  notes: v.optional(v.string()),
  verificationStatus: v.optional(photoVerificationStatusValidator),
  capturedAt: v.optional(v.number()),
};

type FinalizeUploadArgs = {
  householdId: Doc<"households">["_id"];
  moveId: Doc<"moves">["_id"];
  uploadSessionId: Doc<"photoUploadSessions">["_id"];
  width?: number;
  height?: number;
  originalHash?: string;
  caption?: string;
  photoType?: Doc<"itemPhotos">["photoType"];
  privacyLevel?: Doc<"itemPhotos">["privacyLevel"];
  visibilityScope?: Doc<"itemPhotos">["visibilityScope"];
  source?: Doc<"itemPhotos">["source"];
  exifHandlingStatus?: Doc<"itemPhotos">["exifHandlingStatus"];
  confidence?: Doc<"itemPhotos">["confidence"];
  notes?: string;
  verificationStatus?: Doc<"itemPhotos">["verificationStatus"];
  capturedAt?: number;
};

type FinalizeUploadResult = {
  photoId: string;
  derivativeStatus?: "pending" | "ready" | "failed";
  derivativeError?: string;
  derivativeNote: string;
};

// Extracted body of finalizeUpload. When `apiActor` is undefined this behaves
// EXACTLY as the public action did (ctx.auth permission path); when provided it
// forwards the actor into every internal call that accepts it.
async function runFinalizeUpload(
  ctx: ActionCtx,
  args: FinalizeUploadArgs,
  apiActor?: ApiPhotoActor,
): Promise<FinalizeUploadResult> {
  {
    const config = requireB2Config();
    const session = await ctx.runQuery(internal.photos.getUploadSession, {
      householdId: args.householdId,
      moveId: args.moveId,
      uploadSessionId: args.uploadSessionId,
      apiActor,
    });

    try {
      const head = await b2Client().send(
        new HeadObjectCommand({
          Bucket: config.bucketName,
          Key: session.originalStorageKey,
        }),
      );
      if (head.ContentLength !== session.expectedSizeBytes) {
        throw new Error("Uploaded object size does not match the session.");
      }
      if (
        head.ContentType &&
        !contentTypesMatch(head.ContentType, session.expectedMimeType)
      ) {
        throw new Error("Uploaded object type does not match the session.");
      }
      for (const derivative of session.derivativeUploads ?? []) {
        const derivativeHead = await b2Client().send(
          new HeadObjectCommand({
            Bucket: derivative.bucket,
            Key: derivative.storageKey,
          }),
        );
        if (derivativeHead.ContentLength !== derivative.expectedSizeBytes) {
          throw new Error(
            "Uploaded derivative size does not match the session.",
          );
        }
        if (
          derivativeHead.ContentType &&
          !contentTypesMatch(
            derivativeHead.ContentType,
            derivative.expectedMimeType,
          )
        ) {
          throw new Error(
            "Uploaded derivative type does not match the session.",
          );
        }
      }
    } catch (error) {
      await ctx.runMutation(internal.photos.markUploadSessionFailed, {
        householdId: args.householdId,
        moveId: args.moveId,
        uploadSessionId: args.uploadSessionId,
        apiActor,
      });
      throw error;
    }

    const photoId = await ctx.runMutation(internal.photos.completeUploadSession, {
      householdId: args.householdId,
      moveId: args.moveId,
      uploadSessionId: args.uploadSessionId,
      width: args.width,
      height: args.height,
      originalHash: args.originalHash,
      caption: args.caption,
      photoType: args.photoType,
      privacyLevel: args.privacyLevel,
      visibilityScope: args.visibilityScope,
      source: args.source,
      exifHandlingStatus: args.exifHandlingStatus,
      confidence: args.confidence,
      notes: args.notes,
      verificationStatus: args.verificationStatus,
      capturedAt: args.capturedAt,
      apiActor,
    });

    let derivativeStatus = imageDerivativeStatusForSession(session);
    let derivativeError: string | undefined;
    if (shouldGenerateServerDerivatives(session)) {
      try {
        const generated = await ctx.runAction(
          internal.imageDerivatives.generateFromOriginal,
          {
            bucketName: session.originalBucket ?? config.bucketName,
            moveId: args.moveId,
            originalStorageKey: session.originalStorageKey,
          },
        );
        await ctx.runMutation(internal.photos.markGeneratedDerivativesReady, {
          householdId: args.householdId,
          moveId: args.moveId,
          photoId,
          derivativeRefs: generated.derivativeRefs,
          apiActor,
        });
        derivativeStatus = "ready";
      } catch (error) {
        derivativeStatus = "failed";
        derivativeError = derivativeProcessingError(error);
        await ctx.runMutation(internal.photos.markGeneratedDerivativesFailed, {
          householdId: args.householdId,
          moveId: args.moveId,
          photoId,
          derivativeError,
          apiActor,
        });
      }
    }

    return {
      photoId,
      derivativeStatus,
      derivativeError,
      derivativeNote: derivativeNoteForStatus(derivativeStatus),
    };
  }
}

export const finalizeUpload = action({
  args: finalizeUploadArgs,
  handler: async (ctx, args): Promise<FinalizeUploadResult> => {
    return runFinalizeUpload(ctx, args);
  },
});

// Internal-only bridge entry point — see initUploadForActor for the security
// rationale (apiActor path skips the permission check; must not be client-callable).
export const finalizeUploadForActor = internalAction({
  args: {
    ...finalizeUploadArgs,
    apiActor: apiPhotoActorValidator,
  },
  handler: async (ctx, args): Promise<FinalizeUploadResult> => {
    return runFinalizeUpload(ctx, args, args.apiActor);
  },
});

function imageDerivativeStatusForSession(session: {
  expectedMimeType: string;
  mediaKind?: string;
  derivativeUploads?: unknown[];
}): "pending" | "ready" | "failed" | undefined {
  const mediaKind =
    session.mediaKind ?? mediaKindForMimeType(session.expectedMimeType);
  if (mediaKind !== "image") return undefined;
  return Array.isArray(session.derivativeUploads) &&
    session.derivativeUploads.length > 0
    ? "ready"
    : "pending";
}

function shouldGenerateServerDerivatives(session: {
  expectedMimeType: string;
  mediaKind?: string;
  derivativeUploads?: unknown[];
}) {
  const mediaKind =
    session.mediaKind ?? mediaKindForMimeType(session.expectedMimeType);
  return (
    mediaKind === "image" &&
    (!Array.isArray(session.derivativeUploads) ||
      session.derivativeUploads.length === 0)
  );
}

function derivativeProcessingError(error: unknown) {
  if (error instanceof Error && error.message) {
    return `Server derivative processing failed: ${error.message}`;
  }
  return "Server derivative processing failed.";
}

function derivativeNoteForStatus(
  status: "pending" | "ready" | "failed" | undefined,
) {
  switch (status) {
    case "ready":
      return "Original evidence was uploaded and MovingManifest created web-ready image derivatives for display and AI review.";
    case "pending":
      return "Original evidence was uploaded and web-ready image derivatives are pending.";
    case "failed":
      return "Original evidence was uploaded, but server-side derivative processing failed. The photo record remains available for review and retry.";
    default:
      return "Original evidence was uploaded.";
  }
}

// Build the short-lived display URL for an ALREADY-AUTHORIZED photo (Cloudflare
// Images if configured, else a signed B2 URL). Shared by getDisplayUrl (web,
// ctx.auth) and getDisplayUrlForSubject (MCP gateway, subject bridge) so the
// two URL paths never drift.
async function buildDisplayUrlResult(
  photo: Doc<"itemPhotos">,
  variant: PhotoDisplayVariant,
): Promise<{
  url: string;
  expiresAt: number;
  requestedVariant: PhotoDisplayVariant;
  servedVariant: PhotoDisplayVariant;
  deliveryProvider: PhotoDeliveryProvider;
  derivativeStatus?: "pending" | "ready" | "failed";
  width?: number;
  height?: number;
  mimeType: string;
}> {
  const mediaKind =
    photo.mediaKind ?? mediaKindForMimeType(photo.mimeType) ?? "image";
  if (mediaKind !== "image") {
    throw new ConvexError(
      "Display derivatives are only available for image evidence.",
    );
  }

  const selected =
    variant === "original"
      ? null
      : selectDerivativeRef(photo.derivativeRefs, variant);

  if (variant === "original") {
    throw new ConvexError("Use the audited original download action.");
  }

  // The requested size hasn't been generated yet (derivativeStatus pending) or
  // its generation failed — there's simply no displayable variant to serve. Use
  // ConvexError (an EXPECTED application error) rather than a plain throw, so it
  // reaches the client's graceful placeholder path instead of being logged as an
  // opaque "Server Error" on every still-processing photo.
  if (!selected) {
    throw new ConvexError(
      `Photo variant "${variant}" is not available yet (derivative ${photo.derivativeStatus ?? "missing"}).`,
    );
  }

  const cloudflareUrl = cloudflareImageDeliveryUrl({
    accountHash: process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH,
    deliveryBaseUrl: process.env.CLOUDFLARE_IMAGE_DELIVERY_URL,
    deliveryDomain: process.env.CLOUDFLARE_IMAGE_DELIVERY_DOMAIN,
    imageId: photo.cloudflareImageId,
    variant: selected.variant,
  });
  if (cloudflareUrl) {
    return {
      url: cloudflareUrl,
      expiresAt: Date.now() + displayUrlTtlSeconds * 1000,
      requestedVariant: variant,
      servedVariant: selected.variant,
      deliveryProvider: "cloudflareImages",
      derivativeStatus: photo.derivativeStatus,
      width: photo.width,
      height: photo.height,
      mimeType: photo.mimeType,
    };
  }

  const config = requireB2Config();
  const url = await getSignedUrl(
    b2Client(),
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: selected.ref,
    }),
    { expiresIn: displayUrlTtlSeconds },
  );

  return {
    url,
    expiresAt: Date.now() + displayUrlTtlSeconds * 1000,
    requestedVariant: variant,
    servedVariant: selected.variant,
    deliveryProvider: "b2SignedUrl",
    derivativeStatus: photo.derivativeStatus,
    width: photo.width,
    height: photo.height,
    mimeType: photo.mimeType,
  };
}

export const getDisplayUrl = action({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    photoId: v.id("itemPhotos"),
    variant: photoDisplayVariantValidator,
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    url: string;
    expiresAt: number;
    requestedVariant: PhotoDisplayVariant;
    servedVariant: PhotoDisplayVariant;
    deliveryProvider: PhotoDeliveryProvider;
    derivativeStatus?: "pending" | "ready" | "failed";
    width?: number;
    height?: number;
    mimeType: string;
  }> => {
    const { photo } = await ctx.runQuery(internal.photos.getPhotoForDelivery, {
      householdId: args.householdId,
      moveId: args.moveId,
      photoId: args.photoId,
    });
    return buildDisplayUrlResult(photo, args.variant);
  },
});

// Bridge-authed variants of the delivery query + display-url action for the
// OAuth MCP gateway: ctx.auth is null inside a gateway tool, so these authorize
// from the injected caller subject (requireMoveForSubject) instead of the web
// session. Internal-only — never client-callable. Same URL output as above.
export const getPhotoForDeliveryForSubject = internalQuery({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    photoId: v.id("itemPhotos"),
    subject: v.string(),
  },
  handler: async (ctx, args) => {
    const policy = await requireMoveForSubject(
      ctx,
      args.subject,
      args.householdId,
      args.moveId,
      "inventory:read",
    );
    const photo = await ctx.db.get(args.photoId);
    if (
      !photo ||
      photo.householdId !== args.householdId ||
      photo.moveId !== args.moveId ||
      photo.archivedAt
    ) {
      throw new ConvexError("Photo not found.");
    }
    if (!canViewPhotoAssets(photo, policy.visibility)) {
      throw new ConvexError("Photo not found.");
    }
    return { photo, visibility: policy.visibility };
  },
});

export const getDisplayUrlForSubject = internalAction({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    photoId: v.id("itemPhotos"),
    variant: photoDisplayVariantValidator,
    subject: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    url: string;
    expiresAt: number;
    requestedVariant: PhotoDisplayVariant;
    servedVariant: PhotoDisplayVariant;
    deliveryProvider: PhotoDeliveryProvider;
    derivativeStatus?: "pending" | "ready" | "failed";
    width?: number;
    height?: number;
    mimeType: string;
  }> => {
    const { photo } = await ctx.runQuery(
      internal.photos.getPhotoForDeliveryForSubject,
      {
        householdId: args.householdId,
        moveId: args.moveId,
        photoId: args.photoId,
        subject: args.subject,
      },
    );
    return buildDisplayUrlResult(photo, args.variant);
  },
});

// REST API (api-key actor) variant. The REST action layer already authorized
// the move via authenticateAction, so this only re-validates that the photo
// belongs to the move (getPhotoForDelivery) before signing. Internal-only —
// never client-callable. Same URL output as getDisplayUrl / *ForSubject. Lets
// the stdio/HTTP MCP server fetch real image bytes server-side and hand the
// model a native image (it never needs to reach Backblaze itself). See
// MOVE-317.
export const getDisplayUrlForApiActor = internalAction({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    photoId: v.id("itemPhotos"),
    variant: photoDisplayVariantValidator,
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    url: string;
    expiresAt: number;
    requestedVariant: PhotoDisplayVariant;
    servedVariant: PhotoDisplayVariant;
    deliveryProvider: PhotoDeliveryProvider;
    derivativeStatus?: "pending" | "ready" | "failed";
    width?: number;
    height?: number;
    mimeType: string;
  }> => {
    const { photo } = await ctx.runQuery(
      internal.photos.getPhotoForDeliveryForApiActor,
      {
        householdId: args.householdId,
        moveId: args.moveId,
        photoId: args.photoId,
      },
    );
    return buildDisplayUrlResult(photo, args.variant);
  },
});

export const getOriginalDownloadUrl = action({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    photoId: v.id("itemPhotos"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    url: string;
    expiresAt: number;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }> => {
    const { photo, visibility } = await ctx.runQuery(
      internal.photos.getPhotoForDelivery,
      {
        householdId: args.householdId,
        moveId: args.moveId,
        photoId: args.photoId,
      },
    );
    if (!canDownloadOriginalPhoto(photo, visibility)) {
      throw new Error("Original download is not available for this role.");
    }

    const config = requireB2Config();
    const filename = `movingmanifest-original-${args.photoId}.${fileExtensionForMediaMimeType(
      photo.mimeType,
    )}`;
    const url = await getSignedUrl(
      b2Client(),
      new GetObjectCommand({
        Bucket: config.bucketName,
        Key: photo.originalStorageKey,
        ResponseContentDisposition: `attachment; filename="${filename}"`,
      }),
      { expiresIn: displayUrlTtlSeconds },
    );

    await ctx.runMutation(internal.photos.recordOriginalAccess, {
      householdId: args.householdId,
      moveId: args.moveId,
      photoId: args.photoId,
    });

    return {
      url,
      expiresAt: Date.now() + displayUrlTtlSeconds * 1000,
      filename,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
    };
  },
});

export const cleanupExpiredUploadSessions = action({
  args: {
    now: v.optional(v.number()),
    graceMs: v.optional(v.number()),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    deleteObjects: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    dryRun: boolean;
    deleteObjects: boolean;
    plannedSessionCount: number;
    attemptedObjectCount: number;
    deletedObjectCount: number;
    failedDeleteCount: number;
    skippedReferencedObjectCount: number;
    markedFailedSessionCount: number;
  }> => {
    const now = args.now ?? Date.now();
    const dryRun = args.dryRun ?? true;
    const deleteObjects = args.deleteObjects ?? true;
    const plan = await ctx.runQuery(
      internal.photos.planExpiredUploadSessionCleanup,
      {
        now,
        graceMs: args.graceMs,
        limit: args.limit,
      },
    );

    if (dryRun) {
      return {
        dryRun,
        deleteObjects,
        plannedSessionCount: plan.candidates.length,
        attemptedObjectCount: 0,
        deletedObjectCount: 0,
        failedDeleteCount: 0,
        skippedReferencedObjectCount: plan.skippedReferencedObjectCount,
        markedFailedSessionCount: 0,
      };
    }

    const results = await Promise.all(
      plan.candidates.map(async (candidate) => {
        if (!deleteObjects) {
          return {
            uploadSessionId: candidate.uploadSessionId,
            attemptedObjectCount: 0,
            deletedObjectCount: 0,
          };
        }

        let deletedObjectCount = 0;
        let error: string | undefined;
        for (const ref of candidate.objectRefs) {
          try {
            await deleteStorageObject(ref);
            deletedObjectCount += 1;
          } catch (deleteError) {
            error = cleanupStorageError(deleteError);
          }
        }

        return {
          uploadSessionId: candidate.uploadSessionId,
          attemptedObjectCount: candidate.objectRefs.length,
          deletedObjectCount,
          error,
        };
      }),
    );

    const finish = await ctx.runMutation(
      internal.photos.finishExpiredUploadSessionCleanup,
      {
        now,
        deleteObjects,
        plannedSessionCount: plan.candidates.length,
        skippedReferencedObjectCount: plan.skippedReferencedObjectCount,
        results,
      },
    );

    return {
      dryRun,
      deleteObjects,
      plannedSessionCount: plan.candidates.length,
      attemptedObjectCount: results.reduce(
        (total, result) => total + result.attemptedObjectCount,
        0,
      ),
      deletedObjectCount: results.reduce(
        (total, result) => total + result.deletedObjectCount,
        0,
      ),
      failedDeleteCount: results.filter((result) => result.error).length,
      skippedReferencedObjectCount: plan.skippedReferencedObjectCount,
      markedFailedSessionCount: finish.markedFailedSessionCount,
    };
  },
});

export const planExpiredUploadSessionCleanup = internalQuery({
  args: {
    now: v.number(),
    graceMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAppAdmin(ctx);
    const graceMs = Math.max(
      args.graceMs ?? defaultPhotoUploadCleanupGraceMs,
      uploadSessionTtlMs,
    );
    const limit = Math.min(
      Math.max(Math.floor(args.limit ?? 50), 1),
      maxPhotoCleanupBatchSize,
    );
    const cutoff = args.now - graceMs;
    const sessions = await ctx.db
      .query("photoUploadSessions")
      .withIndex("by_expires", (q) => q.lt("expiresAt", cutoff))
      .take(limit);
    const candidates = [];
    let skippedReferencedObjectCount = 0;

    for (const session of sessions) {
      if (!shouldCleanupExpiredUploadSession(session, args.now, graceMs)) {
        continue;
      }

      const photos = await ctx.db
        .query("itemPhotos")
        .withIndex("by_move_created", (q) => q.eq("moveId", session.moveId))
        .collect();
      const allRefs = uploadSessionStorageRefs(session);
      const objectRefs = unreferencedUploadSessionStorageRefs(session, photos);
      skippedReferencedObjectCount += allRefs.length - objectRefs.length;
      candidates.push({
        uploadSessionId: session._id,
        householdId: session.householdId,
        moveId: session.moveId,
        objectRefs,
      });
    }

    return {
      candidates,
      skippedReferencedObjectCount,
    };
  },
});

export const finishExpiredUploadSessionCleanup = internalMutation({
  args: {
    now: v.number(),
    deleteObjects: v.boolean(),
    plannedSessionCount: v.number(),
    skippedReferencedObjectCount: v.number(),
    results: v.array(cleanupDeleteResultValidator),
  },
  handler: async (ctx, args) => {
    const admin = await requireAppAdmin(ctx);
    let markedFailedSessionCount = 0;

    for (const result of args.results) {
      const session = await ctx.db.get(result.uploadSessionId);
      if (!session || session.status === "completed") {
        continue;
      }

      await ctx.db.patch(result.uploadSessionId, {
        status: session.status === "authorized" ? "failed" : session.status,
        cleanupAttemptedAt: args.now,
        cleanupCompletedAt:
          result.error || !args.deleteObjects ? undefined : args.now,
        cleanupError: result.error,
        abandonedObjectCount: result.attemptedObjectCount,
        deletedAbandonedObjectCount: result.deletedObjectCount,
        updatedAt: args.now,
      });
      markedFailedSessionCount += 1;
    }

    await recordAuditEvent(ctx, {
      actorType: "user",
      actorUserId: admin._id,
      category: "photo",
      action: "photo_upload_sessions.cleanup_run",
      metadata: {
        plannedSessionCount: args.plannedSessionCount,
        markedFailedSessionCount,
        deleteObjects: args.deleteObjects,
        attemptedObjectCount: args.results.reduce(
          (total, result) => total + result.attemptedObjectCount,
          0,
        ),
        deletedObjectCount: args.results.reduce(
          (total, result) => total + result.deletedObjectCount,
          0,
        ),
        failedDeleteCount: args.results.filter((result) => result.error).length,
        skippedReferencedObjectCount: args.skippedReferencedObjectCount,
      },
    });

    return { markedFailedSessionCount };
  },
});

export const createUploadSession = internalMutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    itemId: v.optional(v.id("items")),
    boxId: v.optional(v.id("boxes")),
    spaceId: v.optional(v.id("moveSpaces")),
    transportResourceId: v.optional(v.id("transportResources")),
    transportZoneId: v.optional(v.id("transportZones")),
    room: v.optional(v.string()),
    originalStorageKey: v.string(),
    originalBucket: v.string(),
    mediaKind: v.optional(
      v.union(v.literal("image"), v.literal("audio"), v.literal("video")),
    ),
    expectedMimeType: v.string(),
    expectedSizeBytes: v.number(),
    derivativeUploads: v.optional(
      v.array(
        v.object({
          variant: photoDerivativeVariantValidator,
          storageKey: v.string(),
          bucket: v.string(),
          expectedMimeType: v.string(),
          expectedSizeBytes: v.number(),
          width: v.number(),
          height: v.number(),
        }),
      ),
    ),
    expiresAt: v.number(),
    apiActor: v.optional(apiPhotoActorValidator),
  },
  handler: async (ctx, args) => {
    let userId = args.apiActor?.createdByUserId;
    if (!userId) {
      const { actor } = await requireMovePermission(
        ctx,
        args.householdId,
        args.moveId,
        "inventory:edit",
      );
      if (actor.type !== "user") {
        throw new Error("Photo uploads require a user or API-key actor.");
      }
      userId = actor.userId;
    }
    if (args.apiActor) {
      await assertMoveInHousehold(ctx, args);
    }
    const original = assertOriginalUploadFileShape({
      mimeType: args.expectedMimeType,
      sizeBytes: args.expectedSizeBytes,
    });
    const derivativeUploads = args.derivativeUploads ?? [];
    for (const derivative of derivativeUploads) {
      assertImageDerivativeUploadFileShape({
        mimeType: derivative.expectedMimeType,
        sizeBytes: derivative.expectedSizeBytes,
      });
    }
    assertDerivativeUploadsAllowed(original.mediaKind, derivativeUploads.length);
    await assertPhotoTargets(ctx, args);

    const now = Date.now();
    return await ctx.db.insert("photoUploadSessions", {
      householdId: args.householdId,
      moveId: args.moveId,
      itemId: args.itemId,
      boxId: args.boxId,
      spaceId: args.spaceId,
      transportResourceId: args.transportResourceId,
      transportZoneId: args.transportZoneId,
      room: normalizeOptionalText(args.room),
      originalStorageKey: args.originalStorageKey,
      originalBucket: args.originalBucket,
      mediaKind: original.mediaKind,
      expectedMimeType: original.mimeType,
      expectedSizeBytes: original.sizeBytes,
      derivativeUploads,
      status: "authorized",
      expiresAt: args.expiresAt,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getUploadSession = internalQuery({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    uploadSessionId: uploadSessionIdValidator,
    apiActor: v.optional(apiPhotoActorValidator),
  },
  handler: async (ctx, args) => {
    if (!args.apiActor) {
      await requireMovePermission(
        ctx,
        args.householdId,
        args.moveId,
        "inventory:edit",
      );
    }
    const session = await ctx.db.get(args.uploadSessionId);
    if (
      !session ||
      session.householdId !== args.householdId ||
      session.moveId !== args.moveId ||
      session.status !== "authorized" ||
      session.expiresAt < Date.now()
    ) {
      throw new Error("Upload session is not active.");
    }

    return session;
  },
});

export const getPhotoForDelivery = internalQuery({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    photoId: v.id("itemPhotos"),
  },
  handler: async (ctx, args) => {
    const policy = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );
    const photo = await ctx.db.get(args.photoId);
    if (
      !photo ||
      photo.householdId !== args.householdId ||
      photo.moveId !== args.moveId ||
      photo.archivedAt
    ) {
      throw new ConvexError("Photo not found.");
    }

    return {
      photo,
      visibility: policy.visibility,
    };
  },
});

// API-key (REST) variant of getPhotoForDelivery. The REST action layer already
// authorized the move via authenticateAction (API-key scope + household/move),
// and there is NO ctx.auth in that path — so this must NOT call
// requireMovePermission (which resolves a Clerk session and throws
// AuthenticationRequiredError for API-key callers). It only re-validates that
// the photo belongs to the authorized move. See MOVE-317.
export const getPhotoForDeliveryForApiActor = internalQuery({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    photoId: v.id("itemPhotos"),
  },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (
      !photo ||
      photo.householdId !== args.householdId ||
      photo.moveId !== args.moveId ||
      photo.archivedAt
    ) {
      throw new ConvexError("Photo not found.");
    }
    return { photo };
  },
});

export const recordOriginalAccess = internalMutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    photoId: v.id("itemPhotos"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }
    const photo = await ctx.db.get(args.photoId);
    if (
      !photo ||
      photo.householdId !== args.householdId ||
      photo.moveId !== args.moveId ||
      photo.archivedAt
    ) {
      throw new ConvexError("Photo not found.");
    }

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "photo",
      action: "photo.original_download_url_created",
      objectTable: "itemPhotos",
      objectId: args.photoId,
      metadata: {
        privacyLevel: photo.privacyLevel,
        visibilityScope: photo.visibilityScope,
      },
    });
  },
});

export const markUploadSessionFailed = internalMutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    uploadSessionId: uploadSessionIdValidator,
    apiActor: v.optional(apiPhotoActorValidator),
  },
  handler: async (ctx, args) => {
    if (!args.apiActor) {
      await requireMovePermission(
        ctx,
        args.householdId,
        args.moveId,
        "inventory:edit",
      );
    }
    const session = await ctx.db.get(args.uploadSessionId);
    if (
      session &&
      session.householdId === args.householdId &&
      session.moveId === args.moveId
    ) {
      await ctx.db.patch(args.uploadSessionId, {
        status: "failed",
        updatedAt: Date.now(),
      });
    }
  },
});

export const completeUploadSession = internalMutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    uploadSessionId: uploadSessionIdValidator,
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    originalHash: v.optional(v.string()),
    caption: v.optional(v.string()),
    photoType: v.optional(photoTypeValidator),
    privacyLevel: v.optional(photoPrivacyLevelValidator),
    visibilityScope: v.optional(photoVisibilityScopeValidator),
    source: v.optional(photoSourceValidator),
    exifHandlingStatus: v.optional(exifHandlingStatusValidator),
    confidence: v.optional(estimateConfidenceValidator),
    notes: v.optional(v.string()),
    verificationStatus: v.optional(photoVerificationStatusValidator),
    capturedAt: v.optional(v.number()),
    apiActor: v.optional(apiPhotoActorValidator),
  },
  handler: async (ctx, args) => {
    let userId = args.apiActor?.createdByUserId;
    if (!userId) {
      const { actor } = await requireMovePermission(
        ctx,
        args.householdId,
        args.moveId,
        "inventory:edit",
      );
      if (actor.type !== "user") {
        throw new Error(
          "Photo upload finalization requires a user or API-key actor.",
        );
      }
      userId = actor.userId;
    }

    const session = await ctx.db.get(args.uploadSessionId);
    if (
      !session ||
      session.householdId !== args.householdId ||
      session.moveId !== args.moveId ||
      session.status !== "authorized" ||
      session.expiresAt < Date.now()
    ) {
      throw new Error("Upload session is not active.");
    }
    const mediaKind =
      session.mediaKind ??
      mediaKindForMimeType(session.expectedMimeType) ??
      "image";
    assertImageDimensions({
      mediaKind,
      width: args.width,
      height: args.height,
    });

    await assertHouseholdEntitlement(ctx, {
      householdId: args.householdId,
      dimension: "photoCount",
    });
    await assertHouseholdEntitlement(ctx, {
      householdId: args.householdId,
      dimension: "photoStorageBytes",
      increment: session.expectedSizeBytes,
    });

    const now = Date.now();
    const derivativeRefs = (session.derivativeUploads ?? []).reduce<
      Doc<"itemPhotos">["derivativeRefs"]
    >((refs, derivative) => {
      refs[derivative.variant] = derivative.storageKey;
      return refs;
    }, {});
    const derivativeStatus =
      mediaKind === "image"
        ? session.derivativeUploads && session.derivativeUploads.length > 0
          ? "ready"
          : "pending"
        : undefined;
    const photoId = await ctx.db.insert("itemPhotos", {
      householdId: args.householdId,
      moveId: args.moveId,
      itemId: session.itemId,
      boxId: session.boxId,
      spaceId: session.spaceId,
      transportResourceId: session.transportResourceId,
      transportZoneId: session.transportZoneId,
      room: session.room,
      documentationProfileTypes: [],
      originalStorageKey: session.originalStorageKey,
      originalBucket: session.originalBucket,
      originalHash: normalizeOptionalText(args.originalHash),
      derivativeRefs,
      derivativeStatus,
      derivativesUpdatedAt: derivativeStatus === "ready" ? now : undefined,
      mediaKind,
      width: args.width,
      height: args.height,
      mimeType: session.expectedMimeType,
      sizeBytes: session.expectedSizeBytes,
      caption: normalizeOptionalText(args.caption),
      photoType: args.photoType ?? "other",
      privacyLevel: args.privacyLevel ?? "normal",
      visibilityScope: args.visibilityScope ?? "moveCollaborators",
      source: args.source ?? "manualUpload",
      exifHandlingStatus: args.exifHandlingStatus ?? "pending",
      confidence: args.confidence ?? "none",
      notes: normalizeOptionalText(args.notes),
      verificationStatus: args.verificationStatus ?? "unreviewed",
      aiProcessed: false,
      capturedAt: args.capturedAt,
      uploadedByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(args.uploadSessionId, {
      status: "completed",
      completedPhotoId: photoId,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: args.apiActor ? "apiKey" : "user",
      actorUserId: args.apiActor ? undefined : userId,
      actorApiKeyId: args.apiActor?.apiKeyId,
      category: "photo",
      action: "photo.metadata_created",
      objectTable: "itemPhotos",
      objectId: photoId,
      metadata: {
        photoType: args.photoType ?? "other",
        privacyLevel: args.privacyLevel ?? "normal",
        itemId: session.itemId,
        boxId: session.boxId,
      },
    });

    return photoId;
  },
});

export const markGeneratedDerivativesReady = internalMutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    photoId: v.id("itemPhotos"),
    derivativeRefs: derivativeRefsValidator,
    apiActor: v.optional(apiPhotoActorValidator),
  },
  handler: async (ctx, args) => {
    if (args.apiActor) {
      await assertMoveInHousehold(ctx, args);
    } else {
      await requireMovePermission(
        ctx,
        args.householdId,
        args.moveId,
        "inventory:edit",
      );
    }
    const photo = await ctx.db.get(args.photoId);
    if (
      !photo ||
      photo.householdId !== args.householdId ||
      photo.moveId !== args.moveId ||
      photo.archivedAt
    ) {
      throw new ConvexError("Photo not found.");
    }

    await ctx.db.patch(args.photoId, {
      derivativeRefs: args.derivativeRefs,
      derivativeStatus: "ready",
      derivativeError: undefined,
      derivativesUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const markGeneratedDerivativesFailed = internalMutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    photoId: v.id("itemPhotos"),
    derivativeError: v.string(),
    apiActor: v.optional(apiPhotoActorValidator),
  },
  handler: async (ctx, args) => {
    if (args.apiActor) {
      await assertMoveInHousehold(ctx, args);
    } else {
      await requireMovePermission(
        ctx,
        args.householdId,
        args.moveId,
        "inventory:edit",
      );
    }
    const photo = await ctx.db.get(args.photoId);
    if (
      !photo ||
      photo.householdId !== args.householdId ||
      photo.moveId !== args.moveId ||
      photo.archivedAt
    ) {
      throw new ConvexError("Photo not found.");
    }

    await ctx.db.patch(args.photoId, {
      derivativeStatus: "failed",
      derivativeError: args.derivativeError,
      derivativesUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const cancelUploadSession = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    uploadSessionId: uploadSessionIdValidator,
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const session = await ctx.db.get(args.uploadSessionId);
    if (
      !session ||
      session.householdId !== args.householdId ||
      session.moveId !== args.moveId ||
      session.status !== "authorized"
    ) {
      return;
    }
    await ctx.db.patch(args.uploadSessionId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
  },
});

export const updateEvidence = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    photoId: v.id("itemPhotos"),
    ...photoUpdateArgs,
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }

    const photo = await ctx.db.get(args.photoId);
    if (
      !photo ||
      photo.householdId !== args.householdId ||
      photo.moveId !== args.moveId ||
      photo.archivedAt
    ) {
      throw new ConvexError("Photo not found.");
    }
    await assertPhotoTargets(ctx, args);

    const now = Date.now();
    const patch: Partial<Doc<"itemPhotos">> = { updatedAt: now };
    if (args.itemId !== undefined) patch.itemId = args.itemId ?? undefined;
    if (args.boxId !== undefined) patch.boxId = args.boxId ?? undefined;
    if (args.spaceId !== undefined) patch.spaceId = args.spaceId;
    if (args.transportResourceId !== undefined) {
      patch.transportResourceId = args.transportResourceId;
    }
    if (args.transportZoneId !== undefined) {
      patch.transportZoneId = args.transportZoneId;
    }
    if (args.room !== undefined) patch.room = normalizeOptionalText(args.room);
    if (args.claimId !== undefined) {
      patch.claimId = normalizeOptionalText(args.claimId);
    }
    if (args.documentationProfileTypes !== undefined) {
      patch.documentationProfileTypes = args.documentationProfileTypes;
    }
    if (args.originalHash !== undefined) {
      patch.originalHash = normalizeOptionalText(args.originalHash);
    }
    if (args.derivativeRefs !== undefined) {
      patch.derivativeRefs = args.derivativeRefs;
    }
    if (args.cloudflareImageId !== undefined) {
      patch.cloudflareImageId = normalizeOptionalText(args.cloudflareImageId);
    }
    if (args.width !== undefined) patch.width = args.width;
    if (args.height !== undefined) patch.height = args.height;
    if (args.mimeType !== undefined) patch.mimeType = args.mimeType;
    if (args.sizeBytes !== undefined) patch.sizeBytes = args.sizeBytes;
    if (args.caption !== undefined) {
      patch.caption = normalizeOptionalText(args.caption);
    }
    if (args.photoType !== undefined) patch.photoType = args.photoType;
    if (args.privacyLevel !== undefined) patch.privacyLevel = args.privacyLevel;
    if (args.visibilityScope !== undefined) {
      patch.visibilityScope = args.visibilityScope;
    }
    if (args.source !== undefined) patch.source = args.source;
    if (args.exifHandlingStatus !== undefined) {
      patch.exifHandlingStatus = args.exifHandlingStatus;
    }
    if (args.confidence !== undefined) patch.confidence = args.confidence;
    if (args.notes !== undefined)
      patch.notes = normalizeOptionalText(args.notes);
    if (args.verificationStatus !== undefined) {
      patch.verificationStatus = args.verificationStatus;
      patch.reviewedAt = now;
      patch.reviewedByUserId = actor.userId;
    }
    if (args.aiProcessed !== undefined) patch.aiProcessed = args.aiProcessed;
    if (args.capturedAt !== undefined) patch.capturedAt = args.capturedAt;

    await ctx.db.patch(args.photoId, patch);

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "photo",
      action: "photo.metadata_updated",
      objectTable: "itemPhotos",
      objectId: args.photoId,
      metadata: { changedKeys: Object.keys(patch) },
    });
  },
});

export const archive = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    photoId: v.id("itemPhotos"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }

    const photo = await ctx.db.get(args.photoId);
    if (
      !photo ||
      photo.householdId !== args.householdId ||
      photo.moveId !== args.moveId
    ) {
      throw new ConvexError("Photo not found.");
    }

    await ctx.db.patch(args.photoId, {
      archivedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "photo",
      action: "photo.archived",
      objectTable: "itemPhotos",
      objectId: args.photoId,
    });
  },
});
