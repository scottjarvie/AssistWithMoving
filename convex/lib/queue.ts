import { ConvexError, v } from "convex/values";

/**
 * The family Queue vocabulary is deliberately smaller than Moving's domain
 * workflow vocabularies. Domain records retain their exact statuses; adapters
 * project only genuine human/AI handoffs into these four states.
 */
export const queueStates = [
  "needsYou",
  "working",
  "waitingForAi",
  "done",
] as const;

export type QueueState = (typeof queueStates)[number];

export const queueStateValidator = v.union(
  v.literal("needsYou"),
  v.literal("working"),
  v.literal("waitingForAi"),
  v.literal("done"),
);

export const queueStateLabels: Record<QueueState, string> = {
  needsYou: "Needs your input",
  working: "AI working",
  waitingForAi: "Waiting on AI",
  done: "Answered",
};

export const queuePriorities = ["normal", "urgent"] as const;
export type QueuePriority = (typeof queuePriorities)[number];
export const queuePriorityValidator = v.union(
  v.literal("normal"),
  v.literal("urgent"),
);

export const queueContextKinds = ["move", "room", "belongings"] as const;
export type QueueContextKind = (typeof queueContextKinds)[number];
export const queueContextKindValidator = v.union(
  v.literal("move"),
  v.literal("room"),
  v.literal("belongings"),
);

export const queueDomainKinds = [
  "general",
  "capture",
  "moveQuestion",
  "reviewSuggestion",
  "export",
] as const;
export type QueueDomainKind = (typeof queueDomainKinds)[number];
export const queueDomainKindValidator = v.union(
  v.literal("general"),
  v.literal("capture"),
  v.literal("moveQuestion"),
  v.literal("reviewSuggestion"),
  v.literal("export"),
);

export const queueActorTypes = ["user", "agent", "apiKey", "system"] as const;
export type QueueActorType = (typeof queueActorTypes)[number];
export const queueActorTypeValidator = v.union(
  v.literal("user"),
  v.literal("agent"),
  v.literal("apiKey"),
  v.literal("system"),
);

export const queueTerminalReasons = [
  "completed",
  "canceled",
  "expired",
] as const;
export type QueueTerminalReason = (typeof queueTerminalReasons)[number];
export const queueTerminalReasonValidator = v.union(
  v.literal("completed"),
  v.literal("canceled"),
  v.literal("expired"),
);

export const queueWaitingReasons = [
  "ready",
  "connectionUnknown",
  "aiConnectionRequired",
  "retryScheduled",
] as const;
export type QueueWaitingReason = (typeof queueWaitingReasons)[number];
export const queueWaitingReasonValidator = v.union(
  v.literal("ready"),
  v.literal("connectionUnknown"),
  v.literal("aiConnectionRequired"),
  v.literal("retryScheduled"),
);

export const queueActivityTypes = [
  "created",
  "suggestionReviewed",
  "archived",
  "restored",
  "claimed",
  "released",
  "inputRequested",
  "inputProvided",
  "resultLinked",
  "retryScheduled",
  "retryExhausted",
  "completed",
  "canceled",
  "expired",
] as const;
export type QueueActivityType = (typeof queueActivityTypes)[number];
export const queueActivityTypeValidator = v.union(
  v.literal("created"),
  v.literal("suggestionReviewed"),
  v.literal("archived"),
  v.literal("restored"),
  v.literal("claimed"),
  v.literal("released"),
  v.literal("inputRequested"),
  v.literal("inputProvided"),
  v.literal("resultLinked"),
  v.literal("retryScheduled"),
  v.literal("retryExhausted"),
  v.literal("completed"),
  v.literal("canceled"),
  v.literal("expired"),
);

export const queueResultRefValidator = v.object({
  type: v.string(),
  id: v.string(),
  label: v.optional(v.string()),
});

export const queueClaimDurationMs = 15 * 60 * 1000;
export const queueDefaultMaxAttempts = 3;
export const queueMaxPageSize = 100;

const allowedTransitions: Record<QueueState, readonly QueueState[]> = {
  waitingForAi: ["working", "needsYou", "done"],
  working: ["waitingForAi", "needsYou", "done"],
  needsYou: ["waitingForAi", "done"],
  done: [],
};

export function canTransitionQueueState(from: QueueState, to: QueueState) {
  return allowedTransitions[from].includes(to);
}

export function queueClaimIsExpired(
  item: { state: QueueState; claimExpiresAt?: number },
  now: number,
) {
  return (
    item.state === "working" &&
    typeof item.claimExpiresAt === "number" &&
    item.claimExpiresAt <= now
  );
}

export function effectiveQueueState(
  item: { state: QueueState; claimExpiresAt?: number },
  now: number,
): QueueState {
  if (item.state === "needsYou") return "waitingForAi"; // Legacy requests had released their claim.
  return queueClaimIsExpired(item, now) ? "waitingForAi" : item.state;
}

export function queueItemMatchesEffectiveState(
  item: QueueVisibility,
  requestedState: QueueState | undefined,
  now: number,
): boolean {
  if (!queueIsWork(item)) return false;
  if (requestedState === "needsYou") return queueNeedsInput(item);
  return (
    requestedState === undefined ||
    effectiveQueueState(item, now) === requestedState
  );
}

