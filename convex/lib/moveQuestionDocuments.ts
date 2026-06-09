import type { Doc, Id } from "../_generated/dataModel";
import { summarizeMoveQuestions } from "./moveQuestions";

export function summarizeMoveQuestionsFromDocs(args: {
  householdId: Id<"households">;
  move: Doc<"moves">;
  items: Doc<"items">[];
  boxes: Doc<"boxes">[];
  memberships: Doc<"boxItems">[];
  photos: Doc<"itemPhotos">[];
  resources: Doc<"transportResources">[];
  zones: Doc<"transportZones">[];
}) {
  return summarizeMoveQuestions({
    move: toMoveQuestionMove(args.move),
    items: args.items
      .filter((item) => item.householdId === args.householdId)
      .map(toMoveQuestionItem),
    boxes: args.boxes
      .filter((box) => box.householdId === args.householdId)
      .map(toMoveQuestionBox),
    memberships: args.memberships
      .filter((membership) => membership.householdId === args.householdId)
      .map((membership) => ({
        boxId: String(membership.boxId),
        itemId: String(membership.itemId),
      })),
    photos: args.photos
      .filter((photo) => photo.householdId === args.householdId)
      .map((photo) => ({
        itemId: photo.itemId ? String(photo.itemId) : undefined,
        boxId: photo.boxId ? String(photo.boxId) : undefined,
        photoType: photo.photoType,
        verificationStatus: photo.verificationStatus,
        archivedAt: photo.archivedAt,
      })),
    resources: args.resources
      .filter((resource) => resource.householdId === args.householdId)
      .map(toMoveQuestionResource),
    zones: args.zones
      .filter((zone) => zone.householdId === args.householdId)
      .map((zone) => ({
        zoneId: String(zone._id),
        resourceId: String(zone.resourceId),
        name: zone.name,
        preferredTags: zone.preferredTags,
        archivedAt: zone.archivedAt,
      })),
  });
}

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
