import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { recordAuditEvent } from "./audit";
import {
  assertExpectedQueueVersion,
  assertQueueStateInvariant,
  canTransitionQueueState,
  effectiveQueueState,
  normalizeQueueText,
  queueClaimDurationMs,
  queueClaimIsExpired,
  queueDefaultMaxAttempts,
  queueFailureTransition,
  queueStateLabels,
  type QueueActivityType,
  type QueueActorType,
  type QueueContextKind,
  type QueueDomainKind,
  type QueuePriority,
  type QueueState,
  type QueueTerminalReason,
  type QueueWaitingReason,
} from "./queue";
import {
  canActOnQueueEntry,
  canRunQueueForOwner,
  canViewQueueEntry,
} from "./queueAccess";

export type QueueAccessActor = {
  userId: Id<"users">;
  actorType: QueueActorType;
  apiKeyId?: Id<"apiKeys">;
  label?: string;
  isManager: boolean;
  delegatedOwnerIds: Id<"users">[];
};

export type QueueResultRef = { type: string; id: string; label?: string };

type QueueCtx = QueryCtx | MutationCtx;

async function validateQueueResultRefs(
  ctx: MutationCtx,
  item: Doc<"queueItems">,
  refs: QueueResultRef[] | undefined,
) {
  if ((refs?.length ?? 0) > 50) {
    throw new ConvexError("Queue results may include at most 50 references.");
  }
  const validated: QueueResultRef[] = [];
  for (const ref of refs ?? []) {
    if (
      !ref ||
      typeof ref !== "object" ||
      typeof ref.type !== "string" ||
      typeof ref.id !== "string" ||
      (ref.label !== undefined && typeof ref.label !== "string")
    ) {
      throw new ConvexError(
        "Queue result references need string type and id fields plus an optional string label.",
      );
    }
    const type = normalizeQueueText(ref.type, "resultRef.type", 100);
    const id = normalizeQueueText(ref.id, "resultRef.id", 200);
    if (!type || !id) throw new ConvexError("Result references need a type and id.");
    let record: { householdId: Id<"households">; moveId?: Id<"moves"> } | null;
    switch (type) {
      case "item":
        record = await ctx.db.get(id as Id<"items">);
        break;
      case "box":
        record = await ctx.db.get(id as Id<"boxes">);
        break;
      case "space":
        record = await ctx.db.get(id as Id<"moveSpaces">);
        break;
      case "floorPlan":
        record = await ctx.db.get(id as Id<"floorPlans">);
        break;
      case "planProposal":
        record = await ctx.db.get(id as Id<"planProposals">);
        break;
      case "capture":
        record = await ctx.db.get(id as Id<"ingestionQueueEntries">);
        break;
      case "aiJob":
        record = await ctx.db.get(id as Id<"aiJobs">);
        break;
      case "textSuggestion":
        record = await ctx.db.get(id as Id<"aiTextSuggestions">);
        break;
      case "photoSuggestion":
        record = await ctx.db.get(id as Id<"aiPhotoSuggestions">);
        break;
      case "planningSuggestion":
        record = await ctx.db.get(id as Id<"aiPlanningSuggestions">);
        break;
      case "export":
        record = await ctx.db.get(id as Id<"exportJobs">);
        break;
      default:
        throw new ConvexError(
          "Unsupported Queue result reference type. Use a durable Moving record type.",
        );
    }
    if (
      !record ||
      record.householdId !== item.householdId ||
      record.moveId !== item.moveId
    ) {
      throw new ConvexError("Queue result reference does not belong to this move.");
    }
    validated.push({
      type,
      id,
      label: normalizeQueueText(ref.label, "resultRef.label", 200),
    });
  }
  return validated.length ? validated : undefined;
}

