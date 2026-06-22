import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  normalizeOptionalText,
  normalizeSortOrder,
  transportTripStatusValidator,
} from "./lib/moveFields";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";

function normalizeOptionalNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

async function loadResourceForMove(
  ctx: QueryCtx | MutationCtx,
  resourceId: Id<"transportResources">,
  moveId: Id<"moves">
): Promise<Doc<"transportResources">> {
  const resource = await ctx.db.get(resourceId);
  if (!resource || resource.moveId !== moveId) {
    throw new Error("Transportation method not found for this move.");
  }
  return resource;
}

async function loadTripForMove(
  ctx: QueryCtx | MutationCtx,
  tripId: Id<"transportTrips">,
  moveId: Id<"moves">
): Promise<Doc<"transportTrips">> {
  const trip = await ctx.db.get(tripId);
  if (!trip || trip.moveId !== moveId) {
    throw new Error("Trip not found for this move.");
  }
  return trip;
}

async function loadTripSpaceForMove(
  ctx: QueryCtx | MutationCtx,
  spaceId: Id<"tripSpaces">,
  moveId: Id<"moves">
): Promise<Doc<"tripSpaces">> {
  const space = await ctx.db.get(spaceId);
  if (!space || space.moveId !== moveId) {
    throw new Error("Trip space not found for this move.");
  }
  return space;
}

export const listForResource = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    resourceId: v.id("transportResources"),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read"
    );

    const trips = await ctx.db
      .query("transportTrips")
      .withIndex("by_resource_sort", (q) =>
        q.eq("resourceId", args.resourceId)
      )
      .collect();

    return trips.filter((trip) => trip.archivedAt === undefined);
  },
});

// Resources -> trips -> tripSpaces for the Move "Transportation Methods" tab.
export const listForMoveWithSpaces = query({
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

    const trips = (
      await ctx.db
        .query("transportTrips")
        .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
        .collect()
    ).filter((trip) => trip.archivedAt === undefined);

    const spaces = (
      await ctx.db
        .query("tripSpaces")
        .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
        .collect()
    ).filter((space) => space.archivedAt === undefined);

    const spacesByTrip = new Map<Id<"transportTrips">, Doc<"tripSpaces">[]>();
    for (const space of spaces) {
      const list = spacesByTrip.get(space.tripId) ?? [];
      list.push(space);
      spacesByTrip.set(space.tripId, list);
    }
    for (const list of spacesByTrip.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    return trips.map((trip) => ({
      ...trip,
      spaces: spacesByTrip.get(trip._id) ?? [],
    }));
  },
});

export const createTrip = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    resourceId: v.id("transportResources"),
    name: v.string(),
    description: v.optional(v.string()),
    scheduledDate: v.optional(v.string()),
    status: v.optional(transportTripStatusValidator),
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
      throw new Error(directConvexUserContextRequiredMessage);
    }
    await loadResourceForMove(ctx, args.resourceId, args.moveId);

    const now = Date.now();
    const name = args.name.trim() || "Trip";
    const tripId = await ctx.db.insert("transportTrips", {
      householdId: args.householdId,
      moveId: args.moveId,
      resourceId: args.resourceId,
      name: name.slice(0, 160),
      description: normalizeOptionalText(args.description),
      scheduledDate: normalizeOptionalText(args.scheduledDate),
      status: args.status ?? "planned",
      sortOrder: normalizeSortOrder(args.sortOrder),
      createdByUserId: actor.userId,
      updatedByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "household",
      action: "transport_trip.created",
      objectTable: "transportTrips",
      objectId: tripId,
      metadata: { resourceId: args.resourceId, name },
    });

    return tripId;
  },
});

export const updateTrip = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    tripId: v.id("transportTrips"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    scheduledDate: v.optional(v.string()),
    status: v.optional(transportTripStatusValidator),
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
      throw new Error(directConvexUserContextRequiredMessage);
    }
    const trip = await loadTripForMove(ctx, args.tripId, args.moveId);

    const patch: Partial<Doc<"transportTrips">> = {
      updatedByUserId: actor.userId,
      updatedAt: Date.now(),
    };
    if (args.name !== undefined) {
      patch.name = (args.name.trim() || trip.name).slice(0, 160);
    }
    if (args.description !== undefined) {
      patch.description = normalizeOptionalText(args.description);
    }
    if (args.scheduledDate !== undefined) {
      patch.scheduledDate = normalizeOptionalText(args.scheduledDate);
    }
    if (args.status !== undefined) {
      patch.status = args.status;
    }
    if (args.sortOrder !== undefined) {
      patch.sortOrder = normalizeSortOrder(args.sortOrder);
    }

    await ctx.db.patch(args.tripId, patch);

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "household",
      action: "transport_trip.updated",
      objectTable: "transportTrips",
      objectId: args.tripId,
      metadata: { resourceId: trip.resourceId },
    });
  },
});

