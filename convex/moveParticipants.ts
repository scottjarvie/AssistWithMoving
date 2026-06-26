// Move Participants — the access-granting "add a person to my move" surface.
//
// This is the unified People & Access model for a move:
//  - household members (family) reach every move at their household role;
//  - moveOnly participants (movers / helpers / companies) are walled to ONE move;
//  - a participant can be invited BY EMAIL + NAME before they have an account and
//    auto-activates on a verified sign-up (see convex/lib/moveParticipantClaim.ts).
//
// NOTE: convex/movePeople.ts remains the address-book "contacts" surface (no
// access). This file is the access surface. The roster query joins both.
import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { getCurrentUser } from "./lib/auth";
import { recordAuditEvent } from "./lib/audit";
import { activateHouseholdMemberForUser } from "./lib/householdInvitations";
import type { ManagedHouseholdMemberRole } from "./lib/householdMembers";
import { addMoveParticipant } from "./lib/moveParticipantWrite";
import {
  PARTICIPANT_TYPE_PRESETS,
  type MoveParticipantType,
} from "./lib/participants";
import { requireMovePermission } from "./lib/permissions";
import { queueOwnerDisplayName } from "./lib/queueAccess";
import {
  canPerformHouseholdAction,
  householdRoleAtLeast,
  strongerHouseholdRole,
  type HouseholdRole,
} from "./lib/roles";

const participantTypeValidator = v.union(
  v.literal("householdMember"),
  v.literal("helper"),
  v.literal("mover"),
  v.literal("company"),
  v.literal("contact"),
);

const accessKindValidator = v.union(
  v.literal("householdBacked"),
  v.literal("moveOnly"),
);

const grantableRoleValidator = v.union(
  v.literal("admin"),
  v.literal("editor"),
  v.literal("packer"),
  v.literal("viewer"),
  v.literal("guest"),
);

function emailVisibleTo(canManage: boolean, isSelf: boolean) {
  return canManage || isSelf;
}

async function userSummary(ctx: QueryCtx, userId: Id<"users"> | undefined) {
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  if (!user) return null;
  return { name: user.name ?? null, email: user.email ?? null, imageUrl: user.imageUrl ?? null };
}

/**
 * The unified People & Access roster for a move. Household members and
 * move-only participants are merged (deduped by user) and shown with their
 * EFFECTIVE move role. Emails and pending invites are redacted from callers who
 * can't manage members, and a moveOnly guest who can't manage sees only their
 * own entry (so an outsider can't enumerate the family's emails — H5).
 */
