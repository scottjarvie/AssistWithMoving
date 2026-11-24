import type {
  Doc,
  Id,
} from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { authenticateApiKey } from "../lib/apiKeyAuth";
import {
  requiresOverrideReason,
  validateAssignment,
} from "../lib/assignmentValidation";
import {
  boxVolumeCuFt,
  estimateItem,
  sumEstimateValues,
} from "../lib/estimateEngine";
import {
  normalizeBoxCode,
  normalizeOptionalText,
} from "../lib/moveFields";
import { suggestAssignmentForBox } from "../lib/planningSuggestions";
import {
  bodyRecord as bodyObject,
  paginate,
  restError,
  restOk,
  type RestRequestInput,
} from "../lib/rest/core";
import {
  requireApiItem,
  requireApiBox,
  requireApiTransportResource,
  requireApiTransportZone,
} from "../lib/rest/require";
import { safeBox } from "../lib/rest/safe";
import { boxPatch } from "../lib/rest/patch";
import { auditApiWrite } from "../lib/rest/audit";
import {
  optionalNumber,
  positiveNumber,
  boundedInteger,
  asString,
  optionalString,
  parseBoxStatus,
} from "../lib/rest/parse";

export async function findApiBoxByCode(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  code: string
) {
  const boxes = await ctx.db
    .query("boxes")
    .withIndex("by_move_code", (q) => q.eq("moveId", moveId).eq("code", code))
    .collect();
  return (
    boxes.find((box) => box.householdId === householdId && !box.archivedAt) ??
    null
  );
}

export function normalizeOptionalBoxCode(code: unknown) {
  const value = optionalString(code);
  return value ? normalizeBoxCode(value) : undefined;
}

export async function assertUniqueApiBoxCode(
  ctx: MutationCtx,
  {
    householdId,
    moveId,
    code,
    currentBoxId,
  }: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    code: unknown;
    currentBoxId?: Id<"boxes">;
  }
) {
  const normalizedCode = normalizeOptionalBoxCode(code);
  if (!normalizedCode) {
    return;
  }

  const matches = await ctx.db
    .query("boxes")
    .withIndex("by_move_code", (q) =>
      q.eq("moveId", moveId).eq("code", normalizedCode)
    )
    .collect();
  const conflict = matches.find(
    (box) =>
      box.householdId === householdId &&
      !box.archivedAt &&
      box._id !== currentBoxId
  );
  if (!conflict) {
    return;
  }

  throw new Error(
    `Box code "${normalizedCode}" already exists for this move. Update the existing box instead of creating a duplicate.`
  );
}

export async function assertRestBoxAssignmentRefs(
  ctx: MutationCtx,
  householdId: Id<"households">,
  moveId: Id<"moves">,
  refs: {
    assignedResourceId?: Id<"transportResources">;
    assignedZoneId?: Id<"transportZones">;
  }
) {
  if (!refs.assignedResourceId && !refs.assignedZoneId) {
    return;
  }
  if (!refs.assignedResourceId) {
    throw new Error("assignedResourceId is required when assignedZoneId is provided.");
  }
  const resource = await requireApiTransportResource(
    ctx,
    householdId,
    moveId,
    refs.assignedResourceId
  );
  const zone = refs.assignedZoneId
    ? await requireApiTransportZone(ctx, householdId, moveId, refs.assignedZoneId)
    : null;
  if (zone && zone.resourceId !== resource._id) {
    throw new Error("Zone does not belong to the assigned resource.");
  }
}

export async function applyRestBoxAssignmentValidation(
  ctx: MutationCtx,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  existing: Doc<"boxes">,
  patch: Partial<Doc<"boxes">>
) {
  const assignedResourceId = patch.assignedResourceId ?? existing.assignedResourceId;
  const assignedZoneId = patch.assignedZoneId ?? existing.assignedZoneId;
  if (!assignedResourceId && !assignedZoneId) {
    return;
  }
  await assertRestBoxAssignmentRefs(ctx, auth.householdId, moveId, {
    assignedResourceId,
    assignedZoneId,
  });
  if (!assignedResourceId) {
    return;
  }
  const nextBox = { ...existing, ...patch } as Doc<"boxes">;
  const validation = await validateApiBoxAssignment(ctx, {
    householdId: auth.householdId,
    moveId,
    box: nextBox,
    assignedResourceId,
    assignedZoneId,
    overrideReason: patch.assignmentOverrideReason ?? existing.assignmentOverrideReason,
  });
  patch.assignmentWarnings = validation.softWarnings;
  patch.assignmentHardBlocks = validation.hardBlocks;
  patch.assignmentValidatedAt = Date.now();
}

