// OAuth MCP gateway tools (orient + capture + organize + set up). Each resolves
// the user from the gateway-injected caller.subject via the identity bridge
// (NEVER ctx.auth) and mirrors the canonical mutation's core logic. Args are
// exported as `<name>Args` and reused in convex/mcp.ts so the gateway's strict
// arg-validator check matches exactly. createdVia is "mcp" for everything an
// agent creates here.
import { ConvexError, v } from "convex/values";
import { mcpCallerValidator } from "convex-mcp-gateway";

import { internalMutation, internalQuery } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import { assertHouseholdEntitlement } from "./lib/billing";
import { assertCaptureStructuredRefs } from "./ingestionQueue";
import {
  ingestionItemKindValidator,
  ingestionQueueIntentValidator,
} from "./lib/ingestionQueue";
import {
  defaultDocumentationProfilesForMoveType,
  dimensionsValidator,
  documentationProfileTypeValidator,
  itemConditionValidator,
  itemDispositionValidator,
  itemFragilityValidator,
  moveSpaceKindValidator,
  moveTypeValidator,
  normalizeBoxCode,
  normalizeDocumentationProfileTypes,
  normalizeItemName,
  normalizeOptionalText,
  normalizedSearchName,
  pcsBranchValidator,
  pcsDependentStatusValidator,
  pcsShipmentTypeValidator,
  unitSystemValidator,
} from "./lib/moveFields";
import {
  requireHouseholdForSubject,
  requireMoveForSubject,
} from "./lib/mcpIdentity";
import { generateItemCode } from "./items";
import { insertMissingMovePlanningDefaults } from "./movePlanningDefaults";
import { insertTransportResourceFromPreset } from "./transportResources";
import { transportPresetsForMoveType } from "./lib/transportPresets";

const READ_LIMIT = 200;

// ---- get_move_overview -----------------------------------------------------
export const getMoveOverviewArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
};
export const getMoveOverview = internalQuery({
  args: getMoveOverviewArgs,
  handler: async (ctx, args) => {
    await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "household:read",
    );
    const move = await ctx.db.get(args.moveId);
    if (!move || move.householdId !== args.householdId) {
      throw new ConvexError("Move not found in this household.");
    }
    const [items, boxes, spaces] = await Promise.all([
      ctx.db
        .query("items")
        .withIndex("by_move_status", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("boxes")
        .withIndex("by_move_status", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("moveSpaces")
        .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
        .collect(),
    ]);
    const liveItems = items.filter((i) => i.deletedAt === undefined);
    return {
      moveId: move._id,
      title: move.title,
      type: move.type,
      status: move.status,
      origin: move.origin ?? null,
      destination: move.destination ?? null,
      unitSystem: move.unitSystem,
      counts: {
        items: liveItems.length,
        itemsNeedingReview: liveItems.filter((i) => i.needsReview).length,
        boxes: boxes.filter((b) => b.archivedAt === undefined).length,
        spaces: spaces.filter((s) => s.archivedAt === undefined).length,
      },
    };
  },
});

// ---- search_inventory ------------------------------------------------------
export const searchInventoryArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  query: v.optional(v.string()),
  room: v.optional(v.string()),
  category: v.optional(v.string()),
  disposition: v.optional(itemDispositionValidator),
  needsReview: v.optional(v.boolean()),
};
export const searchInventory = internalQuery({
  args: searchInventoryArgs,
  handler: async (ctx, args) => {
    await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:read",
    );
    const needle = args.query ? normalizedSearchName(args.query) : null;
    const all = await ctx.db
      .query("items")
      .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .take(1000);
    const matches = all.filter((item) => {
      if (item.deletedAt !== undefined) return false;
      if (needle && !item.normalizedName.includes(needle)) return false;
      if (args.room && item.room !== args.room) return false;
      if (args.category && item.category !== args.category) return false;
      if (args.disposition && item.disposition !== args.disposition) {
        return false;
      }
      if (args.needsReview !== undefined && item.needsReview !== args.needsReview) {
        return false;
      }
      return true;
    });
    return matches.slice(0, READ_LIMIT).map((item) => ({
      itemId: item._id,
      name: item.name,
      room: item.room ?? null,
      category: item.category ?? null,
      quantity: item.quantity,
      disposition: item.disposition,
      status: item.status,
      needsReview: item.needsReview,
    }));
  },
});

