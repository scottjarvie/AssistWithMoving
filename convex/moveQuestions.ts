import { v } from "convex/values";

import { query } from "./_generated/server";
import { summarizeMoveQuestionsFromDocs } from "./lib/moveQuestionDocuments";
import { requireMovePermission } from "./lib/permissions";

export const summaryForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read"
    );

    const [move, items, boxes, memberships, photos, resources, zones] =
      await Promise.all([
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
          .query("itemPhotos")
          .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
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

    if (!move || move.householdId !== args.householdId) {
      throw new Error("Move not found.");
    }

    return summarizeMoveQuestionsFromDocs({
      householdId: args.householdId,
      move,
      items,
      boxes,
      memberships,
      photos,
      resources,
      zones,
    });
  },
});
