import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import { aiUsageLimits, assertAiUsageAllowed } from "./lib/aiUsage";
import {
  itemDispositionValidator,
  itemFragilityValidator,
  normalizeBoxCode,
  normalizeItemName,
  normalizeOptionalText,
  normalizedSearchName,
  planningDefaultKeyValidator,
} from "./lib/moveFields";
import { suggestFromPhotoIntake } from "./lib/photoIntake";
import { canUsePhotoDerivativeForAi } from "./lib/photoVisibility";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";

const itemDraftValidator = v.object({
  name: v.string(),
  room: v.optional(v.string()),
  category: v.optional(v.string()),
  disposition: itemDispositionValidator,
  quantity: v.number(),
  description: v.optional(v.string()),
  suggestedBoxLabel: v.optional(v.string()),
  fragility: v.optional(itemFragilityValidator),
  highValue: v.optional(v.boolean()),
  planningDefaultKeys: v.optional(v.array(planningDefaultKeyValidator)),
});

const boxDraftValidator = v.object({
  code: v.optional(v.string()),
  label: v.string(),
  room: v.optional(v.string()),
  description: v.optional(v.string()),
});

export const listForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("edited"),
        v.literal("rejected"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);
    const suggestions = await ctx.db
      .query("aiPhotoSuggestions")
      .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .take(limit);
    return suggestions.filter((suggestion) =>
      args.status ? suggestion.status === args.status : true,
    );
  },
});

export const createForPhoto = mutation({
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
      throw new Error("Photo not found.");
    }
    if (!canUsePhotoDerivativeForAi(photo)) {
      throw new Error(
        "Photo privacy or derivative status does not allow AI intake.",
      );
    }
    if (photo.sizeBytes > aiUsageLimits.maxPhotoInputBytes) {
      throw new Error("Photo is too large for AI intake.");
    }

    const existingPending = await ctx.db
      .query("aiPhotoSuggestions")
      .withIndex("by_photo_status", (q) =>
        q.eq("photoId", args.photoId).eq("status", "pending"),
      )
      .collect();
    if (existingPending.length) {
      return {
        aiJobId: existingPending[0].aiJobId,
        suggestionIds: existingPending.map((suggestion) => suggestion._id),
      };
    }

    await assertAiUsageAllowed(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      userId: actor.userId,
      inputSizeBytes: photo.sizeBytes,
      estimatedCents: 0,
    });

    const duplicatePhotoIds = await duplicatePhotoIdsForMove(ctx, photo);
    const suggestions = suggestFromPhotoIntake({
      photoId: args.photoId,
      caption: photo.caption,
      room: photo.room,
      photoType: photo.photoType,
      privacyLevel: photo.privacyLevel,
      width: photo.width,
      height: photo.height,
      duplicatePhotoIds,
    }).slice(0, 12);

    const now = Date.now();
    const aiJobId = await ctx.db.insert("aiJobs", {
      householdId: args.householdId,
      moveId: args.moveId,
      type: "photoIntake",
      status: "succeeded",
      modality: "vision",
      provider: "mock",
      model: "photo-intake-parser-v1",
      inputRef: {
        source: "aiPhotoIntake",
        photoId: args.photoId,
        derivativeVariant: "card",
      },
      inputSummary: photo.width && photo.height
        ? `${photo.photoType} photo ${photo.width}x${photo.height}`
        : `${photo.photoType} photo`,
      outputRef: {
        suggestionCount: suggestions.length,
        duplicatePhotoIds,
      },
      outputSummary: `${suggestions.length} photo intake suggestions created.`,
      confidence: "medium",
      reviewStatus: "unreviewed",
      tokenUsage: {
        inputTokens: 512,
        outputTokens: suggestions.length * 48,
        totalTokens: 512 + suggestions.length * 48,
      },
      cost: {
        estimatedCents: 0,
        actualCents: 0,
        currency: "USD",
      },
      retryCount: 0,
      maxRetries: 0,
      createdByUserId: actor.userId,
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const suggestionIds = [];
    for (const suggestion of suggestions) {
      const suggestionId = await ctx.db.insert("aiPhotoSuggestions", {
        householdId: args.householdId,
        moveId: args.moveId,
        photoId: args.photoId,
        aiJobId,
        type: suggestion.type,
        status: "pending",
        sourceDerivativeVariant: suggestion.sourceDerivativeVariant,
        sourceSummary: suggestion.sourceSummary,
        confidence: suggestion.confidence,
        reasoning: suggestion.reasoning,
        itemDraft: suggestion.itemDraft,
        boxDraft: suggestion.boxDraft,
        duplicatePhotoIds: suggestion.duplicatePhotoIds as
          | Id<"itemPhotos">[]
          | undefined,
        createdByUserId: actor.userId,
        createdAt: now,
        updatedAt: now,
      });
      suggestionIds.push(suggestionId);
    }

    await ctx.db.patch(args.photoId, {
      aiProcessed: true,
      verificationStatus: "needsReview",
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "ai",
      action: "ai_photo_intake.created",
      objectTable: "aiJobs",
      objectId: aiJobId,
      metadata: {
        photoId: args.photoId,
        suggestionCount: suggestionIds.length,
      },
    });

    return { aiJobId, suggestionIds };
  },
});

