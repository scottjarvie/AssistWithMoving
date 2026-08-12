import { ConvexError, v } from "convex/values";
import { mcpCallerValidator } from "convex-mcp-gateway";

import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  normalizeQueueLimit,
  queueItemMatchesEffectiveState,
  queueResultRefValidator,
  queueStateLabels,
  queueStateValidator,
} from "./lib/queue";
import { requireMoveForSubject } from "./lib/mcpIdentity";
import { canPerformHouseholdAction } from "./lib/roles";
import {
  claimQueueItem as claimQueueItemRecord,
  completeQueueItem as completeQueueItemRecord,
  releaseQueueItem as releaseQueueItemRecord,
  reportQueueFailure as reportQueueFailureRecord,
  requestQueueInput as requestQueueInputRecord,
  requireQueueItem,
  requireQueueItemVisible,
  shapeQueueItem,
  type QueueAccessActor,
} from "./lib/queueService";
import {
  canViewQueueEntry,
  queueManagerRecoveryAllowed,
  resolveRunnableQueueOwnerIds,
} from "./lib/queueAccess";

async function resolveQueueSubject(
  ctx: QueryCtx | MutationCtx,
  caller: { subject: string | null },
  householdId: Id<"households">,
  moveId: Id<"moves">,
  action: "queue:read" | "queue:run",
): Promise<QueueAccessActor> {
  const policy = await requireMoveForSubject(
    ctx,
    caller.subject,
    householdId,
    moveId,
    action,
  );
  const participant = await ctx.db
    .query("moveParticipants")
    .withIndex("by_move_user", (q) =>
      q.eq("moveId", moveId).eq("userId", policy.actor.userId),
    )
    .unique();
  return {
    userId: policy.actor.userId,
    actorType: "agent",
    label: "Connected AI",
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
  };
}

const identityAndMoveArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
};

export const listQueueItemsArgs = {
  ...identityAndMoveArgs,
  state: v.optional(queueStateValidator),
  ownerUserId: v.optional(v.id("users")),
  limit: v.optional(v.number()),
  cursor: v.optional(v.string()),
};

export const listQueueItems = internalQuery({
  args: listQueueItemsArgs,
  handler: async (ctx, args) => {
    const actor = await resolveQueueSubject(
      ctx,
      args.caller,
      args.householdId,
      args.moveId,
      "queue:read",
    );
    const runnableOwnerIds = await resolveRunnableQueueOwnerIds(
      ctx,
      args.householdId,
      args.moveId,
      actor,
    );
    const ownerUserId = args.ownerUserId ?? (actor.isManager ? undefined : actor.userId);
    if (ownerUserId && !runnableOwnerIds.includes(ownerUserId)) {
      throw new ConvexError("You cannot view this Queue owner's items.");
    }
    const limit = normalizeQueueLimit(args.limit);
    const page = ownerUserId
        ? await ctx.db
            .query("queueItems")
            .withIndex("by_move_owner_updated", (q) =>
              q.eq("moveId", args.moveId).eq("ownerUserId", ownerUserId),
            )
            .order("desc")
            .paginate({ cursor: args.cursor ?? null, numItems: limit })
      : await ctx.db
            .query("queueItems")
            .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
            .order("desc")
            .paginate({ cursor: args.cursor ?? null, numItems: limit });
    const now = Date.now();
    return {
      items: page.page
        .filter((item) => {
          if (ownerUserId && item.ownerUserId !== ownerUserId) return false;
          if (!queueItemMatchesEffectiveState(item, args.state, now)) return false;
          return canViewQueueEntry({
            actorUserId: actor.userId,
            ownerUserId: item.ownerUserId,
            isManager: actor.isManager,
            delegatedOwnerIds: actor.delegatedOwnerIds,
          });
        })
        .map((item) => shapeQueueItem(item, now)),
      cursor: page.continueCursor,
      isDone: page.isDone,
      states: queueStateLabels,
      runnableOwnerIds,
      defaultOwnerUserId: ownerUserId,
      note:
        "Waiting for your AI means accepted but not currently running. Claim an item before doing work.",
    };
  },
});

