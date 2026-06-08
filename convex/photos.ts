import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, type MutationCtx, query } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
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
import { redactPhotoForVisibility } from "./lib/photoVisibility";
import { requireMovePermission } from "./lib/permissions";

const derivativeRefsValidator = v.object({
  thumb: v.optional(v.string()),
  card: v.optional(v.string()),
  detail: v.optional(v.string()),
  full: v.optional(v.string()),
});

const photoWriteArgs = {
  itemId: v.optional(v.id("items")),
  boxId: v.optional(v.id("boxes")),
  room: v.optional(v.string()),
  claimId: v.optional(v.string()),
  documentationProfileTypes: v.optional(
    v.array(documentationProfileTypeValidator)
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

async function assertPhotoTargets(
  ctx: MutationCtx,
  args: {
    moveId: Doc<"moves">["_id"];
    itemId?: Doc<"items">["_id"];
    boxId?: Doc<"boxes">["_id"];
  }
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
}

function redactPhotos(
  photos: Doc<"itemPhotos">[],
  visibility: Parameters<typeof redactPhotoForVisibility>[1]
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
      "inventory:read"
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
            : true
        )
        .filter((photo) =>
          args.privacyLevel ? photo.privacyLevel === args.privacyLevel : true
        ),
      policy.visibility
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
      "inventory:read"
    );
    const photos = await ctx.db
      .query("itemPhotos")
      .withIndex("by_item_created", (q) => q.eq("itemId", args.itemId))
      .order("desc")
      .collect();

    return redactPhotos(
      photos.filter((photo) => photo.moveId === args.moveId),
      policy.visibility
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
      "inventory:read"
    );
    const photos = await ctx.db
      .query("itemPhotos")
      .withIndex("by_box_created", (q) => q.eq("boxId", args.boxId))
      .order("desc")
      .collect();

    return redactPhotos(
      photos.filter((photo) => photo.moveId === args.moveId),
      policy.visibility
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
      "inventory:read"
    );
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
    const photos = await ctx.db
      .query("itemPhotos")
      .withIndex("by_move_verification", (q) =>
        q.eq("moveId", args.moveId).eq("verificationStatus", "needsReview")
      )
      .take(limit);

    return redactPhotos(photos, policy.visibility);
  },
});

export const createMetadata = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    ...photoWriteArgs,
    originalStorageKey: v.string(),
    originalBucket: v.string(),
    width: v.number(),
    height: v.number(),
    mimeType: v.string(),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit"
    );
    if (actor.type !== "user") {
      throw new Error("API-key photo metadata creation is not implemented yet.");
    }
    await assertPhotoTargets(ctx, args);

    const now = Date.now();
    const photoId = await ctx.db.insert("itemPhotos", {
      householdId: args.householdId,
      moveId: args.moveId,
      itemId: args.itemId,
      boxId: args.boxId,
      room: normalizeOptionalText(args.room),
      claimId: normalizeOptionalText(args.claimId),
      documentationProfileTypes: args.documentationProfileTypes ?? [],
      originalStorageKey: args.originalStorageKey,
      originalBucket: args.originalBucket,
      originalHash: normalizeOptionalText(args.originalHash),
      derivativeRefs: args.derivativeRefs ?? {},
      cloudflareImageId: normalizeOptionalText(args.cloudflareImageId),
      width: args.width,
      height: args.height,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      caption: normalizeOptionalText(args.caption),
      photoType: args.photoType ?? "other",
      privacyLevel: args.privacyLevel ?? "normal",
      visibilityScope: args.visibilityScope ?? "moveCollaborators",
      source: args.source ?? "manualUpload",
      exifHandlingStatus: args.exifHandlingStatus ?? "pending",
      confidence: args.confidence ?? "none",
      notes: normalizeOptionalText(args.notes),
      verificationStatus: args.verificationStatus ?? "unreviewed",
      aiProcessed: args.aiProcessed ?? false,
      capturedAt: args.capturedAt,
      uploadedByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "photo",
      action: "photo.metadata_created",
      objectTable: "itemPhotos",
      objectId: photoId,
      metadata: {
        photoType: args.photoType ?? "other",
        privacyLevel: args.privacyLevel ?? "normal",
        itemId: args.itemId,
        boxId: args.boxId,
      },
    });

    return photoId;
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
      "inventory:edit"
    );
    if (actor.type !== "user") {
      throw new Error("API-key photo metadata updates are not implemented yet.");
    }

    const photo = await ctx.db.get(args.photoId);
    if (
      !photo ||
      photo.householdId !== args.householdId ||
      photo.moveId !== args.moveId ||
      photo.archivedAt
    ) {
      throw new Error("Photo not found.");
    }
    await assertPhotoTargets(ctx, args);

    const now = Date.now();
    const patch: Partial<Doc<"itemPhotos">> = { updatedAt: now };
    if (args.itemId !== undefined) patch.itemId = args.itemId;
    if (args.boxId !== undefined) patch.boxId = args.boxId;
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
    if (args.notes !== undefined) patch.notes = normalizeOptionalText(args.notes);
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