export async function routeBoxes(
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

export async function archiveApiAssignment(ctx: MutationCtx, auth: Awaited<ReturnType<typeof authenticateApiKey>>, assignment: Doc<"boxItems">) {
  const { _id, _creationTime, ...source } = assignment; void _creationTime;
  const archiveId = await ctx.db.insert("archivedBoxAssignments", { householdId: assignment.householdId, moveId: assignment.moveId, originalAssignmentId: _id, source, archivedAt: Date.now(), archivedByUserId: auth.createdByUserId, archivedByApiKeyId: auth.apiKeyId });
  // The full source has moved into durable Archive, including notes and quantity.
  await ctx.db.delete(_id);
  return archiveId;
}

export async function routeAssignments(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">,
  assignmentIdSegment?: string,
  actionSegment?: string
) {
  if (args.method === "GET" && args.query.archived === "true") {
    const page = await ctx.db.query("archivedBoxAssignments").withIndex("by_move_archived", q => q.eq("moveId", moveId)).order("desc").paginate({ numItems: 25, cursor: args.query.cursor ?? null });
    return restOk({ data: page.page.filter(row => row.householdId === auth.householdId).map(row => ({ archiveId: row._id, originalAssignmentId: row.originalAssignmentId, ...row.source, archivedAt: row.archivedAt, actor: "Your AI", restoredAt: row.restoredAt ?? null })), nextCursor: page.isDone ? null : page.continueCursor });
  }
  if (args.method === "POST" && assignmentIdSegment && actionSegment === "restore") {
    const id = ctx.db.normalizeId("archivedBoxAssignments", assignmentIdSegment);
    const archived = id ? await ctx.db.get(id) : null;
    if (!archived || archived.householdId !== auth.householdId || archived.moveId !== moveId) throw new Error("Archived assignment not found.");
    if (archived.restoredAssignmentId) return restOk({ data: { assignmentId: archived.restoredAssignmentId, restored: true } });
    await requireApiBox(ctx, auth.householdId, moveId, archived.source.boxId);
    await requireApiItem(ctx, auth.householdId, moveId, archived.source.itemId);
    const existing = await ctx.db.query("boxItems").withIndex("by_item", q => q.eq("itemId", archived.source.itemId)).collect();
    if (existing.some(row => row.moveId === moveId)) throw new Error("An assignment already exists. Review it before restoring this archived assignment.");
    const assignmentId = await ctx.db.insert("boxItems", { ...archived.source, updatedAt: Date.now() });
    await ctx.db.patch(archived._id, { restoredAssignmentId: assignmentId, restoredAt: Date.now() });
    await auditApiWrite(ctx, auth, moveId, "assignment.api_restored", "boxItems", assignmentId, { archiveId: archived._id });
    return restOk({ data: { assignmentId, restored: true } });
  }

  if (args.method === "POST" && assignmentIdSegment === "suggest") {
    return await routeAssignmentSuggestions(ctx, args, auth, moveId);
  }

  if (args.method === "POST" && assignmentIdSegment === "apply") {
    return await routeApplyAssignments(ctx, args, auth, moveId);
  }

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
    const archiveId = await archiveApiAssignment(ctx, auth, assignment);
    await auditApiWrite(
      ctx,
      auth,
      moveId,
      "assignment.api_archived",
      "boxItems",
      assignmentId
    );
    return restOk({ data: { deleted: true, archived: true, archiveId } });
  }

  return restError({
    status: 404,
    code: "not_found",
    message: "Assignment route not found.",
  });
}