// ---- get_item --------------------------------------------------------------
export const getItemArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  itemId: v.id("items"),
};
export const getItem = internalQuery({
  args: getItemArgs,
  handler: async (ctx, args) => {
    const policy = await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:read",
    );
    const item = await ctx.db.get(args.itemId);
    if (
      !item ||
      item.householdId !== args.householdId ||
      item.moveId !== args.moveId ||
      item.deletedAt !== undefined
    ) {
      throw new ConvexError("Item not found in this move.");
    }
    const photos = await ctx.db
      .query("itemPhotos")
      .withIndex("by_item_created", (q) => q.eq("itemId", item._id))
      .take(50);
    return {
      itemId: item._id,
      name: item.name,
      description: item.description ?? null,
      room: item.room ?? null,
      destinationRoom: item.destinationRoom ?? null,
      category: item.category ?? null,
      subcategory: item.subcategory ?? null,
      quantity: item.quantity,
      condition: item.condition,
      disposition: item.disposition,
      status: item.status,
      fragility: item.fragility,
      highValue: item.highValue,
      needsReview: item.needsReview,
      // AI/research prose can restate value/serial — gate it like values so a
      // walled-off moveOnly guest (mover/helper) can't read it.
      aiSummary: policy.visibility.research ? (item.aiSummary ?? null) : undefined,
      researchSummary: policy.visibility.research
        ? (item.researchSummary ?? null)
        : undefined,
      researchNotes: policy.visibility.research
        ? (item.researchNotes ?? null)
        : undefined,
      // Sensitive fields only when the resolved role may see them.
      estimatedValueCents: policy.visibility.estimatedValue
        ? (item.valueCents ?? null)
        : undefined,
      serialNumber: policy.visibility.serialNumber
        ? (item.serialNumber ?? null)
        : undefined,
      privateNotes: policy.visibility.privateNotes
        ? (item.privateNotes ?? null)
        : undefined,
      photos: photos
        .filter((p) => p.archivedAt === undefined)
        .map((p) => ({ photoId: p._id, caption: p.caption ?? null })),
    };
  },
});

