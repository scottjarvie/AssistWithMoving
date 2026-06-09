import type { Doc } from "../_generated/dataModel";
import type { ShareLinkAction } from "./documentation";

export const publicShareItemStatusUpdates = [
  "packed",
  "staged",
  "loaded",
  "delivered",
  "missing",
  "damaged",
] as const;

export const publicShareBoxStatusUpdates = [
  "sealed",
  "staged",
  "loaded",
  "delivered",
  "missing",
  "damaged",
] as const;

export const publicStatusUpdateProfileTypes = [
  "movingCompany",
  "donationPickup",
  "storageInventory",
  "loadCrew",
] as const;

export type PublicStatusTargetType = "item" | "box";

export function assertPublicShareCanStatusUpdate({
  allowedActions,
  profileType,
  targetType,
  nextStatus,
}: {
  allowedActions: ShareLinkAction[];
  profileType: string;
  targetType: PublicStatusTargetType;
  nextStatus: string;
}) {
  if (!allowedActions.includes("statusUpdate")) {
    throw new Error("Share link does not allow status updates.");
  }
  if (!isPublicStatusUpdateProfileType(profileType)) {
    throw new Error("This packet type does not allow public status updates.");
  }
  if (
    targetType === "item" &&
    !publicShareItemStatusUpdates.includes(
      nextStatus as (typeof publicShareItemStatusUpdates)[number]
    )
  ) {
    throw new Error("Unsupported public item status update.");
  }
  if (
    targetType === "box" &&
    !publicShareBoxStatusUpdates.includes(
      nextStatus as (typeof publicShareBoxStatusUpdates)[number]
    )
  ) {
    throw new Error("Unsupported public box status update.");
  }
}

export function isPublicStatusUpdateProfileType(
  profileType: string
): profileType is (typeof publicStatusUpdateProfileTypes)[number] {
  return publicStatusUpdateProfileTypes.includes(
    profileType as (typeof publicStatusUpdateProfileTypes)[number]
  );
}

export function publicShareItemVisibleToProfile({
  item,
  profile,
}: {
  item: Pick<
    Doc<"items">,
    | "status"
    | "deletedAt"
    | "disposition"
    | "planningDefaultKeys"
    | "room"
    | "destinationRoom"
  >;
  profile: Pick<Doc<"documentationProfiles">, "type" | "filters">;
}) {
  if (item.deletedAt || item.status === "archived") {
    return false;
  }
  if (profile.type === "loadCrew") {
    return true;
  }
  return matchesDocumentationFilters(item, profile.filters);
}

export function publicShareBoxVisibleToProfile({
  box,
  profile,
  visibleItemCount,
}: {
  box: Pick<Doc<"boxes">, "archivedAt">;
  profile: Pick<Doc<"documentationProfiles">, "type">;
  visibleItemCount: number;
}) {
  if (box.archivedAt) {
    return false;
  }
  if (profile.type === "loadCrew" || profile.type === "movingCompany") {
    return true;
  }
  return visibleItemCount > 0;
}

function matchesDocumentationFilters(
  item: Pick<
    Doc<"items">,
    | "status"
    | "disposition"
    | "planningDefaultKeys"
    | "room"
    | "destinationRoom"
  >,
  filters: Doc<"documentationProfiles">["filters"]
) {
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
