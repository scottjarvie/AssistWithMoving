import { requirePersonConnectionManagement } from "./lib/personConnectionManagement";
import { refusalOf, personRefusal, type UploadRefusal } from "./lib/usageLimits/refusal";
import { recordRefusalActivity, checkBatchAdmission } from "./usageLimits";
import { checkFileSize, effectiveFileCap, type LimitSettings } from "./lib/usageLimits/core";
import { siteDefaults } from "./lib/mediaStorage";
function fileSizeFailure(kind: string, bytes: number, site: LimitSettings | null, override: LimitSettings | null) { return checkFileSize(kind, bytes, effectiveFileCap(kind, siteDefaults, site, override)); }
import { referencedObject, claimedUploadObject } from "./storageDeletion";
import { reserveUpload, commitUpload, closeUploadReservation, restoreUploadReservation, addStoredCopy, ownerFor, limitsFor } from "./usageLimits";
import { mcpCallerValidator } from "convex-mcp-gateway";
import { aiMutation, publicationArgs } from "./lib/sharedPublishing";
import { ConvexError, v, type Infer } from "convex/values";
import {
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
  oauthCaller: v.optional(mcpCallerValidator),
  ...publicationArgs,
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
  oauthCaller?: { subject: string; claims?: Record<string, unknown> };
  acknowledgeContactDetails?: { emails: number; phones: number; addresses: number };
  restorePrivately?: boolean;
  apiKeyId: string;
  createdByUserId: Doc<"users">["_id"];
};

