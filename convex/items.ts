import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  requiresOverrideReason,
  validateAssignment,
} from "./lib/assignmentValidation";
import {
  BATCH_ASSIGN_MAX_ROWS,
  runBatchAssign,
  type BatchAssignTarget,
} from "./lib/batchAssign";
import {
  estimateItem,
  resolveStoredVolumeCuFt,
  volumeCuFtForUpdate,
  weightBoundsFromEstimate,
} from "./lib/estimateEngine";
import {
  archiveActiveSaleListingsForItem,
  cascadeDeleteItem,
} from "./lib/hardDelete";
import { toInventoryListRow } from "./lib/inventoryListRow";
import {
  composeItemsWithSignals,
  redactItemForVisibility,
} from "./lib/loadPlanSnapshot";
import {
  inventorySearchLimit,
  searchInventoryRecords,
} from "./lib/inventorySearch";
import {
  dimensionsValidator,
  estimateConfidenceValidator,
  formatItemCode,
  itemConditionValidator,
  itemCreatedViaValidator,
  itemDispositionValidator,
  itemFragilityValidator,
  itemStatusValidator,
  measurementProvenanceSourceValidator,
  normalizeItemName,
  normalizeOptionalText,
  normalizedSearchName,
  planningDefaultKeyValidator,
} from "./lib/moveFields";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";
import {
  CodeSequenceExhaustedError,
  legacySequenceSeed,
  nextCodes,
} from "./lib/codeSequence";

const itemWriteArgs = {
  nickname: v.optional(v.string()),
  description: v.optional(v.string()),
  room: v.optional(v.string()),
  destinationRoom: v.optional(v.string()),
  currentSpaceId: v.optional(v.id("moveSpaces")),
  destinationSpaceId: v.optional(v.id("moveSpaces")),
  category: v.optional(v.string()),
  subcategory: v.optional(v.string()),
  ownerPersonId: v.optional(v.id("movePeople")),
  disposition: v.optional(itemDispositionValidator),
  status: v.optional(itemStatusValidator),
  quantity: v.optional(v.number()),
  condition: v.optional(itemConditionValidator),
  valueCents: v.optional(v.number()),
  replacementValueCents: v.optional(v.number()),
  serialNumber: v.optional(v.string()),
  modelNumber: v.optional(v.string()),
  dimensionsIn: v.optional(dimensionsValidator),
  measurementProvenance: v.optional(
    v.object({
      dimensions: v.optional(
        v.object({
          sourceType: measurementProvenanceSourceValidator,
          confidence: estimateConfidenceValidator,
          label: v.optional(v.string()),
          notes: v.optional(v.string()),
          recordedAt: v.number(),
          recordedByUserId: v.optional(v.id("users")),
          recordedByApiKeyId: v.optional(v.id("apiKeys")),
          recordedByLabel: v.optional(v.string()),
          needsVerification: v.boolean(),
        }),
      ),
      weight: v.optional(
        v.object({
          sourceType: measurementProvenanceSourceValidator,
          confidence: estimateConfidenceValidator,
          label: v.optional(v.string()),
          notes: v.optional(v.string()),
          recordedAt: v.number(),
          recordedByUserId: v.optional(v.id("users")),
          recordedByApiKeyId: v.optional(v.id("apiKeys")),
          recordedByLabel: v.optional(v.string()),
          needsVerification: v.boolean(),
        }),
      ),
      volume: v.optional(
        v.object({
          sourceType: measurementProvenanceSourceValidator,
          confidence: estimateConfidenceValidator,
          label: v.optional(v.string()),
          notes: v.optional(v.string()),
          recordedAt: v.number(),
          recordedByUserId: v.optional(v.id("users")),
          recordedByApiKeyId: v.optional(v.id("apiKeys")),
          recordedByLabel: v.optional(v.string()),
          needsVerification: v.boolean(),
        }),
      ),
    }),
  ),
  dimensionsConfidence: v.optional(estimateConfidenceValidator),
  estimatedWeightLb: v.optional(v.number()),
  estimatedWeightLowLb: v.optional(v.number()),
  estimatedWeightHighLb: v.optional(v.number()),
  actualWeightLb: v.optional(v.number()),
  clearActualWeight: v.optional(v.boolean()),
  estimatedVolumeCuFt: v.optional(v.number()),
  estimatedPackedVolumeCuFt: v.optional(v.number()),
  weightConfidence: v.optional(estimateConfidenceValidator),
  volumeConfidence: v.optional(estimateConfidenceValidator),
  fragility: v.optional(itemFragilityValidator),
  stackable: v.optional(v.boolean()),
  hazardousFlag: v.optional(v.boolean()),
  highValue: v.optional(v.boolean()),
  requiresPersonalTransport: v.optional(v.boolean()),
  assignedResourceId: v.optional(v.id("transportResources")),
  assignedZoneId: v.optional(v.id("transportZones")),
  assignmentLocked: v.optional(v.boolean()),
  assignmentOverrideReason: v.optional(v.string()),
  clearAssignedResource: v.optional(v.boolean()),
  clearAssignedZone: v.optional(v.boolean()),
  // Clear the present-location room when present location switches to transport.
  clearCurrentSpace: v.optional(v.boolean()),
  planningDefaultKeys: v.optional(v.array(planningDefaultKeyValidator)),
  needsReview: v.optional(v.boolean()),
  reviewFlags: v.optional(v.array(v.string())),
  privateNotes: v.optional(v.string()),
  aiSummary: v.optional(v.string()),
  aiTags: v.optional(v.array(v.string())),
  createdVia: v.optional(itemCreatedViaValidator),
};

const itemListArgs = {
  householdId: v.id("households"),
  moveId: v.id("moves"),
  status: v.optional(itemStatusValidator),
  disposition: v.optional(itemDispositionValidator),
  room: v.optional(v.string()),
  category: v.optional(v.string()),
  needsReview: v.optional(v.boolean()),
  highValue: v.optional(v.boolean()),
  includeDeleted: v.optional(v.boolean()),
};

type ItemListFilterArgs = {
  status?: Doc<"items">["status"];
  disposition?: Doc<"items">["disposition"];
  room?: string;
  category?: string;
  needsReview?: boolean;
  highValue?: boolean;
  includeDeleted?: boolean;
};

function normalizeStringList(values: string[] | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => value.slice(0, 80)),
    ),
  );
}

