import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAppAdmin, recordAdminAccess } from "./lib/admin";
import {
  applyFlagOverrides,
  featureEnvironment,
  featureFlagDefinitions,
  isFeatureFlagKey,
} from "./lib/featureFlags";

export const effective = query({
  args: {
    environment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const environment = featureEnvironment(args.environment);
    const overrides = await ctx.db
      .query("featureFlags")
      .withIndex("by_environment", (q) => q.eq("environment", environment))
      .collect();

    return applyFlagOverrides(environment, overrides);
  },
});

export const setOverride = mutation({
  args: {
    key: v.string(),
    enabled: v.boolean(),
    environment: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAppAdmin(ctx);
    if (!isFeatureFlagKey(args.key)) {
      throw new Error("Unknown feature flag.");
    }

    const environment = featureEnvironment(args.environment);
    const now = Date.now();
    const existing = await ctx.db
      .query("featureFlags")
      .withIndex("by_key_environment", (q) =>
        q.eq("key", args.key).eq("environment", environment)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        note: args.note,
        updatedByUserId: admin._id,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("featureFlags", {
        key: args.key,
        environment,
        enabled: args.enabled,
        note: args.note,
        updatedByUserId: admin._id,
        createdAt: now,
        updatedAt: now,
      });
    }

    await recordAdminAccess(ctx, admin, "admin.feature_flag_updated", {
      key: args.key,
      enabled: args.enabled,
      environment,
    });
  },
});

export const definitions = query({
  args: {},
  handler: async () => {
    return featureFlagDefinitions;
  },
});
