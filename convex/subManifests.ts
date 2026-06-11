import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalQuery, query } from "./_generated/server";
import { estimateItem, roundEstimate } from "./lib/estimateEngine";
import { requireMovePermission } from "./lib/permissions";
import {
  isSubManifestItem,
  publicSubManifestKindForProfileType,
  shouldShowSubManifestOwnerFields,
  subManifestDisclaimer,
  subManifestDispositionFilter,
  subManifestTitle,
  type SubManifestKind,
  type SubManifestMode,
} from "./lib/subManifest";

type ManifestBucket = {
  key: string;
  label: string;
  itemCount: number;
  quantity: number;
  valueCents?: number;
};

const subManifestKindValidator = v.union(
  v.literal("donation"),
  v.literal("sellFree"),
  v.literal("storage")
);
const subManifestModeValidator = v.union(
  v.literal("recipient"),
  v.literal("owner")
);

export const getForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    kind: subManifestKindValidator,
    mode: v.optional(subManifestModeValidator),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "documentation:read"
    );

    return await buildSubManifest(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      kind: args.kind,
      mode: args.mode ?? "recipient",
    });
  },
});

export const getForShareLink = internalQuery({
  args: {
    shareLinkId: v.id("shareLinks"),
    householdId: v.id("households"),
    moveId: v.id("moves"),
    documentationProfileId: v.optional(v.id("documentationProfiles")),
    scope: v.union(v.literal("move"), v.literal("profile")),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("editor"),
      v.literal("packer"),
      v.literal("viewer"),
      v.literal("guest")
    ),
    allowedActions: v.array(
      v.union(
        v.literal("view"),
        v.literal("viewPlan"),
        v.literal("download"),
        v.literal("statusUpdate"),
        v.literal("comment"),
        v.literal("uploadEvidence")
      )
    ),
    expiresAt: v.number(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.documentationProfileId) {
      return {
        status: "unsupported" as const,
        reason: "This share link is not tied to a documentation profile yet.",
        shareLink: publicShareLinkMetadata(args),
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

    const kind = publicSubManifestKindForProfileType(profile.type);
    if (!kind) {
      return {
        status: "unsupported" as const,
        reason: `${profile.name} links are created, but public rendering for this packet type is not enabled yet.`,
        shareLink: publicShareLinkMetadata(args),
        profile: publicProfileMetadata(profile),
      };
    }

    const packet = await buildSubManifest(ctx, {
      householdId: args.householdId,
      moveId: args.moveId,
      kind,
      mode: "recipient",
      documentationProfileId: args.documentationProfileId,
    });

    return {
      status: "ready" as const,
      kind: "subManifest" as const,
      shareLink: publicShareLinkMetadata(args),
      profile: publicProfileMetadata(profile),
      packet,
    };
  },
});

export async function buildSubManifest(
  ctx: QueryCtx,
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
    kind: SubManifestKind;
    mode: SubManifestMode;
    documentationProfileId?: Id<"documentationProfiles">;
  }
) {
  const mode = args.mode;
  const kind = args.kind;
  const showOwnerFields = shouldShowSubManifestOwnerFields(mode);

  const [move, items, boxes, boxItems, photos, resources, zones, profiles] =
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
      args.documentationProfileId
        ? Promise.resolve([])
        : ctx.db
            .query("documentationProfiles")
            .withIndex("by_move_type", (q) =>
              q.eq("moveId", args.moveId).eq("type", profileTypeForKind(kind))
            )
            .collect(),
    ]);

  if (!move || move.householdId !== args.householdId) {
    throw new Error("Move not found.");
  }

  const activeItems = items.filter((item) => !item.deletedAt);
  const activeBoxes = boxes.filter((box) => !box.archivedAt);
  const activePhotos = photos.filter((photo) => !photo.archivedAt);
  const profile = args.documentationProfileId
    ? await ctx.db.get(args.documentationProfileId)
    : profiles.find((entry) => entry.status === "active");
  const boxById = new Map(activeBoxes.map((box) => [box._id, box]));
  const resourceNameById = new Map(
    resources.map((resource) => [resource._id, resource.name])
  );
  const zoneNameById = new Map(zones.map((zone) => [zone._id, zone.name]));
  const boxTrailByItemId = buildBoxTrailByItemId({
    memberships: boxItems,
    boxById,
    resourceNameById,
    zoneNameById,
  });
  const photosByItemId = groupPhotosByItemId(activePhotos);

  const manifestItems = activeItems
    .filter((item) => isSubManifestItem(item, kind))
    .map((item) => {
      const estimate = estimateItem(item);
      const itemPhotos = photosByItemId.get(item._id) ?? [];

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
        photoCount: itemPhotos.length,
        photoEvidence: itemPhotos.map((photo) =>
          photoMetadataForPacket(photo, showOwnerFields)
        ),
        boxTrail: boxTrailByItemId.get(item._id) ?? [],
        listing: listingFieldsForKind(kind, item, itemPhotos.length),
        owner:
          showOwnerFields
            ? {
                valueCents: item.valueCents,
                replacementValueCents: item.replacementValueCents,
                serialNumber: item.serialNumber,
                modelNumber: item.modelNumber,
                privateNotes: item.privateNotes,
                reviewFlags: item.reviewFlags,
                planningDefaultKeys: item.planningDefaultKeys,
                aiSummary: item.aiSummary,
                aiTags: item.aiTags,
              }
            : undefined,
      };
    });

  const statusBuckets = new Map<string, ManifestBucket>();
  const dispositionBuckets = new Map<string, ManifestBucket>();
  const roomBuckets = new Map<string, ManifestBucket>();

  for (const item of manifestItems) {
    addManifestBucket(statusBuckets, item.status, item.status, item, showOwnerFields);
    addManifestBucket(
      dispositionBuckets,
      item.disposition,
      item.disposition,
      item,
      showOwnerFields
    );
    addManifestBucket(
      roomBuckets,
      item.room ?? "unset",
      item.room ?? "Unset",
      item,
      showOwnerFields
    );
  }

  const includedBoxIds = new Set(
    manifestItems.flatMap((item) => item.boxTrail.map((box) => box.boxId))
  );
  const manifestBoxes = activeBoxes
    .filter((box) => includedBoxIds.has(box._id))
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
      estimatedWeightLb: box.actualWeightLb ?? box.estimatedWeightLb,
      estimatedVolumeCuFt: box.estimatedVolumeCuFt,
    }));

  return {
    kind,
    mode,
    generatedAt: Date.now(),
    title: subManifestTitle(kind),
    disclaimer: subManifestDisclaimer(kind),
    profile:
      profile
        ? {
            profileId: profile._id,
            name: profile.name,
            includedFields: profile.includedFields,
            imageRule: profile.imageRule,
            filters: profile.filters,
          }
        : undefined,
    move: {
      moveId: move._id,
      title: move.title,
      type: move.type,
      origin: move.origin,
      destination: move.destination,
      dateStart: move.dateStart,
      dateEnd: move.dateEnd,
      notes: showOwnerFields ? move.notes : undefined,
    },
    visibility: {
      ownerPrivateFieldsShown: showOwnerFields,
      valuesHidden: !showOwnerFields,
      serialsHidden: !showOwnerFields,
      privateNotesHidden: !showOwnerFields,
      rawStorageHidden: true,
    },
    filters: {
      dispositions: subManifestDispositionFilter(kind),
    },
    summary: {
      itemCount: manifestItems.length,
      quantity: manifestItems.reduce((total, item) => total + item.quantity, 0),
      boxCount: manifestBoxes.length,
      photoCount: manifestItems.reduce((total, item) => total + item.photoCount, 0),
      estimatedWeightLb: roundEstimate(
        manifestItems.reduce(
          (total, item) => total + (item.estimatedWeightLb ?? 0),
          0
        )
      ),
      estimatedVolumeCuFt: roundEstimate(
        manifestItems.reduce(
          (total, item) => total + (item.estimatedVolumeCuFt ?? 0),
          0
        )
      ),
      totalValueCents: showOwnerFields
        ? manifestItems.reduce(
            (total, item) => total + (item.owner?.valueCents ?? 0),
            0
          )
        : undefined,
    },
    sections: {
      statusTotals: Array.from(statusBuckets.values()),
      dispositionTotals: Array.from(dispositionBuckets.values()),
      roomTotals: Array.from(roomBuckets.values()),
      boxes: manifestBoxes,
      items: manifestItems,
    },
  };
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

