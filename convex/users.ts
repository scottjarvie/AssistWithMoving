import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { appRoleForEmail } from "./lib/admin";
import { getCurrentUser } from "./lib/auth";
import { claimPendingHouseholdInvitationsForUser } from "./lib/householdInvitations";

export const current = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});

export const upsertCurrent = mutation({
  args: {
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Authentication required.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    const email = args.email ?? identity.email;
    const name = args.name ?? identity.name;
    const imageUrl = args.imageUrl ?? identity.pictureUrl;

    if (existing) {
      await ctx.db.patch(existing._id, {
        email,
        name,
        imageUrl,
        appRole: appRoleForEmail(email, existing.appRole),
        updatedAt: now,
        lastSeenAt: now,
      });

      await claimPendingHouseholdInvitationsForUser(ctx, {
        userId: existing._id,
        email,
        actorType: "user",
      });

      return existing._id;
    }

    const userId = await ctx.db.insert("users", {
      clerkUserId: identity.subject,
      email,
      name,
      imageUrl,
      appRole: appRoleForEmail(email),
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });

    await claimPendingHouseholdInvitationsForUser(ctx, {
      userId,
      email,
      actorType: "user",
    });

    return userId;
  },
});
