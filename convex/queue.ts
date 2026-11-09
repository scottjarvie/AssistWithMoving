import { queueWorkFilter } from "./lib/queue";
import {
  reviewQueueSuggestion,
  readQueueSuggestions,
} from "./lib/queueService";
import { captureNeedsInput, queueIsWork, queueNeedsInput } from "./lib/queue";
import { requirePersonConnectionManagement } from "./lib/personConnectionManagement";
import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  effectiveQueueState,
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
  releaseExpiredQueueClaim,
  requireQueueItem,
  requireQueueItemVisible,
  shapeQueueItemForRead,
  type QueueAccessActor,
} from "./lib/queueService";
import { requireMovePermission } from "./lib/permissions";
import { canPerformHouseholdAction } from "./lib/roles";
import {
  apiKeyCanReachQueueOwner,
  canViewQueueEntry,
  queueEntryOwnerUserId,
  resolveRunnableQueueOwnerIds,
} from "./lib/queueAccess";

async function getQueueDirectiveReference<
  TableName extends
    | "moveSpaces"
    | "items"
    | "boxes"
    | "ingestionQueueEntries"
    | "aiJobs"
    | "aiTextSuggestions"
    | "aiPhotoSuggestions"
    | "aiPlanningSuggestions"
    | "exportJobs"
    | "floorPlans"
    | "planProposals",
>(ctx: MutationCtx, tableName: TableName, rawId: string) {
  const id = ctx.db.normalizeId(tableName, rawId);
  return id ? await ctx.db.get(id) : null;
}

async function resolveWebQueueActor(
  ctx: QueryCtx | MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  action: "queue:read" | "queue:write",
): Promise<QueueAccessActor> {
  if (action === "queue:write") await requirePersonConnectionManagement(ctx);
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
    domainKind?:
      | "general"
      | "capture"
      | "moveQuestion"
      | "reviewSuggestion"
      | "export";
    domainRefType?: string;
    domainRefId?: string;
  },
) {
  const sameMove = (
    record: { householdId: Id<"households">; moveId: Id<"moves"> } | null,
  ) =>
    Boolean(
      record &&
      record.householdId === args.householdId &&
      record.moveId === args.moveId,
    );
  if (args.contextRefId) {
    if ((args.contextKind ?? "move") === "move") {
      if (args.contextRefId !== args.moveId) {
        throw new ConvexError(
          "Move context reference must be the selected move.",
        );
      }
    } else if (args.contextKind === "room") {
      const room = await getQueueDirectiveReference(
        ctx,
        "moveSpaces",
        args.contextRefId,
      );
      if (!sameMove(room))
        throw new ConvexError("Room context does not belong to this move.");
    } else {
      const [item, box] = await Promise.all([
        getQueueDirectiveReference(ctx, "items", args.contextRefId),
        getQueueDirectiveReference(ctx, "boxes", args.contextRefId),
      ]);
      if (!sameMove(item) && !sameMove(box)) {
        throw new ConvexError(
          "Belongings context does not belong to this move.",
        );
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
      record = await getQueueDirectiveReference(
        ctx,
        "ingestionQueueEntries",
        args.domainRefId,
      );
      break;
    case "aiJobs":
      record = await getQueueDirectiveReference(
        ctx,
        "aiJobs",
        args.domainRefId,
      );
      break;
    case "aiTextSuggestions":
      record = await getQueueDirectiveReference(
        ctx,
        "aiTextSuggestions",
        args.domainRefId,
      );
      break;
    case "aiPhotoSuggestions":
      record = await getQueueDirectiveReference(
        ctx,
        "aiPhotoSuggestions",
        args.domainRefId,
      );
      break;
    case "aiPlanningSuggestions":
      record = await getQueueDirectiveReference(
        ctx,
        "aiPlanningSuggestions",
        args.domainRefId,
      );
      break;
    case "exportJobs":
      record = await getQueueDirectiveReference(
        ctx,
        "exportJobs",
        args.domainRefId,
      );
      break;
    case "items":
      record = await getQueueDirectiveReference(ctx, "items", args.domainRefId);
      break;
    case "boxes":
      record = await getQueueDirectiveReference(ctx, "boxes", args.domainRefId);
      break;
    case "moveSpaces":
      record = await getQueueDirectiveReference(
        ctx,
        "moveSpaces",
        args.domainRefId,
      );
      break;
    case "floorPlans":
      record = await getQueueDirectiveReference(
        ctx,
        "floorPlans",
        args.domainRefId,
      );
      break;
    case "planProposals":
      record = await getQueueDirectiveReference(
        ctx,
        "planProposals",
        args.domainRefId,
      );
      break;
    default:
      throw new ConvexError("Unsupported Queue domain reference type.");
  }
  if (!sameMove(record)) {
    throw new ConvexError(
      "Queue domain reference does not belong to this move.",
    );
  }
}

export const listForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    state: v.optional(queueStateValidator),
    ownerUserId: v.optional(v.id("users")),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
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
    const ownerUserId =
      args.ownerUserId ?? (actor.isManager ? undefined : actor.userId);
    if (ownerUserId && !runnableOwnerIds.includes(ownerUserId)) {
      throw new ConvexError("You cannot view this Queue owner's items.");
    }
    const limit = normalizeQueueLimit(args.paginationOpts.numItems);
    const search = args.search?.trim();
    let page;
    if (search) {
      page = await ctx.db
        .query("queueItems")
        .withSearchIndex("search_directive", (q) => {
          let searchQuery = q
            .search("directive", search)
            .eq("moveId", args.moveId);
          if (ownerUserId) {
            searchQuery = searchQuery.eq("ownerUserId", ownerUserId);
          }
          return searchQuery;
        })
        .filter(queueWorkFilter)
        .paginate({ ...args.paginationOpts, numItems: limit });
    } else if (ownerUserId) {
      page = await ctx.db
        .query("queueItems")
        .withIndex("by_move_owner_updated", (q) =>
          q.eq("moveId", args.moveId).eq("ownerUserId", ownerUserId),
        )
        .order("desc")
        .filter(queueWorkFilter)
        .paginate({ ...args.paginationOpts, numItems: limit });
    } else {
      page = await ctx.db
        .query("queueItems")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .order("desc")
        .filter(queueWorkFilter)
        .paginate({ ...args.paginationOpts, numItems: limit });
    }
    const now = Date.now();
    return {
      ...page,
      page: await Promise.all(
        page.page
          .filter((item) => {
            if (ownerUserId && item.ownerUserId !== ownerUserId) return false;
            if (!queueItemMatchesEffectiveState(item, args.state, now))
              return false;
            return canViewQueueEntry({
              actorUserId: actor.userId,
              ownerUserId: item.ownerUserId,
              isManager: actor.isManager,
              delegatedOwnerIds: actor.delegatedOwnerIds,
            });
          })
          .map(async (item) => await shapeQueueItemForRead(ctx, item, now)),
      ),
    };
  },
});

