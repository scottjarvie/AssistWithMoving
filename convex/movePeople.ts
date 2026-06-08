import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  movePersonRoleValidator,
  normalizeSortOrder,
} from "./lib/moveFields";
import { requireMovePermission } from "./lib/permissions";

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
      "household:read"
    );

    return await ctx.db
      .query("movePeople")
      .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
      .collect();
  },
});

export const create = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    name: v.string(),
    role: movePersonRoleValidator,
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:edit"
    );
    if (actor.type !== "user") {
      throw new Error("API-key people creation is not implemented yet.");
    }
    const now = Date.now();
    const personId = await ctx.db.insert("movePeople", {
      householdId: args.householdId,
      moveId: args.moveId,
      name: args.name.trim(),
      role: args.role,
      email: args.email,
      phone: args.phone,
      notes: args.notes,
      sortOrder: normalizeSortOrder(args.sortOrder),
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "household",
      action: "move_person.created",
      objectTable: "movePeople",
      objectId: personId,
      metadata: { role: args.role },
    });

    return personId;
  },
});