export const getQueueItemArgs = {
  ...identityAndMoveArgs,
  queueItemId: v.id("queueItems"),
  activityLimit: v.optional(v.number()),
};

export const getQueueItem = internalQuery({
  args: getQueueItemArgs,
  handler: async (ctx, args) => {
    const actor = await resolveQueueSubject(
      ctx,
      args.caller,
      args.householdId,
      args.moveId,
      "queue:read",
    );
    const item = await requireQueueItem(ctx, args);
    requireQueueItemVisible(actor, item);
    const activities = await ctx.db
      .query("queueActivities")
      .withIndex("by_item_created", (q) => q.eq("queueItemId", item._id))
      .order("desc")
      .take(normalizeQueueLimit(args.activityLimit ?? 25));
    return {
      item: shapeQueueItem(item),
      activities: activities.map((activity) => ({
        type: activity.type,
        actorType: activity.actorType,
        actorLabel: activity.actorLabel ?? null,
        fromState: activity.fromState ?? null,
        toState: activity.toState,
        message: activity.message,
        createdAt: activity.createdAt,
      })),
    };
  },
});

const commandArgs = {
  ...identityAndMoveArgs,
  queueItemId: v.id("queueItems"),
  expectedVersion: v.number(),
  idempotencyKey: v.string(),
};

export const claimQueueItemArgs = {
  ...commandArgs,
  nextStep: v.string(),
};
export const claimQueueItem = internalMutation({
  args: claimQueueItemArgs,
  handler: async (ctx, args) => {
    const actor = await resolveQueueSubject(
      ctx,
      args.caller,
      args.householdId,
      args.moveId,
      "queue:run",
    );
    return shapeQueueItem(await claimQueueItemRecord(ctx, actor, args));
  },
});

export const releaseQueueItemArgs = { ...commandArgs, reason: v.string() };
export const releaseQueueItem = internalMutation({
  args: releaseQueueItemArgs,
  handler: async (ctx, args) => {
    const actor = await resolveQueueSubject(
      ctx,
      args.caller,
      args.householdId,
      args.moveId,
      "queue:run",
    );
    return shapeQueueItem(await releaseQueueItemRecord(ctx, actor, args));
  },
});

export const requestQueueInputArgs = {
  ...commandArgs,
  requiredAction: v.string(),
};
export const requestQueueInput = internalMutation({
  args: requestQueueInputArgs,
  handler: async (ctx, args) => {
    const actor = await resolveQueueSubject(
      ctx,
      args.caller,
      args.householdId,
      args.moveId,
      "queue:run",
    );
    return shapeQueueItem(await requestQueueInputRecord(ctx, actor, args));
  },
});

export const completeQueueItemArgs = {
  ...commandArgs,
  resultSummary: v.optional(v.string()),
  resultRefs: v.optional(v.array(queueResultRefValidator)),
};
export const completeQueueItem = internalMutation({
  args: completeQueueItemArgs,
  handler: async (ctx, args) => {
    const actor = await resolveQueueSubject(
      ctx,
      args.caller,
      args.householdId,
      args.moveId,
      "queue:run",
    );
    return shapeQueueItem(await completeQueueItemRecord(ctx, actor, args));
  },
});

export const reportQueueFailureArgs = {
  ...commandArgs,
  code: v.string(),
  message: v.string(),
  retryable: v.boolean(),
  retryAfterMs: v.optional(v.number()),
};
export const reportQueueFailure = internalMutation({
  args: reportQueueFailureArgs,
  handler: async (ctx, args) => {
    const actor = await resolveQueueSubject(
      ctx,
      args.caller,
      args.householdId,
      args.moveId,
      "queue:run",
    );
    if (args.retryAfterMs !== undefined && args.retryAfterMs < 0) {
      throw new ConvexError("retryAfterMs cannot be negative.");
    }
    return shapeQueueItem(await reportQueueFailureRecord(ctx, actor, args));
  },
});
