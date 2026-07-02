import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import { autoAttachEntryPhotos } from "./lib/queuePhotoAttach";
import {
  canTransitionIngestionStatus,
  ingestionClaimDurationMs,
  ingestionClaimIsExpired,
  ingestionEntryIsEditable,
  ingestionItemKindValidator,
  ingestionQueueStatusValidator,
  ingestionScopeHintValidator,
  isMediaUploadPending,
  resolveAppendedMediaState,
  uploadRollupIsInactive,
  type IngestionQueueStatus,
} from "./lib/ingestionQueue";
import {
  dimensionsValidator,
  itemDispositionValidator,
} from "./lib/moveFields";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";
import { canPerformHouseholdAction } from "./lib/roles";
import {
  canActOnQueueEntry,
  canRunQueueForOwner,
  canViewQueueEntry,
  queueEntryOwnerUserId,
} from "./lib/queueAccess";

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

// Like requireUserActor, but also resolves the per-user queue context: whether
// the actor manages the move (sees all queues) and which other users' queues
// they've been delegated to run (canRunQueueForUserIds on their participant row).
async function resolveQueueActor(
  ctx: QueryCtx | MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  action: "inventory:read" | "inventory:edit",
) {
  const policy = await requireMovePermission(ctx, householdId, moveId, action);
  if (policy.actor.type !== "user") {
    throw new Error(directConvexUserContextRequiredMessage);
  }
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
    isManager: canPerformHouseholdAction(policy.role, "household:manage_members"),
    delegatedOwnerIds,
  };
}

type QueueActor = Awaited<ReturnType<typeof resolveQueueActor>>;

