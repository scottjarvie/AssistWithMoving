// Shared internal helper for UI batch-assignment mutations (boxes.batchUpdate,
// items.batchUpdate, movableUnits.batchAssign). It mirrors the semantics of the
// REST routeApplyAssignments handler (per-row try/catch, dryRun, aggregated
// {total, succeeded, failed, results}) but is a Convex-internal helper — it does
// NOT add or change any REST route or public contract.
//
// Load validation is single-sourced: box rows and item rows both flow through
// validateAssignment + requiresOverrideReason (the same functions boxes.update
// and items.update use). The only addition is trip / trip-space resolution: when
// a trip-space is set we fold its weight + area limits into the capacity passed
// to validateAssignment (via tripSpaceToCapacity), and we always derive and write
// assignedResourceId from the trip's parent resource so existing roll-ups
// (by_assigned_resource, capacity reports, MCP get_capacity_report) keep working.

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { recordAuditEvent } from "./audit";
import {
  requiresOverrideReason,
  tripSpaceToCapacity,
  validateAssignment,
  type Capacity,
} from "./assignmentValidation";
import { estimateItem, sumEstimateValues } from "./estimateEngine";
import { normalizeOptionalText } from "./moveFields";

export type BatchAssignTarget = {
  assignedResourceId?: Id<"transportResources">;
  assignedZoneId?: Id<"transportZones">;
  assignedTripId?: Id<"transportTrips">;
  assignedTripSpaceId?: Id<"tripSpaces">;
  clearAssignment?: boolean;
  assignmentOverrideReason?: string;
};

export type BatchAssignRow =
  | { kind: "box"; recordId: Id<"boxes"> }
  | { kind: "item"; recordId: Id<"items"> };

export type BatchAssignRowResult = {
  index: number;
  ok: boolean;
  kind: "box" | "item";
  recordId?: string;
  assignmentWarnings?: string[];
  assignmentHardBlocks?: string[];
  error?: string;
  dryRun: boolean;
};

export type BatchAssignResult = {
  dryRun: boolean;
  total: number;
  succeeded: number;
  failed: number;
  results: BatchAssignRowResult[];
};

export const BATCH_ASSIGN_MAX_ROWS = 100;

const LOCKED_MESSAGE = "Locked assignments must be changed manually.";

function minOptional(first?: number, second?: number) {
  if (typeof first !== "number") return second;
  if (typeof second !== "number") return first;
  return Math.min(first, second);
}

// Merge resource + zone capacity exactly like boxes.ts / items.ts mergeCapacity,
// then fold a trip-space's weight + area limits on top (the tightest wins).
function mergeCapacity(
  resourceCapacity: Doc<"transportResources">["capacity"],
  zoneCapacity?: Doc<"transportZones">["capacity"],
  spaceCapacity?: Capacity,
): Capacity {
  const base: Capacity = zoneCapacity
    ? {
        maxWeightLb: minOptional(
          resourceCapacity.maxWeightLb,
          zoneCapacity.maxWeightLb,
        ),
        maxVolumeCuFt: minOptional(
          resourceCapacity.maxVolumeCuFt,
          zoneCapacity.maxVolumeCuFt,
        ),
        maxItemCount: minOptional(
          resourceCapacity.maxItemCount,
          zoneCapacity.maxItemCount,
        ),
        dimensions: {
          lengthIn: minOptional(
            resourceCapacity.dimensions?.lengthIn,
            zoneCapacity.dimensions?.lengthIn,
          ),
          widthIn: minOptional(
            resourceCapacity.dimensions?.widthIn,
            zoneCapacity.dimensions?.widthIn,
          ),
          heightIn: minOptional(
            resourceCapacity.dimensions?.heightIn,
            zoneCapacity.dimensions?.heightIn,
          ),
        },
        weightIsUnlimited:
          resourceCapacity.weightIsUnlimited === true &&
          zoneCapacity.weightIsUnlimited === true,
        volumeIsUnlimited:
          resourceCapacity.volumeIsUnlimited === true &&
          zoneCapacity.volumeIsUnlimited === true,
      }
    : { ...resourceCapacity };

  if (!spaceCapacity) {
    return base;
  }
  return {
    ...base,
    maxWeightLb: minOptional(base.maxWeightLb, spaceCapacity.maxWeightLb),
    // Area only exists at the trip-space level today.
    maxAreaSqFt: spaceCapacity.maxAreaSqFt,
  };
}

