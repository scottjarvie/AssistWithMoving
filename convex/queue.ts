import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  queueContextKindValidator,
  queueDomainKindValidator,
  queuePriorityValidator,
  queueStateLabels,
  queueStateValidator,
  queueWaitingReasonValidator,
  ingestionStatusToQueueState,
  normalizeQueueLimit,
  queueItemMatchesEffectiveState,
} from "./lib/queue";
import {
  createQueueItem,
  finishQueueItemWithoutWork,
  provideQueueInput,
  releaseQueueItem,
  requireQueueItem,
  requireQueueItemVisible,
  shapeQueueItem,
  type QueueAccessActor,
} from "./lib/queueService";
import { requireMovePermission } from "./lib/permissions";
import { canPerformHouseholdAction } from "./lib/roles";
import {
  canViewQueueEntry,
  queueEntryOwnerUserId,
  resolveRunnableQueueOwnerIds,
} from "./lib/queueAccess";

async function resolveWebQueueActor(
  ctx: QueryCtx | MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  action: "queue:read" | "queue:write",
): Promise<QueueAccessActor> {
  const policy = await requireMovePermission(ctx, householdId, moveId, action);
  if (policy.actor.type !== "user") {
    throw new ConvexError("Queue web functions require a signed-in user.");
  }
  const userId = policy.actor.userId;
  const participant = await ctx.db
    .query("moveParticipants")
    .withIndex("by_move_user", (q) =>
      q.eq("moveId", moveId).eq("userId", userId),
    )
    .unique();
  return {
    userId,
    actorType: "user",
    label: "Signed-in user",
    isManager: canPerformHouseholdAction(
      policy.role,
      "household:manage_members",
    ),
    delegatedOwnerIds:
      participant?.status === "active"
        ? (participant.canRunQueueForUserIds ?? [])
        : [],
  };
}

async function validateCreateDirectiveReferences(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    contextKind?: "move" | "room" | "belongings";
    contextRefId?: string;
    domainKind?: "general" | "capture" | "moveQuestion" | "reviewSuggestion" | "export";
    domainRefType?: string;
    domainRefId?: string;
  },
) {
  const sameMove = (record: { householdId: Id<"households">; moveId: Id<"moves"> } | null) =>
    Boolean(
      record &&
        record.householdId === args.householdId &&
        record.moveId === args.moveId,
    );
  if (args.contextRefId) {
    if ((args.contextKind ?? "move") === "move") {
      if (args.contextRefId !== args.moveId) {
        throw new ConvexError("Move context reference must be the selected move.");
      }
    } else if (args.contextKind === "room") {
      const room = await ctx.db.get(args.contextRefId as Id<"moveSpaces">);
      if (!sameMove(room)) throw new ConvexError("Room context does not belong to this move.");
    } else {
      const [item, box] = await Promise.all([
        ctx.db.get(args.contextRefId as Id<"items">),
        ctx.db.get(args.contextRefId as Id<"boxes">),
      ]);
      if (!sameMove(item) && !sameMove(box)) {
        throw new ConvexError("Belongings context does not belong to this move.");
      }
    }
  }
  if (Boolean(args.domainRefType) !== Boolean(args.domainRefId)) {
    throw new ConvexError("Domain references require both type and id.");
  }
  if (!args.domainRefType || !args.domainRefId) return;
  if (
    args.domainKind === "moveQuestion" &&
    args.domainRefType === "derivedMoveQuestion"
  ) {
    return;
  }
  let record: { householdId: Id<"households">; moveId: Id<"moves"> } | null;
  switch (args.domainRefType) {
    case "ingestionQueueEntries":
      record = await ctx.db.get(args.domainRefId as Id<"ingestionQueueEntries">);
      break;
    case "aiJobs":
      record = await ctx.db.get(args.domainRefId as Id<"aiJobs">);
      break;
    case "aiTextSuggestions":
      record = await ctx.db.get(args.domainRefId as Id<"aiTextSuggestions">);
      break;
    case "aiPhotoSuggestions":
      record = await ctx.db.get(args.domainRefId as Id<"aiPhotoSuggestions">);
      break;
    case "aiPlanningSuggestions":
      record = await ctx.db.get(args.domainRefId as Id<"aiPlanningSuggestions">);
      break;
    case "exportJobs":
      record = await ctx.db.get(args.domainRefId as Id<"exportJobs">);
      break;
    case "items":
      record = await ctx.db.get(args.domainRefId as Id<"items">);
      break;
    case "boxes":
      record = await ctx.db.get(args.domainRefId as Id<"boxes">);
      break;
    case "moveSpaces":
      record = await ctx.db.get(args.domainRefId as Id<"moveSpaces">);
      break;
    case "floorPlans":
      record = await ctx.db.get(args.domainRefId as Id<"floorPlans">);
      break;
    case "planProposals":
      record = await ctx.db.get(args.domainRefId as Id<"planProposals">);
      break;
    default:
      throw new ConvexError("Unsupported Queue domain reference type.");
  }
  if (!sameMove(record)) {
    throw new ConvexError("Queue domain reference does not belong to this move.");
  }
}

