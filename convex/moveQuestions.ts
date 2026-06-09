import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { summarizeMoveQuestions } from "./lib/moveQuestions";
import { requireMovePermission } from "./lib/permissions";

export const summaryForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read"
    );

    const [move, items, boxes, memberships, photos, resources, zones] =
      await Promise.all([
        ctx.db.get(args.moveId),
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
      ]);

    if (!move || move.householdId !== args.householdId) {
      throw new Error("Move not found.");
    }

    return summarizeMoveQuestions({
      move: toMoveQuestionMove(move),
      items: items
        .filter((item) => item.householdId === args.householdId)
        .map(toMoveQuestionItem),
      boxes: boxes
        .filter((box) => box.householdId === args.householdId)
        .map(toMoveQuestionBox),
      memberships: memberships
        .filter((membership) => membership.householdId === args.householdId)
        .map((membership) => ({
          boxId: String(membership.boxId),
          itemId: String(membership.itemId),
        })),
      photos: photos
        .filter((photo) => photo.householdId === args.householdId)
        .map((photo) => ({
          itemId: photo.itemId ? String(photo.itemId) : undefined,
          boxId: photo.boxId ? String(photo.boxId) : undefined,
          photoType: photo.photoType,
          verificationStatus: photo.verificationStatus,
          archivedAt: photo.archivedAt,
        })),
      resources: resources
        .filter((resource) => resource.householdId === args.householdId)
        .map(toMoveQuestionResource),
      zones: zones
        .filter((zone) => zone.householdId === args.householdId)
        .map((zone) => ({
          zoneId: String(zone._id),
          resourceId: String(zone.resourceId),
          name: zone.name,
          preferredTags: zone.preferredTags,
          archivedAt: zone.archivedAt,
        })),
    });
  },
});

function toMoveQuestionMove(move: Doc<"moves">) {
  return {
    moveId: String(move._id),
    type: move.type,
    title: move.title,
    origin: move.origin,
    destination: move.destination,
    dateStart: move.dateStart,
    dateEnd: move.dateEnd,
    documentationProfileTypes: move.documentationProfileTypes,
    moveLevelWeightAllowanceLb: move.moveLevelWeightAllowanceLb,
    pcsBranch: move.pcsBranch,
    pcsRankPayGrade: move.pcsRankPayGrade,
    pcsDependentStatus: move.pcsDependentStatus,
    pcsShipmentType: move.pcsShipmentType,
    pcsOrdersNumber: move.pcsOrdersNumber,
    pcsAllowanceNotes: move.pcsAllowanceNotes,
    proGearNotes: move.proGearNotes,
    pcsTransportationOfficeNotes: move.pcsTransportationOfficeNotes,
    pcsRestrictedItemsNotes: move.pcsRestrictedItemsNotes,
  };
}

function toMoveQuestionItem(item: Doc<"items">) {
  return {
    itemId: String(item._id),
    disposition: item.disposition,
    status: item.status,
    highValue: item.highValue,
    needsReview: item.needsReview,
    requiresPersonalTransport: item.requiresPersonalTransport,
    planningDefaultKeys: item.planningDefaultKeys,
    valueCents: item.valueCents,
    replacementValueCents: item.replacementValueCents,
    serialNumber: item.serialNumber,
    modelNumber: item.modelNumber,
    weightConfidence: item.weightConfidence,
    volumeConfidence: item.volumeConfidence,
    deletedAt: item.deletedAt,
  };
}

function toMoveQuestionBox(box: Doc<"boxes">) {
  return {
    boxId: String(box._id),
    status: box.status,
    destinationRoom: box.destinationRoom,
    assignedResourceId: box.assignedResourceId
      ? String(box.assignedResourceId)
      : undefined,
    assignmentWarnings: box.assignmentWarnings,
    assignmentHardBlocks: box.assignmentHardBlocks,
    archivedAt: box.archivedAt,
  };
}

function toMoveQuestionResource(resource: Doc<"transportResources">) {
  return {
    resourceId: String(resource._id),
    type: resource.type,
    name: resource.name,
    capacity: resource.capacity,
    capacityReviewStatus: resource.capacityReviewStatus,
    rules: resource.rules,
    archivedAt: resource.archivedAt,
  };
}
