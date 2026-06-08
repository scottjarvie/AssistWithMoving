import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireCurrentUser } from "./lib/auth";
import { recordAuditEvent } from "./lib/audit";
import { requireHouseholdPermission } from "./lib/permissions";

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
