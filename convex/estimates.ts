import { v } from "convex/values";

import { query } from "./_generated/server";
import { composeEstimateReport } from "./lib/loadPlanSnapshot";
import { requireMovePermission } from "./lib/permissions";

export const reportForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );

    const [move, items, boxes, boxItems, resources, zones] = await Promise.all([
      ctx.db.get(args.moveId),
      ctx.db
        .query("items")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("boxes")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("boxItems")
        .withIndex("by_move", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("transportResources")
        .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("transportZones")
        .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
        .collect(),
    ]);

    return composeEstimateReport({
      move,
      items,
      boxes,
      boxItems,
      resources,
      zones,
    });
  },
});
