import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import {
  requireCurrentUser,
  requireHouseholdRole,
} from "./lib/auth";

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

    return householdId;
  },
});

export const rename = mutation({
  args: {
    householdId: v.id("households"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireHouseholdRole(ctx, args.householdId, "admin");

    await ctx.db.patch(args.householdId, {
      name: args.name.trim(),
      slug: slugify(args.name),
      updatedAt: Date.now(),
    });
  },
});