function shapeCaptureAdapterEntry(
  entry: Doc<"ingestionQueueEntries">,
  now: number,
) {
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
    state:
      state === "needsYou"
        ? entry.status === "processed"
          ? ("done" as const)
          : ("waitingForAi" as const)
        : state,
    needsInput: captureNeedsInput(entry),
    needsInputAt: entry.needsInputAt ?? null,
    needsInputBy: entry.needsInputBy ?? null,
    addedBy: entry.addedBy ?? "person",
    addedByLabel: entry.agentLabel ?? null,
    stateLabel:
      queueStateLabels[
        state === "needsYou"
          ? entry.status === "processed"
            ? "done"
            : "waitingForAi"
          : state
      ],
    legacyStatus: entry.status,
    requiredAction: captureNeedsInput(entry)
      ? (entry.agentQuestion ??
        (entry.status === "processed"
          ? "Review the captured result and mark it resolved or requeue it."
          : "Review this capture."))
      : null,
    nextStep:
      state === "working"
        ? "Process this capture into durable move records."
        : null,
    claim:
      state === "working"
        ? {
            label: entry.claimedByAgentLabel ?? null,
            expiresAt: entry.claimExpiresAt ?? null,
          }
        : null,
    resultSummary: entry.agentSummary ?? null,
    resultRefs: entry.resultRefs ?? [],
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export const listCaptureAdapter = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    ownerUserId: v.optional(v.id("users")),
    state: v.optional(queueStateValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const actor = await resolveWebQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "queue:read",
    );
    const ownerUserId =
      args.ownerUserId ?? (actor.isManager ? undefined : actor.userId);
    if (ownerUserId) {
      const runnableOwnerIds = await resolveRunnableQueueOwnerIds(
        ctx,
        args.householdId,
        args.moveId,
        actor,
      );
      if (!runnableOwnerIds.includes(ownerUserId)) {
        throw new ConvexError("You cannot view this Queue owner's captures.");
      }
    }
    const limit = normalizeQueueLimit(args.paginationOpts.numItems);
    const page = ownerUserId
      ? await ctx.db
          .query("ingestionQueueEntries")
          .withIndex("by_move_owner_created", (q) =>
            q.eq("moveId", args.moveId).eq("ownerUserId", ownerUserId),
          )
          .order("desc")
          .filter((q) => q.neq(q.field("status"), "discarded"))
          .paginate({ ...args.paginationOpts, numItems: limit })
      : await ctx.db
          .query("ingestionQueueEntries")
          .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
          .order("desc")
          .filter((q) => q.neq(q.field("status"), "discarded"))
          .paginate({ ...args.paginationOpts, numItems: limit });
    const now = Date.now();
    return {
      ...page,
      page: page.page
        .filter((entry) => {
          const state = ingestionStatusToQueueState(
            entry.status,
            entry.claimExpiresAt,
            now,
          );
          return (
            (!args.state ||
              (args.state === "needsYou"
                ? captureNeedsInput(entry)
                : (state === "needsYou"
                    ? entry.status === "processed"
                      ? "done"
                      : "waitingForAi"
                    : state) === args.state)) &&
            canViewQueueEntry({
              actorUserId: actor.userId,
              ownerUserId: queueEntryOwnerUserId(entry),
              isManager: actor.isManager,
              delegatedOwnerIds: actor.delegatedOwnerIds,
            })
          );
        })
        .map((entry) => shapeCaptureAdapterEntry(entry, now)),
    };
  },
});