export function shapeQueueItem(item: Doc<"queueItems">, now = Date.now()) {
  const state = effectiveQueueState(item, now);
  return {
    queueItemId: item._id,
    ownerUserId: item.ownerUserId,
    directive: item.directive,
    summary: item.summary ?? null,
    state,
    stateLabel: queueStateLabels[state],
    storedState: item.state,
    priority: item.priority,
    context: {
      kind: item.contextKind,
      refId: item.contextRefId ?? null,
      label: item.contextLabel ?? null,
    },
    domain: {
      kind: item.domainKind,
      refType: item.domainRefType ?? null,
      refId: item.domainRefId ?? null,
    },
    requiredAction: item.requiredAction ?? null,
    nextStep: item.nextStep ?? null,
    waitingReason:
      state === "waitingForAi"
        ? (item.waitingReason ?? "connectionUnknown")
        : null,
    aiSetupPath:
      state === "waitingForAi" && item.waitingReason === "aiConnectionRequired"
        ? "/ai"
        : null,
    latestHumanResponse: item.latestHumanResponse ?? null,
    resultSummary: item.resultSummary ?? null,
    resultRefs: item.resultRefs ?? [],
    terminalReason: item.terminalReason ?? null,
    failure: item.failureMessage
      ? {
          code: item.failureCode ?? "queue_work_failed",
          message: item.failureMessage,
          retryable: item.failureRetryable ?? false,
          attemptCount: item.attemptCount,
          maxAttempts: item.maxAttempts,
          nextAttemptAt: item.nextAttemptAt ?? null,
        }
      : null,
    claim:
      state === "working"
        ? {
            label: item.claimedByLabel ?? null,
            claimedAt: item.claimedAt ?? null,
            expiresAt: item.claimExpiresAt ?? null,
          }
        : null,
    expiresAt: item.expiresAt ?? null,
    version: item.version,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    completedAt: item.completedAt ?? null,
  };
}

export function requireQueueItemVisible(
  actor: QueueAccessActor,
  item: Doc<"queueItems">,
) {
  if (
    !canViewQueueEntry({
      actorUserId: actor.userId,
      ownerUserId: item.ownerUserId,
      isManager: actor.isManager,
      delegatedOwnerIds: actor.delegatedOwnerIds,
    })
  ) {
    throw new ConvexError("Queue item not found or not available to this actor.");
  }
}

export function requireQueueItemAction(
  actor: QueueAccessActor,
  item: Doc<"queueItems">,
) {
  if (
    !canActOnQueueEntry({
      actorUserId: actor.userId,
      entryOwnerUserId: item.ownerUserId,
      claimedByUserId: item.claimedByUserId,
      isManager: actor.isManager,
      delegatedOwnerIds: actor.delegatedOwnerIds,
    })
  ) {
    throw new ConvexError(
      "You can only act on your own Queue items or ones explicitly delegated to you.",
    );
  }
}

export async function requireQueueItem(
  ctx: QueueCtx,
  input: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    queueItemId: Id<"queueItems">;
  },
) {
  const item = await ctx.db.get(input.queueItemId);
  if (
    !item ||
    item.householdId !== input.householdId ||
    item.moveId !== input.moveId
  ) {
    throw new ConvexError("Queue item not found.");
  }
  return item;
}

async function findActivityReplay(
  ctx: QueueCtx,
  queueItemId: Id<"queueItems">,
  idempotencyKey?: string,
) {
  if (!idempotencyKey) return null;
  return await ctx.db
    .query("queueActivities")
    .withIndex("by_item_idempotency", (q) =>
      q.eq("queueItemId", queueItemId).eq("idempotencyKey", idempotencyKey),
    )
    .unique();
}

async function recordQueueActivity(
  ctx: MutationCtx,
  item: Doc<"queueItems">,
  actor: QueueAccessActor,
  input: {
    type: QueueActivityType;
    fromState?: QueueState;
    toState: QueueState;
    message: string;
    failureCode?: string;
    resultRefCount?: number;
    idempotencyKey?: string;
  },
) {
  const now = Date.now();
  await ctx.db.insert("queueActivities", {
    householdId: item.householdId,
    moveId: item.moveId,
    queueItemId: item._id,
    ownerUserId: item.ownerUserId,
    type: input.type,
    actorType: actor.actorType,
    actorUserId: actor.userId,
    actorApiKeyId: actor.apiKeyId,
    actorLabel: actor.label,
    fromState: input.fromState,
    toState: input.toState,
    message: input.message,
    failureCode: input.failureCode,
    resultRefCount: input.resultRefCount,
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
  });
  await recordAuditEvent(ctx, {
    householdId: item.householdId,
    moveId: item.moveId,
    actorType: actor.actorType,
    actorUserId: actor.userId,
    actorApiKeyId: actor.apiKeyId,
    category: "queue",
    action: `queue.${input.type}`,
    objectTable: "queueItems",
    objectId: item._id,
    metadata: {
      fromState: input.fromState,
      toState: input.toState,
      failureCode: input.failureCode,
      resultRefCount: input.resultRefCount,
    },
  });
}