// Guard the "act on an existing entry" mutations (submit / requeue / discard /
// edit): only the entry owner, the current claim holder, a delegated runner, or
// a move manager may touch it — closes the hole where any inventory:edit user
// could overwrite another person's in-flight queue work.
function requireCanActOnEntry(
  actor: QueueActor,
  entry: Doc<"ingestionQueueEntries">,
) {
  if (
    !canActOnQueueEntry({
      actorUserId: actor.userId,
      entryOwnerUserId: queueEntryOwnerUserId(entry),
      claimedByUserId: entry.claimedByUserId,
      isManager: actor.isManager,
      delegatedOwnerIds: actor.delegatedOwnerIds,
    })
  ) {
    throw new Error(
      "You can only act on your own queue entries (or ones you've been delegated to run).",
    );
  }
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

// One-time backfill: stamp ownerUserId (from createdByUserId) onto queue rows
// created before per-user queues existed. Paginated so a large queue won't blow
// the mutation budget — call repeatedly with the returned cursor until isDone.
// Readers already coalesce undefined -> createdByUserId, so this is hygiene that
// makes the by_move_owner_status index complete, not a correctness gate.
export const backfillQueueOwnerUserId = internalMutation({
  args: { cursor: v.optional(v.string()), batch: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("ingestionQueueEntries")
      .paginate({ cursor: args.cursor ?? null, numItems: args.batch ?? 200 });
    let patched = 0;
    for (const entry of page.page) {
      if (entry.ownerUserId === undefined) {
        await ctx.db.patch(entry._id, { ownerUserId: entry.createdByUserId });
        patched += 1;
      }
    }
    return {
      patched,
      isDone: page.isDone,
      cursor: page.continueCursor,
    };
  },
});

// Read-only census of the orphaned-photo problem, so we can report the size of
// the fix before/after running the backfill below. Counts processed queue
// entries whose uploaded photos are still unattached (no itemId and no boxId),
// split by what the backfill would be able to do with them. Paginated.
export const countOrphanedQueuePhotos = internalQuery({
  args: { cursor: v.optional(v.string()), batch: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("ingestionQueueEntries")
      .paginate({ cursor: args.cursor ?? null, numItems: args.batch ?? 200 });
    let processedWithPhotos = 0;
    let unattachedPhotos = 0;
    let recoverableToItem = 0; // capture produced exactly one item
    let recoverableToLocation = 0; // box / space / transport targeted
    let ambiguous = 0; // multiple result items, no single target
    for (const entry of page.page) {
      if (entry.status !== "processed") continue;
      const photoIds = entry.mediaPhotoIds ?? [];
      if (photoIds.length === 0) continue;
      processedWithPhotos += 1;
      let entryUnattached = 0;
      for (const photoId of photoIds) {
        const photo = await ctx.db.get(photoId);
        if (!photo || photo.archivedAt) continue;
        if (!photo.itemId && !photo.boxId) entryUnattached += 1;
      }
      if (entryUnattached === 0) continue;
      unattachedPhotos += entryUnattached;
      const singleItem = (entry.resultItemIds ?? []).length === 1;
      const hasLocation =
        entry.targetBoxId || entry.targetSpaceId || entry.targetTransportId;
      if (singleItem) recoverableToItem += entryUnattached;
      else if (hasLocation) recoverableToLocation += entryUnattached;
      else ambiguous += entryUnattached;
    }
    return {
      processedWithPhotos,
      unattachedPhotos,
      recoverableToItem,
      recoverableToLocation,
      ambiguous,
      isDone: page.isDone,
      cursor: page.continueCursor,
    };
  },
});

// One-time backfill: heal queue captures that were processed BEFORE the
// auto-attach loop shipped (convex/lib/queuePhotoAttach.ts). For every processed
// entry it re-runs the SAME conservative auto-attach, so each stranded photo gets
// filed onto the item (single-item captures) / box / room / transport the capture
// produced. Idempotent: autoAttachEntryPhotos skips any photo already filed
// (itemId || boxId), so a second pass relinks zero. Paginated — call repeatedly
// with the returned cursor until isDone.
export const backfillQueueEntryPhotos = internalMutation({
  args: { cursor: v.optional(v.string()), batch: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const page = await ctx.db
      .query("ingestionQueueEntries")
      .paginate({ cursor: args.cursor ?? null, numItems: args.batch ?? 200 });
    let scannedEntries = 0;
    let eligibleEntries = 0;
    let relinkedPhotos = 0;
    for (const entry of page.page) {
      scannedEntries += 1;
      if (entry.status !== "processed") continue;
      if (!entry.mediaPhotoIds || entry.mediaPhotoIds.length === 0) continue;
      eligibleEntries += 1;
      relinkedPhotos += await autoAttachEntryPhotos(
        ctx,
        entry,
        entry.resultItemIds,
        now,
      );
    }
    return {
      scannedEntries,
      eligibleEntries,
      relinkedPhotos,
      isDone: page.isDone,
      cursor: page.continueCursor,
    };
  },
});

// Read-only x-ray of the queue, so we can tell the AI's already-done-but-never-
// closed entries from genuinely new ones before cleaning up. Returns counts by
// status plus every still-open entry (oldest first) with the signals that hint
// at "was this actually worked on" (claimed agent, summary, result items).
export const censusQueueState = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("ingestionQueueEntries").collect();
    const byStatus: Record<string, number> = {};
    const open: Array<Record<string, unknown>> = [];
    for (const e of all) {
      byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
      if (
        e.status === "processed" ||
        e.status === "resolved" ||
        e.status === "discarded"
      ) {
        continue;
      }
      open.push({
        id: String(e._id),
        status: e.status,
        createdAt: e._creationTime,
        claimedAt: e.claimedAt ?? null,
        agent: e.claimedByAgentLabel ?? null,
        summary: e.agentSummary ? e.agentSummary.slice(0, 90) : null,
        label: (e.targetLabel ?? e.instructions ?? "").slice(0, 90),
        photos: e.mediaPhotoIds.length,
        results: e.resultItemIds?.length ?? 0,
        intent: e.intent ?? null,
      });
    }
    open.sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
    return { total: all.length, byStatus, openCount: open.length, open };
  },
});