export const approveMany = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    approvals: v.array(
      v.object({
        suggestionId: v.id("aiPhotoSuggestions"),
        itemDraft: v.optional(itemDraftValidator),
        boxDraft: v.optional(boxDraftValidator),
      }),
    ),
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

    const now = Date.now();
    const loaded = await loadPendingSuggestions(ctx, args);
    const createdItemIds: Id<"items">[] = [];
    const createdBoxIds: Id<"boxes">[] = [];

    for (const { suggestion, approval } of loaded) {
      let approvedItemId: Id<"items"> | undefined;
      let approvedBoxId: Id<"boxes"> | undefined;

      const boxDraft = normalizeBoxDraft(
        approval.boxDraft ?? suggestion.boxDraft,
      );
      if (boxDraft) {
        approvedBoxId = await ensureBoxForDraft(ctx, {
          householdId: args.householdId,
          moveId: args.moveId,
          draft: boxDraft,
          userId: actor.userId,
          now,
        });
        createdBoxIds.push(approvedBoxId);
        await ctx.db.patch(suggestion.photoId, {
          boxId: approvedBoxId,
          verificationStatus: "verified",
          updatedAt: now,
        });
      }

      const itemDraft = normalizeItemDraft(
        approval.itemDraft ?? suggestion.itemDraft,
      );
      if (itemDraft) {
        approvedItemId = await createItemFromPhotoDraft(ctx, {
          householdId: args.householdId,
          moveId: args.moveId,
          draft: itemDraft,
          photoId: suggestion.photoId,
          userId: actor.userId,
          now,
        });
        createdItemIds.push(approvedItemId);
        await ctx.db.patch(suggestion.photoId, {
          itemId: approvedItemId,
          verificationStatus: "verified",
          updatedAt: now,
        });
      }

      await ctx.db.patch(suggestion._id, {
        status: approval.itemDraft || approval.boxDraft ? "edited" : "approved",
        approvedItemId,
        approvedBoxId,
        reviewedByUserId: actor.userId,
        reviewedAt: now,
        updatedAt: now,
      });
    }

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "ai",
      action: "ai_photo_intake.approved",
      objectTable: "aiPhotoSuggestions",
      metadata: {
        suggestionCount: loaded.length,
        createdItemIds,
        createdBoxIds,
      },
    });

    return { createdItemIds, createdBoxIds };
  },
});

export const rejectMany = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    suggestionIds: v.array(v.id("aiPhotoSuggestions")),
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
    const loaded = await loadPendingSuggestions(ctx, {
      ...args,
      approvals: args.suggestionIds.map((suggestionId) => ({ suggestionId })),
    });
    const now = Date.now();
    for (const { suggestion } of loaded) {
      await ctx.db.patch(suggestion._id, {
        status: "rejected",
        reviewedByUserId: actor.userId,
        reviewedAt: now,
        updatedAt: now,
      });
    }
  },
});

async function loadPendingSuggestions(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    approvals: {
      suggestionId: Id<"aiPhotoSuggestions">;
      itemDraft?: PhotoItemDraft;
      boxDraft?: PhotoBoxDraft;
    }[];
  },
) {
  const loaded = [];
  for (const approval of args.approvals) {
    const suggestion = await ctx.db.get(approval.suggestionId);
    if (
      !suggestion ||
      suggestion.householdId !== args.householdId ||
      suggestion.moveId !== args.moveId
    ) {
      throw new Error("AI photo suggestion not found.");
    }
    if (suggestion.status !== "pending") {
      throw new Error("Only pending AI photo suggestions can be reviewed.");
    }
    loaded.push({ suggestion, approval });
  }
  return loaded;
}

type PhotoItemDraft = NonNullable<Doc<"aiPhotoSuggestions">["itemDraft"]>;
type PhotoBoxDraft = NonNullable<Doc<"aiPhotoSuggestions">["boxDraft"]>;

