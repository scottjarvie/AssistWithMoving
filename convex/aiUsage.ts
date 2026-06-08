import { v } from "convex/values";

import { query } from "./_generated/server";
import { summarizeAiUsage } from "./lib/aiUsage";
import {
  requireHouseholdPermission,
  requireMovePermission,
} from "./lib/permissions";

export const summaryForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read"
    );

    const limit = Math.min(Math.max(args.limit ?? 500, 1), 1000);
    const jobs = await ctx.db
      .query("aiJobs")
      .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .take(limit);

    return summarizeAiUsage(jobs);
  },
});

export const adminSummaryForHousehold = query({
  args: {
    householdId: v.id("households"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireHouseholdPermission(ctx, args.householdId, "admin:read");

    const limit = Math.min(Math.max(args.limit ?? 1000, 1), 2000);
    const jobs = await ctx.db
      .query("aiJobs")
      .withIndex("by_household_created", (q) =>
        q.eq("householdId", args.householdId)
      )
      .order("desc")
      .take(limit);

    return summarizeAiUsage(jobs);
  },
});
