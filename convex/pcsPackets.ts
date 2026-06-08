import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { estimateItem, roundEstimate } from "./lib/estimateEngine";
import {
  classifyPcsItem,
  summarizePcsClassifications,
  type PcsPacketMode,
} from "./lib/pcsPacket";
import { requireMovePermission } from "./lib/permissions";

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

    const mode: PcsPacketMode = args.mode ?? "submission";
    const includeSensitive = mode === "owner";
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
        ctx.db.query("boxItems").withIndex("by_move", (q) => q.eq("moveId", args.moveId)).collect(),
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
          .query("documentationProfiles")
          .withIndex("by_move_type", (q) =>
            q.eq("moveId", args.moveId).eq("type", "pcsMove")
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
    const itemById = new Map(activeItems.map((item) => [item._id, item]));
    const boxById = new Map(activeBoxes.map((box) => [box._id, box]));
    const resourceNameById = new Map(resources.map((resource) => [resource._id, resource.name]));
    const zoneNameById = new Map(zones.map((zone) => [zone._id, zone.name]));
    const boxCodeByItemId = new Map<Id<"items">, string[]>();

    for (const membership of boxItems) {
      const box = boxById.get(membership.boxId);
      if (!box) continue;
      const existing = boxCodeByItemId.get(membership.itemId) ?? [];
      existing.push(box.code);
      boxCodeByItemId.set(membership.itemId, existing);
    }

    const photosByItemId = new Map<Id<"items">, number>();
    const photosByBoxId = new Map<Id<"boxes">, number>();
    let pcsEvidencePhotoCount = 0;
    for (const photo of activePhotos) {
      if (photo.documentationProfileTypes.includes("pcsMove")) {
        pcsEvidencePhotoCount += 1;
      }
      if (photo.itemId) {
        photosByItemId.set(photo.itemId, (photosByItemId.get(photo.itemId) ?? 0) + 1);
      }
      if (photo.boxId) {
        photosByBoxId.set(photo.boxId, (photosByBoxId.get(photo.boxId) ?? 0) + 1);
      }
    }

    const packetItems = activeItems.map((item) => {
      const classification = classifyPcsItem(item);
      const estimate = estimateItem(item);
      return {
        itemId: item._id,
        name: item.name,
        room: item.room,
        destinationRoom: item.destinationRoom,
        category: item.category,
        disposition: item.disposition,
        status: item.status,
        condition: item.condition,
        quantity: item.quantity,
        estimatedWeightLb: estimate.weight?.value,
        estimatedVolumeCuFt: estimate.volume?.value,
        boxCodes: boxCodeByItemId.get(item._id) ?? [],
        photoCount: photosByItemId.get(item._id) ?? 0,
        classification,
        flags: flagsForItem(item, classification),
        sensitive:
          includeSensitive
            ? {
                valueCents: item.valueCents,
                replacementValueCents: item.replacementValueCents,
                serialNumber: item.serialNumber,
                modelNumber: item.modelNumber,
                privateNotes: item.privateNotes,
              }
            : undefined,
      };
    });

    const classifications = packetItems.map((item) => item.classification);
    const boxSummaries = activeBoxes.map((box) => {
      const memberships = boxItems.filter((membership) => membership.boxId === box._id);
      const boxItemsForSummary = memberships
        .map((membership) => {
          const item = itemById.get(membership.itemId);
          return item ? { item, quantity: membership.quantity } : null;
        })
        .filter((entry): entry is { item: Doc<"items">; quantity: number } =>
          Boolean(entry)
        );
      const estimatedWeightLb =
        box.actualWeightLb ??
        box.estimatedWeightLb ??
        roundEstimate(
          boxItemsForSummary.reduce((total, entry) => {
            const estimate = estimateItem({ ...entry.item, quantity: entry.quantity });
            return total + (estimate.weight?.value ?? 0);
          }, 0)
        );
      return {
        boxId: box._id,
        code: box.code,
        label: box.label,
        room: box.room,
        destinationRoom: box.destinationRoom,
        status: box.status,
        assignedResource: box.assignedResourceId
          ? resourceNameById.get(box.assignedResourceId)
          : undefined,
        assignedZone: box.assignedZoneId ? zoneNameById.get(box.assignedZoneId) : undefined,
        itemCount: boxItemsForSummary.reduce((total, entry) => total + entry.quantity, 0),
        estimatedWeightLb,
        estimatedVolumeCuFt: box.estimatedVolumeCuFt,
        photoCount: photosByBoxId.get(box._id) ?? 0,
        warnings: [...(box.assignmentWarnings ?? []), ...(box.assignmentHardBlocks ?? [])],
      };
    });

    const totalEstimatedWeightLb = roundEstimate(
      packetItems.reduce((total, item) => total + (item.estimatedWeightLb ?? 0), 0)
    );
    const totalEstimatedVolumeCuFt = roundEstimate(
      packetItems.reduce((total, item) => total + (item.estimatedVolumeCuFt ?? 0), 0)
    );

    return {
      mode,
      generatedAt: Date.now(),
      disclaimer:
        "PCS requirements vary by branch, order type, transportation office, and current policy. Verify this packet against official instructions before submission.",
      profile: profile
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
        moveLevelWeightAllowanceLb: move.moveLevelWeightAllowanceLb,
        pcsBranch: move.pcsBranch,
        pcsRankPayGrade: move.pcsRankPayGrade,
        pcsDependentStatus: move.pcsDependentStatus,
        pcsShipmentType: move.pcsShipmentType,
        pcsOrdersNumber: includeSensitive ? move.pcsOrdersNumber : undefined,
        pcsAllowanceNotes: move.pcsAllowanceNotes,
        pcsTransportationOfficeNotes: move.pcsTransportationOfficeNotes,
        pcsRestrictedItemsNotes: move.pcsRestrictedItemsNotes,
        proGearNotes: move.proGearNotes,
      },
      summary: {
        itemCount: packetItems.length,
        boxCount: boxSummaries.length,
        photoCount: activePhotos.length,
        pcsEvidencePhotoCount,
        totalEstimatedWeightLb,
        totalEstimatedVolumeCuFt,
        allowanceRemainingLb:
          typeof move.moveLevelWeightAllowanceLb === "number"
            ? roundEstimate(move.moveLevelWeightAllowanceLb - totalEstimatedWeightLb)
            : undefined,
        ...summarizePcsClassifications(classifications),
      },
      sections: {
        hhgItems: packetItems.filter((item) => item.classification.hhg),
        ppmItems: packetItems.filter((item) => item.classification.ppm),
        proGearItems: packetItems.filter((item) => item.classification.proGear),
        highValueItems: packetItems.filter((item) => item.classification.highValue),
        claimsEvidenceItems: packetItems.filter(
          (item) => item.classification.claimsEvidence
        ),
        sensitiveItems: packetItems.filter((item) => item.classification.sensitive),
        exceptionItems: packetItems.filter((item) => item.classification.exception),
        boxes: boxSummaries,
      },
    };
  },
});

function flagsForItem(
  item: Doc<"items">,
  classification: ReturnType<typeof classifyPcsItem>
) {
  const flags = [];
  if (classification.ppm) flags.push("PPM/personal");
  if (classification.proGear) flags.push("Pro gear");
  if (classification.highValue) flags.push("High value");
  if (classification.claimsEvidence) flags.push("Claims evidence");
  if (classification.sensitive) flags.push("Sensitive");
  if (item.hazardousFlag) flags.push("Restricted review");
  if (item.needsReview) flags.push("Needs review");
  return flags;
}
