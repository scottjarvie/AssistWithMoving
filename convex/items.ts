import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { recordAuditEvent } from "./lib/audit";
import {
  dimensionsValidator,
  estimateConfidenceValidator,
  itemConditionValidator,
  itemCreatedViaValidator,
  itemDispositionValidator,
  itemFragilityValidator,
  itemStatusValidator,
  normalizeItemName,
  normalizeOptionalText,
  normalizedSearchName,
  planningDefaultKeyValidator,
} from "./lib/moveFields";
import {
  directConvexUserContextRequiredMessage,
  requireMovePermission,
} from "./lib/permissions";

const itemWriteArgs = {
  description: v.optional(v.string()),
  room: v.optional(v.string()),
  destinationRoom: v.optional(v.string()),
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
  estimatedWeightLb: v.optional(v.number()),
  estimatedWeightLowLb: v.optional(v.number()),
  estimatedWeightHighLb: v.optional(v.number()),
  actualWeightLb: v.optional(v.number()),
  estimatedVolumeCuFt: v.optional(v.number()),
  estimatedPackedVolumeCuFt: v.optional(v.number()),
  weightConfidence: v.optional(estimateConfidenceValidator),
  volumeConfidence: v.optional(estimateConfidenceValidator),
  fragility: v.optional(itemFragilityValidator),
  stackable: v.optional(v.boolean()),
  hazardousFlag: v.optional(v.boolean()),
  highValue: v.optional(v.boolean()),
  requiresPersonalTransport: v.optional(v.boolean()),
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

type MutableItemSignals = {
  photoCount: number;
  evidencePhotoCount: number;
  boxCount: number;
  assignedBoxCount: number;
  assignmentCount: number;
  boxCodes: string[];
  assignedResourceNames: string[];
  assignedZoneNames: string[];
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

function redactItemForVisibility(
  item: Doc<"items">,
  visibility: Awaited<ReturnType<typeof requireMovePermission>>["visibility"],
) {
  return {
    ...item,
    valueCents: visibility.estimatedValue ? item.valueCents : undefined,
    replacementValueCents: visibility.estimatedValue
      ? item.replacementValueCents
      : undefined,
    serialNumber: visibility.serialNumber ? item.serialNumber : undefined,
    modelNumber: visibility.serialNumber ? item.modelNumber : undefined,
    privateNotes: visibility.privateNotes ? item.privateNotes : undefined,
  };
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

function defaultItemSignals(): MutableItemSignals {
  return {
    photoCount: 0,
    evidencePhotoCount: 0,
    boxCount: 0,
    assignedBoxCount: 0,
    assignmentCount: 0,
    boxCodes: [],
    assignedResourceNames: [],
    assignedZoneNames: [],
  };
}

function signalsForItem(
  signalsByItemId: Map<string, MutableItemSignals>,
  itemId: Id<"items">,
) {
  const key = String(itemId);
  const existing = signalsByItemId.get(key);
  if (existing) return existing;
  const next = defaultItemSignals();
  signalsByItemId.set(key, next);
  return next;
}

function pushUnique(values: string[], value: string | undefined, limit = 4) {
  if (!value || values.includes(value) || values.length >= limit) return;
  values.push(value);
}

function isEvidencePhoto(photo: Doc<"itemPhotos">) {
  return (
    photo.claimId ||
    photo.privacyLevel === "claimOnly" ||
    ["condition", "damage", "serialNumber", "receipt"].includes(
      photo.photoType,
    ) ||
    photo.documentationProfileTypes.some((type) =>
      ["insuranceClaim", "pcsMove", "movingCompany"].includes(type),
    )
  );
}

async function assertMovePersonTarget(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    ownerPersonId?: Id<"movePeople">;
  },
) {
  if (!args.ownerPersonId) return;
  const person = await ctx.db.get(args.ownerPersonId);
  if (
    !person ||
    person.householdId !== args.householdId ||
    person.moveId !== args.moveId ||
    person.archivedAt
  ) {
    throw new Error("Item owner/contact is not available for this move.");
  }
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

export const listForMoveWithSignals = query({
  args: itemListArgs,
  handler: async (ctx, args) => {
    const policy = await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );

    const [items, boxItems, boxes, photos, resources, zones, people] =
      await Promise.all([
        ctx.db
          .query("items")
          .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
          .order("desc")
          .collect(),
        ctx.db
          .query("boxItems")
          .withIndex("by_move", (q) => q.eq("moveId", args.moveId))
          .collect(),
        ctx.db
          .query("boxes")
          .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
          .collect(),
        ctx.db
          .query("itemPhotos")
          .withIndex("by_move_created", (q) => q.eq("moveId", args.moveId))
          .collect(),
        ctx.db
          .query("transportResources")
          .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
          .collect(),
        ctx.db
          .query("transportZones")
          .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
          .collect(),
        ctx.db
          .query("movePeople")
          .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
          .collect(),
      ]);

    const visibleItems = filterItemRecords(items, args);
    const visibleItemIds = new Set(
      visibleItems.map((item) => String(item._id)),
    );
    const boxById = new Map(
      boxes
        .filter(
          (box) => box.householdId === args.householdId && !box.archivedAt,
        )
        .map((box) => [String(box._id), box]),
    );
    const resourceById = new Map(
      resources
        .filter(
          (resource) =>
            resource.householdId === args.householdId && !resource.archivedAt,
        )
        .map((resource) => [String(resource._id), resource]),
    );
    const zoneById = new Map(
      zones
        .filter(
          (zone) => zone.householdId === args.householdId && !zone.archivedAt,
        )
        .map((zone) => [String(zone._id), zone]),
    );
    const ownerContactById = new Map(
      people
        .filter(
          (person) =>
            person.householdId === args.householdId && !person.archivedAt,
        )
        .map((person) => [
          String(person._id),
          {
            _id: person._id,
            name: person.name,
            role: person.role,
          },
        ]),
    );
    const signalsByItemId = new Map<string, MutableItemSignals>();

    for (const photo of photos) {
      if (
        photo.householdId !== args.householdId ||
        photo.archivedAt ||
        !photo.itemId ||
        !visibleItemIds.has(String(photo.itemId))
      ) {
        continue;
      }
      const signals = signalsForItem(signalsByItemId, photo.itemId);
      signals.photoCount += 1;
      if (isEvidencePhoto(photo)) {
        signals.evidencePhotoCount += 1;
      }
    }

    for (const membership of boxItems) {
      if (
        membership.householdId !== args.householdId ||
        !visibleItemIds.has(String(membership.itemId))
      ) {
        continue;
      }
      const box = boxById.get(String(membership.boxId));
      if (!box) continue;
      const signals = signalsForItem(signalsByItemId, membership.itemId);
      signals.boxCount += 1;
      pushUnique(signals.boxCodes, box.code);

      if (box.assignedResourceId || box.assignedZoneId) {
        signals.assignedBoxCount += 1;
        signals.assignmentCount += 1;
        const resource = box.assignedResourceId
          ? resourceById.get(String(box.assignedResourceId))
          : null;
        const zone = box.assignedZoneId
          ? zoneById.get(String(box.assignedZoneId))
          : null;
        pushUnique(signals.assignedResourceNames, resource?.name);
        pushUnique(signals.assignedZoneNames, zone?.name);
      }
    }

    return visibleItems.map((item) => ({
      ...redactItemForVisibility(item, policy.visibility),
      signals: signalsByItemId.get(String(item._id)) ?? defaultItemSignals(),
      ownerContact: item.ownerPersonId
        ? ownerContactById.get(String(item.ownerPersonId))
        : undefined,
    }));
  },
});

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
    await assertMovePersonTarget(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      ownerPersonId: args.ownerPersonId,
    });

    const now = Date.now();
    const name = normalizeItemName(args.name);
    const itemId = await ctx.db.insert("items", {
      householdId: args.householdId,
      moveId: args.moveId,
      name,
      normalizedName: normalizedSearchName(name),
      description: normalizeOptionalText(args.description),
      room: normalizeOptionalText(args.room),
      destinationRoom: normalizeOptionalText(args.destinationRoom),
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
      estimatedWeightLb: args.estimatedWeightLb,
      estimatedWeightLowLb: args.estimatedWeightLowLb,
      estimatedWeightHighLb: args.estimatedWeightHighLb,
      actualWeightLb: args.actualWeightLb,
      estimatedVolumeCuFt: args.estimatedVolumeCuFt,
      estimatedPackedVolumeCuFt: args.estimatedPackedVolumeCuFt,
      weightConfidence: args.weightConfidence ?? "none",
      volumeConfidence: args.volumeConfidence ?? "none",
      fragility: args.fragility ?? "low",
      stackable: args.stackable ?? true,
      hazardousFlag: args.hazardousFlag ?? false,
      highValue: args.highValue ?? false,
      requiresPersonalTransport: args.requiresPersonalTransport ?? false,
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
    await assertMovePersonTarget(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      ownerPersonId: args.ownerPersonId,
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

    const patch: Partial<Doc<"items">> = {
      updatedByUserId: actor.userId,
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) {
      patch.name = normalizeItemName(args.name);
      patch.normalizedName = normalizedSearchName(args.name);
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
    if (args.category !== undefined) {
      patch.category = normalizeOptionalText(args.category);
    }
    if (args.subcategory !== undefined) {
      patch.subcategory = normalizeOptionalText(args.subcategory);
    }
    if (args.clearOwnerPersonId) {
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
    if (args.estimatedWeightLb !== undefined) {
      patch.estimatedWeightLb = args.estimatedWeightLb;
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
    if (args.estimatedVolumeCuFt !== undefined) {
      patch.estimatedVolumeCuFt = args.estimatedVolumeCuFt;
    }
    if (args.estimatedPackedVolumeCuFt !== undefined) {
      patch.estimatedPackedVolumeCuFt = args.estimatedPackedVolumeCuFt;
    }
    if (args.weightConfidence !== undefined) {
      patch.weightConfidence = args.weightConfidence;
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

    await ctx.db.patch(args.itemId, {
      status: "archived",
      deletedAt: Date.now(),
      updatedByUserId: actor.type === "user" ? actor.userId : undefined,
      updatedAt: Date.now(),
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