// ---- upsert_items ----------------------------------------------------------
const itemDraftValidator = v.object({
  itemId: v.optional(v.id("items")),
  name: v.string(),
  room: v.optional(v.string()),
  destinationRoom: v.optional(v.string()),
  category: v.optional(v.string()),
  subcategory: v.optional(v.string()),
  quantity: v.optional(v.number()),
  condition: v.optional(itemConditionValidator),
  disposition: v.optional(itemDispositionValidator),
  description: v.optional(v.string()),
  highValue: v.optional(v.boolean()),
  fragility: v.optional(itemFragilityValidator),
  needsReview: v.optional(v.boolean()),
});
export const upsertItemsArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  items: v.array(itemDraftValidator),
  dryRun: v.optional(v.boolean()),
};
export const upsertItems = internalMutation({
  args: upsertItemsArgs,
  handler: async (ctx, args) => {
    const policy = await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const userId = policy.actor.userId;
    const now = Date.now();
    const dryRun = args.dryRun ?? false;
    const results: Array<{ itemId: string; action: "created" | "updated" }> =
      [];

    for (const draft of args.items) {
      if (draft.itemId) {
        const existing = await ctx.db.get(draft.itemId);
        if (
          !existing ||
          existing.householdId !== args.householdId ||
          existing.moveId !== args.moveId ||
          existing.deletedAt !== undefined
        ) {
          throw new ConvexError(`Item ${draft.itemId} not found in this move.`);
        }
        if (!dryRun) {
          const name = normalizeItemName(draft.name);
          await ctx.db.patch(draft.itemId, {
            name,
            normalizedName: normalizedSearchName(name),
            room: draft.room ?? existing.room,
            destinationRoom: draft.destinationRoom ?? existing.destinationRoom,
            category: draft.category ?? existing.category,
            subcategory: draft.subcategory ?? existing.subcategory,
            quantity: draft.quantity ?? existing.quantity,
            condition: draft.condition ?? existing.condition,
            disposition: draft.disposition ?? existing.disposition,
            description:
              draft.description !== undefined
                ? normalizeOptionalText(draft.description)
                : existing.description,
            highValue: draft.highValue ?? existing.highValue,
            fragility: draft.fragility ?? existing.fragility,
            needsReview: draft.needsReview ?? existing.needsReview,
            updatedByUserId: userId,
            updatedAt: now,
          });
        }
        results.push({ itemId: String(draft.itemId), action: "updated" });
      } else {
        const name = normalizeItemName(draft.name);
        let itemId = "(dry-run)";
        if (!dryRun) {
          const code = await generateItemCode(ctx, args.moveId);
          itemId = String(
            await ctx.db.insert("items", {
              householdId: args.householdId,
              moveId: args.moveId,
              name,
              normalizedName: normalizedSearchName(name),
              code,
              description: normalizeOptionalText(draft.description),
              room: draft.room,
              destinationRoom: draft.destinationRoom,
              category: draft.category,
              subcategory: draft.subcategory,
              disposition: draft.disposition ?? "undecided",
              status: "active",
              quantity: draft.quantity ?? 1,
              condition: draft.condition ?? "unknown",
              weightConfidence: "none",
              volumeConfidence: "none",
              fragility: draft.fragility ?? "low",
              stackable: true,
              hazardousFlag: false,
              highValue: draft.highValue ?? false,
              requiresPersonalTransport: false,
              planningDefaultKeys: [],
              needsReview: draft.needsReview ?? false,
              reviewFlags: [],
              aiTags: [],
              createdVia: "mcp",
              createdByUserId: userId,
              updatedByUserId: userId,
              createdAt: now,
              updatedAt: now,
            }),
          );
        }
        results.push({ itemId, action: "created" });
      }
    }

    if (!dryRun) {
      await recordAuditEvent(ctx, {
        householdId: args.householdId,
        moveId: args.moveId,
        actorType: "agent",
        actorUserId: userId,
        category: "inventory",
        action: "mcp.items_upserted",
        objectTable: "items",
        metadata: { count: results.length },
      });
    }
    return { dryRun, results };
  },
});

// ---- upsert_spaces ---------------------------------------------------------
const spaceDraftValidator = v.object({
  spaceId: v.optional(v.id("moveSpaces")),
  name: v.string(),
  kind: v.optional(moveSpaceKindValidator),
  floorLevel: v.optional(v.string()),
  notes: v.optional(v.string()),
  // Soft-delete the space (sets status "archived"). Requires spaceId. Mirrors
  // the per-zone `archive` flag on upsert_transport — keeps the tool surface
  // lean instead of adding a separate archive_space tool.
  archive: v.optional(v.boolean()),
});

