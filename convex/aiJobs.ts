import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import { runAiProvider } from "./lib/aiProvider";
import {
  assertAiUsageAllowed,
  estimatedCentsForDeterministicJob,
} from "./lib/aiUsage";
import {
  aiJobModalityValidator,
  aiJobReviewStatusValidator,
  aiJobTypeValidator,
  estimateConfidenceValidator,
  normalizeOptionalText,
} from "./lib/moveFields";
import { requireMovePermission } from "./lib/permissions";

const aiJobWriteArgs = {
  type: aiJobTypeValidator,
  modality: aiJobModalityValidator,
  provider: v.optional(v.string()),
  model: v.optional(v.string()),
  inputRef: v.optional(v.any()),
  inputSummary: v.optional(v.string()),
  maxCostCents: v.optional(v.number()),
  maxRetries: v.optional(v.number()),
};

export const listForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    status: v.optional(
      v.union(
        v.literal("queued"),
        v.literal("running"),
        v.literal("succeeded"),
        v.literal("failed"),
        v.literal("canceled")
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

    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
    const jobs = await ctx.db
      .query("aiJobs")
      .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .take(limit);

    return jobs.filter((job) => (args.status ? job.status === args.status : true));
  },
});

export const get = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    aiJobId: v.id("aiJobs"),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read"
    );

    const job = await ctx.db.get(args.aiJobId);
    if (
      !job ||
      job.householdId !== args.householdId ||
      job.moveId !== args.moveId
    ) {
      return null;
    }

    return job;
  },
});

export const create = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    ...aiJobWriteArgs,
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit"
    );
    if (actor.type !== "user") {
      throw new Error("API-key AI job creation is not implemented yet.");
    }

    await assertAiUsageAllowed(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      userId: actor.userId,
      inputSizeBytes:
        typeof args.inputSummary === "string" ? args.inputSummary.length : 0,
      estimatedCents: estimatedCentsForDeterministicJob(args.maxCostCents),
    });

    const now = Date.now();
    const aiJobId = await ctx.db.insert("aiJobs", {
      householdId: args.householdId,
      moveId: args.moveId,
      type: args.type,
      status: "queued",
      modality: args.modality,
      provider: normalizeProvider(args.provider),
      model: normalizeOptionalText(args.model) ?? "mock-model",
      inputRef: args.inputRef,
      inputSummary: normalizeOptionalText(args.inputSummary),
      reviewStatus: "unreviewed",
      maxCostCents: args.maxCostCents,
      retryCount: 0,
      maxRetries: Math.min(Math.max(args.maxRetries ?? 1, 0), 5),
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "ai",
      action: "ai_job.created",
      objectTable: "aiJobs",
      objectId: aiJobId,
      metadata: {
        type: args.type,
        provider: normalizeProvider(args.provider),
        model: normalizeOptionalText(args.model) ?? "mock-model",
      },
    });

    return aiJobId;
  },
});

export const cancel = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    aiJobId: v.id("aiJobs"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit"
    );
    if (actor.type !== "user") {
      throw new Error("API-key AI job cancellation is not implemented yet.");
    }

    const job = await getMutableJob(ctx, args);
    if (!["queued", "running", "failed"].includes(job.status)) {
      throw new Error("AI job cannot be canceled from its current status.");
    }

    const now = Date.now();
    await ctx.db.patch(args.aiJobId, {
      status: "canceled",
      canceledAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "ai",
      action: "ai_job.canceled",
      objectTable: "aiJobs",
      objectId: args.aiJobId,
      metadata: { previousStatus: job.status },
    });
  },
});

export const markReviewed = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    aiJobId: v.id("aiJobs"),
    reviewStatus: aiJobReviewStatusValidator,
    confidence: v.optional(estimateConfidenceValidator),
    outputRef: v.optional(v.any()),
    outputSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit"
    );
    if (actor.type !== "user") {
      throw new Error("API-key AI job review is not implemented yet.");
    }

    const job = await getMutableJob(ctx, args);
    if (job.status !== "succeeded") {
      throw new Error("Only completed AI jobs can be reviewed.");
    }

    const now = Date.now();
    await ctx.db.patch(args.aiJobId, {
      reviewStatus: args.reviewStatus,
      confidence: args.confidence ?? job.confidence,
      outputRef: args.outputRef ?? job.outputRef,
      outputSummary:
        normalizeOptionalText(args.outputSummary) ?? job.outputSummary,
      reviewedByUserId: actor.userId,
      reviewedAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "ai",
      action: "ai_job.reviewed",
      objectTable: "aiJobs",
      objectId: args.aiJobId,
      metadata: { reviewStatus: args.reviewStatus },
    });
  },
});

