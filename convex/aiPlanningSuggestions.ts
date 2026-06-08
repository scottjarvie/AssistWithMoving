import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import {
  approvePlanningSuggestions,
  createPlanningSuggestionsForMove,
  rejectPlanningSuggestions,
} from "./lib/aiPlanningSuggestionWorkflow";
import { estimateConfidenceValidator } from "./lib/moveFields";
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
    if (actor.type !== "user") throw new Error("Signed-in user context required.");

    return await createPlanningSuggestionsForMove(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actor: { type: "user", userId: actor.userId },
    });
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
    if (actor.type !== "user") throw new Error("Signed-in user context required.");

    return await approvePlanningSuggestions(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actor: { type: "user", userId: actor.userId },
      approvals: args.approvals,
    });
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
    if (actor.type !== "user") throw new Error("Signed-in user context required.");

    return await rejectPlanningSuggestions(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actor: { type: "user", userId: actor.userId },
      suggestionIds: args.suggestionIds,
    });
  },
});