// Admin/CLI cleanup: close out queue entries the AI processed into the database
// but never marked done (so the queue stays clear). Pass the explicit ids chosen
// from the census — never a blanket close, so genuinely-new unprocessed entries
// are never touched. Skips ids that are already in a terminal state.
export const closeQueueEntriesById = internalMutation({
  args: {
    entryIds: v.array(v.id("ingestionQueueEntries")),
    status: v.union(
      v.literal("processed"),
      v.literal("resolved"),
      v.literal("discarded"),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let closed = 0;
    const skipped: string[] = [];
    for (const entryId of args.entryIds) {
      const entry = await ctx.db.get(entryId);
      if (
        !entry ||
        entry.status === "processed" ||
        entry.status === "resolved" ||
        entry.status === "discarded"
      ) {
        skipped.push(String(entryId));
        continue;
      }
      await ctx.db.patch(entryId, {
        status: args.status,
        resolvedAt: now,
        processedAt:
          args.status === "processed" ? (entry.processedAt ?? now) : entry.processedAt,
        updatedAt: now,
      });
      closed += 1;
    }
    return { closed, skipped };
  },
});

// Validate that a capture's structured space/transport refs (agent gap #4)
// actually belong to this move — agents can pass arbitrary ids. Exported so the
// MCP capture_to_queue path reuses the same guard.
export async function assertCaptureStructuredRefs(
  ctx: MutationCtx,
  moveId: Id<"moves">,
  refs: {
    startingSpaceId?: Id<"moveSpaces">;
    presentSpaceId?: Id<"moveSpaces">;
    presentTransportId?: Id<"transportResources">;
  },
) {
  for (const spaceId of [refs.startingSpaceId, refs.presentSpaceId]) {
    if (!spaceId) continue;
    const space = await ctx.db.get(spaceId);
    if (!space || space.moveId !== moveId) {
      throw new Error("That space is not part of this move.");
    }
  }
  if (refs.presentTransportId) {
    const transport = await ctx.db.get(refs.presentTransportId);
    if (!transport || transport.moveId !== moveId) {
      throw new Error("That transport is not part of this move.");
    }
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
    // How many photos the client will upload in the background AFTER this entry
    // is saved. When it exceeds what is already attached, the entry is created
    // in the "uploading" rollup state until appendMedia catches up.
    expectedMediaCount: v.optional(v.number()),
    // Structured capture hints (agent gap #4) — pre-declared so the processing
    // agent applies them directly instead of re-parsing the instructions.
    itemKind: v.optional(ingestionItemKindValidator),
    estimatedWeightLb: v.optional(v.number()),
    dimensionsIn: v.optional(dimensionsValidator),
    disposition: v.optional(itemDispositionValidator),
    startingSpaceId: v.optional(v.id("moveSpaces")),
    presentSpaceId: v.optional(v.id("moveSpaces")),
    presentTransportId: v.optional(v.id("transportResources")),
  },
  handler: async (ctx, args) => {
    const actor = await requireUserActor(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    await assertCaptureStructuredRefs(ctx, args.moveId, args);

    const instructions = args.instructions?.trim() || undefined;
    const mediaPhotoIds = args.mediaPhotoIds ?? [];
    const expectedMediaCount = args.expectedMediaCount;
    if (
      !instructions &&
      mediaPhotoIds.length === 0 &&
      !(expectedMediaCount && expectedMediaCount > 0)
    ) {
      throw new Error(
        "A queue entry needs instructions, media, or both — an empty entry gives an agent nothing to work on.",
      );
    }
    await validateMediaIds(ctx, { ...args, mediaPhotoIds });

    const now = Date.now();
    const mediaUploadState =
      expectedMediaCount && mediaPhotoIds.length < expectedMediaCount
        ? ("uploading" as const)
        : undefined;
    const entryId = await ctx.db.insert("ingestionQueueEntries", {
      householdId: args.householdId,
      moveId: args.moveId,
      status: "queued",
      instructions,
      roomHint: args.roomHint?.trim() || undefined,
      dispositionHint: args.dispositionHint?.trim() || undefined,
      scopeHint: args.scopeHint,
      itemKind: args.itemKind,
      estimatedWeightLb: args.estimatedWeightLb,
      dimensionsIn: args.dimensionsIn,
      disposition: args.disposition,
      startingSpaceId: args.startingSpaceId,
      presentSpaceId: args.presentSpaceId,
      presentTransportId: args.presentTransportId,
      mediaPhotoIds,
      expectedMediaCount,
      mediaUploadState,
      sortOrder: now,
      // This capture belongs to the creator's PERSONAL queue.
      ownerUserId: actor.userId,
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
    const actor = await resolveQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const entry = await requireEntry(ctx, args);
    requireCanActOnEntry(actor, entry);
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

// Background upload: attach photos to an already-saved entry as they finish
// uploading. Unlike updateEntry this APPENDS (never replaces) media and must NOT
// answer an agent's question — adding a photo to a needsInput entry must leave it
// in needsInput with its agentQuestion intact.
export const appendMedia = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    entryId: v.id("ingestionQueueEntries"),
    mediaPhotoIds: v.array(v.id("itemPhotos")),
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
        "Photos can only be added to queued or needs-input entries.",
      );
    }

    await validateMediaIds(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      mediaPhotoIds: args.mediaPhotoIds,
    });

    const existing = new Set(entry.mediaPhotoIds);
    const mediaPhotoIds = [
      ...entry.mediaPhotoIds,
      ...args.mediaPhotoIds.filter((id) => !existing.has(id)),
    ];

    // Recompute the rollup (see resolveAppendedMediaState for the why): a missing
    // expectedMediaCount resolves to "complete" so F3/MCP/old entries don't strand
    // un-claimable, and a prior "failed" stays sticky until the count is reached.
    const mediaUploadState = resolveAppendedMediaState({
      expectedMediaCount: entry.expectedMediaCount,
      priorState: entry.mediaUploadState,
      attachedCount: mediaPhotoIds.length,
    });

    await ctx.db.patch(args.entryId, {
      mediaPhotoIds,
      mediaUploadState,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "ingestion.media_appended",
      objectTable: "ingestionQueueEntries",
      objectId: args.entryId,
      metadata: {
        added: mediaPhotoIds.length - entry.mediaPhotoIds.length,
        total: mediaPhotoIds.length,
      },
    });
  },
});