export const archiveTrip = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    tripId: v.id("transportTrips"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:edit"
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }
    await loadTripForMove(ctx, args.tripId, args.moveId);

    const now = Date.now();
    // Archive the trip and all of its (non-archived) spaces.
    const spaces = await ctx.db
      .query("tripSpaces")
      .withIndex("by_trip_sort", (q) => q.eq("tripId", args.tripId))
      .collect();
    for (const space of spaces) {
      if (space.archivedAt === undefined) {
        await ctx.db.patch(space._id, {
          archivedAt: now,
          updatedByUserId: actor.userId,
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(args.tripId, {
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
      action: "transport_trip.archived",
      objectTable: "transportTrips",
      objectId: args.tripId,
      metadata: { archivedSpaceCount: spaces.length },
    });
  },
});

export const reorderTrips = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    orders: v.array(
      v.object({
        tripId: v.id("transportTrips"),
        sortOrder: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:edit"
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }
    const now = Date.now();
    for (const order of args.orders) {
      const trip = await loadTripForMove(ctx, order.tripId, args.moveId);
      if (trip.sortOrder !== order.sortOrder) {
        await ctx.db.patch(order.tripId, {
          sortOrder: order.sortOrder,
          updatedByUserId: actor.userId,
          updatedAt: now,
        });
      }
    }
  },
});

export const createTripSpace = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    tripId: v.id("transportTrips"),
    name: v.string(),
    description: v.optional(v.string()),
    maxAreaSqFt: v.optional(v.number()),
    maxWeightLb: v.optional(v.number()),
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
      throw new Error(directConvexUserContextRequiredMessage);
    }
    const trip = await loadTripForMove(ctx, args.tripId, args.moveId);

    const now = Date.now();
    const name = (args.name.trim() || "Space").slice(0, 160);
    const spaceId = await ctx.db.insert("tripSpaces", {
      householdId: args.householdId,
      moveId: args.moveId,
      resourceId: trip.resourceId,
      tripId: args.tripId,
      name,
      description: normalizeOptionalText(args.description),
      maxAreaSqFt: normalizeOptionalNumber(args.maxAreaSqFt),
      maxWeightLb: normalizeOptionalNumber(args.maxWeightLb),
      sortOrder: normalizeSortOrder(args.sortOrder),
      createdByUserId: actor.userId,
      updatedByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "household",
      action: "transport_trip_space.created",
      objectTable: "tripSpaces",
      objectId: spaceId,
      metadata: { tripId: args.tripId, name },
    });

    return spaceId;
  },
});

export const updateTripSpace = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    spaceId: v.id("tripSpaces"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    maxAreaSqFt: v.optional(v.number()),
    maxWeightLb: v.optional(v.number()),
    clearMaxAreaSqFt: v.optional(v.boolean()),
    clearMaxWeightLb: v.optional(v.boolean()),
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
      throw new Error(directConvexUserContextRequiredMessage);
    }
    const space = await loadTripSpaceForMove(ctx, args.spaceId, args.moveId);

    const patch: Partial<Doc<"tripSpaces">> = {
      updatedByUserId: actor.userId,
      updatedAt: Date.now(),
    };
    if (args.name !== undefined) {
      patch.name = (args.name.trim() || space.name).slice(0, 160);
    }
    if (args.description !== undefined) {
      patch.description = normalizeOptionalText(args.description);
    }
    if (args.clearMaxAreaSqFt) {
      patch.maxAreaSqFt = undefined;
    } else if (args.maxAreaSqFt !== undefined) {
      patch.maxAreaSqFt = normalizeOptionalNumber(args.maxAreaSqFt);
    }
    if (args.clearMaxWeightLb) {
      patch.maxWeightLb = undefined;
    } else if (args.maxWeightLb !== undefined) {
      patch.maxWeightLb = normalizeOptionalNumber(args.maxWeightLb);
    }
    if (args.sortOrder !== undefined) {
      patch.sortOrder = normalizeSortOrder(args.sortOrder);
    }

    await ctx.db.patch(args.spaceId, patch);

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "household",
      action: "transport_trip_space.updated",
      objectTable: "tripSpaces",
      objectId: args.spaceId,
      metadata: { tripId: space.tripId },
    });
  },
});

export const archiveTripSpace = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    spaceId: v.id("tripSpaces"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:edit"
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }
    const space = await loadTripSpaceForMove(ctx, args.spaceId, args.moveId);

    const now = Date.now();
    await ctx.db.patch(args.spaceId, {
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
      action: "transport_trip_space.archived",
      objectTable: "tripSpaces",
      objectId: args.spaceId,
      metadata: { tripId: space.tripId },
    });
  },
});