export const listLegacyCaptureAdapter = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    ownerUserId: v.id("users"),
    state: v.optional(queueStateValidator),
    paginationOpts: paginationOptsValidator,
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
    if (!runnableOwnerIds.includes(args.ownerUserId)) {
      throw new ConvexError("You cannot view this Queue owner's captures.");
    }
    const page = await ctx.db
      .query("ingestionQueueEntries")
      .withIndex("by_move_creator_owner_created", (q) =>
        q
          .eq("moveId", args.moveId)
          .eq("createdByUserId", args.ownerUserId)
          .eq("ownerUserId", undefined),
      )
      .order("desc")
      .filter((q) => q.neq(q.field("status"), "discarded"))
      .paginate({
        ...args.paginationOpts,
        numItems: normalizeQueueLimit(args.paginationOpts.numItems),
      });
    const now = Date.now();
    return {
      ...page,
      page: page.page
        .filter((entry) => {
          const state = ingestionStatusToQueueState(
            entry.status,
            entry.claimExpiresAt,
            now,
          );
          return (
            (!args.state ||
              (args.state === "needsYou"
                ? captureNeedsInput(entry)
                : (state === "needsYou"
                    ? entry.status === "processed"
                      ? "done"
                      : "waitingForAi"
                    : state) === args.state)) &&
            canViewQueueEntry({
              actorUserId: actor.userId,
              ownerUserId: queueEntryOwnerUserId(entry),
              isManager: actor.isManager,
              delegatedOwnerIds: actor.delegatedOwnerIds,
            })
          );
        })
        .map((entry) => shapeCaptureAdapterEntry(entry, now)),
    };
  },
});

export const connectionStatus = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    ownerUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const actor = await resolveWebQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "queue:read",
    );
    if (args.ownerUserId) {
      const runnableOwnerIds = await resolveRunnableQueueOwnerIds(
        ctx,
        args.householdId,
        args.moveId,
        actor,
      );
      if (!runnableOwnerIds.includes(args.ownerUserId)) {
        throw new ConvexError(
          "You cannot view this Queue owner's connection status.",
        );
      }
    }
    const [activeKeys, memberships, participants] = await Promise.all([
      ctx.db
        .query("apiKeys")
        .withIndex("by_household_status", (q) =>
          q.eq("householdId", args.householdId).eq("status", "active"),
        )
        .take(100),
      ctx.db
        .query("householdMemberships")
        .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
        .take(200),
      ctx.db
        .query("moveParticipants")
        .withIndex("by_household_move", (q) =>
          q.eq("householdId", args.householdId).eq("moveId", args.moveId),
        )
        .take(200),
    ]);
    const membershipByUser = new Map(
      memberships.map((membership) => [membership.userId, membership]),
    );
    const participantByUser = new Map(
      participants.flatMap((participant) =>
        participant.userId ? [[participant.userId, participant] as const] : [],
      ),
    );
    const now = Date.now();
    return {
      queueCapableApiKeyCount: activeKeys.filter((key) =>
        apiKeyCanReachQueueOwner({
          now,
          key,
          moveId: args.moveId,
          ownerUserId: args.ownerUserId,
          membership: membershipByUser.get(key.createdByUserId),
          participant: participantByUser.get(key.createdByUserId),
        }),
      ).length,
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
    return await shapeQueueItemForRead(ctx, item);
  },
});