export const execute = action({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    aiJobId: v.id("aiJobs"),
    maxOutputTokens: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"aiJobs">> => {
    const job = await ctx.runMutation(internal.aiJobs.startExecution, args);
    try {
      const result = await runAiProvider({
        jobId: args.aiJobId,
        type: job.type,
        modality: job.modality,
        provider: job.provider,
        model: job.model,
        inputRef: job.inputRef,
        inputSummary: job.inputSummary,
        maxOutputTokens: args.maxOutputTokens,
        maxCostCents: job.maxCostCents,
      });

      const aiJobId = await ctx.runMutation(internal.aiJobs.completeExecution, {
        householdId: args.householdId,
        moveId: args.moveId,
        aiJobId: args.aiJobId,
        outputRef: result.outputRef,
        outputSummary: result.outputSummary,
        confidence: result.confidence,
        tokenUsage: result.tokenUsage,
        cost: result.cost,
        providerMetadata: result.providerMetadata,
      });
      return aiJobId;
    } catch (error) {
      await ctx.runMutation(internal.aiJobs.failExecution, {
        householdId: args.householdId,
        moveId: args.moveId,
        aiJobId: args.aiJobId,
        error: error instanceof Error ? error.message : "AI job failed.",
      });
      throw error;
    }
  },
});

export const startExecution = internalMutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    aiJobId: v.id("aiJobs"),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit"
    );
    const job = await getMutableJob(ctx, args);
    if (job.status !== "queued" && job.status !== "failed") {
      throw new Error("AI job is not ready to execute.");
    }
    if (job.status === "failed" && job.retryCount >= job.maxRetries) {
      throw new Error("AI job retry limit has been reached.");
    }

    const now = Date.now();
    await ctx.db.patch(args.aiJobId, {
      status: "running",
      retryCount: job.status === "failed" ? job.retryCount + 1 : job.retryCount,
      error: undefined,
      startedAt: now,
      updatedAt: now,
    });

    return job;
  },
});

export const completeExecution = internalMutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    aiJobId: v.id("aiJobs"),
    outputRef: v.optional(v.any()),
    outputSummary: v.optional(v.string()),
    confidence: estimateConfidenceValidator,
    tokenUsage: v.optional(
      v.object({
        inputTokens: v.optional(v.number()),
        outputTokens: v.optional(v.number()),
        totalTokens: v.optional(v.number()),
      })
    ),
    cost: v.optional(
      v.object({
        estimatedCents: v.optional(v.number()),
        actualCents: v.optional(v.number()),
        currency: v.string(),
      })
    ),
    providerMetadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit"
    );
    const job = await getMutableJob(ctx, args);
    if (job.status !== "running") {
      throw new Error("AI job is not running.");
    }

    const now = Date.now();
    await ctx.db.patch(args.aiJobId, {
      status: "succeeded",
      outputRef: args.outputRef,
      outputSummary: normalizeOptionalText(args.outputSummary),
      confidence: args.confidence,
      tokenUsage: args.tokenUsage,
      cost: args.cost,
      providerMetadata: args.providerMetadata,
      completedAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "system",
      category: "ai",
      action: "ai_job.succeeded",
      objectTable: "aiJobs",
      objectId: args.aiJobId,
      metadata: {
        type: job.type,
        provider: job.provider,
        model: job.model,
        tokenUsage: args.tokenUsage,
        cost: args.cost,
      },
    });

    return args.aiJobId;
  },
});

export const failExecution = internalMutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    aiJobId: v.id("aiJobs"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit"
    );
    const job = await getMutableJob(ctx, args);
    const now = Date.now();
    await ctx.db.patch(args.aiJobId, {
      status: "failed",
      error: normalizeOptionalText(args.error),
      completedAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "system",
      category: "ai",
      action: "ai_job.failed",
      objectTable: "aiJobs",
      objectId: args.aiJobId,
      metadata: {
        type: job.type,
        provider: job.provider,
        model: job.model,
        error: args.error,
      },
    });
  },
});

async function getMutableJob(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    aiJobId: Id<"aiJobs">;
  }
) {
  const job = await ctx.db.get(args.aiJobId);
  if (!job || job.householdId !== args.householdId || job.moveId !== args.moveId) {
    throw new Error("AI job not found.");
  }
  return job;
}

function normalizeProvider(provider: string | undefined) {
  return normalizeOptionalText(provider) ?? "mock";
}

export type AiJobDoc = Doc<"aiJobs">;
