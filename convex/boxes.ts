import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  query,
  type QueryCtx,
} from "./_generated/server";
import { AuthorizationError } from "./lib/auth";
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
import { resolveBoxWeight } from "./lib/boxWeight";
import {
  estimateItem,
  resolveStoredVolumeCuFt,
  sumEstimateValues,
  volumeCuFtForUpdate,
} from "./lib/estimateEngine";
import {
  archiveActiveSaleListingsForItem,
  cascadeDeleteBox,
} from "./lib/hardDelete";
import {
  boxStatusValidator,
  dimensionsValidator,
  isReservedUnitCode,
  normalizeBoxCode,
  normalizeOptionalText,
} from "./lib/moveFields";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";
import { boxContainerType } from "./schema";

const boxWriteArgs = {
  code: v.optional(v.string()),
  containerType: v.optional(boxContainerType),
  label: v.optional(v.string()),
  nickname: v.optional(v.string()),
  currentSpaceId: v.optional(v.id("moveSpaces")),
  room: v.optional(v.string()),
  destinationRoom: v.optional(v.string()),
  description: v.optional(v.string()),
  moveDayNote: v.optional(v.string()),
  status: v.optional(boxStatusValidator),
  dimensionsIn: v.optional(dimensionsValidator),
  estimatedWeightLb: v.optional(v.number()),
  actualWeightLb: v.optional(v.number()),
  estimatedVolumeCuFt: v.optional(v.number()),
  assignedResourceId: v.optional(v.id("transportResources")),
  assignedZoneId: v.optional(v.id("transportZones")),
  assignmentLocked: v.optional(v.boolean()),
  assignmentOverrideReason: v.optional(v.string()),
  clearAssignedResource: v.optional(v.boolean()),
  clearAssignedZone: v.optional(v.boolean()),
  // Clear the present-location room (currentSpaceId). Used when a unit's present
  // location switches to a transport, which owns the location instead.
  clearCurrentSpace: v.optional(v.boolean()),
};

export async function assertResourceAndZone(
  ctx: MutationCtx,
  args: {
    moveId: Id<"moves">;
    assignedResourceId?: Id<"transportResources">;
    assignedZoneId?: Id<"transportZones">;
  },
) {
  if (args.assignedResourceId) {
    const resource = await ctx.db.get(args.assignedResourceId);
    if (!resource || resource.moveId !== args.moveId || resource.archivedAt) {
      throw new ConvexError("Invalid transport resource.");
    }
  }

  if (args.assignedZoneId) {
    const zone = await ctx.db.get(args.assignedZoneId);
    if (!zone || zone.moveId !== args.moveId || zone.archivedAt) {
      throw new ConvexError("Invalid transport zone.");
    }
    if (
      args.assignedResourceId &&
      zone.resourceId !== args.assignedResourceId
    ) {
      throw new ConvexError("Zone does not belong to the assigned resource.");
    }
  }
}

// Every container — box, tote, bin, crate, etc. — draws from ONE shared number
// pool (B-###). A tote is just a box with a different containerType; it should
// never get its own number sequence. (Historically totes got T-### — see the
// renumberTotesIntoBoxPool backfill that merges old T-### codes into this pool.)
async function generateBoxCode(ctx: MutationCtx, moveId: Id<"moves">) {
  const boxes = await ctx.db
    .query("boxes")
    .withIndex("by_move_code", (q) => q.eq("moveId", moveId))
    .collect();
  const existingCodes = new Set(boxes.map((box) => box.code));

  // Continue from the highest existing B-### number in the move.
  let maxIndex = 0;
  for (const box of boxes) {
    const match = /^B-(\d+)$/.exec(box.code);
    if (match) maxIndex = Math.max(maxIndex, Number(match[1]));
  }

  for (let index = maxIndex + 1; index < maxIndex + 1001; index += 1) {
    const code = `B-${String(index).padStart(3, "0")}`;
    if (!existingCodes.has(code)) {
      return code;
    }
  }

  throw new Error("Could not generate a unique unit code.");
}

