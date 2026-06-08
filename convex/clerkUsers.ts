import { v } from "convex/values";

import { internalMutation } from "./_generated/server";

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
        status: "active",
        updatedAt: args.sourceUpdatedAt ?? now,
      });

      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      email: args.email,
      name: args.name,
      imageUrl: args.imageUrl,
      appRole: "member",
      status: "active",
      createdAt: now,
      updatedAt: args.sourceUpdatedAt ?? now,
      lastSeenAt: now,
    });
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

    return existing._id;
  },
});
