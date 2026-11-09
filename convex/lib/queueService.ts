import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { recordAuditEvent } from "./audit";
import {
  assertExpectedQueueVersion,
  assertQueueStateInvariant,
  canTransitionQueueState,
  effectiveQueueState,
  queueIsWork,
  queueNeedsInput,
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
  connectionId?: string;
  isManager: boolean;
  delegatedOwnerIds: Id<"users">[];
};

export type QueueResultRef = { type: string; id: string; label?: string };

type QueueCtx = QueryCtx | MutationCtx;

async function getQueueReference<
  TableName extends
    | "items"
    | "boxes"
    | "moveSpaces"
    | "movePlanningRecords"
    | "floorPlans"
    | "planProposals"
    | "ingestionQueueEntries"
    | "aiJobs"
    | "aiTextSuggestions"
    | "aiPhotoSuggestions"
    | "aiPlanningSuggestions"
    | "exportJobs",
>(ctx: MutationCtx, tableName: TableName, rawId: string) {
  const id = ctx.db.normalizeId(tableName, rawId);
  return id ? await ctx.db.get(id) : null;
}

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
    if (!type || !id)
      throw new ConvexError("Result references need a type and id.");
    let record: { householdId: Id<"households">; moveId?: Id<"moves"> } | null;
    switch (type) {
      case "item":
        record = await getQueueReference(ctx, "items", id);
        break;
      case "box":
        record = await getQueueReference(ctx, "boxes", id);
        break;
      case "space":
        record = await getQueueReference(ctx, "moveSpaces", id);
        break;
      case "planningRecord":
        record = await getQueueReference(ctx, "movePlanningRecords", id);
        break;
      case "floorPlan":
        record = await getQueueReference(ctx, "floorPlans", id);
        break;
      case "planProposal":
        record = await getQueueReference(ctx, "planProposals", id);
        break;
      case "capture":
        record = await getQueueReference(ctx, "ingestionQueueEntries", id);
        break;
      case "aiJob":
        record = await getQueueReference(ctx, "aiJobs", id);
        break;
      case "textSuggestion":
        record = await getQueueReference(ctx, "aiTextSuggestions", id);
        break;
      case "photoSuggestion":
        record = await getQueueReference(ctx, "aiPhotoSuggestions", id);
        break;
      case "planningSuggestion":
        record = await getQueueReference(ctx, "aiPlanningSuggestions", id);
        break;
      case "export":
        record = await getQueueReference(ctx, "exportJobs", id);
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
      throw new ConvexError(
        "Queue result reference does not belong to this move.",
      );
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
    addedBy: item.addedBy ?? "person",
    addedByLabel: item.addedByLabel ?? null,
    fromRecord: item.fromRecord ?? null,
    fromRecordHref: item.fromRecord
      ? item.fromRecord.type === "box"
        ? `/app/boxes/${encodeURIComponent(item.fromRecord.id)}`
        : `/app/moves/${encodeURIComponent(item.moveId)}/${item.fromRecord.type === "item" ? "inventory" : item.fromRecord.type === "space" ? "spaces" : item.fromRecord.type === "queue" ? "queue" : "overview"}?record=${encodeURIComponent(item.fromRecord.id)}`
      : null,
    suggestionStatus: item.suggestionStatus ?? null,
    suggestionActedAt: item.suggestionActedAt ?? null,
    suggestionReason: item.suggestionReason ?? null,
    suggestionOptions: item.suggestionOptions ?? [],
    suggestionEvidence: item.suggestionEvidence ?? null,
    dismissReason: item.dismissReason ?? null,
    archivedAt: item.archivedAt ?? null,
    needsInput: queueNeedsInput(item),
    needsInputAt:
      item.needsInputAt ?? (item.state === "needsYou" ? item.updatedAt : null),
    needsInputBy: item.needsInputBy ?? null,
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
    item.addedBy === "ai_suggestion" &&
    item.suggestionStatus !== "accepted" &&
    actor.userId !== item.ownerUserId
  )
    throw new ConvexError("AI suggestions are private to their Queue owner.");
  if (
    !canViewQueueEntry({
      actorUserId: actor.userId,
      ownerUserId: item.ownerUserId,
      isManager: actor.isManager,
      delegatedOwnerIds: actor.delegatedOwnerIds,
    })
  ) {
    throw new ConvexError(
      "Queue item not found or not available to this actor.",
    );
  }
}

