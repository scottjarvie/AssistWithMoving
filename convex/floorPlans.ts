import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import { normalizeOptionalText } from "./lib/moveFields";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";
import {
  defaultPlanShortIdCounters,
  floorPlanKindValidator,
} from "./lib/planValidators";

const defaultWallThicknessIn = 4.5;
const defaultCeilingHeightIn = 96;
const defaultGridSnapIn = 3;

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
      "household:read",
    );

    const plans = await ctx.db
      .query("floorPlans")
      .withIndex("by_move_status", (q) => q.eq("moveId", args.moveId))
      .collect();

    return args.includeArchived
      ? plans
      : plans.filter((plan) => plan.status === "active" && !plan.archivedAt);
  },
});

export const getWithLevels = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    planId: v.id("floorPlans"),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:read",
    );

    const plan = await ctx.db.get(args.planId);
    if (
      !plan ||
      plan.householdId !== args.householdId ||
      plan.moveId !== args.moveId ||
      plan.archivedAt
    ) {
      return null;
    }

    const levels = await ctx.db
      .query("planLevels")
      .withIndex("by_plan_sort", (q) => q.eq("planId", args.planId))
      .collect();

    return {
      plan,
      levels: levels.filter((level) => !level.archivedAt),
    };
  },
});

export const getActiveDocumentForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:read",
    );

    const plans = await ctx.db
      .query("floorPlans")
      .withIndex("by_move_status", (q) =>
        q.eq("moveId", args.moveId).eq("status", "active"),
      )
      .collect();
    const plan = plans.find((entry) => !entry.archivedAt);
    if (!plan) {
      return null;
    }

    const levels = (
      await ctx.db
        .query("planLevels")
        .withIndex("by_plan_sort", (q) => q.eq("planId", plan._id))
        .collect()
    ).filter((level) => !level.archivedAt);
    const entities = (
      await ctx.db
        .query("planEntities")
        .withIndex("by_plan_type", (q) => q.eq("planId", plan._id))
        .collect()
    ).filter((entity) => !entity.archivedAt);
    const placements = (
      await ctx.db
        .query("planPlacements")
        .withIndex("by_plan", (q) => q.eq("planId", plan._id))
        .collect()
    ).filter((placement) => !placement.archivedAt);
    const underlayPhotoIds = new Set(
      levels
        .map((level) => level.underlay?.photoId)
        .filter((photoId): photoId is NonNullable<typeof photoId> =>
          Boolean(photoId),
        ),
    );
    const underlayPhotos = (
      await Promise.all(
        [...underlayPhotoIds].map(async (photoId) => {
          const photo = await ctx.db.get(photoId);
          if (
            !photo ||
            photo.householdId !== args.householdId ||
            photo.moveId !== args.moveId ||
            photo.archivedAt
          ) {
            return null;
          }
          return {
            _id: photo._id,
            width: photo.width,
            height: photo.height,
            caption: photo.caption,
            photoType: photo.photoType,
          };
        }),
      )
    ).filter((photo): photo is NonNullable<typeof photo> => Boolean(photo));

    return {
      plan,
      levels,
      entities,
      placements,
      underlayPhotos,
    };
  },
});

export const createFloorPlan = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    name: v.optional(v.string()),
    kind: v.optional(floorPlanKindValidator),
    northAngleDeg: v.optional(v.number()),
    defaultWallThicknessIn: v.optional(v.number()),
    defaultCeilingHeightIn: v.optional(v.number()),
    gridSnapIn: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }

    const move = await ctx.db.get(args.moveId);
    if (!move || move.householdId !== args.householdId) {
      throw new Error("Move not found.");
    }

    const now = Date.now();
    const name = normalizeOptionalText(args.name) ?? "Destination plan";
    const planId = await ctx.db.insert("floorPlans", {
      householdId: args.householdId,
      moveId: args.moveId,
      name,
      kind: args.kind ?? "destination",
      northAngleDeg: normalizeNumber(args.northAngleDeg, 0),
      defaultWallThicknessIn: positiveNumber(
        args.defaultWallThicknessIn,
        defaultWallThicknessIn,
      ),
      defaultCeilingHeightIn: positiveNumber(
        args.defaultCeilingHeightIn,
        defaultCeilingHeightIn,
      ),
      gridSnapIn: positiveNumber(args.gridSnapIn, defaultGridSnapIn),
      shortIdCounters: { ...defaultPlanShortIdCounters },
      nextSeq: 1,
      status: "active",
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    const mainLevelId = await ctx.db.insert("planLevels", {
      householdId: args.householdId,
      moveId: args.moveId,
      planId,
      name: "Main floor",
      levelType: "indoor",
      sortOrder: 0,
      ceilingHeightIn: positiveNumber(
        args.defaultCeilingHeightIn,
        defaultCeilingHeightIn,
      ),
      createdAt: now,
      updatedAt: now,
    });

    const yardLevelId = await ctx.db.insert("planLevels", {
      householdId: args.householdId,
      moveId: args.moveId,
      planId,
      name: "Yard",
      levelType: "outdoor",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "household",
      action: "floor_plan.created",
      objectTable: "floorPlans",
      objectId: planId,
      metadata: {
        kind: args.kind ?? "destination",
        name,
        levelIds: [mainLevelId, yardLevelId],
      },
    });

    return { planId, levelIds: [mainLevelId, yardLevelId] };
  },
});

function normalizeNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}