async function routeAssignmentSuggestions(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const body = bodyObject(args.body);
  const limit = boundedInteger(body.limit, 1, 100, 50);
  const [boxes, resources, zones] = await Promise.all([
    ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", moveId))
      .order("desc")
      .collect(),
    ctx.db
      .query("transportResources")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect(),
    ctx.db
      .query("transportZones")
      .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
      .collect(),
  ]);
  const activeBoxes = boxes.filter(
    (box) => box.householdId === auth.householdId && !box.archivedAt
  );
  const activeResources = resources.filter(
    (resource) => resource.householdId === auth.householdId && !resource.archivedAt
  );
  const activeZones = zones.filter(
    (zone) => zone.householdId === auth.householdId && !zone.archivedAt
  );
  const suggestions = [];

  for (const box of activeBoxes) {
    if (suggestions.length >= limit) break;
    const loadableBox = await loadableApiBoxFor(ctx, box);
    const suggestion = suggestAssignmentForBox({
      box: {
        ...loadableBox,
        boxId: box._id,
        code: box.code,
        assignedResourceId: box.assignedResourceId,
        assignmentLocked: box.assignmentLocked,
      },
      resources: activeResources.map((resource) => ({
        resourceId: resource._id,
        type: resource.type,
        name: resource.name,
        capacity: resource.capacity,
      })),
      zones: activeZones.map((zone) => ({
        zoneId: zone._id,
        resourceId: zone.resourceId,
        name: zone.name,
        capacity: zone.capacity,
      })),
    });
    if (suggestion) {
      suggestions.push(suggestion);
    }
  }

  return restOk({
    data: {
      suggestions,
      counts: {
        boxesConsidered: activeBoxes.length,
        resourcesConsidered: activeResources.length,
        zonesConsidered: activeZones.length,
        suggestions: suggestions.length,
      },
      generatedAt: Date.now(),
    },
  });
}

async function routeApplyAssignments(
  ctx: MutationCtx,
  args: RestRequestInput,
  auth: Awaited<ReturnType<typeof authenticateApiKey>>,
  moveId: Id<"moves">
) {
  const body = bodyObject(args.body);
  const dryRun = Boolean(body.dryRun);
  const rows = Array.isArray(body.assignments) ? body.assignments : [];
  if (!rows.length) {
    return restError({
      status: 400,
      code: "invalid_assignments",
      message: "assignments must include at least one row.",
    });
  }
  if (rows.length > 100) {
    return restError({
      status: 400,
      code: "batch_too_large",
      message: "Assignment apply requests are limited to 100 rows.",
    });
  }

  const results = [];
  for (const [index, row] of rows.entries()) {
    const input = bodyObject(row);
    const boxId = optionalString(input.boxId);
    const assignedResourceId = optionalString(input.assignedResourceId);
    const assignedZoneId = optionalString(input.assignedZoneId);
    const overrideReason = normalizeOptionalText(asString(input.overrideReason));
    try {
      if (!boxId) throw new Error("boxId is required.");
      if (!assignedResourceId) throw new Error("assignedResourceId is required.");
      const box = await requireApiBox(ctx, auth.householdId, moveId, boxId);
      if (box.assignmentLocked) {
        throw new Error("Locked assignments must be changed manually.");
      }
      const validation = await validateApiBoxAssignment(ctx, {
        householdId: auth.householdId,
        moveId,
        box,
        assignedResourceId,
        assignedZoneId,
        overrideReason,
      });
      if (!dryRun) {
        await ctx.db.patch(box._id, {
          assignedResourceId: assignedResourceId as Id<"transportResources">,
          assignedZoneId: assignedZoneId as Id<"transportZones"> | undefined,
          assignmentOverrideReason: overrideReason,
          assignmentWarnings: validation.softWarnings,
          assignmentHardBlocks: validation.hardBlocks,
          assignmentValidatedAt: Date.now(),
          updatedAt: Date.now(),
        });
        await auditApiWrite(
          ctx,
          auth,
          moveId,
          "assignment.api_applied",
          "boxes",
          box._id,
          {
            rowIndex: index,
            assignedResourceId,
            assignedZoneId,
            warningCount: validation.softWarnings.length,
          }
        );
      }
      results.push({
        index,
        ok: true,
        boxId: box._id,
        assignedResourceId,
        assignedZoneId: assignedZoneId || undefined,
        assignmentWarnings: validation.softWarnings,
        assignmentHardBlocks: validation.hardBlocks,
        dryRun,
      });
    } catch (error) {
      results.push({
        index,
        ok: false,
        boxId: boxId || undefined,
        assignedResourceId: assignedResourceId || undefined,
        assignedZoneId: assignedZoneId || undefined,
        error: error instanceof Error ? error.message : "Assignment failed.",
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
        succeeded: rows.length - failed,
        failed,
        results,
      },
    },
    failed > 0 ? 207 : 200
  );
}

async function loadableApiBoxFor(ctx: MutationCtx, box: Doc<"boxes">) {
  const memberships = await ctx.db
    .query("boxItems")
    .withIndex("by_box", (q) => q.eq("boxId", box._id))
    .collect();
  const contents = await Promise.all(
    memberships.map(async (membership) => {
      const item = await ctx.db.get(membership.itemId);
      return item && !item.deletedAt ? { item, membership } : null;
    })
  );
  const activeContents = contents.filter(
    (entry): entry is { item: Doc<"items">; membership: Doc<"boxItems"> } =>
      Boolean(entry)
  );
  const contentEstimates = activeContents.map(({ item, membership }) =>
    estimateItem({ ...item, quantity: membership.quantity })
  );
  const contentsWeight = sumEstimateValues(
    contentEstimates.map((estimate) => estimate.weight)
  );
  const contentsVolume = sumEstimateValues(
    contentEstimates.map((estimate) => estimate.volume)
  );

  return {
    estimatedWeightLb: box.actualWeightLb ?? box.estimatedWeightLb ?? contentsWeight,
    estimatedVolumeCuFt: boxVolumeCuFt(box) ?? contentsVolume,
    dimensionsIn: box.dimensionsIn,
    itemCount: activeContents.reduce(
      (sum, entry) => sum + entry.membership.quantity,
      0
    ),
    hasFragile: activeContents.some((entry) => entry.item.fragility === "high"),
    hasHighValue: activeContents.some((entry) => entry.item.highValue),
    hasSensitive: activeContents.some((entry) =>
      entry.item.planningDefaultKeys.includes("sensitive")
    ),
    hasPersonalTransport: activeContents.some(
      (entry) => entry.item.requiresPersonalTransport
    ),
    hasHazardous: activeContents.some((entry) => entry.item.hazardousFlag),
  };
}

async function validateApiBoxAssignment(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    box: Doc<"boxes">;
    assignedResourceId: string;
    assignedZoneId?: string;
    overrideReason?: string;
  }
) {
  const resource = await requireApiTransportResource(
    ctx,
    args.householdId,
    args.moveId,
    args.assignedResourceId
  );
  const zone = args.assignedZoneId
    ? await requireApiTransportZone(
        ctx,
        args.householdId,
        args.moveId,
        args.assignedZoneId
      )
    : null;
  if (zone && zone.resourceId !== resource._id) {
    throw new Error("Zone does not belong to the assigned resource.");
  }
  const loadableBox = await loadableApiBoxFor(ctx, args.box);
  const validation = validateAssignment({
    box: loadableBox,
    target: {
      resourceType: resource.type,
      capacity: mergeCapacity(resource.capacity, zone?.capacity),
    },
  });
  if (validation.hardBlocks.length) {
    throw new Error(`Assignment blocked: ${validation.hardBlocks.join(", ")}`);
  }
  if (requiresOverrideReason(validation) && !args.overrideReason) {
    throw new Error("Assignment warnings require an override reason.");
  }
  return validation;
}

