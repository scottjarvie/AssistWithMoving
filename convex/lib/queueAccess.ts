// Per-user queue ownership + run-delegation rules (requirement 5).
//
// Each capture-queue entry belongs to ONE user's personal queue (ownerUserId,
// backfilled from createdByUserId). By default you only see and run your own
// queue. A move owner can grant another participant the right to RUN a specific
// user's queue (share an AI subscription) — stored as canRunQueueForUserIds on
// the runner's participant row.
//
// These are pure functions so the authorization matrix is unit-testable; the
// Convex mutations (convex/ingestionQueue.ts web twin + convex/mcpToolsQueue.ts
// gateway twin) both call them so the two surfaces can't drift.
import type { Id } from "../_generated/dataModel";

// A friendly label for a queue owner shown in the picker / agent list. Prefers
// the real display name; falls back to the email's capitalized local part (so it
// reads "Scott's queue", not "Someone's queue", when a user hasn't set a name).
export function queueOwnerDisplayName(owner: {
  name?: string | null;
  email?: string | null;
}): string {
  const name = owner.name?.trim();
  if (name) return name;
  const local = owner.email?.split("@")[0]?.trim();
  if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  return "Someone";
}

export function queueEntryOwnerUserId(entry: {
  ownerUserId?: Id<"users">;
  createdByUserId: Id<"users">;
}): Id<"users"> {
  // Coalesce so rows created before ownerUserId existed still resolve to their
  // creator (the backfill makes this permanent, this is the straggler guard).
  return entry.ownerUserId ?? entry.createdByUserId;
}

function includesId(ids: Id<"users">[], id: Id<"users">): boolean {
  return ids.some((candidate) => candidate === id);
}

/**
 * May `actor` RUN (list/claim) entries owned by `ownerUserId`? Yes if it's their
 * own queue, or they've been delegated that owner's queue.
 */
export function canRunQueueForOwner(input: {
  actorUserId: Id<"users">;
  ownerUserId: Id<"users">;
  delegatedOwnerIds: Id<"users">[];
}): boolean {
  if (input.actorUserId === input.ownerUserId) return true;
  return includesId(input.delegatedOwnerIds, input.ownerUserId);
}

/**
 * May `actor` ACT on (submit a result / requeue / discard) a specific entry?
 * Closes the hole where any inventory:edit participant could overwrite another
 * user's in-flight claimed entry. Allowed for: a move manager (owner/admin can
 * fix their move's queue), the entry's owner, the user currently holding the
 * claim, or someone delegated that owner's queue.
 */
export function canActOnQueueEntry(input: {
  actorUserId: Id<"users">;
  entryOwnerUserId: Id<"users">;
  claimedByUserId?: Id<"users"> | undefined;
  isManager: boolean;
  delegatedOwnerIds: Id<"users">[];
}): boolean {
  if (input.isManager) return true;
  if (input.actorUserId === input.entryOwnerUserId) return true;
  if (input.claimedByUserId && input.actorUserId === input.claimedByUserId) {
    return true;
  }
  return includesId(input.delegatedOwnerIds, input.entryOwnerUserId);
}

/**
 * May `actor` SEE an entry owned by `ownerUserId` in the queue list? Managers
 * see the whole move's queue; everyone else sees their own + delegated.
 */
export function canViewQueueEntry(input: {
  actorUserId: Id<"users">;
  ownerUserId: Id<"users">;
  isManager: boolean;
  delegatedOwnerIds: Id<"users">[];
}): boolean {
  if (input.isManager) return true;
  return canRunQueueForOwner({
    actorUserId: input.actorUserId,
    ownerUserId: input.ownerUserId,
    delegatedOwnerIds: input.delegatedOwnerIds,
  });
}
