import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireCurrentUser } from "./lib/auth";
import { recordAuditEvent } from "./lib/audit";
import { addOrInviteHouseholdMemberByEmail } from "./lib/householdInvitations";
import {
  canMembershipUseApiAccess,
  defaultMemberApiAccessStatus,
  effectiveMemberApiAccessStatus,
  memberManagementBlockReason,
  type MemberApiAccessStatus,
  normalizeCollaboratorEmail,
  parseManagedHouseholdMemberRole,
} from "./lib/householdMembers";
import { requireHouseholdPermission } from "./lib/permissions";

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

        const inviter = membership.createdByUserId
          ? await ctx.db.get(membership.createdByUserId)
          : null;
        const apiAccessStatus = effectiveMemberApiAccessStatus({
          role: membership.role,
          status: membership.status,
          apiAccessStatus: membership.apiAccessStatus,
        });
        const shouldShowOnboarding =
          membership.role !== "owner" &&
          typeof membership.acceptedInvitationAt === "number" &&
          membership.onboardingDismissedAt === undefined;

        return {
          household,
          role: membership.role,
          membershipId: membership._id,
          apiAccessStatus,
          canCreateApiKeys:
            apiAccessStatus === "enabled" &&
            canMembershipUseApiAccess({
              role: membership.role,
              status: membership.status,
              apiAccessStatus: membership.apiAccessStatus,
            }),
          collaboratorOnboarding: shouldShowOnboarding
            ? {
                membershipId: membership._id,
                acceptedAt: membership.acceptedInvitationAt,
                role: membership.role,
                invitedEmail: membership.invitedEmail ?? user.email ?? null,
                inviterName: inviter?.name ?? null,
                inviterEmail: inviter?.email ?? null,
              }
            : null,
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
      apiCapableMemberCount: memberships.filter((membership) =>
        canMembershipUseApiAccess({
          role: membership.role,
          status: membership.status,
          apiAccessStatus: membership.apiAccessStatus,
        }),
      ).length,
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
      apiAccessStatus: "enabled",
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
    const policy = await requireHouseholdPermission(
      ctx,
      args.householdId,
      "household:manage_members",
    );
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
    const activeApiKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_household_status", (q) =>
        q.eq("householdId", args.householdId).eq("status", "active"),
      )
      .collect();
    const activeApiKeyCountByUser = new Map<string, number>();
    for (const key of activeApiKeys) {
      const creatorId = String(key.createdByUserId);
      activeApiKeyCountByUser.set(
        creatorId,
        (activeApiKeyCountByUser.get(creatorId) ?? 0) + 1,
      );
    }

    const members = await Promise.all(
      memberships
        .filter((membership) => membership.status !== "disabled")
        .map(async (membership) => {
          const user = await ctx.db.get(membership.userId);
          const apiAccessStatus = effectiveMemberApiAccessStatus({
            role: membership.role,
            status: membership.status,
            apiAccessStatus: membership.apiAccessStatus,
          });
          const roleAllowsApi =
            defaultMemberApiAccessStatus(membership.role) === "enabled";
          return {
            membershipId: membership._id,
            invitationId: null,
            userId: membership.userId,
            email: user?.email ?? membership.invitedEmail ?? null,
            name: user?.name ?? null,
            imageUrl: user?.imageUrl ?? null,
            role: membership.role,
            status: membership.status,
            apiAccessStatus,
            apiAccessAllowed: roleAllowsApi && apiAccessStatus === "enabled",
            apiAccessReason: roleAllowsApi
              ? apiAccessStatus === "enabled"
                ? "Can create API keys and use keys they created."
                : "API access disabled; existing keys they created cannot be used."
              : "Role does not allow API key creation.",
            activeApiKeyCount:
              activeApiKeyCountByUser.get(String(membership.userId)) ?? 0,
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
      apiAccessStatus: defaultMemberApiAccessStatus(invitation.role),
      apiAccessAllowed:
        defaultMemberApiAccessStatus(invitation.role) === "enabled",
      apiAccessReason:
        defaultMemberApiAccessStatus(invitation.role) === "enabled"
          ? "Will be API-capable after accepting this invitation."
          : "Invited role does not allow API key creation.",
      activeApiKeyCount: 0,
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
      throw new Error(
        "Owner access cannot be granted from this collaborator manager.",
      );
    }

    const normalizedEmail = normalizeCollaboratorEmail(args.email);
    if (!normalizedEmail) {
      throw new Error("Enter a collaborator email.");
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
      throw new Error("Invitation changes require a signed-in user.");
    }

    const invitation = await ctx.db.get(args.invitationId);
    if (
      !invitation ||
      invitation.householdId !== args.householdId ||
      invitation.status !== "invited"
    ) {
      throw new Error("Pending invitation not found.");
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
      throw new Error("Member role changes require a signed-in user.");
    }
    const role = parseManagedHouseholdMemberRole(args.role);
    if (!role) {
      throw new Error(
        "Owner access cannot be granted from this collaborator manager.",
      );
    }
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.householdId !== args.householdId) {
      throw new Error("Household member not found.");
    }

    const blockedReason = memberManagementBlockReason({
      action: "changeRole",
      currentUserId: actor.userId,
      targetUserId: membership.userId,
      targetRole: membership.role,
    });
    if (blockedReason) {
      throw new Error(blockedReason);
    }

    await ctx.db.patch(args.membershipId, {
      role,
      status: "active",
      apiAccessStatus:
        membership.apiAccessStatus ?? defaultMemberApiAccessStatus(role),
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

export const updateMemberApiAccess = mutation({
  args: {
    householdId: v.id("households"),
    membershipId: v.id("householdMemberships"),
    apiAccessStatus: v.union(v.literal("enabled"), v.literal("disabled")),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireHouseholdPermission(
      ctx,
      args.householdId,
      "api_keys:manage",
    );
    if (actor.type !== "user") {
      throw new Error("API access changes require a signed-in user.");
    }
    const actorMembership = await ctx.db
      .query("householdMemberships")
      .withIndex("by_household_user", (q) =>
        q.eq("householdId", args.householdId).eq("userId", actor.userId),
      )
      .unique();
    if (
      !actorMembership ||
      !canMembershipUseApiAccess({
        role: actorMembership.role,
        status: actorMembership.status,
        apiAccessStatus: actorMembership.apiAccessStatus,
      })
    ) {
      throw new Error("API access is disabled for your household membership.");
    }
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.householdId !== args.householdId) {
      throw new Error("Household member not found.");
    }

    const blockedReason = memberManagementBlockReason({
      action: "apiAccess",
      currentUserId: actor.userId,
      targetUserId: membership.userId,
      targetRole: membership.role,
    });
    if (blockedReason) {
      throw new Error(blockedReason);
    }

    if (defaultMemberApiAccessStatus(membership.role) !== "enabled") {
      throw new Error("This member role cannot create API keys.");
    }

    const nextStatus = args.apiAccessStatus as MemberApiAccessStatus;
    const now = Date.now();
    await ctx.db.patch(args.membershipId, {
      apiAccessStatus: nextStatus,
      apiAccessUpdatedAt: now,
      apiAccessUpdatedByUserId: actor.userId,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      actorType: actor.type,
      actorUserId: actor.userId,
      category: "apiKey",
      action:
        nextStatus === "enabled"
          ? "api_access.enabled"
          : "api_access.disabled",
      objectTable: "householdMemberships",
      objectId: args.membershipId,
      metadata: {
        targetUserId: membership.userId,
        role: membership.role,
        previousApiAccessStatus: effectiveMemberApiAccessStatus({
          role: membership.role,
          status: membership.status,
          apiAccessStatus: membership.apiAccessStatus,
        }),
        nextApiAccessStatus: nextStatus,
      },
    });
  },
});

export const acknowledgeCollaboratorOnboarding = mutation({
  args: {
    householdId: v.id("households"),
    membershipId: v.id("householdMemberships"),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const membership = await ctx.db.get(args.membershipId);
    if (
      !membership ||
      membership.householdId !== args.householdId ||
      membership.userId !== user._id ||
      membership.status !== "active"
    ) {
      throw new Error("Household access card not found.");
    }

    const now = Date.now();
    await ctx.db.patch(args.membershipId, {
      onboardingDismissedAt: now,
      updatedAt: now,
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
      throw new Error("Member access changes require a signed-in user.");
    }
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.householdId !== args.householdId) {
      throw new Error("Household member not found.");
    }

    const blockedReason = memberManagementBlockReason({
      action: "disable",
      currentUserId: actor.userId,
      targetUserId: membership.userId,
      targetRole: membership.role,
    });
    if (blockedReason) {
      throw new Error(blockedReason);
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