// Read-only census of how units are numbered, so we can see the legacy T-###
// tote situation before/after the renumber backfill below. Paginated.
export const censusBoxCodes = internalQuery({
  args: { cursor: v.optional(v.string()), batch: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("boxes")
      .paginate({ cursor: args.cursor ?? null, numItems: args.batch ?? 500 });
    let total = 0;
    let bPrefix = 0;
    let tPrefix = 0;
    let otherPrefix = 0;
    let plasticTotes = 0;
    let totesWithTCode = 0;
    const tExamples: { code: string; containerType?: string }[] = [];
    for (const box of page.page) {
      if (box.archivedAt) continue;
      total += 1;
      const isB = /^B-\d+$/.test(box.code);
      const isT = /^T-\d+$/.test(box.code);
      if (isB) bPrefix += 1;
      else if (isT) tPrefix += 1;
      else otherPrefix += 1;
      if (box.containerType === "plasticTote") {
        plasticTotes += 1;
        if (isT) totesWithTCode += 1;
      }
      if (isT && tExamples.length < 10) {
        tExamples.push({ code: box.code, containerType: box.containerType });
      }
    }
    return {
      total,
      bPrefix,
      tPrefix,
      otherPrefix,
      plasticTotes,
      totesWithTCode,
      tExamples,
      isDone: page.isDone,
      cursor: page.continueCursor,
    };
  },
});

