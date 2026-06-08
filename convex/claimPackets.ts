import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import {
  claimEvidenceScore,
  claimEvidenceWarnings,
  claimPacketDisclaimer,
  claimRelevanceReasons,
  claimSeverity,
  isClaimRelevantItem,
  shouldShowClaimOwnerFields,
  type ClaimPacketMode,
} from "./lib/claimPacket";
import { requireMovePermission } from "./lib/permissions";

type ClaimBucket = {
  key: string;
  label: string;
  itemCount: number;
  valueCents: number;
  replacementValueCents: number;
};

export const getForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    mode: v.optional(v.union(v.literal("submission"), v.literal("owner"))),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "documentation:read"
    );

    const mode: ClaimPacketMode = args.mode ?? "submission";
    const showOwnerFields = shouldShowClaimOwnerFields(mode);

    const [move, items, boxes, boxItems, photos, resources, profiles] =
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
          .query("documentationProfiles")
          .withIndex("by_move_type", (q) =>
            q.eq("moveId", args.moveId).eq("type", "insuranceClaim")
          )
          .collect(),
      ]);

    if (!move || move.householdId !== args.householdId) {
      throw new Error("Move not found.");
    }

    const activeItems = items.filter((item) => !item.deletedAt);
    const activeBoxes = boxes.filter((box) => !box.archivedAt);
    const activePhotos = photos.filter((photo) => !photo.archivedAt);
    const profile = profiles.find((entry) => entry.status === "active");
    const boxById = new Map(activeBoxes.map((box) => [box._id, box]));
    const resourceNameById = new Map(
      resources.map((resource) => [resource._id, resource.name])
    );
    const boxTrailByItemId = buildBoxTrailByItemId({
      memberships: boxItems,
      boxById,
      resourceNameById,
    });
    const photosByItemId = groupPhotosByItemId(activePhotos);

    const claimItems = activeItems
      .filter((item) => isClaimRelevantItem(item))
      .map((item) => {
        const itemPhotos = photosByItemId.get(item._id) ?? [];
        const evidenceCounts = photoEvidenceCounts(itemPhotos);
        const evidenceInput = {
          ...item,
          ...evidenceCounts,
        };
        const warnings = claimEvidenceWarnings(evidenceInput);
        const reasons = claimRelevanceReasons(item);

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
          highValue: item.highValue,
          needsReview: item.needsReview,
          claim: {
            severity: claimSeverity(item),
            relevanceReasons: reasons,
            evidenceScore: claimEvidenceScore(evidenceInput),
            evidenceWarnings: warnings,
            valueCents: item.valueCents,
            replacementValueCents: item.replacementValueCents,
            serialNumber: item.serialNumber,
            modelNumber: item.modelNumber,
          },
          boxTrail: boxTrailByItemId.get(item._id) ?? [],
          photoEvidence: itemPhotos.map((photo) =>
            photoEvidenceForPacket(photo, showOwnerFields)
          ),
          owner:
            showOwnerFields
              ? {
                  reviewFlags: item.reviewFlags,
                  privateNotes: item.privateNotes,
                  aiSummary: item.aiSummary,
                  aiTags: item.aiTags,
                }
              : undefined,
        };
      });

    const severityBuckets = new Map<string, ClaimBucket>();
    const statusBuckets = new Map<string, ClaimBucket>();
    const conditionBuckets = new Map<string, ClaimBucket>();

    for (const item of claimItems) {
      addClaimBucket(severityBuckets, item.claim.severity, item.claim.severity, item);
      addClaimBucket(statusBuckets, item.status, item.status, item);
      addClaimBucket(conditionBuckets, item.condition, item.condition, item);
    }

    const evidencePhotoCount = claimItems.reduce(
      (total, item) => total + item.photoEvidence.length,
      0
    );
    const warningCount = claimItems.reduce(
      (total, item) => total + item.claim.evidenceWarnings.length,
      0
    );

    return {
      mode,
      generatedAt: Date.now(),
      disclaimer: claimPacketDisclaimer(),
      profile:
        profile
          ? {
              profileId: profile._id,
              name: profile.name,
              includedFields: profile.includedFields,
              imageRule: profile.imageRule,
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
        claimFieldsShown: true,
        ownerPrivateFieldsShown: showOwnerFields,
        privateNotesHidden: !showOwnerFields,
        rawStorageHidden: true,
      },
      summary: {
        claimItemCount: claimItems.length,
        evidencePhotoCount,
        warningCount,
        highSeverityCount: claimItems.filter(
          (item) => item.claim.severity === "high"
        ).length,
        averageEvidenceScore:
          claimItems.length > 0
            ? Math.round(
                claimItems.reduce(
                  (total, item) => total + item.claim.evidenceScore,
                  0
                ) / claimItems.length
              )
            : 0,
        totalValueCents: claimItems.reduce(
          (total, item) => total + (item.claim.valueCents ?? 0),
          0
        ),
        totalReplacementValueCents: claimItems.reduce(
          (total, item) => total + (item.claim.replacementValueCents ?? 0),
          0
        ),
      },
      sections: {
        severityTotals: Array.from(severityBuckets.values()),
        statusTotals: Array.from(statusBuckets.values()),
        conditionTotals: Array.from(conditionBuckets.values()),
        claimItems,
      },
    };
  },
});

