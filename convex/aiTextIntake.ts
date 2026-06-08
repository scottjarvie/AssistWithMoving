import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  itemDispositionValidator,
  itemFragilityValidator,
  normalizeBoxCode,
  normalizeItemName,
  normalizeOptionalText,
  normalizedSearchName,
  planningDefaultKeyValidator,
} from "./lib/moveFields";
import {
  parseTextIntakeSuggestions,
  type TextIntakeBoxDraft,
  type TextIntakeItemDraft,
} from "./lib/textIntakeParser";
import { requireMovePermission } from "./lib/permissions";

const itemDraftValidator = v.object({
  name: v.string(),
  room: v.optional(v.string()),
  destinationRoom: v.optional(v.string()),
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
  destinationRoom: v.optional(v.string()),
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
        v.literal("rejected")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read"
    );

    const limit = Math.min(Math.max(args.limit ?? 100, 1), 200);
    const suggestions = await ctx.db
      .query("aiTextSuggestions")
      .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .take(limit);

    return suggestions.filter((suggestion) =>
      args.status ? suggestion.status === args.status : true
    );
  },
});

export const createFromText = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    sourceText: v.string(),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit"
    );
    if (actor.type !== "user") {
      throw new Error("API-key AI text intake is not implemented yet.");
    }

    const sourceText = normalizeOptionalText(args.sourceText);
    if (!sourceText) {
      throw new Error("Text intake needs source text.");
    }

    const parsed = parseTextIntakeSuggestions(sourceText).slice(0, 80);
    if (!parsed.length) {
      throw new Error("No inventory suggestions could be found in that text.");
    }

    const now = Date.now();
    const aiJobId = await ctx.db.insert("aiJobs", {
      householdId: args.householdId,
      moveId: args.moveId,
      type: "inventoryExtraction",
      status: "succeeded",
      modality: "text",
      provider: "mock",
      model: "text-intake-parser-v1",
      inputRef: { source: "aiTextIntake", sourceText },
      inputSummary: sourceText.slice(0, 500),
      outputRef: {
        suggestionCount: parsed.length,
        itemCount: parsed.filter((suggestion) => suggestion.type === "item")
          .length,
        boxCount: parsed.filter((suggestion) => suggestion.type === "box")
          .length,
      },
      outputSummary: `${parsed.length} text intake suggestions created.`,
      confidence: "medium",
      reviewStatus: "unreviewed",
      tokenUsage: {
        inputTokens: Math.max(32, Math.ceil(sourceText.length / 4)),
        outputTokens: parsed.length * 32,
        totalTokens: Math.max(32, Math.ceil(sourceText.length / 4)) +
          parsed.length * 32,
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
    for (const suggestion of parsed) {
      const suggestionId = await ctx.db.insert("aiTextSuggestions", {
        householdId: args.householdId,
        moveId: args.moveId,
        aiJobId,
        type: suggestion.type,
        status: "pending",
        sourceText,
        sourceLine: suggestion.sourceLine,
        sourceIndex: suggestion.sourceIndex,
        confidence: suggestion.confidence,
        reasoning: suggestion.reasoning,
        itemDraft: suggestion.itemDraft
          ? normalizeItemDraft(suggestion.itemDraft)
          : undefined,
        boxDraft: suggestion.boxDraft
          ? normalizeBoxDraft(suggestion.boxDraft)
          : undefined,
        createdByUserId: actor.userId,
        createdAt: now,
        updatedAt: now,
      });
      suggestionIds.push(suggestionId);
    }

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "ai",
      action: "ai_text_intake.created",
      objectTable: "aiJobs",
      objectId: aiJobId,
      metadata: {
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
        suggestionId: v.id("aiTextSuggestions"),
        itemDraft: v.optional(itemDraftValidator),
        boxDraft: v.optional(boxDraftValidator),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit"
    );
    if (actor.type !== "user") {
      throw new Error("API-key AI text approvals are not implemented yet.");
    }

    const now = Date.now();
    const suggestions = await loadPendingSuggestions(ctx, args);
    const boxIdsByLabel = new Map<string, Id<"boxes">>();
    const createdItemIds: Id<"items">[] = [];
    const createdBoxIds: Id<"boxes">[] = [];

    for (const suggestion of suggestions.filter(
      (entry) => entry.suggestion.type === "box"
    )) {
      const draft = normalizeBoxDraft(
        suggestion.approval.boxDraft ?? suggestion.suggestion.boxDraft
      );
      if (!draft) continue;
      const boxId = await ensureBoxForDraft(ctx, {
        householdId: args.householdId,
        moveId: args.moveId,
        draft,
        userId: actor.userId,
        now,
      });
      boxIdsByLabel.set(normalizeBoxLabelKey(draft.label), boxId);
      createdBoxIds.push(boxId);
      await ctx.db.patch(suggestion.suggestion._id, {
        status: suggestion.approval.boxDraft ? "edited" : "approved",
        approvedBoxId: boxId,
        reviewedByUserId: actor.userId,
        reviewedAt: now,
        updatedAt: now,
      });
    }

    for (const suggestion of suggestions.filter(
      (entry) => entry.suggestion.type === "item"
    )) {
      const draft = normalizeItemDraft(
        suggestion.approval.itemDraft ?? suggestion.suggestion.itemDraft
      );
      if (!draft) continue;
      const itemId = await createTrustedItemFromDraft(ctx, {
        householdId: args.householdId,
        moveId: args.moveId,
        draft,
        userId: actor.userId,
        now,
      });
      createdItemIds.push(itemId);

      if (draft.suggestedBoxLabel) {
        const boxId =
          boxIdsByLabel.get(normalizeBoxLabelKey(draft.suggestedBoxLabel)) ??
          (await ensureBoxForDraft(ctx, {
            householdId: args.householdId,
            moveId: args.moveId,
            draft: {
              label: draft.suggestedBoxLabel,
              room: draft.room,
              description: "Created from approved AI text intake contents.",
            },
            userId: actor.userId,
            now,
          }));
        boxIdsByLabel.set(normalizeBoxLabelKey(draft.suggestedBoxLabel), boxId);
        await addItemToBox(ctx, {
          householdId: args.householdId,
          moveId: args.moveId,
          boxId,
          itemId,
          quantity: draft.quantity,
          now,
        });
      }

      await ctx.db.patch(suggestion.suggestion._id, {
        status: suggestion.approval.itemDraft ? "edited" : "approved",
        approvedItemId: itemId,
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
      action: "ai_text_intake.approved",
      objectTable: "aiTextSuggestions",
      metadata: {
        suggestionCount: suggestions.length,
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
    suggestionIds: v.array(v.id("aiTextSuggestions")),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit"
    );
    if (actor.type !== "user") {
      throw new Error("API-key AI text rejection is not implemented yet.");
    }

    const now = Date.now();
    const suggestions = await loadPendingSuggestions(ctx, {
      ...args,
      approvals: args.suggestionIds.map((suggestionId) => ({ suggestionId })),
    });
    for (const { suggestion } of suggestions) {
      await ctx.db.patch(suggestion._id, {
        status: "rejected",
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
      action: "ai_text_intake.rejected",
      objectTable: "aiTextSuggestions",
      metadata: { suggestionCount: suggestions.length },
    });
  },
});

async function loadPendingSuggestions(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    approvals: {
      suggestionId: Id<"aiTextSuggestions">;
      itemDraft?: TextIntakeItemDraft;
      boxDraft?: TextIntakeBoxDraft;
    }[];
  }
) {
  const loaded = [];
  for (const approval of args.approvals) {
    const suggestion = await ctx.db.get(approval.suggestionId);
    if (
      !suggestion ||
      suggestion.householdId !== args.householdId ||
      suggestion.moveId !== args.moveId
    ) {
      throw new Error("AI text suggestion not found.");
    }
    if (suggestion.status !== "pending") {
      throw new Error("Only pending AI text suggestions can be reviewed.");
    }
    loaded.push({ suggestion, approval });
  }
  return loaded;
}

async function createTrustedItemFromDraft(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    draft: TextIntakeItemDraft;
    userId: Id<"users">;
    now: number;
  }
) {
  const name = normalizeItemName(args.draft.name);
  const itemId = await ctx.db.insert("items", {
    householdId: args.householdId,
    moveId: args.moveId,
    name,
    normalizedName: normalizedSearchName(name),
    description: normalizeOptionalText(args.draft.description),
    room: normalizeOptionalText(args.draft.room),
    destinationRoom: normalizeOptionalText(args.draft.destinationRoom),
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
    aiSummary: `Approved from text intake: ${args.draft.suggestedBoxLabel ?? args.draft.room ?? "move notes"}.`,
    aiTags: ["textIntake"],
    createdVia: "textAI",
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
    action: "item.created_from_ai_text",
    objectTable: "items",
    objectId: itemId,
    metadata: {
      name,
      disposition: args.draft.disposition,
    },
  });

  return itemId;
}

async function ensureBoxForDraft(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    draft: TextIntakeBoxDraft;
    userId: Id<"users">;
    now: number;
  }
) {
  const label = normalizeOptionalText(args.draft.label) ?? "AI text intake box";
  const existing = await findBoxByLabel(ctx, args.moveId, label);
  if (existing) return existing._id;

  const code = await uniqueBoxCode(
    ctx,
    args.moveId,
    args.draft.code ?? label
  );
  const boxId = await ctx.db.insert("boxes", {
    householdId: args.householdId,
    moveId: args.moveId,
    code,
    label,
    room: normalizeOptionalText(args.draft.room),
    destinationRoom: normalizeOptionalText(args.draft.destinationRoom),
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
    action: "box.created_from_ai_text",
    objectTable: "boxes",
    objectId: boxId,
    metadata: { code, label },
  });

  return boxId;
}

async function addItemToBox(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    boxId: Id<"boxes">;
    itemId: Id<"items">;
    quantity: number;
    now: number;
  }
) {
  await ctx.db.insert("boxItems", {
    householdId: args.householdId,
    moveId: args.moveId,
    boxId: args.boxId,
    itemId: args.itemId,
    quantity: positiveQuantity(args.quantity),
    notes: "Approved from AI text intake.",
    createdAt: args.now,
    updatedAt: args.now,
  });
  await ctx.db.patch(args.itemId, {
    status: "packed",
    updatedAt: args.now,
  });
  await ctx.db.patch(args.boxId, {
    status: "packing",
    updatedAt: args.now,
  });
}