// One-time backfill: merge legacy T-### tote codes into the shared B-### pool,
// per move, so totes are numbered like every other box. Idempotent — a second
// run finds no T-### codes. Pass a moveId to scope it; otherwise it renumbers
// every move that still has T-### codes. Preserves containerType (the "this was a
// tote" attribute survives — only the CODE changes). Returns the old->new map.
export const renumberTotesIntoBoxPool = internalMutation({
  args: { moveId: v.optional(v.id("moves")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const isToteCode = (code: string) => /^T-\d+$/.test(code);
    const toteNumber = (code: string) => Number(/^T-(\d+)$/.exec(code)![1]);

    let moveIds: Id<"moves">[];
    if (args.moveId) {
      moveIds = [args.moveId];
    } else {
      const all = await ctx.db.query("boxes").collect();
      const ids = new Set<string>();
      for (const box of all) {
        if (!box.archivedAt && isToteCode(box.code)) ids.add(String(box.moveId));
      }
      moveIds = [...ids] as Id<"moves">[];
    }

    const renamed: { boxId: string; from: string; to: string }[] = [];
    for (const moveId of moveIds) {
      const boxes = await ctx.db
        .query("boxes")
        .withIndex("by_move_code", (q) => q.eq("moveId", moveId))
        .collect();
      const taken = new Set(boxes.map((box) => box.code));
      let maxB = 0;
      for (const box of boxes) {
        const match = /^B-(\d+)$/.exec(box.code);
        if (match) maxB = Math.max(maxB, Number(match[1]));
      }
      // Renumber in original T-order so the relative ordering is stable.
      const totes = boxes
        .filter((box) => !box.archivedAt && isToteCode(box.code))
        .sort((a, b) => toteNumber(a.code) - toteNumber(b.code));
      for (const tote of totes) {
        let next = "";
        do {
          next = `B-${String(++maxB).padStart(3, "0")}`;
        } while (taken.has(next));
        taken.add(next);
        taken.delete(tote.code);
        await ctx.db.patch(tote._id, { code: next, updatedAt: now });
        renamed.push({ boxId: String(tote._id), from: tote.code, to: next });
      }
    }
    return {
      movesProcessed: moveIds.length,
      renamedCount: renamed.length,
      renamed,
    };
  },
});

async function ensureUniqueBoxCode(
  ctx: MutationCtx,
  moveId: Id<"moves">,
  code: string,
  currentBoxId?: Id<"boxes">,
) {
  const existing = await ctx.db
    .query("boxes")
    .withIndex("by_move_code", (q) => q.eq("moveId", moveId).eq("code", code))
    .unique();

  if (existing && existing._id !== currentBoxId) {
    throw new Error("A box with that code already exists.");
  }
}

async function boxContents(ctx: QueryCtx, box: Doc<"boxes">) {
  const memberships = await ctx.db
    .query("boxItems")
    .withIndex("by_box", (q) => q.eq("boxId", box._id))
    .collect();

  const contents = await Promise.all(
    memberships.map(async (membership) => {
      const item = await ctx.db.get(membership.itemId);
      return item && !item.deletedAt ? { membership, item } : null;
    }),
  );

  return contents.filter(Boolean);
}

function contentsEstimatedWeight(
  contents: Awaited<ReturnType<typeof boxContents>>,
) {
  return sumEstimateValues(
    contents.map((entry) =>
      entry
        ? estimateItem({
            ...entry.item,
            quantity: entry.membership.quantity,
          }).weight
        : undefined,
    ),
  );
}

export async function loadAssignmentValidation(
  ctx: MutationCtx,
  args: {
    moveId: Id<"moves">;
    boxId?: Id<"boxes">;
    assignedResourceId?: Id<"transportResources">;
    assignedZoneId?: Id<"transportZones">;
    dimensionsIn?: Doc<"boxes">["dimensionsIn"];
    estimatedWeightLb?: number;
    actualWeightLb?: number;
    estimatedVolumeCuFt?: number;
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

  const [resource, zone, memberships] = await Promise.all([
    ctx.db.get(args.assignedResourceId),
    args.assignedZoneId
      ? ctx.db.get(args.assignedZoneId)
      : Promise.resolve(null),
    args.boxId
      ? ctx.db
          .query("boxItems")
          .withIndex("by_box", (q) => q.eq("boxId", args.boxId!))
          .collect()
      : Promise.resolve([]),
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
  const validation = validateAssignment({
    box: {
      estimatedWeightLb:
        args.actualWeightLb ?? args.estimatedWeightLb ?? contentsWeight,
      estimatedVolumeCuFt: args.estimatedVolumeCuFt ?? contentsVolume,
      dimensionsIn: args.dimensionsIn,
      itemCount: activeContents.reduce(
        (sum, entry) => sum + entry.membership.quantity,
        0,
      ),
      hasFragile: activeContents.some(
        (entry) => entry.item.fragility === "high",
      ),
      hasHighValue: activeContents.some((entry) => entry.item.highValue),
      hasSensitive: activeContents.some((entry) =>
        entry.item.planningDefaultKeys.includes("sensitive"),
      ),
      hasPersonalTransport: activeContents.some(
        (entry) => entry.item.requiresPersonalTransport,
      ),
      hasHazardous: activeContents.some((entry) => entry.item.hazardousFlag),
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
      "inventory:read",
    );

    const boxes = await ctx.db
      .query("boxes")
      .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
      .order("desc")
      .collect();

    return await Promise.all(
      boxes
        .filter((box) => args.includeArchived || !box.archivedAt)
        .map(async (box) => {
          const contents = await boxContents(ctx, box);
          const itemCount = contents.reduce(
            (sum, entry) => sum + (entry?.membership.quantity ?? 0),
            0,
          );
          const contentsEstimatedWeightLb = contentsEstimatedWeight(contents);
          const weightSummary = resolveBoxWeight({
            actualWeightLb: box.actualWeightLb,
            estimatedWeightLb: box.estimatedWeightLb,
            contentsEstimatedWeightLb,
          });

          return {
            box,
            contents,
            itemCount,
            contentsEstimatedWeightLb,
            weightSummary,
          };
        }),
    );
  },
});

export const get = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    boxId: v.id("boxes"),
  },
  handler: async (ctx, args) => {
    try {
      await requireMovePermission(
        ctx,
        args.householdId,
        args.moveId,
        "inventory:read",
      );
    } catch (error) {
      // The current session can't see this move (e.g. signed into a different
      // household/account, or a stale login). Degrade to "not found" so the unit
      // page shows a friendly empty state instead of throwing from useQuery and
      // crashing the whole app via the global error boundary.
      if (error instanceof AuthorizationError) return null;
      throw error;
    }

    const box = await ctx.db.get(args.boxId);
    if (
      !box ||
      box.householdId !== args.householdId ||
      box.moveId !== args.moveId ||
      box.archivedAt
    ) {
      return null;
    }

    const contents = await boxContents(ctx, box);
    const itemCount = contents.reduce(
      (sum, entry) => sum + (entry?.membership.quantity ?? 0),
      0,
    );
    const contentsEstimatedWeightLb = contentsEstimatedWeight(contents);
    const weightSummary = resolveBoxWeight({
      actualWeightLb: box.actualWeightLb,
      estimatedWeightLb: box.estimatedWeightLb,
      contentsEstimatedWeightLb,
    });

    return {
      box,
      contents,
      itemCount,
      contentsEstimatedWeightLb,
      weightSummary,
    };
  },
});

export const create = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    ...boxWriteArgs,
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

    await assertResourceAndZone(ctx, args);

    const now = Date.now();
    const code = args.code
      ? normalizeBoxCode(args.code)
      : await generateBoxCode(ctx, args.moveId);
    if (!code) {
      throw new Error("Box code is required.");
    }
    if (args.code && isReservedUnitCode(code)) {
      throw new Error(
        'Unit codes can\'t start with "I" — that prefix is reserved for items (item-0001). Try another letter such as B for a box.',
      );
    }
    await ensureUniqueBoxCode(ctx, args.moveId, code);

    const assignmentValidation = await loadAssignmentValidation(ctx, {
      moveId: args.moveId,
      assignedResourceId: args.assignedResourceId,
      assignedZoneId: args.assignedZoneId,
      dimensionsIn: args.dimensionsIn,
      estimatedWeightLb: args.estimatedWeightLb,
      actualWeightLb: args.actualWeightLb,
      estimatedVolumeCuFt: args.estimatedVolumeCuFt,
      assignmentOverrideReason: args.assignmentOverrideReason,
    });
    const status = args.status ?? "open";
    const boxId = await ctx.db.insert("boxes", {
      householdId: args.householdId,
      moveId: args.moveId,
      code,
      containerType: args.containerType,
      label: normalizeOptionalText(args.label),
      nickname: normalizeOptionalText(args.nickname),
      currentSpaceId: args.currentSpaceId,
      room: normalizeOptionalText(args.room),
      destinationRoom: normalizeOptionalText(args.destinationRoom),
      description: normalizeOptionalText(args.description),
      moveDayNote: normalizeOptionalText(args.moveDayNote),
      status,
      dimensionsIn: args.dimensionsIn,
      estimatedWeightLb: args.estimatedWeightLb,
      actualWeightLb: args.actualWeightLb,
      // Persist volume from dimensions when no explicit volume was given.
      estimatedVolumeCuFt: resolveStoredVolumeCuFt(args),
      assignedResourceId: args.assignedResourceId,
      assignedZoneId: args.assignedZoneId,
      assignmentLocked: args.assignmentLocked ?? false,
      assignmentOverrideReason: normalizeOptionalText(
        args.assignmentOverrideReason,
      ),
      ...assignmentValidation,
      sealedAt: status === "sealed" ? now : undefined,
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "box.created",
      objectTable: "boxes",
      objectId: boxId,
      metadata: { code, status },
    });

    return boxId;
  },
});

