// UI helper: assign a mixed selection of "movable units" (boxes + loose items)
// to a transport target (resource / zone / trip / trip-space) in one call. The
// client builds units from src/lib/movable-units.ts where each unit has a
// recordId that is a raw Convex doc id (Id<"boxes"> | Id<"items">); this mutation
// takes the same id shape as a string and a kind of "box" | "item".
//
// Box rows and item rows are routed through the SAME shared batchAssign helper
// (convex/lib/batchAssign.ts) so load validation is identical to the single
// boxes.update / items.update paths, and the unified per-row results are
// returned in the original input order.

import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import {
  BATCH_ASSIGN_MAX_ROWS,
  runBatchAssign,
  type BatchAssignRow,
  type BatchAssignRowResult,
  type BatchAssignTarget,
} from "./lib/batchAssign";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";

export const batchAssign = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    units: v.array(
      v.object({
        kind: v.union(v.literal("box"), v.literal("item")),
        recordId: v.string(),
      }),
    ),
    target: v.object({
      assignedResourceId: v.optional(v.id("transportResources")),
      assignedZoneId: v.optional(v.id("transportZones")),
      assignedTripId: v.optional(v.id("transportTrips")),
      assignedTripSpaceId: v.optional(v.id("tripSpaces")),
      clearAssignment: v.optional(v.boolean()),
      assignmentOverrideReason: v.optional(v.string()),
    }),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }
    if (args.units.length > BATCH_ASSIGN_MAX_ROWS) {
      throw new Error(
        `Batch movable-unit assignment is limited to ${BATCH_ASSIGN_MAX_ROWS} units.`,
      );
    }

    // Preserve original input order so the client can map results 1:1, while
    // routing box vs item rows through the single-sourced batchAssign helper.
    const rows: BatchAssignRow[] = args.units.map((unit) =>
      unit.kind === "box"
        ? { kind: "box", recordId: unit.recordId as Id<"boxes"> }
        : { kind: "item", recordId: unit.recordId as Id<"items"> },
    );

    const target: BatchAssignTarget = {
      assignedResourceId: args.target.assignedResourceId,
      assignedZoneId: args.target.assignedZoneId,
      assignedTripId: args.target.assignedTripId,
      assignedTripSpaceId: args.target.assignedTripSpaceId,
      clearAssignment: args.target.clearAssignment,
      assignmentOverrideReason: args.target.assignmentOverrideReason,
    };

    const result = await runBatchAssign(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorUserId: actor.userId,
      rows,
      target,
      dryRun: Boolean(args.dryRun),
    });

    // runBatchAssign already returns results in input order with the unit kind,
    // so the unified shape is returned directly.
    const results: BatchAssignRowResult[] = result.results;
    return { ...result, results };
  },
});