export type QueueStateInvariantInput = {
  needsInput?: boolean;
  waitingReason?: QueueWaitingReason;
  state: QueueState;
  requiredAction?: string;
  nextStep?: string;
  claimExpiresAt?: number;
  claimedByUserId?: string;
  claimedByApiKeyId?: string;
  resultSummary?: string;
  resultRefs?: readonly unknown[];
  terminalReason?: QueueTerminalReason;
};

export function queueStateInvariantError(
  input: QueueStateInvariantInput,
): string | null {
  if (input.state === "needsYou" && !input.requiredAction?.trim()) {
    return "Needs You requires the exact human decision or action.";
  }
  if (input.needsInput && !input.requiredAction?.trim())
    return "Needs your input requires the exact question.";
  if (input.state === "working") {
    if (
      input.waitingReason === "ready" &&
      !input.claimExpiresAt &&
      !input.claimedByUserId &&
      !input.claimedByApiKeyId
    )
      return null;
    if (!input.nextStep?.trim())
      return "Working requires the current next step.";
    if (!input.claimExpiresAt) return "Working requires a bounded claim lease.";
    if (!input.claimedByUserId && !input.claimedByApiKeyId) {
      return "Working requires an attributable claimant.";
    }
  }
  if (
    input.state === "waitingForAi" &&
    (input.claimExpiresAt || input.claimedByUserId || input.claimedByApiKeyId)
  ) {
    return "Waiting for your AI cannot retain an active claim.";
  }
  if (input.state === "done") {
    if (!input.terminalReason) return "Done requires a terminal reason.";
    if (
      input.terminalReason === "completed" &&
      !input.resultSummary?.trim() &&
      !input.resultRefs?.length
    ) {
      return "Completed work requires a readable result or result reference.";
    }
  }
  return null;
}

export function assertQueueStateInvariant(input: QueueStateInvariantInput) {
  const error = queueStateInvariantError(input);
  if (error) throw new ConvexError(error);
}

export function normalizeQueueLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) return 50;
  return Math.min(Math.max(Math.floor(limit ?? 50), 1), queueMaxPageSize);
}

export function normalizeQueueText(
  value: string | undefined,
  field: string,
  maxLength: number,
) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new ConvexError(`${field} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

/** Honest adapter for the existing capture pipeline; it does not rename storage. */
export function ingestionStatusToQueueState(
  status:
    | "queued"
    | "claimed"
    | "processed"
    | "needsInput"
    | "resolved"
    | "discarded",
  claimExpiresAt: number | undefined,
  now: number,
): QueueState {
  if (status === "queued") return "waitingForAi";
  if (status === "claimed") {
    return claimExpiresAt !== undefined && claimExpiresAt <= now
      ? "waitingForAi"
      : "working";
  }
  if (status === "processed" || status === "needsInput") return "needsYou";
  return "done";
}

export function queueFailureTransition(input: {
  attemptCount: number;
  maxAttempts: number;
  retryable: boolean;
}) {
  const nextAttemptCount = input.attemptCount + 1;
  const retryAvailable =
    input.retryable && nextAttemptCount < input.maxAttempts;
  return {
    nextAttemptCount,
    state: retryAvailable ? ("waitingForAi" as const) : ("needsYou" as const),
    activity: retryAvailable
      ? ("retryScheduled" as const)
      : ("retryExhausted" as const),
  };
}

export function assertExpectedQueueVersion(actual: number, expected?: number) {
  if (expected !== undefined && actual !== expected) {
    throw new ConvexError(
      `Queue item changed since it was read (expected version ${expected}, current version ${actual}). Refresh before retrying.`,
    );
  }
}

/** Persisted needsYou rows remain readable without rewriting historical data. */
export type QueueVisibility = {
  state: QueueState;
  claimExpiresAt?: number;
  addedBy?: string;
  suggestionStatus?: string;
  archivedAt?: number;
  needsInput?: boolean;
  requiredAction?: string;
};
export function queueNeedsInput(item: QueueVisibility) {
  return item.needsInput ?? item.state === "needsYou";
}
export function queueIsWork(item: QueueVisibility) {
  return (
    item.archivedAt === undefined &&
    !(item.addedBy === "ai_suggestion" && item.suggestionStatus !== "accepted")
  );
}
export function queueIsActionable(item: QueueVisibility) {
  return queueIsWork(item) && !queueNeedsInput(item);
}

/** Apply before pagination or reach accounting, not after a page has filled. */
export function queueWorkFilter(
  q: import("convex/server").FilterBuilder<
    import("../_generated/dataModel").DataModel["queueItems"]
  >,
) {
  return q.and(
    q.eq(q.field("archivedAt"), undefined),
    q.or(
      q.neq(q.field("addedBy"), "ai_suggestion"),
      q.eq(q.field("suggestionStatus"), "accepted"),
    ),
  );
}
export function captureNeedsInput(entry: {
  needsInput?: boolean;
  status: string;
}) {
  return (
    entry.needsInput ??
    (entry.status === "needsInput" || entry.status === "processed")
  );
}

export function captureReachFilter(
  q: import("convex/server").FilterBuilder<
    import("../_generated/dataModel").DataModel["ingestionQueueEntries"]
  >,
  userId: import("../_generated/dataModel").Id<"users">,
  delegates: import("../_generated/dataModel").Id<"users">[],
) {
  return q.or(
    ...[userId, ...delegates].map((id) =>
      q.or(
        q.eq(q.field("ownerUserId"), id),
        q.and(
          q.eq(q.field("ownerUserId"), undefined),
          q.eq(q.field("createdByUserId"), id),
        ),
      ),
    ),
  );
}
