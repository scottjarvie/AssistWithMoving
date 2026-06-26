// One-off reconciliation for duplicate user records left by a Clerk instance
// migration (prod was wired to an old Clerk instance, then switched to the real
// production instance — Clerk user ids are per-instance, so each person got a
// second Convex user row with a new clerkUserId, while their move grants stayed
// bound to the OLD row).
//
// mergeDuplicateUser re-points a stale user's access (moveParticipants +
// householdMemberships) onto the surviving (live) user, then retires the stale
// row by clearing its email + disabling it — which also un-breaks
// findActiveUserByEmail (it uses .unique() and throws when two active users
// share an email). Pass no survivingUserId to RETIRE ONLY (clear email +
// disable) without re-pointing anything. Idempotent: re-running is a no-op once
// the stale row has no access left and no email.
//
// Run via: npx convex run userReconcile:mergeDuplicateUser '{...}' --prod
import { ConvexError, v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";

// Disable a single household membership (e.g. remove someone from a stale,
// duplicate-named household so it stops cluttering their workspace switcher).
export const disableMembership = internalMutation({
  args: { membershipId: v.id("householdMemberships") },
  handler: async (ctx, { membershipId }) => {
    const m = await ctx.db.get(membershipId);
    if (!m) throw new ConvexError("Membership not found.");
    await ctx.db.patch(membershipId, { status: "disabled", updatedAt: Date.now() });
    return { householdId: m.householdId, userId: m.userId, status: "disabled" };
  },
});

// Archive a move (e.g. an emptied-out legacy duplicate). Hides it from move
// lists without deleting anything.
export const archiveMove = internalMutation({
  args: { moveId: v.id("moves") },
  handler: async (ctx, { moveId }) => {
    const move = await ctx.db.get(moveId);
    if (!move) throw new ConvexError("Move not found.");
    await ctx.db.patch(moveId, { status: "archived", updatedAt: Date.now() });
    return { moveId, title: move.title, status: "archived" };
  },
});

// Re-code a box (e.g. renumber an off-scheme "BOX-001" to the next "B-###").
// Enforces uniqueness within the move.
export const setBoxCode = internalMutation({
  args: { boxId: v.id("boxes"), code: v.string() },
  handler: async (ctx, { boxId, code }) => {
    const box = await ctx.db.get(boxId);
    if (!box) throw new ConvexError("Box not found.");
    const clash = await ctx.db
      .query("boxes")
      .withIndex("by_move_code", (q) =>
        q.eq("moveId", box.moveId).eq("code", code),
      )
      .unique();
    if (clash && clash._id !== boxId) {
      throw new ConvexError(`Code ${code} is already used on this move.`);
    }
    await ctx.db.patch(boxId, { code, updatedAt: Date.now() });
    return { boxId, from: box.code, to: code };
  },
});

export const mergeDuplicateUser = internalMutation({
  args: {
    staleUserId: v.id("users"),
    // When set, re-point the stale user's grants onto this live user. When
    // omitted, only retire the stale user (clear email + disable).
    survivingUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { staleUserId, survivingUserId }) => {
    const stale = await ctx.db.get(staleUserId);
    if (!stale) throw new ConvexError("Stale user not found.");

    const now = Date.now();
    const summary = {
      staleUserId,
      staleEmail: stale.email ?? null,
      survivingUserId: survivingUserId ?? null,
      participantsRepointed: 0,
      participantsDisabled: 0,
      membershipsRepointed: 0,
      membershipsDisabled: 0,
      retired: false,
    };

    if (survivingUserId) {
      if (survivingUserId === staleUserId) {
        throw new ConvexError("staleUserId and survivingUserId are the same.");
      }
      const survivor = await ctx.db.get(survivingUserId);
      if (!survivor) throw new ConvexError("Surviving user not found.");

      // Move participations (any status) on the stale user.
      const participations = await ctx.db
        .query("moveParticipants")
        .withIndex("by_user_status", (q) => q.eq("userId", staleUserId))
        .collect();
      for (const p of participations) {
        const survivorRow = await ctx.db
          .query("moveParticipants")
          .withIndex("by_move_user", (q) =>
            q.eq("moveId", p.moveId).eq("userId", survivingUserId),
          )
          .unique();
        if (survivorRow) {
          // Survivor already has a row on this move — don't create a duplicate.
          await ctx.db.patch(p._id, { status: "disabled", updatedAt: now });
          summary.participantsDisabled++;
        } else {
          await ctx.db.patch(p._id, { userId: survivingUserId, updatedAt: now });
          summary.participantsRepointed++;
        }
      }

      // Household memberships (any status) on the stale user.
      const memberships = await ctx.db
        .query("householdMemberships")
        .withIndex("by_user_status", (q) => q.eq("userId", staleUserId))
        .collect();
      for (const m of memberships) {
        const survivorMembership = await ctx.db
          .query("householdMemberships")
          .withIndex("by_household_user", (q) =>
            q.eq("householdId", m.householdId).eq("userId", survivingUserId),
          )
          .unique();
        if (survivorMembership) {
          await ctx.db.patch(m._id, { status: "disabled", updatedAt: now });
          summary.membershipsDisabled++;
        } else {
          await ctx.db.patch(m._id, { userId: survivingUserId, updatedAt: now });
          summary.membershipsRepointed++;
        }
      }
    }

    // Retire the stale user: clearing the email removes the duplicate by_email
    // key (so findActiveUserByEmail resolves to one), and disabling fails it
    // closed everywhere membership/participant status is checked. Reversible.
    await ctx.db.patch(staleUserId, {
      email: undefined,
      status: "disabled",
      updatedAt: now,
    });
    summary.retired = true;

    await recordAuditEvent(ctx, {
      actorType: "system",
      category: "system",
      action: survivingUserId
        ? "user.merged_duplicate"
        : "user.retired_duplicate",
      objectTable: "users",
      objectId: String(staleUserId),
      metadata: {
        survivingUserId: survivingUserId ?? undefined,
        participantsRepointed: summary.participantsRepointed,
        participantsDisabled: summary.participantsDisabled,
        membershipsRepointed: summary.membershipsRepointed,
        membershipsDisabled: summary.membershipsDisabled,
      },
    });

    return summary;
  },
});
