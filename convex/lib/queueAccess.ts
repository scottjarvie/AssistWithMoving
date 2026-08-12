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
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { QueueActorType } from "./queue";
import { apiKeyEffectiveStatus } from "./apiKeys";

export function apiKeyCanReachQueueOwner(input: {
  now: number;
  key: {
    status: "active" | "revoked";
    expiresAt?: number;
    moveId?: Id<"moves">;
    scopes: readonly string[];
    createdByUserId: Id<"users">;
  };
  moveId: Id<"moves">;
  ownerUserId?: Id<"users">;
  membership?: {
    status: string;
    apiAccessStatus?: string;
  };
  participant?: {
    status: string;
    accessKind?: string;
    agentAccessStatus?: string;
    canRunQueueForUserIds?: Id<"users">[];
  };
}): boolean {
  const { key, membership, participant } = input;
  const activeMembership = membership?.status === "active";
  const activeParticipant = participant?.status === "active";
  const hasLiveAccess = key.moveId
    ? activeMembership
      ? membership.apiAccessStatus !== "disabled" &&
        (!activeParticipant || participant.agentAccessStatus !== "disabled")
      : activeParticipant &&
        participant.accessKind === "moveOnly" &&
        participant.agentAccessStatus !== "disabled"
    : activeMembership && membership.apiAccessStatus !== "disabled";
  const canRunSelectedOwner =
    input.ownerUserId === undefined ||
    key.createdByUserId === input.ownerUserId ||
    (participant?.status === "active" &&
      participant.canRunQueueForUserIds?.includes(input.ownerUserId) === true);
  return (
    apiKeyEffectiveStatus(key, input.now) === "active" &&
    (key.moveId === undefined || key.moveId === input.moveId) &&
    key.scopes.includes("queue/read") &&
    key.scopes.includes("queue/write") &&
    hasLiveAccess &&
    canRunSelectedOwner
  );
}

/**
 * Manager recovery is a person-only product capability. Agent and API-key
 * actors may use only their own Queue or an explicit Queue delegation, even
 * when their underlying human account manages the move.
 */
export function queueManagerRecoveryAllowed(input: {
  actorType: QueueActorType;
  hasManagerRole: boolean;
}): boolean {
  return input.actorType === "user" && input.hasManagerRole;
}

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
 * May `actor` RUN (list/claim) entries owned by `ownerUserId`? Yes if they
 * manage the move (owner/admin can run any queue on it — same short-circuit as
 * canViewQueueEntry/canActOnQueueEntry), it's their own queue, or they've been
 * delegated that owner's queue.
 */
export function canRunQueueForOwner(input: {
  actorUserId: Id<"users">;
  ownerUserId: Id<"users">;
  delegatedOwnerIds: Id<"users">[];
  isManager?: boolean;
}): boolean {
  if (input.isManager) return true;
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

/**
 * Every user whose queue this actor may run on the move. Managers get every
 * active household/member participant; non-managers get only their own queue
 * plus owner IDs explicitly delegated to them.
 */
export async function resolveRunnableQueueOwnerIds(
  ctx: QueryCtx | MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  actor: {
    userId: Id<"users">;
    isManager: boolean;
    delegatedOwnerIds: Id<"users">[];
  },
): Promise<Id<"users">[]> {
  const ids = new Set<Id<"users">>([actor.userId]);
  if (actor.isManager) {
    const [memberships, participants] = await Promise.all([
      ctx.db
        .query("householdMemberships")
        .withIndex("by_household", (q) => q.eq("householdId", householdId))
        .collect(),
      ctx.db
        .query("moveParticipants")
        .withIndex("by_household_move", (q) =>
          q.eq("householdId", householdId).eq("moveId", moveId),
        )
        .collect(),
    ]);
    for (const membership of memberships) {
      if (membership.status === "active") ids.add(membership.userId);
    }
    for (const participant of participants) {
      if (participant.status === "active" && participant.userId) {
        ids.add(participant.userId);
      }
    }
  } else {
    for (const id of actor.delegatedOwnerIds) ids.add(id);
  }
  return [...ids];
}
