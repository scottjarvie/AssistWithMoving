import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import { authenticateApiKey } from "./lib/apiKeyAuth";
import { hashApiKey } from "./lib/apiKeys";
import {
  assignmentCsvRows,
  boxCsvRows,
  csvFromRows,
  exportFilename,
  exportMimeType,
  inventoryCsvRows,
  type ExportJobType,
  type ExportVisibility,
} from "./lib/exportRows";
import {
  estimateItem,
  roundEstimate,
  sumEstimateValues,
} from "./lib/estimateEngine";
import {
  boxStatuses,
  itemConditions,
  itemDispositions,
  itemStatuses,
  normalizeBoxCode,
  normalizeItemName,
  normalizeOptionalText,
  normalizedSearchName,
} from "./lib/moveFields";
import {
  bearerToken,
  paginate,
  parseRestPath,
  requestHashInput,
  requiredScopesForRestRoute,
  restError,
  restOk,
  type RestRequestInput,
  type RestResponse,
} from "./lib/restApi";

const restMoveStatuses = ["planning", "active", "completed", "archived"] as const;
const restExportJobTypes = [
  "inventory",
  "boxes",
  "assignments",
  "documentationProfile",
] as const;
const maxBatchUpsertItems = 100;

export const handle = internalMutation({
  args: {
    method: v.union(
      v.literal("GET"),
      v.literal("POST"),
      v.literal("PATCH"),
      v.literal("PUT"),
      v.literal("DELETE")
    ),
    path: v.string(),
    query: v.record(v.string(), v.string()),
    authorization: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    body: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<RestResponse> => {
    const segments = parseRestPath(args.path);
    const requiredScopes = requiredScopesForRestRoute({
      method: args.method,
      segments,
    });
    if (!requiredScopes.length) {
      return restError({
        status: 404,
        code: "not_found",
        message: "API route not found.",
      });
    }

    const rawKey = bearerToken(args.authorization);
    if (!rawKey) {
      return restError({
        status: 401,
        code: "unauthorized",
        message: "Use a Bearer API key.",
      });
    }

    try {
      const moveId = routeMoveId(segments);
      const auth = await authenticateApiKey(ctx, {
        rawKey,
        requiredScopes,
        moveId,
        action: `${args.method} /api/v1/${segments.join("/")}`,
      });

      return await withIdempotency(ctx, args, auth, async () =>
        routeRequest(ctx, args, segments, auth)
      );
    } catch (error) {
      return restError({
        status: errorStatus(error),
        code: "request_failed",
        message: error instanceof Error ? error.message : "Request failed.",
      });
    }
  },
});

export const authenticateActionRequest = internalMutation({
  args: {
    method: v.union(
      v.literal("GET"),
      v.literal("POST"),
      v.literal("PATCH"),
      v.literal("PUT"),
      v.literal("DELETE")
    ),
    path: v.string(),
    query: v.record(v.string(), v.string()),
    authorization: v.optional(v.string()),
    body: v.optional(v.any()),
    moveId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const segments = parseRestPath(args.path);
    const requiredScopes = requiredScopesForRestRoute({
      method: args.method,
      segments,
    });
    if (!requiredScopes.length) {
      return {
        ok: false,
        response: restError({
          status: 404,
          code: "not_found",
          message: "API route not found.",
        }),
      };
    }

    const rawKey = bearerToken(args.authorization);
    if (!rawKey) {
      return {
        ok: false,
        response: restError({
          status: 401,
          code: "unauthorized",
          message: "Use a Bearer API key.",
        }),
      };
    }

    try {
      const auth = await authenticateApiKey(ctx, {
        rawKey,
        requiredScopes,
        moveId: args.moveId
          ? (args.moveId as Id<"moves">)
          : routeMoveIdFromRequest(segments, args.body, args.query),
        action: `${args.method} /api/v1/${segments.join("/")}`,
      });
      return { ok: true, auth, segments };
    } catch (error) {
      return {
        ok: false,
        response: restError({
          status: errorStatus(error),
          code: "request_failed",
          message: error instanceof Error ? error.message : "Request failed.",
        }),
      };
    }
  },
});

export const checkIdempotency = internalMutation({
  args: {
    method: v.union(
      v.literal("GET"),
      v.literal("POST"),
      v.literal("PATCH"),
      v.literal("PUT"),
      v.literal("DELETE")
    ),
    path: v.string(),
    body: v.optional(v.any()),
    apiKeyId: v.id("apiKeys"),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.method === "GET" || !args.idempotencyKey) {
      return { replay: null, requestHash: null };
    }
    const requestHash = await hashApiKey(requestHashInput(args));
    const existing = await ctx.db
      .query("apiIdempotencyKeys")
      .withIndex("by_api_key_key", (q) =>
        q.eq("apiKeyId", args.apiKeyId).eq("idempotencyKey", args.idempotencyKey!)
      )
      .unique();
    if (!existing) {
      return { replay: null, requestHash };
    }
    if (existing.expiresAt < Date.now()) {
      await ctx.db.delete(existing._id);
      return { replay: null, requestHash };
    }
    if (existing.requestHash !== requestHash) {
      return {
        replay: restError({
          status: 409,
          code: "idempotency_conflict",
          message: "Idempotency key was already used with a different request.",
        }),
        requestHash: null,
      };
    }
    return {
      replay: {
        status: existing.status,
        body: existing.response,
      } satisfies RestResponse,
      requestHash: null,
    };
  },
});

export const storeIdempotency = internalMutation({
  args: {
    householdId: v.id("households"),
    moveId: v.optional(v.id("moves")),
    apiKeyId: v.id("apiKeys"),
    idempotencyKey: v.optional(v.string()),
    requestHash: v.optional(v.string()),
    response: v.any(),
    status: v.number(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.idempotencyKey || !args.requestHash) return;
    await ctx.db.insert("apiIdempotencyKeys", {
      householdId: args.householdId,
      moveId: args.moveId,
      apiKeyId: args.apiKeyId,
      idempotencyKey: args.idempotencyKey,
      requestHash: args.requestHash,
      response: args.response,
      status: args.status,
      createdAt: Date.now(),
      expiresAt: args.expiresAt ?? Date.now() + 24 * 60 * 60 * 1000,
    });
  },
});