// Resolve resource / zone / trip / tripSpace for a target and validate the
// hierarchy: tripSpace -> trip -> resource, zone -> resource, all -> move.
// Returns the effective resourceId (derived from a trip-space's parent trip when
// a trip-space is set) plus the resolved docs needed for capacity validation.
async function resolveTarget(
  ctx: MutationCtx,
  moveId: Id<"moves">,
  target: BatchAssignTarget,
): Promise<{
  resource: Doc<"transportResources">;
  zone: Doc<"transportZones"> | null;
  trip: Doc<"transportTrips"> | null;
  space: Doc<"tripSpaces"> | null;
  resourceId: Id<"transportResources">;
}> {
  const trip = target.assignedTripId
    ? await ctx.db.get(target.assignedTripId)
    : null;
  if (target.assignedTripId && (!trip || trip.moveId !== moveId || trip.archivedAt)) {
    throw new Error("Invalid trip.");
  }

  const space = target.assignedTripSpaceId
    ? await ctx.db.get(target.assignedTripSpaceId)
    : null;
  if (
    target.assignedTripSpaceId &&
    (!space || space.moveId !== moveId || space.archivedAt)
  ) {
    throw new Error("Invalid trip space.");
  }
  if (space && trip && space.tripId !== trip._id) {
    throw new Error("Trip space does not belong to the assigned trip.");
  }
  // A trip-space alone implies its parent trip.
  const effectiveTrip = trip ?? (space ? await ctx.db.get(space.tripId) : null);
  if (space && (!effectiveTrip || effectiveTrip.moveId !== moveId)) {
    throw new Error("Invalid trip for trip space.");
  }

  // Derive resourceId: explicit > trip's resource. A trip-space/trip pins it.
  const derivedResourceId =
    effectiveTrip?.resourceId ?? target.assignedResourceId;
  if (!derivedResourceId) {
    throw new Error("assignedResourceId is required.");
  }
  if (
    effectiveTrip &&
    target.assignedResourceId &&
    effectiveTrip.resourceId !== target.assignedResourceId
  ) {
    throw new Error("Trip does not belong to the assigned resource.");
  }

  const resource = await ctx.db.get(derivedResourceId);
  if (!resource || resource.moveId !== moveId || resource.archivedAt) {
    throw new Error("Invalid transport resource.");
  }

  const zone = target.assignedZoneId
    ? await ctx.db.get(target.assignedZoneId)
    : null;
  if (
    target.assignedZoneId &&
    (!zone ||
      zone.moveId !== moveId ||
      zone.resourceId !== derivedResourceId ||
      zone.archivedAt)
  ) {
    throw new Error("Invalid transport zone.");
  }

  return {
    resource,
    zone,
    trip: effectiveTrip ?? null,
    space,
    resourceId: derivedResourceId,
  };
}

function boxFootprintSqFt(box: Doc<"boxes">): number | undefined {
  const length = box.dimensionsIn?.lengthIn;
  const width = box.dimensionsIn?.widthIn;
  if (typeof length === "number" && typeof width === "number") {
    return (length * width) / 144;
  }
  return undefined;
}

async function loadBoxLoadable(
  ctx: MutationCtx,
  box: Doc<"boxes">,
): Promise<Parameters<typeof validateAssignment>[0]["box"]> {
  const memberships = await ctx.db
    .query("boxItems")
    .withIndex("by_box", (q) => q.eq("boxId", box._id))
    .collect();
  const contents = await Promise.all(
    memberships.map(async (membership) => {
      const item = await ctx.db.get(membership.itemId);
      return item && !item.deletedAt ? { item, membership } : null;
    }),
  );
  const activeContents = contents.filter(
    (entry): entry is { item: Doc<"items">; membership: Doc<"boxItems"> } =>
      Boolean(entry),
  );
  const contentEstimates = activeContents.map(({ item, membership }) =>
    estimateItem({ ...item, quantity: membership.quantity }),
  );
  const contentsWeight = sumEstimateValues(
    contentEstimates.map((estimate) => estimate.weight),
  );
  const contentsVolume = sumEstimateValues(
    contentEstimates.map((estimate) => estimate.volume),
  );
  return {
    estimatedWeightLb:
      box.actualWeightLb ?? box.estimatedWeightLb ?? contentsWeight,
    estimatedVolumeCuFt: box.estimatedVolumeCuFt ?? contentsVolume,
    footprintSqFt: boxFootprintSqFt(box),
    dimensionsIn: box.dimensionsIn,
    itemCount: activeContents.reduce(
      (sum, entry) => sum + entry.membership.quantity,
      0,
    ),
    hasFragile: activeContents.some((entry) => entry.item.fragility === "high"),
    hasHighValue: activeContents.some((entry) => entry.item.highValue),
    hasSensitive: activeContents.some((entry) =>
      entry.item.planningDefaultKeys.includes("sensitive"),
    ),
    hasPersonalTransport: activeContents.some(
      (entry) => entry.item.requiresPersonalTransport,
    ),
    hasHazardous: activeContents.some((entry) => entry.item.hazardousFlag),
  };
}