export const listForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    const policy = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:read",
    );
    const canManage = canPerformHouseholdAction(
      policy.role,
      "household:manage_members",
    );
    const selfUserId =
      policy.actor.type === "user" ? policy.actor.userId : undefined;

    const [memberships, participants, contacts] = await Promise.all([
      ctx.db
        .query("householdMemberships")
        .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
        .collect(),
      ctx.db
        .query("moveParticipants")
        .withIndex("by_household_move", (q) =>
          q.eq("householdId", args.householdId).eq("moveId", args.moveId),
        )
        .collect(),
      ctx.db
        .query("movePeople")
        .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
        .collect(),
    ]);

    // Index active participant rows by userId for the member merge.
    const participantByUser = new Map<string, Doc<"moveParticipants">>();
    for (const p of participants) {
      if (p.userId && p.status === "active") {
        participantByUser.set(p.userId, p);
      }
    }

    type Person = {
      key: string;
      kind: "householdMember" | "moveParticipant" | "pendingInvite";
      participantId: Id<"moveParticipants"> | null;
      membershipId: Id<"householdMemberships"> | null;
      userId: Id<"users"> | null;
      name: string | null;
      email: string | null;
      imageUrl: string | null;
      role: HouseholdRole;
      accessKind: "householdBacked" | "moveOnly";
      participantType: MoveParticipantType | null;
      status: "active" | "invited" | "disabled";
      agentAccessStatus: "enabled" | "disabled";
      canRunQueueForUserIds: Id<"users">[];
      isSelf: boolean;
    };

    const people: Person[] = [];

    // Household members (active) — show effective move role (raised by any grant).
    for (const m of memberships) {
      if (m.status !== "active") continue;
      const grant = participantByUser.get(m.userId);
      const role = grant
        ? strongerHouseholdRole(m.role, grant.role)
        : m.role;
      const summary = await userSummary(ctx, m.userId);
      const isSelf = selfUserId === m.userId;
      people.push({
        key: `member:${m._id}`,
        kind: "householdMember",
        participantId: grant?._id ?? null,
        membershipId: m._id,
        userId: m.userId,
        name: summary?.name ?? null,
        email: emailVisibleTo(canManage, isSelf) ? summary?.email ?? null : null,
        imageUrl: summary?.imageUrl ?? null,
        role,
        accessKind: "householdBacked",
        participantType: grant?.participantType ?? "householdMember",
        status: "active",
        agentAccessStatus:
          grant?.agentAccessStatus ?? m.apiAccessStatus ?? "enabled",
        canRunQueueForUserIds: grant?.canRunQueueForUserIds ?? [],
        isSelf,
      });
    }

    // Move-only participants + pending invites (not already shown as members).
    for (const p of participants) {
      if (p.status === "disabled") continue;
      if (p.userId && participantByUser.has(p.userId) && p.accessKind === "householdBacked") {
        continue; // already merged into the member row above
      }
      const isSelf = !!p.userId && selfUserId === p.userId;
      const summary = await userSummary(ctx, p.userId ?? undefined);
      const pending = p.status === "invited";
      // Hide pending invites + other people's emails from non-managers.
      if (pending && !canManage) continue;
      people.push({
        key: `participant:${p._id}`,
        kind: pending ? "pendingInvite" : "moveParticipant",
        participantId: p._id,
        membershipId: null,
        userId: p.userId ?? null,
        name: summary?.name ?? p.invitedName ?? null,
        email: emailVisibleTo(canManage, isSelf)
          ? summary?.email ?? p.invitedEmail ?? null
          : null,
        imageUrl: summary?.imageUrl ?? null,
        role: p.role,
        accessKind: p.accessKind,
        participantType: p.participantType,
        status: p.status,
        agentAccessStatus: p.agentAccessStatus ?? "enabled",
        canRunQueueForUserIds: p.canRunQueueForUserIds ?? [],
        isSelf,
      });
    }

    // A moveOnly guest who can't manage sees only their own row.
    const visiblePeople =
      policy.accessKind === "moveOnly" && !canManage
        ? people.filter((person) => person.isSelf)
        : people;

    const contactList = contacts
      .filter((c) => !c.archivedAt)
      .map((c) => ({
        contactId: c._id,
        name: c.name,
        role: c.role,
        email: canManage ? c.email ?? null : null,
        phone: canManage ? c.phone ?? null : null,
      }));

    return {
      canManage,
      accessKind: policy.accessKind,
      people: visiblePeople,
      // Contacts (address book) are only surfaced to managers in the unified list.
      contacts: canManage ? contactList : [],
      presets: Object.values(PARTICIPANT_TYPE_PRESETS),
    };
  },
});

/**
 * The active (non-archived) moves the current user can reach as a PARTICIPANT —
 * including move-only outsiders who have no household membership and therefore
 * never appear in households.listMine / moves.listForHousehold. The workspace
 * merges these so an invited mover/helper actually sees their move. Returns full
 * move docs to match moves.listForHousehold's shape. Signed-in users only.
 */
export const listMyMoves = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const participations = await ctx.db
      .query("moveParticipants")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "active"),
      )
      .collect();

    const moves = await Promise.all(
      participations.map(async (p) => {
        const move = await ctx.db.get(p.moveId);
        if (!move || move.status === "archived") return null;
        return move;
      }),
    );
    return moves.filter((move): move is Doc<"moves"> => move !== null);
  },
});

/**
 * The queue "scopes" the current user can view on this move: their own queue
 * always, the queues a move owner delegated them to run, and (for managers) the
 * whole move. Powers the queue owner-picker on the web.
 */
export const queueScopes = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    const policy = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );
    const canManage = canPerformHouseholdAction(
      policy.role,
      "household:manage_members",
    );
    const userId =
      policy.actor.type === "user" ? policy.actor.userId : null;

    let delegatedOwners: { userId: Id<"users">; name: string }[] = [];
    if (userId) {
      const participant = await ctx.db
        .query("moveParticipants")
        .withIndex("by_move_user", (q) =>
          q.eq("moveId", args.moveId).eq("userId", userId),
        )
        .unique();
      const ownerIds =
        participant?.status === "active"
          ? (participant.canRunQueueForUserIds ?? [])
          : [];
      delegatedOwners = await Promise.all(
        ownerIds.map(async (id) => {
          const owner = await ctx.db.get(id);
          return { userId: id, name: queueOwnerDisplayName(owner ?? {}) };
        }),
      );
    }

    return { canManage, delegatedOwners };
  },
});

/**
 * Add a participant to a move and choose their access (up to the actor's own
 * level). If their email already has an account they're activated immediately;
 * otherwise a pending invite is stored (name + email) and auto-activates on a
 * verified sign-up. For householdBacked participants this also makes them a
 * household member.
 */