export async function createQueueItem(
  ctx: MutationCtx,
  actor: QueueAccessActor,
  input: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    ownerUserId?: Id<"users">;
    directive: string;
    summary?: string;
    priority?: QueuePriority;
    contextKind?: QueueContextKind;
    contextRefId?: string;
    contextLabel?: string;
    domainKind?: QueueDomainKind;
    domainRefType?: string;
    domainRefId?: string;
    waitingReason?: QueueWaitingReason;
    expiresAt?: number;
    maxAttempts?: number;
    idempotencyKey?: string;
  },
) {
  if (actor.actorType !== "user") {
    throw new ConvexError(
      "Connected agents cannot create new Queue objectives; a signed-in person must add the directive.",
    );
  }
  const ownerUserId = input.ownerUserId ?? actor.userId;
  if (actor.userId !== ownerUserId && !actor.isManager) {
    throw new ConvexError("You cannot create work in that person's Queue.");
  }
  const directive = normalizeQueueText(input.directive, "directive", 4000);
  if (!directive) throw new ConvexError("A Queue directive is required.");
  const idempotencyKey = normalizeQueueText(
    input.idempotencyKey,
    "idempotencyKey",
    200,
  );
  if (idempotencyKey) {
    const existing = await ctx.db
      .query("queueItems")
      .withIndex("by_move_owner_idempotency", (q) =>
        q
          .eq("moveId", input.moveId)
          .eq("ownerUserId", ownerUserId)
          .eq("idempotencyKey", idempotencyKey),
      )
      .unique();
    if (existing) return existing;
  }
  const now = Date.now();
  if (
    input.expiresAt !== undefined &&
    (!Number.isFinite(input.expiresAt) || input.expiresAt <= now)
  ) {
    throw new ConvexError("Queue expiry must be in the future.");
  }
  if (input.maxAttempts !== undefined && !Number.isFinite(input.maxAttempts)) {
    throw new ConvexError("maxAttempts must be a finite number.");
  }
  const maxAttempts = Math.min(
    Math.max(Math.floor(input.maxAttempts ?? queueDefaultMaxAttempts), 1),
    10,
  );
  const queueItemId = await ctx.db.insert("queueItems", {
    householdId: input.householdId,
    moveId: input.moveId,
    ownerUserId,
    createdByUserId: actor.userId,
    directive,
    summary: normalizeQueueText(input.summary, "summary", 240),
    state: "waitingForAi",
    priority: input.priority ?? "normal",
    contextKind: input.contextKind ?? "move",
    contextRefId: normalizeQueueText(input.contextRefId, "contextRefId", 200),
    contextLabel: normalizeQueueText(input.contextLabel, "contextLabel", 200),
    domainKind: input.domainKind ?? "general",
    domainRefType: normalizeQueueText(
      input.domainRefType,
      "domainRefType",
      100,
    ),
    domainRefId: normalizeQueueText(input.domainRefId, "domainRefId", 200),
    waitingReason: input.waitingReason ?? "connectionUnknown",
    attemptCount: 0,
    maxAttempts,
    expiresAt: input.expiresAt,
    idempotencyKey,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  const item = (await ctx.db.get(queueItemId))!;
  await recordQueueActivity(ctx, item, actor, {
    type: "created",
    toState: "waitingForAi",
    message: "Directive added to the Queue.",
    idempotencyKey: idempotencyKey ? `create:${idempotencyKey}` : undefined,
  });
  return item;
}

function requireTransition(from: QueueState, to: QueueState) {
  if (!canTransitionQueueState(from, to)) {
    throw new ConvexError(`Cannot move ${queueStateLabels[from]} to ${queueStateLabels[to]}.`);
  }
}

function requireActiveClaim(item: Doc<"queueItems">, actor: QueueAccessActor) {
  const now = Date.now();
  if (item.expiresAt !== undefined && item.expiresAt <= now) {
    throw new ConvexError("This Queue handoff has expired and cannot be changed.");
  }
  if (item.claimExpiresAt === undefined || item.claimExpiresAt <= now) {
    throw new ConvexError("This Queue claim lease has expired.");
  }
  const humanManager = actor.actorType === "user" && actor.isManager;
  const actorOwnsClaim = item.claimedByApiKeyId
    ? actor.apiKeyId === item.claimedByApiKeyId
    : item.claimedByUserId === actor.userId;
  if (!actorOwnsClaim && !humanManager) {
    throw new ConvexError("This Queue item is claimed by another actor.");
  }
}

export async function claimQueueItem(
  ctx: MutationCtx,
  actor: QueueAccessActor,
  input: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    queueItemId: Id<"queueItems">;
    nextStep: string;
    expectedVersion?: number;
    idempotencyKey?: string;
  },
) {
  const item = await requireQueueItem(ctx, input);
  if (
    !canRunQueueForOwner({
      actorUserId: actor.userId,
      ownerUserId: item.ownerUserId,
      delegatedOwnerIds: actor.delegatedOwnerIds,
      isManager: actor.isManager,
    })
  ) {
    throw new ConvexError("You are not authorized to run this Queue.");
  }
  if (await findActivityReplay(ctx, item._id, input.idempotencyKey)) return item;
  assertExpectedQueueVersion(item.version, input.expectedVersion);
  const now = Date.now();
  if (item.expiresAt !== undefined && item.expiresAt <= now) {
    throw new ConvexError("This Queue handoff has expired and cannot be claimed.");
  }
  if (item.nextAttemptAt !== undefined && item.nextAttemptAt > now) {
    throw new ConvexError(
      `Retry is scheduled after ${new Date(item.nextAttemptAt).toISOString()}.`,
    );
  }
  const fromState = effectiveQueueState(item, now);
  requireTransition(fromState, "working");
  if (queueClaimIsExpired(item, now)) {
    await recordQueueActivity(
      ctx,
      item,
      {
        userId: item.ownerUserId,
        actorType: "system",
        label: "Queue lease maintenance",
        isManager: true,
        delegatedOwnerIds: [],
      },
      {
        type: "released",
        fromState: "working",
        toState: "waitingForAi",
        message:
          "The previous claim lease expired; the handoff became available again.",
        idempotencyKey: `claim-expired:${item.claimExpiresAt}`,
      },
    );
  }
  const nextStep = normalizeQueueText(input.nextStep, "nextStep", 1000);
  assertQueueStateInvariant({
    state: "working",
    nextStep,
    claimExpiresAt: now + queueClaimDurationMs,
    claimedByUserId: actor.userId,
    claimedByApiKeyId: actor.apiKeyId,
  });
  await ctx.db.patch(item._id, {
    state: "working",
    nextStep,
    waitingReason: undefined,
    requiredAction: undefined,
    claimedByUserId: actor.userId,
    claimedByApiKeyId: actor.apiKeyId,
    claimedByLabel: actor.label,
    claimedAt: now,
    claimExpiresAt: now + queueClaimDurationMs,
    nextAttemptAt: undefined,
    latestHumanResponse: undefined,
    version: item.version + 1,
    updatedAt: now,
  });
  await recordQueueActivity(ctx, item, actor, {
    type: "claimed",
    fromState,
    toState: "working",
    message: `Started bounded work: ${nextStep}`,
    idempotencyKey: input.idempotencyKey,
  });
  return (await ctx.db.get(item._id))!;
}

export async function releaseQueueItem(
  ctx: MutationCtx,
  actor: QueueAccessActor,
  input: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    queueItemId: Id<"queueItems">;
    reason: string;
    expectedVersion?: number;
    idempotencyKey?: string;
  },
) {
  const item = await requireQueueItem(ctx, input);
  requireQueueItemAction(actor, item);
  if (await findActivityReplay(ctx, item._id, input.idempotencyKey)) return item;
  requireActiveClaim(item, actor);
  assertExpectedQueueVersion(item.version, input.expectedVersion);
  requireTransition(item.state, "waitingForAi");
  const reason = normalizeQueueText(input.reason, "reason", 1000);
  if (!reason) throw new ConvexError("A release reason is required.");
  const now = Date.now();
  await ctx.db.patch(item._id, {
    state: "waitingForAi",
    waitingReason: "ready",
    nextStep: undefined,
    claimedByUserId: undefined,
    claimedByApiKeyId: undefined,
    claimedByLabel: undefined,
    claimedAt: undefined,
    claimExpiresAt: undefined,
    version: item.version + 1,
    updatedAt: now,
  });
  await recordQueueActivity(ctx, item, actor, {
    type: "released",
    fromState: "working",
    toState: "waitingForAi",
    message: reason,
    idempotencyKey: input.idempotencyKey,
  });
  return (await ctx.db.get(item._id))!;
}