export const listForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    state: v.optional(queueStateValidator),
    ownerUserId: v.optional(v.id("users")),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveWebQueueActor(
      ctx,
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
    const search = args.search?.trim();
    let page;
    if (search) {
      page = await ctx.db
        .query("queueItems")
        .withSearchIndex("search_directive", (q) => {
          let searchQuery = q.search("directive", search).eq("moveId", args.moveId);
          if (ownerUserId) {
            searchQuery = searchQuery.eq("ownerUserId", ownerUserId);
          }
          return searchQuery;
        })
        .paginate({ cursor: args.cursor ?? null, numItems: limit });
    } else if (ownerUserId) {
      page = await ctx.db
        .query("queueItems")
        .withIndex("by_move_owner_updated", (q) =>
          q.eq("moveId", args.moveId).eq("ownerUserId", ownerUserId),
        )
        .order("desc")
        .paginate({ cursor: args.cursor ?? null, numItems: limit });
    } else {
      page = await ctx.db
        .query("queueItems")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .order("desc")
        .paginate({ cursor: args.cursor ?? null, numItems: limit });
    }
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
      stateLabels: queueStateLabels,
      runnableOwnerIds,
      defaultOwnerUserId: ownerUserId,
    };
  },
});

export const listCaptureAdapter = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveWebQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "queue:read",
    );
    const page = await ctx.db
      .query("ingestionQueueEntries")
      .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .paginate({
        cursor: args.cursor ?? null,
        numItems: normalizeQueueLimit(args.limit),
      });
    const now = Date.now();
    return {
      items: page.page
        .filter((entry) =>
          canViewQueueEntry({
            actorUserId: actor.userId,
            ownerUserId: queueEntryOwnerUserId(entry),
            isManager: actor.isManager,
            delegatedOwnerIds: actor.delegatedOwnerIds,
          }),
        )
        .map((entry) => {
          const state = ingestionStatusToQueueState(
            entry.status,
            entry.claimExpiresAt,
            now,
          );
          return {
            adapter: "legacyCapture" as const,
            domainRef: {
              kind: "capture" as const,
              refType: "ingestionQueueEntries",
              refId: entry._id,
            },
            ownerUserId: queueEntryOwnerUserId(entry),
            directive: entry.instructions ?? entry.targetLabel ?? "Review this capture",
            state,
            stateLabel: queueStateLabels[state],
            legacyStatus: entry.status,
            requiredAction:
              state === "needsYou"
                ? (entry.agentQuestion ??
                  (entry.status === "processed"
                    ? "Review the captured result and mark it resolved or requeue it."
                    : "Review this capture."))
                : null,
            nextStep:
              state === "working"
                ? "Process this capture into durable move records."
                : null,
            resultSummary: entry.agentSummary ?? null,
            resultRefs: entry.resultRefs ?? [],
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
          };
        }),
      cursor: page.continueCursor,
      isDone: page.isDone,
      migrationRequired: false,
    };
  },
});

export const get = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    queueItemId: v.id("queueItems"),
  },
  handler: async (ctx, args) => {
    const actor = await resolveWebQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "queue:read",
    );
    const item = await requireQueueItem(ctx, args);
    requireQueueItemVisible(actor, item);
    return shapeQueueItem(item);
  },
});

