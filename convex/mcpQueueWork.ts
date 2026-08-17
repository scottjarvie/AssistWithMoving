/**
 * Canonical Queue workflow for a connected AI.
 *
 * These are the operations that turn "your AI can read your move" into "you can
 * hand your AI a job and get it back finished". They exist separately from
 * `convex/mcpToolsCanonicalQueue.ts` — which serves the legacy `/mcp/connect`
 * gateway and keeps working untouched — because this door has a different and
 * stricter contract:
 *
 *  - authority comes from a `moving.queue.work` grant re-read on every call,
 *    never from the Queue text and never from the OAuth token;
 *  - the household is derived from the move, so a client naming a `moveId` can
 *    never name someone else's tenant along with it;
 *  - the four person-facing states stay exactly as they are — Needs you,
 *    Working, Waiting for your AI, Done. Leases and retries stay operational
 *    details the person never has to learn.
 *
 * A missing grant does not become a Needs you question here, because that would
 * let an AI create work for a person out of a permission failure. The refusal
 * goes back to the AI with the smallest exact thing to ask for.
 */
import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  mcpError,
  mcpPrincipalValidator,
  requireMcpMove,
  type McpPrincipal,
} from "./lib/mcpGrantAccess";
import { canPerformHouseholdAction } from "./lib/roles";
import {
  effectiveQueueState,
  normalizeQueueLimit,
  queueResultRefValidator,
  queueStateLabels,
} from "./lib/queue";
import {
  claimQueueItem as claimQueueItemRecord,
  completeQueueItem as completeQueueItemRecord,
  releaseQueueItem as releaseQueueItemRecord,
  requestQueueInput as requestQueueInputRecord,
  requireQueueItem,
  shapeQueueItem,
  type QueueAccessActor,
} from "./lib/queueService";
import {
  canViewQueueEntry,
  queueManagerRecoveryAllowed,
  resolveRunnableQueueOwnerIds,
} from "./lib/queueAccess";

const MAX_WORK_ROWS = 25;

/**
 * Build the Queue actor for a connected AI.
 *
 * `actorType: "agent"` is what makes the resulting activity row read as "your
 * AI did this" rather than "you did this" in the ordinary Queue history. The
 * label carries the client's self-reported name so the person can tell two
 * connected AIs apart, and it is a label only.
 */
async function queueActorFor(
  ctx: QueryCtx | MutationCtx,
  principal: McpPrincipal,
  moveId: Id<"moves">,
  action: "queue:read" | "queue:run",
): Promise<{
  actor: QueueAccessActor;
  householdId: Id<"households">;
  grantId: Id<"aiGrants">;
}> {
  const { move, policy, grant } = await requireMcpMove(
    ctx,
    principal,
    moveId,
    action,
    "moving.queue.work",
  );
  const participant = await ctx.db
    .query("moveParticipants")
    .withIndex("by_move_user", (q) =>
      q.eq("moveId", moveId).eq("userId", policy.actor.userId),
    )
    .unique();
  return {
    householdId: move.householdId,
    grantId: grant._id,
    actor: {
      userId: policy.actor.userId,
      actorType: "agent",
      label: principal.clientName?.slice(0, 80) ?? "Your AI",
      isManager: queueManagerRecoveryAllowed({
        actorType: "agent",
        hasManagerRole: canPerformHouseholdAction(
          policy.role,
          "household:manage_members",
        ),
      }),
      delegatedOwnerIds:
        participant?.status === "active"
          ? (participant.canRunQueueForUserIds ?? [])
          : [],
    },
  };
}

/** Turn a queueService ConvexError into the MCP recovery envelope. */
function asMcpQueueError(error: unknown): never {
  if (error instanceof ConvexError) {
    const raw = typeof error.data === "string" ? error.data : String(error.message);
    if (raw.includes("MCP_MOVING_ERROR:")) throw error;
    mcpError(
      "QUEUE_CONFLICT",
      raw,
      "Re-read the handoff with list_queue_work and retry with its current version.",
    );
  }
  mcpError(
    "QUEUE_CONFLICT",
    "That Queue handoff could not be changed.",
    "Re-read the handoff with list_queue_work and retry with its current version.",
  );
}

