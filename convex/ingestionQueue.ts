import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  canTransitionIngestionStatus,
  ingestionClaimDurationMs,
  ingestionClaimIsExpired,
  ingestionEntryIsEditable,
  ingestionQueueStatusValidator,
  ingestionScopeHintValidator,
  type IngestionQueueStatus,
} from "./lib/ingestionQueue";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";

const maxListLimit = 200;
const maxClaimBatch = 10;

async function requireUserActor(
  ctx: QueryCtx | MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  action: "inventory:read" | "inventory:edit",
) {
  const { actor } = await requireMovePermission(ctx, householdId, moveId, action);
  if (actor.type !== "user") {
    throw new Error(directConvexUserContextRequiredMessage);
  }
  return actor;
}

async function requireEntry(
  ctx: QueryCtx | MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    entryId: Id<"ingestionQueueEntries">;
  },
) {
  const entry = await ctx.db.get(args.entryId);
  if (
    !entry ||
    entry.householdId !== args.householdId ||
    entry.moveId !== args.moveId
  ) {
    throw new Error("Ingestion queue entry not found.");
  }
  return entry;
}

async function validateMediaIds(
  ctx: QueryCtx | MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    mediaPhotoIds: Id<"itemPhotos">[];
  },
) {
  for (const photoId of args.mediaPhotoIds) {
    const photo = await ctx.db.get(photoId);
    if (
      !photo ||
      photo.householdId !== args.householdId ||
      photo.moveId !== args.moveId ||
      photo.archivedAt
    ) {
      throw new Error("Attached media does not belong to this move.");
    }
  }
}

function effectiveStatus(
  entry: Doc<"ingestionQueueEntries">,
  now: number,
): IngestionQueueStatus {
  // Expired claims read as queued so abandoned agent runs do not strand work.
  return ingestionClaimIsExpired(entry, now) ? "queued" : entry.status;
}

async function transitionEntry(
  ctx: MutationCtx,
  entry: Doc<"ingestionQueueEntries">,
  to: IngestionQueueStatus,
  now: number,
) {
  const from = effectiveStatus(entry, now);
  if (!canTransitionIngestionStatus(from, to)) {
    throw new Error(`Cannot move a ${from} queue entry to ${to}.`);
  }
}

export const createEntry = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    instructions: v.optional(v.string()),
    roomHint: v.optional(v.string()),
    dispositionHint: v.optional(v.string()),
    scopeHint: v.optional(ingestionScopeHintValidator),
    mediaPhotoIds: v.optional(v.array(v.id("itemPhotos"))),
  },
  handler: async (ctx, args) => {
    const actor = await requireUserActor(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );

    const instructions = args.instructions?.trim() || undefined;
    const mediaPhotoIds = args.mediaPhotoIds ?? [];
    if (!instructions && mediaPhotoIds.length === 0) {
      throw new Error(
        "A queue entry needs instructions, media, or both — an empty entry gives an agent nothing to work on.",
      );
    }
    await validateMediaIds(ctx, { ...args, mediaPhotoIds });

    const now = Date.now();
    const entryId = await ctx.db.insert("ingestionQueueEntries", {
      householdId: args.householdId,
      moveId: args.moveId,
      status: "queued",
      instructions,
      roomHint: args.roomHint?.trim() || undefined,
      dispositionHint: args.dispositionHint?.trim() || undefined,
      scopeHint: args.scopeHint,
      mediaPhotoIds,
      sortOrder: now,
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "ingestion.entry_created",
      objectTable: "ingestionQueueEntries",
      objectId: entryId,
      metadata: { mediaCount: mediaPhotoIds.length },
    });

    return entryId;
  },
});

