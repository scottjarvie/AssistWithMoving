import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  type MutationCtx,
  query,
  type QueryCtx,
} from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  boxStatusValidator,
  dimensionsValidator,
  normalizeBoxCode,
  normalizeOptionalText,
} from "./lib/moveFields";
import { requireMovePermission } from "./lib/permissions";

const boxWriteArgs = {
  code: v.optional(v.string()),
  label: v.optional(v.string()),
  room: v.optional(v.string()),
  destinationRoom: v.optional(v.string()),
  description: v.optional(v.string()),
  status: v.optional(boxStatusValidator),
  dimensionsIn: v.optional(dimensionsValidator),
  estimatedWeightLb: v.optional(v.number()),
  actualWeightLb: v.optional(v.number()),
  estimatedVolumeCuFt: v.optional(v.number()),
  assignedResourceId: v.optional(v.id("transportResources")),
  assignedZoneId: v.optional(v.id("transportZones")),
  clearAssignedResource: v.optional(v.boolean()),
  clearAssignedZone: v.optional(v.boolean()),
};

async function assertResourceAndZone(
  ctx: MutationCtx,
  args: {
    moveId: Id<"moves">;
    assignedResourceId?: Id<"transportResources">;
    assignedZoneId?: Id<"transportZones">;
  }
) {
  if (args.assignedResourceId) {
    const resource = await ctx.db.get(args.assignedResourceId);
    if (!resource || resource.moveId !== args.moveId || resource.archivedAt) {
      throw new Error("Invalid transport resource.");
    }
  }

  if (args.assignedZoneId) {
    const zone = await ctx.db.get(args.assignedZoneId);
    if (!zone || zone.moveId !== args.moveId || zone.archivedAt) {
      throw new Error("Invalid transport zone.");
    }
    if (args.assignedResourceId && zone.resourceId !== args.assignedResourceId) {
      throw new Error("Zone does not belong to the assigned resource.");
    }
  }
}

async function generateBoxCode(ctx: MutationCtx, moveId: Id<"moves">) {
  const boxes = await ctx.db
    .query("boxes")
    .withIndex("by_move_code", (q) => q.eq("moveId", moveId))
    .collect();
  const existingCodes = new Set(boxes.map((box) => box.code));

  for (let index = boxes.length + 1; index < boxes.length + 1000; index += 1) {
    const code = `B-${String(index).padStart(3, "0")}`;
    if (!existingCodes.has(code)) {
      return code;
    }
  }

  throw new Error("Could not generate a unique box code.");
}

async function ensureUniqueBoxCode(
  ctx: MutationCtx,
  moveId: Id<"moves">,
  code: string,
  currentBoxId?: Id<"boxes">
) {
  const existing = await ctx.db
    .query("boxes")
    .withIndex("by_move_code", (q) => q.eq("moveId", moveId).eq("code", code))
    .unique();

  if (existing && existing._id !== currentBoxId) {
    throw new Error("A box with that code already exists.");
  }
}

async function boxContents(ctx: QueryCtx, box: Doc<"boxes">) {
  const memberships = await ctx.db
    .query("boxItems")
    .withIndex("by_box", (q) => q.eq("boxId", box._id))
    .collect();

  const contents = await Promise.all(
    memberships.map(async (membership) => {
      const item = await ctx.db.get(membership.itemId);
      return item && !item.deletedAt ? { membership, item } : null;
    })
  );

  return contents.filter(Boolean);
}

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
      "inventory:read"
    );

    const boxes = await ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .collect();

    return await Promise.all(
      boxes
        .filter((box) => args.includeArchived || !box.archivedAt)
        .map(async (box) => {
          const contents = await boxContents(ctx, box);
          const itemCount = contents.reduce(
            (sum, entry) => sum + (entry?.membership.quantity ?? 0),
            0
          );
          const contentsEstimatedWeightLb = contents.reduce(
            (sum, entry) =>
              sum +
              (entry?.item.estimatedWeightLb ?? 0) *
                (entry?.membership.quantity ?? 1),
            0
          );

          return {
            box,
            contents,
            itemCount,
            contentsEstimatedWeightLb,
          };
        })
    );
  },
});

export const get = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    boxId: v.id("boxes"),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read"
    );

    const box = await ctx.db.get(args.boxId);
    if (
      !box ||
      box.householdId !== args.householdId ||
      box.moveId !== args.moveId ||
      box.archivedAt
    ) {
      return null;
    }

    const contents = await boxContents(ctx, box);
    const itemCount = contents.reduce(
      (sum, entry) => sum + (entry?.membership.quantity ?? 0),
      0
    );
    const contentsEstimatedWeightLb = contents.reduce(
      (sum, entry) =>
        sum +
        (entry?.item.estimatedWeightLb ?? 0) *
          (entry?.membership.quantity ?? 1),
      0
    );

    return { box, contents, itemCount, contentsEstimatedWeightLb };
  },
});

