import { summaryFor, storagePlan } from "./usageLimits";
import { effectiveLimits } from "./lib/usageLimits/core";
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAppAdmin, recordAdminAccess } from "./lib/admin";
import { recordAuditEvent } from "./lib/audit";
import {
  billingGatesEnabled,
  billingProfileForHousehold,
  billingProviderDecision,
  billingTierDefinition,
  billingTiers,
  effectiveBillingTier,
  evaluateEntitlement,
  normalizeBillingTier,
  usageDimensions,
  usageSnapshotForHousehold,
} from "./lib/billing";
import { requireHouseholdPermission } from "./lib/permissions";

export const statusForHousehold = query({
  args: {
    householdId: v.id("households"),
  },
  handler: async (ctx, args) => {
    await requireHouseholdPermission(ctx, args.householdId, "admin:read");
    const [profile, usage, gatesEnabled] = await Promise.all([
      billingProfileForHousehold(ctx, args.householdId),
      usageSnapshotForHousehold(ctx, args.householdId),
      billingGatesEnabled(ctx),
    ]);
    const tier = effectiveBillingTier(profile);
    const storage = await summaryFor(ctx, args.householdId);
    const baseDefinition = billingTierDefinition(tier);
    const definition = { ...baseDefinition, limits: { ...baseDefinition.limits, photoStorageBytes: storage.capBytes } };

    return {
      profile: profile
        ? {
            householdBillingProfileId: profile._id,
            householdId: profile.householdId,
            tier: profile.tier,
            provider: profile.provider,
            status: profile.status,
            note: profile.note,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
          }
        : null,
      effectiveTier: tier,
      definition,
      usage,
      gatesEnabled,
      providerDecision: billingProviderDecision,
      dimensions: usageDimensions.map((dimension) => ({
        dimension,
        used: dimension === "photoStorageBytes" ? storage.usedBytes : usage[dimension],
        limit: definition.limits[dimension],
        evaluation: evaluateEntitlement(usage, definition.limits, dimension, 0),
      })),
      upgradeMessage:
        "Usage limits are configured. Payment collection remains inactive until pricing and provider setup are approved.",
    };
  },
});

export const setHouseholdTier = mutation({
  args: {
    householdId: v.id("households"),
    tier: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAppAdmin(ctx);
    const tier = normalizeBillingTier(args.tier);
    const now = Date.now();
    const existing = await billingProfileForHousehold(ctx, args.householdId);

    if (existing) {
      await ctx.db.patch(existing._id, {
        tier,
        note: args.note,
        updatedByUserId: admin._id,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("householdBillingProfiles", {
        householdId: args.householdId,
        tier,
        provider: "none",
        status: "none",
        note: args.note,
        updatedByUserId: admin._id,
        createdAt: now,
        updatedAt: now,
      });
    }

    await recordAdminAccess(ctx, admin, "admin.billing_tier_updated", {
      householdId: args.householdId,
      tier,
    });
    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      actorType: "user",
      actorUserId: admin._id,
      category: "admin",
      action: "billing.tier_updated",
      objectTable: "householdBillingProfiles",
      objectId: args.householdId,
      metadata: { tier },
    });
  },
});

export const tiers = query({
  args: {},
  handler: async (ctx) => {
    const site = await ctx.db.query("usageLimitSettings").withIndex("by_key", q => q.eq("key", "site")).unique();
    return billingTiers.map((tier) => {
      const definition = billingTierDefinition(tier);
      return { tier, ...definition, limits: { ...definition.limits, photoStorageBytes: effectiveLimits(site, null, storagePlan(tier, false)).limits.storedBytesPerUser } };
    });
  },
});