function hasDimensions(dimensions: Doc<"items">["dimensionsIn"] | undefined) {
  return Boolean(
    dimensions &&
      (dimensions.lengthIn !== undefined ||
        dimensions.widthIn !== undefined ||
        dimensions.heightIn !== undefined),
  );
}

function verificationNeeded(confidence: Doc<"items">["weightConfidence"]) {
  return confidence !== "manual" && confidence !== "actual";
}

export function weightConfidenceForActualUpdate(args: {
  actualWeightLb?: number;
  clearActualWeight?: boolean;
  weightConfidence?: Doc<"items">["weightConfidence"];
}) {
  if (args.weightConfidence !== undefined) return args.weightConfidence;
  if (args.actualWeightLb !== undefined && !args.clearActualWeight) {
    return "actual";
  }
  return undefined;
}

function provenanceEntry({
  sourceType,
  confidence,
  userId,
  now,
  label,
  notes,
}: {
  sourceType: NonNullable<
    NonNullable<Doc<"items">["measurementProvenance"]>["weight"]
  >["sourceType"];
  confidence: Doc<"items">["weightConfidence"];
  userId: Id<"users">;
  now: number;
  label: string;
  notes?: string;
}) {
  return {
    sourceType,
    confidence,
    label,
    notes,
    recordedAt: now,
    recordedByUserId: userId,
    recordedByLabel: "Signed-in user",
    needsVerification: verificationNeeded(confidence),
  };
}

export function inferredMeasurementProvenanceForUser({
  args,
  existing,
  userId,
  now,
}: {
  args: Partial<Doc<"items">>;
  existing?: Doc<"items">;
  userId: Id<"users">;
  now: number;
}): Doc<"items">["measurementProvenance"] | undefined {
  const next: NonNullable<Doc<"items">["measurementProvenance"]> = {
    ...(existing?.measurementProvenance ?? {}),
  };
  let changed = false;

  if (args.dimensionsIn !== undefined && hasDimensions(args.dimensionsIn)) {
    changed = true;
    const confidence = args.dimensionsConfidence ?? "manual";
    next.dimensions = provenanceEntry({
      sourceType:
        confidence === "actual" || confidence === "manual"
          ? "manualMeasurement"
          : "manualEstimate",
      confidence,
      userId,
      now,
      label: "Dimensions",
      notes: "Recorded from item detail measurements.",
    });
  }

  if (
    args.actualWeightLb !== undefined ||
    args.estimatedWeightLb !== undefined ||
    args.estimatedWeightLowLb !== undefined ||
    args.estimatedWeightHighLb !== undefined
  ) {
    changed = true;
    const confidence =
      args.actualWeightLb !== undefined ? "actual" : (args.weightConfidence ?? "manual");
    next.weight = provenanceEntry({
      sourceType: confidence === "actual" ? "manualMeasurement" : "manualEstimate",
      confidence,
      userId,
      now,
      label: "Weight",
      notes:
        args.actualWeightLb !== undefined
          ? "Recorded from item detail actual weight."
          : "Recorded from item detail estimated weight.",
    });
  }

  if (
    args.estimatedVolumeCuFt !== undefined ||
    args.estimatedPackedVolumeCuFt !== undefined
  ) {
    changed = true;
    const confidence = args.volumeConfidence ?? "manual";
    next.volume = provenanceEntry({
      sourceType: "manualEstimate",
      confidence,
      userId,
      now,
      label: "Volume",
      notes: "Recorded from item detail volume estimate.",
    });
  }

  return changed ? next : undefined;
}

function filterItemRecords(items: Doc<"items">[], args: ItemListFilterArgs) {
  return items
    .filter((item) => args.includeDeleted || !item.deletedAt)
    .filter((item) => (args.status ? item.status === args.status : true))
    .filter((item) =>
      args.disposition ? item.disposition === args.disposition : true,
    )
    .filter((item) => (args.room ? item.room === args.room : true))
    .filter((item) => (args.category ? item.category === args.category : true))
    .filter((item) =>
      typeof args.needsReview === "boolean"
        ? item.needsReview === args.needsReview
        : true,
    )
    .filter((item) =>
      typeof args.highValue === "boolean"
        ? item.highValue === args.highValue
        : true,
    );
}

// Is this owner/contact a live person on this move? Returns false for a missing,
// archived, or cross-move person. Non-throwing so callers decide: CREATE rejects
// a bad owner (ConvexError), but UPDATE self-heals a now-dangling owner (clears
// it) so an item whose owner was later archived can still be edited — otherwise
// the save 500s opaquely with no way out (the form shows "Unassigned" while
// still holding the stale id).
async function isMovePersonAvailable(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    ownerPersonId: Id<"movePeople">;
  },
): Promise<boolean> {
  const person = await ctx.db.get(args.ownerPersonId);
  return Boolean(
    person &&
      person.householdId === args.householdId &&
      person.moveId === args.moveId &&
      !person.archivedAt,
  );
}

async function assertItemSpaceTargets(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    currentSpaceId?: Id<"moveSpaces">;
    destinationSpaceId?: Id<"moveSpaces">;
  },
) {
  for (const spaceId of [args.currentSpaceId, args.destinationSpaceId]) {
    if (!spaceId) continue;
    const space = await ctx.db.get(spaceId);
    if (
      !space ||
      space.householdId !== args.householdId ||
      space.moveId !== args.moveId ||
      space.status === "archived"
    ) {
      throw new ConvexError("Item space is not available for this move.");
    }
  }
}

function mergeCapacity(
  resourceCapacity: Doc<"transportResources">["capacity"],
  zoneCapacity?: Doc<"transportZones">["capacity"],
) {
  if (!zoneCapacity) {
    return resourceCapacity;
  }

  return {
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
  };
}

function minOptional(first?: number, second?: number) {
  if (typeof first !== "number") return second;
  if (typeof second !== "number") return first;
  return Math.min(first, second);
}

