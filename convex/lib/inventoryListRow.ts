import type { Doc } from "../_generated/dataModel";
import { volumeFromDimensions } from "./estimateEngine";
import { redactItemForVisibility } from "./loadPlanSnapshot";
import type { visibilityForHouseholdRole } from "./roles";

type InventoryListSource = Doc<"items"> & {
  signals?: {
    photoCount: number;
    evidencePhotoCount: number;
    boxCount: number;
    assignedBoxCount: number;
    assignmentCount: number;
    boxCodes: string[];
    assignedResourceNames: string[];
    assignedZoneNames: string[];
  };
  ownerContact?: Pick<Doc<"movePeople">, "_id" | "name" | "role">;
};

type Visibility = ReturnType<typeof visibilityForHouseholdRole>;

export function toInventoryListRow<
  Item extends InventoryListSource,
>(item: Item, visibility: Visibility) {
  // Redact the complete source first. Projection must only read this result so
  // no sensitive field can bypass the caller's visibility policy.
  const redacted = redactItemForVisibility(item, visibility);
  const quantity =
    redacted.quantity && redacted.quantity > 0 ? redacted.quantity : 1;
  const unitWeight = redacted.actualWeightLb ?? redacted.estimatedWeightLb;
  const unitVolume =
    redacted.estimatedVolumeCuFt ??
    redacted.estimatedPackedVolumeCuFt ??
    volumeFromDimensions(redacted.dimensionsIn);

  return {
    _id: redacted._id,
    name: redacted.name,
    code: redacted.code,
    nickname: redacted.nickname,
    room: redacted.room,
    destinationRoom: redacted.destinationRoom,
    category: redacted.category,
    ownerPersonId: redacted.ownerPersonId,
    disposition: redacted.disposition,
    status: redacted.status,
    quantity: redacted.quantity,
    highValue: redacted.highValue,
    needsReview: redacted.needsReview,
    fragility: redacted.fragility,
    requiresPersonalTransport: redacted.requiresPersonalTransport,
    planningDefaultKeys: redacted.planningDefaultKeys,
    createdAt: redacted._creationTime,
    updatedAt: redacted.updatedAt,
    valueCents: redacted.valueCents,
    hasReplacementValue: Boolean(redacted.replacementValueCents),
    hasSerialNumber: Boolean(redacted.serialNumber),
    sortWeightLb:
      typeof unitWeight === "number" ? unitWeight * quantity : undefined,
    sortVolumeCuFt:
      typeof unitVolume === "number" ? unitVolume * quantity : undefined,
    signals: redacted.signals,
    ownerContact: redacted.ownerContact,
  };
}
