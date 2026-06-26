// OAuth MCP gateway tools for the capture queue — the agent loop INTO inventory.
//
// The capture queue (ingestionQueueEntries) bundles photos + the user's
// directions, waiting for the user's own AI agent to turn them into inventory.
// The write half (capture_to_queue) already lives in mcpToolsWrite.ts; these are
// the READ + CLAIM + REPORT half so an agent can actually work the queue:
//   list_queue          → see what's waiting (and any result/question on it)
//   claim_queue         → lock entries so two runs never double-process
//   submit_queue_result → mark processed + link created items, or ask the user
//
// Each resolves the user from the gateway-injected caller.subject via the
// identity bridge (NEVER ctx.auth) and mirrors the canonical mutations in
// convex/ingestionQueue.ts — that copy uses requireMovePermission (ctx.auth),
// which is null inside a gateway tool, so the logic is duplicated here over the
// subject bridge.
import { v } from "convex/values";
import { mcpCallerValidator } from "convex-mcp-gateway";

import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  canTransitionIngestionStatus,
  ingestionClaimDurationMs,
  ingestionClaimIsExpired,
  ingestionQueueStatusValidator,
  isMediaUploadPending,
  type IngestionQueueStatus,
} from "./lib/ingestionQueue";
import { requireMoveForSubject } from "./lib/mcpIdentity";
import { canPerformHouseholdAction } from "./lib/roles";
import {
  canActOnQueueEntry,
  canRunQueueForOwner,
  canViewQueueEntry,
  queueEntryOwnerUserId,
  queueOwnerDisplayName,
} from "./lib/queueAccess";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const QUEUE_LIMIT = 200;
const MAX_CLAIM_BATCH = 10;

// Per-user queue context for a gateway (agent) caller — mirrors
// resolveQueueActor in convex/ingestionQueue.ts so the two surfaces enforce the
// SAME ownership/delegation rules.
async function resolveQueueSubject(
  ctx: QueryCtx | MutationCtx,
  caller: { subject: string | null },
  householdId: Id<"households">,
  moveId: Id<"moves">,
  action: "inventory:read" | "inventory:edit",
) {
  const policy = await requireMoveForSubject(
    ctx,
    caller.subject,
    householdId,
    moveId,
    action,
  );
  const userId = policy.actor.userId;
  const participant = await ctx.db
    .query("moveParticipants")
    .withIndex("by_move_user", (q) =>
      q.eq("moveId", moveId).eq("userId", userId),
    )
    .unique();
  const delegatedOwnerIds =
    participant?.status === "active"
      ? (participant.canRunQueueForUserIds ?? [])
      : [];
  return {
    userId,
    isManager: canPerformHouseholdAction(
      policy.role,
      "household:manage_members",
    ),
    delegatedOwnerIds,
  };
}

// Expired claims read as queued so an abandoned agent run never strands work.
function effectiveStatus(
  entry: Doc<"ingestionQueueEntries">,
  now: number,
): IngestionQueueStatus {
  return ingestionClaimIsExpired(entry, now) ? "queued" : entry.status;
}

