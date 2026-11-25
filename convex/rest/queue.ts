import {
  queueNeedsInput,
  queueWorkFilter,
  queueItemMatchesEffectiveState,
  queueStates,
  type QueueState,
} from "../lib/queue";
import {
  createQueueItem,
  readQueueSuggestions,
  reviewQueueSuggestion,
  type QueueResultRef,
  claimQueueItem,
  completeQueueItem,
  releaseQueueItem,
  reportQueueFailure,
  requestQueueInput,
  requireQueueItem,
  requireQueueItemVisible,
  shapeQueueItemForRead,
  type QueueAccessActor,
} from "../lib/queueService";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { authenticateApiKey } from "../lib/apiKeyAuth";
import {
  canViewQueueEntry,
  queueManagerRecoveryAllowed,
  resolveRunnableQueueOwnerIds,
} from "../lib/queueAccess";
import { canPerformHouseholdAction } from "../lib/roles";
import {
  bodyRecord as bodyObject,
  restError,
  restOk,
  type RestRequestInput,
} from "../lib/rest/core";
import {
  optionalNumber,
  asString,
} from "../lib/rest/parse";

async function queueApiActor(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
): Promise<QueueAccessActor> {
  const participant = await ctx.db
    .query("moveParticipants")
    .withIndex("by_move_user", (q) =>
      q.eq("moveId", moveId).eq("userId", auth.createdByUserId),
    )
    .unique();
  return {
    userId: auth.createdByUserId,
    actorType: "apiKey",
    apiKeyId: auth.apiKeyId,
    label: auth.apiKeyName,
    isManager: queueManagerRecoveryAllowed({
      actorType: "apiKey",
      hasManagerRole: canPerformHouseholdAction(
        auth.effectiveRole,
        "household:manage_members",
      ),
    }),
    delegatedOwnerIds:
      participant?.status === "active"
        ? (participant.canRunQueueForUserIds ?? [])
        : [],
  };
}

function restQueueState(value: string | undefined): QueueState | undefined {
  if (!value) return undefined;
  if ((queueStates as readonly string[]).includes(value)) {
    return value as QueueState;
  }
  throw new Error(
    "state must be needsYou, working, waitingForAi, or done.",
  );
}

function restExpectedVersion(body: Record<string, unknown>) {
  if (typeof body.expectedVersion !== "number" || !Number.isInteger(body.expectedVersion)) {
    throw new Error("expectedVersion is required and must be an integer.");
  }
  return body.expectedVersion;
}