async function routeRequest(
  ctx: MutationCtx,
  args: RestRequestInput,
  segments: string[],
  auth: Awaited<ReturnType<typeof authenticateApiKey>>
) {
  const [resource, moveIdSegment, nested, nestedId] = segments;
  if (resource === "exports" && args.method === "GET") {
    return await routeTopLevelExport(ctx, args, auth, moveIdSegment);
  }
  if (resource !== "moves") {
    return restError({ status: 404, code: "not_found", message: "Not found." });
  }

  if (args.method === "GET" && segments.length === 1) {
    const moves = await ctx.db
      .query("moves")
      .withIndex("by_household_status", (q) =>
        q.eq("householdId", auth.householdId)
      )
      .collect();
    return restOk(
      paginate(
        moves
          .filter((move) => move.status !== "archived")
          .map((move) => safeMove(move)),
        args.query
      )
    );
  }

  const moveId = moveIdSegment as Id<"moves"> | undefined;
  if (!moveId) {
    return restError({
      status: 404,
      code: "not_found",
      message: "Move route not found.",
    });
  }
  const move = await requireApiMove(ctx, auth.householdId, moveId);

  if (args.method === "GET" && segments.length === 2) {
    return restOk({ data: safeMove(move) });
  }
  if (args.method === "PATCH" && segments.length === 2) {
    const patch = movePatch(args.body);
    await ctx.db.patch(moveId, patch);
    await auditApiWrite(ctx, auth, moveId, "move.api_updated", "moves", moveId, {
      changedKeys: Object.keys(patch),
    });
    return restOk({ data: { moveId, ...patch } });
  }
  if (nested === "summary" && args.method === "GET" && segments.length === 3) {
    return await routeMoveSummary(ctx, auth, move);
  }
  if (
    nested === "capacity-report" &&
    args.method === "GET" &&
    segments.length === 3
  ) {
    return await routeCapacityReport(ctx, auth, move);
  }

  if (nested === "resources" && args.method === "GET") {
    const resources = await ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect();
    return restOk(
      paginate(
        resources.filter((entry) => !entry.archivedAt).map((entry) => ({
          ...entry,
          resourceId: entry._id,
        })),
        args.query
      )
    );
  }

  if (nested === "zones" && args.method === "GET") {
    const zones = await ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect();
    return restOk(
      paginate(
        zones.filter((entry) => !entry.archivedAt).map((entry) => ({
          ...entry,
          zoneId: entry._id,
        })),
        args.query
      )
    );
  }

  if (nested === "items") {
    return await routeItems(ctx, args, auth, moveId, nestedId);
  }
  if (nested === "boxes") {
    return await routeBoxes(ctx, args, auth, moveId, nestedId);
  }
  if (nested === "assignments") {
    return await routeAssignments(ctx, args, auth, moveId, nestedId);
  }
  if (nested === "documentation-profiles") {
    return await routeDocumentationProfiles(ctx, args, auth, moveId, nestedId);
  }
  if (nested === "exports") {
    return await routeExports(ctx, args, auth, moveId, nestedId, segments[4]);
  }
  if (nested === "photos" && args.method === "GET") {
    const photos = await ctx.db
      .query("itemPhotos")
      .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
      .order("desc")
      .collect();
    return restOk(
      paginate(
        photos.filter((photo) => !photo.archivedAt).map((photo) => ({
          photoId: photo._id,
          itemId: photo.itemId,
          boxId: photo.boxId,
          room: photo.room,
          photoType: photo.photoType,
          privacyLevel: photo.privacyLevel,
          verificationStatus: photo.verificationStatus,
          caption: photo.caption,
          width: photo.width,
          height: photo.height,
          mimeType: photo.mimeType,
          sizeBytes: photo.sizeBytes,
          capturedAt: photo.capturedAt,
          uploadedAt: photo.createdAt,
        })),
        args.query
      )
    );
  }

  return restError({ status: 404, code: "not_found", message: "Not found." });
}

