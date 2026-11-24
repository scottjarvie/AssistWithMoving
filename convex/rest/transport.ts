import type {
  Doc,
  Id,
} from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { authenticateApiKey } from "../lib/apiKeyAuth";
import { resolveBoxWeight } from "../lib/boxWeight";
import {
  boxVolumeCuFt,
  estimateItem,
  finitePercent,
  roundEstimate,
  sumEstimateValues,
} from "../lib/estimateEngine";
import {
  normalizeOptionalText,
  normalizeRuleList,
  normalizeSortOrder,
} from "../lib/moveFields";
import { getTransportResourcePreset } from "../lib/transportPresets";
import {
  bodyRecord as bodyObject,
  paginate,
  restError,
  restOk,
  type RestRequestInput,
} from "../lib/rest/core";
import {
  requireApiTransportResource,
  requireApiTransportZone,
} from "../lib/rest/require";
import {
  safeTransportResource,
  safeTransportZone,
} from "../lib/rest/safe";
import {
  transportResourcePatch,
  transportZonePatch,
} from "../lib/rest/patch";
import { auditApiWrite } from "../lib/rest/audit";
import {
  optionalNumber,
  asString,
  optionalString,
  parseTransportResourceType,
  parseTransportResourcePresetKey,
  parseCapacityReviewStatus,
  parseCapacity,
  parseStringArray,
} from "../lib/rest/parse";

export async function routeCapacityReport(
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
    const weightSummary = resolveBoxWeight({
      actualWeightLb: box.actualWeightLb,
      estimatedWeightLb: box.estimatedWeightLb,
      contentsEstimatedWeightLb: contentsWeight,
    });
    const estimatedWeightLb = weightSummary.valueLb ?? 0;
    const estimatedVolumeCuFt = boxVolumeCuFt(box) ?? contentsVolume;
    const warnings: string[] = [];
    if (weightSummary.source === "missing") {
      warnings.push("missingBoxWeightEstimate");
    }
    if (boxVolumeCuFt(box) === undefined && contentsVolume === 0) {
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
      weightSource: weightSummary.source,
      weightSourceLabel: weightSummary.label,
      weightSummary,
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

export async function routeTransportResources(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  resourceIdSegment?: string,
  actionSegment?: string
) {
  if (actionSegment === "zones" && resourceIdSegment) {
    await requireApiTransportResource(
      ctx,
      auth.householdId,
      moveId,
      resourceIdSegment
    );
    if (args.method === "GET") {
      const zones = await ctx.db
        .query("transportZones")
        .withIndex("by_resource_sort", (q) =>
          q.eq("resourceId", resourceIdSegment as Id<"transportResources">)
        )
        .collect();
      return restOk(
        paginate(
          zones
            .filter((zone) => zone.householdId === auth.householdId)
            .filter((zone) => !zone.archivedAt)
            .map((zone) => safeTransportZone(zone)),
          args.query
        )
      );
    }
    if (args.method === "POST") {
      const body = bodyObject(args.body);
      const zoneId = await createApiTransportZone(ctx, auth, moveId, {
        ...body,
        resourceId: resourceIdSegment,
      });
      const zone = await ctx.db.get(zoneId);
      await auditApiWrite(
        ctx,
        auth,
        moveId,
        "transport_zone.api_created",
        "transportZones",
        zoneId,
        { resourceId: resourceIdSegment, name: zone?.name }
      );
      return restOk({ data: { zone: zone ? safeTransportZone(zone) : { zoneId } } }, 201);
    }
  }

  if (args.method === "GET" && !resourceIdSegment) {
    const resources = await ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect();
    return restOk(
      paginate(
        resources
          .filter((entry) => entry.householdId === auth.householdId)
          .filter((entry) => !entry.archivedAt)
          .map((entry) => safeTransportResource(entry)),
        args.query
      )
    );
  }

  if (args.method === "GET" && resourceIdSegment && !actionSegment) {
    const resource = await requireApiTransportResource(
      ctx,
      auth.householdId,
      moveId,
      resourceIdSegment
    );
    return restOk({ data: safeTransportResource(resource) });
  }

  if (args.method === "POST" && !resourceIdSegment) {
    return await createApiTransportResource(ctx, args, auth, moveId);
  }

  if (args.method === "PATCH" && resourceIdSegment && !actionSegment) {
    const resource = await requireApiTransportResource(
      ctx,
      auth.householdId,
      moveId,
      resourceIdSegment
    );
    const patch = transportResourcePatch(args.body, auth);
    await ctx.db.patch(resource._id, patch);
    const updated = await ctx.db.get(resource._id);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "transport_resource.api_updated",
      "transportResources",
      resource._id,
      { changedKeys: Object.keys(patch) }
    );
    return restOk({
      data: updated ? safeTransportResource(updated) : { resourceId: resource._id },
    });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Resource route not found.",
  });
}