function itemFootprintSqFt(item: Doc<"items">): number | undefined {
  const length = item.dimensionsIn?.lengthIn;
  const width = item.dimensionsIn?.widthIn;
  if (typeof length === "number" && typeof width === "number") {
    return (length * width) / 144;
  }
  return undefined;
}

function itemLoadable(
  item: Doc<"items">,
): Parameters<typeof validateAssignment>[0]["box"] {
  const estimate = estimateItem(item);
  return {
    estimatedWeightLb: estimate.weight?.value ?? 0,
    estimatedVolumeCuFt: estimate.volume?.value ?? 0,
    footprintSqFt: itemFootprintSqFt(item),
    dimensionsIn: item.dimensionsIn,
    itemCount: item.quantity ?? 1,
    hasFragile: item.fragility === "high",
    hasHighValue: Boolean(item.highValue),
    hasSensitive: Boolean(item.planningDefaultKeys?.includes("sensitive")),
    hasPersonalTransport: Boolean(item.requiresPersonalTransport),
    hasHazardous: Boolean(item.hazardousFlag),
  };
}

type AssignmentWriteResult = {
  assignmentWarnings: string[];
  assignmentHardBlocks: string[];
  assignmentValidatedAt: number;
  patch: {
    assignedResourceId?: Id<"transportResources">;
    assignedZoneId?: Id<"transportZones">;
    assignedTripId?: Id<"transportTrips">;
    assignedTripSpaceId?: Id<"tripSpaces">;
    assignmentOverrideReason?: string;
    assignmentWarnings: string[];
    assignmentHardBlocks: string[];
    assignmentValidatedAt: number;
  };
};

// Core single-source assignment resolution used by both box and item rows.
// Validates through validateAssignment + requiresOverrideReason and returns the
// assignment fields to patch (including the derived assignedResourceId).
async function resolveAssignment(
  ctx: MutationCtx,
  moveId: Id<"moves">,
  target: BatchAssignTarget,
  loadable: Parameters<typeof validateAssignment>[0]["box"],
): Promise<AssignmentWriteResult> {
  const now = Date.now();
  const overrideReason = normalizeOptionalText(target.assignmentOverrideReason);

  // Clear-assignment path: drop every assignment field, no capacity check.
  if (target.clearAssignment) {
    return {
      assignmentWarnings: [],
      assignmentHardBlocks: [],
      assignmentValidatedAt: now,
      patch: {
        assignedResourceId: undefined,
        assignedZoneId: undefined,
        assignedTripId: undefined,
        assignedTripSpaceId: undefined,
        assignmentOverrideReason: overrideReason,
        assignmentWarnings: [],
        assignmentHardBlocks: [],
        assignmentValidatedAt: now,
      },
    };
  }

  const resolved = await resolveTarget(ctx, moveId, target);
  const capacity = mergeCapacity(
    resolved.resource.capacity,
    resolved.zone?.capacity,
    resolved.space ? tripSpaceToCapacity(resolved.space) : undefined,
  );
  const validation = validateAssignment({
    box: loadable,
    target: { resourceType: resolved.resource.type, capacity },
  });

  if (validation.hardBlocks.length) {
    throw new Error(`Assignment blocked: ${validation.hardBlocks.join(", ")}`);
  }
  if (requiresOverrideReason(validation) && !overrideReason) {
    throw new Error("Assignment warnings require an override reason.");
  }

  return {
    assignmentWarnings: validation.softWarnings,
    assignmentHardBlocks: validation.hardBlocks,
    assignmentValidatedAt: now,
    patch: {
      assignedResourceId: resolved.resourceId,
      assignedZoneId: resolved.zone?._id,
      assignedTripId: resolved.trip?._id,
      assignedTripSpaceId: resolved.space?._id,
      assignmentOverrideReason: overrideReason,
      assignmentWarnings: validation.softWarnings,
      assignmentHardBlocks: validation.hardBlocks,
      assignmentValidatedAt: now,
    },
  };
}