// Background upload: let the client mark a permanently-failed upload ("failed",
// surfaced as a retry affordance — the entry stays saved, never auto-discarded)
// or DISMISS a stuck pending state ("complete", which also pins expectedMediaCount
// down to what actually attached so isMediaUploadPending stops flagging it).
export const setMediaUploadState = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    entryId: v.id("ingestionQueueEntries"),
    state: v.union(v.literal("failed"), v.literal("complete")),
    // When dismissing to "complete", also lower expectedMediaCount to the number
    // of photos already attached so nothing reads as still-pending.
    finalizeCount: v.optional(v.boolean()),
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

    await ctx.db.patch(args.entryId, {
      mediaUploadState: args.state,
      ...(args.finalizeCount
        ? { expectedMediaCount: entry.mediaPhotoIds.length }
        : {}),
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "ingestion.media_upload_state",
      objectTable: "ingestionQueueEntries",
      objectId: args.entryId,
      metadata: { state: args.state },
    });
  },
});

// How long a capture may sit mid-upload before we treat it as abandoned. The
// presigned upload session TTL is 15 min (convex/photos.ts), and the client PUT
// timeout + retries cap a real upload well under that — so anything still
// "uploading" past this is a tab that reloaded/closed/dropped network mid-upload
// and left the rollup stranded (the dismiss/unmount abort path never fired).
const STUCK_UPLOADING_TTL_MS = 15 * 60 * 1000;