export async function loadItemAssignmentValidation(
  ctx: MutationCtx,
  args: {
    moveId: Id<"moves">;
    item: {
      name: string;
      category?: string;
      quantity?: number;
      dimensionsIn?: Doc<"items">["dimensionsIn"];
      estimatedWeightLb?: number;
      estimatedWeightLowLb?: number;
      estimatedWeightHighLb?: number;
      actualWeightLb?: number;
      estimatedVolumeCuFt?: number;
      estimatedPackedVolumeCuFt?: number;
      weightConfidence?: Doc<"items">["weightConfidence"];
      volumeConfidence?: Doc<"items">["volumeConfidence"];
      fragility?: Doc<"items">["fragility"];
      highValue?: boolean;
      planningDefaultKeys?: string[];
      requiresPersonalTransport?: boolean;
      hazardousFlag?: boolean;
    };
    assignedResourceId?: Id<"transportResources">;
    assignedZoneId?: Id<"transportZones">;
    assignmentOverrideReason?: string;
    enforce?: boolean;
  },
) {
  if (!args.assignedResourceId) {
    return {
      assignmentWarnings: [],
      assignmentHardBlocks: [],
      assignmentValidatedAt: Date.now(),
    };
  }

  const [resource, zone] = await Promise.all([
    ctx.db.get(args.assignedResourceId),
    args.assignedZoneId
      ? ctx.db.get(args.assignedZoneId)
      : Promise.resolve(null),
  ]);
  if (!resource || resource.moveId !== args.moveId || resource.archivedAt) {
    throw new ConvexError("Invalid transport resource.");
  }
  if (
    args.assignedZoneId &&
    (!zone ||
      zone.moveId !== args.moveId ||
      zone.resourceId !== args.assignedResourceId ||
      zone.archivedAt)
  ) {
    throw new ConvexError("Invalid transport zone.");
  }

  const estimate = estimateItem(args.item);
  const validation = validateAssignment({
    box: {
      estimatedWeightLb: estimate.weight?.value ?? 0,
      estimatedVolumeCuFt: estimate.volume?.value ?? 0,
      dimensionsIn: args.item.dimensionsIn,
      itemCount: args.item.quantity ?? 1,
      hasFragile: args.item.fragility === "high",
      hasHighValue: Boolean(args.item.highValue),
      hasSensitive: Boolean(
        args.item.planningDefaultKeys?.includes("sensitive"),
      ),
      hasPersonalTransport: Boolean(args.item.requiresPersonalTransport),
      hasHazardous: Boolean(args.item.hazardousFlag),
    },
    target: {
      resourceType: resource.type,
      capacity: mergeCapacity(resource.capacity, zone?.capacity),
    },
  });

  if (args.enforce !== false) {
    if (validation.hardBlocks.length) {
      throw new ConvexError(
        `Assignment blocked (these are hard blocks and cannot be overridden): ${validation.hardBlocks.join(", ")}.`,
      );
    }
    if (
      requiresOverrideReason(validation) &&
      !normalizeOptionalText(args.assignmentOverrideReason)
    ) {
      throw new ConvexError(
        `This assignment raises soft warnings (${validation.softWarnings.join(", ")}). Pass assignmentOverrideReason with a short reason to proceed, or use dryRun:true to preview without saving.`,
      );
    }
  }

  return {
    assignmentWarnings: validation.softWarnings,
    assignmentHardBlocks: validation.hardBlocks,
    assignmentValidatedAt: Date.now(),
  };
}

export const listForMove = query({
  args: itemListArgs,
  handler: async (ctx, args) => {
    const policy = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );

    const items = await ctx.db
      .query("items")
      .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .collect();

    return filterItemRecords(items, args).map((item) =>
      redactItemForVisibility(item, policy.visibility),
    );
  },
});

export const get = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    itemId: v.id("items"),
  },
  handler: async (ctx, args) => {
    const policy = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );
    const item = await ctx.db.get(args.itemId);
    if (
      !item ||
      item.householdId !== args.householdId ||
      item.moveId !== args.moveId ||
      item.deletedAt
    ) {
      return null;
    }

    return redactItemForVisibility(item, policy.visibility);
  },
});

export async function fetchMoveSignalData(
  ctx: Parameters<typeof requireMovePermission>[0],
  householdId: Id<"households">,
  moveId: Id<"moves">,
) {
  const [items, boxItems, boxes, photos, resources, zones, people] =
    await Promise.all([
      ctx.db
        .query("items")
        .withIndex("by_move_updated", (q) => q.eq("moveId", moveId))
        .order("desc")
        .collect(),
      ctx.db
        .query("boxItems")
        .withIndex("by_move", (q) => q.eq("moveId", moveId))
        .collect(),
      ctx.db
        .query("boxes")
        .withIndex("by_move_updated", (q) => q.eq("moveId", moveId))
        .collect(),
      ctx.db
        .query("itemPhotos")
        .withIndex("by_move_created", (q) => q.eq("moveId", moveId))
        .collect(),
      ctx.db
        .query("transportResources")
        .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
        .collect(),
      ctx.db
        .query("transportZones")
        .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
        .collect(),
      ctx.db
        .query("movePeople")
        .withIndex("by_move_sort", (q) => q.eq("moveId", moveId))
        .collect(),
    ]);
  return {
    householdId,
    items,
    boxItems,
    boxes,
    photos,
    resources,
    zones,
    people,
  };
}

// Disposition facet grouping for the inventory chip counts.
const dispositionFacetGroups = {
  moving: ["take", "mover", "personalTransport", "storage"],
  sell: ["sell"],
  trash: ["dump"],
  donate: ["donate"],
} as const;

export const listForMoveWithSignals = query({
  args: itemListArgs,
  handler: async (ctx, args) => {
    const policy = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );

    const data = await fetchMoveSignalData(
      ctx,
      args.householdId,
      args.moveId,
    );
    const visibleItems = filterItemRecords(data.items, args);

    return composeItemsWithSignals(
      { ...data, items: visibleItems },
      policy.visibility,
    );
  },
});

