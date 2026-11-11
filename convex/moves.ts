import { bumpOwnerRevision } from "./usageLimits";
import { retainPhotoForDeletion, eraseSessions } from "./lib/storageDeletion";
import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, internalAction, mutation, query } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import { assertHouseholdEntitlement } from "./lib/billing";
import {
  defaultDocumentationProfilesForMoveType,
  documentationProfileTypeValidator,
  moveStatusValidator,
  moveTypeValidator,
  normalizeDocumentationProfileTypes,
  normalizeOptionalText,
  normalizeStructuredLocation,
  pcsBranchValidator,
  pcsDependentStatusValidator,
  pcsShipmentTypeValidator,
  structuredLocationToDisplay,
  structuredLocationValidator,
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

// Active household-member count for a move's results summary (MOVE-310).
// Deliberately move-scoped: moveOnly viewers can see this bounded count, but
// not the underlying household member records. Counts true household membership
// — NOT movePeople (move contacts) or moveParticipants (per-move access
// records), which are separate concepts.
export const householdMemberCount = query({
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
    const memberships = await ctx.db
      .query("householdMemberships")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
      .collect();
    return memberships.filter((membership) => membership.status === "active")
      .length;
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
    startLocation: v.optional(structuredLocationValidator),
    endLocation: v.optional(structuredLocationValidator),
    distanceMiles: v.optional(v.number()),
    travelMinutes: v.optional(v.number()),
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

    const move = await ctx.db.get(args.moveId);
    if (!move || move.householdId !== args.householdId) {
      throw new Error("Move not found.");
    }

    const patch: Partial<Doc<"moves">> = { updatedAt: Date.now() };
    if (args.title !== undefined) {
      patch.title = normalizeOptionalText(args.title);
    }
    if (args.status !== undefined) patch.status = args.status;
    if (args.origin !== undefined) patch.origin = normalizeOptionalText(args.origin);
    if (args.destination !== undefined) {
      patch.destination = normalizeOptionalText(args.destination);
    }

    // Structured locations are an additive superset. The legacy origin/destination
    // strings remain the canonical values for the public MCP/REST contract, so we
    // only write a derived display string back into them when the caller did NOT
    // pass an explicit origin/destination string AND the stored value is empty —
    // never clobbering a user's hand-typed origin/destination.
    if (args.startLocation !== undefined) {
      const startLocation = normalizeStructuredLocation(args.startLocation);
      patch.startLocation = startLocation;
      if (args.origin === undefined && !move.origin) {
        const derived = structuredLocationToDisplay(startLocation);
        if (derived) {
          patch.origin = derived;
        }
      }
    }
    if (args.endLocation !== undefined) {
      const endLocation = normalizeStructuredLocation(args.endLocation);
      patch.endLocation = endLocation;
      if (args.destination === undefined && !move.destination) {
        const derived = structuredLocationToDisplay(endLocation);
        if (derived) {
          patch.destination = derived;
        }
      }
    }
    if (args.distanceMiles !== undefined) {
      patch.distanceMiles =
        Number.isFinite(args.distanceMiles) && args.distanceMiles >= 0
          ? args.distanceMiles
          : undefined;
    }
    if (args.travelMinutes !== undefined) {
      patch.travelMinutes =
        Number.isFinite(args.travelMinutes) && args.travelMinutes >= 0
          ? args.travelMinutes
          : undefined;
    }
    if (args.dateStart !== undefined) {
      patch.dateStart = normalizeOptionalText(args.dateStart);
    }
    if (args.dateEnd !== undefined) {
      patch.dateEnd = normalizeOptionalText(args.dateEnd);
    }
    if (args.documentationProfileTypes !== undefined) {
      patch.documentationProfileTypes = normalizeDocumentationProfileTypes(
        args.documentationProfileTypes,
      );
    }
    if (args.moveLevelWeightAllowanceLb !== undefined) {
      patch.moveLevelWeightAllowanceLb = args.moveLevelWeightAllowanceLb;
    }
    if (args.pcsBranch !== undefined) patch.pcsBranch = args.pcsBranch;
    if (args.pcsRankPayGrade !== undefined) {
      patch.pcsRankPayGrade = normalizeOptionalText(args.pcsRankPayGrade);
    }
    if (args.pcsDependentStatus !== undefined) {
      patch.pcsDependentStatus = args.pcsDependentStatus;
    }
    if (args.pcsShipmentType !== undefined) {
      patch.pcsShipmentType = args.pcsShipmentType;
    }
    if (args.pcsOrdersNumber !== undefined) {
      patch.pcsOrdersNumber = normalizeOptionalText(args.pcsOrdersNumber);
    }
    if (args.pcsAllowanceNotes !== undefined) {
      patch.pcsAllowanceNotes = normalizeOptionalText(args.pcsAllowanceNotes);
    }
    if (args.pcsTransportationOfficeNotes !== undefined) {
      patch.pcsTransportationOfficeNotes = normalizeOptionalText(
        args.pcsTransportationOfficeNotes,
      );
    }
    if (args.pcsRestrictedItemsNotes !== undefined) {
      patch.pcsRestrictedItemsNotes = normalizeOptionalText(
        args.pcsRestrictedItemsNotes,
      );
    }
    if (args.proGearNotes !== undefined) {
      patch.proGearNotes = normalizeOptionalText(args.proGearNotes);
    }
    if (args.notes !== undefined) patch.notes = normalizeOptionalText(args.notes);

    await ctx.db.patch(args.moveId, patch);

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

// Bring an archived move back to active planning so the reversible "remove"
// action can be undone.
export const unarchive = mutation({
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

    const move = await ctx.db.get(args.moveId);
    if (!move || move.householdId !== args.householdId) {
      throw new Error("Move not found in this household.");
    }

    await ctx.db.patch(args.moveId, {
      status: "planning",
      archivedAt: undefined,
      updatedAt: Date.now(),
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: actor.type,
      actorUserId: actor.type === "user" ? actor.userId : undefined,
      actorApiKeyId: actor.type === "apiKey" ? actor.apiKeyId : undefined,
      category: "household",
      action: "move.unarchived",
      objectTable: "moves",
      objectId: args.moveId,
    });
  },
});

// Permanently erase a move and every record that belongs to it. This is
// irreversible — the everyday "remove" path is archive(); purge is owner-only,
// requires the move title typed back exactly, and supports dryRun to preview the
// per-table counts before anything is deleted.
//
// The two lists are verified against the schema by
// tests/unit/move-purge-coverage.test.ts: every table carrying a moveId must
// appear here, so a new move-scoped table cannot silently survive a purge.

// Tables addressed by a moveId-first index (eq on moveId).
const MOVE_INDEXED_PURGE_TABLES: Array<{ table: string; index: string }> = [
  { table: "moveRoleGrants", index: "by_move_user" },
  { table: "moveParticipants", index: "by_move_user" },
  { table: "documentationProfiles", index: "by_move_status" },
  { table: "exportJobs", index: "by_move_created" },
  { table: "apiKeys", index: "by_move_status" },
  { table: "shareLinks", index: "by_move_status" },
  { table: "shareLinkComments", index: "by_move_created" },
  { table: "auditLogs", index: "by_move_time" },
  { table: "movePeople", index: "by_move_sort" },
  { table: "transportResources", index: "by_move_sort" },
  { table: "transportZones", index: "by_move_sort" },
  { table: "transportTrips", index: "by_move_sort" },
  { table: "tripSpaces", index: "by_move_sort" },
  { table: "moveSpaces", index: "by_move_sort" },
  { table: "movePlanningDefaults", index: "by_move_sort" },
  { table: "movePlanningRecords", index: "by_move_updated" },
  { table: "mcpOperations", index: "by_move" },
  { table: "aiGrantActivities", index: "by_move_created" },
  { table: "floorPlans", index: "by_move_status" },
  { table: "planLevels", index: "by_move" },
  { table: "planProposals", index: "by_move_status" },
  { table: "boxes", index: "by_move_status" },
  { table: "boxItems", index: "by_move" },
  { table: "itemPhotos", index: "by_move_created" },
  { table: "photoUploadSessions", index: "by_move_status" },
  { table: "ingestionQueueEntries", index: "by_move_status_order" },
  { table: "queueActivities", index: "by_move_created" },
  { table: "queueItems", index: "by_move_updated" },
  { table: "aiJobs", index: "by_move_status" },
  { table: "aiTextSuggestions", index: "by_move_status" },
  { table: "aiPhotoSuggestions", index: "by_move_status" },
  { table: "aiPlanningSuggestions", index: "by_move_status" },
  { table: "inventoryDuplicateDecisions", index: "by_move_status" },
  { table: "items", index: "by_move_status" },
  { table: "saleListings", index: "by_move_status" },
  { table: "plannedItems", index: "by_move_status" },
];

// Tables with a moveId but no moveId-first index: scan by household, filter.
const HOUSEHOLD_FILTER_PURGE_TABLES: Array<{ table: string; index: string }> = [
  { table: "planEntities", index: "by_household" },
  { table: "planPlacements", index: "by_household" },
  { table: "planOps", index: "by_household" },
  { table: "apiIdempotencyKeys", index: "by_household" },
  { table: "apiRateLimitWindows", index: "by_household" },
];

export const MOVE_PURGE_TABLE_NAMES: string[] = [
  ...MOVE_INDEXED_PURGE_TABLES.map((entry) => entry.table),
  ...HOUSEHOLD_FILTER_PURGE_TABLES.map((entry) => entry.table),
];

/* eslint-disable @typescript-eslint/no-explicit-any */
async function purgeMoveData(
  ctx: any,
  {
    householdId,
    moveId,
  }: { householdId: any; moveId: any },
) {
  const counts: Record<string, number> = {};
  let total = 0;

  async function deleteDocs(table: string, docs: Array<{ _id: any }>) {
    counts[table] = docs.length;
    total += docs.length;

  }

  for (const { table, index } of MOVE_INDEXED_PURGE_TABLES) {
    const docs = await ctx.db
      .query(table)
      .withIndex(index, (q: any) => q.eq("moveId", moveId))
      .collect();
    await deleteDocs(table, docs);
  }

  for (const { table, index } of HOUSEHOLD_FILTER_PURGE_TABLES) {
    const docs = (
      await ctx.db
        .query(table)
        .withIndex(index, (q: any) => q.eq("householdId", householdId))
        .collect()
    ).filter((doc: any) => doc.moveId === moveId);
    await deleteDocs(table, docs);
  }

  return { counts, total };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
// One bounded transaction per indexed table page; the removed move cannot
// accept new uploads while the authorized purge continues.
function purgeTables() {
  const photos = MOVE_INDEXED_PURGE_TABLES.find(entry => entry.table === "itemPhotos")!;
  return [...MOVE_INDEXED_PURGE_TABLES.filter(entry => entry !== photos), photos, ...HOUSEHOLD_FILTER_PURGE_TABLES];
}
export const purgePage = internalMutation({
  args: { runId: v.id("movePurges"), automatic: v.optional(v.boolean()) },
  handler: async (ctx, { runId, automatic }) => {
    if (automatic && !(await ctx.db.query("usageLimitSettings").withIndex("by_key", q => q.eq("key", "site")).unique())?.storageDeletionEnabled) return null;
    const args = await ctx.db.get(runId);
    if (!args) return null;
    // Retire sessions first, transferring active write leases to their photos.
    const tables = purgeTables();
    const entry = tables[args.table];
    if (!entry) { await ctx.db.delete(runId); return null; }
    // Dynamic table/index pairs are a closed, server-owned list above.
    const db = ctx.db as any;
    const household = args.table >= MOVE_INDEXED_PURGE_TABLES.length;
    const page = await db.query(entry.table).withIndex(entry.index, (q: any) => q.eq(household ? "householdId" : "moveId", household ? args.householdId : args.moveId)).paginate({ cursor: args.cursor, numItems: entry.table === "itemPhotos" ? 500 : 100, maximumBytesRead: 1_000_000 });
    const owner = entry.table === "itemPhotos" ? (await ctx.db.get(args.householdId))?.ownerUserId : undefined;
    const noGeneratedObjects = entry.table === "itemPhotos" && !await ctx.db.query("generatedObjects").first();
    const owners = new Set<Doc<"users">["_id"]>();
    for (const row of page.page) {
      if (household && row.moveId !== args.moveId) continue;
      if (entry.table === "itemPhotos") {
        const ownerId = row.usageOwnerId ?? owner ?? row.uploadedByUserId;
        await retainPhotoForDeletion(ctx, row, Date.now(), { ownerId, leaseSaved: true, noGeneratedObjects });
        owners.add(ownerId);
      }
      else if (entry.table !== "photoUploadSessions") await ctx.db.delete(row._id);
    }
    if (entry.table === "photoUploadSessions") await eraseSessions(ctx, page.page);
    for (const ownerId of owners) await bumpOwnerRevision(ctx, ownerId);
    if (page.isDone && entry.table === "itemPhotos") await ctx.scheduler.runAfter(0, internal.storageDeletion.sweep, {});
    const table = page.isDone ? args.table + 1 : args.table;
    if (table === tables.length) { await ctx.db.delete(runId); return null; }
    await ctx.db.patch(runId, { table, cursor: page.isDone ? null : page.continueCursor, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.moves.purgePage, { runId, automatic });
    return { runId };

  },
});

/* eslint-enable @typescript-eslint/no-explicit-any */
export const resumePurges = internalMutation({ args: {}, handler: async ctx => {
  if (!(await ctx.db.query("usageLimitSettings").withIndex("by_key", q => q.eq("key", "site")).unique())?.storageDeletionEnabled) return;
  const runs = await ctx.db.query("movePurges").withIndex("by_updated", q => q.lt("updatedAt", Date.now() - 15 * 60 * 1000)).take(30);
  for (const run of runs) { await ctx.db.patch(run._id, { updatedAt: Date.now() }); await ctx.scheduler.runAfter(0, internal.moves.purgePage, { runId: run._id, automatic: true }); }
} });
export const purge = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    confirmTitle: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { actor, role } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "household:manage_settings",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }
    if (role !== "owner") {
      throw new Error(
        "Only the household owner can permanently delete a move.",
      );
    }

    const move = await ctx.db.get(args.moveId);
    if (!move || move.householdId !== args.householdId) {
      throw new Error("Move not found in this household.");
    }

    const dryRun = args.dryRun ?? false;

    if (!dryRun && args.confirmTitle.trim() !== move.title.trim()) {
      throw new Error(
        "Type the move title exactly to confirm permanent deletion.",
      );
    }


    if (dryRun) {
      const { counts, total } = await purgeMoveData(ctx, { householdId: args.householdId, moveId: args.moveId });
      return { dryRun: true as const, moveTitle: move.title, deletedRecordCount: total, counts };
    }
    const runId = await ctx.db.insert("movePurges", { householdId: args.householdId, moveId: args.moveId, table: 0, cursor: null, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.moves.purgePage, { runId });
    await ctx.db.delete(args.moveId);

    // Household-level audit (no moveId — the move and its own logs are gone).
    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "household",
      action: "move.purged",
      objectTable: "moves",
      objectId: args.moveId,
      metadata: { title: move.title, pending: true },
    });

    return {
      dryRun: false as const,
      moveTitle: move.title,
      pending: true,
      deletedRecordCount: 0,
      counts: {},
    };
  },
});

