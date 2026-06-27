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

import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import {
  BATCH_ASSIGN_MAX_ROWS,
  runBatchAssign,
  type BatchAssignRow,
  type BatchAssignRowResult,
  type BatchAssignTarget,
} from "./lib/batchAssign";
import { recordAuditEvent } from "./lib/audit";
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

// UI helper sibling to batchAssign: PLACE a mixed selection of movable units
// (boxes + loose items) into a physical moveSpace by setting currentSpaceId — or
// clear it (clearCurrentSpace) to send them back to "Needs a home". This is the
// "Move to space" bulk action on the Spaces and Transport page. Transport
// assignment (assignedResourceId/Zone) is a SEPARATE axis handled by batchAssign;
// placing in a space here does not touch it.
export const batchPlaceInSpace = mutation({
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
      currentSpaceId: v.optional(v.id("moveSpaces")),
      clearCurrentSpace: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    if (actor.type !== "user") {
      throw new ConvexError(directConvexUserContextRequiredMessage);
    }
    if (args.units.length > BATCH_ASSIGN_MAX_ROWS) {
      throw new ConvexError(
        `Batch space placement is limited to ${BATCH_ASSIGN_MAX_ROWS} units.`,
      );
    }

    const clearing = args.target.clearCurrentSpace === true;
    const targetSpaceId = clearing ? undefined : args.target.currentSpaceId;
    if (!clearing && !targetSpaceId) {
      throw new ConvexError(
        "Choose a space to move these units into, or clear their space.",
      );
    }

    // Validate the destination space belongs to this move and is active. Mirrors
    // assertItemSpaceTargets in items.ts so a stray/foreign/archived space can't
    // be written onto a box or item.
    if (targetSpaceId) {
      const space = await ctx.db.get(targetSpaceId);
      if (
        !space ||
        space.householdId !== args.householdId ||
        space.moveId !== args.moveId ||
        space.status === "archived"
      ) {
        throw new ConvexError("That space is not available for this move.");
      }
    }

    const now = Date.now();
    const results: Array<{
      index: number;
      ok: boolean;
      recordId?: string;
      error?: string;
    }> = [];

    for (const [index, unit] of args.units.entries()) {
      try {
        if (unit.kind === "box") {
          // normalizeId rejects a recordId that isn't actually a boxes id
          // (Convex ids encode their table), guarding against a mismatched
          // kind+id writing to the wrong table.
          const boxId = ctx.db.normalizeId("boxes", unit.recordId);
          const box = boxId ? await ctx.db.get(boxId) : null;
          if (
            !box ||
            box.householdId !== args.householdId ||
            box.moveId !== args.moveId ||
            box.archivedAt
          ) {
            throw new ConvexError("Box not found.");
          }
          // NOTE: boxes carry only updatedAt (no updatedByUserId column),
          // unlike items — see schema.ts.
          const patch: Partial<Doc<"boxes">> = {
            currentSpaceId: targetSpaceId,
            updatedAt: now,
          };
          await ctx.db.patch(box._id, patch);
          await recordAuditEvent(ctx, {
            householdId: args.householdId,
            moveId: args.moveId,
            actorType: "user",
            actorUserId: actor.userId,
            category: "inventory",
            action: "box.placed_in_space",
            objectTable: "boxes",
            objectId: box._id,
            metadata: { rowIndex: index, currentSpaceId: targetSpaceId, cleared: clearing },
          });
          results.push({ index, ok: true, recordId: String(box._id) });
        } else {
          const itemId = ctx.db.normalizeId("items", unit.recordId);
          const item = itemId ? await ctx.db.get(itemId) : null;
          if (
            !item ||
            item.householdId !== args.householdId ||
            item.moveId !== args.moveId ||
            item.deletedAt
          ) {
            throw new ConvexError("Item not found.");
          }
          const patch: Partial<Doc<"items">> = {
            currentSpaceId: targetSpaceId,
            updatedByUserId: actor.userId,
            updatedAt: now,
          };
          await ctx.db.patch(item._id, patch);
          await recordAuditEvent(ctx, {
            householdId: args.householdId,
            moveId: args.moveId,
            actorType: "user",
            actorUserId: actor.userId,
            category: "inventory",
            action: "item.placed_in_space",
            objectTable: "items",
            objectId: item._id,
            metadata: { rowIndex: index, currentSpaceId: targetSpaceId, cleared: clearing },
          });
          results.push({ index, ok: true, recordId: String(item._id) });
        }
      } catch (error) {
        results.push({
          index,
          ok: false,
          recordId: unit.recordId,
          error:
            error instanceof ConvexError
              ? String(error.data)
              : "Could not move that unit.",
        });
      }
    }

    const succeeded = results.filter((row) => row.ok).length;
    return {
      succeeded,
      failed: results.length - succeeded,
      results,
    };
  },
});