// Turn a misclassified item (a physical tote/box that was entered as an item, so
// it has an item-#### code) into a real container with a B-### number. Copies the
// item's name/room/size/placement onto a new box, moves its photos across, then
// retires the item. The new box starts empty and can hold items.
// Shared conversion: build a box from an item, move its photos across, retire the
// item. Used by the user-facing mutation AND the admin/CLI bulk cleanup.
export async function convertItemToBoxCore(
  ctx: MutationCtx,
  item: Doc<"items">,
  containerType: Doc<"boxes">["containerType"] | undefined,
  createdByUserId: Id<"users">,
  now: number,
  actorType: "user" | "agent" = "user",
): Promise<{ boxId: Id<"boxes">; code: string }> {
  // A container can't also be packed inside another container — drop any
  // membership this item had before it becomes a box.
  const memberships = await ctx.db
    .query("boxItems")
    .withIndex("by_item", (q) => q.eq("itemId", item._id))
    .collect();
  for (const membership of memberships) {
    await ctx.db.delete(membership._id);
  }

  const code = await generateBoxCode(ctx, item.moveId);
  // The item already carried this assignment, so converting it just preserves
  // that — pass an override reason so a soft capacity warning doesn't block the
  // migration (it would otherwise throw for a heavy tote already on a truck).
  const overrideReason = item.assignedResourceId
    ? "Converted from item to box (kept its existing transport assignment)"
    : undefined;
  const assignmentValidation = await loadAssignmentValidation(ctx, {
    moveId: item.moveId,
    assignedResourceId: item.assignedResourceId,
    assignedZoneId: item.assignedZoneId,
    dimensionsIn: item.dimensionsIn,
    estimatedWeightLb: item.estimatedWeightLb,
    actualWeightLb: item.actualWeightLb,
    estimatedVolumeCuFt: item.estimatedVolumeCuFt,
    assignmentOverrideReason: overrideReason,
  });
  const boxId = await ctx.db.insert("boxes", {
    householdId: item.householdId,
    moveId: item.moveId,
    code,
    containerType: containerType ?? "plasticTote",
    label: undefined,
    nickname: normalizeOptionalText(item.name),
    currentSpaceId: item.currentSpaceId,
    room: normalizeOptionalText(item.room),
    destinationRoom: normalizeOptionalText(item.destinationRoom),
    description: normalizeOptionalText(item.description),
    moveDayNote: undefined,
    status: "open",
    dimensionsIn: item.dimensionsIn,
    estimatedWeightLb: item.estimatedWeightLb,
    actualWeightLb: item.actualWeightLb,
    estimatedVolumeCuFt: item.estimatedVolumeCuFt,
    assignedResourceId: item.assignedResourceId,
    assignedZoneId: item.assignedZoneId,
    assignmentLocked: false,
    assignmentOverrideReason: normalizeOptionalText(overrideReason),
    ...assignmentValidation,
    sealedAt: undefined,
    createdByUserId,
    createdAt: now,
    updatedAt: now,
  });

  // Move the item's photos onto the new container so its picture follows.
  const photos = await ctx.db
    .query("itemPhotos")
    .withIndex("by_item_created", (q) => q.eq("itemId", item._id))
    .collect();
  for (const photo of photos) {
    if (photo.archivedAt) continue;
    await ctx.db.patch(photo._id, { itemId: undefined, boxId, updatedAt: now });
  }

  const archivedListingCount = await archiveActiveSaleListingsForItem(
    ctx,
    item._id,
    now,
  );

  // Retire the now-converted item. Active sale listings are archived above so a
  // sell workflow never keeps pointing at an item that no longer exists.
  await ctx.db.patch(item._id, {
    status: "archived",
    deletedAt: now,
    updatedByUserId: createdByUserId,
    updatedAt: now,
  });

  await recordAuditEvent(ctx, {
    householdId: item.householdId,
    moveId: item.moveId,
    actorType,
    actorUserId: createdByUserId,
    category: "inventory",
    action: "item.converted_to_box",
    objectTable: "boxes",
    objectId: boxId,
    metadata: { code, fromItemId: String(item._id), archivedListingCount },
  });

  return { boxId, code };
}

