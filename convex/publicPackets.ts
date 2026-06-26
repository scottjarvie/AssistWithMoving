import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalQuery } from "./_generated/server";
import { buildSubManifest } from "./subManifests";
import { claimEvidenceScore, claimEvidenceWarnings, claimRelevanceReasons, isClaimRelevantItem } from "./lib/claimPacket";
import { employerRelocationCategory } from "./lib/employerPacket";
import {
  boxVolumeCuFt,
  estimateItem,
  roundEstimate,
} from "./lib/estimateEngine";
import { moverFlagsForItem } from "./lib/moverPacket";
import { classifyPcsItem } from "./lib/pcsPacket";
import {
  publicPacketDisclosure,
  publicPacketKindForProfileType,
  publicPacketTitleForProfileType,
} from "./lib/publicPackets";
import { buildPublicPlanView } from "./lib/publicPlanView";
import { publicSubManifestKindForProfileType } from "./lib/subManifest";

const shareLinkScopeValidator = v.union(v.literal("move"), v.literal("profile"));
const shareLinkRoleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("editor"),
  v.literal("packer"),
  v.literal("viewer"),
  v.literal("guest")
);
const shareLinkActionValidator = v.union(
  v.literal("view"),
  v.literal("viewPlan"),
  v.literal("download"),
  v.literal("statusUpdate"),
  v.literal("comment"),
  v.literal("uploadEvidence")
);

type PublicPacketKind = NonNullable<
  ReturnType<typeof publicPacketKindForProfileType>
>;