export async function routeQueue(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  queueItemIdSegment?: string,
  action?: string,
) {
  const actor = await queueApiActor(ctx, auth, moveId);
  const queueInput = args.body && typeof args.body === "object" && !Array.isArray(args.body) ? args.body as Record<string,unknown> : {};
  if(args.method!=="GET" && args.body && typeof args.body === "object" && (queueInput.needsInput === false || queueInput.clearOnly === true || queueInput.clearNeedsInput === true)) throw new ConvexError("Only the person can clear Needs your input");
  if (args.method === "POST" && !queueItemIdSegment) {
    if (!args.idempotencyKey)
      throw new ConvexError("Idempotency-Key is required for Queue adds.");
    const body = bodyObject(args.body);
    if (
      body.addedBy === "ai_suggestion" &&
      !auth.scopes.includes("queue/suggest")
    )
      throw new ConvexError(
        "Propose suggestions is off; requested work remains available.",
      );
    return restOk(
      {
        data: await shapeQueueItemForRead(ctx,
          await createQueueItem(ctx, actor, {
            householdId: auth.householdId,
            moveId,
            directive: asString(body.directive) ?? "",
            addedBy: body.addedBy as "ai_on_request" | "ai_suggestion",
            reason: asString(body.reason),
            options: body.options as string[] | undefined,
            evidence: asString(body.evidence),
            fromRecord: body.fromRecord as QueueResultRef | undefined,
            idempotencyKey: args.idempotencyKey,
          }),
        ),
      },
      201,
    );
  }
  if (args.method === "GET" && queueItemIdSegment === "suggestions")
    return restOk({
      data: await readQueueSuggestions(ctx, actor, {
        moveId,
        archived: args.query.archived === "true",
          cursor:args.query.cursor,limit:args.query.limit?Number(args.query.limit):undefined,
      }),
    });
  if (args.method === "GET" && !queueItemIdSegment) {
    const limit = Math.min(
      Math.max(Math.floor(Number(args.query.limit || "50")), 1),
      100,
    );
    const state = restQueueState(args.query.state);
    const requestedOwnerUserId = args.query.ownerUserId as
      | Id<"users">
      | undefined;
    const runnableOwnerIds = await resolveRunnableQueueOwnerIds(
      ctx,
      auth.householdId,
      moveId,
      actor,
    );
    const ownerUserId =
      requestedOwnerUserId ?? (actor.isManager ? undefined : actor.userId);
    if (ownerUserId && !runnableOwnerIds.includes(ownerUserId)) {
      return restError({
        status: 403,
        code: "forbidden",
        message: "You cannot view this Queue owner's items.",
      });
    }
    const cursor = args.query.cursor || null;
    const page = ownerUserId
      ? await ctx.db
          .query("queueItems")
          .withIndex("by_move_owner_updated", (q) =>
            q.eq("moveId", moveId).eq("ownerUserId", ownerUserId),
          )
          .order("desc")
          .filter(queueWorkFilter).paginate({ cursor, numItems: limit })
      : await ctx.db
          .query("queueItems")
          .withIndex("by_move_updated", (q) => q.eq("moveId", moveId))
          .order("desc")
          .filter(queueWorkFilter).paginate({ cursor, numItems: limit });
    const now = Date.now();
    const visible = page.page.filter((item) => {
      if (ownerUserId && item.ownerUserId !== ownerUserId) return false;
      if (!queueItemMatchesEffectiveState(item, state, now)) return false;
      return canViewQueueEntry({
        actorUserId: actor.userId,
        ownerUserId: item.ownerUserId,
        isManager: actor.isManager,
        delegatedOwnerIds: actor.delegatedOwnerIds,
      });
    });
    return restOk({
      data: await Promise.all(visible.map(async (item) => await shapeQueueItemForRead(ctx, item, now))),
      page: {
        limit,
        nextCursor: page.isDone ? null : page.continueCursor,
      },
      runnableOwnerIds,
      defaultOwnerUserId: ownerUserId,
    });
  }

  if (!queueItemIdSegment) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Queue route not found.",
    });
  }
  const queueItemId = queueItemIdSegment as Id<"queueItems">;
  if (args.method === "GET" && !action) {
    const item = await requireQueueItem(ctx, {
      householdId: auth.householdId,
      moveId,
      queueItemId,
    });
    requireQueueItemVisible(actor, item);
    const activities = await ctx.db
      .query("queueActivities")
      .withIndex("by_item_created", (q) => q.eq("queueItemId", item._id))
      .order("desc")
      .take(50);
    return restOk({
      data: await shapeQueueItemForRead(ctx, item),
      activity: activities.map((entry) => ({
        type: entry.type,
        actorType: entry.actorType,
        actorLabel: entry.actorLabel ?? null,
        fromState: entry.fromState ?? null,
        toState: entry.toState,
        message: entry.message,
        createdAt: entry.createdAt,
      })),
    });
  }

  if(args.method!=="GET" && (action === "archive" || queueInput.archived === true || queueInput.archivedAt !== undefined || queueInput.state === "archived")) {
   const item=await requireQueueItem(ctx,{householdId:auth.householdId,moveId,queueItemId});requireQueueItemVisible(actor,item);
   if(queueNeedsInput(item))throw new ConvexError("Only the person can clear Needs your input");
   throw new ConvexError("Only the person can archive a Queue item on the website.");
  }
  if (args.method !== "POST") {
    return restError({
      status: 405,
      code: "method_not_allowed",
      message: "Queue commands use POST.",
    });
  }
  if (!canPerformHouseholdAction(auth.effectiveRole, "queue:run")) {
    throw new Error(
      "This API key's participant role is not allowed to run Queue work.",
    );
  }
  if (!args.idempotencyKey) {
    throw new Error("Idempotency-Key is required for Queue commands.");
  }
  const body = bodyObject(args.body);
  const base = {
    householdId: auth.householdId,
    moveId,
    queueItemId,
    expectedVersion: restExpectedVersion(body),
    idempotencyKey: args.idempotencyKey,
  };
  if (
    action === "withdraw" ||
    action === "accept" ||
    action === "dismiss" ||
    action === "edit-accept"
  ) {
    if (action !== "withdraw")
      throw new ConvexError(
        "Only the person can accept, dismiss or edit-accept suggestions.",
      );
    return restOk({
      data: await shapeQueueItemForRead(ctx,
        await reviewQueueSuggestion(ctx, actor, {
          ...base,
          action: "withdraw",
          reason: asString(body.reason),
          idempotencyKey: args.idempotencyKey,
        }),
      ),
    });
  }
  if (action === "claim") {
    const nextStep = asString(body.nextStep);
    if (!nextStep) throw new Error("nextStep is required.");
    return restOk({
      data: await shapeQueueItemForRead(ctx,
        await claimQueueItem(ctx, actor, { ...base, nextStep }),
      ),
    });
  }
  if (action === "release") {
    const reason = asString(body.reason);
    if (!reason) throw new Error("reason is required.");
    return restOk({
      data: await shapeQueueItemForRead(ctx,
        await releaseQueueItem(ctx, actor, { ...base, reason }),
      ),
    });
  }
  if (action === "needs-you") {
    const requiredAction = asString(body.requiredAction);
    if (!requiredAction) throw new Error("requiredAction is required.");
    return restOk({
      data: await shapeQueueItemForRead(ctx,
        await requestQueueInput(ctx, actor, { ...base, requiredAction }),
      ),
    });
  }
  if (action === "complete") {
    const resultRefs = Array.isArray(body.resultRefs)
      ? (body.resultRefs as Array<{ type: string; id: string; label?: string }>)
      : undefined;
    return restOk({
      data: await shapeQueueItemForRead(ctx,
        await completeQueueItem(ctx, actor, {
          ...base,
          resultSummary: asString(body.resultSummary),
          resultRefs,
        }),
      ),
    });
  }
  if (action === "failure") {
    const code = asString(body.code);
    const message = asString(body.message);
    if (!code || !message || typeof body.retryable !== "boolean") {
      throw new Error("code, message, and retryable are required.");
    }
    return restOk({
      data: await shapeQueueItemForRead(ctx,
        await reportQueueFailure(ctx, actor, {
          ...base,
          code,
          message,
          retryable: body.retryable,
          retryAfterMs: optionalNumber(body.retryAfterMs),
        }),
      ),
    });
  }
  return restError({
    status: 404,
    code: "not_found",
    message: "Queue command not found.",
  });
}