export const updateEntry = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    entryId: v.id("ingestionQueueEntries"),
    instructions: v.optional(v.string()),
    roomHint: v.optional(v.string()),
    dispositionHint: v.optional(v.string()),
    scopeHint: v.optional(ingestionScopeHintValidator),
    mediaPhotoIds: v.optional(v.array(v.id("itemPhotos"))),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireUserActor(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const entry = await requireEntry(ctx, args);
    const now = Date.now();
    if (!ingestionEntryIsEditable(effectiveStatus(entry, now))) {
      throw new Error(
        "Only queued or needs-input entries can be edited. Requeue it first.",
      );
    }

    if (args.mediaPhotoIds) {
      await validateMediaIds(ctx, {
        householdId: args.householdId,
        moveId: args.moveId,
        mediaPhotoIds: args.mediaPhotoIds,
      });
    }

    await ctx.db.patch(args.entryId, {
      ...(args.instructions !== undefined
        ? { instructions: args.instructions.trim() || undefined }
        : {}),
      ...(args.roomHint !== undefined
        ? { roomHint: args.roomHint.trim() || undefined }
        : {}),
      ...(args.dispositionHint !== undefined
        ? { dispositionHint: args.dispositionHint.trim() || undefined }
        : {}),
      ...(args.scopeHint !== undefined ? { scopeHint: args.scopeHint } : {}),
      ...(args.mediaPhotoIds !== undefined
        ? { mediaPhotoIds: args.mediaPhotoIds }
        : {}),
      ...(args.sortOrder !== undefined ? { sortOrder: args.sortOrder } : {}),
      // A user edit answers an agent question, so needs-input returns to queued.
      ...(entry.status === "needsInput"
        ? { status: "queued" as const, agentQuestion: undefined }
        : {}),
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "ingestion.entry_updated",
      objectTable: "ingestionQueueEntries",
      objectId: args.entryId,
    });
  },
});

export const setEntryStatus = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    entryId: v.id("ingestionQueueEntries"),
    status: ingestionQueueStatusValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireUserActor(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const entry = await requireEntry(ctx, args);
    const now = Date.now();
    await transitionEntry(ctx, entry, args.status, now);

    await ctx.db.patch(args.entryId, {
      status: args.status,
      ...(args.status === "queued"
        ? {
            claimedByUserId: undefined,
            claimedByApiKeyId: undefined,
            claimedByAgentLabel: undefined,
            claimedAt: undefined,
            claimExpiresAt: undefined,
          }
        : {}),
      ...(args.status === "resolved" ? { resolvedAt: now } : {}),
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: `ingestion.entry_${args.status}`,
      objectTable: "ingestionQueueEntries",
      objectId: args.entryId,
    });
  },
});

export const listForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    status: v.optional(ingestionQueueStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );

    const limit = Math.min(args.limit ?? maxListLimit, maxListLimit);
    const now = Date.now();

    if (args.status) {
      const entries = await ctx.db
        .query("ingestionQueueEntries")
        .withIndex("by_move_status_order", (q) =>
          q.eq("moveId", args.moveId).eq("status", args.status!),
        )
        .take(limit);
      return entries.map((entry) => ({
        ...entry,
        status: effectiveStatus(entry, now),
      }));
    }

    const entries = await ctx.db
      .query("ingestionQueueEntries")
      .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .take(limit);
    return entries.map((entry) => ({
      ...entry,
      status: effectiveStatus(entry, now),
    }));
  },
});

// Agent-facing: claim the oldest queued entries so two runs never
// double-process. Claims expire after ingestionClaimDurationMs.
export const claimNext = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    batchSize: v.optional(v.number()),
    agentLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireUserActor(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );

    const batchSize = Math.min(Math.max(args.batchSize ?? 1, 1), maxClaimBatch);
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
        .take(maxListLimit);
      const expired = claimed.filter((entry) =>
        ingestionClaimIsExpired(entry, now),
      );
      candidates = [...queued, ...expired].slice(0, batchSize);
    }

    const claimedIds: Id<"ingestionQueueEntries">[] = [];
    for (const entry of candidates) {
      await ctx.db.patch(entry._id, {
        status: "claimed",
        claimedByUserId: actor.userId,
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
        actorUserId: actor.userId,
        category: "inventory",
        action: "ingestion.entries_claimed",
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
    return claimedEntries.filter(Boolean);
  },
});

// Agent-facing: report what an entry produced. Proposed/created items should
// already exist (e.g. via AI intake suggestions or direct item creation) and
// are linked back here for review.
export const submitResult = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    entryId: v.id("ingestionQueueEntries"),
    agentSummary: v.optional(v.string()),
    resultItemIds: v.optional(v.array(v.id("items"))),
    needsInputQuestion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireUserActor(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const entry = await requireEntry(ctx, args);
    const now = Date.now();

    const question = args.needsInputQuestion?.trim();
    const nextStatus: IngestionQueueStatus = question
      ? "needsInput"
      : "processed";
    await transitionEntry(ctx, entry, nextStatus, now);

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
      actorUserId: actor.userId,
      category: "inventory",
      action:
        nextStatus === "processed"
          ? "ingestion.entry_processed"
          : "ingestion.entry_needs_input",
      objectTable: "ingestionQueueEntries",
      objectId: args.entryId,
      metadata: { resultItemCount: args.resultItemIds?.length ?? 0 },
    });
  },
});