export const getForShareLink = internalQuery({
  args: {
    shareLinkId: v.id("shareLinks"),
    householdId: v.id("households"),
    moveId: v.id("moves"),
    documentationProfileId: v.optional(v.id("documentationProfiles")),
    scope: shareLinkScopeValidator,
    role: shareLinkRoleValidator,
    allowedActions: v.array(shareLinkActionValidator),
    expiresAt: v.number(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const shareLink = publicShareLinkMetadata(args);
    const publicPlan = args.allowedActions.includes("viewPlan")
      ? await buildPublicPlanView(ctx, args)
      : null;

    if (!args.documentationProfileId) {
      if (publicPlan) {
        return {
          status: "ready" as const,
          kind: "plan" as const,
          shareLink,
          plan: publicPlan,
        };
      }
      return {
        status: "unsupported" as const,
        reason: args.allowedActions.includes("viewPlan")
          ? "No active Layout Studio plan is available for this move yet."
          : "This share link is not tied to a documentation profile yet.",
        shareLink,
      };
    }

    const profile = await ctx.db.get(args.documentationProfileId);
    if (
      !profile ||
      profile.householdId !== args.householdId ||
      profile.moveId !== args.moveId ||
      profile.status !== "active"
    ) {
      throw new Error("Documentation profile not found.");
    }

    const subManifestKind = publicSubManifestKindForProfileType(profile.type);
    if (subManifestKind) {
      const packet = await buildSubManifest(ctx, {
        householdId: args.householdId,
        moveId: args.moveId,
        kind: subManifestKind,
        mode: "recipient",
        documentationProfileId: args.documentationProfileId,
      });

      return {
        status: "ready" as const,
        kind: "subManifest" as const,
        shareLink,
        profile: publicProfileMetadata(profile),
        packet,
      };
    }

    const packetKind = publicPacketKindForProfileType(profile.type);
    if (!packetKind) {
      return {
        status: "unsupported" as const,
        reason: `${profile.name} links are created, but public rendering for this packet type is not enabled yet.`,
        shareLink,
        profile: publicProfileMetadata(profile),
      };
    }

    return {
      status: "ready" as const,
      kind: "documentationPacket" as const,
      shareLink,
      profile: publicProfileMetadata(profile),
      packet: await buildPublicDocumentationPacket(ctx, {
        householdId: args.householdId,
        moveId: args.moveId,
        profile,
        packetKind,
      }),
    };
  },
});

async function buildPublicDocumentationPacket(
  ctx: QueryCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    profile: Doc<"documentationProfiles">;
    packetKind: PublicPacketKind;
  }
) {
  const [move, items, boxes, boxItems, photos, resources, zones] = await Promise.all([
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

  const activeItems = items.filter((item) => !item.deletedAt);
  const activeBoxes = boxes.filter((box) => !box.archivedAt);
  const activePhotos = photos.filter((photo) => !photo.archivedAt);
  const boxById = new Map(activeBoxes.map((box) => [box._id, box]));
  const resourceNameById = new Map(
    resources.map((resource) => [resource._id, resource.name])
  );
  const zoneNameById = new Map(zones.map((zone) => [zone._id, zone.name]));
  const boxCodesByItemId = new Map<Id<"items">, string[]>();
  const itemIdsByBoxId = new Map<Id<"boxes">, Id<"items">[]>();

  for (const membership of boxItems) {
    const box = boxById.get(membership.boxId);
    if (!box) continue;
    boxCodesByItemId.set(membership.itemId, [
      ...(boxCodesByItemId.get(membership.itemId) ?? []),
      box.code,
    ]);
    itemIdsByBoxId.set(membership.boxId, [
      ...(itemIdsByBoxId.get(membership.boxId) ?? []),
      membership.itemId,
    ]);
  }

  const photosByItemId = new Map<Id<"items">, Doc<"itemPhotos">[]>();
  for (const photo of activePhotos) {
    if (!photo.itemId) continue;
    photosByItemId.set(photo.itemId, [
      ...(photosByItemId.get(photo.itemId) ?? []),
      photo,
    ]);
  }

  const packetItems = activeItems
    .filter((item) => isPublicPacketItem(item, args.packetKind, args.profile))
    .map((item) =>
      publicPacketItem({
        item,
        packetKind: args.packetKind,
        photos: photosByItemId.get(item._id) ?? [],
        boxCodes: boxCodesByItemId.get(item._id) ?? [],
      })
    );
  const packetItemIds = new Set(packetItems.map((item) => item.itemId));
  const packetBoxes = activeBoxes
    .filter((box) => shouldIncludePublicBox(box, itemIdsByBoxId, packetItemIds, args.packetKind))
    .map((box) => ({
      boxId: box._id,
      code: box.code,
      label: box.label,
      room: box.room,
      destinationRoom: box.destinationRoom,
      status: box.status,
      assignedResource: box.assignedResourceId
        ? resourceNameById.get(box.assignedResourceId)
        : undefined,
      assignedZone: box.assignedZoneId
        ? zoneNameById.get(box.assignedZoneId)
        : undefined,
      itemCount: (itemIdsByBoxId.get(box._id) ?? []).filter((itemId) =>
        packetItemIds.has(itemId)
      ).length,
      estimatedWeightLb: box.actualWeightLb ?? box.estimatedWeightLb,
      estimatedVolumeCuFt: boxVolumeCuFt(box),
      warnings: [...(box.assignmentWarnings ?? []), ...(box.assignmentHardBlocks ?? [])],
    }));
  const disclosure = publicPacketDisclosure(args.profile.type);
  const totalEstimatedWeightLb = roundEstimate(
    packetItems.reduce((total, item) => total + (item.estimatedWeightLb ?? 0), 0)
  );
  const totalEstimatedVolumeCuFt = roundEstimate(
    packetItems.reduce((total, item) => total + (item.estimatedVolumeCuFt ?? 0), 0)
  );

  return {
    packetKind: args.packetKind,
    profileType: args.profile.type,
    title: publicPacketTitleForProfileType(args.profile.type),
    generatedAt: Date.now(),
    recipientMode: recipientModeForPacketKind(args.packetKind),
    disclaimer: args.profile.disclaimer,
    move: {
      title: move.title,
      type: move.type,
      origin: move.origin,
      destination: move.destination,
      dateStart: move.dateStart,
      dateEnd: move.dateEnd,
      pcsBranch: args.packetKind === "pcs" ? move.pcsBranch : undefined,
      pcsRankPayGrade: args.packetKind === "pcs" ? move.pcsRankPayGrade : undefined,
      pcsDependentStatus:
        args.packetKind === "pcs" ? move.pcsDependentStatus : undefined,
      pcsShipmentType: args.packetKind === "pcs" ? move.pcsShipmentType : undefined,
      pcsAllowanceNotes:
        args.packetKind === "pcs" ? move.pcsAllowanceNotes : undefined,
      pcsTransportationOfficeNotes:
        args.packetKind === "pcs" ? move.pcsTransportationOfficeNotes : undefined,
      pcsRestrictedItemsNotes:
        args.packetKind === "pcs" ? move.pcsRestrictedItemsNotes : undefined,
      proGearNotes: args.packetKind === "pcs" ? move.proGearNotes : undefined,
      moveLevelWeightAllowanceLb:
        args.packetKind === "pcs" ? move.moveLevelWeightAllowanceLb : undefined,
    },
    visibility: {
      ownerPrivateFieldsShown: false,
      valuesHidden: disclosure.valuesHidden,
      serialsHidden: disclosure.serialsHidden,
      privateNotesHidden: true,
      rawStorageHidden: true,
      disclosure: disclosure.reason,
    },
    summary: {
      itemCount: packetItems.length,
      boxCount: packetBoxes.length,
      photoCount: packetItems.reduce((total, item) => total + item.photoCount, 0),
      totalEstimatedWeightLb,
      totalEstimatedVolumeCuFt,
      totalValueCents:
        args.packetKind === "claim"
          ? packetItems.reduce((total, item) => total + (item.claim?.valueCents ?? 0), 0)
          : undefined,
      metrics: publicPacketMetrics({
        packetKind: args.packetKind,
        packetItems,
        packetBoxes,
        totalEstimatedWeightLb,
        totalEstimatedVolumeCuFt,
        moveWeightAllowanceLb: move.moveLevelWeightAllowanceLb,
      }),
    },
    sections: {
      boxes: packetBoxes,
      items: packetItems,
    },
  };
}

function isPublicPacketItem(
  item: Doc<"items">,
  packetKind: PublicPacketKind,
  profile: Doc<"documentationProfiles">
) {
  if (item.status === "archived") return false;

  if (packetKind === "claim") {
    if (!matchesProfileFilters(item, profile.filters, { ignoreStatuses: true })) {
      return false;
    }
    return (
      isClaimRelevantItem(item) ||
      Boolean(profile.filters.statuses?.includes(item.status))
    );
  }

  if (!matchesProfileFilters(item, profile.filters)) return false;

  if (packetKind === "employer") {
    const category = employerRelocationCategory(item);
    return category === "relocationShipment" || category === "storage";
  }

  return true;
}

function matchesProfileFilters(
  item: Doc<"items">,
  filters: Doc<"documentationProfiles">["filters"],
  options?: { ignoreStatuses?: boolean }
) {
  if (filters.dispositions?.length && !filters.dispositions.includes(item.disposition)) {
    return false;
  }
  if (
    !options?.ignoreStatuses &&
    filters.statuses?.length &&
    !filters.statuses.includes(item.status)
  ) {
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

function publicPacketItem({
  item,
  packetKind,
  photos,
  boxCodes,
}: {
  item: Doc<"items">;
  packetKind: PublicPacketKind;
  photos: Doc<"itemPhotos">[];
  boxCodes: string[];
}) {
  const estimate = estimateItem(item);
  const photoCount = photos.length;
  const claimEvidenceInput = {
    ...item,
    photoCount,
    damagePhotoCount: photos.filter((photo) => photo.photoType === "damage").length,
    conditionPhotoCount: photos.filter((photo) => photo.photoType === "condition")
      .length,
    receiptPhotoCount: photos.filter((photo) => photo.photoType === "receipt").length,
  };
  const claim =
    packetKind === "claim"
      ? {
          relevanceReasons: claimRelevanceReasons(item),
          evidenceScore: claimEvidenceScore(claimEvidenceInput),
          evidenceWarnings: claimEvidenceWarnings(claimEvidenceInput),
          valueCents: item.valueCents,
          replacementValueCents: item.replacementValueCents,
          serialNumber: item.serialNumber,
          modelNumber: item.modelNumber,
        }
      : undefined;

  return {
    itemId: item._id,
    name: item.name,
    description: item.description,
    room: item.room,
    destinationRoom: item.destinationRoom,
    category: item.category,
    disposition: item.disposition,
    status: item.status,
    condition: item.condition,
    quantity: item.quantity,
    estimatedWeightLb: estimate.weight?.value,
    estimatedVolumeCuFt: estimate.volume?.value,
    photoCount,
    boxCodes,
    flags: publicPacketFlags(item, packetKind),
    claim,
  };
}

function publicPacketFlags(item: Doc<"items">, packetKind: PublicPacketKind) {
  if (packetKind === "pcs") {
    const classification = classifyPcsItem(item);
    return [
      classification.hhg ? "HHG" : null,
      classification.ppm ? "PPM/personal" : null,
      classification.proGear ? "Pro gear" : null,
      classification.highValue ? "High value" : null,
      classification.claimsEvidence ? "Claims evidence" : null,
      classification.sensitive ? "Sensitive" : null,
      classification.exception ? "Exception" : null,
    ].filter((flag): flag is string => Boolean(flag));
  }

  if (packetKind === "movingCompany" || packetKind === "loadCrew") {
    return moverFlagsForItem(item);
  }

  if (packetKind === "employer") {
    return [employerRelocationCategory(item)];
  }

  if (packetKind === "claim") {
    return claimRelevanceReasons(item);
  }

  return [];
}

function shouldIncludePublicBox(
  box: Doc<"boxes">,
  itemIdsByBoxId: Map<Id<"boxes">, Id<"items">[]>,
  packetItemIds: Set<Id<"items">>,
  packetKind: PublicPacketKind
) {
  if (packetKind === "movingCompany" || packetKind === "loadCrew" || packetKind === "pcs") {
    return true;
  }
  return (itemIdsByBoxId.get(box._id) ?? []).some((itemId) =>
    packetItemIds.has(itemId)
  );
}

function publicPacketMetrics({
  packetKind,
  packetItems,
  packetBoxes,
  totalEstimatedWeightLb,
  totalEstimatedVolumeCuFt,
  moveWeightAllowanceLb,
}: {
  packetKind: PublicPacketKind;
  packetItems: ReturnType<typeof publicPacketItem>[];
  packetBoxes: Array<{ warnings: string[] }>;
  totalEstimatedWeightLb: number;
  totalEstimatedVolumeCuFt: number;
  moveWeightAllowanceLb?: number;
}) {
  const metrics = [
    { label: "Items", value: packetItems.length },
    { label: "Boxes", value: packetBoxes.length },
    { label: "Photos", value: packetItems.reduce((total, item) => total + item.photoCount, 0) },
    { label: "Weight", value: `${formatNumber(totalEstimatedWeightLb)} lb` },
    { label: "Volume", value: `${formatNumber(totalEstimatedVolumeCuFt)} cu ft` },
  ];

  if (packetKind === "pcs" && typeof moveWeightAllowanceLb === "number") {
    metrics.push({
      label: "Allowance left",
      value: `${formatNumber(roundEstimate(moveWeightAllowanceLb - totalEstimatedWeightLb))} lb`,
    });
  }

  if (packetKind === "claim") {
    metrics.push({
      label: "Evidence warnings",
      value: packetItems.reduce(
        (total, item) => total + (item.claim?.evidenceWarnings.length ?? 0),
        0
      ),
    });
  }

  if (packetKind === "movingCompany" || packetKind === "loadCrew") {
    metrics.push({
      label: "Box warnings",
      value: packetBoxes.reduce((total, box) => total + box.warnings.length, 0),
    });
  }

  return metrics;
}

function recipientModeForPacketKind(packetKind: PublicPacketKind) {
  switch (packetKind) {
    case "pcs":
    case "employer":
    case "claim":
      return "submission";
    case "movingCompany":
      return "movingCompany";
    case "loadCrew":
      return "loadCrew";
  }
}

function publicShareLinkMetadata(args: {
  shareLinkId: Id<"shareLinks">;
  scope: "move" | "profile";
  role: "owner" | "admin" | "editor" | "packer" | "viewer" | "guest";
  allowedActions: Array<
    | "view"
    | "viewPlan"
    | "download"
    | "statusUpdate"
    | "comment"
    | "uploadEvidence"
  >;
  expiresAt: number;
  label?: string;
}) {
  return {
    shareLinkId: args.shareLinkId,
    scope: args.scope,
    role: args.role,
    allowedActions: args.allowedActions,
    expiresAt: args.expiresAt,
    label: args.label,
    canDownload: args.allowedActions.includes("download"),
    canStatusUpdate: args.allowedActions.includes("statusUpdate"),
    canComment: args.allowedActions.includes("comment"),
    canUploadEvidence: args.allowedActions.includes("uploadEvidence"),
    canViewPlan: args.allowedActions.includes("viewPlan"),
  };
}

function publicProfileMetadata(profile: Doc<"documentationProfiles">) {
  return {
    profileId: profile._id,
    type: profile.type,
    name: profile.name,
    includedFields: profile.includedFields,
    imageRule: profile.imageRule,
    filters: profile.filters,
    disclaimer: profile.disclaimer,
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}
