import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { appRoleForEmail } from "./lib/admin";
import { recordAuditEvent } from "./lib/audit";
import { claimPendingHouseholdInvitationsForUser } from "./lib/householdInvitations";
import { claimPendingMoveParticipantsForUser } from "./lib/moveParticipantClaim";

export const upsertFromWebhook = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    sourceUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        name: args.name,
        imageUrl: args.imageUrl,
        appRole: appRoleForEmail(args.email, existing.appRole),
        status: "active",
        updatedAt: args.sourceUpdatedAt ?? now,
      });

      await recordAuditEvent(ctx, {
        actorType: "webhook",
        category: "auth",
        action: "clerk_user.updated",
        objectTable: "users",
        objectId: existing._id,
        metadata: { clerkUserId: args.clerkUserId, email: args.email },
      });

      await claimPendingHouseholdInvitationsForUser(ctx, {
        userId: existing._id,
        email: args.email,
        actorType: "webhook",
      });
      await claimPendingMoveParticipantsForUser(ctx, {
        userId: existing._id,
        email: args.email,
        actorType: "webhook",
      });

      return existing._id;
    }

    const userId = await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      email: args.email,
      name: args.name,
      imageUrl: args.imageUrl,
      appRole: appRoleForEmail(args.email),
      status: "active",
      createdAt: now,
      updatedAt: args.sourceUpdatedAt ?? now,
      lastSeenAt: now,
    });

    await recordAuditEvent(ctx, {
      actorType: "webhook",
      category: "auth",
      action: "clerk_user.created",
      objectTable: "users",
      objectId: userId,
      metadata: { clerkUserId: args.clerkUserId, email: args.email },
    });

    await claimPendingHouseholdInvitationsForUser(ctx, {
      userId,
      email: args.email,
      actorType: "webhook",
    });
    await claimPendingMoveParticipantsForUser(ctx, {
      userId,
      email: args.email,
      actorType: "webhook",
    });

    return userId;
  },
});

export const disableFromWebhook = internalMutation({
  args: {
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (!existing) {
      return null;
    }

    await ctx.db.patch(existing._id, {
      email: undefined,
      name: "Deleted user",
      imageUrl: undefined,
      status: "disabled",
      updatedAt: Date.now(),
    });

    await recordAuditEvent(ctx, {
      actorType: "webhook",
      category: "auth",
      action: "clerk_user.disabled",
      objectTable: "users",
      objectId: existing._id,
      metadata: { clerkUserId: args.clerkUserId },
    });

    return existing._id;
  },
});

export const upsertOrganizationFromWebhook = internalMutation({
  args: {
    clerkOrganizationId: v.string(),
    name: v.string(),
    slug: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    sourceUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("clerkOrganizations")
      .withIndex("by_clerk_organization_id", (q) =>
        q.eq("clerkOrganizationId", args.clerkOrganizationId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        slug: args.slug,
        imageUrl: args.imageUrl,
        status: "active",
        updatedAt: now,
        sourceUpdatedAt: args.sourceUpdatedAt,
      });

      await recordAuditEvent(ctx, {
        actorType: "webhook",
        category: "auth",
        action: "clerk_organization.updated",
        objectTable: "clerkOrganizations",
        objectId: existing._id,
        metadata: {
          clerkOrganizationId: args.clerkOrganizationId,
          name: args.name,
        },
      });

      return existing._id;
    }

    const organizationId = await ctx.db.insert("clerkOrganizations", {
      clerkOrganizationId: args.clerkOrganizationId,
      name: args.name,
      slug: args.slug,
      imageUrl: args.imageUrl,
      status: "active",
      createdAt: now,
      updatedAt: now,
      sourceUpdatedAt: args.sourceUpdatedAt,
    });

    await recordAuditEvent(ctx, {
      actorType: "webhook",
      category: "auth",
      action: "clerk_organization.created",
      objectTable: "clerkOrganizations",
      objectId: organizationId,
      metadata: {
        clerkOrganizationId: args.clerkOrganizationId,
        name: args.name,
      },
    });

    return organizationId;
  },
});