export const invite = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    email: v.string(),
    name: v.optional(v.string()),
    participantType: participantTypeValidator,
    role: v.optional(grantableRoleValidator),
    accessKind: v.optional(accessKindValidator),
    // Convenience: also let this participant run the inviter's own queue.
    canRunMyQueue: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const policy = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:manage_members",
    );
    if (policy.actor.type !== "user") {
      throw new ConvexError("Managing participants requires a signed-in user.");
    }

    return await addMoveParticipant(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorUserId: policy.actor.userId,
      actorRole: policy.role,
      actorKind: "user",
      email: args.email,
      name: args.name,
      participantType: args.participantType as MoveParticipantType,
      role: args.role,
      accessKind: args.accessKind,
      canRunMyQueue: args.canRunMyQueue,
    });
  },
});

/** Change a participant's role / type / agent kill-switch / queue delegation. */
export const update = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    participantId: v.id("moveParticipants"),
    role: v.optional(grantableRoleValidator),
    agentAccessStatus: v.optional(
      v.union(v.literal("enabled"), v.literal("disabled")),
    ),
    canRunQueueForUserIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const policy = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:manage_members",
    );
    if (policy.actor.type !== "user") {
      throw new ConvexError("Managing participants requires a signed-in user.");
    }
    const participant = await ctx.db.get(args.participantId);
    if (
      !participant ||
      participant.moveId !== args.moveId ||
      participant.householdId !== args.householdId
    ) {
      throw new ConvexError("Participant not found on this move.");
    }

    const patch: Partial<Doc<"moveParticipants">> = {
      updatedByUserId: policy.actor.userId,
      updatedAt: Date.now(),
    };
    if (args.role !== undefined) {
      if (!householdRoleAtLeast(policy.role, args.role)) {
        throw new ConvexError(
          "You can't grant access higher than your own. Ask an owner or admin.",
        );
      }
      patch.role = args.role;
      // Keep the backing membership role in sync for household members.
      if (participant.accessKind === "householdBacked" && participant.userId) {
        await activateHouseholdMemberForUser(ctx, {
          householdId: args.householdId,
          userId: participant.userId,
          email: participant.invitedEmail ?? "",
          role: args.role as ManagedHouseholdMemberRole,
          actor: { type: "user", userId: policy.actor.userId },
        });
      }
    }
    if (args.agentAccessStatus !== undefined) {
      patch.agentAccessStatus = args.agentAccessStatus;
      // For household members the REST key path reads the kill-switch off the
      // membership, so keep the two in sync (the gateway already checks both).
      if (participant.accessKind === "householdBacked" && participant.userId) {
        const membership = await ctx.db
          .query("householdMemberships")
          .withIndex("by_household_user", (q) =>
            q
              .eq("householdId", args.householdId)
              .eq("userId", participant.userId!),
          )
          .unique();
        if (membership) {
          await ctx.db.patch(membership._id, {
            apiAccessStatus: args.agentAccessStatus,
            apiAccessUpdatedAt: Date.now(),
            apiAccessUpdatedByUserId: policy.actor.userId,
            updatedAt: Date.now(),
          });
        }
      }
    }
    if (args.canRunQueueForUserIds !== undefined) {
      patch.canRunQueueForUserIds = args.canRunQueueForUserIds;
    }

    await ctx.db.patch(args.participantId, patch);

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: policy.actor.userId,
      category: "household",
      action: "move_participant.updated",
      objectTable: "moveParticipants",
      objectId: args.participantId,
      metadata: { changedKeys: Object.keys(patch) },
    });

    return args.participantId;
  },
});

/** Disable a participant (revokes a moveOnly guest's only access). */
export const setStatus = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    participantId: v.id("moveParticipants"),
    status: v.union(v.literal("active"), v.literal("disabled")),
  },
  handler: async (ctx, args) => {
    const policy = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:manage_members",
    );
    if (policy.actor.type !== "user") {
      throw new ConvexError("Managing participants requires a signed-in user.");
    }
    const participant = await ctx.db.get(args.participantId);
    if (
      !participant ||
      participant.moveId !== args.moveId ||
      participant.householdId !== args.householdId
    ) {
      throw new ConvexError("Participant not found on this move.");
    }
    if (participant.role === "owner") {
      throw new ConvexError("The move owner can't be disabled here.");
    }

    await ctx.db.patch(args.participantId, {
      status: args.status,
      updatedByUserId: policy.actor.userId,
      updatedAt: Date.now(),
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: policy.actor.userId,
      category: "household",
      action:
        args.status === "disabled"
          ? "move_participant.disabled"
          : "move_participant.reactivated",
      objectTable: "moveParticipants",
      objectId: args.participantId,
    });

    return args.participantId;
  },
});
