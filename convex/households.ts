import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireCurrentUser } from "./lib/auth";
import { recordAuditEvent } from "./lib/audit";
import {
  memberManagementBlockReason,
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

        return {
          household,
          role: membership.role,
        };
      })
    );

    return households.filter((entry) => entry !== null);
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
    const policy = await requireHouseholdPermission(
      ctx,
      args.householdId,
      "household:manage_members",
    );
    const memberships = await ctx.db
      .query("householdMemberships")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
      .collect();

    const members = await Promise.all(
      memberships
        .filter((membership) => membership.status !== "disabled")
        .map(async (membership) => {
          const user = await ctx.db.get(membership.userId);
          return {
            membershipId: membership._id,
            userId: membership.userId,
            email: user?.email ?? membership.invitedEmail,
            name: user?.name,
            imageUrl: user?.imageUrl,
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

    return members.sort((left, right) => {
      if (left.role === "owner") return -1;
      if (right.role === "owner") return 1;
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

    const targetUser =
      (await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
        .unique()) ??
      (normalizedEmail === args.email.trim()
        ? null
        : await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email.trim()))
            .unique());

    if (!targetUser || targetUser.status !== "active") {
      throw new Error(
        "That person needs to sign in to MovingManifest once before they can be added by email.",
      );
    }

    if (actor.type === "user" && targetUser._id === actor.userId) {
      throw new Error("You are already a member of this household.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("householdMemberships")
      .withIndex("by_household_user", (q) =>
        q.eq("householdId", args.householdId).eq("userId", targetUser._id),
      )
      .unique();

    if (existing?.role === "owner") {
      throw new Error(
        "Owner access cannot be changed from this collaborator manager.",
      );
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        role,
        status: "active",
        invitedEmail: normalizedEmail,
        updatedAt: now,
      });

      await recordAuditEvent(ctx, {
        householdId: args.householdId,
        actorType: actor.type,
        actorUserId: actor.type === "user" ? actor.userId : undefined,
        actorApiKeyId: actor.type === "apiKey" ? actor.apiKeyId : undefined,
        category: "household",
        action: "household.member_reactivated",
        objectTable: "householdMemberships",
        objectId: existing._id,
        metadata: {
          targetUserId: targetUser._id,
          role,
          email: normalizedEmail,
        },
      });

      return existing._id;
    }

    const membershipId = await ctx.db.insert("householdMemberships", {
      householdId: args.householdId,
      userId: targetUser._id,
      role,
      status: "active",
      invitedEmail: normalizedEmail,
      createdByUserId: actor.type === "user" ? actor.userId : undefined,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      actorType: actor.type,
      actorUserId: actor.type === "user" ? actor.userId : undefined,
      actorApiKeyId: actor.type === "apiKey" ? actor.apiKeyId : undefined,
      category: "household",
      action: "household.member_added",
      objectTable: "householdMemberships",
      objectId: membershipId,
      metadata: {
        targetUserId: targetUser._id,
        role,
        email: normalizedEmail,
      },
    });

    return membershipId;
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