const commandArgs = {
  principal: mcpPrincipalValidator,
  moveId: v.id("moves"),
  queueItemId: v.id("queueItems"),
  expectedVersion: v.number(),
  operationId: v.string(),
};

/**
 * The work actually waiting for this AI.
 *
 * "Actionable" means Waiting for your AI — accepted by the person, not
 * currently being run by anyone. Items in Needs you are waiting on the person
 * and are deliberately absent: an AI seeing them would be tempted to answer a
 * question the person was asked.
 */
export const listQueueWork = internalQuery({
  args: {
    principal: mcpPrincipalValidator,
    moveId: v.id("moves"),
    includeMine: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { actor, householdId } = await queueActorFor(
      ctx,
      args.principal,
      args.moveId,
      "queue:read",
    );
    const runnableOwnerIds = await resolveRunnableQueueOwnerIds(
      ctx,
      householdId,
      args.moveId,
      actor,
    );
    const limit = Math.min(
      normalizeQueueLimit(args.limit ?? MAX_WORK_ROWS),
      MAX_WORK_ROWS,
    );
    const now = Date.now();
    const rows = await ctx.db
      .query("queueItems")
      .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .take(MAX_WORK_ROWS * 4);

    const actionable = rows
      .filter((item) =>
        canViewQueueEntry({
          actorUserId: actor.userId,
          ownerUserId: item.ownerUserId,
          isManager: actor.isManager,
          delegatedOwnerIds: actor.delegatedOwnerIds,
        }),
      )
      .filter((item) => runnableOwnerIds.includes(item.ownerUserId))
      .filter((item) => {
        const state = effectiveQueueState(item, now);
        if (state === "waitingForAi") return true;
        // Resuming work this same connection already holds is normal; picking
        // up someone else's live claim is not.
        return (
          args.includeMine === true &&
          state === "working" &&
          item.claimedByUserId === actor.userId
        );
      })
      .slice(0, limit)
      .map((item) => {
        const shaped = shapeQueueItem(item, now);
        return {
          ...shaped,
          // The version is what a claim must echo back, so surface it plainly
          // rather than making the AI guess where optimistic concurrency lives.
          claimWith: {
            queueItemId: item._id,
            expectedVersion: item.version,
          },
        };
      });

    return {
      moveId: args.moveId,
      work: actionable,
      states: queueStateLabels,
      next: actionable.length
        ? "Claim one handoff, do the work, then save it with save_complete_result and complete_queue_work."
        : "Nothing is waiting for your AI on this move right now.",
      note: "Needs you items are waiting on the person and are not listed here.",
    };
  },
});

export const claimQueueWork = internalMutation({
  args: { ...commandArgs, nextStep: v.string() },
  handler: async (ctx, args) => {
    const { actor, householdId, grantId } = await queueActorFor(
      ctx,
      args.principal,
      args.moveId,
      "queue:run",
    );
    try {
      const item = await claimQueueItemRecord(ctx, actor, {
        householdId,
        moveId: args.moveId,
        queueItemId: args.queueItemId,
        nextStep: args.nextStep,
        expectedVersion: args.expectedVersion,
        idempotencyKey: args.operationId,
      });
      return { queue: shapeQueueItem(item), grantId };
    } catch (error) {
      asMcpQueueError(error);
    }
  },
});

export const releaseQueueWork = internalMutation({
  args: { ...commandArgs, reason: v.string() },
  handler: async (ctx, args) => {
    const { actor, householdId, grantId } = await queueActorFor(
      ctx,
      args.principal,
      args.moveId,
      "queue:run",
    );
    try {
      const item = await releaseQueueItemRecord(ctx, actor, {
        householdId,
        moveId: args.moveId,
        queueItemId: args.queueItemId,
        reason: args.reason,
        expectedVersion: args.expectedVersion,
        idempotencyKey: args.operationId,
      });
      return { queue: shapeQueueItem(item), grantId };
    } catch (error) {
      asMcpQueueError(error);
    }
  },
});

