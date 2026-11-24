import { summaryFor } from "../usageLimits";
import type {
  Doc,
  Id,
} from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { roomReceiptBatch } from "../lib/roomHistory";
import type { authenticateApiKey } from "../lib/apiKeyAuth";
import {
  buildMoveDayChecklist,
  parseMoveDayFilter,
} from "../lib/moveDayChecklist";
import { assertHouseholdEntitlement } from "../lib/billing";
import { summarizeMoveQuestionsFromDocs } from "../lib/moveQuestionDocuments";
import {
  defaultDocumentationProfilesForMoveType,
  normalizeOptionalText,
  normalizeRuleList,
  normalizeSortOrder,
} from "../lib/moveFields";
import { getTransportResourcePreset } from "../lib/transportPresets";
import { insertMissingMovePlanningDefaults } from "../movePlanningDefaults";
import {
  bodyRecord as bodyObject,
  paginate,
  restError,
  restOk,
  type RestRequestInput,
} from "../lib/rest/core";
import { safeDocumentationProfile } from "./documentationProfiles";
import {
  maxBatchUpsertItems,
  routeBatchUpsertItems,
} from "./items";
import { requireApiMove } from "../lib/rest/require";
import {
  safeMove,
  safeItem,
  safeBox,
  safeMovePerson,
  safeTransportResource,
  safeTransportZone,
  safeMoveSpace,
  safeSaleListing,
  safeAssignment,
  safePlanningSuggestion,
  safePhoto,
  safeExportJob,
  safeApiShareLink,
} from "../lib/rest/safe";
import {
  setupMoveStatus,
  movePatch,
  setupMovePatch,
  transportResourcePatch,
  transportZonePatch,
} from "../lib/rest/patch";
import {
  findApiTransportResourceByName,
  findApiTransportZoneByName,
} from "./transport";
import { auditApiWrite } from "../lib/rest/audit";
import {
  optionalNumber,
  createMoveWeightAllowanceLb,
  asString,
  optionalString,
  requiredBodyString,
  parseMoveType,
  parseUnitSystem,
  parsePcsBranch,
  parsePcsDependentStatus,
  parsePcsShipmentType,
  parseMoveSpaceKind,
  parseDocumentationProfileTypes,
  parseTransportResourceType,
  parseTransportResourcePresetKey,
  parseCapacityReviewStatus,
  parseCapacity,
  parseStringArray,
} from "../lib/rest/parse";

export async function routeListMoves(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
) {
  const moves = await ctx.db
    .query("moves")
    .withIndex("by_household_status", (q) =>
      q.eq("householdId", auth.householdId)
    )
    .collect();
  return restOk(
    paginate(
      moves
        .filter((move) => move.status !== "archived" && (auth.allowedMoveIds === undefined || auth.allowedMoveIds.includes(move._id)))
        .map((move) => safeMove(move)),
      args.query
    )
  );
}

export async function routeUpdateMove(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
) {
  const patch = movePatch(args.body);
  await ctx.db.patch(moveId, patch);
  await auditApiWrite(ctx, auth, moveId, "move.api_updated", "moves", moveId, {
    changedKeys: Object.keys(patch),
  });
  return restOk({ data: { moveId, ...patch } });
}