// Same arg shape + same redacted/signal row shape as listForMoveWithSignals,
// plus disposition facet counts. Facets are computed over the move's items with
// every filter applied EXCEPT disposition, so the all/moving/sell/trash/donate
// chip counts stay stable while a disposition chip is active. Reuses the same
// by_move_updated scan — no new index.
export const facetedListForMove = query({
  args: itemListArgs,
  handler: async (ctx, args) => {
    const policy = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );

    const data = await fetchMoveSignalData(
      ctx,
      args.householdId,
      args.moveId,
    );

    // Facet base: all filters EXCEPT disposition (so chip counts are stable).
    const facetBase = filterItemRecords(data.items, {
      ...args,
      disposition: undefined,
    });
    const facets = {
      disposition: {} as Record<string, number>,
      total: facetBase.length,
      moving: 0,
      sell: 0,
      trash: 0,
      donate: 0,
    };
    for (const item of facetBase) {
      facets.disposition[item.disposition] =
        (facets.disposition[item.disposition] ?? 0) + 1;
    }
    for (const [group, dispositions] of Object.entries(
      dispositionFacetGroups,
    )) {
      facets[group as keyof typeof dispositionFacetGroups] = dispositions.reduce(
        (sum, disposition) => sum + (facets.disposition[disposition] ?? 0),
        0,
      );
    }

    const visibleItems = filterItemRecords(data.items, args);
    const fullItems = composeItemsWithSignals(
      { ...data, items: visibleItems },
      policy.visibility,
    );
    const items = fullItems.map((item) =>
      toInventoryListRow(item, policy.visibility),
    );

    return { items, facets };
  },
});

export const searchForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const policy = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );
    const items = await searchInventoryRecords(ctx, {
      moveId: args.moveId,
      query: args.query,
      limit: inventorySearchLimit(args.limit, 50),
    });
    return items.map((item) => toInventoryListRow(item, policy.visibility));
  },
});

export async function generateItemCodes(
  ctx: MutationCtx,
  moveId: Id<"moves">,
  count: number,
) {
  if (count === 0) return [];
  const move = await ctx.db.get(moveId);
  if (!move) throw new ConvexError("Move not found.");

  let seq = move.nextItemCodeSeq;
  let isOccupied: (code: string) => boolean | Promise<boolean>;
  if (seq === undefined) {
    // Legacy moves pay for one scan, once. Exact conforming codes determine the
    // seed; gaps and manually named codes do not make the sequence move backward.
    const items = await ctx.db
      .query("items")
      .withIndex("by_move_code", (q) => q.eq("moveId", moveId))
      .collect();
    const existing = new Set(
      items
        .map((item) => item.code)
        .filter((code): code is string => Boolean(code)),
    );
    seq = legacySequenceSeed([...existing], /^item-(\d+)$/);
    isOccupied = (code) => existing.has(code);
  } else {
    isOccupied = async (code) =>
      Boolean(
        await ctx.db
          .query("items")
          .withIndex("by_move_code", (q) =>
            q.eq("moveId", moveId).eq("code", code),
          )
          .first(),
      );
  }

  try {
    const reservation = await nextCodes({
      seq,
      count,
      format: formatItemCode,
      isOccupied,
    });
    // Reading and patching this shared move document intentionally makes
    // concurrent reservations conflict. Convex OCC retries the losing mutation,
    // which then observes the winner's advanced counter.
    await ctx.db.patch(moveId, { nextItemCodeSeq: reservation.nextSeq });
    return reservation.codes;
  } catch (error) {
    if (error instanceof CodeSequenceExhaustedError) {
      throw new ConvexError("Could not generate unique item codes.");
    }
    throw error;
  }
}

export async function generateItemCode(ctx: MutationCtx, moveId: Id<"moves">) {
  const [code] = await generateItemCodes(ctx, moveId, 1);
  if (!code) throw new ConvexError("Could not generate a unique item code.");
  return code;
}

export const create = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    name: v.string(),
    ...itemWriteArgs,
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }
    if (
      args.ownerPersonId &&
      !(await isMovePersonAvailable(ctx, {
        householdId: args.householdId,
        moveId: args.moveId,
        ownerPersonId: args.ownerPersonId,
      }))
    ) {
      throw new ConvexError(
        "Item owner/contact is not available for this move.",
      );
    }
    await assertItemSpaceTargets(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      currentSpaceId: args.currentSpaceId,
      destinationSpaceId: args.destinationSpaceId,
    });
    const assignmentValidation = await loadItemAssignmentValidation(ctx, {
      moveId: args.moveId,
      item: {
        name: args.name,
        category: args.category,
        quantity: args.quantity,
        dimensionsIn: args.dimensionsIn,
        estimatedWeightLb: args.estimatedWeightLb,
        estimatedWeightLowLb: args.estimatedWeightLowLb,
        estimatedWeightHighLb: args.estimatedWeightHighLb,
        actualWeightLb: args.actualWeightLb,
        estimatedVolumeCuFt: args.estimatedVolumeCuFt,
        estimatedPackedVolumeCuFt: args.estimatedPackedVolumeCuFt,
        weightConfidence: args.weightConfidence,
        volumeConfidence: args.volumeConfidence,
        fragility: args.fragility,
        highValue: args.highValue,
        planningDefaultKeys: args.planningDefaultKeys,
        requiresPersonalTransport: args.requiresPersonalTransport,
        hazardousFlag: args.hazardousFlag,
      },
      assignedResourceId: args.assignedResourceId,
      assignedZoneId: args.assignedZoneId,
      assignmentOverrideReason: args.assignmentOverrideReason,
    });

    const now = Date.now();
    const name = normalizeItemName(args.name);
    const code = await generateItemCode(ctx, args.moveId);
    const itemId = await ctx.db.insert("items", {
      householdId: args.householdId,
      moveId: args.moveId,
      name,
      normalizedName: normalizedSearchName(name),
      code,
      nickname: normalizeOptionalText(args.nickname),
      description: normalizeOptionalText(args.description),
      room: normalizeOptionalText(args.room),
      destinationRoom: normalizeOptionalText(args.destinationRoom),
      currentSpaceId: args.currentSpaceId,
      destinationSpaceId: args.destinationSpaceId,
      category: normalizeOptionalText(args.category),
      subcategory: normalizeOptionalText(args.subcategory),
      ownerPersonId: args.ownerPersonId,
      disposition: args.disposition ?? "undecided",
      status: args.status ?? "active",
      quantity: args.quantity && args.quantity > 0 ? args.quantity : 1,
      condition: args.condition ?? "unknown",
      valueCents: args.valueCents,
      replacementValueCents: args.replacementValueCents,
      serialNumber: normalizeOptionalText(args.serialNumber),
      modelNumber: normalizeOptionalText(args.modelNumber),
      dimensionsIn: args.dimensionsIn,
      measurementProvenance:
        args.measurementProvenance ??
        inferredMeasurementProvenanceForUser({
          args,
          userId: actor.userId,
          now,
        }),
      dimensionsConfidence: args.dimensionsConfidence ?? "none",
      estimatedWeightLb: args.estimatedWeightLb,
      actualWeightLb: args.actualWeightLb,
      // Fill the weight range from the point estimate when not given (low 75%,
      // high 135%), so the AI can send just estimatedWeightLb.
      estimatedWeightLowLb:
        args.estimatedWeightLowLb ??
        weightBoundsFromEstimate(args.estimatedWeightLb)?.low,
      estimatedWeightHighLb:
        args.estimatedWeightHighLb ??
        weightBoundsFromEstimate(args.estimatedWeightLb)?.high,
      // Persist volume from dimensions when no explicit volume was given, so a
      // dims-only create doesn't leave estimatedVolumeCuFt null for the rollups.
      estimatedVolumeCuFt: resolveStoredVolumeCuFt(args),
      estimatedPackedVolumeCuFt: args.estimatedPackedVolumeCuFt,
      weightConfidence: args.weightConfidence ?? "none",
      volumeConfidence: args.volumeConfidence ?? "none",
      fragility: args.fragility ?? "low",
      stackable: args.stackable ?? true,
      hazardousFlag: args.hazardousFlag ?? false,
      highValue: args.highValue ?? false,
      requiresPersonalTransport: args.requiresPersonalTransport ?? false,
      assignedResourceId: args.assignedResourceId,
      assignedZoneId: args.assignedZoneId,
      assignmentLocked: args.assignmentLocked ?? false,
      assignmentOverrideReason: normalizeOptionalText(
        args.assignmentOverrideReason,
      ),
      ...assignmentValidation,
      planningDefaultKeys: args.planningDefaultKeys ?? [],
      needsReview: args.needsReview ?? false,
      reviewFlags: normalizeStringList(args.reviewFlags),
      privateNotes: normalizeOptionalText(args.privateNotes),
      aiSummary: normalizeOptionalText(args.aiSummary),
      aiTags: normalizeStringList(args.aiTags),
      createdVia: args.createdVia ?? "manual",
      reviewedAt: args.needsReview === false ? now : undefined,
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
      category: "inventory",
      action: "item.created",
      objectTable: "items",
      objectId: itemId,
      metadata: {
        name,
        disposition: args.disposition ?? "undecided",
        status: args.status ?? "active",
      },
    });

    return itemId;
  },
});

