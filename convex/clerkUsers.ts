import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { appRoleForEmail } from "./lib/admin";
import { recordAuditEvent } from "./lib/audit";

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