export const listActivity = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    queueItemId: v.id("queueItems"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveWebQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "queue:read",
    );
    const item = await requireQueueItem(ctx, args);
    requireQueueItemVisible(actor, item);
    const page = await ctx.db
      .query("queueActivities")
      .withIndex("by_item_created", (q) => q.eq("queueItemId", item._id))
      .order("desc")
      .paginate({
        cursor: args.cursor ?? null,
        numItems: normalizeQueueLimit(args.limit),
      });
    return {
      activities: page.page.map((activity) => ({
        activityId: activity._id,
        type: activity.type,
        actor: {
          type: activity.actorType,
          label: activity.actorLabel ?? null,
        },
        fromState: activity.fromState ?? null,
        toState: activity.toState,
        message: activity.message,
        failureCode: activity.failureCode ?? null,
        resultRefCount: activity.resultRefCount ?? null,
        createdAt: activity.createdAt,
      })),
      cursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const createDirective = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    ownerUserId: v.optional(v.id("users")),
    directive: v.string(),
    summary: v.optional(v.string()),
    priority: v.optional(queuePriorityValidator),
    contextKind: v.optional(queueContextKindValidator),
    contextRefId: v.optional(v.string()),
    contextLabel: v.optional(v.string()),
    domainKind: v.optional(queueDomainKindValidator),
    domainRefType: v.optional(v.string()),
    domainRefId: v.optional(v.string()),
    waitingReason: v.optional(queueWaitingReasonValidator),
    expiresAt: v.optional(v.number()),
    maxAttempts: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveWebQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "queue:write",
    );
    if (args.ownerUserId !== undefined) {
      const allowedOwnerIds = await resolveRunnableQueueOwnerIds(
        ctx,
        args.householdId,
        args.moveId,
        actor,
      );
      if (!allowedOwnerIds.includes(args.ownerUserId)) {
        throw new ConvexError(
          "Queue work can only be assigned to an active person on this move.",
        );
      }
    }
    await validateCreateDirectiveReferences(ctx, args);
    return shapeQueueItem(await createQueueItem(ctx, actor, args));
  },
});

export const provideInput = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    queueItemId: v.id("queueItems"),
    response: v.string(),
    aiConnectionRequired: v.optional(v.boolean()),
    expectedVersion: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveWebQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "queue:write",
    );
    return shapeQueueItem(await provideQueueInput(ctx, actor, args));
  },
});

export const cancel = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    queueItemId: v.id("queueItems"),
    reason: v.string(),
    expectedVersion: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveWebQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "queue:write",
    );
    return shapeQueueItem(
      await finishQueueItemWithoutWork(ctx, actor, {
        ...args,
        terminalReason: "canceled",
      }),
    );
  },
});

// Bounded maintenance for two distinct clocks: a claim lease only releases
// active work; an item expiry closes the handoff as Done/expired. Both append
// user-readable activity instead of changing state invisibly.
export const maintainLeasesAndExpiry = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const [expiredClaims, expiredItems] = await Promise.all([
      ctx.db
        .query("queueItems")
        .withIndex("by_state_claim_expiry", (q) =>
          q.eq("state", "working").lt("claimExpiresAt", now),
        )
        .take(100),
      ctx.db
        .query("queueItems")
        .withIndex("by_expiry", (q) =>
          q.gt("expiresAt", undefined).lt("expiresAt", now),
        )
        .take(100),
    ]);
    let released = 0;
    let expired = 0;
    for (const item of expiredClaims) {
      const systemActor: QueueAccessActor = {
        userId: item.ownerUserId,
        actorType: "system",
        label: "Queue lease maintenance",
        isManager: true,
        delegatedOwnerIds: [],
      };
      await releaseQueueItem(ctx, systemActor, {
        householdId: item.householdId,
        moveId: item.moveId,
        queueItemId: item._id,
        reason: "The previous claim lease expired; the handoff is available again.",
        expectedVersion: item.version,
        idempotencyKey: `claim-expired:${item.claimExpiresAt}`,
      });
      released += 1;
    }
    for (const item of expiredItems) {
      if (item.state === "done") continue;
      const current = await ctx.db.get(item._id);
      if (!current || current.state === "done") continue;
      const systemActor: QueueAccessActor = {
        userId: current.ownerUserId,
        actorType: "system",
        label: "Queue expiry maintenance",
        isManager: true,
        delegatedOwnerIds: [],
      };
      await finishQueueItemWithoutWork(ctx, systemActor, {
        householdId: current.householdId,
        moveId: current.moveId,
        queueItemId: current._id,
        reason: "This handoff reached its configured expiry without completion.",
        terminalReason: "expired",
        expectedVersion: current.version,
        idempotencyKey: `item-expired:${current.expiresAt}`,
      });
      expired += 1;
    }
    return { released, expired };
  },
});

// Compile-time guard: adapters intentionally accept the existing domain row.
export type LegacyCaptureQueueRow = Doc<"ingestionQueueEntries">;
