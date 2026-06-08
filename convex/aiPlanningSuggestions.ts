import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import { estimateItem, sumEstimateValues } from "./lib/estimateEngine";
import {
  estimateConfidenceValidator,
  normalizeOptionalText,
} from "./lib/moveFields";
import {
  suggestAssignmentForBox,
  suggestEstimateForItem,
} from "./lib/planningSuggestions";
import { requireMovePermission } from "./lib/permissions";

const estimateDraftValidator = v.object({
  category: v.optional(v.string()),
  estimatedWeightLb: v.optional(v.number()),
  estimatedWeightLowLb: v.optional(v.number()),
  estimatedWeightHighLb: v.optional(v.number()),
  estimatedVolumeCuFt: v.optional(v.number()),
  estimatedPackedVolumeCuFt: v.optional(v.number()),
  weightConfidence: estimateConfidenceValidator,
  volumeConfidence: estimateConfidenceValidator,
});

const assignmentDraftValidator = v.object({
  assignedResourceId: v.id("transportResources"),
  assignedZoneId: v.optional(v.id("transportZones")),
  assignmentWarnings: v.array(v.string()),
  assignmentHardBlocks: v.array(v.string()),
  weightPercent: v.optional(v.number()),
  volumePercent: v.optional(v.number()),
  overrideReason: v.optional(v.string()),
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
      .query("aiPlanningSuggestions")
      .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .take(limit);
    return suggestions.filter((suggestion) =>
      args.status ? suggestion.status === args.status : true
    );
  },
});