/**
 * Ask the person the smallest question that unblocks the work.
 *
 * This is the honest alternative to guessing. It moves the handoff to Needs
 * you with one specific thing to answer, rather than saving a result built on
 * an assumption nobody agreed to.
 */
export const askQueueQuestion = internalMutation({
  args: { ...commandArgs, question: v.string() },
  handler: async (ctx, args) => {
    const { actor, householdId, grantId } = await queueActorFor(
      ctx,
      args.principal,
      args.moveId,
      "queue:run",
    );
    try {
      const item = await requestQueueInputRecord(ctx, actor, {
        householdId,
        moveId: args.moveId,
        queueItemId: args.queueItemId,
        requiredAction: args.question,
        expectedVersion: args.expectedVersion,
        idempotencyKey: args.operationId,
      });
      return { queue: shapeQueueItem(item), grantId };
    } catch (error) {
      asMcpQueueError(error);
    }
  },
});

export const completeQueueWork = internalMutation({
  args: {
    ...commandArgs,
    resultSummary: v.optional(v.string()),
    resultRefs: v.optional(v.array(queueResultRefValidator)),
  },
  handler: async (ctx, args) => {
    const { actor, householdId, grantId } = await queueActorFor(
      ctx,
      args.principal,
      args.moveId,
      "queue:run",
    );
    try {
      const item = await completeQueueItemRecord(ctx, actor, {
        householdId,
        moveId: args.moveId,
        queueItemId: args.queueItemId,
        resultSummary: args.resultSummary,
        resultRefs: args.resultRefs,
        expectedVersion: args.expectedVersion,
        idempotencyKey: args.operationId,
      });
      await recordAuditEvent(ctx, {
        householdId,
        moveId: args.moveId,
        actorType: "agent",
        actorUserId: actor.userId,
        category: "queue",
        action: "mcp.queue_completed",
        objectTable: "queueItems",
        objectId: args.queueItemId,
        metadata: {
          clientId: args.principal.clientId,
          operationId: args.operationId,
          grantId,
        },
      });
      return { queue: shapeQueueItem(item), grantId };
    } catch (error) {
      asMcpQueueError(error);
    }
  },
});

/**
 * Complete a Queue handoff as part of a save, without a second approval.
 *
 * Used by `save_complete_result` when the AI holds `moving.queue.work` and the
 * person asked for one finished pass. Failing to transition is not fatal — the
 * result is already durably saved, and reporting a partial truth beats
 * discarding good work — so the caller records what actually happened.
 */
export async function completeQueueForResult(
  ctx: MutationCtx,
  principal: McpPrincipal,
  input: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    queueItemId: Id<"queueItems">;
    resultSummary: string;
    resultRef: { type: string; id: string; label?: string };
    operationId: string;
    userId: Id<"users">;
    isManager: boolean;
    delegatedOwnerIds: Id<"users">[];
  },
) {
  const actor: QueueAccessActor = {
    userId: input.userId,
    actorType: "agent",
    label: principal.clientName?.slice(0, 80) ?? "Your AI",
    isManager: input.isManager,
    delegatedOwnerIds: input.delegatedOwnerIds,
  };
  const item = await requireQueueItem(ctx, {
    householdId: input.householdId,
    moveId: input.moveId,
    queueItemId: input.queueItemId,
  });
  const completed = await completeQueueItemRecord(ctx, actor, {
    householdId: input.householdId,
    moveId: input.moveId,
    queueItemId: input.queueItemId,
    resultSummary: input.resultSummary,
    resultRefs: [input.resultRef],
    expectedVersion: item.version,
    idempotencyKey: `${input.operationId}:queue-complete`,
  });
  return shapeQueueItem(completed);
}