async function createItemFromPhotoDraft(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    draft: PhotoItemDraft;
    photoId: Id<"itemPhotos">;
    userId: Id<"users">;
    now: number;
  },
) {
  const name = normalizeItemName(args.draft.name);
  const itemId = await ctx.db.insert("items", {
    householdId: args.householdId,
    moveId: args.moveId,
    name,
    normalizedName: normalizedSearchName(name),
    description: normalizeOptionalText(args.draft.description),
    room: normalizeOptionalText(args.draft.room),
    category: normalizeOptionalText(args.draft.category),
    disposition: args.draft.disposition,
    status: "active",
    quantity: positiveQuantity(args.draft.quantity),
    condition: "unknown",
    weightConfidence: "none",
    volumeConfidence: "none",
    fragility: args.draft.fragility ?? "low",
    stackable: true,
    hazardousFlag: false,
    highValue: args.draft.highValue ?? false,
    requiresPersonalTransport:
      args.draft.disposition === "personalTransport" ||
      args.draft.planningDefaultKeys?.includes("sensitive") === true,
    planningDefaultKeys: args.draft.planningDefaultKeys ?? [],
    needsReview: false,
    reviewFlags: [],
    aiSummary: `Approved from photo intake ${args.photoId}.`,
    aiTags: ["photoIntake"],
    createdVia: "photoAI",
    reviewedAt: args.now,
    createdByUserId: args.userId,
    updatedByUserId: args.userId,
    createdAt: args.now,
    updatedAt: args.now,
  });
  await recordAuditEvent(ctx, {
    householdId: args.householdId,
    moveId: args.moveId,
    actorType: "user",
    actorUserId: args.userId,
    category: "inventory",
    action: "item.created_from_ai_photo",
    objectTable: "items",
    objectId: itemId,
    metadata: { photoId: args.photoId, name },
  });
  return itemId;
}

async function ensureBoxForDraft(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    draft: PhotoBoxDraft;
    userId: Id<"users">;
    now: number;
  },
) {
  const label = normalizeOptionalText(args.draft.label) ?? "AI photo box";
  const code = await uniqueBoxCode(ctx, args.moveId, args.draft.code ?? label);
  const boxId = await ctx.db.insert("boxes", {
    householdId: args.householdId,
    moveId: args.moveId,
    code,
    label,
    room: normalizeOptionalText(args.draft.room),
    description: normalizeOptionalText(args.draft.description),
    status: "open",
    assignmentLocked: false,
    assignmentWarnings: [],
    assignmentHardBlocks: [],
    assignmentValidatedAt: args.now,
    createdByUserId: args.userId,
    createdAt: args.now,
    updatedAt: args.now,
  });
  await recordAuditEvent(ctx, {
    householdId: args.householdId,
    moveId: args.moveId,
    actorType: "user",
    actorUserId: args.userId,
    category: "inventory",
    action: "box.created_from_ai_photo",
    objectTable: "boxes",
    objectId: boxId,
    metadata: { code, label },
  });
  return boxId;
}

async function duplicatePhotoIdsForMove(
  ctx: MutationCtx,
  photo: Doc<"itemPhotos">,
) {
  if (!photo.originalHash) return [];
  const photos = await ctx.db
    .query("itemPhotos")
    .withIndex("by_move_created", (q) => q.eq("moveId", photo.moveId))
    .collect();
  return photos
    .filter(
      (candidate) =>
        candidate._id !== photo._id &&
        !candidate.archivedAt &&
        candidate.originalHash === photo.originalHash,
    )
    .map((candidate) => candidate._id);
}

async function uniqueBoxCode(
  ctx: MutationCtx,
  moveId: Id<"moves">,
  label: string,
) {
  const base = normalizeBoxCode(label) || "AI-PHOTO-BOX";
  const existing = await ctx.db
    .query("boxes")
    .withIndex("by_move_code", (q) => q.eq("moveId", moveId))
    .collect();
  const codes = new Set(existing.map((box) => box.code));
  if (!codes.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const code = normalizeBoxCode(`${base}-${index}`);
    if (code && !codes.has(code)) return code;
  }
  throw new Error("Could not create a unique box code.");
}

function normalizeItemDraft(draft: PhotoItemDraft | undefined) {
  if (!draft?.name.trim()) return undefined;
  return {
    name: normalizeItemName(draft.name),
    room: normalizeOptionalText(draft.room),
    category: normalizeOptionalText(draft.category),
    disposition: draft.disposition,
    quantity: positiveQuantity(draft.quantity),
    description: normalizeOptionalText(draft.description),
    suggestedBoxLabel: normalizeOptionalText(draft.suggestedBoxLabel),
    fragility: draft.fragility,
    highValue: draft.highValue,
    planningDefaultKeys: draft.planningDefaultKeys ?? [],
  };
}

function normalizeBoxDraft(draft: PhotoBoxDraft | undefined) {
  if (!draft?.label.trim()) return undefined;
  return {
    code: draft.code ? normalizeBoxCode(draft.code) : undefined,
    label: normalizeOptionalText(draft.label) ?? "AI photo box",
    room: normalizeOptionalText(draft.room),
    description: normalizeOptionalText(draft.description),
  };
}

function positiveQuantity(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 1;
}
