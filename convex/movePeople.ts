import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { recordAuditEvent } from "./lib/audit";
import {
  movePersonRoleValidator,
  normalizeOptionalText,
  normalizeSortOrder,
} from "./lib/moveFields";
import { requireMovePermission } from "./lib/permissions";

export const listForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:read"
    );

    const people = await ctx.db
      .query("movePeople")
      .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
      .collect();

    return people.filter(
      (person) =>
        person.householdId === args.householdId &&
        (args.includeArchived || !person.archivedAt)
    );
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
    if (actor.type !== "user") throw new Error("Signed-in user context required.");
    const now = Date.now();
    const personId = await ctx.db.insert("movePeople", {
      householdId: args.householdId,
      moveId: args.moveId,
      name: args.name.trim(),
      role: args.role,
      email: normalizeOptionalText(args.email),
      phone: normalizeOptionalText(args.phone),
      notes: normalizeOptionalText(args.notes),
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

export const update = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    personId: v.id("movePeople"),
    name: v.optional(v.string()),
    role: v.optional(movePersonRoleValidator),
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
    if (actor.type !== "user") throw new Error("Signed-in user context required.");

    const person = await ctx.db.get(args.personId);
    if (
      !person ||
      person.householdId !== args.householdId ||
      person.moveId !== args.moveId ||
      person.archivedAt
    ) {
      throw new Error("Move contact not found.");
    }

    const now = Date.now();
    const patch: Partial<Doc<"movePeople">> = {
      updatedByUserId: actor.userId,
      updatedAt: now,
    };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Contact name is required.");
      patch.name = name;
    }
    if (args.role !== undefined) patch.role = args.role;
    if (args.email !== undefined) patch.email = normalizeOptionalText(args.email);
    if (args.phone !== undefined) patch.phone = normalizeOptionalText(args.phone);
    if (args.notes !== undefined) patch.notes = normalizeOptionalText(args.notes);
    if (args.sortOrder !== undefined) {
      patch.sortOrder = normalizeSortOrder(args.sortOrder);
    }

    await ctx.db.patch(args.personId, patch);

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "household",
      action: "move_person.updated",
      objectTable: "movePeople",
      objectId: args.personId,
      metadata: { changedKeys: Object.keys(patch) },
    });

    return args.personId;
  },
});

export const archive = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    personId: v.id("movePeople"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:edit"
    );
    if (actor.type !== "user") throw new Error("Signed-in user context required.");

    const person = await ctx.db.get(args.personId);
    if (
      !person ||
      person.householdId !== args.householdId ||
      person.moveId !== args.moveId ||
      person.archivedAt
    ) {
      throw new Error("Move contact not found.");
    }

    const now = Date.now();
    await ctx.db.patch(args.personId, {
      archivedAt: now,
      updatedByUserId: actor.userId,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "household",
      action: "move_person.archived",
      objectTable: "movePeople",
      objectId: args.personId,
      metadata: { role: person.role },
    });

    return args.personId;
  },
});