export const pendingPurgeRuns = internalQuery({ args: { cursor: v.union(v.string(), v.null()) }, handler: async (ctx, args) => {
  const page = await ctx.db.query("movePurges").paginate({ cursor: args.cursor, numItems: 30 });
  return { ids: page.page.map(row => row._id), cursor: page.continueCursor, done: page.isDone };
} });
/* eslint-disable @typescript-eslint/no-explicit-any */
export const previewPurgePage = internalQuery({ args: { runId: v.id("movePurges"), table: v.number(), cursor: v.union(v.string(), v.null()) }, handler: async (ctx, args) => {
  const run = await ctx.db.get(args.runId); const entry = purgeTables()[args.table];
  if (!run || !entry) return { count: 0, bytes: 0, next: null };
  const household = args.table >= MOVE_INDEXED_PURGE_TABLES.length;
  const page = await (ctx.db as any).query(entry.table).withIndex(entry.index, (q: any) => q.eq(household ? "householdId" : "moveId", household ? run.householdId : run.moveId)).paginate({ cursor: args.cursor, numItems: 100, maximumBytesRead: 350_000 });
  const rows = page.page.filter((row: any) => !household || row.moveId === run.moveId);
  return { count: rows.length, bytes: rows.reduce((sum: number, row: any) => sum + new TextEncoder().encode(JSON.stringify(row)).byteLength, 0), next: page.isDone ? (args.table + 1 === purgeTables().length ? null : { table: args.table + 1, cursor: null }) : { table: args.table, cursor: page.continueCursor } };
} });
/* eslint-enable @typescript-eslint/no-explicit-any */
/** Counts/serialized row bytes only; no ids or user data leave this preview. */
export const previewPurges = internalAction({ args: {}, handler: async (ctx): Promise<{ count: number; bytes: number }> => {
  let count = 0, bytes = 0, cursor: string | null = null;
  for (;;) {
    const runs: { ids: Doc<"movePurges">["_id"][]; cursor: string; done: boolean } = await ctx.runQuery(internal.moves.pendingPurgeRuns, { cursor });
    for (const runId of runs.ids) {
      const run = await ctx.runQuery(internal.moves.purgeCheckpoint, { runId });
      if (!run) continue;
      let next: { table: number; cursor: string | null } | null = { table: run.table, cursor: run.cursor };
      while (next) { const page: { count: number; bytes: number; next: { table: number; cursor: string | null } | null } = await ctx.runQuery(internal.moves.previewPurgePage, { runId, ...next }); count += page.count; bytes += page.bytes; next = page.next; }
    }
    if (runs.done) break; cursor = runs.cursor;
  }
  return { count, bytes };
} });
export const purgeCheckpoint = internalQuery({ args: { runId: v.id("movePurges") }, handler: (ctx, args) => ctx.db.get(args.runId) });