function profileTypeForKind(kind: SubManifestKind) {
  switch (kind) {
    case "donation":
      return "donationPickup";
    case "sellFree":
      return "sellOrGiveaway";
    case "storage":
      return "storageInventory";
  }
}

function buildBoxTrailByItemId({
  memberships,
  boxById,
  resourceNameById,
  zoneNameById,
}: {
  memberships: Doc<"boxItems">[];
  boxById: Map<Id<"boxes">, Doc<"boxes">>;
  resourceNameById: Map<Id<"transportResources">, string>;
  zoneNameById: Map<Id<"transportZones">, string>;
}) {
  const boxTrailByItemId = new Map<
    Id<"items">,
    Array<{
      boxId: Id<"boxes">;
      code: string;
      label?: string;
      status: string;
      assignedResource?: string;
      assignedZone?: string;
      quantity: number;
    }>
  >();

  for (const membership of memberships) {
    const box = boxById.get(membership.boxId);
    if (!box) continue;
    const existing = boxTrailByItemId.get(membership.itemId) ?? [];
    existing.push({
      boxId: box._id,
      code: box.code,
      label: box.label,
      status: box.status,
      assignedResource: box.assignedResourceId
        ? resourceNameById.get(box.assignedResourceId)
        : undefined,
      assignedZone: box.assignedZoneId ? zoneNameById.get(box.assignedZoneId) : undefined,
      quantity: membership.quantity,
    });
    boxTrailByItemId.set(membership.itemId, existing);
  }

  return boxTrailByItemId;
}