export const update = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    itemId: v.id("items"),
    name: v.optional(v.string()),
    clearOwnerPersonId: v.optional(v.boolean()),
    ...itemWriteArgs,
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }
    // Self-heal a dangling owner: if the incoming owner is gone/archived, treat
    // it as "clear" rather than blocking the edit (see isMovePersonAvailable).
    const ownerIsAvailable = args.ownerPersonId
      ? await isMovePersonAvailable(ctx, {
          householdId: args.householdId,
          moveId: args.moveId,
          ownerPersonId: args.ownerPersonId,
        })
      : true;
    await assertItemSpaceTargets(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      currentSpaceId: args.currentSpaceId,
      destinationSpaceId: args.destinationSpaceId,
    });

    const item = await ctx.db.get(args.itemId);
    if (
      !item ||
      item.householdId !== args.householdId ||
      item.moveId !== args.moveId ||
      item.deletedAt
    ) {
      throw new Error("Item not found.");
    }

    const now = Date.now();
    const patch: Partial<Doc<"items">> = {
      updatedByUserId: actor.userId,
      updatedAt: now,
    };

    if (args.name !== undefined) {
      patch.name = normalizeItemName(args.name);
      patch.normalizedName = normalizedSearchName(args.name);
    }
    if (args.nickname !== undefined) {
      patch.nickname = normalizeOptionalText(args.nickname);
    }
    if (args.description !== undefined) {
      patch.description = normalizeOptionalText(args.description);
    }
    if (args.room !== undefined) {
      patch.room = normalizeOptionalText(args.room);
    }
    if (args.destinationRoom !== undefined) {
      patch.destinationRoom = normalizeOptionalText(args.destinationRoom);
    }
    if (args.clearCurrentSpace) {
      patch.currentSpaceId = undefined;
    } else if (args.currentSpaceId !== undefined) {
      patch.currentSpaceId = args.currentSpaceId;
    }
    if (args.destinationSpaceId !== undefined) {
      patch.destinationSpaceId = args.destinationSpaceId;
    }
    if (args.category !== undefined) {
      patch.category = normalizeOptionalText(args.category);
    }
    if (args.subcategory !== undefined) {
      patch.subcategory = normalizeOptionalText(args.subcategory);
    }
    if (args.clearOwnerPersonId || !ownerIsAvailable) {
      // Explicit clear, OR the incoming owner is no longer a live person on this
      // move (archived/deleted) — drop the dangling reference instead of saving
      // it (which previously threw an opaque Server Error and blocked the edit).
      patch.ownerPersonId = undefined;
    } else if (args.ownerPersonId !== undefined) {
      patch.ownerPersonId = args.ownerPersonId;
    }
    if (args.disposition !== undefined) {
      patch.disposition = args.disposition;
    }
    if (args.status !== undefined) {
      patch.status = args.status;
    }
    if (args.quantity !== undefined) {
      patch.quantity = args.quantity > 0 ? args.quantity : 1;
    }
    if (args.condition !== undefined) {
      patch.condition = args.condition;
    }
    if (args.valueCents !== undefined) {
      patch.valueCents = args.valueCents;
    }
    if (args.replacementValueCents !== undefined) {
      patch.replacementValueCents = args.replacementValueCents;
    }
    if (args.serialNumber !== undefined) {
      patch.serialNumber = normalizeOptionalText(args.serialNumber);
    }
    if (args.modelNumber !== undefined) {
      patch.modelNumber = normalizeOptionalText(args.modelNumber);
    }
    if (args.dimensionsIn !== undefined) {
      patch.dimensionsIn = args.dimensionsIn;
    }
    if (args.measurementProvenance !== undefined) {
      patch.measurementProvenance = args.measurementProvenance;
    }
    if (args.dimensionsConfidence !== undefined) {
      patch.dimensionsConfidence = args.dimensionsConfidence;
    }
    if (args.estimatedWeightLb !== undefined) {
      patch.estimatedWeightLb = args.estimatedWeightLb;
      // Refill the range from the new point estimate when the caller didn't send
      // explicit bounds (low 75%, high 135%); explicit bounds below still win.
      const bounds = weightBoundsFromEstimate(args.estimatedWeightLb);
      if (args.estimatedWeightLowLb === undefined && bounds) {
        patch.estimatedWeightLowLb = bounds.low;
      }
      if (args.estimatedWeightHighLb === undefined && bounds) {
        patch.estimatedWeightHighLb = bounds.high;
      }
    }
    if (args.estimatedWeightLowLb !== undefined) {
      patch.estimatedWeightLowLb = args.estimatedWeightLowLb;
    }
    if (args.estimatedWeightHighLb !== undefined) {
      patch.estimatedWeightHighLb = args.estimatedWeightHighLb;
    }
    if (args.actualWeightLb !== undefined) {
      patch.actualWeightLb = args.actualWeightLb;
    }
    if (args.clearActualWeight) {
      patch.actualWeightLb = undefined;
    }
    // Recompute volume from dimensions when dims change and no explicit volume
    // was given, so updating dims via API/MCP keeps estimatedVolumeCuFt in sync.
    const itemVolumeUpdate = volumeCuFtForUpdate({
      volumeProvided: args.estimatedVolumeCuFt !== undefined,
      estimatedVolumeCuFt: args.estimatedVolumeCuFt,
      dimensionsProvided: args.dimensionsIn !== undefined,
      dimensionsIn: args.dimensionsIn,
    });
    if (itemVolumeUpdate.set) {
      patch.estimatedVolumeCuFt = itemVolumeUpdate.value;
    }
    if (args.estimatedPackedVolumeCuFt !== undefined) {
      patch.estimatedPackedVolumeCuFt = args.estimatedPackedVolumeCuFt;
    }
    const nextWeightConfidence = weightConfidenceForActualUpdate({
      actualWeightLb: args.actualWeightLb,
      clearActualWeight: args.clearActualWeight,
      weightConfidence: args.weightConfidence,
    });
    if (nextWeightConfidence !== undefined) {
      patch.weightConfidence = nextWeightConfidence;
    }
    if (args.volumeConfidence !== undefined) {
      patch.volumeConfidence = args.volumeConfidence;
    }
    if (args.fragility !== undefined) {
      patch.fragility = args.fragility;
    }
    if (args.stackable !== undefined) {
      patch.stackable = args.stackable;
    }
    if (args.hazardousFlag !== undefined) {
      patch.hazardousFlag = args.hazardousFlag;
    }
    if (args.highValue !== undefined) {
      patch.highValue = args.highValue;
    }
    if (args.requiresPersonalTransport !== undefined) {
      patch.requiresPersonalTransport = args.requiresPersonalTransport;
    }
    if (args.planningDefaultKeys !== undefined) {
      patch.planningDefaultKeys = args.planningDefaultKeys;
    }
    if (args.assignedResourceId !== undefined) {
      patch.assignedResourceId = args.assignedResourceId;
    }
    if (args.assignedZoneId !== undefined) {
      patch.assignedZoneId = args.assignedZoneId;
    }
    if (args.assignmentLocked !== undefined) {
      patch.assignmentLocked = args.assignmentLocked;
    }
    if (args.assignmentOverrideReason !== undefined) {
      patch.assignmentOverrideReason = normalizeOptionalText(
        args.assignmentOverrideReason,
      );
    }
    if (args.clearAssignedResource) {
      patch.assignedResourceId = undefined;
      patch.assignedZoneId = undefined;
      patch.assignmentWarnings = [];
      patch.assignmentHardBlocks = [];
      patch.assignmentValidatedAt = now;
    } else if (args.clearAssignedZone) {
      patch.assignedZoneId = undefined;
    }
    const nextAssignedResourceId =
      args.clearAssignedResource === true
        ? undefined
        : (patch.assignedResourceId ?? item.assignedResourceId);
    if (nextAssignedResourceId) {
      const validation = await loadItemAssignmentValidation(ctx, {
        moveId: args.moveId,
        item: {
          name: patch.name ?? item.name,
          category: patch.category ?? item.category,
          quantity: patch.quantity ?? item.quantity,
          dimensionsIn: patch.dimensionsIn ?? item.dimensionsIn,
          estimatedWeightLb:
            patch.estimatedWeightLb ?? item.estimatedWeightLb,
          estimatedWeightLowLb:
            patch.estimatedWeightLowLb ?? item.estimatedWeightLowLb,
          estimatedWeightHighLb:
            patch.estimatedWeightHighLb ?? item.estimatedWeightHighLb,
          actualWeightLb: patch.actualWeightLb ?? item.actualWeightLb,
          estimatedVolumeCuFt:
            patch.estimatedVolumeCuFt ?? item.estimatedVolumeCuFt,
          estimatedPackedVolumeCuFt:
            patch.estimatedPackedVolumeCuFt ??
            item.estimatedPackedVolumeCuFt,
          weightConfidence: patch.weightConfidence ?? item.weightConfidence,
          volumeConfidence: patch.volumeConfidence ?? item.volumeConfidence,
          fragility: patch.fragility ?? item.fragility,
          highValue: patch.highValue ?? item.highValue,
          planningDefaultKeys:
            patch.planningDefaultKeys ?? item.planningDefaultKeys,
          requiresPersonalTransport:
            patch.requiresPersonalTransport ?? item.requiresPersonalTransport,
          hazardousFlag: patch.hazardousFlag ?? item.hazardousFlag,
        },
        assignedResourceId: nextAssignedResourceId,
        assignedZoneId:
          args.clearAssignedZone === true
            ? undefined
            : (patch.assignedZoneId ?? item.assignedZoneId),
        assignmentOverrideReason:
          patch.assignmentOverrideReason ?? item.assignmentOverrideReason,
        // A plain item edit must RECORD assignment warnings, not block on them.
        // Enforcing here (the default) made "set transport = Military movers" on
        // a fragile item throw a soft-warning error with no override-reason flow
        // in the item detail — a dead end. The warnings are still stored on the
        // item; the load planner is where they're reviewed/enforced.
        enforce: false,
      });
      patch.assignmentWarnings = validation.assignmentWarnings;
      patch.assignmentHardBlocks = validation.assignmentHardBlocks;
      patch.assignmentValidatedAt = validation.assignmentValidatedAt;
    }
    if (args.needsReview !== undefined) {
      patch.needsReview = args.needsReview;
      patch.reviewedAt = args.needsReview ? undefined : Date.now();
    }
    if (args.reviewFlags !== undefined) {
      patch.reviewFlags = normalizeStringList(args.reviewFlags);
    }
    if (args.privateNotes !== undefined) {
      patch.privateNotes = normalizeOptionalText(args.privateNotes);
    }
    if (args.aiSummary !== undefined) {
      patch.aiSummary = normalizeOptionalText(args.aiSummary);
    }
    if (args.aiTags !== undefined) {
      patch.aiTags = normalizeStringList(args.aiTags);
    }
    if (args.createdVia !== undefined) {
      patch.createdVia = args.createdVia;
    }
    if (args.measurementProvenance === undefined) {
      const inferredProvenance = inferredMeasurementProvenanceForUser({
        args,
        existing: item,
        userId: actor.userId,
        now,
      });
      if (inferredProvenance) {
        patch.measurementProvenance = inferredProvenance;
      }
    }

    await ctx.db.patch(args.itemId, patch);

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "item.updated",
      objectTable: "items",
      objectId: args.itemId,
      metadata: {
        changedKeys: Object.keys(patch),
        ...(patch.status && patch.status !== item.status
          ? { statusFrom: item.status, statusTo: patch.status }
          : {}),
      },
    });
  },
});