// moveSpaceKind includes "transportResource"/"transportZone" because the floor-
// plan layer mirrors transports as placeable spaces — but those rows live in a
// DIFFERENT table (transportResources/transportZones) and NEVER show up in
// list_transport. An agent reaching for upsert_spaces to "make a transport"
// would silently create an orphan ghost room, so reject those kinds here and
// point at the real tool. (See MOVE-318.)
const transportLikeSpaceKinds = new Set(["transportResource", "transportZone"]);
export const upsertSpacesArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  spaces: v.array(spaceDraftValidator),
};
export const upsertSpaces = internalMutation({
  args: upsertSpacesArgs,
  handler: async (ctx, args) => {
    const policy = await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const userId = policy.actor.userId;
    const now = Date.now();
    const results: Array<{
      spaceId: string;
      action: "created" | "updated" | "archived";
    }> = [];

    for (const draft of args.spaces) {
      // Footgun guard: a transport is NOT a space (different table, never in
      // list_transport). Redirect instead of silently creating a ghost room.
      if (draft.kind && transportLikeSpaceKinds.has(draft.kind)) {
        throw new ConvexError(
          `"${draft.kind}" is not a room kind — transports live in a separate system. Use upsert_transport (it has a militaryMovers type, trucks, trailers, PODs, storage, movers) so it shows up in list_transport. A space with that kind would be invisible to every transport tool.`,
        );
      }

      // Archive path — mirrors upsert_transport's zone `archive` flag.
      if (draft.archive) {
        if (!draft.spaceId) {
          throw new ConvexError(
            "To archive a space, pass its spaceId together with archive: true.",
          );
        }
        const existing = await ctx.db.get(draft.spaceId);
        if (
          !existing ||
          existing.householdId !== args.householdId ||
          existing.moveId !== args.moveId
        ) {
          throw new ConvexError(`Space ${draft.spaceId} not found in this move.`);
        }
        await ctx.db.patch(draft.spaceId, {
          status: "archived",
          updatedByUserId: userId,
          updatedAt: now,
        });
        results.push({ spaceId: String(draft.spaceId), action: "archived" });
        continue;
      }

      if (draft.spaceId) {
        const existing = await ctx.db.get(draft.spaceId);
        if (
          !existing ||
          existing.householdId !== args.householdId ||
          existing.moveId !== args.moveId
        ) {
          throw new ConvexError(`Space ${draft.spaceId} not found in this move.`);
        }
        await ctx.db.patch(draft.spaceId, {
          name: draft.name.trim() || existing.name,
          kind: draft.kind ?? existing.kind,
          floorLevel:
            draft.floorLevel !== undefined
              ? normalizeOptionalText(draft.floorLevel)
              : existing.floorLevel,
          notes:
            draft.notes !== undefined
              ? normalizeOptionalText(draft.notes)
              : existing.notes,
          // Explicit upsert un-archives a previously archived room, mirroring
          // the un-archive-on-edit behavior of transport zones.
          status: existing.status === "archived" ? "active" : existing.status,
          updatedByUserId: userId,
          updatedAt: now,
        });
        results.push({ spaceId: String(draft.spaceId), action: "updated" });
      } else {
        const spaceId = await ctx.db.insert("moveSpaces", {
          householdId: args.householdId,
          moveId: args.moveId,
          kind: draft.kind ?? "originRoom",
          name: draft.name.trim(),
          aliases: [],
          notes: normalizeOptionalText(draft.notes),
          floorLevel: normalizeOptionalText(draft.floorLevel),
          sortOrder: now,
          status: "active",
          capacity: {},
          createdByUserId: userId,
          updatedByUserId: userId,
          createdAt: now,
          updatedAt: now,
        });
        results.push({ spaceId: String(spaceId), action: "created" });
      }
    }

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "agent",
      actorUserId: userId,
      category: "inventory",
      action: "mcp.spaces_upserted",
      objectTable: "moveSpaces",
      metadata: { count: results.length },
    });
    return { results };
  },
});