export const disableOrganizationFromWebhook = internalMutation({
  args: {
    clerkOrganizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("clerkOrganizations")
      .withIndex("by_clerk_organization_id", (q) =>
        q.eq("clerkOrganizationId", args.clerkOrganizationId)
      )
      .unique();

    if (!existing) {
      return null;
    }

    await ctx.db.patch(existing._id, {
      status: "deleted",
      updatedAt: now,
    });

    const activeMemberships = await ctx.db
      .query("clerkOrganizationMemberships")
      .withIndex("by_org_status", (q) =>
        q.eq("clerkOrganizationId", args.clerkOrganizationId).eq("status", "active")
      )
      .collect();

    await Promise.all(
      activeMemberships.map((membership) =>
        ctx.db.patch(membership._id, {
          status: "disabled",
          updatedAt: now,
        })
      )
    );

    await recordAuditEvent(ctx, {
      actorType: "webhook",
      category: "auth",
      action: "clerk_organization.deleted",
      objectTable: "clerkOrganizations",
      objectId: existing._id,
      metadata: {
        clerkOrganizationId: args.clerkOrganizationId,
        disabledMemberships: activeMemberships.length,
      },
    });

    return existing._id;
  },
});

export const upsertOrganizationMembershipFromWebhook = internalMutation({
  args: {
    clerkOrganizationMembershipId: v.string(),
    clerkOrganizationId: v.string(),
    clerkUserId: v.string(),
    rawRole: v.string(),
    sourceUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    const existing = await ctx.db
      .query("clerkOrganizationMemberships")
      .withIndex("by_clerk_membership_id", (q) =>
        q.eq("clerkOrganizationMembershipId", args.clerkOrganizationMembershipId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        clerkOrganizationId: args.clerkOrganizationId,
        clerkUserId: args.clerkUserId,
        userId: user?._id,
        rawRole: args.rawRole,
        status: "active",
        updatedAt: now,
        sourceUpdatedAt: args.sourceUpdatedAt,
      });

      await recordAuditEvent(ctx, {
        actorType: "webhook",
        category: "auth",
        action: "clerk_organization_membership.updated",
        objectTable: "clerkOrganizationMemberships",
        objectId: existing._id,
        metadata: {
          clerkOrganizationId: args.clerkOrganizationId,
          clerkUserId: args.clerkUserId,
          rawRole: args.rawRole,
        },
      });

      return existing._id;
    }

    const membershipId = await ctx.db.insert("clerkOrganizationMemberships", {
      clerkOrganizationMembershipId: args.clerkOrganizationMembershipId,
      clerkOrganizationId: args.clerkOrganizationId,
      clerkUserId: args.clerkUserId,
      userId: user?._id,
      rawRole: args.rawRole,
      status: "active",
      createdAt: now,
      updatedAt: now,
      sourceUpdatedAt: args.sourceUpdatedAt,
    });

    await recordAuditEvent(ctx, {
      actorType: "webhook",
      category: "auth",
      action: "clerk_organization_membership.created",
      objectTable: "clerkOrganizationMemberships",
      objectId: membershipId,
      metadata: {
        clerkOrganizationId: args.clerkOrganizationId,
        clerkUserId: args.clerkUserId,
        rawRole: args.rawRole,
      },
    });

    return membershipId;
  },
});

export const disableOrganizationMembershipFromWebhook = internalMutation({
  args: {
    clerkOrganizationMembershipId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("clerkOrganizationMemberships")
      .withIndex("by_clerk_membership_id", (q) =>
        q.eq("clerkOrganizationMembershipId", args.clerkOrganizationMembershipId)
      )
      .unique();

    if (!existing) {
      return null;
    }

    await ctx.db.patch(existing._id, {
      status: "disabled",
      updatedAt: Date.now(),
    });

    await recordAuditEvent(ctx, {
      actorType: "webhook",
      category: "auth",
      action: "clerk_organization_membership.disabled",
      objectTable: "clerkOrganizationMemberships",
      objectId: existing._id,
      metadata: {
        clerkOrganizationId: existing.clerkOrganizationId,
        clerkUserId: existing.clerkUserId,
      },
    });

    return existing._id;
  },
});