export const listActivity = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    queueItemId: v.id("queueItems"),
    paginationOpts: paginationOptsValidator,
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
        ...args.paginationOpts,
        numItems: normalizeQueueLimit(args.paginationOpts.numItems),
      });
    return {
      ...page,
      page: page.page.map((activity) => ({
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
    return await shapeQueueItemForRead(
      ctx,
      await createQueueItem(ctx, actor, args),
    );
  },
});

export const provideInput = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    queueItemId: v.id("queueItems"),
    response: v.string(),
    clearOnly: v.optional(v.boolean()),
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
    return await shapeQueueItemForRead(
      ctx,
      await provideQueueInput(ctx, actor, args),
    );
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
    return await shapeQueueItemForRead(
      ctx,
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
          q
            .eq("state", "working")
            .gt("claimExpiresAt", undefined)
            .lt("claimExpiresAt", now),
        )
        .take(100),
      ctx.db
        .query("queueItems")
        .withIndex("by_expiry", (q) =>
          q.gt("expiresAt", undefined).lt("expiresAt", now),
        )
        .filter(queueWorkFilter)
        .filter((q) => q.neq(q.field("state"), "done"))
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
      await releaseExpiredQueueClaim(ctx, systemActor, {
        householdId: item.householdId,
        moveId: item.moveId,
        queueItemId: item._id,
        reason:
          "The previous claim lease expired; the handoff is available again.",
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
        reason:
          "This handoff reached its configured expiry without completion.",
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

export const suggestionView = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveWebQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "queue:read",
    );
    return readQueueSuggestions(ctx, actor, args);
  },
});
export const reviewSuggestion = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    queueItemId: v.id("queueItems"),
    action: v.union(
      v.literal("accept"),
      v.literal("dismiss"),
      v.literal("restore"),
      v.literal("archive"),
    ),
    directive: v.optional(v.string()),
    optionIndex: v.optional(v.number()),
    reason: v.optional(v.string()),
    expectedVersion: v.number(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await resolveWebQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "queue:write",
    );
    return await shapeQueueItemForRead(
      ctx,
      await reviewQueueSuggestion(ctx, actor, {
        ...args,
        idempotencyKey: args.operationId,
      }),
    );
  },
});
export const counts = query({
  args: { householdId: v.id("households"), moveId: v.id("moves") },
  handler: async (ctx, args) => {
    const actor = await resolveWebQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "queue:read",
    );
    const rows = await ctx.db
      .query("queueItems")
      .withIndex("by_move_owner_updated", (q) =>
        q.eq("moveId", args.moveId).eq("ownerUserId", actor.userId),
      )
      .collect();
    const captures = await ctx.db
      .query("ingestionQueueEntries")
      .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
      .collect();
    const work = rows.filter(queueIsWork);
    const now = Date.now();
    const totals = {
      waitingForAi: 0,
      working: 0,
      done: 0,
      needsYou: 0,
      everything: work.length,
      needsInputOpen: 0,
      suggestions: rows.filter(
        (i) =>
          i.addedBy === "ai_suggestion" &&
          i.suggestionStatus === "open" &&
          i.archivedAt === undefined,
      ).length,
    };
    for (const item of work) {
      totals[
        effectiveQueueState(item, now) as "waitingForAi" | "working" | "done"
      ]++;
      if (queueNeedsInput(item)) {
        totals.needsYou++;
        totals.needsInputOpen++;
      }
    }
    for (const item of captures.filter(
      (i) =>
        (i.ownerUserId ?? i.createdByUserId) === actor.userId &&
        i.status !== "discarded",
    )) {
      const state = ingestionStatusToQueueState(
        item.status,
        item.claimExpiresAt,
        now,
      );
      totals[
        state === "needsYou"
          ? item.status === "processed"
            ? "done"
            : "waitingForAi"
          : state
      ]++;
      totals.everything++;
      if (captureNeedsInput(item)) {
        totals.needsYou++;
        totals.needsInputOpen++;
      }
    }
    return totals;
  },
});
export const archived = query({
  args: { householdId: v.id("households"), moveId: v.id("moves") },
  handler: async (ctx, args) => {
    const actor = await resolveWebQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "queue:read",
    );
    const rows = await ctx.db
      .query("queueItems")
      .withIndex("by_move_owner_updated", (q) =>
        q.eq("moveId", args.moveId).eq("ownerUserId", actor.userId),
      )
      .collect();
    return await Promise.all(
      rows
        .filter((i) => i.archivedAt !== undefined)
        .map(async (i) => await shapeQueueItemForRead(ctx, i)),
    );
  },
});