export const convertItemToBox = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    itemId: v.id("items"),
    containerType: v.optional(boxContainerType),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    if (actor.type !== "user") {
      throw new ConvexError(directConvexUserContextRequiredMessage);
    }
    const item = await ctx.db.get(args.itemId);
    if (!item || item.moveId !== args.moveId || item.deletedAt) {
      throw new ConvexError("Item not found for this move.");
    }
    return convertItemToBoxCore(
      ctx,
      item,
      args.containerType,
      actor.userId,
      Date.now(),
    );
  },
});

// PERMANENTLY delete a box/tote. Removes the row and CANNOT be undone, so it
// cascades the box's own photos and UNPACKS any items still inside it (drops the
// boxItems memberships) — the user's actual item records survive as loose items
// rather than being deleted with the container. (B2 photo objects are not
// deleted here, same as the move purge; only the DB rows go.)
export const remove = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    boxId: v.id("boxes"),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:edit",
    );
    const box = await ctx.db.get(args.boxId);
    if (!box || box.moveId !== args.moveId) {
      throw new ConvexError("Box not found for this move.");
    }

    const summary = await cascadeDeleteBox(ctx, {
      moveId: args.moveId,
      boxId: args.boxId,
      now: Date.now(),
    });
    await ctx.db.delete(args.boxId);

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: actor.type,
      actorUserId: actor.type === "user" ? actor.userId : undefined,
      actorApiKeyId: actor.type === "apiKey" ? actor.apiKeyId : undefined,
      category: "inventory",
      action: "box.deleted",
      objectTable: "boxes",
      objectId: args.boxId,
      metadata: {
        code: box.code,
        deletedPhotoCount: summary.deletedPhotoCount,
        unpackedItemCount: summary.unpackedItemCount,
        deletedPlacementCount: summary.deletedPlacementCount,
        updatedQueueEntryCount: summary.updatedQueueEntryCount,
        updatedPlanningSuggestionCount: summary.updatedPlanningSuggestionCount,
      },
    });

    return summary;
  },
});

