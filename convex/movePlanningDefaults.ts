import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import { getMovePlanningDefaults } from "./lib/planningDefaults";
import { requireMovePermission } from "./lib/permissions";

export async function insertMissingMovePlanningDefaults(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
  }
) {
  const existing = await ctx.db
    .query("movePlanningDefaults")
    .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
    .collect();
  const existingKeys = new Set(existing.map((defaultRecord) => defaultRecord.key));
  const now = Date.now();
  const insertedIds = [];

  for (const [index, defaultPreset] of getMovePlanningDefaults().entries()) {
    if (existingKeys.has(defaultPreset.key)) {
      continue;
    }

    const id = await ctx.db.insert("movePlanningDefaults", {
      householdId: args.householdId,
      moveId: args.moveId,
      key: defaultPreset.key,
      label: defaultPreset.label,
      description: defaultPreset.description,
      handling: defaultPreset.handling,
      sensitiveByDefault: defaultPreset.sensitiveByDefault,
      recommendedResourceTypes: defaultPreset.recommendedResourceTypes,
      documentationProfileTypes: defaultPreset.documentationProfileTypes,
      sortOrder: now + index,
      createdAt: now,
      updatedAt: now,
    });
    insertedIds.push(id);
  }

  return insertedIds;
}

export const listForMove = query({
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

    return await ctx.db
      .query("movePlanningDefaults")
      .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
      .collect();
  },
});

export const ensureForMove = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:edit"
    );

    const insertedIds = await insertMissingMovePlanningDefaults(ctx, args);

    if (insertedIds.length) {
      await recordAuditEvent(ctx, {
        householdId: args.householdId,
        moveId: args.moveId,
        actorType: actor.type,
        actorUserId: actor.type === "user" ? actor.userId : undefined,
        actorApiKeyId: actor.type === "apiKey" ? actor.apiKeyId : undefined,
        category: "household",
        action: "move_planning_defaults.created",
        objectTable: "movePlanningDefaults",
        metadata: { count: insertedIds.length },
      });
    }

    return insertedIds;
  },
});