export function requireQueueItemAction(
  actor: QueueAccessActor,
  item: Doc<"queueItems">,
) {
  if (
    (actor.actorType === "agent" || actor.actorType === "apiKey") &&
    queueNeedsInput(item)
  )
    throw new ConvexError("Only the person can clear Needs your input");
  if (!queueIsWork(item))
    throw new ConvexError(
      "An unaccepted or archived AI suggestion cannot be worked. Only the person can accept it.",
    );
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
    addedBy?: "person" | "ai_on_request" | "ai_suggestion";
    reason?: string;
    options?: string[];
    evidence?: string;
    fromRecord?: QueueResultRef;
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
  const requestedFromRecord = input.fromRecord
    ? { type: input.fromRecord.type, id: input.fromRecord.id }
    : null;
  const isAI = actor.actorType !== "user";
  if (
    input.options !== undefined &&
    (!Array.isArray(input.options) ||
      input.options.some((option) => typeof option !== "string"))
  )
    throw new ConvexError("Options must be text choices.");
  if (
    input.fromRecord &&
    (typeof input.fromRecord.type !== "string" ||
      typeof input.fromRecord.id !== "string")
  )
    input.fromRecord = undefined;
  if (
    isAI &&
    input.addedBy !== "ai_on_request" &&
    input.addedBy !== "ai_suggestion"
  )
    throw new ConvexError(
      "AI adds require addedBy: ai_on_request or ai_suggestion.",
    );
  if (!isAI && input.addedBy && input.addedBy !== "person")
    throw new ConvexError("AI origin requires an authenticated AI connection.");
  if (isAI && input.ownerUserId && input.ownerUserId !== actor.userId)
    throw new ConvexError("An AI adds only to its person's Queue.");
  if (input.addedBy === "ai_suggestion" && !input.reason?.trim())
    throw new ConvexError("An AI suggestion requires a new reason.");
  if (
    (input.options?.length ?? 0) > 26 ||
    input.options?.some((option) => !option.trim() || option.length > 2000)
  )
    throw new ConvexError(
      "Use at most 26 nonempty options of up to 2000 characters.",
    );
  if (input.fromRecord) {
    const tables = {
      item: "items",
      box: "boxes",
      space: "moveSpaces",
      planningRecord: "movePlanningRecords",
      queue: "queueItems",
    } as const;
    const table = tables[input.fromRecord.type as keyof typeof tables];
    const id = table && ctx.db.normalizeId(table, input.fromRecord.id);
    const record = id ? await ctx.db.get(id) : null;
    if (
      !record ||
      record.moveId !== input.moveId ||
      record.householdId !== input.householdId ||
      ("ownerUserId" in record
        ? record.ownerUserId !== actor.userId
        : record.createdByUserId !== actor.userId)
    ) {
      input.fromRecord = undefined;
    } else
      input.fromRecord = {
        ...input.fromRecord,
        label:
          "directive" in record
            ? String(record.directive)
            : "name" in record
              ? String(record.name)
              : "title" in record
                ? String(record.title)
                : "label" in record
                  ? String(record.label)
                  : "Move record",
      };
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
  if (isAI && !idempotencyKey)
    throw new ConvexError(
      "A nonempty operationId is required for AI Queue adds.",
    );
  const addRequestKey = JSON.stringify([
    directive,
    input.addedBy ?? "person",
    normalizeQueueText(input.reason, "reason", 4000),
    input.options ?? [],
    input.evidence ?? null,
    requestedFromRecord,
  ]);
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
    if (existing) {
      if (
        existing.addRequestKey !== undefined &&
        existing.addRequestKey !== addRequestKey
      )
        throw new ConvexError(
          "This operationId was already used for different Queue work. Use a new operationId.",
        );
      return existing;
    }
  }
  if (input.addedBy === "ai_suggestion") {
    const earlier = await ctx.db
      .query("queueItems")
      .withIndex("by_move_owner_directive_review_reason", (q) =>
        q
          .eq("moveId", input.moveId)
          .eq("ownerUserId", actor.userId)
          .eq("directive", directive)
          .eq("suggestionStatus", "dismissed")
          .eq("suggestionReason", input.reason?.trim()),
      )
      .first();
    const dismissedBefore = await ctx.db
      .query("queueItems")
      .withIndex("by_move_owner_directive_dismissed_reason", (q) =>
        q
          .eq("moveId", input.moveId)
          .eq("ownerUserId", actor.userId)
          .eq("directive", directive)
          .eq("suggestionReason", input.reason?.trim())
          .gt("suggestionDismissedAt", undefined),
      )
      .first();
    if (earlier || dismissedBefore)
      throw new ConvexError(
        "Raise a dismissed idea again only with a new reason.",
      );
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
    addRequestKey,
    addedBy: input.addedBy ?? "person",
    addedByLabel: actor.label,
    addedByConnection:
      actor.connectionId ??
      (actor.apiKeyId ? String(actor.apiKeyId) : undefined),
    suggestionStatus: input.addedBy === "ai_suggestion" ? "open" : undefined,
    suggestionReason: normalizeQueueText(input.reason, "reason", 4000),
    suggestionOptions: input.options,
    suggestionEvidence: normalizeQueueText(input.evidence, "evidence", 8000),
    fromRecord: input.fromRecord,
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
    throw new ConvexError(
      `Cannot move ${queueStateLabels[from]} to ${queueStateLabels[to]}.`,
    );
  }
}

