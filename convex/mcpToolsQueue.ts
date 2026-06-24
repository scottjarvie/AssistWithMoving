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
  type IngestionQueueStatus,
} from "./lib/ingestionQueue";
import { requireMoveForSubject } from "./lib/mcpIdentity";

const QUEUE_LIMIT = 200;
const MAX_CLAIM_BATCH = 10;

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
    status: effectiveStatus(entry, now),
    instructions: entry.instructions ?? null,
    roomHint: entry.roomHint ?? null,
    dispositionHint: entry.dispositionHint ?? null,
    scopeHint: entry.scopeHint ?? null,
    intent: entry.intent ?? null,
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
    await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:read",
    );

    const limit = Math.min(args.limit ?? QUEUE_LIMIT, QUEUE_LIMIT);
    const now = Date.now();

    const entries = args.status
      ? await ctx.db
          .query("ingestionQueueEntries")
          .withIndex("by_move_status_order", (q) =>
            q.eq("moveId", args.moveId).eq("status", args.status!),
          )
          .take(limit)
      : await ctx.db
          .query("ingestionQueueEntries")
          .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
          .order("desc")
          .take(limit);

    return { entries: entries.map((entry) => shapeQueueEntry(entry, now)) };
  },
});

// ---- claim_queue -----------------------------------------------------------
export const claimQueueArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  batchSize: v.optional(v.number()),
  agentLabel: v.optional(v.string()),
};
export const claimQueue = mutation({
  args: claimQueueArgs,
  handler: async (ctx, args) => {
    const policy = await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const userId = policy.actor.userId;

    const batchSize = Math.min(Math.max(args.batchSize ?? 1, 1), MAX_CLAIM_BATCH);
    const now = Date.now();

    const queued = await ctx.db
      .query("ingestionQueueEntries")
      .withIndex("by_move_status_order", (q) =>
        q.eq("moveId", args.moveId).eq("status", "queued"),
      )
      .take(batchSize);

    // Reclaim expired claims if the queued pool came up short.
    let candidates = queued;
    if (candidates.length < batchSize) {
      const claimed = await ctx.db
        .query("ingestionQueueEntries")
        .withIndex("by_move_status_order", (q) =>
          q.eq("moveId", args.moveId).eq("status", "claimed"),
        )
        .take(QUEUE_LIMIT);
      const expired = claimed.filter((entry) =>
        ingestionClaimIsExpired(entry, now),
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
        actorType: "user",
        actorUserId: userId,
        category: "inventory",
        action: "mcp.queue_claimed",
        objectTable: "ingestionQueueEntries",
        metadata: {
          count: claimedIds.length,
          agentLabel: args.agentLabel ?? null,
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
    const policy = await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const userId = policy.actor.userId;

    const entry = await ctx.db.get(args.entryId);
    if (
      !entry ||
      entry.householdId !== args.householdId ||
      entry.moveId !== args.moveId
    ) {
      throw new Error("Queue entry not found in this move.");
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
      resultItemIds: args.resultItemIds,
      processedAt: nextStatus === "processed" ? now : undefined,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
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