function buildBoxTrailByItemId({
  memberships,
  boxById,
  resourceNameById,
}: {
  memberships: Doc<"boxItems">[];
  boxById: Map<Id<"boxes">, Doc<"boxes">>;
  resourceNameById: Map<Id<"transportResources">, string>;
}) {
  const boxTrailByItemId = new Map<
    Id<"items">,
    Array<{
      boxId: Id<"boxes">;
      code: string;
      label?: string;
      status: string;
      assignedResource?: string;
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

function photoEvidenceCounts(photos: Doc<"itemPhotos">[]) {
  return {
    photoCount: photos.length,
    damagePhotoCount: photos.filter((photo) => photo.photoType === "damage").length,
    conditionPhotoCount: photos.filter((photo) => photo.photoType === "condition")
      .length,
    receiptPhotoCount: photos.filter((photo) => photo.photoType === "receipt")
      .length,
  };
}

function photoEvidenceForPacket(photo: Doc<"itemPhotos">, showOwnerFields: boolean) {
  return {
    photoId: photo._id,
    photoType: photo.photoType,
    privacyLevel: photo.privacyLevel,
    verificationStatus: photo.verificationStatus,
    confidence: photo.confidence,
    caption: photo.caption,
    capturedAt: photo.capturedAt,
    uploadedAt: photo.createdAt,
    reviewedAt: photo.reviewedAt,
    exifHandlingStatus: photo.exifHandlingStatus,
    derivativeStatus: photo.derivativeStatus,
    derivativeVariants: Object.entries(photo.derivativeRefs)
      .filter(([, value]) => Boolean(value))
      .map(([variant]) => variant),
    owner:
      showOwnerFields
        ? {
            notes: photo.notes,
            originalHash: photo.originalHash,
            source: photo.source,
            aiProcessed: photo.aiProcessed,
          }
        : undefined,
  };
}

function addClaimBucket(
  map: Map<string, ClaimBucket>,
  key: string,
  label: string,
  item: {
    claim: {
      valueCents?: number;
      replacementValueCents?: number;
    };
  }
) {
  const bucket =
    map.get(key) ??
    ({
      key,
      label,
      itemCount: 0,
      valueCents: 0,
      replacementValueCents: 0,
    } satisfies ClaimBucket);

  bucket.itemCount += 1;
  bucket.valueCents += item.claim.valueCents ?? 0;
  bucket.replacementValueCents += item.claim.replacementValueCents ?? 0;
  map.set(key, bucket);
}