async function findBoxByLabel(
  ctx: MutationCtx,
  moveId: Id<"moves">,
  label: string
) {
  const normalizedLabel = normalizeBoxLabelKey(label);
  const boxes = await ctx.db
    .query("boxes")
    .withIndex("by_move_code", (q) => q.eq("moveId", moveId))
    .collect();
  return boxes.find(
    (box) =>
      !box.archivedAt &&
      (normalizeBoxLabelKey(box.label ?? "") === normalizedLabel ||
        normalizeBoxLabelKey(box.code) === normalizedLabel)
  );
}

async function uniqueBoxCode(
  ctx: MutationCtx,
  moveId: Id<"moves">,
  label: string
) {
  const base = normalizeBoxCode(label) || "AI-BOX";
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

function normalizeItemDraft(draft: TextIntakeItemDraft | undefined) {
  if (!draft?.name.trim()) return undefined;
  return {
    name: normalizeItemName(draft.name),
    room: normalizeOptionalText(draft.room),
    destinationRoom: normalizeOptionalText(draft.destinationRoom),
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

function normalizeBoxDraft(draft: TextIntakeBoxDraft | undefined) {
  if (!draft?.label.trim()) return undefined;
  return {
    code: draft.code ? normalizeBoxCode(draft.code) : undefined,
    label: normalizeOptionalText(draft.label) ?? "AI text intake box",
    room: normalizeOptionalText(draft.room),
    destinationRoom: normalizeOptionalText(draft.destinationRoom),
    description: normalizeOptionalText(draft.description),
  };
}

function normalizeBoxLabelKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function positiveQuantity(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 1;
}