export async function runBatchAssign(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    actorUserId: Id<"users">;
    rows: BatchAssignRow[];
    target: BatchAssignTarget;
    dryRun?: boolean;
  },
): Promise<BatchAssignResult> {
  const dryRun = Boolean(args.dryRun);
  const results: BatchAssignRowResult[] = [];

  for (const [index, row] of args.rows.entries()) {
    try {
      if (row.kind === "box") {
        const box = await ctx.db.get(row.recordId);
        if (
          !box ||
          box.householdId !== args.householdId ||
          box.moveId !== args.moveId ||
          box.archivedAt
        ) {
          throw new Error("Box not found.");
        }
        if (box.assignmentLocked) {
          throw new Error(LOCKED_MESSAGE);
        }
        const loadable = await loadBoxLoadable(ctx, box);
        const assignment = await resolveAssignment(
          ctx,
          args.moveId,
          args.target,
          loadable,
        );
        if (!dryRun) {
          await ctx.db.patch(box._id, {
            ...assignment.patch,
            updatedAt: Date.now(),
          });
          await recordAuditEvent(ctx, {
            householdId: args.householdId,
            moveId: args.moveId,
            actorType: "user",
            actorUserId: args.actorUserId,
            category: "assignment",
            action: "assignment.batch_applied",
            objectTable: "boxes",
            objectId: box._id,
            metadata: {
              rowIndex: index,
              assignedResourceId: assignment.patch.assignedResourceId,
              assignedTripId: assignment.patch.assignedTripId,
              assignedTripSpaceId: assignment.patch.assignedTripSpaceId,
              warningCount: assignment.assignmentWarnings.length,
            },
          });
        }
        results.push({
          index,
          ok: true,
          kind: "box",
          recordId: box._id,
          assignmentWarnings: assignment.assignmentWarnings,
          assignmentHardBlocks: assignment.assignmentHardBlocks,
          dryRun,
        });
      } else {
        const item = await ctx.db.get(row.recordId);
        if (
          !item ||
          item.householdId !== args.householdId ||
          item.moveId !== args.moveId ||
          item.deletedAt
        ) {
          throw new Error("Item not found.");
        }
        if (item.assignmentLocked) {
          throw new Error(LOCKED_MESSAGE);
        }
        const loadable = itemLoadable(item);
        const assignment = await resolveAssignment(
          ctx,
          args.moveId,
          args.target,
          loadable,
        );
        if (!dryRun) {
          await ctx.db.patch(item._id, {
            ...assignment.patch,
            updatedByUserId: args.actorUserId,
            updatedAt: Date.now(),
          });
          await recordAuditEvent(ctx, {
            householdId: args.householdId,
            moveId: args.moveId,
            actorType: "user",
            actorUserId: args.actorUserId,
            category: "assignment",
            action: "assignment.batch_applied",
            objectTable: "items",
            objectId: item._id,
            metadata: {
              rowIndex: index,
              assignedResourceId: assignment.patch.assignedResourceId,
              assignedTripId: assignment.patch.assignedTripId,
              assignedTripSpaceId: assignment.patch.assignedTripSpaceId,
              warningCount: assignment.assignmentWarnings.length,
            },
          });
        }
        results.push({
          index,
          ok: true,
          kind: "item",
          recordId: item._id,
          assignmentWarnings: assignment.assignmentWarnings,
          assignmentHardBlocks: assignment.assignmentHardBlocks,
          dryRun,
        });
      }
    } catch (error) {
      results.push({
        index,
        ok: false,
        kind: row.kind,
        recordId: String(row.recordId),
        error: error instanceof Error ? error.message : "Assignment failed.",
        dryRun,
      });
    }
  }

  const failed = results.filter((result) => !result.ok).length;
  return {
    dryRun,
    total: args.rows.length,
    succeeded: args.rows.length - failed,
    failed,
    results,
  };
}