export async function routeMoveSummary(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  move: Doc<"moves">
) {
  const [
    resources,
    zones,
    people,
    items,
    boxes,
    assignments,
    photos,
    planningSuggestions,
    documentationProfiles,
    exportJobs,
    shareLinks,
  ] = await Promise.all([
    ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("movePeople")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("items")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .order("desc")
      .collect(),
    ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .order("desc")
      .collect(),
    ctx.db
      .query("boxItems")
      .withIndex("by_move", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("itemPhotos")
      .withIndex("by_move_created", (q) => q.eq("moveId", move._id))
      .order("desc")
      .collect(),
    ctx.db
      .query("aiPlanningSuggestions")
      .withIndex("by_move_created", (q) => q.eq("moveId", move._id))
      .order("desc")
      .take(120),
    ctx.db
      .query("documentationProfiles")
      .withIndex("by_move_status", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("exportJobs")
      .withIndex("by_move_created", (q) => q.eq("moveId", move._id))
      .order("desc")
      .collect(),
    ctx.db
      .query("shareLinks")
      .withIndex("by_move_status", (q) => q.eq("moveId", move._id))
      .collect(),
  ]);

  const activeResources = resources.filter(
    (resource) => resource.householdId === auth.householdId && !resource.archivedAt
  );
  const activeZones = zones.filter(
    (zone) => zone.householdId === auth.householdId && !zone.archivedAt
  );
  const activePeople = people.filter(
    (person) => person.householdId === auth.householdId && !person.archivedAt
  );
  const activeItems = items.filter(
    (item) => item.householdId === auth.householdId && !item.deletedAt
  );
  const activeBoxes = boxes.filter(
    (box) => box.householdId === auth.householdId && !box.archivedAt
  );
  const visiblePhotos = photos.filter(
    (photo) => photo.householdId === auth.householdId && !photo.archivedAt
  );
  const activeDocumentationProfiles = documentationProfiles.filter(
    (profile) =>
      profile.householdId === auth.householdId && profile.status !== "archived"
  );
  const visiblePlanningSuggestions = planningSuggestions.filter(
    (suggestion) => suggestion.householdId === auth.householdId
  );
  const visibleExportJobs = exportJobs.filter(
    (job) => job.householdId === auth.householdId
  );
  const visibleShareLinks = shareLinks.filter(
    (link) => link.householdId === auth.householdId
  );
  const visibleAssignments = assignments.filter(
    (assignment) => assignment.householdId === auth.householdId
  );

  return restOk({
    data: {
      move: safeMove(move),
      resources: activeResources.map((resource) => safeTransportResource(resource)),
      zones: activeZones.map((zone) => safeTransportZone(zone)),
      people: activePeople.map((person) => safeMovePerson(person)),
      items: activeItems.map((item) => safeItem(item, auth.visibility)),
      boxes: activeBoxes.map((box) => safeBox(box)),
      assignments: visibleAssignments.map((assignment) =>
        safeAssignment(assignment)
      ),
      photos: visiblePhotos.map((photo) => safePhoto(photo)),
      planningSuggestions: visiblePlanningSuggestions.map((suggestion) =>
        safePlanningSuggestion(suggestion)
      ),
      documentationProfiles: activeDocumentationProfiles.map((profile) =>
        safeDocumentationProfile(profile)
      ),
      exports: visibleExportJobs.map((job) => safeExportJob(job)),
      shareLinks: visibleShareLinks.map((link) => safeApiShareLink(link)),
      counts: {
        resources: activeResources.length,
        zones: activeZones.length,
        people: activePeople.length,
        items: activeItems.length,
        boxes: activeBoxes.length,
        assignments: visibleAssignments.length,
        photos: visiblePhotos.length,
        planningSuggestions: visiblePlanningSuggestions.length,
        documentationProfiles: activeDocumentationProfiles.length,
        exports: visibleExportJobs.length,
        shareLinks: visibleShareLinks.length,
      },
      generatedAt: Date.now(),
    },
  });
}

export async function routeMoveQuestions(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  move: Doc<"moves">
) {
  const [items, boxes, memberships, photos, resources, zones] = await Promise.all([
    ctx.db
      .query("items")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("boxItems")
      .withIndex("by_move", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("itemPhotos")
      .withIndex("by_move_created", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
  ]);

  const summary = summarizeMoveQuestionsFromDocs({
    householdId: auth.householdId,
    move,
    items,
    boxes,
    memberships,
    photos,
    resources,
    zones,
  });

  return restOk({
    data: {
      move: {
        moveId: move._id,
        title: move.title,
        type: move.type,
      },
      ...summary,
      generatedAt: Date.now(),
    },
  });
}

export async function routeMoveDayChecklist(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  move: Doc<"moves">
) {
  const [items, boxes, memberships, resources, zones] = await Promise.all([
    ctx.db
      .query("items")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .order("desc")
      .collect(),
    ctx.db
      .query("boxItems")
      .withIndex("by_move", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
  ]);

  const summary = buildMoveDayChecklist({
    householdId: auth.householdId,
    move,
    items,
    boxes,
    memberships,
    resources,
    zones,
    filter: parseMoveDayFilter(args.query.filter) ?? "all",
    search: args.query.query ?? args.query.search,
  });
  const page = paginate(summary.checklist, args.query);

  return restOk({
    data: {
      ...summary,
      checklist: page.data,
      page: page.page,
    },
  });
}

export async function routeCreateMove(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>
) {
  if (auth.moveRestricted) {
    return restError({
      status: 403,
      code: "move_restricted_key",
      message: "Move-restricted API keys cannot create new moves.",
    });
  }
  const body = bodyObject(args.body);
  const title = normalizeOptionalText(asString(body.title));
  if (!title) {
    return restError({
      status: 400,
      code: "invalid_move",
      message: "title is required.",
    });
  }
  const type = parseMoveType(body.type) ?? "other";
  await assertHouseholdEntitlement(ctx, {
    householdId: auth.householdId,
    dimension: "activeMoves",
  });

  const now = Date.now();
  const documentationProfileTypes = Array.isArray(body.documentationProfileTypes)
    ? parseDocumentationProfileTypes(body.documentationProfileTypes)
    : [...defaultDocumentationProfilesForMoveType(type)];
  const moveId = await ctx.db.insert("moves", {
    householdId: auth.householdId,
    title,
    type,
    status: "planning",
    origin: normalizeOptionalText(asString(body.origin)),
    destination: normalizeOptionalText(asString(body.destination)),
    dateStart: normalizeOptionalText(asString(body.dateStart)),
    dateEnd: normalizeOptionalText(asString(body.dateEnd)),
    unitSystem: parseUnitSystem(body.unitSystem) ?? "imperial",
    documentationProfileTypes,
    moveLevelWeightAllowanceLb: createMoveWeightAllowanceLb(
      body.moveLevelWeightAllowanceLb,
    ),
    pcsBranch: parsePcsBranch(body.pcsBranch),
    pcsRankPayGrade: normalizeOptionalText(asString(body.pcsRankPayGrade)),
    pcsDependentStatus: parsePcsDependentStatus(body.pcsDependentStatus),
    pcsShipmentType: parsePcsShipmentType(body.pcsShipmentType),
    pcsOrdersNumber: normalizeOptionalText(asString(body.pcsOrdersNumber)),
    pcsAllowanceNotes: normalizeOptionalText(asString(body.pcsAllowanceNotes)),
    pcsTransportationOfficeNotes: normalizeOptionalText(
      asString(body.pcsTransportationOfficeNotes)
    ),
    pcsRestrictedItemsNotes: normalizeOptionalText(
      asString(body.pcsRestrictedItemsNotes)
    ),
    proGearNotes: normalizeOptionalText(asString(body.proGearNotes)),
    notes: normalizeOptionalText(asString(body.notes)),
    createdByUserId: auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });
  const planningDefaultIds = await insertMissingMovePlanningDefaults(ctx, {
    householdId: auth.householdId,
    moveId,
  });

  await auditApiWrite(ctx, auth, moveId, "move.api_created", "moves", moveId, {
    title,
    type,
    documentationProfileTypes,
    planningDefaultCount: planningDefaultIds.length,
  });
  const created = await ctx.db.get(moveId);
  return restOk(
    {
      data: {
        move: created ? safeMove(created) : { moveId },
        planningDefaultCount: planningDefaultIds.length,
      },
    },
    201
  );
}

export async function routeSetupMove(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>
) {
  const body = bodyObject(args.body);
  const dryRun = Boolean(body.dryRun);
  const updateExisting = body.updateExisting !== false;
  const requestedMoveId = optionalString(body.moveId);
  const normalizedRequestedMoveId = requestedMoveId
    ? ctx.db.normalizeId("moves", requestedMoveId)
    : null;
  if (requestedMoveId && !normalizedRequestedMoveId) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Move not found.",
    });
  }
  const title = normalizeOptionalText(asString(body.title));
  const existingMove = normalizedRequestedMoveId
    ? await requireApiMove(ctx, auth.householdId, normalizedRequestedMoveId)
    : title && updateExisting
      ? await findApiMoveByTitle(ctx, auth.householdId, title)
      : null;

  if (!existingMove && !title) {
    return restError({
      status: 400,
      code: "invalid_move_setup",
      message: "title is required when setup is creating a move.",
    });
  }

  const roomSetupNote = setupRoomsNote(body);
  const baseNotes = normalizeOptionalText(asString(body.notes));
  const notes =
    roomSetupNote && baseNotes
      ? `${baseNotes}\n\n${roomSetupNote}`
      : (baseNotes ?? roomSetupNote);

  if (dryRun) {
    return restOk({
      data: {
        dryRun: true,
        action: existingMove ? "update" : "create",
        matchedMoveId: existingMove?._id,
        title,
        spaceCount: setupSpaceInputs(body).length,
        transportResourceCount: setupTransportInputs(body).length,
        itemCount: setupItemInputs(body).length,
        notes,
      },
    });
  }

  const now = Date.now();
  let moveId: Id<"moves">;
  let moveAction: "create" | "update";
  if (existingMove) {
    moveId = existingMove._id;
    moveAction = "update";
    const patch = setupMovePatch(body, notes);
    if (Object.keys(patch).length > 1) {
      await ctx.db.patch(moveId, patch);
      await auditApiWrite(ctx, auth, moveId, "move.api_setup_updated", "moves", moveId, {
        changedKeys: Object.keys(patch),
      });
    }
  } else {
    moveAction = "create";
    const type = parseMoveType(body.type) ?? "other";
    await assertHouseholdEntitlement(ctx, {
      householdId: auth.householdId,
      dimension: "activeMoves",
    });
    const documentationProfileTypes = Array.isArray(body.documentationProfileTypes)
      ? parseDocumentationProfileTypes(body.documentationProfileTypes)
      : [...defaultDocumentationProfilesForMoveType(type)];
    moveId = await ctx.db.insert("moves", {
      householdId: auth.householdId,
      title: title!,
      type,
      status: setupMoveStatus(body.status),
      origin: normalizeOptionalText(asString(body.origin)),
      destination: normalizeOptionalText(asString(body.destination)),
      dateStart: normalizeOptionalText(asString(body.dateStart)),
      dateEnd: normalizeOptionalText(asString(body.dateEnd)),
      unitSystem: parseUnitSystem(body.unitSystem) ?? "imperial",
      documentationProfileTypes,
      moveLevelWeightAllowanceLb: createMoveWeightAllowanceLb(
        body.moveLevelWeightAllowanceLb,
      ),
      pcsBranch: parsePcsBranch(body.pcsBranch),
      pcsRankPayGrade: normalizeOptionalText(asString(body.pcsRankPayGrade)),
      pcsDependentStatus: parsePcsDependentStatus(body.pcsDependentStatus),
      pcsShipmentType: parsePcsShipmentType(body.pcsShipmentType),
      pcsOrdersNumber: normalizeOptionalText(asString(body.pcsOrdersNumber)),
      pcsAllowanceNotes: normalizeOptionalText(asString(body.pcsAllowanceNotes)),
      pcsTransportationOfficeNotes: normalizeOptionalText(
        asString(body.pcsTransportationOfficeNotes),
      ),
      pcsRestrictedItemsNotes: normalizeOptionalText(
        asString(body.pcsRestrictedItemsNotes),
      ),
      proGearNotes: normalizeOptionalText(asString(body.proGearNotes)),
      notes,
      createdByUserId: auth.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
    const planningDefaultIds = await insertMissingMovePlanningDefaults(ctx, {
      householdId: auth.householdId,
      moveId,
    });
    await auditApiWrite(ctx, auth, moveId, "move.api_setup_created", "moves", moveId, {
      title,
      type,
      planningDefaultCount: planningDefaultIds.length,
    });
  }

  const spaceResults = [];
  const roomHistory = roomReceiptBatch(ctx, { lane: "rest", userId: auth.createdByUserId, keyId: auth.apiKeyId });
  for (const [index, input] of setupSpaceInputs(body).entries()) {
    spaceResults.push(await upsertApiMoveSpaceForSetup(ctx, auth, moveId, input, index, roomHistory));
  }
  await roomHistory.record();

  const resourceResults = [];
  for (const [index, input] of setupTransportInputs(body).entries()) {
    resourceResults.push(
      await upsertApiTransportResourceForSetup(ctx, auth, moveId, input, index),
    );
  }

  let itemBatchResult: unknown = {
    dryRun: false,
    total: 0,
    succeeded: 0,
    failed: 0,
    results: [],
  };
  const items = setupItemInputs(body);
  if (items.length) {
    const batchResponse = await routeBatchUpsertItems(
      ctx,
      {
        ...args,
        method: "POST",
        path: `/moves/${moveId}/items/batch-upsert`,
        body: { items },
      },
      auth,
      moveId,
    );
    if (batchResponse.status >= 400) {
      throw new Error("Item setup failed.");
    }
    itemBatchResult =
      typeof batchResponse.body === "object" &&
      batchResponse.body &&
      "data" in batchResponse.body
        ? (batchResponse.body as { data?: unknown }).data
        : itemBatchResult;
  }

  const [move, resources, zones] = await Promise.all([
    ctx.db.get(moveId),
    ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect(),
    ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect(),
  ]);

  return restOk(
    {
      data: {
        action: moveAction,
        move: move ? safeMove(move) : { moveId },
        resources: resources
          .filter((resource) => resource.householdId === auth.householdId)
          .filter((resource) => !resource.archivedAt)
          .map((resource) => safeTransportResource(resource)),
        zones: zones
          .filter((zone) => zone.householdId === auth.householdId)
          .filter((zone) => !zone.archivedAt)
          .map((zone) => safeTransportZone(zone)),
        setupResults: {
          spaces: spaceResults,
          resources: resourceResults,
          items: itemBatchResult,
        },
      },
    },
    moveAction === "create" ? 201 : 200,
  );
}

export async function routeAgentContext(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  move: Doc<"moves">
) {
  const [
    items,
    photos,
    spaces,
    resources,
    zones,
    saleListings,
    plans,
  ] = await Promise.all([
    ctx.db
      .query("items")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("itemPhotos")
      .withIndex("by_move_created", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("moveSpaces")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("saleListings")
      .withIndex("by_move_updated", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("floorPlans")
      .withIndex("by_move_status", (q) => q.eq("moveId", move._id))
      .collect(),
  ]);

  const activeItems = items.filter(
    (item) => item.householdId === auth.householdId && !item.deletedAt,
  );
  const activePhotos = photos.filter(
    (photo) => photo.householdId === auth.householdId && !photo.archivedAt,
  );
  const photosByItemId = new Map<string, number>();
  for (const photo of activePhotos) {
    if (!photo.itemId) continue;
    photosByItemId.set(
      String(photo.itemId),
      (photosByItemId.get(String(photo.itemId)) ?? 0) + 1,
    );
  }
  const listingByItemId = new Map(
    saleListings
      .filter((listing) => listing.householdId === auth.householdId)
      .filter((listing) => !listing.archivedAt)
      .map((listing) => [String(listing.itemId), listing]),
  );
  const sellItems = activeItems.filter((item) => item.disposition === "sell");
  const saleResearchSourceCount = Array.from(listingByItemId.values()).reduce(
    (total, listing) => total + listing.researchSourceCount,
    0,
  );

  return restOk({
    data: {
      storage: await summaryFor(ctx, move.householdId),
      move: safeMove(move),
      aiContract: {
        preferredSetupOrder: [
          "spaces",
          "transportResources",
          "transportZones",
          "items",
          "photos",
          "saleListings",
          "layoutPlan",
        ],
        roomCompatibility:
          "Use currentSpaceId/destinationSpaceId when available; keep room/destinationRoom names for readable fallback.",
        photoAttachmentRule:
          "Photos are the proof behind every item — never leave them orphaned. When you create an item or box from a photo, attach that photo to it (attach_photo / create_item_with_images / save_box_intake). A photo only shows on an item once its itemId/boxId is set; a photo with no item/box is invisible on the inventory it documents.",
        queueClosingRule:
          "ALWAYS close a capture-queue entry when you finish it: call submit_queue_result with the created item/box ids so its status becomes 'processed' and it leaves the queue. An entry you processed but never closed still looks unprocessed and will be re-worked, and it clutters the queue. Only leave an entry open if it genuinely still needs work or you asked the user a question (needsInput). Claiming an entry and creating its inventory is NOT done until you submit the result.",
        containerRule:
          "A physical container — a tote, bin, crate, or box — is a BOX (pack_boxes / save_box_intake), not an item. Items are the things that go INSIDE boxes. Never create a tote/bin/crate as an item: it should get a B-### box number and be able to hold items. If you find one entered as an item, it can be converted (convert_item_to_box).",
        saleWorkflow:
          "Items with disposition=sell should have a linked saleListing for pricing, marketplace draft, research, and status.",
        measurementRule:
          "If dimensions or weights are estimated, include measurementProvenance with sourceType, confidence, recordedByLabel, recordedAt, and needsVerification.",
      },
      counts: {
        items: activeItems.length,
        photos: activePhotos.length,
        spaces: spaces.filter(
          (space) =>
            space.householdId === auth.householdId && space.status !== "archived",
        ).length,
        transportResources: resources.filter(
          (resource) =>
            resource.householdId === auth.householdId && !resource.archivedAt,
        ).length,
        transportZones: zones.filter(
          (zone) => zone.householdId === auth.householdId && !zone.archivedAt,
        ).length,
        sellItems: sellItems.length,
        saleListings: listingByItemId.size,
        saleResearchSourceCount,
      },
      spaces: spaces
        .filter(
          (space) =>
            space.householdId === auth.householdId && space.status !== "archived",
        )
        .map((space) => safeMoveSpace(space, auth.visibility.privateNotes)),
      transportResources: resources
        .filter(
          (resource) =>
            resource.householdId === auth.householdId && !resource.archivedAt,
        )
        .map((resource) => safeTransportResource(resource)),
      transportZones: zones
        .filter((zone) => zone.householdId === auth.householdId && !zone.archivedAt)
        .map((zone) => safeTransportZone(zone)),
      items: activeItems.map((item) => ({
        ...safeItem(item, auth.visibility),
        photoCount: photosByItemId.get(String(item._id)) ?? 0,
        saleListingId: listingByItemId.get(String(item._id))?._id,
      })),
      salePipeline: sellItems.map((item) => {
        const listing = listingByItemId.get(String(item._id));
        return {
          item: safeItem(item, auth.visibility),
          photoCount: photosByItemId.get(String(item._id)) ?? 0,
          listing: listing ? safeSaleListing(listing) : undefined,
          needsListing: !listing,
          needsMorePhotos: listing?.needsMorePhotos ?? true,
          researchDepth: listing?.researchDepth ?? "none",
          researchSourceCount: listing?.researchSourceCount ?? 0,
        };
      }),
      photos: activePhotos.slice(0, 250).map((photo) => safePhoto(photo)),
      layoutPlans: plans
        .filter((plan) => plan.householdId === auth.householdId && !plan.archivedAt)
        .map((plan) => ({
          planId: plan._id,
          name: plan.name,
          kind: plan.kind,
          status: plan.status,
          updatedAt: plan.updatedAt,
        })),
    },
  });
}

export async function findApiMoveByTitle(
  ctx: MutationCtx,
  householdId: Id<"households">,
  title: string,
) {
  const normalized = title.trim().toLowerCase();
  const moves = await ctx.db
    .query("moves")
    .withIndex("by_household_status", (q) => q.eq("householdId", householdId))
    .collect();
  return (
    moves.find(
      (move) =>
        move.status !== "archived" &&
        move.title.trim().toLowerCase() === normalized,
    ) ?? null
  );
}

function setupRoomsNote(body: Record<string, unknown>) {
  const originRooms = parseStringArray(body.originRooms);
  const destinationRooms = parseStringArray(body.destinationRooms);
  const lines = [];
  if (originRooms?.length) {
    lines.push(`Origin rooms/spaces: ${originRooms.join("; ")}.`);
  }
  if (destinationRooms?.length) {
    lines.push(`Destination rooms/spaces: ${destinationRooms.join("; ")}.`);
  }
  return lines.length ? `AI setup room list\n${lines.join("\n")}` : undefined;
}

function setupTransportInputs(body: Record<string, unknown>) {
  const inputs = Array.isArray(body.transportResources)
    ? body.transportResources
    : [];
  if (inputs.length > 25) {
    throw new Error("transportResources are limited to 25 rows.");
  }
  return inputs.map((input) => bodyObject(input));
}

export function setupSpaceInputs(body: Record<string, unknown>) {
  const explicitSpaces = Array.isArray(body.spaces)
    ? body.spaces.map((input) => bodyObject(input))
    : [];
  const originRooms = (parseStringArray(body.originRooms) ?? []).map((name, index) => ({
    kind: "originRoom",
    name,
    sortOrder: index,
  }));
  const destinationRooms = (parseStringArray(body.destinationRooms) ?? []).map(
    (name, index) => ({
      kind: "destinationRoom",
      name,
      sortOrder: 1000 + index,
    }),
  );
  const inputs = [...originRooms, ...destinationRooms, ...explicitSpaces];
  if (inputs.length > 100) {
    throw new Error("spaces plus origin/destination rooms are limited to 100 rows.");
  }
  return inputs;
}

function setupItemInputs(body: Record<string, unknown>) {
  const inputs = Array.isArray(body.items) ? body.items : [];
  if (inputs.length > maxBatchUpsertItems) {
    throw new Error(`items are limited to ${maxBatchUpsertItems} rows.`);
  }
  return inputs.map((input) => bodyObject(input));
}

async function upsertApiMoveSpaceForSetup(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  input: Record<string, unknown>,
  index: number,
  history: ReturnType<typeof roomReceiptBatch>,
) {
  const name = requiredBodyString(input.name, "spaces[].name is required.");
  const kind = parseMoveSpaceKind(input.kind) ?? "custom";
  const existing = (
    await ctx.db
      .query("moveSpaces")
      .withIndex("by_move_name", (q) => q.eq("moveId", moveId).eq("name", name))
      .collect()
  ).find(
    (space) =>
      space.householdId === auth.householdId &&
      space.kind === kind &&
      space.status !== "archived",
  );
  const now = Date.now();
  const patch: Partial<Doc<"moveSpaces">> = {
    aliases: parseStringArray(input.aliases) ?? existing?.aliases ?? [],
    notes: normalizeOptionalText(asString(input.notes)),
    floorLevel: normalizeOptionalText(asString(input.floorLevel)),
    sortOrder: normalizeSortOrder(optionalNumber(input.sortOrder) ?? index),
    transportResourceId: optionalString(input.transportResourceId) as
      | Id<"transportResources">
      | undefined,
    transportZoneId: optionalString(input.transportZoneId) as
      | Id<"transportZones">
      | undefined,
    capacity: parseCapacity(input.capacity) ?? existing?.capacity ?? {},
    updatedByApiKeyId: auth.apiKeyId,
    updatedAt: now,
  };

  if (existing) {
    history.remember(existing._id, existing);
    await ctx.db.patch(existing._id, patch);
    return { action: "updated" as const, spaceId: existing._id, name, kind };
  }

  const spaceId = await ctx.db.insert("moveSpaces", {
    householdId: auth.householdId,
    moveId,
    kind,
    name,
    aliases: parseStringArray(input.aliases) ?? [],
    notes: normalizeOptionalText(asString(input.notes)),
    floorLevel: normalizeOptionalText(asString(input.floorLevel)),
    sortOrder: normalizeSortOrder(optionalNumber(input.sortOrder) ?? index),
    status: "active",
    transportResourceId: optionalString(input.transportResourceId) as
      | Id<"transportResources">
      | undefined,
    transportZoneId: optionalString(input.transportZoneId) as
      | Id<"transportZones">
      | undefined,
    linkedPlanEntityId: optionalString(input.linkedPlanEntityId) as
      | Id<"planEntities">
      | undefined,
    capacity: parseCapacity(input.capacity) ?? {},
    createdByUserId: auth.createdByUserId,
    createdByApiKeyId: auth.apiKeyId,
    updatedByApiKeyId: auth.apiKeyId,
    createdAt: now,
    updatedAt: now,
  });
  history.remember(spaceId, null, { action: "space.api_setup_created", metadata: { name, kind } });
  return { action: "created" as const, spaceId, name, kind };
}

async function upsertApiTransportResourceForSetup(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  input: Record<string, unknown>,
  index: number,
) {
  const name = normalizeOptionalText(asString(input.name));
  const presetKey = parseTransportResourcePresetKey(input.presetKey);
  const preset = presetKey ? getTransportResourcePreset(presetKey) : null;
  const resolvedName = name ?? preset?.name;
  if (!resolvedName) {
    throw new Error("transportResources[].name is required unless presetKey is provided.");
  }

  const existing = await findApiTransportResourceByName(
    ctx,
    auth.householdId,
    moveId,
    resolvedName,
  );
  const now = Date.now();
  let resourceId: Id<"transportResources">;
  let action: "create" | "update";
  if (existing) {
    action = "update";
    resourceId = existing._id;
    const patch = transportResourcePatch(input, auth);
    if (preset && input.type === undefined) patch.type = preset.type;
    if (input.name === undefined) patch.name = resolvedName;
    if (input.description === undefined && preset?.description) {
      patch.description = preset.description;
    }
    if (input.capacity === undefined && preset?.capacity) {
      patch.capacity = preset.capacity;
    }
    if (input.rules === undefined && preset?.rules) {
      patch.rules = normalizeRuleList(preset.rules);
    }
    await ctx.db.patch(resourceId, patch);
  } else {
    action = "create";
    const type = preset?.type ?? parseTransportResourceType(input.type);
    if (!type) {
      throw new Error("transportResources[].type is required unless presetKey is provided.");
    }
    resourceId = await ctx.db.insert("transportResources", {
      householdId: auth.householdId,
      moveId,
      type,
      name: resolvedName,
      description:
        normalizeOptionalText(asString(input.description)) ?? preset?.description,
      capacity: parseCapacity(input.capacity) ?? preset?.capacity ?? {},
      capacityReviewStatus:
        parseCapacityReviewStatus(input.capacityReviewStatus) ?? "unreviewed",
      capacityNotes: normalizeOptionalText(asString(input.capacityNotes)),
      rules: normalizeRuleList(parseStringArray(input.rules) ?? preset?.rules ?? []),
      sortOrder:
        input.sortOrder !== undefined
          ? normalizeSortOrder(optionalNumber(input.sortOrder))
          : now + index,
      createdByUserId: auth.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
  }

  const explicitZones = Array.isArray(input.zones)
    ? input.zones.map((zone) => bodyObject(zone))
    : [];
  const presetZones =
    !explicitZones.length && preset
      ? preset.zones.map((zone, zoneIndex) => ({
          name: zone.name,
          description: zone.description,
          preferredTags: [...(zone.preferredTags ?? [])],
          sortOrder: now + index + zoneIndex + 1,
        }))
      : [];
  const zones = [...explicitZones, ...presetZones];
  const zoneResults = [];
  for (const [zoneIndex, zone] of zones.entries()) {
    zoneResults.push(
      await upsertApiTransportZoneForSetup(ctx, auth, moveId, resourceId, zone, zoneIndex),
    );
  }

  await auditApiWrite(
    ctx,
    auth,
    moveId,
    `transport_resource.api_setup_${action}`,
    "transportResources",
    resourceId,
    { name: resolvedName, zoneCount: zoneResults.length },
  );
  return { action, resourceId, name: resolvedName, zones: zoneResults };
}

async function upsertApiTransportZoneForSetup(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  resourceId: Id<"transportResources">,
  input: Record<string, unknown>,
  index: number,
) {
  const name = normalizeOptionalText(asString(input.name));
  if (!name) throw new Error("transportResources[].zones[].name is required.");
  const existing = await findApiTransportZoneByName(
    ctx,
    auth.householdId,
    moveId,
    resourceId,
    name,
  );
  if (existing) {
    const patch = await transportZonePatch(ctx, auth.householdId, moveId, {
      ...input,
      resourceId,
    });
    await ctx.db.patch(existing._id, patch);
    return { action: "update" as const, zoneId: existing._id, name };
  }

  const now = Date.now();
  const zoneId = await ctx.db.insert("transportZones", {
    householdId: auth.householdId,
    moveId,
    resourceId,
    name,
    description: normalizeOptionalText(asString(input.description)),
    capacity: parseCapacity(input.capacity) ?? {},
    preferredTags: normalizeRuleList(parseStringArray(input.preferredTags) ?? []),
    sortOrder:
      input.sortOrder !== undefined
        ? normalizeSortOrder(optionalNumber(input.sortOrder))
        : now + index,
    createdByUserId: auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });
  return { action: "create" as const, zoneId, name };
}