function requireActiveClaim(item: Doc<"queueItems">, actor: QueueAccessActor) {
  requireQueueItemAction(actor, item);
  const now = Date.now();
  if (item.expiresAt !== undefined && item.expiresAt <= now) {
    throw new ConvexError(
      "This Queue handoff has expired and cannot be changed.",
    );
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
  if (await findActivityReplay(ctx, item._id, input.idempotencyKey))
    return item;
  assertExpectedQueueVersion(item.version, input.expectedVersion);
  const now = Date.now();
  if (item.expiresAt !== undefined && item.expiresAt <= now) {
    throw new ConvexError(
      "This Queue handoff has expired and cannot be claimed.",
    );
  }
  if (item.nextAttemptAt !== undefined && item.nextAttemptAt > now) {
    throw new ConvexError(
      `Retry is scheduled after ${new Date(item.nextAttemptAt).toISOString()}.`,
    );
  }
  requireQueueItemAction(actor, item);
  if (queueNeedsInput(item))
    throw new ConvexError(
      "This item needs the person’s input before work can start.",
    );
  const fromState = effectiveQueueState(item, now);
  if (!(fromState === "working" && item.claimExpiresAt === undefined))
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
  if (await findActivityReplay(ctx, item._id, input.idempotencyKey))
    return item;
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

export async function releaseExpiredQueueClaim(
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
  if (actor.actorType !== "system" || actor.userId !== item.ownerUserId) {
    throw new ConvexError(
      "Only Queue maintenance can release an expired claim.",
    );
  }
  if (await findActivityReplay(ctx, item._id, input.idempotencyKey))
    return item;
  assertExpectedQueueVersion(item.version, input.expectedVersion);
  const now = Date.now();
  if (
    item.state !== "working" ||
    item.claimExpiresAt === undefined ||
    item.claimExpiresAt > now
  ) {
    throw new ConvexError(
      "Queue maintenance can only release an expired claim.",
    );
  }
  const reason = normalizeQueueText(input.reason, "reason", 1000);
  if (!reason) throw new ConvexError("A release reason is required.");
  await ctx.db.patch(item._id, {
    state:
      queueNeedsInput(item) || !queueIsWork(item) ? item.state : "waitingForAi",
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
    toState:
      queueNeedsInput(item) || !queueIsWork(item) ? item.state : "waitingForAi",
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
  if (await findActivityReplay(ctx, item._id, input.idempotencyKey))
    return item;
  if (item.claimExpiresAt !== undefined) requireActiveClaim(item, actor);
  assertExpectedQueueVersion(item.version, input.expectedVersion);
  const requiredAction = normalizeQueueText(
    input.requiredAction,
    "requiredAction",
    2000,
  );
  assertQueueStateInvariant({ state: "needsYou", requiredAction });
  const now = Date.now();
  await ctx.db.patch(item._id, {
    claimedByUserId: undefined,
    claimedByApiKeyId: undefined,
    claimedByLabel: undefined,
    claimedAt: undefined,
    claimExpiresAt: undefined,
    waitingReason: "ready",
    needsInput: true,
    needsInputAt: now,
    needsInputBy: actor.label ?? actor.actorType,
    requiredAction,
    version: item.version + 1,
    updatedAt: now,
  });
  await recordQueueActivity(ctx, item, actor, {
    type: "inputRequested",
    fromState: item.state,
    toState: item.state,
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
    clearOnly?: boolean;
    aiConnectionRequired?: boolean;
    expectedVersion?: number;
    idempotencyKey?: string;
  },
) {
  const item = await requireQueueItem(ctx, input);
  requireQueueItemVisible(actor, item);
  requireQueueItemAction(actor, item);
  if (
    actor.actorType !== "user" ||
    (actor.userId !== item.ownerUserId && !actor.isManager)
  ) {
    throw new ConvexError(
      "Only the Queue owner or a move manager can provide the requested human input.",
    );
  }
  if (await findActivityReplay(ctx, item._id, input.idempotencyKey))
    return item;
  assertExpectedQueueVersion(item.version, input.expectedVersion);
  const response = normalizeQueueText(input.response, "response", 4000);
  if (!response && !input.clearOnly)
    throw new ConvexError("A response is required.");
  const now = Date.now();
  await ctx.db.patch(item._id, {
    state: effectiveQueueState(item, now),
    needsInput: false,
    needsInputAt: undefined,
    needsInputBy: undefined,
    latestHumanResponse: input.clearOnly ? item.latestHumanResponse : response,
    suggestionActedAt:
      item.addedBy === "ai_suggestion"
        ? (item.suggestionActedAt ?? now)
        : item.suggestionActedAt,
    requiredAction: undefined,
    version: item.version + 1,
    updatedAt: now,
  });
  await recordQueueActivity(ctx, item, actor, {
    type: "inputProvided",
    fromState: item.state,
    toState: effectiveQueueState(item, now),
    message: input.clearOnly
      ? "The person cleared the input flag."
      : `Human response: ${response}`,
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
  if (await findActivityReplay(ctx, item._id, input.idempotencyKey))
    return item;
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
    expiresAt: undefined,
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

/**
 * Attach durable move work to a handoff without claiming or completing it.
 * Canonical OAuth MCP uses this narrow path because its grant can save move
 * work but deliberately cannot perform Queue state transitions.
 */
export async function linkQueueResultWithoutTransition(
  ctx: MutationCtx,
  actor: QueueAccessActor,
  input: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    queueItemId: Id<"queueItems">;
    resultSummary: string;
    resultRef: QueueResultRef;
    idempotencyKey: string;
  },
) {
  const item = await requireQueueItem(ctx, input);
  requireQueueItemAction(actor, item);
  if (await findActivityReplay(ctx, item._id, input.idempotencyKey))
    return item;
  const resultSummary = normalizeQueueText(
    input.resultSummary,
    "resultSummary",
    4000,
  );
  if (!resultSummary)
    throw new ConvexError("A linked result summary is required.");
  const [resultRef] =
    (await validateQueueResultRefs(ctx, item, [input.resultRef])) ?? [];
  if (!resultRef)
    throw new ConvexError("A linked result reference is required.");
  const resultRefs = [
    ...(item.resultRefs ?? []).filter(
      (existing) =>
        existing.type !== resultRef.type || existing.id !== resultRef.id,
    ),
    resultRef,
  ].slice(-50);
  const now = Date.now();
  await ctx.db.patch(item._id, {
    resultSummary,
    resultRefs,
    version: item.version + 1,
    updatedAt: now,
  });
  await recordQueueActivity(ctx, item, actor, {
    type: "resultLinked",
    fromState: item.state,
    toState: item.state,
    message: resultSummary,
    resultRefCount: 1,
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
  if (await findActivityReplay(ctx, item._id, input.idempotencyKey))
    return item;
  requireActiveClaim(item, actor);
  assertExpectedQueueVersion(item.version, input.expectedVersion);
  const code = normalizeQueueText(input.code, "code", 100);
  const message = normalizeQueueText(input.message, "message", 2000);
  if (!code || !message)
    throw new ConvexError("Failure code and message are required.");
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
  if (transition.state === "waitingForAi")
    requireTransition(item.state, "waitingForAi");
  const now = Date.now();
  const nextAttemptAt =
    transition.state === "waitingForAi"
      ? now +
        Math.min(Math.max(input.retryAfterMs ?? 0, 0), 24 * 60 * 60 * 1000)
      : undefined;
  const requiredAction =
    transition.state === "needsYou"
      ? `Review this failed handoff and choose whether to revise or cancel it: ${message}`
      : undefined;
  await ctx.db.patch(item._id, {
    state: transition.state === "needsYou" ? item.state : "waitingForAi",
    needsInput: transition.state === "needsYou" ? true : item.needsInput,
    needsInputAt: transition.state === "needsYou" ? now : undefined,
    needsInputBy:
      transition.state === "needsYou"
        ? (actor.label ?? actor.actorType)
        : undefined,
    waitingReason:
      transition.state === "waitingForAi" ? "retryScheduled" : "ready",
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
    toState: transition.state === "needsYou" ? item.state : "waitingForAi",
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
  requireQueueItemVisible(actor, item);
  requireQueueItemAction(actor, item);
  if (
    (actor.actorType !== "user" &&
      !(
        actor.actorType === "system" &&
        input.terminalReason === "expired" &&
        item.expiresAt !== undefined &&
        item.expiresAt <= Date.now() &&
        actor.userId === item.ownerUserId
      )) ||
    (actor.userId !== item.ownerUserId && !actor.isManager)
  ) {
    throw new ConvexError(
      "Only the Queue owner or a move manager can cancel this handoff.",
    );
  }
  if (await findActivityReplay(ctx, item._id, input.idempotencyKey))
    return item;
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

    nextStep: undefined,
    waitingReason: undefined,
    claimedByUserId: undefined,
    claimedByApiKeyId: undefined,
    claimedByLabel: undefined,
    claimedAt: undefined,
    claimExpiresAt: undefined,
    nextAttemptAt: undefined,
    expiresAt: undefined,
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

/** Person decisions and AI withdrawals are deliberately separate from work commands. */
export async function reviewQueueSuggestion(
  ctx: MutationCtx,
  actor: QueueAccessActor,
  input: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    queueItemId: Id<"queueItems">;
    action: "accept" | "dismiss" | "restore" | "withdraw" | "archive";
    directive?: string;
    optionIndex?: number;
    reason?: string;
    expectedVersion?: number;
    idempotencyKey: string;
  },
) {
  if (!input.idempotencyKey?.trim())
    throw new ConvexError(
      "A nonempty operationId is required for suggestion decisions.",
    );
  const item = await requireQueueItem(ctx, input);
  if (actor.userId !== item.ownerUserId)
    throw new ConvexError("Only this Queue's owner can decide.");
  if (
    actor.actorType !== "user" &&
    queueNeedsInput(item) &&
    ["archive", "dismiss", "withdraw"].includes(input.action)
  )
    throw new ConvexError("Only the person can clear Needs your input");
  const isWithdraw = input.action === "withdraw";
  if (actor.actorType !== "user" && !isWithdraw)
    throw new ConvexError(
      "Only the person can accept, dismiss, edit-accept, archive or restore suggestions.",
    );
  if (
    isWithdraw &&
    (actor.actorType === "user" ||
      item.addedByConnection !==
        (actor.connectionId ?? String(actor.apiKeyId ?? "")))
  )
    throw new ConvexError("An AI can withdraw only its own suggestion.");
  if (isWithdraw && item.suggestionActedAt !== undefined)
    throw new ConvexError("The person has already acted on this suggestion.");
  if (await findActivityReplay(ctx, item._id, input.idempotencyKey))
    return item;
  assertExpectedQueueVersion(item.version, input.expectedVersion);
  const now = Date.now();
  const patch: Partial<Doc<"queueItems">> = {
    updatedAt: now,
    version: item.version + 1,
  };
  if (input.action === "archive") {
    if (!queueIsWork(item))
      throw new ConvexError("Dismiss a suggestion instead.");
    patch.archivedAt = now;
  } else if (input.action === "restore") {
    if (item.archivedAt === undefined)
      throw new ConvexError("This item is not archived.");
    patch.archivedAt = undefined;
    if (item.suggestionStatus === "dismissed")
      patch.suggestionDismissedAt =
        item.suggestionDismissedAt ?? item.suggestionActedAt ?? now;
    if (
      item.addedBy === "ai_suggestion" &&
      item.suggestionStatus !== "accepted"
    )
      patch.suggestionStatus = "open";
  } else {
    if (
      item.addedBy !== "ai_suggestion" ||
      item.suggestionStatus !== "open" ||
      item.archivedAt !== undefined
    )
      throw new ConvexError("This suggestion is no longer open.");
    if (input.action === "accept") {
      const option =
        input.optionIndex === undefined
          ? undefined
          : item.suggestionOptions?.[input.optionIndex];
      if (input.optionIndex !== undefined && !option)
        throw new ConvexError("Choose an existing option.");
      const directive = normalizeQueueText(
        input.directive ?? option ?? item.directive,
        "directive",
        4000,
      );
      if (!directive) throw new ConvexError("A directive is required.");
      Object.assign(patch, {
        directive,
        suggestionStatus: "accepted",
        state: "waitingForAi",
        waitingReason: "ready",
      });
    } else {
      if (input.reason !== undefined && input.reason.length > 4000)
        throw new ConvexError("Reason must be at most 4000 characters.");
      Object.assign(patch, {
        suggestionStatus: isWithdraw ? "withdrawn" : "dismissed",
        archivedAt: now,
        dismissReason: input.reason,
        suggestionDismissedAt: isWithdraw
          ? item.suggestionDismissedAt
          : (item.suggestionDismissedAt ?? now),
      });
    }
  }
  // First person action is permanent, including after archive/reopen cycles.
  if (!isWithdraw) patch.suggestionActedAt = item.suggestionActedAt ?? now;
  await ctx.db.patch(item._id, patch);
  await recordQueueActivity(ctx, item, actor, {
    type: "suggestionReviewed",
    fromState: item.state,
    toState: patch.state ?? item.state,
    message: `${input.action}${input.reason !== undefined ? ": " + input.reason : ""}`,
    idempotencyKey: input.idempotencyKey,
  });
  return (await ctx.db.get(item._id))!;
}

/** An exact count, not a first-page length. Only the authenticated owner's ideas. */
export async function readQueueSuggestions(
  ctx: QueueCtx,
  actor: QueueAccessActor,
  input: {
    moveId: Id<"moves">;
    archived?: boolean;
    cursor?: string;
    limit?: number;
  },
) {
  const rows = await ctx.db
    .query("queueItems")
    .withIndex("by_move_owner_updated", (q) =>
      q.eq("moveId", input.moveId).eq("ownerUserId", actor.userId),
    )
    .collect();
  const suggestions = rows.filter(
    (item) =>
      item.addedBy === "ai_suggestion" &&
      (input.archived
        ? item.archivedAt !== undefined
        : item.suggestionStatus === "open" && item.archivedAt === undefined),
  );
  const offset = Number(input.cursor ?? "0");
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 50), 1), 100);
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isFinite(limit))
    throw new ConvexError("Invalid suggestion cursor or limit.");
  return {
    items: await Promise.all(
      suggestions
        .slice(offset, offset + limit)
        .map(async (item) => await shapeQueueItemForRead(ctx, item)),
    ),
    nextCursor:
      offset + limit < suggestions.length ? String(offset + limit) : null,
    count: rows.filter(
      (item) =>
        item.addedBy === "ai_suggestion" &&
        item.suggestionStatus === "open" &&
        item.archivedAt === undefined,
    ).length,
  };
}

export async function shapeQueueItemForRead(
  ctx: QueueCtx,
  item: Doc<"queueItems">,
  now = Date.now(),
) {
  const shaped = shapeQueueItem(item, now);
  if (!item.fromRecord) return shaped;
  const tables = {
    item: "items",
    box: "boxes",
    space: "moveSpaces",
    planningRecord: "movePlanningRecords",
    queue: "queueItems",
  } as const;
  const ref = item.fromRecord;
  const table = tables[ref.type as keyof typeof tables];
  const id = table && ctx.db.normalizeId(table, ref.id);
  const record = id ? await ctx.db.get(id) : null;
  if (
    !record ||
    record.moveId !== item.moveId ||
    record.householdId !== item.householdId ||
    ("ownerUserId" in record
      ? record.ownerUserId !== item.ownerUserId
      : record.createdByUserId !== item.ownerUserId)
  )
    return { ...shaped, fromRecord: null, fromRecordHref: null };
  return shaped;
}