export const createForMove = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit"
    );
    if (actor.type !== "user") {
      throw new Error("API-key planning suggestions are not implemented yet.");
    }

    const [items, boxes, resources, zones] = await Promise.all([
      ctx.db
        .query("items")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("boxes")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("transportResources")
        .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("transportZones")
        .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
        .collect(),
    ]);

    const now = Date.now();
    const activeItems = items.filter((item) => !item.deletedAt);
    const activeBoxes = boxes.filter((box) => !box.archivedAt);
    const activeResources = resources.filter((resource) => !resource.archivedAt);
    const activeZones = zones.filter((zone) => !zone.archivedAt);
    const generated = [];

    for (const item of activeItems.slice(0, 150)) {
      const suggestion = suggestEstimateForItem({
        itemId: item._id,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        estimatedWeightLb: item.estimatedWeightLb,
        actualWeightLb: item.actualWeightLb,
        estimatedVolumeCuFt: item.estimatedVolumeCuFt,
        estimatedPackedVolumeCuFt: item.estimatedPackedVolumeCuFt,
        weightConfidence: item.weightConfidence,
        volumeConfidence: item.volumeConfidence,
      });
      if (suggestion) {
        generated.push({
          type: "estimate" as const,
          itemId: item._id,
          confidence: suggestion.confidence,
          reasoning: suggestion.reasoning,
          assumptions: suggestion.assumptions,
          estimateDraft: suggestion.estimateDraft,
        });
      }
    }

    for (const box of activeBoxes.slice(0, 150)) {
      const loadableBox = await loadableBoxFor(ctx, box);
      const suggestion = suggestAssignmentForBox({
        box: {
          ...loadableBox,
          boxId: box._id,
          code: box.code,
          assignedResourceId: box.assignedResourceId,
          assignmentLocked: box.assignmentLocked,
        },
        resources: activeResources.map((resource) => ({
          resourceId: resource._id,
          type: resource.type,
          name: resource.name,
          capacity: resource.capacity,
        })),
        zones: activeZones.map((zone) => ({
          zoneId: zone._id,
          resourceId: zone.resourceId,
          name: zone.name,
          capacity: zone.capacity,
        })),
      });
      if (suggestion) {
        generated.push({
          type: "assignment" as const,
          boxId: box._id,
          confidence: suggestion.confidence,
          reasoning: suggestion.reasoning,
          assumptions: suggestion.assumptions,
          assignmentDraft: {
            assignedResourceId: suggestion.assignmentDraft
              .assignedResourceId as Id<"transportResources">,
            assignedZoneId: suggestion.assignmentDraft.assignedZoneId as
              | Id<"transportZones">
              | undefined,
            assignmentWarnings: suggestion.assignmentDraft.assignmentWarnings,
            assignmentHardBlocks: suggestion.assignmentDraft.assignmentHardBlocks,
            weightPercent: suggestion.assignmentDraft.weightPercent,
            volumePercent: suggestion.assignmentDraft.volumePercent,
            overrideReason: suggestion.assignmentDraft.overrideReason,
          },
        });
      }
    }

    const limitedGenerated = generated.slice(0, 120);
    const aiJobId = await ctx.db.insert("aiJobs", {
      householdId: args.householdId,
      moveId: args.moveId,
      type: "loadPlanSuggestions",
      status: "succeeded",
      modality: "structured",
      provider: "mock",
      model: "planning-suggestions-v1",
      inputRef: {
        source: "aiPlanningSuggestions",
        itemCount: activeItems.length,
        boxCount: activeBoxes.length,
        resourceCount: activeResources.length,
      },
      inputSummary: "Estimate and load assignment suggestion pass.",
      outputRef: {
        suggestionCount: limitedGenerated.length,
        estimateCount: limitedGenerated.filter((entry) => entry.type === "estimate")
          .length,
        assignmentCount: limitedGenerated.filter(
          (entry) => entry.type === "assignment"
        ).length,
      },
      outputSummary: `${limitedGenerated.length} planning suggestions created.`,
      confidence: "medium",
      reviewStatus: "unreviewed",
      tokenUsage: {
        inputTokens: activeItems.length * 12 + activeBoxes.length * 20,
        outputTokens: limitedGenerated.length * 48,
        totalTokens:
          activeItems.length * 12 +
          activeBoxes.length * 20 +
          limitedGenerated.length * 48,
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
    for (const suggestion of limitedGenerated) {
      const suggestionId = await ctx.db.insert("aiPlanningSuggestions", {
        householdId: args.householdId,
        moveId: args.moveId,
        aiJobId,
        status: "pending",
        type: suggestion.type,
        itemId: suggestion.itemId,
        boxId: suggestion.boxId,
        confidence: suggestion.confidence,
        reasoning: suggestion.reasoning,
        assumptions: suggestion.assumptions,
        estimateDraft: suggestion.estimateDraft,
        assignmentDraft: suggestion.assignmentDraft,
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
      action: "ai_planning_suggestions.created",
      objectTable: "aiJobs",
      objectId: aiJobId,
      metadata: { suggestionCount: suggestionIds.length },
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
        suggestionId: v.id("aiPlanningSuggestions"),
        estimateDraft: v.optional(estimateDraftValidator),
        assignmentDraft: v.optional(assignmentDraftValidator),
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
      throw new Error("API-key planning approvals are not implemented yet.");
    }

    const now = Date.now();
    const loaded = await loadPendingSuggestions(ctx, args);
    const updatedItemIds: Id<"items">[] = [];
    const updatedBoxIds: Id<"boxes">[] = [];

    for (const { suggestion, approval } of loaded) {
      if (suggestion.type === "estimate") {
        const draft = approval.estimateDraft ?? suggestion.estimateDraft;
        if (!draft || !suggestion.itemId) continue;
        const item = await ctx.db.get(suggestion.itemId);
        if (!item || item.deletedAt || item.moveId !== args.moveId) {
          throw new Error("Suggested item no longer exists.");
        }
        if (item.actualWeightLb) {
          throw new Error("Actual item weight cannot be overridden by AI.");
        }
        await ctx.db.patch(suggestion.itemId, {
          category: normalizeOptionalText(draft.category) ?? item.category,
          estimatedWeightLb:
            item.estimatedWeightLb ?? positiveNumber(draft.estimatedWeightLb),
          estimatedWeightLowLb:
            item.estimatedWeightLowLb ??
            positiveNumber(draft.estimatedWeightLowLb),
          estimatedWeightHighLb:
            item.estimatedWeightHighLb ??
            positiveNumber(draft.estimatedWeightHighLb),
          estimatedVolumeCuFt:
            item.estimatedVolumeCuFt ??
            positiveNumber(draft.estimatedVolumeCuFt),
          estimatedPackedVolumeCuFt:
            item.estimatedPackedVolumeCuFt ??
            positiveNumber(draft.estimatedPackedVolumeCuFt),
          weightConfidence:
            item.weightConfidence === "none"
              ? draft.weightConfidence
              : item.weightConfidence,
          volumeConfidence:
            item.volumeConfidence === "none"
              ? draft.volumeConfidence
              : item.volumeConfidence,
          aiTags: Array.from(new Set([...item.aiTags, "planningSuggestion"])),
          aiSummary: "Accepted AI planning estimate suggestion.",
          updatedByUserId: actor.userId,
          updatedAt: now,
        });
        updatedItemIds.push(suggestion.itemId);
      }

      if (suggestion.type === "assignment") {
        const draft = approval.assignmentDraft ?? suggestion.assignmentDraft;
        if (!draft || !suggestion.boxId) continue;
        const box = await ctx.db.get(suggestion.boxId);
        if (!box || box.archivedAt || box.moveId !== args.moveId) {
          throw new Error("Suggested box no longer exists.");
        }
        if (box.assignmentLocked) {
          throw new Error("Locked assignments must be changed manually.");
        }
        await assertAssignmentTargets(ctx, args.moveId, draft);
        await ctx.db.patch(suggestion.boxId, {
          assignedResourceId: draft.assignedResourceId,
          assignedZoneId: draft.assignedZoneId,
          assignmentOverrideReason: normalizeOptionalText(draft.overrideReason),
          assignmentWarnings: draft.assignmentWarnings,
          assignmentHardBlocks: draft.assignmentHardBlocks,
          assignmentValidatedAt: now,
          updatedAt: now,
        });
        updatedBoxIds.push(suggestion.boxId);
      }

      await ctx.db.patch(suggestion._id, {
        status:
          approval.estimateDraft || approval.assignmentDraft
            ? "edited"
            : "approved",
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
      action: "ai_planning_suggestions.approved",
      objectTable: "aiPlanningSuggestions",
      metadata: {
        suggestionCount: loaded.length,
        updatedItemIds,
        updatedBoxIds,
      },
    });

    return { updatedItemIds, updatedBoxIds };
  },
});

export const rejectMany = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    suggestionIds: v.array(v.id("aiPlanningSuggestions")),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit"
    );
    if (actor.type !== "user") {
      throw new Error("API-key planning rejection is not implemented yet.");
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
    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "ai",
      action: "ai_planning_suggestions.rejected",
      objectTable: "aiPlanningSuggestions",
      metadata: { suggestionCount: loaded.length },
    });
  },
});

