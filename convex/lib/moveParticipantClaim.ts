// Claim pending move-participant invites when a verified email signs up.
//
// Mirrors claimPendingHouseholdInvitationsForUser, but for the move-scoped
// participant model — and CRUCIALLY: a moveOnly participant is activated WITHOUT
// ever creating a householdMemberships row, so an invited outsider (mover /
// helper / company) does NOT silently gain household-wide access. Only a
// householdBacked participant (family) also becomes a household member.
//
// Called only from server-attested email paths (the Clerk webhook, and the
// verified-identity branch of users.upsertCurrent) — never off a client-supplied
// email — so a pre-set move access can't be stolen by asserting someone's email.
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { recordAuditEvent } from "./audit";
import { activateHouseholdMemberForUser } from "./householdInvitations";
import {
  normalizeCollaboratorEmail,
  type ManagedHouseholdMemberRole,
} from "./householdMembers";

export async function claimPendingMoveParticipantsForUser(
  ctx: MutationCtx,
  {
    userId,
    email,
    actorType,
  }: {
    userId: Id<"users">;
    email: string | undefined;
    actorType: "user" | "webhook";
  },
) {
  // Self-heal (runs even without an email, keyed by userId): ensure any
  // ALREADY-active householdBacked participation has its household membership.
  // A half-applied historical claim could leave the participant row active but
  // the membership missing, which makes the person see only that one move and
  // get nagged to "set up a household". Re-running activateHouseholdMemberForUser
  // is idempotent.
  const activeRows = await ctx.db
    .query("moveParticipants")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "active"),
    )
    .collect();
  for (const row of activeRows) {
    if (row.accessKind === "householdBacked" && row.role !== "owner") {
      await activateHouseholdMemberForUser(ctx, {
        householdId: row.householdId,
        userId,
        email: row.invitedEmail ?? "",
        role: row.role as ManagedHouseholdMemberRole,
        actor:
          actorType === "user" ? { type: "user", userId } : { type: "webhook" },
      });
    }
  }

  if (!email) return [];
  const normalized = normalizeCollaboratorEmail(email);
  if (!normalized) return [];

  const pending = await ctx.db
    .query("moveParticipants")
    .withIndex("by_email_status", (q) =>
      q.eq("invitedEmail", normalized).eq("status", "invited"),
    )
    .collect();

  const claimed: Array<{
    participantId: Id<"moveParticipants">;
    moveId: Id<"moves">;
    householdId: Id<"households">;
  }> = [];
  const now = Date.now();

  for (const p of pending) {
    // Defensive: if a row for this user already exists on the move (e.g. they
    // were also added directly), void the duplicate pending invite instead of
    // creating two grants.
    const existingForUser = await ctx.db
      .query("moveParticipants")
      .withIndex("by_move_user", (q) =>
        q.eq("moveId", p.moveId).eq("userId", userId),
      )
      .unique();
    if (existingForUser && existingForUser._id !== p._id) {
      await ctx.db.patch(p._id, { status: "disabled", updatedAt: now });
      continue;
    }

    await ctx.db.patch(p._id, {
      userId,
      status: "active",
      claimedAt: now,
      updatedAt: now,
    });

    // ONLY householdBacked invites create a household membership. moveOnly stays
    // walled to this one move — no membership row, so requireHouseholdPermission
    // (membership-only) keeps denying them every household-wide action.
    if (p.accessKind === "householdBacked" && p.role !== "owner") {
      await activateHouseholdMemberForUser(ctx, {
        householdId: p.householdId,
        userId,
        email: normalized,
        role: p.role as ManagedHouseholdMemberRole,
        actor:
          actorType === "user" ? { type: "user", userId } : { type: "webhook" },
      });
    }

    await recordAuditEvent(ctx, {
      householdId: p.householdId,
      moveId: p.moveId,
      actorType,
      actorUserId: actorType === "user" ? userId : undefined,
      category: "household",
      action: "move_participant.claimed",
      objectTable: "moveParticipants",
      objectId: p._id,
      metadata: {
        email: normalized,
        role: p.role,
        accessKind: p.accessKind,
      },
    });

    claimed.push({
      participantId: p._id,
      moveId: p.moveId,
      householdId: p.householdId,
    });
  }

  return claimed;
}
