import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { applyFlagOverrides, featureEnvironment } from "./featureFlags";

export const billingTiers = ["free", "launch", "plus", "pro", "unlimited"] as const;
export type BillingTier = (typeof billingTiers)[number];

export const usageDimensions = [
  "activeMoves",
  "photoCount",
  "photoStorageBytes",
  "aiJobsMonthly",
  "aiEstimatedCentsMonthly",
  "exportJobsMonthly",
  "apiCallsMonthly",
  "activeApiKeys",
  "activeShareLinks",
] as const;
export type UsageDimension = (typeof usageDimensions)[number];
export type UsageSnapshot = Record<UsageDimension, number>;
export type EntitlementLimits = Record<UsageDimension, number>;

export const defaultBillingTier: BillingTier = "launch";
export const billingProviderDecision = {
  activeProvider: "none",
  candidates: ["stripe", "vercelMarketplace"],
  note: "Payment collection is intentionally inactive until pricing and provider setup are approved.",
} as const;

export const tierDefinitions: Record<
  BillingTier,
  {
    label: string;
    description: string;
    limits: EntitlementLimits;
  }
> = {
  free: {
    label: "Free readiness",
    description: "Small trial-style limits for validating product gates.",
    limits: {
      activeMoves: 2,
      photoCount: 250,
      photoStorageBytes: 1 * 1024 * 1024 * 1024,
      aiJobsMonthly: 50,
      aiEstimatedCentsMonthly: 250,
      exportJobsMonthly: 25,
      apiCallsMonthly: 500,
      activeApiKeys: 2,
      activeShareLinks: 5,
    },
  },
  launch: {
    label: "Launch default",
    description: "Generous non-billing default while pricing is undecided.",
    limits: {
      activeMoves: 25,
      photoCount: 10_000,
      photoStorageBytes: 50 * 1024 * 1024 * 1024,
      aiJobsMonthly: 2_000,
      aiEstimatedCentsMonthly: 10_000,
      exportJobsMonthly: 1_000,
      apiCallsMonthly: 25_000,
      activeApiKeys: 25,
      activeShareLinks: 250,
    },
  },
  plus: {
    label: "Plus household",
    description:
      "Expanded household tier for larger moves, photo evidence, exports, and API use.",
    limits: {
      activeMoves: 50,
      photoCount: 25_000,
      photoStorageBytes: 150 * 1024 * 1024 * 1024,
      aiJobsMonthly: 5_000,
      aiEstimatedCentsMonthly: 25_000,
      exportJobsMonthly: 2_500,
      apiCallsMonthly: 100_000,
      activeApiKeys: 50,
      activeShareLinks: 500,
    },
  },
  pro: {
    label: "Pro operations",
    description:
      "High-volume household or small-operations tier for heavy inventory, evidence, exports, and automations.",
    limits: {
      activeMoves: 200,
      photoCount: 100_000,
      photoStorageBytes: 500 * 1024 * 1024 * 1024,
      aiJobsMonthly: 25_000,
      aiEstimatedCentsMonthly: 100_000,
      exportJobsMonthly: 10_000,
      apiCallsMonthly: 1_000_000,
      activeApiKeys: 200,
      activeShareLinks: 2_500,
    },
  },
  unlimited: {
    label: "Unlimited/internal",
    description: "Internal override for migrations, demos, and exceptional accounts.",
    limits: {
      activeMoves: Number.POSITIVE_INFINITY,
      photoCount: Number.POSITIVE_INFINITY,
      photoStorageBytes: Number.POSITIVE_INFINITY,
      aiJobsMonthly: Number.POSITIVE_INFINITY,
      aiEstimatedCentsMonthly: Number.POSITIVE_INFINITY,
      exportJobsMonthly: Number.POSITIVE_INFINITY,
      apiCallsMonthly: Number.POSITIVE_INFINITY,
      activeApiKeys: Number.POSITIVE_INFINITY,
      activeShareLinks: Number.POSITIVE_INFINITY,
    },
  },
};

export function billingTierDefinition(tier: BillingTier) {
  return tierDefinitions[tier] ?? tierDefinitions[defaultBillingTier];
}

export function usagePercent(used: number, limit: number) {
  if (!Number.isFinite(limit)) {
    return 0;
  }
  if (limit <= 0) {
    return used > 0 ? 100 : 0;
  }
  return Math.min(Math.round((used / limit) * 100), 999);
}