// UI batch editor: apply the SAME per-field patch + load validation as
// items.update across up to 100 items. Non-assignment fields (status,
// disposition, room, destinationRoom) are patched directly; the assignment
// fields are delegated to the shared batchAssign helper so load validation is
// single-sourced. Per-row results + one audit event per changed item
// (item.batch_updated). Honors assignmentLocked and dryRun.
export const batchUpdate = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    itemIds: v.array(v.id("items")),
    patch: v.object({
      status: v.optional(itemStatusValidator),
      disposition: v.optional(itemDispositionValidator),
      room: v.optional(v.string()),
      destinationRoom: v.optional(v.string()),
      assignedResourceId: v.optional(v.id("transportResources")),
      assignedZoneId: v.optional(v.id("transportZones")),
      assignedTripId: v.optional(v.id("transportTrips")),
      assignedTripSpaceId: v.optional(v.id("tripSpaces")),
      clearAssignment: v.optional(v.boolean()),
      assignmentOverrideReason: v.optional(v.string()),
    }),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }
    if (args.itemIds.length > BATCH_ASSIGN_MAX_ROWS) {
      throw new Error(
        `Batch item updates are limited to ${BATCH_ASSIGN_MAX_ROWS} items.`,
      );
    }

    const dryRun = Boolean(args.dryRun);
    const target: BatchAssignTarget = {
      assignedResourceId: args.patch.assignedResourceId,
      assignedZoneId: args.patch.assignedZoneId,
      assignedTripId: args.patch.assignedTripId,
      assignedTripSpaceId: args.patch.assignedTripSpaceId,
      clearAssignment: args.patch.clearAssignment,
      assignmentOverrideReason: args.patch.assignmentOverrideReason,
    };
    const touchesAssignment =
      target.assignedResourceId !== undefined ||
      target.assignedZoneId !== undefined ||
      target.assignedTripId !== undefined ||
      target.assignedTripSpaceId !== undefined ||
      target.clearAssignment === true;
    const touchesFields =
      args.patch.status !== undefined ||
      args.patch.disposition !== undefined ||
      args.patch.room !== undefined ||
      args.patch.destinationRoom !== undefined;

    type RowResult = {
      index: number;
      ok: boolean;
      recordId?: string;
      assignmentWarnings?: string[];
      assignmentHardBlocks?: string[];
      error?: string;
      dryRun: boolean;
    };
    const results: RowResult[] = [];

    for (const [index, itemId] of args.itemIds.entries()) {
      try {
        const item = await ctx.db.get(itemId);
        if (
          !item ||
          item.householdId !== args.householdId ||
          item.moveId !== args.moveId ||
          item.deletedAt
        ) {
          throw new Error("Item not found.");
        }
        if (touchesAssignment && item.assignmentLocked) {
          throw new Error("Locked assignments must be changed manually.");
        }

        let assignmentResult:
          | Awaited<ReturnType<typeof runBatchAssign>>
          | null = null;
        if (touchesAssignment) {
          assignmentResult = await runBatchAssign(ctx, {
            householdId: args.householdId,
            moveId: args.moveId,
            actorUserId: actor.userId,
            rows: [{ kind: "item", recordId: item._id }],
            target,
            dryRun,
          });
          const row = assignmentResult.results[0];
          if (!row.ok) {
            throw new Error(row.error ?? "Assignment failed.");
          }
        }

        if (touchesFields && !dryRun) {
          const now = Date.now();
          const fieldPatch: Partial<Doc<"items">> = {
            updatedByUserId: actor.userId,
            updatedAt: now,
          };
          if (args.patch.status !== undefined) {
            fieldPatch.status = args.patch.status;
          }
          if (args.patch.disposition !== undefined) {
            fieldPatch.disposition = args.patch.disposition;
          }
          if (args.patch.room !== undefined) {
            fieldPatch.room = normalizeOptionalText(args.patch.room);
          }
          if (args.patch.destinationRoom !== undefined) {
            fieldPatch.destinationRoom = normalizeOptionalText(
              args.patch.destinationRoom,
            );
          }
          await ctx.db.patch(item._id, fieldPatch);
        }

        if (!dryRun) {
          await recordAuditEvent(ctx, {
            householdId: args.householdId,
            moveId: args.moveId,
            actorType: "user",
            actorUserId: actor.userId,
            category: "inventory",
            action: "item.batch_updated",
            objectTable: "items",
            objectId: item._id,
            metadata: {
              rowIndex: index,
              touchedFields: touchesFields,
              touchedAssignment: touchesAssignment,
            },
          });
        }

        const assignmentRow = assignmentResult?.results[0];
        results.push({
          index,
          ok: true,
          recordId: item._id,
          assignmentWarnings: assignmentRow?.assignmentWarnings,
          assignmentHardBlocks: assignmentRow?.assignmentHardBlocks,
          dryRun,
        });
      } catch (error) {
        results.push({
          index,
          ok: false,
          recordId: String(itemId),
          error: error instanceof Error ? error.message : "Item update failed.",
          dryRun,
        });
      }
    }

    const failed = results.filter((result) => !result.ok).length;
    return {
      dryRun,
      total: args.itemIds.length,
      succeeded: args.itemIds.length - failed,
      failed,
      results,
    };
  },
});