// ---- capture_to_queue ------------------------------------------------------
const queueDraftValidator = v.object({
  instructions: v.optional(v.string()),
  roomHint: v.optional(v.string()),
  intent: v.optional(ingestionQueueIntentValidator),
  // Aim the capture at a room (space) or a transport so the agent knows where
  // its photos/work belong. Both must already exist in this move.
  targetSpaceId: v.optional(v.id("moveSpaces")),
  targetTransportId: v.optional(v.id("transportResources")),
  mediaPhotoIds: v.optional(v.array(v.id("itemPhotos"))),
  // Structured capture hints (agent gap #4) — pre-declare what the capture is so
  // the processing run applies them directly. DESTINATION room/transport reuse
  // targetSpaceId / targetTransportId above.
  itemKind: v.optional(ingestionItemKindValidator),
  estimatedWeightLb: v.optional(v.number()),
  dimensionsIn: v.optional(dimensionsValidator),
  disposition: v.optional(itemDispositionValidator),
  startingSpaceId: v.optional(v.id("moveSpaces")),
  presentSpaceId: v.optional(v.id("moveSpaces")),
  presentTransportId: v.optional(v.id("transportResources")),
});
export const captureToQueueArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  entries: v.array(queueDraftValidator),
};
export const captureToQueue = internalMutation({
  args: captureToQueueArgs,
  handler: async (ctx, args) => {
    const policy = await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const userId = policy.actor.userId;
    const now = Date.now();
    const entryIds: string[] = [];

    for (const draft of args.entries) {
      // Confirm any referenced photos belong to this move (no cross-tenant refs).
      const mediaPhotoIds = draft.mediaPhotoIds ?? [];
      for (const photoId of mediaPhotoIds) {
        const photo = await ctx.db.get(photoId);
        if (!photo || photo.moveId !== args.moveId) {
          throw new ConvexError(`Photo ${photoId} is not part of this move.`);
        }
      }
      // Confirm any room/transport target belongs to this move.
      if (draft.targetSpaceId) {
        const space = await ctx.db.get(draft.targetSpaceId);
        if (!space || space.moveId !== args.moveId) {
          throw new ConvexError("Target room is not part of this move.");
        }
      }
      if (draft.targetTransportId) {
        const transport = await ctx.db.get(draft.targetTransportId);
        if (!transport || transport.moveId !== args.moveId) {
          throw new ConvexError("Target transport is not part of this move.");
        }
      }
      // Validate the structured starting/present refs belong to this move too.
      await assertCaptureStructuredRefs(ctx, args.moveId, draft);
      const entryId = await ctx.db.insert("ingestionQueueEntries", {
        householdId: args.householdId,
        moveId: args.moveId,
        status: "queued",
        instructions: normalizeOptionalText(draft.instructions),
        roomHint: normalizeOptionalText(draft.roomHint),
        intent: draft.intent,
        targetSpaceId: draft.targetSpaceId,
        targetTransportId: draft.targetTransportId,
        itemKind: draft.itemKind,
        estimatedWeightLb: draft.estimatedWeightLb,
        dimensionsIn: draft.dimensionsIn,
        disposition: draft.disposition,
        startingSpaceId: draft.startingSpaceId,
        presentSpaceId: draft.presentSpaceId,
        presentTransportId: draft.presentTransportId,
        mediaPhotoIds,
        sortOrder: now,
        // The capture belongs to this user's personal queue.
        ownerUserId: userId,
        createdByUserId: userId,
        createdAt: now,
        updatedAt: now,
      });
      entryIds.push(String(entryId));
    }

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      // An agent captured this on the user's behalf.
      actorType: "agent",
      actorUserId: userId,
      category: "inventory",
      action: "mcp.captured_to_queue",
      objectTable: "ingestionQueueEntries",
      metadata: { count: entryIds.length },
    });
    return { entryIds };
  },
});

// ---- setup_move ------------------------------------------------------------
export const setupMoveArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  title: v.string(),
  type: moveTypeValidator,
  origin: v.optional(v.string()),
  destination: v.optional(v.string()),
  unitSystem: v.optional(unitSystemValidator),
  documentationProfileTypes: v.optional(
    v.array(documentationProfileTypeValidator),
  ),
  pcsBranch: v.optional(pcsBranchValidator),
  pcsDependentStatus: v.optional(pcsDependentStatusValidator),
  pcsShipmentType: v.optional(pcsShipmentTypeValidator),
};
export const setupMove = internalMutation({
  args: setupMoveArgs,
  handler: async (ctx, args) => {
    const policy = await requireHouseholdForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      "household:edit",
    );
    const userId = policy.actor.userId;

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
      unitSystem: args.unitSystem ?? "imperial",
      documentationProfileTypes,
      pcsBranch: args.type === "pcs" ? args.pcsBranch : undefined,
      pcsDependentStatus:
        args.type === "pcs" ? args.pcsDependentStatus : undefined,
      pcsShipmentType: args.type === "pcs" ? args.pcsShipmentType : undefined,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });

    await insertMissingMovePlanningDefaults(ctx, {
      householdId: args.householdId,
      moveId,
    });
    const templatePresets = transportPresetsForMoveType(args.type);
    for (const [index, presetKey] of templatePresets.entries()) {
      await insertTransportResourceFromPreset(ctx, {
        householdId: args.householdId,
        moveId,
        presetKey,
        userId,
        sortOrder: now + index,
      });
    }

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId,
      actorType: "agent",
      actorUserId: userId,
      category: "household",
      action: "move.created",
      objectTable: "moves",
      objectId: moveId,
      metadata: { title: args.title.trim(), type: args.type, via: "mcp" },
    });
    return { moveId: String(moveId) };
  },
});