async function loadPendingSuggestions(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    approvals: {
      suggestionId: Id<"aiPlanningSuggestions">;
      estimateDraft?: NonNullable<Doc<"aiPlanningSuggestions">["estimateDraft"]>;
      assignmentDraft?: NonNullable<
        Doc<"aiPlanningSuggestions">["assignmentDraft"]
      >;
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
      throw new Error("AI planning suggestion not found.");
    }
    if (suggestion.status !== "pending") {
      throw new Error("Only pending AI planning suggestions can be reviewed.");
    }
    loaded.push({ suggestion, approval });
  }
  return loaded;
}

async function loadableBoxFor(ctx: QueryCtx | MutationCtx, box: Doc<"boxes">) {
  const memberships = await ctx.db
    .query("boxItems")
    .withIndex("by_box", (q) => q.eq("boxId", box._id))
    .collect();
  const contents = await Promise.all(
    memberships.map(async (membership) => {
      const item = await ctx.db.get(membership.itemId);
      return item && !item.deletedAt ? { item, membership } : null;
    })
  );
  const activeContents = contents.filter(
    (entry): entry is { item: Doc<"items">; membership: Doc<"boxItems"> } =>
      Boolean(entry)
  );
  const contentEstimates = activeContents.map(({ item, membership }) =>
    estimateItem({ ...item, quantity: membership.quantity })
  );
  const contentsWeight = sumEstimateValues(
    contentEstimates.map((estimate) => estimate.weight)
  );
  const contentsVolume = sumEstimateValues(
    contentEstimates.map((estimate) => estimate.volume)
  );

  return {
    estimatedWeightLb: box.actualWeightLb ?? box.estimatedWeightLb ?? contentsWeight,
    estimatedVolumeCuFt: box.estimatedVolumeCuFt ?? contentsVolume,
    dimensionsIn: box.dimensionsIn,
    itemCount: activeContents.reduce(
      (sum, entry) => sum + entry.membership.quantity,
      0
    ),
    hasFragile: activeContents.some((entry) => entry.item.fragility === "high"),
    hasHighValue: activeContents.some((entry) => entry.item.highValue),
    hasSensitive: activeContents.some((entry) =>
      entry.item.planningDefaultKeys.includes("sensitive")
    ),
    hasPersonalTransport: activeContents.some(
      (entry) => entry.item.requiresPersonalTransport
    ),
    hasHazardous: activeContents.some((entry) => entry.item.hazardousFlag),
  };
}

async function assertAssignmentTargets(
  ctx: MutationCtx,
  moveId: Id<"moves">,
  draft: NonNullable<Doc<"aiPlanningSuggestions">["assignmentDraft"]>
) {
  const resource = await ctx.db.get(draft.assignedResourceId);
  if (!resource || resource.moveId !== moveId || resource.archivedAt) {
    throw new Error("Suggested resource is no longer available.");
  }
  if (draft.assignedZoneId) {
    const zone = await ctx.db.get(draft.assignedZoneId);
    if (
      !zone ||
      zone.moveId !== moveId ||
      zone.resourceId !== draft.assignedResourceId ||
      zone.archivedAt
    ) {
      throw new Error("Suggested zone is no longer available.");
    }
  }
}

function positiveNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}