export async function routeTransportZones(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  zoneIdSegment?: string
) {
  if (args.method === "GET" && !zoneIdSegment) {
    const zones = await ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect();
    return restOk(
      paginate(
        zones
          .filter((entry) => entry.householdId === auth.householdId)
          .filter((entry) => !entry.archivedAt)
          .map((entry) => safeTransportZone(entry)),
        args.query
      )
    );
  }

  if (args.method === "GET" && zoneIdSegment) {
    const zone = await requireApiTransportZone(
      ctx,
      auth.householdId,
      moveId,
      zoneIdSegment
    );
    return restOk({ data: safeTransportZone(zone) });
  }

  if (args.method === "POST" && !zoneIdSegment) {
    const zoneId = await createApiTransportZone(
      ctx,
      auth,
      moveId,
      bodyObject(args.body)
    );
    const zone = await ctx.db.get(zoneId);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "transport_zone.api_created",
      "transportZones",
      zoneId,
      { resourceId: zone?.resourceId, name: zone?.name }
    );
    return restOk({ data: { zone: zone ? safeTransportZone(zone) : { zoneId } } }, 201);
  }

  if (args.method === "PATCH" && zoneIdSegment) {
    const zone = await requireApiTransportZone(
      ctx,
      auth.householdId,
      moveId,
      zoneIdSegment
    );
    const patch = await transportZonePatch(ctx, auth.householdId, moveId, args.body);
    await ctx.db.patch(zone._id, patch);
    const updated = await ctx.db.get(zone._id);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "transport_zone.api_updated",
      "transportZones",
      zone._id,
      { changedKeys: Object.keys(patch) }
    );
    return restOk({ data: updated ? safeTransportZone(updated) : { zoneId: zone._id } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Zone route not found.",
  });
}

export async function findApiTransportResourceByName(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  name: string,
) {
  const normalized = name.trim().toLowerCase();
  const resources = await ctx.db
    .query("transportResources")
    .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
    .collect();
  return (
    resources.find(
      (resource) =>
        resource.householdId === householdId &&
        !resource.archivedAt &&
        resource.name.trim().toLowerCase() === normalized,
    ) ?? null
  );
}

export async function findApiTransportZoneByName(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  resourceId: Id<"transportResources">,
  name: string,
) {
  const normalized = name.trim().toLowerCase();
  const zones = await ctx.db
    .query("transportZones")
    .withIndex("by_resource_sort", (q) => q.eq("resourceId", resourceId))
    .collect();
  return (
    zones.find(
      (zone) =>
        zone.householdId === householdId &&
        zone.moveId === moveId &&
        !zone.archivedAt &&
        zone.name.trim().toLowerCase() === normalized,
    ) ?? null
  );
}

