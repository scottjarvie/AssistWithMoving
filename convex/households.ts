import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireCurrentUser } from "./lib/auth";
import { recordAuditEvent } from "./lib/audit";
import { addOrInviteHouseholdMemberByEmail } from "./lib/householdInvitations";
import {
  memberManagementBlockReason,
  normalizeCollaboratorEmail,
  parseManagedHouseholdMemberRole,
} from "./lib/householdMembers";
import { requireHouseholdPermission } from "./lib/permissions";
import { canPerformHouseholdAction } from "./lib/roles";

const managedHouseholdMemberRoleValidator = v.union(
  v.literal("admin"),
  v.literal("editor"),
  v.literal("packer"),
  v.literal("viewer"),
  v.literal("guest"),
);

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const memberships = await ctx.db
      .query("householdMemberships")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "active")
      )
      .collect();

    const households = await Promise.all(
      memberships.map(async (membership) => {
        const household = await ctx.db.get(membership.householdId);
        if (!household || household.archivedAt !== undefined) {
          return null;
        }

        return {
          household,
          role: membership.role,
        };
      })
    );

    return households.filter((entry) => entry !== null);
  },
});

export const summaryStats = query({
  args: {
    householdId: v.id("households"),
  },
  handler: async (ctx, args) => {
    await requireHouseholdPermission(ctx, args.householdId, "household:read");

    const [
      moves,
      memberships,
      invitations,
      activeApiKeys,
      items,
      boxes,
    ] = await Promise.all([
      ctx.db
        .query("moves")
        .withIndex("by_household_status", (q) =>
          q.eq("householdId", args.householdId),
        )
        .collect(),
      ctx.db
        .query("householdMemberships")
        .withIndex("by_household", (q) =>
          q.eq("householdId", args.householdId),
        )
        .collect(),
      ctx.db
        .query("householdInvitations")
        .withIndex("by_household_status", (q) =>
          q.eq("householdId", args.householdId).eq("status", "invited"),
        )
        .collect(),
      ctx.db
        .query("apiKeys")
        .withIndex("by_household_status", (q) =>
          q.eq("householdId", args.householdId).eq("status", "active"),
        )
        .collect(),
      ctx.db
        .query("items")
        .withIndex("by_household", (q) =>
          q.eq("householdId", args.householdId),
        )
        .collect(),
      ctx.db
        .query("boxes")
        .withIndex("by_household", (q) =>
          q.eq("householdId", args.householdId),
        )
        .collect(),
    ]);

    const activeMoves = moves.filter((move) => move.status !== "archived");

    return {
      householdId: args.householdId,
      moves: activeMoves
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((move) => ({
          moveId: move._id,
          title: move.title,
          status: move.status,
        })),
      moveCount: activeMoves.length,
      archivedMoveCount: moves.filter((move) => move.status === "archived")
        .length,
      itemCount: items.filter((item) => item.deletedAt === undefined).length,
      boxCount: boxes.filter((box) => box.archivedAt === undefined).length,
      activeApiKeyCount: activeApiKeys.length,
      activeMemberCount: memberships.filter(
        (membership) => membership.status === "active",
      ).length,
      pendingInvitationCount: invitations.length,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();
    const householdId = await ctx.db.insert("households", {
      name: args.name.trim(),
      slug: slugify(args.name),
      createdByUserId: user._id,
      ownerUserId: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("householdMemberships", {
      householdId,
      userId: user._id,
      role: "owner",
      status: "active",
      createdByUserId: user._id,
      createdAt: now,
      updatedAt: now,
    });

    if (!user.defaultHouseholdId) {
      await ctx.db.patch(user._id, {
        defaultHouseholdId: householdId,
        updatedAt: now,
      });
    }

    await recordAuditEvent(ctx, {
      householdId,
      actorType: "user",
      actorUserId: user._id,
      category: "household",
      action: "household.created",
      objectTable: "households",
      objectId: householdId,
      metadata: { name: args.name.trim() },
    });

    return householdId;
  },
});

export const rename = mutation({
  args: {
    householdId: v.id("households"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireHouseholdPermission(
      ctx,
      args.householdId,
      "household:manage_settings"
    );
    const existing = await ctx.db.get(args.householdId);

    await ctx.db.patch(args.householdId, {
      name: args.name.trim(),
      slug: slugify(args.name),
      updatedAt: Date.now(),
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      actorType: actor.type,
      actorUserId: actor.type === "user" ? actor.userId : undefined,
      actorApiKeyId: actor.type === "apiKey" ? actor.apiKeyId : undefined,
      category: "household",
      action: "household.renamed",
      objectTable: "households",
      objectId: args.householdId,
      metadata: {
        previousName: existing?.name,
        nextName: args.name.trim(),
      },
    });
  },
});

export const listMembers = query({
  args: {
    householdId: v.id("households"),
  },
  handler: async (ctx, args) => {
    // Any household member can READ this (so non-manager members reaching a move
    // don't crash a page that uses it). The member roster carries emails, so
    // only managers get the actual rows — everyone else gets an empty list.
    const policy = await requireHouseholdPermission(
      ctx,
      args.householdId,
      "household:read",
    );
    if (!canPerformHouseholdAction(policy.role, "household:manage_members")) {
      return [];
    }
    const memberships = await ctx.db
      .query("householdMemberships")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
      .collect();
    const invitations = await ctx.db
      .query("householdInvitations")
      .withIndex("by_household_status", (q) =>
        q.eq("householdId", args.householdId).eq("status", "invited"),
      )
      .collect();

    const members = await Promise.all(
      memberships
        .filter((membership) => membership.status !== "disabled")
        .map(async (membership) => {
          const user = await ctx.db.get(membership.userId);
          return {
            membershipId: membership._id,
            invitationId: null,
            userId: membership.userId,
            email: user?.email ?? membership.invitedEmail ?? null,
            name: user?.name ?? null,
            imageUrl: user?.imageUrl ?? null,
            role: membership.role,
            status: membership.status,
            isCurrentUser:
              policy.actor.type === "user" &&
              policy.actor.userId === membership.userId,
            createdAt: membership.createdAt,
            updatedAt: membership.updatedAt,
          };
        }),
    );

    const pendingInvitations = invitations.map((invitation) => ({
      membershipId: null,
      invitationId: invitation._id,
      userId: null,
      email: invitation.invitedEmail,
      name: null,
      imageUrl: null,
      role: invitation.role,
      status: invitation.status,
      isCurrentUser: false,
      createdAt: invitation.createdAt,
      updatedAt: invitation.updatedAt,
    }));

    return [...members, ...pendingInvitations].sort((left, right) => {
      if (left.role === "owner") return -1;
      if (right.role === "owner") return 1;
      if (left.status === "invited" && right.status !== "invited") return 1;
      if (right.status === "invited" && left.status !== "invited") return -1;
      return (left.email ?? left.name ?? "").localeCompare(
        right.email ?? right.name ?? "",
      );
    });
  },
});

export const addExistingMember = mutation({
  args: {
    householdId: v.id("households"),
    email: v.string(),
    role: managedHouseholdMemberRoleValidator,
  },
  handler: async (ctx, args) => {
    const { actor } = await requireHouseholdPermission(
      ctx,
      args.householdId,
      "household:manage_members",
    );
    const role = parseManagedHouseholdMemberRole(args.role);
    if (!role) {
      throw new ConvexError(
        "Owner access cannot be granted from this collaborator manager.",
      );
    }

    const normalizedEmail = normalizeCollaboratorEmail(args.email);
    if (!normalizedEmail) {
      throw new ConvexError("Enter a collaborator email.");
    }

    return await addOrInviteHouseholdMemberByEmail(ctx, {
      householdId: args.householdId,
      email: normalizedEmail,
      role,
      actor:
        actor.type === "user"
          ? { type: "user", userId: actor.userId }
          : {
              type: "apiKey",
              apiKeyId: actor.apiKeyId,
            },
    });
  },
});

export const revokeInvitation = mutation({
  args: {
    householdId: v.id("households"),
    invitationId: v.id("householdInvitations"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireHouseholdPermission(
      ctx,
      args.householdId,
      "household:manage_members",
    );
    if (actor.type !== "user") {
      throw new ConvexError("Invitation changes require a signed-in user.");
    }

    const invitation = await ctx.db.get(args.invitationId);
    if (
      !invitation ||
      invitation.householdId !== args.householdId ||
      invitation.status !== "invited"
    ) {
      throw new ConvexError("Pending invitation not found.");
    }

    await ctx.db.patch(args.invitationId, {
      status: "revoked",
      updatedAt: Date.now(),
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      actorType: actor.type,
      actorUserId: actor.userId,
      category: "household",
      action: "household.invitation_revoked",
      objectTable: "householdInvitations",
      objectId: args.invitationId,
      metadata: {
        email: invitation.invitedEmail,
        role: invitation.role,
      },
    });
  },
});

export const updateMemberRole = mutation({
  args: {
    householdId: v.id("households"),
    membershipId: v.id("householdMemberships"),
    role: managedHouseholdMemberRoleValidator,
  },
  handler: async (ctx, args) => {
    const { actor } = await requireHouseholdPermission(
      ctx,
      args.householdId,
      "household:manage_members",
    );
    if (actor.type !== "user") {
      throw new ConvexError("Member role changes require a signed-in user.");
    }
    const role = parseManagedHouseholdMemberRole(args.role);
    if (!role) {
      throw new ConvexError(
        "Owner access cannot be granted from this collaborator manager.",
      );
    }
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.householdId !== args.householdId) {
      throw new ConvexError("Household member not found.");
    }

    const blockedReason = memberManagementBlockReason({
      action: "changeRole",
      currentUserId: actor.userId,
      targetUserId: membership.userId,
      targetRole: membership.role,
    });
    if (blockedReason) {
      throw new ConvexError(blockedReason);
    }

    await ctx.db.patch(args.membershipId, {
      role,
      status: "active",
      updatedAt: Date.now(),
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      actorType: actor.type,
      actorUserId: actor.userId,
      category: "household",
      action: "household.member_role_updated",
      objectTable: "householdMemberships",
      objectId: args.membershipId,
      metadata: {
        targetUserId: membership.userId,
        previousRole: membership.role,
        nextRole: role,
      },
    });
  },
});

export const disableMember = mutation({
  args: {
    householdId: v.id("households"),
    membershipId: v.id("householdMemberships"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireHouseholdPermission(
      ctx,
      args.householdId,
      "household:manage_members",
    );
    if (actor.type !== "user") {
      throw new ConvexError("Member access changes require a signed-in user.");
    }
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.householdId !== args.householdId) {
      throw new ConvexError("Household member not found.");
    }

    const blockedReason = memberManagementBlockReason({
      action: "disable",
      currentUserId: actor.userId,
      targetUserId: membership.userId,
      targetRole: membership.role,
    });
    if (blockedReason) {
      throw new ConvexError(blockedReason);
    }

    await ctx.db.patch(args.membershipId, {
      status: "disabled",
      updatedAt: Date.now(),
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      actorType: actor.type,
      actorUserId: actor.userId,
      category: "household",
      action: "household.member_disabled",
      objectTable: "householdMemberships",
      objectId: args.membershipId,
      metadata: {
        targetUserId: membership.userId,
        previousRole: membership.role,
      },
    });
  },
});