/** Reactive, bounded suggestion pages; exact counts come from counts, not page length. */
export const suggestionPage = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    archived: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const actor = await resolveWebQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "queue:read",
    );
    const page = await ctx.db
      .query("queueItems")
      .withIndex("by_move_owner_updated", (q) =>
        q.eq("moveId", args.moveId).eq("ownerUserId", actor.userId),
      )
      .filter((q) =>
        args.archived
          ? q.neq(q.field("archivedAt"), undefined)
          : q.and(
              q.eq(q.field("addedBy"), "ai_suggestion"),
              q.eq(q.field("suggestionStatus"), "open"),
              q.eq(q.field("archivedAt"), undefined),
            ),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: normalizeQueueLimit(args.paginationOpts.numItems),
      });
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (item) => await shapeQueueItemForRead(ctx, item)),
      ),
    };
  },
});

/** Layout/nav reads only matching indexed flags and suggestions, never the Queue body. */
export const badges = query({
  args: { householdId: v.id("households"), moveId: v.id("moves") },
  handler: async (ctx, args) => {
    const actor = await resolveWebQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "queue:read",
    );
    let suggestions = 0,
      needsYou = 0;
    for await (const item of ctx.db
      .query("queueItems")
      .withIndex("by_move_owner_review", (q) =>
        q
          .eq("moveId", args.moveId)
          .eq("ownerUserId", actor.userId)
          .eq("suggestionStatus", "open"),
      ))
      if (item.addedBy === "ai_suggestion" && item.archivedAt === undefined)
        suggestions++;
    for await (const item of ctx.db
      .query("queueItems")
      .withIndex("by_move_owner_input", (q) =>
        q
          .eq("moveId", args.moveId)
          .eq("ownerUserId", actor.userId)
          .eq("needsInput", true),
      ))
      if (queueIsWork(item)) needsYou++;
    for await (const item of ctx.db
      .query("queueItems")
      .withIndex("by_move_owner_state_updated", (q) =>
        q
          .eq("moveId", args.moveId)
          .eq("ownerUserId", actor.userId)
          .eq("state", "needsYou"),
      ))
      if (item.needsInput === undefined && queueIsWork(item)) needsYou++;
    for await (const entry of ctx.db
      .query("ingestionQueueEntries")
      .withIndex("by_move_owner_input", (q) =>
        q
          .eq("moveId", args.moveId)
          .eq("ownerUserId", actor.userId)
          .eq("needsInput", true),
      ))
      if (entry.status !== "discarded") needsYou++;
    for (const status of ["needsInput", "processed"] as const)
      for await (const entry of ctx.db
        .query("ingestionQueueEntries")
        .withIndex("by_move_owner_status", (q) =>
          q
            .eq("moveId", args.moveId)
            .eq("ownerUserId", actor.userId)
            .eq("status", status),
        ))
        if (entry.needsInput === undefined) needsYou++;
    for await (const entry of ctx.db
      .query("ingestionQueueEntries")
      .withIndex("by_move_creator_owner_input", (q) =>
        q
          .eq("moveId", args.moveId)
          .eq("createdByUserId", actor.userId)
          .eq("ownerUserId", undefined)
          .eq("needsInput", true),
      ))
      if (entry.status !== "discarded") needsYou++;
    for (const status of ["needsInput", "processed"] as const)
      for await (const entry of ctx.db
        .query("ingestionQueueEntries")
        .withIndex("by_move_creator_owner_status", (q) =>
          q
            .eq("moveId", args.moveId)
            .eq("createdByUserId", actor.userId)
            .eq("ownerUserId", undefined)
            .eq("status", status),
        ))
        if (entry.needsInput === undefined) needsYou++;
    return { suggestions, needsYou };
  },
});
