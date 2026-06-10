import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import { assertHouseholdEntitlement } from "./lib/billing";
import {
  defaultDocumentationProfilesForMoveType,
  documentationProfileTypeValidator,
  moveStatusValidator,
  moveTypeValidator,
  normalizeDocumentationProfileTypes,
  normalizeOptionalText,
  pcsBranchValidator,
  pcsDependentStatusValidator,
  pcsShipmentTypeValidator,
  unitSystemValidator,
} from "./lib/moveFields";
import {
  directConvexUserContextRequiredMessage,
  requireHouseholdPermission,
  requireMovePermission,
} from "./lib/permissions";
import { insertMissingMovePlanningDefaults } from "./movePlanningDefaults";
import { insertTransportResourceFromPreset } from "./transportResources";
import { transportPresetsForMoveType } from "./lib/transportPresets";

export const listForHousehold = query({
  args: {
    householdId: v.id("households"),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireHouseholdPermission(ctx, args.householdId, "household:read");

    const moves = await ctx.db
      .query("moves")
      .withIndex("by_household_status", (q) =>
        q.eq("householdId", args.householdId),
      )
      .collect();

    return args.includeArchived
      ? moves
      : moves.filter((move) => move.status !== "archived");
  },
});

// Resolve a deep-linked move to its household so the workspace can load the
// right household even when the user belongs to several. Returns null instead
// of throwing so a stale or foreign link degrades to the dashboard fallback.
export const getForLink = query({
  args: {
    // Accepts any string so malformed URLs resolve to null instead of a
    // validator error crashing the page.
    moveId: v.string(),
  },
  handler: async (ctx, args) => {
    const moveId = ctx.db.normalizeId("moves", args.moveId);
    if (!moveId) {
      return null;
    }

    const move = await ctx.db.get(moveId);
    if (!move || move.status === "archived") {
      return null;
    }

    try {
      await requireMovePermission(
        ctx,
        move.householdId,
        moveId,
        "household:read",
      );
    } catch {
      return null;
    }

    return move;
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
    documentationProfileTypes: v.optional(
      v.array(documentationProfileTypeValidator),
    ),
    moveLevelWeightAllowanceLb: v.optional(v.number()),
    pcsBranch: v.optional(pcsBranchValidator),
    pcsRankPayGrade: v.optional(v.string()),
    pcsDependentStatus: v.optional(pcsDependentStatusValidator),
    pcsShipmentType: v.optional(pcsShipmentTypeValidator),
    pcsOrdersNumber: v.optional(v.string()),
    pcsAllowanceNotes: v.optional(v.string()),
    pcsTransportationOfficeNotes: v.optional(v.string()),
    pcsRestrictedItemsNotes: v.optional(v.string()),
    proGearNotes: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireHouseholdPermission(
      ctx,
      args.householdId,
      "household:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }

    await assertHouseholdEntitlement(ctx, {
      householdId: args.householdId,
      dimension: "activeMoves",
    });

    const now = Date.now();
    const documentationProfileTypes = args.documentationProfileTypes?.length
      ? normalizeDocumentationProfileTypes(args.documentationProfileTypes)
      : [...defaultDocumentationProfilesForMoveType(args.type)];
    const moveId = await ctx.db.insert("moves", {
      householdId: args.householdId,
      title: args.title.trim(),
      type: args.type,
      status: "planning",
      origin: normalizeOptionalText(args.origin),
      destination: normalizeOptionalText(args.destination),
      dateStart: normalizeOptionalText(args.dateStart),
      dateEnd: normalizeOptionalText(args.dateEnd),
      unitSystem: args.unitSystem ?? "imperial",
      documentationProfileTypes,
      moveLevelWeightAllowanceLb: args.moveLevelWeightAllowanceLb,
      pcsBranch: args.pcsBranch,
      pcsRankPayGrade: normalizeOptionalText(args.pcsRankPayGrade),
      pcsDependentStatus: args.pcsDependentStatus,
      pcsShipmentType: args.pcsShipmentType,
      pcsOrdersNumber: normalizeOptionalText(args.pcsOrdersNumber),
      pcsAllowanceNotes: normalizeOptionalText(args.pcsAllowanceNotes),
      pcsTransportationOfficeNotes: normalizeOptionalText(
        args.pcsTransportationOfficeNotes,
      ),
      pcsRestrictedItemsNotes: normalizeOptionalText(
        args.pcsRestrictedItemsNotes,
      ),
      proGearNotes: normalizeOptionalText(args.proGearNotes),
      notes: normalizeOptionalText(args.notes),
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });
    const planningDefaultIds = await insertMissingMovePlanningDefaults(ctx, {
      householdId: args.householdId,
      moveId,
    });

    // Template pre-load: a new move starts with the transport resources its
    // template suggests, so the load plan is never an empty page.
    const templatePresets = transportPresetsForMoveType(args.type);
    for (const [index, presetKey] of templatePresets.entries()) {
      await insertTransportResourceFromPreset(ctx, {
        householdId: args.householdId,
        moveId,
        presetKey,
        userId: actor.userId,
        sortOrder: now + index,
      });
    }

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "household",
      action: "move.created",
      objectTable: "moves",
      objectId: moveId,
      metadata: {
        title: args.title.trim(),
        type: args.type,
        documentationProfileTypes,
        planningDefaultCount: planningDefaultIds.length,
        templateTransportPresets: templatePresets,
      },
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
    documentationProfileTypes: v.optional(
      v.array(documentationProfileTypeValidator),
    ),
    moveLevelWeightAllowanceLb: v.optional(v.number()),
    pcsBranch: v.optional(pcsBranchValidator),
    pcsRankPayGrade: v.optional(v.string()),
    pcsDependentStatus: v.optional(pcsDependentStatusValidator),
    pcsShipmentType: v.optional(pcsShipmentTypeValidator),
    pcsOrdersNumber: v.optional(v.string()),
    pcsAllowanceNotes: v.optional(v.string()),
    pcsTransportationOfficeNotes: v.optional(v.string()),
    pcsRestrictedItemsNotes: v.optional(v.string()),
    proGearNotes: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:edit",
    );

    await ctx.db.patch(args.moveId, {
      title: normalizeOptionalText(args.title),
      status: args.status,
      origin: normalizeOptionalText(args.origin),
      destination: normalizeOptionalText(args.destination),
      dateStart: normalizeOptionalText(args.dateStart),
      dateEnd: normalizeOptionalText(args.dateEnd),
      documentationProfileTypes: args.documentationProfileTypes
        ? normalizeDocumentationProfileTypes(args.documentationProfileTypes)
        : undefined,
      moveLevelWeightAllowanceLb: args.moveLevelWeightAllowanceLb,
      pcsBranch: args.pcsBranch,
      pcsRankPayGrade: normalizeOptionalText(args.pcsRankPayGrade),
      pcsDependentStatus: args.pcsDependentStatus,
      pcsShipmentType: args.pcsShipmentType,
      pcsOrdersNumber: normalizeOptionalText(args.pcsOrdersNumber),
      pcsAllowanceNotes: normalizeOptionalText(args.pcsAllowanceNotes),
      pcsTransportationOfficeNotes: normalizeOptionalText(
        args.pcsTransportationOfficeNotes,
      ),
      pcsRestrictedItemsNotes: normalizeOptionalText(
        args.pcsRestrictedItemsNotes,
      ),
      proGearNotes: normalizeOptionalText(args.proGearNotes),
      notes: normalizeOptionalText(args.notes),
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
      "household:manage_settings",
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