function mergeCapacity(
  resourceCapacity: Doc<"transportResources">["capacity"],
  zoneCapacity?: Doc<"transportZones">["capacity"]
) {
  if (!zoneCapacity) {
    return resourceCapacity;
  }

  return {
    maxWeightLb: minOptional(
      resourceCapacity.maxWeightLb,
      zoneCapacity.maxWeightLb
    ),
    maxVolumeCuFt: minOptional(
      resourceCapacity.maxVolumeCuFt,
      zoneCapacity.maxVolumeCuFt
    ),
    maxItemCount: minOptional(
      resourceCapacity.maxItemCount,
      zoneCapacity.maxItemCount
    ),
    dimensions: {
      lengthIn: minOptional(
        resourceCapacity.dimensions?.lengthIn,
        zoneCapacity.dimensions?.lengthIn
      ),
      widthIn: minOptional(
        resourceCapacity.dimensions?.widthIn,
        zoneCapacity.dimensions?.widthIn
      ),
      heightIn: minOptional(
        resourceCapacity.dimensions?.heightIn,
        zoneCapacity.dimensions?.heightIn
      ),
    },
    weightIsUnlimited:
      resourceCapacity.weightIsUnlimited === true &&
      zoneCapacity.weightIsUnlimited === true,
    volumeIsUnlimited:
      resourceCapacity.volumeIsUnlimited === true &&
      zoneCapacity.volumeIsUnlimited === true,
  };
}

function minOptional(first?: number, second?: number) {
  if (typeof first !== "number") return second;
  if (typeof second !== "number") return first;
  return Math.min(first, second);
}