// Agent-friendly projection — the fields an agent needs to act, without raw
// internal claim bookkeeping.
function shapeQueueEntry(entry: Doc<"ingestionQueueEntries">, now: number) {
  return {
    entryId: entry._id,
    // Whose personal queue this belongs to — pass it as claim_queue.ownerUserId
    // to run a queue a move owner delegated to you (share a subscription).
    ownerUserId: queueEntryOwnerUserId(entry),
    status: effectiveStatus(entry, now),
    instructions: entry.instructions ?? null,
    roomHint: entry.roomHint ?? null,
    dispositionHint: entry.dispositionHint ?? null,
    scopeHint: entry.scopeHint ?? null,
    mediaUploadState: entry.mediaUploadState ?? null,
    intent: entry.intent ?? null,
    targetSpaceId: entry.targetSpaceId ?? null,
    targetTransportId: entry.targetTransportId ?? null,
    mediaPhotoIds: entry.mediaPhotoIds ?? [],
    agentQuestion: entry.agentQuestion ?? null,
    agentSummary: entry.agentSummary ?? null,
    resultItemIds: entry.resultItemIds ?? [],
    claimedByAgentLabel: entry.claimedByAgentLabel ?? null,
    claimExpiresAt: entry.claimExpiresAt ?? null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

// ---- list_queue ------------------------------------------------------------
export const listQueueArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  status: v.optional(ingestionQueueStatusValidator),
  limit: v.optional(v.number()),
};
export const listQueue = query({
  args: listQueueArgs,
  handler: async (ctx, args) => {
    const actor = await resolveQueueSubject(
      ctx,
      args.caller,
      args.householdId,
      args.moveId,
      "inventory:read",
    );

    const limit = Math.min(args.limit ?? QUEUE_LIMIT, QUEUE_LIMIT);
    const now = Date.now();

    const raw = args.status
      ? await ctx.db
          .query("ingestionQueueEntries")
          .withIndex("by_move_status_order", (q) =>
            q.eq("moveId", args.moveId).eq("status", args.status!),
          )
          .take(QUEUE_LIMIT)
      : await ctx.db
          .query("ingestionQueueEntries")
          .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
          .order("desc")
          .take(QUEUE_LIMIT);

    // An agent only sees the queues it may run: its own + any delegated; a
    // manager sees the whole move's queue.
    const visible = raw.filter((entry) =>
      canViewQueueEntry({
        actorUserId: actor.userId,
        ownerUserId: queueEntryOwnerUserId(entry),
        isManager: actor.isManager,
        delegatedOwnerIds: actor.delegatedOwnerIds,
      }),
    );

    // The owners whose queues this agent may actually CLAIM/RUN — its own plus
    // any a move owner delegated to it. Surfaced so the agent can discover a
    // shared queue (e.g. the move owner's) and target it with
    // claim_queue.ownerUserId, instead of only ever running its own.
    const runnableOwnerIds = Array.from(
      new Set<Id<"users">>([actor.userId, ...actor.delegatedOwnerIds]),
    );
    const runnableOwners = await Promise.all(
      runnableOwnerIds.map(async (id) => {
        const owner = await ctx.db.get(id);
        const queuedCount = raw.filter(
          (entry) =>
            queueEntryOwnerUserId(entry) === id &&
            effectiveStatus(entry, now) === "queued",
        ).length;
        return {
          ownerUserId: id,
          name: queueOwnerDisplayName(owner ?? {}),
          isSelf: id === actor.userId,
          queuedCount,
        };
      }),
    );

    return {
      entries: visible.slice(0, limit).map((entry) => shapeQueueEntry(entry, now)),
      // Pass one of these ownerUserIds to claim_queue to run that person's queue.
      runnableOwners,
    };
  },
});

// ---- claim_queue -----------------------------------------------------------
export const claimQueueArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  batchSize: v.optional(v.number()),
  agentLabel: v.optional(v.string()),
  // Whose personal queue to run. Defaults to the agent's own user. Running
  // another user's queue requires a move-owner delegation (share a subscription).
  ownerUserId: v.optional(v.id("users")),
};
export const claimQueue = mutation({
  args: claimQueueArgs,
  handler: async (ctx, args) => {
    const actor = await resolveQueueSubject(
      ctx,
      args.caller,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const userId = actor.userId;
    const targetOwnerId = args.ownerUserId ?? userId;
    if (
      !canRunQueueForOwner({
        actorUserId: userId,
        ownerUserId: targetOwnerId,
        delegatedOwnerIds: actor.delegatedOwnerIds,
      })
    ) {
      throw new Error(
        "You don't have permission to run that person's queue. Ask a move owner to grant it.",
      );
    }

    const batchSize = Math.min(Math.max(args.batchSize ?? 1, 1), MAX_CLAIM_BATCH);
    const now = Date.now();
    const ownedByTarget = (entry: Doc<"ingestionQueueEntries">) =>
      queueEntryOwnerUserId(entry) === targetOwnerId;

    // An entry whose media is still uploading isn't ready for an agent — skip it
    // so a half-uploaded capture is never claimed mid-flight. Only the target
    // owner's entries are eligible.
    const queued = (
      await ctx.db
        .query("ingestionQueueEntries")
        .withIndex("by_move_status_order", (q) =>
          q.eq("moveId", args.moveId).eq("status", "queued"),
        )
        .take(QUEUE_LIMIT)
    )
      .filter((entry) => ownedByTarget(entry) && !isMediaUploadPending(entry))
      .slice(0, batchSize);

    // Reclaim expired claims if the queued pool came up short.
    let candidates = queued;
    if (candidates.length < batchSize) {
      const claimed = await ctx.db
        .query("ingestionQueueEntries")
        .withIndex("by_move_status_order", (q) =>
          q.eq("moveId", args.moveId).eq("status", "claimed"),
        )
        .take(QUEUE_LIMIT);
      const expired = claimed.filter(
        (entry) =>
          ownedByTarget(entry) &&
          ingestionClaimIsExpired(entry, now) &&
          !isMediaUploadPending(entry),
      );
      candidates = [...queued, ...expired].slice(0, batchSize);
    }

    const claimedIds = [];
    for (const entry of candidates) {
      await ctx.db.patch(entry._id, {
        status: "claimed",
        claimedByUserId: userId,
        claimedByApiKeyId: undefined,
        claimedByAgentLabel: args.agentLabel?.trim() || undefined,
        claimedAt: now,
        claimExpiresAt: now + ingestionClaimDurationMs,
        updatedAt: now,
      });
      claimedIds.push(entry._id);
    }

    if (claimedIds.length) {
      await recordAuditEvent(ctx, {
        householdId: args.householdId,
        moveId: args.moveId,
        // A gateway claim is the user's connected AI agent acting on their behalf.
        actorType: "agent",
        actorUserId: userId,
        category: "inventory",
        action: "mcp.queue_claimed",
        objectTable: "ingestionQueueEntries",
        metadata: {
          count: claimedIds.length,
          agentLabel: args.agentLabel ?? null,
          queueOwnerUserId: targetOwnerId,
          delegated: targetOwnerId !== userId,
        },
      });
    }

    const claimedEntries = await Promise.all(
      claimedIds.map((id) => ctx.db.get(id)),
    );
    return {
      claimed: claimedEntries
        .filter((entry): entry is Doc<"ingestionQueueEntries"> => Boolean(entry))
        .map((entry) => shapeQueueEntry(entry, now)),
    };
  },
});

// ---- submit_queue_result ---------------------------------------------------
export const submitQueueResultArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  entryId: v.id("ingestionQueueEntries"),
  agentSummary: v.optional(v.string()),
  resultItemIds: v.optional(v.array(v.id("items"))),
  needsInputQuestion: v.optional(v.string()),
};
export const submitQueueResult = mutation({
  args: submitQueueResultArgs,
  handler: async (ctx, args) => {
    const actor = await resolveQueueSubject(
      ctx,
      args.caller,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const userId = actor.userId;

    const entry = await ctx.db.get(args.entryId);
    if (
      !entry ||
      entry.householdId !== args.householdId ||
      entry.moveId !== args.moveId
    ) {
      throw new Error("Queue entry not found in this move.");
    }

    // Don't let an agent overwrite a queue entry it doesn't own / hold / wasn't
    // delegated — closes the cross-user clobber hole on the gateway path too.
    if (
      !canActOnQueueEntry({
        actorUserId: userId,
        entryOwnerUserId: queueEntryOwnerUserId(entry),
        claimedByUserId: entry.claimedByUserId,
        isManager: actor.isManager,
        delegatedOwnerIds: actor.delegatedOwnerIds,
      })
    ) {
      throw new Error(
        "You can only submit results for your own queue entries (or ones you've been delegated to run).",
      );
    }

    const now = Date.now();
    const question = args.needsInputQuestion?.trim();
    const nextStatus: IngestionQueueStatus = question
      ? "needsInput"
      : "processed";

    const from = effectiveStatus(entry, now);
    if (!canTransitionIngestionStatus(from, nextStatus)) {
      throw new Error(
        `Cannot move a ${from} queue entry to ${nextStatus}. Claim it first with claim_queue.`,
      );
    }

    if (args.resultItemIds) {
      for (const itemId of args.resultItemIds) {
        const item = await ctx.db.get(itemId);
        if (
          !item ||
          item.householdId !== args.householdId ||
          item.moveId !== args.moveId
        ) {
          throw new Error("Result item does not belong to this move.");
        }
      }
    }

    await ctx.db.patch(args.entryId, {
      status: nextStatus,
      agentSummary: args.agentSummary?.trim() || undefined,
      agentQuestion: question || undefined,
      // Only overwrite the stored links when the caller actually provided them.
      // Omitting resultItemIds (e.g. on a needsInput question) must not wipe
      // links recorded by a prior submission.
      ...(args.resultItemIds !== undefined
        ? { resultItemIds: args.resultItemIds }
        : {}),
      processedAt: nextStatus === "processed" ? now : undefined,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "agent",
      actorUserId: userId,
      category: "inventory",
      action:
        nextStatus === "processed"
          ? "mcp.queue_processed"
          : "mcp.queue_needs_input",
      objectTable: "ingestionQueueEntries",
      objectId: args.entryId,
      metadata: { resultItemCount: args.resultItemIds?.length ?? 0 },
    });

    return { entryId: args.entryId, status: nextStatus };
  },
});