export async function requestQueueInput(
  ctx: MutationCtx,
  actor: QueueAccessActor,
  input: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    queueItemId: Id<"queueItems">;
    requiredAction: string;
    expectedVersion?: number;
    idempotencyKey?: string;
  },
) {
  const item = await requireQueueItem(ctx, input);
  requireQueueItemAction(actor, item);
  if (await findActivityReplay(ctx, item._id, input.idempotencyKey)) return item;
  requireActiveClaim(item, actor);
  assertExpectedQueueVersion(item.version, input.expectedVersion);
  requireTransition(item.state, "needsYou");
  const requiredAction = normalizeQueueText(
    input.requiredAction,
    "requiredAction",
    2000,
  );
  assertQueueStateInvariant({ state: "needsYou", requiredAction });
  const now = Date.now();
  await ctx.db.patch(item._id, {
    state: "needsYou",
    requiredAction,
    nextStep: undefined,
    claimedByUserId: undefined,
    claimedByApiKeyId: undefined,
    claimedByLabel: undefined,
    claimedAt: undefined,
    claimExpiresAt: undefined,
    version: item.version + 1,
    updatedAt: now,
  });
  await recordQueueActivity(ctx, item, actor, {
    type: "inputRequested",
    fromState: "working",
    toState: "needsYou",
    message: requiredAction!,
    idempotencyKey: input.idempotencyKey,
  });
  return (await ctx.db.get(item._id))!;
}