// Admin/CLI bulk cleanup: convert a list of misclassified items (totes/bins that
// were entered as items) into boxes in one shot. Skips ids that aren't active
// items. Returns the old item code → new box code mapping.
export const adminConvertItemsToBoxes = internalMutation({
  args: {
    itemIds: v.array(v.id("items")),
    containerType: v.optional(boxContainerType),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const converted: { itemId: string; itemCode: string; boxCode: string }[] =
      [];
    const skipped: string[] = [];
    for (const itemId of args.itemIds) {
      const item = await ctx.db.get(itemId);
      if (!item || item.deletedAt) {
        skipped.push(String(itemId));
        continue;
      }
      const result = await convertItemToBoxCore(
        ctx,
        item,
        args.containerType,
        item.createdByUserId,
        now,
      );
      converted.push({
        itemId: String(itemId),
        itemCode: item.code ?? "",
        boxCode: result.code,
      });
    }
    return { convertedCount: converted.length, converted, skipped };
  },
});

export const update = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    boxId: v.id("boxes"),
    ...boxWriteArgs,
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

    const box = await ctx.db.get(args.boxId);
    if (
      !box ||
      box.moveId !== args.moveId ||
      box.householdId !== args.householdId
    ) {
      throw new Error("Box not found.");
    }

    const now = Date.now();
    const patch: Partial<Doc<"boxes">> = { updatedAt: now };
    if (args.code !== undefined) {
      const code = normalizeBoxCode(args.code);
      if (!code) {
        throw new Error("Box code is required.");
      }
      if (isReservedUnitCode(code)) {
        throw new Error(
          'Unit codes can\'t start with "I" — that prefix is reserved for items (item-0001). Try another letter such as B for a box.',
        );
      }
      await ensureUniqueBoxCode(ctx, args.moveId, code, args.boxId);
      patch.code = code;
    }
    if (args.containerType !== undefined) patch.containerType = args.containerType;
    if (args.label !== undefined)
      patch.label = normalizeOptionalText(args.label);
    if (args.nickname !== undefined)
      patch.nickname = normalizeOptionalText(args.nickname);
    if (args.clearCurrentSpace) patch.currentSpaceId = undefined;
    else if (args.currentSpaceId !== undefined)
      patch.currentSpaceId = args.currentSpaceId;
    if (args.room !== undefined) patch.room = normalizeOptionalText(args.room);
    if (args.destinationRoom !== undefined) {
      patch.destinationRoom = normalizeOptionalText(args.destinationRoom);
    }
    if (args.description !== undefined) {
      patch.description = normalizeOptionalText(args.description);
    }
    if (args.moveDayNote !== undefined) {
      patch.moveDayNote = normalizeOptionalText(args.moveDayNote);
    }
    if (args.status !== undefined) {
      patch.status = args.status;
      patch.archivedAt = args.status === "archived" ? now : undefined;
      patch.sealedAt =
        args.status === "sealed" ? (box.sealedAt ?? now) : box.sealedAt;
    }
    if (args.dimensionsIn !== undefined) patch.dimensionsIn = args.dimensionsIn;
    if (args.estimatedWeightLb !== undefined) {
      patch.estimatedWeightLb = args.estimatedWeightLb;
    }
    if (args.actualWeightLb !== undefined)
      patch.actualWeightLb = args.actualWeightLb;
    // Recompute volume from dimensions when dims change without an explicit
    // volume, so editing a box's dims via API/MCP keeps its volume in sync.
    const boxVolumeUpdate = volumeCuFtForUpdate({
      volumeProvided: args.estimatedVolumeCuFt !== undefined,
      estimatedVolumeCuFt: args.estimatedVolumeCuFt,
      dimensionsProvided: args.dimensionsIn !== undefined,
      dimensionsIn: args.dimensionsIn,
    });
    if (boxVolumeUpdate.set) {
      patch.estimatedVolumeCuFt = boxVolumeUpdate.value;
    }
    if (args.assignedResourceId !== undefined) {
      patch.assignedResourceId = args.assignedResourceId;
    }
    if (args.assignedZoneId !== undefined)
      patch.assignedZoneId = args.assignedZoneId;
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
        : (patch.assignedResourceId ?? box.assignedResourceId);
    if (nextAssignedResourceId) {
      const validation = await loadAssignmentValidation(ctx, {
        moveId: args.moveId,
        boxId: args.boxId,
        assignedResourceId: nextAssignedResourceId,
        assignedZoneId:
          args.clearAssignedZone === true
            ? undefined
            : (patch.assignedZoneId ?? box.assignedZoneId),
        dimensionsIn: patch.dimensionsIn ?? box.dimensionsIn,
        estimatedWeightLb: patch.estimatedWeightLb ?? box.estimatedWeightLb,
        actualWeightLb: patch.actualWeightLb ?? box.actualWeightLb,
        estimatedVolumeCuFt:
          patch.estimatedVolumeCuFt ?? box.estimatedVolumeCuFt,
        assignmentOverrideReason:
          patch.assignmentOverrideReason ?? box.assignmentOverrideReason,
      });
      patch.assignmentWarnings = validation.assignmentWarnings;
      patch.assignmentHardBlocks = validation.assignmentHardBlocks;
      patch.assignmentValidatedAt = validation.assignmentValidatedAt;
    }

    await assertResourceAndZone(ctx, {
      moveId: args.moveId,
      assignedResourceId: nextAssignedResourceId,
      assignedZoneId:
        args.clearAssignedResource || args.clearAssignedZone
          ? undefined
          : (patch.assignedZoneId ?? box.assignedZoneId),
    });

    await ctx.db.patch(args.boxId, patch);

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "box.updated",
      objectTable: "boxes",
      objectId: args.boxId,
      metadata: {
        changedKeys: Object.keys(patch),
        ...(patch.status && patch.status !== box.status
          ? { statusFrom: box.status, statusTo: patch.status }
          : {}),
      },
    });
  },
});

