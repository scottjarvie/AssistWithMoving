import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { resolveBoxWeight } from "./lib/boxWeight";
import {
  estimateItem,
  roundEstimate,
  sumEstimateValues,
  type EstimateValue,
} from "./lib/estimateEngine";
import { requireMovePermission } from "./lib/permissions";
import { isLooseMovableUnitRestItem } from "./lib/restApi";

type BucketTotals = {
  label: string;
  itemCount: number;
  estimatedWeightLb: number;
  estimatedVolumeCuFt: number;
  missingWeightCount: number;
  missingVolumeCount: number;
};

function emptyBucket(label: string): BucketTotals {
  return {
    label,
    itemCount: 0,
    estimatedWeightLb: 0,
    estimatedVolumeCuFt: 0,
    missingWeightCount: 0,
    missingVolumeCount: 0,
  };
}

function addToBucket(
  bucket: BucketTotals,
  estimate: {
    weight?: EstimateValue;
    volume?: EstimateValue;
    warnings: string[];
  },
) {
  bucket.itemCount += 1;
  bucket.estimatedWeightLb = roundEstimate(
    bucket.estimatedWeightLb + (estimate.weight?.value ?? 0),
  );
  bucket.estimatedVolumeCuFt = roundEstimate(
    bucket.estimatedVolumeCuFt + (estimate.volume?.value ?? 0),
  );
  if (estimate.warnings.includes("missingWeightEstimate")) {
    bucket.missingWeightCount += 1;
  }
  if (estimate.warnings.includes("missingVolumeEstimate")) {
    bucket.missingVolumeCount += 1;
  }
}

function bucketFor(map: Map<string, BucketTotals>, key: string, label = key) {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const bucket = emptyBucket(label);
  map.set(key, bucket);
  return bucket;
}

async function boxContents(ctx: QueryCtx, boxId: Id<"boxes">) {
  const memberships = await ctx.db
    .query("boxItems")
    .withIndex("by_box", (q) => q.eq("boxId", boxId))
    .collect();

  const entries = await Promise.all(
    memberships.map(async (membership) => {
      const item = await ctx.db.get(membership.itemId);
      return item && !item.deletedAt ? { membership, item } : null;
    }),
  );

  return entries.filter(
    (entry): entry is { membership: Doc<"boxItems">; item: Doc<"items"> } =>
      Boolean(entry),
  );
}