export async function provideQueueInput(
  ctx: MutationCtx,
  actor: QueueAccessActor,
  input: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    queueItemId: Id<"queueItems">;
    response: string;
    aiConnectionRequired?: boolean;
    expectedVersion?: number;
    idempotencyKey?: string;
  },
) {
  const item = await requireQueueItem(ctx, input);
  if (actor.userId !== item.ownerUserId && !actor.isManager) {
    throw new ConvexError(
      "Only the Queue owner or a move manager can provide the requested human input.",
    );
  }
  if (await findActivityReplay(ctx, item._id, input.idempotencyKey)) return item;
  assertExpectedQueueVersion(item.version, input.expectedVersion);
  requireTransition(item.state, "waitingForAi");
  const response = normalizeQueueText(input.response, "response", 4000);
  if (!response) throw new ConvexError("A response is required.");
  const now = Date.now();
  await ctx.db.patch(item._id, {
    state: "waitingForAi",
    waitingReason: input.aiConnectionRequired ? "aiConnectionRequired" : "ready",
    latestHumanResponse: response,
    requiredAction: undefined,
    version: item.version + 1,
    updatedAt: now,
  });
  await recordQueueActivity(ctx, item, actor, {
    type: "inputProvided",
    fromState: "needsYou",
    toState: "waitingForAi",
    message: "The requested human input was provided.",
    idempotencyKey: input.idempotencyKey,
  });
  return (await ctx.db.get(item._id))!;
}

export async function completeQueueItem(
  ctx: MutationCtx,
  actor: QueueAccessActor,
  input: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    queueItemId: Id<"queueItems">;
    resultSummary?: string;
    resultRefs?: QueueResultRef[];
    expectedVersion?: number;
    idempotencyKey?: string;
  },
) {
  const item = await requireQueueItem(ctx, input);
  requireQueueItemAction(actor, item);
  if (await findActivityReplay(ctx, item._id, input.idempotencyKey)) return item;
  requireActiveClaim(item, actor);
  assertExpectedQueueVersion(item.version, input.expectedVersion);
  requireTransition(item.state, "done");
  const resultSummary = normalizeQueueText(
    input.resultSummary,
    "resultSummary",
    4000,
  );
  const resultRefs = await validateQueueResultRefs(ctx, item, input.resultRefs);
  assertQueueStateInvariant({
    state: "done",
    terminalReason: "completed",
    resultSummary,
    resultRefs,
  });
  const now = Date.now();
  await ctx.db.patch(item._id, {
    state: "done",
    terminalReason: "completed",
    resultSummary,
    resultRefs,
    requiredAction: undefined,
    nextStep: undefined,
    waitingReason: undefined,
    claimedByUserId: undefined,
    claimedByApiKeyId: undefined,
    claimedByLabel: undefined,
    claimedAt: undefined,
    claimExpiresAt: undefined,
    failureCode: undefined,
    failureMessage: undefined,
    failureRetryable: undefined,
    nextAttemptAt: undefined,
    version: item.version + 1,
    updatedAt: now,
    completedAt: now,
  });
  await recordQueueActivity(ctx, item, actor, {
    type: "completed",
    fromState: "working",
    toState: "done",
    message: resultSummary ?? "Completed with attached result references.",
    resultRefCount: resultRefs?.length ?? 0,
    idempotencyKey: input.idempotencyKey,
  });
  return (await ctx.db.get(item._id))!;
}