// Minimal disposition-only mutation for inline single-cell quick-classify in the
// inventory table. Cheaper than the full update path: it patches disposition +
// updatedBy/updatedAt and records a focused audit event. dump == "trash" is
// already in the disposition enum, so no enum change is needed.
export const setDisposition = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    itemId: v.id("items"),
    disposition: itemDispositionValidator,
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    if (actor.type !== "user") {
      throw new Error(directConvexUserContextRequiredMessage);
    }

    const item = await ctx.db.get(args.itemId);
    if (
      !item ||
      item.householdId !== args.householdId ||
      item.moveId !== args.moveId ||
      item.deletedAt
    ) {
      throw new Error("Item not found.");
    }

    const now = Date.now();
    await ctx.db.patch(args.itemId, {
      disposition: args.disposition,
      updatedByUserId: actor.userId,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "item.disposition_set",
      objectTable: "items",
      objectId: args.itemId,
      metadata: {
        dispositionFrom: item.disposition,
        dispositionTo: args.disposition,
      },
    });
  },
});

// Read-only dump of active items (id, code, name, room, disposition) so we can
// eyeball which "items" are really physical containers (totes/bins/crates) that
// should become boxes. Paginated.
export const censusActiveItems = internalQuery({
  args: { cursor: v.optional(v.string()), batch: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("items")
      .paginate({ cursor: args.cursor ?? null, numItems: args.batch ?? 500 });
    const items = page.page
      .filter((item) => !item.deletedAt)
      .map((item) => ({
        id: String(item._id),
        code: item.code,
        name: item.name,
        room: item.room ?? null,
        disposition: item.disposition,
      }));
    return {
      count: items.length,
      items,
      isDone: page.isDone,
      cursor: page.continueCursor,
    };
  },
});

