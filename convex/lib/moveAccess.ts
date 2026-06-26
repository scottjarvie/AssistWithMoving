// THE single source of truth for "what can this user do on this move".
//
// Both permission gates call this — the web/direct-Convex gate
// (convex/lib/permissions.ts requireMovePermission) and the OAuth MCP gateway
// gate (convex/lib/mcpIdentity.ts requireMoveForSubject) — so the two can never
// drift. The mmk_ REST gate (convex/lib/apiKeyAuth.ts) authorizes differently
// (by key scopes), but uses this resolver to clamp a participant-scoped key to
// the participant's effective role.
//
// Access model:
//  - A household member ("householdBacked", e.g. family) reaches EVERY move in
//    the household at their household role, optionally RAISED on a specific move
//    by an active moveParticipants row.
//  - A "moveOnly" participant (an outsider — mover/helper/company) reaches
//    EXACTLY this one move at the participant's role and NOTHING at the household
//    level. requireHouseholdPermission stays membership-only, so every
//    household-wide action (settings, member management, cross-move lists) still
//    denies a moveOnly participant.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { AuthorizationError, getActiveHouseholdMembership } from "./auth";
import type { HouseholdRole } from "./roles";
import { strongerHouseholdRole } from "./roles";

type Ctx = QueryCtx | MutationCtx;

export type MoveAccessKind = "householdBacked" | "moveOnly";

/**
 * The PURE access decision, factored out of the db wrapper so it can be
 * exhaustively unit-tested (the security matrix lives here). Given a user's
 * household-membership role (or null if not a member) and their active
 * participant row's role + accessKind (or null if none), return their effective
 * move role + how it's backed, or null if they have NO access to the move.
 *
 * Rules:
 *  - Household member: their household role, RAISED (never lowered) by an active
 *    participant role. Always "householdBacked".
 *  - Non-member with an active moveOnly participant: exactly the participant's
 *    role, "moveOnly".
 *  - A participant marked householdBacked but with NO membership (e.g. membership
 *    later disabled) gets NOTHING — fail closed, do not silently downgrade to a
 *    moveOnly grant.
 *  - Anyone else: null (deny).
 */
export function computeEffectiveMoveAccess(input: {
  membershipRole: HouseholdRole | null;
  participantRole: HouseholdRole | null;
  participantAccessKind: MoveAccessKind | null;
}): { role: HouseholdRole; accessKind: MoveAccessKind } | null {
  const { membershipRole, participantRole, participantAccessKind } = input;
  if (membershipRole) {
    const role = participantRole
      ? strongerHouseholdRole(membershipRole, participantRole)
      : membershipRole;
    return { role, accessKind: "householdBacked" };
  }
  if (participantRole && participantAccessKind === "moveOnly") {
    return { role: participantRole, accessKind: "moveOnly" };
  }
  return null;
}

export type MoveAccessResolution = {
  /** Effective role for this user on this move. */
  role: HouseholdRole;
  /** How the access is backed — drives the agent kill-switch source + UI. */
  accessKind: MoveAccessKind;
  /** The household membership row, if the user is a member (else null). */
  membership: Doc<"householdMemberships"> | null;
  /** The active participant row for this user+move, if any (else null). */
  participant: Doc<"moveParticipants"> | null;
  /** The move document (already validated to belong to householdId). */
  move: Doc<"moves">;
};

/**
 * Resolve a user's effective access to a single move, or throw
 * AuthorizationError if they have none. Does NOT check a specific
 * PermissionAction — callers gate on the returned role.
 */
export async function resolveMoveAccess(
  ctx: Ctx,
  userId: Id<"users">,
  householdId: Id<"households">,
  moveId: Id<"moves">
): Promise<MoveAccessResolution> {
  // 1. The move MUST belong to the named household. Without this, a member of
  //    household A could pass a moveId from household B alongside their own
  //    householdId and read B's data (the gateway twin already guarded this; the
  //    web path did not — this closes that hole for both).
  const move = await ctx.db.get(moveId);
  if (!move || move.householdId !== householdId) {
    throw new AuthorizationError("Move not found in this household.");
  }

  // 2. Household membership is OPTIONAL here — a moveOnly guest has none. Do not
  //    throw on a missing membership (that's what makes moveOnly access possible
  //    without leaking household-wide access, which stays membership-gated).
  const membership = await getActiveHouseholdMembership(
    ctx.db,
    householdId,
    userId
  );

  // 3. Active participant row for this concrete user on this move. Pending
  //    (email-only) rows have userId undefined and never match here.
  const participantRow = await ctx.db
    .query("moveParticipants")
    .withIndex("by_move_user", (q) =>
      q.eq("moveId", moveId).eq("userId", userId)
    )
    .unique();
  const participant =
    participantRow && participantRow.status === "active" ? participantRow : null;

  // 4. Effective role — the pure decision lives in computeEffectiveMoveAccess so
  //    the security matrix is unit-testable without a db.
  const decision = computeEffectiveMoveAccess({
    membershipRole: membership ? membership.role : null,
    participantRole: participant ? participant.role : null,
    participantAccessKind: participant ? participant.accessKind : null,
  });
  if (!decision) {
    throw new AuthorizationError("No access to this move.");
  }

  return {
    role: decision.role,
    accessKind: decision.accessKind,
    membership,
    participant,
    move,
  };
}

/**
 * Is this participant/membership's connected-agent access switched off by an
 * owner? Used by the agent paths (REST key auth + OAuth gateway) — NOT by the
 * human web path, where a person is not an agent. A moveOnly guest's switch
 * lives on the participant row; a household member's on the membership.
 */
export function agentAccessDisabled(resolution: MoveAccessResolution): boolean {
  if (resolution.participant?.agentAccessStatus === "disabled") return true;
  if (
    resolution.accessKind === "householdBacked" &&
    resolution.membership?.apiAccessStatus === "disabled"
  ) {
    return true;
  }
  return false;
}