async function routeMoveSummary(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  move: Doc<"moves">
) {
  const [
    resources,
    zones,
    items,
    boxes,
    assignments,
    photos,
    documentationProfiles,
    exportJobs,
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
      .query("documentationProfiles")
      .withIndex("by_move_status", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("exportJobs")
      .withIndex("by_move_created", (q) => q.eq("moveId", move._id))
      .order("desc")
      .collect(),
  ]);

  const activeResources = resources.filter(
    (resource) => resource.householdId === auth.householdId && !resource.archivedAt
  );
  const activeZones = zones.filter(
    (zone) => zone.householdId === auth.householdId && !zone.archivedAt
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
  const visibleExportJobs = exportJobs.filter(
    (job) => job.householdId === auth.householdId
  );
  const visibleAssignments = assignments.filter(
    (assignment) => assignment.householdId === auth.householdId
  );

  return restOk({
    data: {
      move: safeMove(move),
      resources: activeResources.map((resource) => safeTransportResource(resource)),
      zones: activeZones.map((zone) => safeTransportZone(zone)),
      items: activeItems.map((item) => safeItem(item)),
      boxes: activeBoxes.map((box) => safeBox(box)),
      assignments: visibleAssignments.map((assignment) =>
        safeAssignment(assignment)
      ),
      photos: visiblePhotos.map((photo) => safePhoto(photo)),
      documentationProfiles: activeDocumentationProfiles.map((profile) =>
        safeDocumentationProfile(profile)
      ),
      exports: visibleExportJobs.map((job) => safeExportJob(job)),
      counts: {
        resources: activeResources.length,
        zones: activeZones.length,
        items: activeItems.length,
        boxes: activeBoxes.length,
        assignments: visibleAssignments.length,
        photos: visiblePhotos.length,
        documentationProfiles: activeDocumentationProfiles.length,
        exports: visibleExportJobs.length,
      },
      generatedAt: Date.now(),
    },
  });
}

async function routeCapacityReport(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  move: Doc<"moves">
) {
  const [items, boxes, assignments, resources, zones] = await Promise.all([
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
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
    ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", move._id))
      .collect(),
  ]);

  const activeItems = items.filter(
    (item) => item.householdId === auth.householdId && !item.deletedAt
  );
  const activeBoxes = boxes.filter(
    (box) => box.householdId === auth.householdId && !box.archivedAt
  );
  const activeAssignments = assignments.filter(
    (assignment) => assignment.householdId === auth.householdId
  );
  const activeResources = resources.filter(
    (resource) => resource.householdId === auth.householdId && !resource.archivedAt
  );
  const activeZones = zones.filter(
    (zone) => zone.householdId === auth.householdId && !zone.archivedAt
  );
  const itemById = new Map(activeItems.map((item) => [item._id, item]));
  const assignmentsByBoxId = new Map<Id<"boxes">, Doc<"boxItems">[]>();
  for (const assignment of activeAssignments) {
    const existing = assignmentsByBoxId.get(assignment.boxId) ?? [];
    existing.push(assignment);
    assignmentsByBoxId.set(assignment.boxId, existing);
  }

  const itemEstimates = activeItems.map((item) => ({
    itemId: item._id,
    name: item.name,
    room: item.room,
    disposition: item.disposition,
    estimate: estimateItem(item),
  }));
  const totalEstimatedWeightLb = sumEstimateValues(
    itemEstimates.map((item) => item.estimate.weight)
  );
  const totalEstimatedVolumeCuFt = sumEstimateValues(
    itemEstimates.map((item) => item.estimate.volume)
  );

  const boxReports = activeBoxes.map((box) => {
    const boxAssignments = assignmentsByBoxId.get(box._id) ?? [];
    const contentEstimates = boxAssignments
      .map((assignment) => {
        const item = itemById.get(assignment.itemId);
        return item
          ? estimateItem({
              ...item,
              quantity: assignment.quantity,
            })
          : null;
      })
      .filter((estimate): estimate is NonNullable<typeof estimate> =>
        Boolean(estimate)
      );
    const contentsWeight = sumEstimateValues(
      contentEstimates.map((estimate) => estimate.weight)
    );
    const contentsVolume = sumEstimateValues(
      contentEstimates.map((estimate) => estimate.volume)
    );
    const estimatedWeightLb =
      box.actualWeightLb ?? box.estimatedWeightLb ?? contentsWeight;
    const estimatedVolumeCuFt = box.estimatedVolumeCuFt ?? contentsVolume;
    const warnings: string[] = [];
    if (!box.actualWeightLb && !box.estimatedWeightLb && contentsWeight === 0) {
      warnings.push("missingBoxWeightEstimate");
    }
    if (!box.estimatedVolumeCuFt && contentsVolume === 0) {
      warnings.push("missingBoxVolumeEstimate");
    }
    if (estimatedWeightLb > 65) {
      warnings.push("overweightBox");
    }

    return {
      boxId: box._id,
      code: box.code,
      label: box.label,
      room: box.room,
      assignedResourceId: box.assignedResourceId,
      assignedZoneId: box.assignedZoneId,
      itemCount: boxAssignments.reduce(
        (sum, assignment) => sum + assignment.quantity,
        0
      ),
      estimatedWeightLb: roundEstimate(estimatedWeightLb),
      estimatedVolumeCuFt: roundEstimate(estimatedVolumeCuFt),
      assignmentLocked: box.assignmentLocked ?? false,
      assignmentWarnings: box.assignmentWarnings ?? [],
      assignmentHardBlocks: box.assignmentHardBlocks ?? [],
      warnings,
    };
  });

  const resourceReports = activeResources.map((resource) => {
    const assignedBoxes = boxReports.filter(
      (box) => box.assignedResourceId === resource._id
    );
    const estimatedWeightLb = roundEstimate(
      assignedBoxes.reduce((sum, box) => sum + box.estimatedWeightLb, 0)
    );
    const estimatedVolumeCuFt = roundEstimate(
      assignedBoxes.reduce((sum, box) => sum + box.estimatedVolumeCuFt, 0)
    );
    return {
      resourceId: resource._id,
      name: resource.name,
      type: resource.type,
      estimatedWeightLb,
      estimatedVolumeCuFt,
      maxWeightLb: resource.capacity.maxWeightLb,
      maxVolumeCuFt: resource.capacity.maxVolumeCuFt,
      weightPercent: capacityPercent({
        used: estimatedWeightLb,
        max: resource.capacity.maxWeightLb,
        unlimited: resource.capacity.weightIsUnlimited,
      }),
      volumePercent: capacityPercent({
        used: estimatedVolumeCuFt,
        max: resource.capacity.maxVolumeCuFt,
        unlimited: resource.capacity.volumeIsUnlimited,
      }),
      assignedBoxCount: assignedBoxes.length,
      warningCount: assignedBoxes.reduce(
        (sum, box) =>
          sum +
          box.warnings.length +
          box.assignmentWarnings.length +
          box.assignmentHardBlocks.length,
        0
      ),
    };
  });

  const zoneReports = activeZones.map((zone) => {
    const assignedBoxes = boxReports.filter((box) => box.assignedZoneId === zone._id);
    const estimatedWeightLb = roundEstimate(
      assignedBoxes.reduce((sum, box) => sum + box.estimatedWeightLb, 0)
    );
    const estimatedVolumeCuFt = roundEstimate(
      assignedBoxes.reduce((sum, box) => sum + box.estimatedVolumeCuFt, 0)
    );
    return {
      zoneId: zone._id,
      resourceId: zone.resourceId,
      name: zone.name,
      estimatedWeightLb,
      estimatedVolumeCuFt,
      maxWeightLb: zone.capacity.maxWeightLb,
      maxVolumeCuFt: zone.capacity.maxVolumeCuFt,
      weightPercent: capacityPercent({
        used: estimatedWeightLb,
        max: zone.capacity.maxWeightLb,
        unlimited: zone.capacity.weightIsUnlimited,
      }),
      volumePercent: capacityPercent({
        used: estimatedVolumeCuFt,
        max: zone.capacity.maxVolumeCuFt,
        unlimited: zone.capacity.volumeIsUnlimited,
      }),
      assignedBoxCount: assignedBoxes.length,
    };
  });

  return restOk({
    data: {
      moveId: move._id,
      moveAllowanceLb: move.moveLevelWeightAllowanceLb,
      totalEstimatedWeightLb,
      totalEstimatedVolumeCuFt,
      allowancePercent: capacityPercent({
        used: totalEstimatedWeightLb,
        max: move.moveLevelWeightAllowanceLb,
      }),
      missingWeightCount: itemEstimates.filter((item) =>
        item.estimate.warnings.includes("missingWeightEstimate")
      ).length,
      missingVolumeCount: itemEstimates.filter((item) =>
        item.estimate.warnings.includes("missingVolumeEstimate")
      ).length,
      unassignedBoxCount: boxReports.filter((box) => !box.assignedResourceId)
        .length,
      boxReports,
      resourceReports,
      zoneReports,
      itemEstimates: itemEstimates.slice(0, 100),
      generatedAt: Date.now(),
    },
  });
}

async function routeItems(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  itemIdSegment?: string
) {
  if (args.method === "GET" && !itemIdSegment) {
    const items = await ctx.db
      .query("items")
      .withIndex("by_move_updated", (q) => q.eq("moveId", moveId))
      .order("desc")
      .collect();
    return restOk(
      paginate(
        items
          .filter((item) => !item.deletedAt)
          .filter((item) =>
            args.query.status ? item.status === args.query.status : true
          )
          .filter((item) =>
            args.query.disposition
              ? item.disposition === args.query.disposition
              : true
          )
          .map((item) => safeItem(item)),
        args.query
      )
    );
  }

  if (args.method === "GET" && itemIdSegment) {
    const item = await requireApiItem(ctx, auth.householdId, moveId, itemIdSegment);
    return restOk({ data: safeItem(item) });
  }

  if (args.method === "POST" && itemIdSegment === "batch-upsert") {
    return await routeBatchUpsertItems(ctx, args, auth, moveId);
  }

  if (args.method === "POST" && !itemIdSegment) {
    const body = bodyObject(args.body);
    const { itemId, name } = await createApiItem(ctx, auth, moveId, body);
    await auditApiWrite(ctx, auth, moveId, "item.api_created", "items", itemId, {
      name,
    });
    return restOk({ data: { itemId } }, 201);
  }

  if (args.method === "PATCH" && itemIdSegment) {
    const item = await requireApiItem(ctx, auth.householdId, moveId, itemIdSegment);
    const patch = itemPatch(args.body, auth.createdByUserId);
    await ctx.db.patch(item._id, patch);
    await auditApiWrite(ctx, auth, moveId, "item.api_updated", "items", item._id, {
      changedKeys: Object.keys(patch),
    });
    return restOk({ data: { itemId: item._id, ...patch } });
  }

  return restError({ status: 404, code: "not_found", message: "Item route not found." });
}

async function routeBatchUpsertItems(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const body = bodyObject(args.body);
  const rows = Array.isArray(body.items) ? body.items : [];
  const dryRun = Boolean(body.dryRun);
  if (!rows.length) {
    return restError({
      status: 400,
      code: "invalid_batch",
      message: "items must include at least one row.",
    });
  }
  if (rows.length > maxBatchUpsertItems) {
    return restError({
      status: 400,
      code: "batch_too_large",
      message: `Batch item imports are limited to ${maxBatchUpsertItems} rows.`,
    });
  }

  const results = [];
  for (const [index, row] of rows.entries()) {
    const input = bodyObject(row);
    const itemId = optionalString(input.itemId);
    try {
      if (itemId) {
        const item = await requireApiItem(ctx, auth.householdId, moveId, itemId);
        const patch = itemPatch(input, auth.createdByUserId);
        if (!dryRun) {
          await ctx.db.patch(item._id, patch);
          await auditApiWrite(
            ctx,
            auth,
            moveId,
            "item.api_batch_updated",
            "items",
            item._id,
            { rowIndex: index, changedKeys: Object.keys(patch) }
          );
        }
        results.push({
          index,
          ok: true,
          action: "update",
          itemId: item._id,
          changedKeys: Object.keys(patch),
          dryRun,
        });
        continue;
      }

      const name = normalizeItemName(String(input.name ?? ""));
      if (!name) {
        throw new Error("name is required when creating an item.");
      }
      if (dryRun) {
        results.push({
          index,
          ok: true,
          action: "create",
          name,
          dryRun,
        });
        continue;
      }
      const created = await createApiItem(ctx, auth, moveId, input);
      await auditApiWrite(
        ctx,
        auth,
        moveId,
        "item.api_batch_created",
        "items",
        created.itemId,
        { rowIndex: index, name: created.name }
      );
      results.push({
        index,
        ok: true,
        action: "create",
        itemId: created.itemId,
        name: created.name,
        dryRun,
      });
    } catch (error) {
      results.push({
        index,
        ok: false,
        action: itemId ? "update" : "create",
        itemId: itemId || undefined,
        error: error instanceof Error ? error.message : "Row failed.",
        dryRun,
      });
    }
  }

  const failed = results.filter((result) => !result.ok).length;

  return restOk(
    {
      data: {
        dryRun,
        total: rows.length,
        succeeded: results.filter((result) => result.ok).length,
        failed,
        results,
      },
    },
    failed > 0 ? 207 : 200
  );
}

async function routeBoxes(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  boxIdSegment?: string
) {
  if (args.method === "GET" && !boxIdSegment) {
    const boxes = await ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", moveId))
      .order("desc")
      .collect();
    return restOk(
      paginate(
        boxes.filter((box) => !box.archivedAt).map((box) => safeBox(box)),
        args.query
      )
    );
  }

  if (args.method === "GET" && boxIdSegment) {
    const box = await requireApiBox(ctx, auth.householdId, moveId, boxIdSegment);
    return restOk({ data: safeBox(box) });
  }

  if (args.method === "POST" && !boxIdSegment) {
    const body = bodyObject(args.body);
    const now = Date.now();
    const code = body.code ? normalizeBoxCode(String(body.code)) : `API-${now}`;
    const boxId = await ctx.db.insert("boxes", {
      householdId: auth.householdId,
      moveId,
      code,
      label: normalizeOptionalText(asString(body.label)),
      room: normalizeOptionalText(asString(body.room)),
      destinationRoom: normalizeOptionalText(asString(body.destinationRoom)),
      description: normalizeOptionalText(asString(body.description)),
      status: parseBoxStatus(body.status) ?? "open",
      estimatedWeightLb: optionalNumber(body.estimatedWeightLb),
      actualWeightLb: optionalNumber(body.actualWeightLb),
      estimatedVolumeCuFt: optionalNumber(body.estimatedVolumeCuFt),
      assignmentLocked: false,
      assignmentWarnings: [],
      assignmentHardBlocks: [],
      assignmentValidatedAt: now,
      createdByUserId: auth.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
    await auditApiWrite(ctx, auth, moveId, "box.api_created", "boxes", boxId, {
      code,
    });
    return restOk({ data: { boxId } }, 201);
  }

  if (args.method === "PATCH" && boxIdSegment) {
    const box = await requireApiBox(ctx, auth.householdId, moveId, boxIdSegment);
    const patch = boxPatch(args.body);
    await ctx.db.patch(box._id, patch);
    await auditApiWrite(ctx, auth, moveId, "box.api_updated", "boxes", box._id, {
      changedKeys: Object.keys(patch),
    });
    return restOk({ data: { boxId: box._id, ...patch } });
  }

  return restError({ status: 404, code: "not_found", message: "Box route not found." });
}

async function routeAssignments(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  assignmentIdSegment?: string
) {
  if (args.method === "GET") {
    const assignments = await ctx.db
      .query("boxItems")
      .withIndex("by_move", (q) => q.eq("moveId", moveId))
      .collect();
    return restOk(
      paginate(
        assignments.map((assignment) => ({
          assignmentId: assignment._id,
          boxId: assignment.boxId,
          itemId: assignment.itemId,
          quantity: assignment.quantity,
          notes: assignment.notes,
          createdAt: assignment.createdAt,
          updatedAt: assignment.updatedAt,
        })),
        args.query
      )
    );
  }

  if ((args.method === "POST" || args.method === "PUT") && !assignmentIdSegment) {
    const body = bodyObject(args.body);
    const boxId = String(body.boxId ?? "") as Id<"boxes">;
    const itemId = String(body.itemId ?? "") as Id<"items">;
    await requireApiBox(ctx, auth.householdId, moveId, boxId);
    await requireApiItem(ctx, auth.householdId, moveId, itemId);
    const now = Date.now();
    const existing = await ctx.db
      .query("boxItems")
      .withIndex("by_item", (q) => q.eq("itemId", itemId))
      .collect();
    const current = existing.find((entry) => entry.moveId === moveId);
    const patch = {
      boxId,
      quantity: positiveNumber(body.quantity) ?? 1,
      notes: normalizeOptionalText(asString(body.notes)),
      updatedAt: now,
    };
    if (current) {
      await ctx.db.patch(current._id, patch);
      return restOk({ data: { assignmentId: current._id } });
    }
    const assignmentId = await ctx.db.insert("boxItems", {
      householdId: auth.householdId,
      moveId,
      itemId,
      ...patch,
      createdAt: now,
    });
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "assignment.api_upserted",
      "boxItems",
      assignmentId,
      { boxId, itemId }
    );
    return restOk({ data: { assignmentId } }, 201);
  }

  if (args.method === "DELETE" && assignmentIdSegment) {
    const assignmentId = assignmentIdSegment as Id<"boxItems">;
    const assignment = await ctx.db.get(assignmentId);
    if (
      !assignment ||
      assignment.moveId !== moveId ||
      assignment.householdId !== auth.householdId
    ) {
      throw new Error("Assignment not found.");
    }
    await ctx.db.delete(assignmentId);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "assignment.api_deleted",
      "boxItems",
      assignmentId
    );
    return restOk({ data: { deleted: true } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Assignment route not found.",
  });
}

async function routeDocumentationProfiles(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  profileIdSegment?: string
) {
  if (args.method !== "GET") {
    return restError({
      status: 404,
      code: "not_found",
      message: "Documentation profile route not found.",
    });
  }
  const profiles = await ctx.db
    .query("documentationProfiles")
    .withIndex("by_move_status", (q) => q.eq("moveId", moveId))
    .collect();
  const activeProfiles = profiles.filter(
    (profile) => profile.householdId === auth.householdId && profile.status !== "archived"
  );
  if (profileIdSegment) {
    const profile = activeProfiles.find((entry) => entry._id === profileIdSegment);
    if (!profile) {
      throw new Error("Documentation profile not found.");
    }
    return restOk({ data: safeDocumentationProfile(profile) });
  }
  return restOk(
    paginate(activeProfiles.map((profile) => safeDocumentationProfile(profile)), args.query)
  );
}

async function routeExports(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  exportIdSegment?: string,
  actionSegment?: string
) {
  if (args.method === "GET" && !exportIdSegment) {
    const jobs = await ctx.db
      .query("exportJobs")
      .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
      .order("desc")
      .collect();
    return restOk(
      paginate(
        jobs
          .filter((job) => job.householdId === auth.householdId)
          .map((job) => safeExportJob(job)),
        args.query
      )
    );
  }

  if (args.method === "POST" && !exportIdSegment) {
    const body = bodyObject(args.body);
    const result = await createApiCsvExport(ctx, {
      auth,
      moveId,
      type: parseExportJobType(body.type) ?? "inventory",
      documentationProfileId: optionalString(body.documentationProfileId) as
        | Id<"documentationProfiles">
        | undefined,
    });
    return restOk({ data: result }, 201);
  }

  if (args.method === "GET" && exportIdSegment) {
    const job = await requireApiExportJob(
      ctx,
      auth.householdId,
      moveId,
      exportIdSegment
    );
    if (actionSegment === "download") {
      return restOk({ data: artifactForApiExport(job) });
    }
    return restOk({ data: safeExportJob(job) });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Export route not found.",
  });
}

async function routeTopLevelExport(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  exportIdSegment?: string
) {
  if (!exportIdSegment) {
    return restError({ status: 404, code: "not_found", message: "Export not found." });
  }
  const moveId = requiredQueryMoveId(args.query);
  const job = await requireApiExportJob(ctx, auth.householdId, moveId, exportIdSegment);
  return restOk({
    data:
      args.query.download === "1" || args.query.download === "true"
        ? artifactForApiExport(job)
        : safeExportJob(job),
  });
}

async function withIdempotency(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  createResponse: () => Promise<RestResponse>
) {
  if (args.method === "GET" || !args.idempotencyKey) {
    return await createResponse();
  }
  const requestHash = await hashApiKey(requestHashInput(args));
  const existing = await ctx.db
    .query("apiIdempotencyKeys")
    .withIndex("by_api_key_key", (q) =>
      q.eq("apiKeyId", auth.apiKeyId).eq("idempotencyKey", args.idempotencyKey!)
    )
    .unique();
  if (existing) {
    if (existing.expiresAt < Date.now()) {
      await ctx.db.delete(existing._id);
      return await withIdempotency(ctx, args, auth, createResponse);
    }
    if (existing.requestHash !== requestHash) {
      return restError({
        status: 409,
        code: "idempotency_conflict",
        message: "Idempotency key was already used with a different request.",
      });
    }
    return {
      status: existing.status,
      body: existing.response,
    };
  }
  const response = await createResponse();
  await ctx.db.insert("apiIdempotencyKeys", {
    householdId: auth.householdId,
    moveId: auth.moveId,
    apiKeyId: auth.apiKeyId,
    idempotencyKey: args.idempotencyKey,
    requestHash,
    response: response.body,
    status: response.status,
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  });
  return response;
}

function routeMoveId(segments: string[]) {
  return segments[0] === "moves" && segments[1]
    ? (segments[1] as Id<"moves">)
    : undefined;
}

function routeMoveIdFromRequest(
  segments: string[],
  body: unknown,
  query: Record<string, string>
) {
  if (segments[0] === "moves" && segments[1]) {
    return segments[1] as Id<"moves">;
  }
  const input = bodyObject(body);
  const bodyMoveId = input.moveId;
  if (typeof bodyMoveId === "string" && bodyMoveId) {
    return bodyMoveId as Id<"moves">;
  }
  if (query.moveId) {
    return query.moveId as Id<"moves">;
  }
  return undefined;
}

async function requireApiMove(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">
) {
  const move = await ctx.db.get(moveId);
  if (!move || move.householdId !== householdId || move.status === "archived") {
    throw new Error("Move not found.");
  }
  return move;
}

async function requireApiItem(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  itemIdSegment: string
) {
  const item = await ctx.db.get(itemIdSegment as Id<"items">);
  if (!item || item.householdId !== householdId || item.moveId !== moveId || item.deletedAt) {
    throw new Error("Item not found.");
  }
  return item;
}

async function requireApiBox(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  boxIdSegment: string
) {
  const box = await ctx.db.get(boxIdSegment as Id<"boxes">);
  if (!box || box.householdId !== householdId || box.moveId !== moveId || box.archivedAt) {
    throw new Error("Box not found.");
  }
  return box;
}

async function requireApiDocumentationProfile(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    documentationProfileId?: Id<"documentationProfiles">;
  }
) {
  if (!args.documentationProfileId) {
    throw new Error("Documentation profile export requires a profile.");
  }
  const profile = await ctx.db.get(args.documentationProfileId);
  if (
    !profile ||
    profile.householdId !== args.householdId ||
    profile.moveId !== args.moveId ||
    profile.status === "archived"
  ) {
    throw new Error("Documentation profile not found.");
  }
  return profile;
}