export const create = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    ...boxWriteArgs,
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit"
    );
    if (actor.type !== "user") {
      throw new Error("API-key box creation is not implemented yet.");
    }

    await assertResourceAndZone(ctx, args);

    const now = Date.now();
    const code = args.code
      ? normalizeBoxCode(args.code)
      : await generateBoxCode(ctx, args.moveId);
    if (!code) {
      throw new Error("Box code is required.");
    }
    await ensureUniqueBoxCode(ctx, args.moveId, code);

    const status = args.status ?? "open";
    const boxId = await ctx.db.insert("boxes", {
      householdId: args.householdId,
      moveId: args.moveId,
      code,
      label: normalizeOptionalText(args.label),
      room: normalizeOptionalText(args.room),
      destinationRoom: normalizeOptionalText(args.destinationRoom),
      description: normalizeOptionalText(args.description),
      status,
      dimensionsIn: args.dimensionsIn,
      estimatedWeightLb: args.estimatedWeightLb,
      actualWeightLb: args.actualWeightLb,
      estimatedVolumeCuFt: args.estimatedVolumeCuFt,
      assignedResourceId: args.assignedResourceId,
      assignedZoneId: args.assignedZoneId,
      sealedAt: status === "sealed" ? now : undefined,
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "box.created",
      objectTable: "boxes",
      objectId: boxId,
      metadata: { code, status },
    });

    return boxId;
  },
});

export const update = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    boxId: v.id("boxes"),
    ...boxWriteArgs,
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit"
    );
    if (actor.type !== "user") {
      throw new Error("API-key box updates are not implemented yet.");
    }

    const box = await ctx.db.get(args.boxId);
    if (!box || box.moveId !== args.moveId || box.householdId !== args.householdId) {
      throw new Error("Box not found.");
    }

    await assertResourceAndZone(ctx, args);

    const now = Date.now();
    const patch: Partial<Doc<"boxes">> = { updatedAt: now };
    if (args.code !== undefined) {
      const code = normalizeBoxCode(args.code);
      if (!code) {
        throw new Error("Box code is required.");
      }
      await ensureUniqueBoxCode(ctx, args.moveId, code, args.boxId);
      patch.code = code;
    }
    if (args.label !== undefined) patch.label = normalizeOptionalText(args.label);
    if (args.room !== undefined) patch.room = normalizeOptionalText(args.room);
    if (args.destinationRoom !== undefined) {
      patch.destinationRoom = normalizeOptionalText(args.destinationRoom);
    }
    if (args.description !== undefined) {
      patch.description = normalizeOptionalText(args.description);
    }
    if (args.status !== undefined) {
      patch.status = args.status;
      patch.archivedAt = args.status === "archived" ? now : undefined;
      patch.sealedAt = args.status === "sealed" ? box.sealedAt ?? now : box.sealedAt;
    }
    if (args.dimensionsIn !== undefined) patch.dimensionsIn = args.dimensionsIn;
    if (args.estimatedWeightLb !== undefined) {
      patch.estimatedWeightLb = args.estimatedWeightLb;
    }
    if (args.actualWeightLb !== undefined) patch.actualWeightLb = args.actualWeightLb;
    if (args.estimatedVolumeCuFt !== undefined) {
      patch.estimatedVolumeCuFt = args.estimatedVolumeCuFt;
    }
    if (args.assignedResourceId !== undefined) {
      patch.assignedResourceId = args.assignedResourceId;
    }
    if (args.assignedZoneId !== undefined) patch.assignedZoneId = args.assignedZoneId;
    if (args.clearAssignedResource) {
      patch.assignedResourceId = undefined;
      patch.assignedZoneId = undefined;
    } else if (args.clearAssignedZone) {
      patch.assignedZoneId = undefined;
    }

    await ctx.db.patch(args.boxId, patch);

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "box.updated",
      objectTable: "boxes",
      objectId: args.boxId,
      metadata: { changedKeys: Object.keys(patch) },
    });
  },
});

export const addItem = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    boxId: v.id("boxes"),
    itemId: v.id("items"),
    quantity: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit"
    );
    if (actor.type !== "user") {
      throw new Error("API-key box item updates are not implemented yet.");
    }

    const [box, item] = await Promise.all([
      ctx.db.get(args.boxId),
      ctx.db.get(args.itemId),
    ]);
    if (!box || box.moveId !== args.moveId || box.archivedAt) {
      throw new Error("Box not found.");
    }
    if (!item || item.moveId !== args.moveId || item.deletedAt) {
      throw new Error("Item not found.");
    }

    const now = Date.now();
    const quantity = args.quantity && args.quantity > 0 ? args.quantity : 1;
    const existing = await ctx.db
      .query("boxItems")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();
    const existingForMove = existing.find(
      (membership) => membership.moveId === args.moveId
    );

    if (existingForMove) {
      await ctx.db.patch(existingForMove._id, {
        boxId: args.boxId,
        quantity,
        notes: normalizeOptionalText(args.notes),
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("boxItems", {
        householdId: args.householdId,
        moveId: args.moveId,
        boxId: args.boxId,
        itemId: args.itemId,
        quantity,
        notes: normalizeOptionalText(args.notes),
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.itemId, {
      status: item.status === "active" ? "packed" : item.status,
      updatedByUserId: actor.userId,
      updatedAt: now,
    });
    await ctx.db.patch(args.boxId, { status: "packing", updatedAt: now });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "box.item_added",
      objectTable: "boxes",
      objectId: args.boxId,
      metadata: { itemId: args.itemId, quantity },
    });
  },
});

export const removeItem = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    boxItemId: v.id("boxItems"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit"
    );
    if (actor.type !== "user") {
      throw new Error("API-key box item updates are not implemented yet.");
    }

    const membership = await ctx.db.get(args.boxItemId);
    if (
      !membership ||
      membership.moveId !== args.moveId ||
      membership.householdId !== args.householdId
    ) {
      throw new Error("Box item not found.");
    }

    await ctx.db.delete(args.boxItemId);
    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "box.item_removed",
      objectTable: "boxes",
      objectId: membership.boxId,
      metadata: { itemId: membership.itemId },
    });
  },
});