function groupPhotosByItemId(photos: Doc<"itemPhotos">[]) {
  const photosByItemId = new Map<Id<"items">, Doc<"itemPhotos">[]>();

  for (const photo of photos) {
    if (!photo.itemId) continue;
    const existing = photosByItemId.get(photo.itemId) ?? [];
    existing.push(photo);
    photosByItemId.set(photo.itemId, existing);
  }

  return photosByItemId;
}

function photoMetadataForPacket(photo: Doc<"itemPhotos">, showOwnerFields: boolean) {
  return {
    photoId: photo._id,
    photoType: photo.photoType,
    verificationStatus: photo.verificationStatus,
    caption: photo.caption,
    capturedAt: photo.capturedAt,
    uploadedAt: photo.createdAt,
    derivativeStatus: photo.derivativeStatus,
    derivativeVariants: Object.entries(photo.derivativeRefs)
      .filter(([, value]) => Boolean(value))
      .map(([variant]) => variant),
    owner:
      showOwnerFields
        ? {
            notes: photo.notes,
            privacyLevel: photo.privacyLevel,
            originalHash: photo.originalHash,
          }
        : undefined,
  };
}

function listingFieldsForKind(
  kind: SubManifestKind,
  item: Doc<"items">,
  photoCount: number
) {
  if (kind === "sellFree") {
    return {
      headline: item.name,
      description: item.description,
      pickupStatus: item.status,
      photoReady: photoCount > 0,
    };
  }

  if (kind === "storage") {
    return {
      headline: item.name,
      description: item.description,
      lookupText: [item.room, item.destinationRoom, item.category]
        .filter(Boolean)
        .join(" / "),
    };
  }

  return {
    headline: item.name,
    description: item.description,
    pickupStatus: item.status,
  };
}

function addManifestBucket(
  map: Map<string, ManifestBucket>,
  key: string,
  label: string,
  item: {
    quantity: number;
    owner?: {
      valueCents?: number;
    };
  },
  includeValue: boolean
) {
  const bucket =
    map.get(key) ??
    ({
      key,
      label,
      itemCount: 0,
      quantity: 0,
      valueCents: includeValue ? 0 : undefined,
    } satisfies ManifestBucket);

  bucket.itemCount += 1;
  bucket.quantity += item.quantity;
  if (includeValue) {
    bucket.valueCents = (bucket.valueCents ?? 0) + (item.owner?.valueCents ?? 0);
  }
  map.set(key, bucket);
}