async function requireApiExportJob(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  exportIdSegment: string
) {
  const job = await ctx.db.get(exportIdSegment as Id<"exportJobs">);
  if (!job || job.householdId !== householdId || job.moveId !== moveId) {
    throw new Error("Export job not found.");
  }
  return job;
}

function requiredQueryMoveId(query: Record<string, string>) {
  if (!query.moveId) {
    throw new Error("moveId query parameter is required.");
  }
  return query.moveId as Id<"moves">;
}

function safeMove(move: Doc<"moves">) {
  return {
    moveId: move._id,
    title: move.title,
    type: move.type,
    status: move.status,
    origin: move.origin,
    destination: move.destination,
    dateStart: move.dateStart,
    dateEnd: move.dateEnd,
    unitSystem: move.unitSystem,
    documentationProfileTypes: move.documentationProfileTypes,
    createdAt: move.createdAt,
    updatedAt: move.updatedAt,
  };
}

function safeItem(item: Doc<"items">) {
  return {
    itemId: item._id,
    name: item.name,
    description: item.description,
    room: item.room,
    destinationRoom: item.destinationRoom,
    category: item.category,
    disposition: item.disposition,
    status: item.status,
    quantity: item.quantity,
    condition: item.condition,
    valueCents: item.valueCents,
    replacementValueCents: item.replacementValueCents,
    serialNumber: item.serialNumber,
    modelNumber: item.modelNumber,
    highValue: item.highValue,
    needsReview: item.needsReview,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function safeBox(box: Doc<"boxes">) {
  return {
    boxId: box._id,
    code: box.code,
    label: box.label,
    room: box.room,
    destinationRoom: box.destinationRoom,
    status: box.status,
    estimatedWeightLb: box.estimatedWeightLb,
    actualWeightLb: box.actualWeightLb,
    estimatedVolumeCuFt: box.estimatedVolumeCuFt,
    assignedResourceId: box.assignedResourceId,
    assignedZoneId: box.assignedZoneId,
    assignmentLocked: box.assignmentLocked,
    assignmentWarnings: box.assignmentWarnings,
    assignmentHardBlocks: box.assignmentHardBlocks,
    createdAt: box.createdAt,
    updatedAt: box.updatedAt,
  };
}

function safeTransportResource(resource: Doc<"transportResources">) {
  return {
    resourceId: resource._id,
    type: resource.type,
    name: resource.name,
    description: resource.description,
    capacity: resource.capacity,
    rules: resource.rules,
    sortOrder: resource.sortOrder,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
  };
}

function safeTransportZone(zone: Doc<"transportZones">) {
  return {
    zoneId: zone._id,
    resourceId: zone.resourceId,
    name: zone.name,
    description: zone.description,
    capacity: zone.capacity,
    preferredTags: zone.preferredTags,
    sortOrder: zone.sortOrder,
    createdAt: zone.createdAt,
    updatedAt: zone.updatedAt,
  };
}

function safeAssignment(assignment: Doc<"boxItems">) {
  return {
    assignmentId: assignment._id,
    boxId: assignment.boxId,
    itemId: assignment.itemId,
    quantity: assignment.quantity,
    notes: assignment.notes,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
  };
}

function safePhoto(photo: Doc<"itemPhotos">) {
  return {
    photoId: photo._id,
    itemId: photo.itemId,
    boxId: photo.boxId,
    room: photo.room,
    documentationProfileTypes: photo.documentationProfileTypes,
    photoType: photo.photoType,
    privacyLevel: photo.privacyLevel,
    visibilityScope: photo.visibilityScope,
    verificationStatus: photo.verificationStatus,
    caption: photo.caption,
    width: photo.width,
    height: photo.height,
    mimeType: photo.mimeType,
    sizeBytes: photo.sizeBytes,
    capturedAt: photo.capturedAt,
    uploadedAt: photo.createdAt,
    updatedAt: photo.updatedAt,
  };
}

function safeDocumentationProfile(profile: Doc<"documentationProfiles">) {
  return {
    documentationProfileId: profile._id,
    type: profile.type,
    name: profile.name,
    status: profile.status,
    includedFields: profile.includedFields,
    imageRule: profile.imageRule,
    filters: profile.filters,
    allowedActions: profile.allowedActions,
    disclaimer: profile.disclaimer,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function safeExportJob(job: Doc<"exportJobs">) {
  return {
    exportJobId: job._id,
    moveId: job.moveId,
    documentationProfileId: job.documentationProfileId,
    type: job.type,
    format: job.format,
    status: job.status,
    filename: job.filename,
    mimeType: job.mimeType,
    rowCount: job.rowCount,
    sizeBytes: job.sizeBytes,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    expiresAt: job.expiresAt,
  };
}

function artifactForApiExport(job: Doc<"exportJobs">) {
  if (job.status !== "completed" || !job.artifactText) {
    throw new Error("Export artifact is not ready.");
  }
  if (job.expiresAt && job.expiresAt < Date.now()) {
    throw new Error("Export artifact has expired.");
  }
  return {
    ...safeExportJob(job),
    artifactText: job.artifactText,
    encoding: "utf-8",
  };
}

async function createApiItem(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  body: Record<string, unknown>
) {
  const now = Date.now();
  const name = normalizeItemName(String(body.name ?? ""));
  const itemId = await ctx.db.insert("items", {
    householdId: auth.householdId,
    moveId,
    name,
    normalizedName: normalizedSearchName(name),
    description: normalizeOptionalText(asString(body.description)),
    room: normalizeOptionalText(asString(body.room)),
    destinationRoom: normalizeOptionalText(asString(body.destinationRoom)),
    category: normalizeOptionalText(asString(body.category)),
    subcategory: normalizeOptionalText(asString(body.subcategory)),
    disposition: parseDisposition(body.disposition) ?? "undecided",
    status: parseItemStatus(body.status) ?? "active",
    quantity: positiveNumber(body.quantity) ?? 1,
    condition: parseCondition(body.condition) ?? "unknown",
    valueCents: optionalNumber(body.valueCents),
    replacementValueCents: optionalNumber(body.replacementValueCents),
    serialNumber: normalizeOptionalText(asString(body.serialNumber)),
    modelNumber: normalizeOptionalText(asString(body.modelNumber)),
    estimatedWeightLb: optionalNumber(body.estimatedWeightLb),
    actualWeightLb: optionalNumber(body.actualWeightLb),
    estimatedVolumeCuFt: optionalNumber(body.estimatedVolumeCuFt),
    weightConfidence: "none",
    volumeConfidence: "none",
    fragility: "low",
    stackable: true,
    hazardousFlag: Boolean(body.hazardousFlag),
    highValue: Boolean(body.highValue),
    requiresPersonalTransport: Boolean(body.requiresPersonalTransport),
    planningDefaultKeys: [],
    needsReview: Boolean(body.needsReview),
    reviewFlags: [],
    privateNotes: normalizeOptionalText(asString(body.privateNotes)),
    aiTags: [],
    createdVia: "api",
    createdByUserId: auth.createdByUserId,
    updatedByUserId: auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });

  return { itemId, name };
}

async function createApiCsvExport(
  ctx: MutationCtx,
  args: {
    auth: Awaited<ReturnType<typeof authenticateApiKey>>;
    moveId: Id<"moves">;
    type: ExportJobType;
    documentationProfileId?: Id<"documentationProfiles">;
  }
) {
  const [items, boxes, boxItems, resources, zones] = await Promise.all([
    ctx.db
      .query("items")
      .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
      .collect(),
    ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
      .collect(),
    ctx.db
      .query("boxItems")
      .withIndex("by_move", (q) => q.eq("moveId", args.moveId))
      .collect(),
    ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
      .collect(),
    ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
      .collect(),
  ]);
  const profile =
    args.type === "documentationProfile"
      ? await requireApiDocumentationProfile(ctx, {
          householdId: args.auth.householdId,
          moveId: args.moveId,
          documentationProfileId: args.documentationProfileId,
        })
      : null;
  const visibility = apiExportVisibility(profile);
  const activeItems = items.filter((item) => !item.deletedAt);
  const activeBoxes = boxes.filter((box) => !box.archivedAt);
  const filteredItems = profile
    ? activeItems.filter((item) => itemMatchesProfile(item, profile))
    : activeItems;
  const resourceNameById = new Map(
    resources.map((resource) => [resource._id, resource.name])
  );
  const zoneNameById = new Map(zones.map((zone) => [zone._id, zone.name]));
  const rows = rowsForExport({
    type: args.type,
    items: filteredItems,
    boxes: activeBoxes,
    boxItems,
    resourceNameById,
    zoneNameById,
    visibility,
  });
  const artifactText = csvFromRows(rows);
  const now = Date.now();
  const filename = exportFilename({
    type: args.type,
    format: "csv",
    slug: profile?.name ?? args.type,
  });
  const exportJobId = await ctx.db.insert("exportJobs", {
    householdId: args.auth.householdId,
    moveId: args.moveId,
    documentationProfileId: profile?._id,
    type: args.type,
    format: "csv",
    status: "completed",
    version: 1,
    filename,
    mimeType: exportMimeType("csv"),
    artifactText,
    rowCount: Math.max(rows.length - 1, 0),
    sizeBytes: artifactText.length,
    filters: profile?.filters,
    createdByUserId: args.auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
  });

  if (profile) {
    await ctx.db.patch(profile._id, {
      exportHistory: [
        {
          exportJobId: String(exportJobId),
          format: "csv" as const,
          createdByUserId: args.auth.createdByUserId,
          createdAt: now,
        },
        ...profile.exportHistory,
      ].slice(0, 25),
      updatedAt: now,
    });
  }

  await auditApiWrite(ctx, args.auth, args.moveId, "export.api_completed", "exportJobs", exportJobId, {
    type: args.type,
    format: "csv",
    rowCount: Math.max(rows.length - 1, 0),
    documentationProfileId: profile?._id,
  });

  return {
    exportJobId,
    filename,
    rowCount: Math.max(rows.length - 1, 0),
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
  };
}

function apiExportVisibility(
  profile: Doc<"documentationProfiles"> | null
): ExportVisibility {
  if (!profile) {
    return { values: false, serials: false, privateNotes: false };
  }
  return {
    values:
      profile.includedFields.includes("estimatedValues") ||
      profile.includedFields.includes("purchaseValues"),
    serials: profile.includedFields.includes("serialNumbers"),
    privateNotes: profile.includedFields.includes("privateNotes"),
  };
}

function itemMatchesProfile(
  item: Doc<"items">,
  profile: Doc<"documentationProfiles">
) {
  const filters = profile.filters;
  if (filters.dispositions?.length && !filters.dispositions.includes(item.disposition)) {
    return false;
  }
  if (filters.statuses?.length && !filters.statuses.includes(item.status)) {
    return false;
  }
  if (
    filters.planningDefaultKeys?.length &&
    !filters.planningDefaultKeys.some((key) => item.planningDefaultKeys.includes(key))
  ) {
    return false;
  }
  if (filters.room && item.room !== filters.room) {
    return false;
  }
  if (filters.destinationRoom && item.destinationRoom !== filters.destinationRoom) {
    return false;
  }
  return true;
}

function rowsForExport({
  type,
  items,
  boxes,
  boxItems,
  resourceNameById,
  zoneNameById,
  visibility,
}: {
  type: ExportJobType;
  items: Doc<"items">[];
  boxes: Doc<"boxes">[];
  boxItems: Doc<"boxItems">[];
  resourceNameById: Map<Id<"transportResources">, string>;
  zoneNameById: Map<Id<"transportZones">, string>;
  visibility: ExportVisibility;
}) {
  switch (type) {
    case "inventory":
    case "documentationProfile":
      return inventoryCsvRows(items, visibility);
    case "boxes":
      return boxCsvRows(
        boxes.map((box) => ({
          ...box,
          assignedResource: box.assignedResourceId
            ? resourceNameById.get(box.assignedResourceId)
            : undefined,
          assignedZone: box.assignedZoneId ? zoneNameById.get(box.assignedZoneId) : undefined,
        }))
      );
    case "assignments":
      return assignmentCsvRows(
        boxes.map((box) => ({
          boxCode: box.code,
          boxLabel: box.label,
          boxStatus: box.status,
          assignedResource: box.assignedResourceId
            ? resourceNameById.get(box.assignedResourceId)
            : undefined,
          assignedZone: box.assignedZoneId ? zoneNameById.get(box.assignedZoneId) : undefined,
          itemCount: boxItems
            .filter((membership) => membership.boxId === box._id)
            .reduce((total, membership) => total + membership.quantity, 0),
          estimatedWeightLb: box.actualWeightLb ?? box.estimatedWeightLb,
        }))
      );
  }
}

function movePatch(body: unknown): Partial<Doc<"moves">> {
  const input = bodyObject(body);
  const patch: Partial<Doc<"moves">> = { updatedAt: Date.now() };
  if (input.title !== undefined) patch.title = String(input.title).trim();
  if (input.status !== undefined) patch.status = parseMoveStatus(input.status);
  if (input.origin !== undefined) patch.origin = normalizeOptionalText(asString(input.origin));
  if (input.destination !== undefined) {
    patch.destination = normalizeOptionalText(asString(input.destination));
  }
  if (input.dateStart !== undefined) patch.dateStart = normalizeOptionalText(asString(input.dateStart));
  if (input.dateEnd !== undefined) patch.dateEnd = normalizeOptionalText(asString(input.dateEnd));
  return patch;
}

function itemPatch(body: unknown, userId: Id<"users">): Partial<Doc<"items">> {
  const input = bodyObject(body);
  const patch: Partial<Doc<"items">> = {
    updatedByUserId: userId,
    updatedAt: Date.now(),
  };
  if (input.name !== undefined) {
    const name = normalizeItemName(String(input.name));
    patch.name = name;
    patch.normalizedName = normalizedSearchName(name);
  }
  if (input.description !== undefined) {
    patch.description = normalizeOptionalText(asString(input.description));
  }
  if (input.room !== undefined) patch.room = normalizeOptionalText(asString(input.room));
  if (input.destinationRoom !== undefined) {
    patch.destinationRoom = normalizeOptionalText(asString(input.destinationRoom));
  }
  if (input.category !== undefined) {
    patch.category = normalizeOptionalText(asString(input.category));
  }
  if (input.disposition !== undefined) patch.disposition = parseDisposition(input.disposition);
  if (input.status !== undefined) patch.status = parseItemStatus(input.status);
  if (input.quantity !== undefined) patch.quantity = positiveNumber(input.quantity) ?? 1;
  if (input.condition !== undefined) patch.condition = parseCondition(input.condition);
  if (input.valueCents !== undefined) patch.valueCents = optionalNumber(input.valueCents);
  if (input.replacementValueCents !== undefined) {
    patch.replacementValueCents = optionalNumber(input.replacementValueCents);
  }
  if (input.serialNumber !== undefined) {
    patch.serialNumber = normalizeOptionalText(asString(input.serialNumber));
  }
  if (input.modelNumber !== undefined) {
    patch.modelNumber = normalizeOptionalText(asString(input.modelNumber));
  }
  if (input.highValue !== undefined) patch.highValue = Boolean(input.highValue);
  if (input.needsReview !== undefined) patch.needsReview = Boolean(input.needsReview);
  return patch;
}

function boxPatch(body: unknown): Partial<Doc<"boxes">> {
  const input = bodyObject(body);
  const patch: Partial<Doc<"boxes">> = { updatedAt: Date.now() };
  if (input.code !== undefined) patch.code = normalizeBoxCode(String(input.code));
  if (input.label !== undefined) patch.label = normalizeOptionalText(asString(input.label));
  if (input.room !== undefined) patch.room = normalizeOptionalText(asString(input.room));
  if (input.destinationRoom !== undefined) {
    patch.destinationRoom = normalizeOptionalText(asString(input.destinationRoom));
  }
  if (input.description !== undefined) {
    patch.description = normalizeOptionalText(asString(input.description));
  }
  if (input.status !== undefined) patch.status = parseBoxStatus(input.status);
  if (input.estimatedWeightLb !== undefined) {
    patch.estimatedWeightLb = optionalNumber(input.estimatedWeightLb);
  }
  if (input.actualWeightLb !== undefined) {
    patch.actualWeightLb = optionalNumber(input.actualWeightLb);
  }
  if (input.estimatedVolumeCuFt !== undefined) {
    patch.estimatedVolumeCuFt = optionalNumber(input.estimatedVolumeCuFt);
  }
  return patch;
}

async function auditApiWrite(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  action: string,
  objectTable: string,
  objectId: string,
  metadata?: Record<string, unknown>
) {
  await recordAuditEvent(ctx, {
    householdId: auth.householdId,
    moveId,
    actorType: "apiKey",
    actorApiKeyId: auth.actor.apiKeyId,
    category: "apiKey",
    action,
    objectTable,
    objectId,
    metadata,
  });
}

function bodyObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  return body as Record<string, unknown>;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positiveNumber(value: unknown) {
  const number = optionalNumber(value);
  return number && number > 0 ? number : undefined;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseMoveStatus(value: unknown) {
  return includesLiteral(restMoveStatuses, value)
    ? (value as Doc<"moves">["status"])
    : undefined;
}

function parseItemStatus(value: unknown) {
  return includesLiteral(itemStatuses, value)
    ? (value as Doc<"items">["status"])
    : undefined;
}

function parseDisposition(value: unknown) {
  return includesLiteral(itemDispositions, value)
    ? (value as Doc<"items">["disposition"])
    : undefined;
}

function parseCondition(value: unknown) {
  return includesLiteral(itemConditions, value)
    ? (value as Doc<"items">["condition"])
    : undefined;
}

function parseBoxStatus(value: unknown) {
  return includesLiteral(boxStatuses, value)
    ? (value as Doc<"boxes">["status"])
    : undefined;
}

function parseExportJobType(value: unknown) {
  return includesLiteral(restExportJobTypes, value)
    ? (value as ExportJobType)
    : undefined;
}

function capacityPercent({
  used,
  max,
  unlimited,
}: {
  used: number;
  max?: number;
  unlimited?: boolean;
}) {
  return max && !unlimited ? roundEstimate((used / max) * 100) : undefined;
}

function includesLiteral(values: readonly string[], value: unknown) {
  return typeof value === "string" && values.includes(value);
}

function errorStatus(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("invalid api key") || message.includes("bearer")) return 401;
  if (message.includes("not allowed") || message.includes("scope")) return 403;
  if (message.includes("not found")) return 404;
  if (message.includes("idempotency")) return 409;
  return 400;
}