// ---- pack_boxes ------------------------------------------------------------
// Create boxes and/or pack items into them in one batch. Mirrors boxes.create
// (code uniqueness, status "open") and boxes.addItem (boxItems insert/patch).
const boxDraftValidator = v.object({
  boxId: v.optional(v.id("boxes")),
  code: v.optional(v.string()),
  label: v.optional(v.string()),
  room: v.optional(v.string()),
  destinationRoom: v.optional(v.string()),
  items: v.optional(
    v.array(
      v.object({
        itemId: v.id("items"),
        quantity: v.optional(v.number()),
        notes: v.optional(v.string()),
      }),
    ),
  ),
});
export const packBoxesArgs = {
  caller: mcpCallerValidator,
  householdId: v.id("households"),
  moveId: v.id("moves"),
  boxes: v.array(boxDraftValidator),
};
export const packBoxes = internalMutation({
  args: packBoxesArgs,
  handler: async (ctx, args) => {
    const policy = await requireMoveForSubject(
      ctx,
      args.caller.subject,
      args.householdId,
      args.moveId,
      "inventory:pack",
    );
    const userId = policy.actor.userId;
    const now = Date.now();
    const results: Array<{ boxId: string; code: string; itemsAdded: number }> =
      [];

    for (const draft of args.boxes) {
      let boxId = draft.boxId ?? null;
      let code: string;

      if (boxId) {
        const box = await ctx.db.get(boxId);
        if (!box || box.moveId !== args.moveId || box.archivedAt) {
          throw new ConvexError(`Box ${boxId} not found in this move.`);
        }
        code = box.code;
      } else {
        const rawCode = draft.code ? normalizeBoxCode(draft.code) : "";
        if (!rawCode) {
          throw new ConvexError("A code is required to create a new box.");
        }
        const clash = await ctx.db
          .query("boxes")
          .withIndex("by_move_code", (q) =>
            q.eq("moveId", args.moveId).eq("code", rawCode),
          )
          .first();
        if (clash) {
          throw new ConvexError(`Box code "${rawCode}" already exists in this move.`);
        }
        code = rawCode;
        boxId = await ctx.db.insert("boxes", {
          householdId: args.householdId,
          moveId: args.moveId,
          code,
          label: normalizeOptionalText(draft.label),
          room: normalizeOptionalText(draft.room),
          destinationRoom: normalizeOptionalText(draft.destinationRoom),
          status: "open",
          createdByUserId: userId,
          createdAt: now,
          updatedAt: now,
        });
      }

      let itemsAdded = 0;
      for (const entry of draft.items ?? []) {
        const item = await ctx.db.get(entry.itemId);
        if (!item || item.moveId !== args.moveId || item.deletedAt) {
          throw new ConvexError(`Item ${entry.itemId} not found in this move.`);
        }
        const quantity =
          entry.quantity && entry.quantity > 0 ? entry.quantity : 1;
        const existing = (
          await ctx.db
            .query("boxItems")
            .withIndex("by_item", (q) => q.eq("itemId", entry.itemId))
            .collect()
        ).find((m) => m.moveId === args.moveId);
        if (existing) {
          await ctx.db.patch(existing._id, {
            boxId,
            quantity,
            notes: normalizeOptionalText(entry.notes),
            updatedAt: now,
          });
        } else {
          await ctx.db.insert("boxItems", {
            householdId: args.householdId,
            moveId: args.moveId,
            boxId,
            itemId: entry.itemId,
            quantity,
            notes: normalizeOptionalText(entry.notes),
            createdAt: now,
            updatedAt: now,
          });
        }
        // Mirror boxes.addItem: an active item becomes "packed" once boxed.
        await ctx.db.patch(entry.itemId, {
          status: item.status === "active" ? "packed" : item.status,
          updatedByUserId: userId,
          updatedAt: now,
        });
        itemsAdded += 1;
      }

      // Mirror boxes.addItem: packing items moves the box into "packing".
      if (itemsAdded > 0) {
        await ctx.db.patch(boxId, {
          status: "packing",
          updatedAt: now,
        });
      }

      results.push({ boxId: String(boxId), code, itemsAdded });
    }

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "agent",
      actorUserId: userId,
      category: "inventory",
      action: "mcp.boxes_packed",
      objectTable: "boxes",
      metadata: { count: results.length },
    });
    return { results };
  },
});