const initUploadArgs = {
  operationId: v.optional(v.string()),
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
  operationId?: string;
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
  uploadLimits?: Awaited<ReturnType<typeof import("./usageLimits").uploadPolicy>>;
  refusal?: UploadRefusal;
  alreadyUploaded?: boolean;
  replayedPhotoId?: string;
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
  storage?: Awaited<ReturnType<typeof import("./usageLimits").summaryFor>>;
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
    const original = assertOriginalUploadFileShape(args, Number.MAX_SAFE_INTEGER);
    const normalizedDerivatives = (args.derivatives ?? []).map((derivative) => {
      const normalized = assertImageDerivativeUploadFileShape({
        mimeType: derivative.mimeType,
        sizeBytes: derivative.sizeBytes,
      }, Number.MAX_SAFE_INTEGER);
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
    let objectKey = uploadObjectKey({
      moveId: args.moveId,
      mimeType: original.mimeType,
    });
    let derivativeUploads =
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
    const begun = await ctx.runMutation(
      internal.photos.tryCreateUploadSession,
      {
        operationId: args.operationId,
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

    if (begun.refusal) throw new ConvexError(begun.refusal);
    const uploadSessionId = begun.uploadSessionId!;
    const persisted = await ctx.runQuery(internal.photos.getUploadSession, { householdId: args.householdId, moveId: args.moveId, uploadSessionId, apiActor });
    if (persisted.completedPhotoId) return { uploadSessionId, alreadyUploaded: true, replayedPhotoId: persisted.completedPhotoId, uploadUrl: "", method: "PUT", headers: { "Content-Type": original.mimeType }, derivativeUploads: [], expiresAt, storage: await ctx.runQuery(internal.usageLimits.summaryInternal, { householdId: args.householdId }) };
    let alreadyUploaded = false;
    try {
      const head = await b2Client().send(new HeadObjectCommand({ Bucket: persisted.originalBucket, Key: persisted.originalStorageKey }));
      alreadyUploaded = head.ContentLength === persisted.expectedSizeBytes && (!head.ContentType || contentTypesMatch(head.ContentType, persisted.expectedMimeType));
      if (!alreadyUploaded) throw new ConvexError("An earlier upload at this operation id has different bytes. Retry with a new operationId.");
    } catch (error) { if (!["NotFound", "NoSuchKey"].includes((error as { name?: string }).name ?? "")) throw error; }
    objectKey = persisted.originalStorageKey;
    derivativeUploads = (persisted.derivativeUploads ?? []).map(d => ({ variant: d.variant, storageKey: d.storageKey, bucket: d.bucket, mimeType: d.expectedMimeType, sizeBytes: d.expectedSizeBytes, width: d.width, height: d.height }));
    const uploadUrl = await getSignedUrl(
      b2Client(),
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: objectKey,
        ContentType: original.mimeType,
        ContentLength: original.sizeBytes,
      }),
      { expiresIn: Math.floor(uploadSessionTtlMs / 1000), signingDate: new Date(expiresAt - uploadSessionTtlMs) },
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
          { expiresIn: Math.floor(uploadSessionTtlMs / 1000), signingDate: new Date(expiresAt - uploadSessionTtlMs) },
        ),
        method: "PUT" as const,
        headers: { "Content-Type": derivative.mimeType },
      })),
    );

    return {
      alreadyUploaded,
      uploadLimits: await ctx.runQuery(internal.usageLimits.policyInternal, { householdId: args.householdId }),
      storage: await ctx.runQuery(internal.usageLimits.summaryInternal, { householdId: args.householdId }),
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
    await requirePersonConnectionManagement(ctx);
    try { return await runInitUpload(ctx, args); } catch (error) { const refusal = refusalOf(error); if (refusal) personRefusal(refusal); throw error; }
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
    try { return await runInitUpload(ctx, args, args.apiActor); } catch (error) { const refusal = refusalOf(error); if (!refusal) throw error; return { refusal, uploadSessionId: "", uploadUrl: "", method: "PUT", headers: { "Content-Type": args.mimeType }, derivativeUploads: [], expiresAt: 0 }; }
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
  uploadLimits?: Awaited<ReturnType<typeof import("./usageLimits").uploadPolicy>>;
  refusal?: UploadRefusal;
  photoId: string;
  derivativeStatus?: "pending" | "ready" | "failed";
  derivativeError?: string;
  derivativeNote: string;
  storage?: Awaited<ReturnType<typeof import("./usageLimits").summaryFor>>;
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

    if (session.completedPhotoId) return { photoId: session.completedPhotoId, derivativeStatus: session.completedPhoto?.derivativeStatus, derivativeError: session.completedPhoto?.derivativeError, derivativeNote: derivativeNoteForStatus(session.completedPhoto?.derivativeStatus), storage: await ctx.runQuery(internal.usageLimits.summaryInternal, { householdId: args.householdId }) };
    await ctx.runMutation(internal.photos.startFinalize, { householdId: args.householdId, moveId: args.moveId, uploadSessionId: args.uploadSessionId, apiActor });
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
      if (!(error instanceof Error) || !/does not match|unsupported|invalid/i.test(error.message)) throw error;
      await ctx.runMutation(internal.photos.markUploadSessionFailed, {
        reason: error instanceof Error ? error.message : "Invalid upload.",
        code: "UPLOAD_VALIDATION_FAILED",
        householdId: args.householdId,
        moveId: args.moveId,
        uploadSessionId: args.uploadSessionId,
        apiActor,
      });
      throw error;
    }

    const finished = await ctx.runMutation(internal.photos.tryCompleteUploadSession, {
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

    if (finished.refusal) throw new ConvexError(finished.refusal);
    const photoId = finished.photoId!;
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
            photoId,
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
        }).catch(() => { /* The accepted original and durable copy intents remain counted. */ });
      }
    }

    return {
      storage: await ctx.runQuery(internal.usageLimits.summaryInternal, { householdId: args.householdId }),
      uploadLimits: await ctx.runQuery(internal.usageLimits.policyInternal, { householdId: args.householdId }),
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
    await requirePersonConnectionManagement(ctx);
    try { return await runFinalizeUpload(ctx, args); } catch (error) { const refusal = refusalOf(error); if (refusal) personRefusal(refusal); throw error; }
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
    try { return await runFinalizeUpload(ctx, args, args.apiActor); } catch (error) { const refusal = refusalOf(error); if (!refusal) throw error; return { refusal, photoId: "", derivativeNote: "" }; }
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
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
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
      return "Original evidence was uploaded and Assist With Moving created web-ready image derivatives for display and AI review.";
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
    const filename = `assistwithmoving-original-${args.photoId}.${fileExtensionForMediaMimeType(
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
        try {
          const result = await ctx.runAction(internal.storageDeletion.deleteSession, { sessionId: candidate.uploadSessionId, dryRun: false });
          if (result.deleted) deletedObjectCount = candidate.objectRefs.length;
          else error = "Storage cleanup remains pending or referenced.";
        } catch (deleteError) { error = cleanupStorageError(deleteError); }

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

export const finishExpiredUploadSessionCleanup = aiMutation({
  args: {
    ...publicationArgs,
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

export const createSessionArgs = {
    ...publicationArgs,
    operationId: v.optional(v.string()),
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
  };

async function claimSessionObjects(ctx: MutationCtx, sessionId: Doc<"photoUploadSessions">["_id"], keys: string[]) {
  for (const key of keys) await ctx.db.insert("uploadObjectClaims", { sessionId, storageKey: key });
  await ctx.db.patch(sessionId, { objectClaimsRegistered: true });
}
async function createSession(ctx: MutationCtx, args: Infer<typeof sessionValidator>) {
    let userId = args.apiActor?.createdByUserId;
    if (!userId) {
      await requirePersonConnectionManagement(ctx);
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
    }, Number.MAX_SAFE_INTEGER);
    const derivativeUploads = args.derivativeUploads ?? [];
    for (const derivative of derivativeUploads) {
      assertImageDerivativeUploadFileShape({
        mimeType: derivative.expectedMimeType,
        sizeBytes: derivative.expectedSizeBytes,
      }, Number.MAX_SAFE_INTEGER);
    }
    assertDerivativeUploadsAllowed(original.mediaKind, derivativeUploads.length);
    await assertPhotoTargets(ctx, args);

    const now = Date.now();
    const info = await limitsFor(ctx, args.householdId);
    if (!args.operationId && info.effective.enforcement === "on") throw new ConvexError({ code: "OPERATION_ID_REQUIRED", message: "Send an operationId and retry this upload." });
    const operationId = args.operationId ? `${args.moveId}:${userId}:${args.operationId}` : args.originalStorageKey;
    const previous = await ctx.db.query("photoUploadSessions").withIndex("by_household_operation", q => q.eq("householdId", args.householdId).eq("operationId", operationId)).unique();
    if (previous) {
      if (["itemId", "boxId", "spaceId", "transportResourceId", "transportZoneId", "room"].some(field => (previous[field as keyof typeof previous] ?? null) !== (args[field as keyof typeof args] ?? null)) || previous.expectedSizeBytes !== original.sizeBytes || previous.expectedMimeType !== original.mimeType || JSON.stringify((previous.derivativeUploads ?? []).map(d => [d.variant, d.expectedSizeBytes])) !== JSON.stringify(derivativeUploads.map(d => [d.variant, d.expectedSizeBytes]))) throw new ConvexError({ code: "OPERATION_CONFLICT", message: "This operationId already names different media." });
      if (previous.status === "completed" || previous.completedPhotoId) return previous._id;
      const cleanup = await ctx.db.query("sessionDeletionJobs").withIndex("by_session", q => q.eq("sessionId", previous._id)).order("desc").first();
      if (cleanup?.status === "pending") throw new ConvexError("This upload is being cleaned up. Retry with a new operationId after cleanup completes.");
      if (previous.cleanupCompletedAt) {
        const keys = [args.originalStorageKey, ...derivativeUploads.map(d => d.storageKey)];
        if (new Set(keys).size !== keys.length) throw new ConvexError({ code: "OPERATION_CONFLICT", message: "Each stored copy needs its own object key." });
        for (const key of keys) if (await claimedUploadObject(ctx, key, previous._id)) throw new ConvexError({ code: "OPERATION_CONFLICT", message: "This stored object already belongs to another upload." });
        const usageReservationId = await reserveUpload(ctx, args.householdId, operationId, original.sizeBytes + derivativeUploads.reduce((sum, d) => sum + d.expectedSizeBytes, 0), original.mediaKind, original.sizeBytes);
    await ctx.db.patch(usageReservationId, { expiresAt: args.expiresAt });
    await ctx.scheduler.runAt(args.expiresAt, internal.usageLimits.expireReservations, {});
        await ctx.db.patch(previous._id, { usageReservationId, originalStorageKey: args.originalStorageKey, originalBucket: args.originalBucket, derivativeUploads, cleanupCompletedAt: undefined, cleanupError: undefined, status: "authorized", expiresAt: args.expiresAt, updatedAt: now });
        await claimSessionObjects(ctx, previous._id, [args.originalStorageKey, ...derivativeUploads.map(d => d.storageKey)]);
        return previous._id;
      }
      await restoreUploadReservation(ctx, previous, args.expiresAt);
      // Reuse the existing hold, keys and declared size. Late PUTs cannot create
      // a second untracked original. Cleanup never deletes live session objects.
      await ctx.scheduler.runAt(args.expiresAt + defaultPhotoUploadCleanupGraceMs, internal.storageDeletion.runSessionDeletion, { sessionId: previous._id });
      await ctx.db.patch(previous._id, { status: "authorized", expiresAt: args.expiresAt, updatedAt: now });
      return previous._id;
    }

    const keys = [args.originalStorageKey, ...derivativeUploads.map(d => d.storageKey)];
    if (new Set(keys).size !== keys.length) throw new ConvexError({ code: "OPERATION_CONFLICT", message: "Each stored copy needs its own object key." });
    for (const key of keys) {
      if (await claimedUploadObject(ctx, key)) throw new ConvexError({ code: "OPERATION_CONFLICT", message: "This storage object is already registered to another operation." });
    }
    const usageReservationId = await reserveUpload(ctx, args.householdId, operationId, original.sizeBytes + derivativeUploads.reduce((sum, d) => sum + d.expectedSizeBytes, 0), original.mediaKind, original.sizeBytes);
    await ctx.db.patch(usageReservationId, { expiresAt: args.expiresAt });
    await ctx.scheduler.runAt(args.expiresAt, internal.usageLimits.expireReservations, {});
    const sessionId = await ctx.db.insert("photoUploadSessions", {
      usageReservationId,
      operationId,
      usageOwnerId: info.ownerId,
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
    await claimSessionObjects(ctx, sessionId, [args.originalStorageKey, ...derivativeUploads.map(d => d.storageKey)]);
    await ctx.scheduler.runAt(args.expiresAt + defaultPhotoUploadCleanupGraceMs, internal.storageDeletion.runSessionDeletion, { sessionId });
    return sessionId;
  }
export const sessionValidator = v.object(createSessionArgs);
export const createUploadSession = aiMutation({ args: createSessionArgs, handler: createSession });

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
      (session.status !== "authorized" && !session.completedPhotoId) ||
      (!session.completedPhotoId && session.expiresAt < Date.now() && (session.processingUntil ?? 0) < Date.now())
    ) {
      throw new Error("Upload session is not active.");
    }

    const photo = session.completedPhotoId ? await ctx.db.get(session.completedPhotoId) : null;
    if (session.completedPhotoId && !photo) throw new ConvexError("This upload was removed. Start a new upload with a new operationId.");
    return { ...session, completedPhoto: photo ? { derivativeStatus: photo.derivativeStatus, derivativeError: photo.derivativeError } : undefined };
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

export const recordOriginalAccess = aiMutation({
  args: {
    ...publicationArgs,
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

export const markUploadSessionFailed = aiMutation({
  args: {
    ...publicationArgs,
    householdId: v.id("households"),
    moveId: v.id("moves"),
    uploadSessionId: uploadSessionIdValidator,
    reason: v.optional(v.string()),
    code: v.optional(v.string()),
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
      if (session.status === "completed") return;
      await closeUploadReservation(ctx, session);
      await ctx.scheduler.runAt(Math.max(Date.now(), session.expiresAt + defaultPhotoUploadCleanupGraceMs), internal.storageDeletion.runSessionDeletion, { sessionId: session._id });
      await ctx.db.patch(args.uploadSessionId, {
        status: "failed",
        failureCode: args.code ?? "UPLOAD_FAILED",
        failureReason: args.reason ?? "The upload did not complete.",
        updatedAt: Date.now(),
      });
    }
  },
});

const completeSessionArgs = {
    ...publicationArgs,
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
  };
async function completeSession(ctx: MutationCtx, args: Infer<typeof completeValidator>) {
    let userId = args.apiActor?.createdByUserId;
    if (!userId) {
      await requirePersonConnectionManagement(ctx);
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
    if (session?.completedPhotoId && session.householdId === args.householdId && session.moveId === args.moveId) return session.completedPhotoId;
    if (
      !session ||
      session.householdId !== args.householdId ||
      session.moveId !== args.moveId ||
      (session.status !== "authorized" && !session.completedPhotoId) ||
      (!session.completedPhotoId && session.expiresAt < Date.now() && (session.processingUntil ?? 0) < Date.now())
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
    const storedBytes = session.expectedSizeBytes + (session.derivativeUploads ?? []).reduce((sum, d) => sum + d.expectedSizeBytes, 0);
    await commitUpload(ctx, args.householdId, session.usageReservationId, storedBytes);

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
      storedBytes,
      derivativeSizes: Object.fromEntries((session.derivativeUploads ?? []).map(d => [d.variant, d.expectedSizeBytes])),
      usageOwnerId: session.usageOwnerId ?? await ownerFor(ctx, args.householdId),
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
      processingUntil: undefined,
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

    for (const claim of await ctx.db.query("uploadObjectClaims").withIndex("by_session", q => q.eq("sessionId", session._id)).collect()) await ctx.db.delete(claim._id);
    return photoId;
  }
export const completeValidator = v.object(completeSessionArgs);
export const completeUploadSession = aiMutation({ args: completeSessionArgs, handler: completeSession });
export const tryCompleteUploadSession = aiMutation({ args: completeSessionArgs, handler: async (ctx, args) => { try { return { photoId: await completeSession(ctx, args) }; } catch (error) { const refusal = refusalOf(error); if (!refusal) throw error; await recordRefusalActivity(ctx, args.householdId, refusal, args.apiActor); const session = await ctx.db.get(args.uploadSessionId); if (session && !session.completedPhotoId) { await closeUploadReservation(ctx, session); await ctx.db.patch(session._id, { status: "failed", failureCode: refusal.code, failureReason: refusal.message, updatedAt: Date.now() }); await ctx.scheduler.runAt(Math.max(Date.now(), session.expiresAt + defaultPhotoUploadCleanupGraceMs), internal.storageDeletion.runSessionDeletion, { sessionId: session._id }); } if (refusal.code === "USAGE_LIMIT_REACHED") { const info = await limitsFor(ctx, args.householdId); await ctx.db.insert("usageLimitEvents", { ownerId: info.ownerId, at: Date.now(), mode: "on", source: "finish", limit: refusal.limit, used: refusal.used, cap: refusal.cap, requested: refusal.requested, remaining: refusal.remaining }); } return { refusal }; } } });

export const markGeneratedDerivativesReady = aiMutation({
  args: {
    ...publicationArgs,
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

export const markGeneratedDerivativesFailed = aiMutation({
  args: {
    ...publicationArgs,
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
    await requirePersonConnectionManagement(ctx);
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
    await closeUploadReservation(ctx, session);
    await ctx.scheduler.runAt(Math.max(Date.now(), session.expiresAt + defaultPhotoUploadCleanupGraceMs), internal.storageDeletion.runSessionDeletion, { sessionId: session._id });
    await ctx.db.patch(args.uploadSessionId, {
      failureCode: "UPLOAD_CANCELLED", failureReason: "Cancelled by the uploader.",
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
    await requirePersonConnectionManagement(ctx);
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
    if (args.sizeBytes !== undefined && args.sizeBytes !== photo.sizeBytes) throw new ConvexError("Stored media size can only be changed by storage verification.");
    if (args.derivativeRefs && JSON.stringify(args.derivativeRefs) !== JSON.stringify(photo.derivativeRefs)) throw new ConvexError("Stored image references can only be changed by a verified upload.");
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

// A durable intent is charged before PUT, so a lost completion write cannot
// orphan uncounted copies. Generation never uses upload frequency/in-flight caps.
export const prepareStoredDerivative = internalMutation({
  args: { photoId: v.id("itemPhotos"), storageKey: v.string(), bytes: v.number() },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo || photo.pendingStorageDeletion) throw new ConvexError("Photo is being removed.");
    const prior = await ctx.db.query("generatedObjects").withIndex("by_key", q => q.eq("storageKey", args.storageKey)).unique();
    if (prior) { if (prior.photoId !== photo._id || prior.bytes !== args.bytes) throw new ConvexError("Generated object conflicts with its intent."); return; }
    const ownerId = photo.usageOwnerId ?? await ownerFor(ctx, photo.householdId);
    await ctx.db.insert("generatedObjects", { ownerId, photoId: photo._id, bucket: photo.originalBucket, storageKey: args.storageKey, bytes: args.bytes, state: "pending", createdAt: Date.now() });
    await addStoredCopy(ctx, photo.householdId, args.bytes);
    await ctx.db.patch(photo._id, { storedBytes: (photo.storedBytes ?? photo.sizeBytes) + args.bytes });
  },
});
export const recordStoredDerivative = internalMutation({
  args: { photoId: v.id("itemPhotos"), variant: photoDerivativeVariantValidator, storageKey: v.string(), bytes: v.number() },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo) throw new ConvexError("Photo not found.");
    const intent = await ctx.db.query("generatedObjects").withIndex("by_key", q => q.eq("storageKey", args.storageKey)).unique();
    if (intent && (intent.photoId !== photo._id || intent.bytes !== args.bytes)) throw new ConvexError("Generated object does not match its intent.");
    if (photo.derivativeRefs[args.variant] === args.storageKey) return;
    if (!intent) await addStoredCopy(ctx, photo.householdId, args.bytes);
    else await addStoredCopy(ctx, photo.householdId, 0);
    if (intent) await ctx.db.patch(intent._id, { state: "active" });
    await ctx.db.patch(photo._id, { storedBytes: (photo.storedBytes ?? photo.sizeBytes) + (intent ? 0 : args.bytes), derivativeRefs: { ...photo.derivativeRefs, [args.variant]: args.storageKey }, derivativeSizes: { ...photo.derivativeSizes, [args.variant]: args.bytes } });
  },
});

/** Read-only preflight. The scheduled sweep never deletes storage objects. */
export const claimExpiredCleanup = internalQuery({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("photoUploadSessions").withIndex("by_expires", q => q.lt("expiresAt", Date.now() - defaultPhotoUploadCleanupGraceMs)).paginate({ cursor: args.cursor ?? null, numItems: 30 });
    const candidates = [];
    for (const session of page.page) {
      if (session.completedPhotoId || session.status === "completed" || session.cleanupCompletedAt) continue;
      const refs = [];
      for (const ref of uploadSessionStorageRefs(session)) if (!await referencedObject(ctx, ref.storageKey, undefined, session._id)) refs.push(ref);
      candidates.push({ id: session._id, refs });
    }
    return { candidates, cursor: page.continueCursor, isDone: page.isDone, dryRun: true as const };
  },
});
export const cleanupExpiredInternal = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args): Promise<unknown> => ctx.runQuery(internal.photos.claimExpiredCleanup, args),
});

const batchSessionArgs = { files: v.array(v.object(createSessionArgs)), requestBytes: v.number() };
async function createBatch(ctx: MutationCtx, args: Infer<typeof batchValidator>) {
    if (!args.files.length) return [];
    const valid: Array<{ index: number; file: Infer<typeof sessionValidator> }> = [];
    const results: Array<{ uploadSessionId?: Doc<"photoUploadSessions">["_id"]; error?: string; code?: string; created?: boolean }> = args.files.map(() => ({}));
    let bytes = 0, heldBytes = 0;
    const pendingKeys = new Set<string>();
    const pendingOperations = new Set<string>();
    const newSizes: Array<{ bytes: number; countUpload: boolean }> = [];
    for (const [index, file] of args.files.entries()) {
      try {
        if (file.householdId !== args.files[0].householdId || file.moveId !== args.files[0].moveId) throw new ConvexError("A batch must belong to one move.");
        if (file.apiActor) await assertMoveInHousehold(ctx, file);
        else { await requirePersonConnectionManagement(ctx); await requireMovePermission(ctx, file.householdId, file.moveId, "inventory:edit"); }
        await assertPhotoTargets(ctx, file);
        const info = await limitsFor(ctx, file.householdId);
        const original = assertOriginalUploadFileShape({ mimeType: file.expectedMimeType, sizeBytes: file.expectedSizeBytes }, Number.MAX_SAFE_INTEGER);
        for (const derivative of file.derivativeUploads ?? []) assertImageDerivativeUploadFileShape({ mimeType: derivative.expectedMimeType, sizeBytes: derivative.expectedSizeBytes }, Number.MAX_SAFE_INTEGER);
        assertDerivativeUploadsAllowed(original.mediaKind, file.derivativeUploads?.length ?? 0);
        const actorId = file.apiActor?.createdByUserId ?? (await requireMovePermission(ctx, file.householdId, file.moveId, "inventory:edit")).actor;
        const userId = typeof actorId === "string" ? actorId : actorId.type === "user" ? actorId.userId : "";
        const operationId = file.operationId ? `${file.moveId}:${userId}:${file.operationId}` : file.originalStorageKey;
        const prior = await ctx.db.query("photoUploadSessions").withIndex("by_household_operation", q => q.eq("householdId", file.householdId).eq("operationId", operationId)).unique();
        if (prior && (prior.expectedSizeBytes !== file.expectedSizeBytes || prior.expectedMimeType !== file.expectedMimeType)) throw new ConvexError({ code: "OPERATION_CONFLICT", message: "This operationId names different media." });
        if (prior && !prior.cleanupCompletedAt) { results[index] = { uploadSessionId: prior._id, created: false }; continue; }
        const sizeFailure = fileSizeFailure(original.mediaKind, original.sizeBytes, info.site, info.override);
        if (sizeFailure) throw new ConvexError(sizeFailure);
        if (!file.operationId && info.effective.enforcement === "on") throw new ConvexError({ code: "OPERATION_ID_REQUIRED", message: "Send an operationId and retry this upload." });
        for (const key of [file.originalStorageKey, ...(file.derivativeUploads ?? []).map(d => d.storageKey)]) if (await claimedUploadObject(ctx, key)) throw new ConvexError({ code: "OPERATION_CONFLICT", message: "This storage object is already registered to another operation." });
        if (pendingOperations.has(operationId)) throw new ConvexError({ code: "OPERATION_CONFLICT", message: "An operationId can occur only once in a batch." });
        pendingOperations.add(operationId);
        const keys = [file.originalStorageKey, ...(file.derivativeUploads ?? []).map(d => d.storageKey)];
        if (keys.some(key => pendingKeys.has(key)) || new Set(keys).size !== keys.length) throw new ConvexError({ code: "OPERATION_CONFLICT", message: "A stored object belongs to one upload in this batch." });
        for (const key of keys) pendingKeys.add(key);
        const held = await ctx.db.query("uploadReservations").withIndex("by_owner_key", q => q.eq("ownerId", info.ownerId).eq("key", operationId)).unique();
        if (held?.status === "reserved") heldBytes += held.bytes;
        else newSizes.push({ bytes: file.expectedSizeBytes + (file.derivativeUploads ?? []).reduce((sum, d) => sum + d.expectedSizeBytes, 0), countUpload: !held });
        bytes += file.expectedSizeBytes + (file.derivativeUploads ?? []).reduce((sum, d) => sum + d.expectedSizeBytes, 0);
        valid.push({ index, file });
      } catch (error) { const refusal = refusalOf(error); if (refusal) await recordRefusalActivity(ctx, file.householdId, refusal, file.apiActor); results[index] = { code: error instanceof ConvexError && typeof error.data === "object" ? String(error.data?.code ?? "INVALID_FILE") : "INVALID_FILE", error: error instanceof ConvexError && typeof error.data === "object" ? String(error.data?.message ?? "Invalid media.") : error instanceof Error ? error.message : "Invalid media." }; }
    }
    await checkBatchAdmission(ctx, args.files[0].householdId, bytes, valid.length, args.requestBytes, heldBytes, newSizes);
    for (const { index, file } of valid) results[index] = { uploadSessionId: await createSession(ctx, file), created: true };
    return results;
  }
export const batchValidator = v.object(batchSessionArgs);
export const createUploadBatch = aiMutation({ args: batchSessionArgs, handler: createBatch });
export const tryCreateUploadBatch = aiMutation({ args: batchSessionArgs, handler: async (ctx, args) => { try { return { results: await createBatch(ctx, args) }; } catch (error) { const refusal = refusalOf(error); if (!refusal) throw error; if (args.files[0]) await recordRefusalActivity(ctx, args.files[0].householdId, refusal, args.files[0].apiActor); if (refusal.code === "USAGE_LIMIT_REACHED" && args.files[0]) { const info = await limitsFor(ctx, args.files[0].householdId); await ctx.db.insert("usageLimitEvents", { ownerId: info.ownerId, at: Date.now(), mode: "on", source: "batch", limit: refusal.limit, used: refusal.used, cap: refusal.cap, requested: refusal.requested, remaining: refusal.remaining }); } return { refusal }; } } });

export const tryCreateUploadSession = aiMutation({ args: createSessionArgs, handler: async (ctx, args) => {
  try { return { uploadSessionId: await createSession(ctx, args) }; }
  catch (error) { const refusal = refusalOf(error); if (!refusal) throw error;
    const info = await limitsFor(ctx, args.householdId);
    await recordRefusalActivity(ctx, args.householdId, refusal, args.apiActor);
    if (refusal.code === "USAGE_LIMIT_REACHED") await ctx.db.insert("usageLimitEvents", { ownerId: info.ownerId, at: Date.now(), mode: "on", source: "begin", limit: refusal.limit, used: refusal.used, cap: refusal.cap, requested: refusal.requested, remaining: refusal.remaining });
    return { refusal };
  }
} });

export const startFinalize = aiMutation({ args: { householdId: v.id("households"), moveId: v.id("moves"), uploadSessionId: uploadSessionIdValidator, apiActor: v.optional(apiPhotoActorValidator) }, handler: async (ctx, args) => {
  if (args.apiActor) await assertMoveInHousehold(ctx, args); else { await requirePersonConnectionManagement(ctx); await requireMovePermission(ctx, args.householdId, args.moveId, "inventory:edit"); }
  const session = await ctx.db.get(args.uploadSessionId);
  if (!session || session.householdId !== args.householdId || session.moveId !== args.moveId || (session.status !== "authorized" && !session.completedPhotoId)) throw new ConvexError("Upload session is not active.");
  if (!session.completedPhotoId) await ctx.db.patch(session._id, { processingUntil: Date.now() + 10 * 60 * 1000 });
} });