// UI batch editor: apply the SAME per-field patch + load validation as
// boxes.update across up to 100 boxes. Non-assignment fields (status, room,
// destinationRoom) are patched directly here exactly as update does; the
// assignment fields are delegated to the shared batchAssign helper so load
// validation is single-sourced. Per-row results + one audit event per changed
// box (box.batch_updated). Honors assignmentLocked and dryRun.
export const batchUpdate = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    boxIds: v.array(v.id("boxes")),
    patch: v.object({
      status: v.optional(boxStatusValidator),
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
    if (args.boxIds.length > BATCH_ASSIGN_MAX_ROWS) {
      throw new Error(
        `Batch box updates are limited to ${BATCH_ASSIGN_MAX_ROWS} boxes.`,
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

    // Non-assignment field patch, identical normalization to boxes.update.
    const touchesFields =
      args.patch.status !== undefined ||
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

    for (const [index, boxId] of args.boxIds.entries()) {
      try {
        const box = await ctx.db.get(boxId);
        if (
          !box ||
          box.householdId !== args.householdId ||
          box.moveId !== args.moveId ||
          box.archivedAt
        ) {
          throw new Error("Box not found.");
        }
        if (touchesAssignment && box.assignmentLocked) {
          throw new Error("Locked assignments must be changed manually.");
        }

        // Validate assignment through the shared single-source helper.
        let assignmentResult: Awaited<ReturnType<typeof runBatchAssign>> | null =
          null;
        if (touchesAssignment) {
          assignmentResult = await runBatchAssign(ctx, {
            householdId: args.householdId,
            moveId: args.moveId,
            actorUserId: actor.userId,
            rows: [{ kind: "box", recordId: box._id }],
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
          const fieldPatch: Partial<Doc<"boxes">> = { updatedAt: now };
          if (args.patch.status !== undefined) {
            fieldPatch.status = args.patch.status;
            fieldPatch.archivedAt =
              args.patch.status === "archived" ? now : undefined;
            fieldPatch.sealedAt =
              args.patch.status === "sealed" ? (box.sealedAt ?? now) : box.sealedAt;
          }
          if (args.patch.room !== undefined) {
            fieldPatch.room = normalizeOptionalText(args.patch.room);
          }
          if (args.patch.destinationRoom !== undefined) {
            fieldPatch.destinationRoom = normalizeOptionalText(
              args.patch.destinationRoom,
            );
          }
          await ctx.db.patch(box._id, fieldPatch);
        }

        if (!dryRun) {
          await recordAuditEvent(ctx, {
            householdId: args.householdId,
            moveId: args.moveId,
            actorType: "user",
            actorUserId: actor.userId,
            category: "inventory",
            action: "box.batch_updated",
            objectTable: "boxes",
            objectId: box._id,
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
          recordId: box._id,
          assignmentWarnings: assignmentRow?.assignmentWarnings,
          assignmentHardBlocks: assignmentRow?.assignmentHardBlocks,
          dryRun,
        });
      } catch (error) {
        results.push({
          index,
          ok: false,
          recordId: String(boxId),
          error: error instanceof Error ? error.message : "Box update failed.",
          dryRun,
        });
      }
    }

    const failed = results.filter((result) => !result.ok).length;
    return {
      dryRun,
      total: args.boxIds.length,
      succeeded: args.boxIds.length - failed,
      failed,
      results,
    };
  },
});

export const addItem = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    boxId: v.id("boxes"),
    itemId: v.id("items"),
    quantity: v.optional(v.number()),
    notes: v.optional(v.string()),
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

    const [box, item] = await Promise.all([
      ctx.db.get(args.boxId),
      ctx.db.get(args.itemId),
    ]);
    if (!box || box.moveId !== args.moveId || box.archivedAt) {
      throw new Error("Box not found.");
    }
    if (!item || item.moveId !== args.moveId || item.deletedAt) {
      throw new Error("Item not found.");
    }

    const now = Date.now();
    const quantity = args.quantity && args.quantity > 0 ? args.quantity : 1;
    const existing = await ctx.db
      .query("boxItems")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();
    const existingForMove = existing.find(
      (membership) => membership.moveId === args.moveId,
    );

    if (existingForMove) {
      await ctx.db.patch(existingForMove._id, {
        boxId: args.boxId,
        quantity,
        notes: normalizeOptionalText(args.notes),
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("boxItems", {
        householdId: args.householdId,
        moveId: args.moveId,
        boxId: args.boxId,
        itemId: args.itemId,
        quantity,
        notes: normalizeOptionalText(args.notes),
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.itemId, {
      status: item.status === "active" ? "packed" : item.status,
      updatedByUserId: actor.userId,
      updatedAt: now,
    });

    const boxPatch: Partial<Doc<"boxes">> = {
      status: "packing",
      updatedAt: now,
    };
    if (box.assignedResourceId) {
      const validation = await loadAssignmentValidation(ctx, {
        moveId: args.moveId,
        boxId: args.boxId,
        assignedResourceId: box.assignedResourceId,
        assignedZoneId: box.assignedZoneId,
        dimensionsIn: box.dimensionsIn,
        estimatedWeightLb: box.estimatedWeightLb,
        actualWeightLb: box.actualWeightLb,
        estimatedVolumeCuFt: box.estimatedVolumeCuFt,
        assignmentOverrideReason: box.assignmentOverrideReason,
        enforce: false,
      });
      boxPatch.assignmentWarnings = validation.assignmentWarnings;
      boxPatch.assignmentHardBlocks = validation.assignmentHardBlocks;
      boxPatch.assignmentValidatedAt = validation.assignmentValidatedAt;
    }
    await ctx.db.patch(args.boxId, boxPatch);

    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "box.item_added",
      objectTable: "boxes",
      objectId: args.boxId,
      metadata: { itemId: args.itemId, quantity },
    });
  },
});

export const removeItem = mutation({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    boxItemId: v.id("boxItems"),
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

    const membership = await ctx.db.get(args.boxItemId);
    if (
      !membership ||
      membership.moveId !== args.moveId ||
      membership.householdId !== args.householdId
    ) {
      throw new Error("Box item not found.");
    }

    await ctx.db.delete(args.boxItemId);
    const box = await ctx.db.get(membership.boxId);
    if (box?.assignedResourceId) {
      const validation = await loadAssignmentValidation(ctx, {
        moveId: args.moveId,
        boxId: membership.boxId,
        assignedResourceId: box.assignedResourceId,
        assignedZoneId: box.assignedZoneId,
        dimensionsIn: box.dimensionsIn,
        estimatedWeightLb: box.estimatedWeightLb,
        actualWeightLb: box.actualWeightLb,
        estimatedVolumeCuFt: box.estimatedVolumeCuFt,
        assignmentOverrideReason: box.assignmentOverrideReason,
      });
      await ctx.db.patch(membership.boxId, {
        assignmentWarnings: validation.assignmentWarnings,
        assignmentHardBlocks: validation.assignmentHardBlocks,
        assignmentValidatedAt: validation.assignmentValidatedAt,
        updatedAt: Date.now(),
      });
    }
    await recordAuditEvent(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      actorType: "user",
      actorUserId: actor.userId,
      category: "inventory",
      action: "box.item_removed",
      objectTable: "boxes",
      objectId: membership.boxId,
      metadata: { itemId: membership.itemId },
    });
  },
});
