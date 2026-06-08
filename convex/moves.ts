import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  moveStatusValidator,
  moveTypeValidator,
  unitSystemValidator,
} from "./lib/moveFields";
import {
  requireHouseholdPermission,
  requireMovePermission,
} from "./lib/permissions";

export const listForHousehold = query({
  args: {
    householdId: v.id("households"),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireHouseholdPermission(ctx, args.householdId, "household:read");

    const moves = await ctx.db
      .query("moves")
      .withIndex("by_household_status", (q) => q.eq("householdId", args.householdId))
      .collect();

    return args.includeArchived
      ? moves
      : moves.filter((move) => move.status !== "archived");
  },
});

export const create = mutation({
  args: {
    householdId: v.id("households"),
    title: v.string(),
    type: moveTypeValidator,
    origin: v.optional(v.string()),
    destination: v.optional(v.string()),
    dateStart: v.optional(v.string()),
    dateEnd: v.optional(v.string()),
    unitSystem: v.optional(unitSystemValidator),
    moveLevelWeightAllowanceLb: v.optional(v.number()),
    pcsBranch: v.optional(v.string()),
    pcsShipmentType: v.optional(v.string()),
    pcsOrdersNumber: v.optional(v.string()),
    proGearNotes: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireHouseholdPermission(
      ctx,
      args.householdId,
      "household:edit"
    );
    if (actor.type !== "user") {
      throw new Error("API-key move creation is not implemented yet.");
    }

    const now = Date.now();
    const moveId = await ctx.db.insert("moves", {
      householdId: args.householdId,
      title: args.title.trim(),
      type: args.type,
      status: "planning",
      origin: args.origin,
      destination: args.destination,
      dateStart: args.dateStart,
      dateEnd: args.dateEnd,
      unitSystem: args.unitSystem ?? "imperial",
      moveLevelWeightAllowanceLb: args.moveLevelWeightAllowanceLb,
      pcsBranch: args.pcsBranch,
      pcsShipmentType: args.pcsShipmentType,
      pcsOrdersNumber: args.pcsOrdersNumber,
      proGearNotes: args.proGearNotes,
      notes: args.notes,
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "household",
      action: "move.created",
      objectTable: "moves",
      objectId: moveId,
      metadata: { title: args.title.trim(), type: args.type },
    });

    return moveId;
  },
});

export const updateBasics = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    title: v.optional(v.string()),
    status: v.optional(moveStatusValidator),
    origin: v.optional(v.string()),
    destination: v.optional(v.string()),
    dateStart: v.optional(v.string()),
    dateEnd: v.optional(v.string()),
    moveLevelWeightAllowanceLb: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:edit"
    );

    await ctx.db.patch(args.moveId, {
      title: args.title?.trim(),
      status: args.status,
      origin: args.origin,
      destination: args.destination,
      dateStart: args.dateStart,
      dateEnd: args.dateEnd,
      moveLevelWeightAllowanceLb: args.moveLevelWeightAllowanceLb,
      notes: args.notes,
      updatedAt: Date.now(),
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: actor.type,
      actorUserId: actor.type === "user" ? actor.userId : undefined,
      actorApiKeyId: actor.type === "apiKey" ? actor.apiKeyId : undefined,
      category: "household",
      action: "move.updated",
      objectTable: "moves",
      objectId: args.moveId,
      metadata: args,
    });
  },
});

export const archive = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:manage_settings"
    );

    await ctx.db.patch(args.moveId, {
      status: "archived",
      archivedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: actor.type,
      actorUserId: actor.type === "user" ? actor.userId : undefined,
      actorApiKeyId: actor.type === "apiKey" ? actor.apiKeyId : undefined,
      category: "household",
      action: "move.archived",
      objectTable: "moves",
      objectId: args.moveId,
    });
  },
});