async function createApiTransportResource(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const body = bodyObject(args.body);
  const presetKey = parseTransportResourcePresetKey(body.presetKey);
  const now = Date.now();

  if (presetKey) {
    const preset = getTransportResourcePreset(presetKey);
    const resourceId = await ctx.db.insert("transportResources", {
      householdId: auth.householdId,
      moveId,
      type: preset.type,
      name: normalizeOptionalText(asString(body.name)) ?? preset.name,
      description: normalizeOptionalText(asString(body.description)) ?? preset.description,
      capacity: parseCapacity(body.capacity) ?? preset.capacity,
      capacityReviewStatus:
        parseCapacityReviewStatus(body.capacityReviewStatus) ?? "unreviewed",
      capacityNotes: normalizeOptionalText(asString(body.capacityNotes)),
      rules: normalizeRuleList(parseStringArray(body.rules) ?? preset.rules),
      sortOrder: normalizeSortOrder(optionalNumber(body.sortOrder)),
      createdByUserId: auth.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
    const zoneIds = [];
    for (const [index, zone] of preset.zones.entries()) {
      zoneIds.push(
        await ctx.db.insert("transportZones", {
          householdId: auth.householdId,
          moveId,
          resourceId,
          name: zone.name,
          description: zone.description,
          capacity: {},
          preferredTags: normalizeRuleList(zone.preferredTags ?? []),
          sortOrder: now + index,
          createdByUserId: auth.createdByUserId,
          createdAt: now,
          updatedAt: now,
        })
      );
    }
    const [resource, zones] = await Promise.all([
      ctx.db.get(resourceId),
      Promise.all(zoneIds.map((zoneId) => ctx.db.get(zoneId))),
    ]);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "transport_resource.api_preset_created",
      "transportResources",
      resourceId,
      { presetKey, type: preset.type, zoneCount: zoneIds.length }
    );
    return restOk(
      {
        data: {
          resource: resource ? safeTransportResource(resource) : { resourceId },
          zones: zones
            .filter((zone): zone is Doc<"transportZones"> => Boolean(zone))
            .map((zone) => safeTransportZone(zone)),
        },
      },
      201
    );
  }

  const type = parseTransportResourceType(body.type);
  if (!type) {
    throw new Error("type is required unless presetKey is provided.");
  }
  const name = normalizeOptionalText(asString(body.name));
  if (!name) {
    throw new Error("name is required.");
  }
  const resourceId = await ctx.db.insert("transportResources", {
    householdId: auth.householdId,
    moveId,
    type,
    name,
    description: normalizeOptionalText(asString(body.description)),
    capacity: parseCapacity(body.capacity) ?? {},
    capacityReviewStatus:
      parseCapacityReviewStatus(body.capacityReviewStatus) ?? "unreviewed",
    capacityNotes: normalizeOptionalText(asString(body.capacityNotes)),
    rules: normalizeRuleList(parseStringArray(body.rules) ?? []),
    sortOrder: normalizeSortOrder(optionalNumber(body.sortOrder)),
    createdByUserId: auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });
  const resource = await ctx.db.get(resourceId);
  await auditApiWrite(
    ctx,
    auth,
    moveId,
    "transport_resource.api_created",
    "transportResources",
    resourceId,
    { type, name }
  );
  return restOk(
    { data: { resource: resource ? safeTransportResource(resource) : { resourceId } } },
    201
  );
}

async function createApiTransportZone(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  body: Record<string, unknown>
) {
  const resourceId = optionalString(body.resourceId);
  if (!resourceId) {
    throw new Error("resourceId is required.");
  }
  await requireApiTransportResource(ctx, auth.householdId, moveId, resourceId);
  const name = normalizeOptionalText(asString(body.name));
  if (!name) {
    throw new Error("name is required.");
  }
  const now = Date.now();
  return await ctx.db.insert("transportZones", {
    householdId: auth.householdId,
    moveId,
    resourceId: resourceId as Id<"transportResources">,
    name,
    description: normalizeOptionalText(asString(body.description)),
    capacity: parseCapacity(body.capacity) ?? {},
    preferredTags: normalizeRuleList(parseStringArray(body.preferredTags) ?? []),
    sortOrder: normalizeSortOrder(optionalNumber(body.sortOrder)),
    createdByUserId: auth.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });
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
  // finitePercent guards against a NaN/Infinity `used` (missing weight/volume)
  // or a zero/unset max — never returns a non-finite value a query would 500 on.
  return finitePercent(used, max, unlimited);
}