// Cron-driven sweep (see convex/crons.ts). Recovers captures stuck
// mediaUploadState==="uploading" with no live client job left to finish them —
// the strand that makes a capture un-claimable forever. Each is recomputed to
// its true terminal state: "complete" if every promised photo actually landed,
// else "failed" (which isMediaUploadPending treats as claimable, so the agent
// can process it from the note + whatever photos arrived). Bounded scan over the
// by_media_state_created index.
export const ageOutStuckUploadingEntries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - STUCK_UPLOADING_TTL_MS;
    const stuck = await ctx.db
      .query("ingestionQueueEntries")
      .withIndex("by_media_state_created", (q) =>
        q.eq("mediaUploadState", "uploading").lt("createdAt", cutoff),
      )
      .take(200);
    let aged = 0;
    for (const entry of stuck) {
      if (!uploadRollupIsInactive(entry, cutoff)) continue;
      const nextState = resolveAppendedMediaState({
        expectedMediaCount: entry.expectedMediaCount,
        priorState: "failed",
        attachedCount: entry.mediaPhotoIds.length,
      });
      if (nextState === "uploading") continue; // defensive: priorState "failed" never yields this
      await ctx.db.patch(entry._id, {
        mediaUploadState: nextState,
        updatedAt: now,
      });
      aged += 1;
    }
    if (aged > 0) {
      console.log(
        `[ageOutStuckUploadingEntries] aged ${aged}/${stuck.length} stuck-uploading captures`,
      );
    }
    return { scanned: stuck.length, aged };
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
    const actor = await resolveQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const entry = await requireEntry(ctx, args);
    requireCanActOnEntry(actor, entry);
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
    // "mine" (default, private) | "all" (managers only) | a specific user's queue
    // you've been delegated to run.
    ownerScope: v.optional(
      v.union(v.literal("mine"), v.literal("all"), v.id("users")),
    ),
  },
  handler: async (ctx, args) => {
    const actor = await resolveQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );

    const limit = Math.min(args.limit ?? maxListLimit, maxListLimit);
    const now = Date.now();
    // Managers (owner/admin) keep the whole-move view they had before per-user
    // queues; regular members default to their own private queue. Either can be
    // overridden with an explicit ownerScope.
    const ownerScope =
      args.ownerScope ?? (actor.isManager ? "all" : "mine");

    const raw = args.status
      ? await ctx.db
          .query("ingestionQueueEntries")
          .withIndex("by_move_status_order", (q) =>
            q.eq("moveId", args.moveId).eq("status", args.status!),
          )
          .take(maxListLimit)
      : await ctx.db
          .query("ingestionQueueEntries")
          .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
          .order("desc")
          .take(maxListLimit);

    const visible = raw.filter((entry) => {
      const ownerUserId = queueEntryOwnerUserId(entry);
      // Hard visibility gate: never show a queue the actor can't see.
      if (
        !canViewQueueEntry({
          actorUserId: actor.userId,
          ownerUserId,
          isManager: actor.isManager,
          delegatedOwnerIds: actor.delegatedOwnerIds,
        })
      ) {
        return false;
      }
      // Soft scope filter on top of the gate.
      if (ownerScope === "mine") return ownerUserId === actor.userId;
      if (ownerScope === "all") return true; // already gated above
      return ownerUserId === ownerScope; // a specific delegated owner
    });

    return visible.slice(0, limit).map((entry) => ({
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
    // Whose personal queue to claim from. Defaults to your own. Claiming another
    // user's queue requires a run-delegation from a move owner (requirement 5).
    ownerUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const actor = await resolveQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const targetOwnerId = args.ownerUserId ?? actor.userId;
    if (
      !canRunQueueForOwner({
        actorUserId: actor.userId,
        ownerUserId: targetOwnerId,
        delegatedOwnerIds: actor.delegatedOwnerIds,
        isManager: actor.isManager,
      })
    ) {
      throw new Error(
        "You don't have permission to run that person's queue. Ask a move owner to grant it.",
      );
    }

    const batchSize = Math.min(Math.max(args.batchSize ?? 1, 1), maxClaimBatch);
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
        .take(maxListLimit)
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
        .take(maxListLimit);
      const expired = claimed.filter(
        (entry) =>
          ownedByTarget(entry) &&
          ingestionClaimIsExpired(entry, now) &&
          !isMediaUploadPending(entry),
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
        // A delegated run (executor != owner) is an agent acting for the owner.
        actorType: targetOwnerId === actor.userId ? "user" : "agent",
        actorUserId: actor.userId,
        category: "inventory",
        action: "ingestion.entries_claimed",
        objectTable: "ingestionQueueEntries",
        metadata: {
          count: claimedIds.length,
          agentLabel: args.agentLabel ?? null,
          queueOwnerUserId: targetOwnerId,
          delegated: targetOwnerId !== actor.userId,
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
    const actor = await resolveQueueActor(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const entry = await requireEntry(ctx, args);
    requireCanActOnEntry(actor, entry);
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

    // Mirror the agent (MCP) path: a resolved capture's uploaded photos should
    // follow the inventory it produced. See convex/lib/queuePhotoAttach.ts.
    const attachedPhotoCount =
      nextStatus === "processed"
        ? await autoAttachEntryPhotos(ctx, entry, args.resultItemIds, now)
        : 0;

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
      metadata: {
        resultItemCount: args.resultItemIds?.length ?? 0,
        attachedPhotoCount,
      },
    });
  },
});