export async function reportQueueFailure(
  ctx: MutationCtx,
  actor: QueueAccessActor,
  input: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    queueItemId: Id<"queueItems">;
    code: string;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
    expectedVersion?: number;
    idempotencyKey?: string;
  },
) {
  const item = await requireQueueItem(ctx, input);
  requireQueueItemAction(actor, item);
  if (await findActivityReplay(ctx, item._id, input.idempotencyKey)) return item;
  requireActiveClaim(item, actor);
  assertExpectedQueueVersion(item.version, input.expectedVersion);
  const code = normalizeQueueText(input.code, "code", 100);
  const message = normalizeQueueText(input.message, "message", 2000);
  if (!code || !message) throw new ConvexError("Failure code and message are required.");
  if (
    input.retryAfterMs !== undefined &&
    (!Number.isFinite(input.retryAfterMs) || input.retryAfterMs < 0)
  ) {
    throw new ConvexError("retryAfterMs must be a finite non-negative number.");
  }
  const transition = queueFailureTransition({
    attemptCount: item.attemptCount,
    maxAttempts: item.maxAttempts,
    retryable: input.retryable,
  });
  requireTransition(item.state, transition.state);
  const now = Date.now();
  const nextAttemptAt =
    transition.state === "waitingForAi"
      ? now + Math.min(Math.max(input.retryAfterMs ?? 0, 0), 24 * 60 * 60 * 1000)
      : undefined;
  const requiredAction =
    transition.state === "needsYou"
      ? `Review this failed handoff and choose whether to revise or cancel it: ${message}`
      : undefined;
  await ctx.db.patch(item._id, {
    state: transition.state,
    waitingReason:
      transition.state === "waitingForAi" ? "retryScheduled" : undefined,
    nextAttemptAt,
    requiredAction,
    nextStep: undefined,
    failureCode: code,
    failureMessage: message,
    failureRetryable: input.retryable,
    attemptCount: transition.nextAttemptCount,
    claimedByUserId: undefined,
    claimedByApiKeyId: undefined,
    claimedByLabel: undefined,
    claimedAt: undefined,
    claimExpiresAt: undefined,
    version: item.version + 1,
    updatedAt: now,
  });
  await recordQueueActivity(ctx, item, actor, {
    type: transition.activity,
    fromState: "working",
    toState: transition.state,
    message,
    failureCode: code,
    idempotencyKey: input.idempotencyKey,
  });
  return (await ctx.db.get(item._id))!;
}

export async function finishQueueItemWithoutWork(
  ctx: MutationCtx,
  actor: QueueAccessActor,
  input: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    queueItemId: Id<"queueItems">;
    reason: string;
    terminalReason: Exclude<QueueTerminalReason, "completed">;
    expectedVersion?: number;
    idempotencyKey?: string;
  },
) {
  const item = await requireQueueItem(ctx, input);
  if (actor.userId !== item.ownerUserId && !actor.isManager) {
    throw new ConvexError(
      "Only the Queue owner or a move manager can cancel this handoff.",
    );
  }
  if (await findActivityReplay(ctx, item._id, input.idempotencyKey)) return item;
  assertExpectedQueueVersion(item.version, input.expectedVersion);
  const fromState = effectiveQueueState(item, Date.now());
  requireTransition(fromState, "done");
  const reason = normalizeQueueText(input.reason, "reason", 2000);
  if (!reason) throw new ConvexError("A terminal reason is required.");
  const now = Date.now();
  await ctx.db.patch(item._id, {
    state: "done",
    terminalReason: input.terminalReason,
    resultSummary: reason,
    requiredAction: undefined,
    nextStep: undefined,
    waitingReason: undefined,
    claimedByUserId: undefined,
    claimedByApiKeyId: undefined,
    claimedByLabel: undefined,
    claimedAt: undefined,
    claimExpiresAt: undefined,
    nextAttemptAt: undefined,
    version: item.version + 1,
    updatedAt: now,
    completedAt: now,
  });
  await recordQueueActivity(ctx, item, actor, {
    type: input.terminalReason === "canceled" ? "canceled" : "expired",
    fromState,
    toState: "done",
    message: reason,
    idempotencyKey: input.idempotencyKey,
  });
  return (await ctx.db.get(item._id))!;
}