// Admin/CLI cleanup: soft-delete (archive) a list of items by id — used to clear
// out test-junk that leaked into a real move. Reversible (deletedAt + status
// archived). Skips ids already deleted. Pass an explicit, reviewed list only.
export const adminArchiveItems = internalMutation({
  args: { itemIds: v.array(v.id("items")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    let archived = 0;
    const skipped: string[] = [];
    for (const itemId of args.itemIds) {
      const item = await ctx.db.get(itemId);
      if (!item || item.deletedAt) {
        skipped.push(String(itemId));
        continue;
      }
      await ctx.db.patch(itemId, {
        status: "archived",
        deletedAt: now,
        updatedAt: now,
      });
      archived += 1;
    }
    return { archived, skipped };
  },
});

export const archive = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    itemId: v.id("items"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );

    const item = await ctx.db.get(args.itemId);
    if (
      !item ||
      item.moveId !== args.moveId ||
      item.householdId !== args.householdId
    ) {
      throw new ConvexError("Item not found for this move.");
    }
    const now = Date.now();
    await ctx.db.patch(args.itemId, {
      status: "archived",
      deletedAt: now,
      updatedByUserId: actor.type === "user" ? actor.userId : undefined,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: actor.type,
      actorUserId: actor.type === "user" ? actor.userId : undefined,
      actorApiKeyId: actor.type === "apiKey" ? actor.apiKeyId : undefined,
      category: "inventory",
      action: "item.archived",
      objectTable: "items",
      objectId: args.itemId,
    });
  },
});

// PERMANENTLY delete an item. Unlike archive (reversible — status+deletedAt),
// this removes the row and CANNOT be undone, so shared hard-delete cleanup owns
// the referencing-table list. Terminal queue results and audit logs intentionally
// keep historical ids; live queue targets/media and planning suggestions are
// scrubbed. (B2 photo objects are not deleted here, same as the move purge; only
// the DB rows go.)
export const remove = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    itemId: v.id("items"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const item = await ctx.db.get(args.itemId);
    if (!item || item.moveId !== args.moveId) {
      throw new ConvexError("Item not found for this move.");
    }

    const now = Date.now();
    const summary = await cascadeDeleteItem(ctx, {
      moveId: args.moveId,
      itemId: args.itemId,
      now,
    });
    await ctx.db.delete(args.itemId);

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: actor.type,
      actorUserId: actor.type === "user" ? actor.userId : undefined,
      actorApiKeyId: actor.type === "apiKey" ? actor.apiKeyId : undefined,
      category: "inventory",
      action: "item.deleted",
      objectTable: "items",
      objectId: args.itemId,
      metadata: {
        code: item.code,
        deletedPhotoCount: summary.deletedPhotoCount,
        deletedMembershipCount: summary.deletedMembershipCount,
        deletedListingCount: summary.deletedListingCount,
        deletedPlacementCount: summary.deletedPlacementCount,
        updatedQueueEntryCount: summary.updatedQueueEntryCount,
        updatedPlanningSuggestionCount: summary.updatedPlanningSuggestionCount,
      },
    });

    return summary;
  },
});

// Mark a dump item TRASHED: set disposition=dump and ARCHIVE it — once it's
// trashed we don't own it anymore, so it leaves the active inventory. Distinct
// audit action ("item.trashed") so it can be told apart from a plain archive.
export const markTrashed = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    itemId: v.id("items"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const item = await ctx.db.get(args.itemId);
    if (!item || item.moveId !== args.moveId || item.deletedAt) {
      throw new ConvexError("Item not found for this move.");
    }
    const now = Date.now();
    const archivedListingCount = await archiveActiveSaleListingsForItem(
      ctx,
      args.itemId,
      now,
    );
    await ctx.db.patch(args.itemId, {
      disposition: "dump",
      status: "archived",
      deletedAt: now,
      updatedByUserId: actor.type === "user" ? actor.userId : undefined,
      updatedAt: now,
    });
    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: actor.type,
      actorUserId: actor.type === "user" ? actor.userId : undefined,
      actorApiKeyId: actor.type === "apiKey" ? actor.apiKeyId : undefined,
      category: "inventory",
      action: "item.trashed",
      objectTable: "items",
      objectId: args.itemId,
      metadata: { archivedListingCount },
    });
  },
});