export const reportForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "inventory:read",
    );

    const [move, items, boxes, boxItems, resources, zones] = await Promise.all([
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
        .query("transportResources")
        .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("transportZones")
        .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
        .collect(),
    ]);

    const activeItems = items.filter((item) => !item.deletedAt);
    const activeBoxes = boxes.filter((box) => !box.archivedAt);
    const activeBoxIds = new Set(activeBoxes.map((box) => String(box._id)));
    const boxedItemIds = new Set(
      boxItems
        .filter((membership) => activeBoxIds.has(String(membership.boxId)))
        .map((membership) => String(membership.itemId)),
    );
    const roomBuckets = new Map<string, BucketTotals>();
    const dispositionBuckets = new Map<string, BucketTotals>();
    const ownerBuckets = new Map<string, BucketTotals>();
    const itemEstimates = activeItems.map((item) => {
      const estimate = estimateItem(item);
      addToBucket(bucketFor(roomBuckets, item.room ?? "unassigned"), estimate);
      addToBucket(bucketFor(dispositionBuckets, item.disposition), estimate);
      addToBucket(
        bucketFor(ownerBuckets, item.ownerPersonId ?? "unassigned"),
        estimate,
      );
      return {
        itemId: item._id,
        name: item.name,
        room: item.room,
        disposition: item.disposition,
        estimate,
      };
    });

    const looseItemReports = activeItems
      .filter(
        (item) =>
          item.status !== "archived" &&
          !boxedItemIds.has(String(item._id)) &&
          isLooseMovableUnitRestItem(item),
      )
      .map((item) => {
        const estimate = estimateItem(item);
        return {
          itemId: item._id,
          name: item.name,
          room: item.room,
          destinationRoom: item.destinationRoom,
          status: item.status,
          disposition: item.disposition,
          quantity: item.quantity ?? 1,
          requiresPersonalTransport: item.requiresPersonalTransport,
          assignedResourceId: item.assignedResourceId,
          assignedZoneId: item.assignedZoneId,
          estimatedWeightLb: roundEstimate(estimate.weight?.value ?? 0),
          estimatedVolumeCuFt: roundEstimate(estimate.volume?.value ?? 0),
          warnings: estimate.warnings,
        };
      });

    const boxReports = await Promise.all(
      activeBoxes.map(async (box) => {
        const contents = await boxContents(ctx, box._id);
        const contentEstimates = contents.map(({ item, membership }) =>
          estimateItem({
            ...item,
            quantity: membership.quantity,
          }),
        );
        const contentsWeight = sumEstimateValues(
          contentEstimates.map((estimate) => estimate.weight),
        );
        const contentsVolume = sumEstimateValues(
          contentEstimates.map((estimate) => estimate.volume),
        );
        const weightSummary = resolveBoxWeight({
          actualWeightLb: box.actualWeightLb,
          estimatedWeightLb: box.estimatedWeightLb,
          contentsEstimatedWeightLb: contentsWeight,
        });
        const estimatedWeightLb = weightSummary.valueLb ?? 0;
        const estimatedVolumeCuFt = box.estimatedVolumeCuFt ?? contentsVolume;
        const warnings: string[] = [];
        if (weightSummary.source === "missing") {
          warnings.push("missingBoxWeightEstimate");
        }
        if (!box.estimatedVolumeCuFt && contentsVolume === 0) {
          warnings.push("missingBoxVolumeEstimate");
        }
        if (estimatedWeightLb > 65) {
          warnings.push("overweightBox");
        }

        return {
          boxId: box._id,
          code: box.code,
          label: box.label,
          room: box.room,
          assignedResourceId: box.assignedResourceId,
          assignedZoneId: box.assignedZoneId,
          assignmentLocked: box.assignmentLocked ?? false,
          assignmentOverrideReason: box.assignmentOverrideReason,
          assignmentWarnings: box.assignmentWarnings ?? [],
          assignmentHardBlocks: box.assignmentHardBlocks ?? [],
          itemCount: contents.reduce(
            (sum, entry) => sum + entry.membership.quantity,
            0,
          ),
          estimatedWeightLb: roundEstimate(estimatedWeightLb),
          weightSource: weightSummary.source,
          weightSourceLabel: weightSummary.label,
          weightSummary,
          estimatedVolumeCuFt: roundEstimate(estimatedVolumeCuFt),
          warnings,
        };
      }),
    );

    const resourceReports = resources.map((resource) => {
      const assignedBoxes = boxReports.filter(
        (box) => box.assignedResourceId === resource._id,
      );
      const assignedLooseItems = looseItemReports.filter(
        (item) => item.assignedResourceId === resource._id,
      );
      const estimatedWeightLb = roundEstimate(
        assignedBoxes.reduce((sum, box) => sum + box.estimatedWeightLb, 0) +
          assignedLooseItems.reduce(
            (sum, item) => sum + item.estimatedWeightLb,
            0,
          ),
      );
      const estimatedVolumeCuFt = roundEstimate(
        assignedBoxes.reduce((sum, box) => sum + box.estimatedVolumeCuFt, 0) +
          assignedLooseItems.reduce(
            (sum, item) => sum + item.estimatedVolumeCuFt,
            0,
          ),
      );
      return {
        resourceId: resource._id,
        name: resource.name,
        type: resource.type,
        estimatedWeightLb,
        estimatedVolumeCuFt,
        assignedBoxCount: assignedBoxes.length,
        assignedLooseItemCount: assignedLooseItems.length,
        assignedUnitCount: assignedBoxes.length + assignedLooseItems.length,
        maxWeightLb: resource.capacity.maxWeightLb,
        maxVolumeCuFt: resource.capacity.maxVolumeCuFt,
        weightPercent:
          resource.capacity.maxWeightLb && !resource.capacity.weightIsUnlimited
            ? roundEstimate(
                (estimatedWeightLb / resource.capacity.maxWeightLb) * 100,
              )
            : undefined,
        volumePercent:
          resource.capacity.maxVolumeCuFt &&
          !resource.capacity.volumeIsUnlimited
            ? roundEstimate(
                (estimatedVolumeCuFt / resource.capacity.maxVolumeCuFt) * 100,
              )
            : undefined,
      };
    });

    const zoneReports = zones.map((zone) => {
      const assignedBoxes = boxReports.filter(
        (box) => box.assignedZoneId === zone._id,
      );
      const assignedLooseItems = looseItemReports.filter(
        (item) => item.assignedZoneId === zone._id,
      );
      return {
        zoneId: zone._id,
        resourceId: zone.resourceId,
        name: zone.name,
        estimatedWeightLb: roundEstimate(
          assignedBoxes.reduce((sum, box) => sum + box.estimatedWeightLb, 0) +
            assignedLooseItems.reduce(
              (sum, item) => sum + item.estimatedWeightLb,
              0,
            ),
        ),
        estimatedVolumeCuFt: roundEstimate(
          assignedBoxes.reduce((sum, box) => sum + box.estimatedVolumeCuFt, 0) +
            assignedLooseItems.reduce(
              (sum, item) => sum + item.estimatedVolumeCuFt,
              0,
            ),
        ),
        assignedBoxCount: assignedBoxes.length,
        assignedLooseItemCount: assignedLooseItems.length,
        assignedUnitCount: assignedBoxes.length + assignedLooseItems.length,
      };
    });

    const totalEstimatedWeightLb = sumEstimateValues(
      itemEstimates.map((item) => item.estimate.weight),
    );
    const totalEstimatedVolumeCuFt = sumEstimateValues(
      itemEstimates.map((item) => item.estimate.volume),
    );

    return {
      moveAllowanceLb: move?.moveLevelWeightAllowanceLb,
      totalEstimatedWeightLb,
      totalEstimatedVolumeCuFt,
      missingWeightCount: itemEstimates.filter((item) =>
        item.estimate.warnings.includes("missingWeightEstimate"),
      ).length,
      missingVolumeCount: itemEstimates.filter((item) =>
        item.estimate.warnings.includes("missingVolumeEstimate"),
      ).length,
      roomTotals: Array.from(roomBuckets.values()),
      dispositionTotals: Array.from(dispositionBuckets.values()),
      ownerTotals: Array.from(ownerBuckets.values()),
      boxReports,
      looseItemReports,
      resourceReports,
      zoneReports,
      itemEstimates: itemEstimates.slice(0, 100),
    };
  },
});