export function evaluateEntitlement(
  usage: UsageSnapshot,
  limits: EntitlementLimits,
  dimension: UsageDimension,
  increment = 1
) {
  const used = usage[dimension] ?? 0;
  const limit = limits[dimension];
  if (!Number.isFinite(limit)) {
    return { allowed: true, used, next: used + increment, limit, percent: 0 };
  }

  const next = used + increment;
  return {
    allowed: next <= limit,
    used,
    next,
    limit,
    percent: usagePercent(used, limit),
    reason:
      next <= limit
        ? undefined
        : `This household has reached the ${dimension} limit for its current tier.`,
  };
}

export function normalizeBillingTier(value: string): BillingTier {
  if ((billingTiers as readonly string[]).includes(value)) {
    return value as BillingTier;
  }
  throw new Error("Unknown billing tier.");
}

export async function billingGatesEnabled(ctx: QueryCtx | MutationCtx) {
  const environment = featureEnvironment();
  const overrides = await ctx.db
    .query("featureFlags")
    .withIndex("by_environment", (q) => q.eq("environment", environment))
    .collect();
  const flags = applyFlagOverrides(environment, overrides);
  return flags.find((flag) => flag.key === "billingGates")?.enabled ?? false;
}

export async function billingProfileForHousehold(
  ctx: QueryCtx | MutationCtx,
  householdId: Id<"households">
) {
  return await ctx.db
    .query("householdBillingProfiles")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .unique();
}

export function effectiveBillingTier(
  profile: Doc<"householdBillingProfiles"> | null
) {
  return profile?.tier ?? defaultBillingTier;
}

export async function assertHouseholdEntitlement(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    dimension: UsageDimension;
    increment?: number;
  }
) {
  if (!(await billingGatesEnabled(ctx))) {
    return;
  }

  const [profile, usage] = await Promise.all([
    billingProfileForHousehold(ctx, args.householdId),
    usageSnapshotForHousehold(ctx, args.householdId),
  ]);
  const tier = effectiveBillingTier(profile);
  const result = evaluateEntitlement(
    usage,
    billingTierDefinition(tier).limits,
    args.dimension,
    args.increment ?? 1
  );
  if (!result.allowed) {
    throw new ConvexError(result.reason ?? "Plan limit reached.");
  }
}

export async function usageSnapshotForHousehold(
  ctx: QueryCtx | MutationCtx,
  householdId: Id<"households">,
  now = Date.now()
): Promise<UsageSnapshot> {
  const monthStart = now - 30 * 24 * 60 * 60 * 1000;
  const [
    moves,
    photos,
    aiJobs,
    exportJobs,
    apiAudits,
    apiKeys,
    shareLinks,
  ] = await Promise.all([
    ctx.db
      .query("moves")
      .withIndex("by_household_status", (q) => q.eq("householdId", householdId))
      .collect(),
    ctx.db
      .query("itemPhotos")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .collect(),
    ctx.db
      .query("aiJobs")
      .withIndex("by_household_created", (q) =>
        q.eq("householdId", householdId).gte("createdAt", monthStart)
      )
      .collect(),
    ctx.db
      .query("exportJobs")
      .withIndex("by_household_created", (q) =>
        q.eq("householdId", householdId).gte("createdAt", monthStart)
      )
      .collect(),
    ctx.db
      .query("auditLogs")
      .withIndex("by_household_time", (q) =>
        q.eq("householdId", householdId).gte("createdAt", monthStart)
      )
      .collect(),
    ctx.db
      .query("apiKeys")
      .withIndex("by_household_status", (q) => q.eq("householdId", householdId))
      .collect(),
    ctx.db
      .query("shareLinks")
      .withIndex("by_household_status", (q) =>
        q.eq("householdId", householdId)
      )
      .collect(),
  ]);

  return {
    activeMoves: moves.filter((move) => move.status !== "archived").length,
    photoCount: photos.filter((photo) => !photo.archivedAt).length,
    photoStorageBytes: photos.reduce((total, photo) => total + photo.sizeBytes, 0),
    aiJobsMonthly: aiJobs.length,
    aiEstimatedCentsMonthly: aiJobs.reduce(
      (total, job) => total + (job.cost?.estimatedCents ?? 0),
      0
    ),
    exportJobsMonthly: exportJobs.length,
    apiCallsMonthly: apiAudits.filter((entry) => entry.category === "apiKey")
      .length,
    activeApiKeys: apiKeys.filter((key) => key.status === "active").length,
    activeShareLinks: shareLinks.filter(
      (link) => link.status === "active" && link.expiresAt > now
    ).length,
  };
}
