import { v } from "convex/values";

import { query } from "./_generated/server";
import { estimateItem, roundEstimate } from "./lib/estimateEngine";
import {
  employerItemWeight,
  employerPacketDisclaimer,
  employerRelocationCategory,
  shouldShowEmployerPrivateFields,
  type EmployerPacketMode,
} from "./lib/employerPacket";
import { requireMovePermission } from "./lib/permissions";

type SummaryBucket = {
  key: string;
  label: string;
  itemCount: number;
  quantity: number;
  estimatedWeightLb: number;
  estimatedVolumeCuFt: number;
  valueCents?: number;
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
    const mode: EmployerPacketMode = args.mode ?? "submission";
    const showPrivate = shouldShowEmployerPrivateFields(mode);

    const [move, items, boxes, resources, boxItems] = await Promise.all([
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
        .query("transportResources")
        .withIndex("by_move_sort", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db.query("boxItems").withIndex("by_move", (q) => q.eq("moveId", args.moveId)).collect(),
    ]);

    if (!move || move.householdId !== args.householdId) {
      throw new Error("Move not found.");
    }

    const activeItems = items.filter((item) => !item.deletedAt);
    const activeBoxes = boxes.filter((box) => !box.archivedAt);
    const boxById = new Map(activeBoxes.map((box) => [box._id, box]));
    const resourceNameById = new Map(resources.map((resource) => [resource._id, resource.name]));
    const boxCodesByItemId = new Map<string, string[]>();

    for (const membership of boxItems) {
      const box = boxById.get(membership.boxId);
      if (!box) continue;
      const current = boxCodesByItemId.get(membership.itemId) ?? [];
      current.push(box.code);
      boxCodesByItemId.set(membership.itemId, current);
    }

    const categoryBuckets = new Map<string, SummaryBucket>();
    const dispositionBuckets = new Map<string, SummaryBucket>();
    const statusBuckets = new Map<string, SummaryBucket>();
    const shipmentItems = [];

    for (const item of activeItems) {
      const estimate = estimateItem(item);
      const category = employerRelocationCategory(item);
      const weight = employerItemWeight(item);
      const volume = estimate.volume?.value ?? item.estimatedVolumeCuFt ?? 0;
      addToBucket(categoryBuckets, category, labelForCategory(category), {
        quantity: item.quantity,
        weight,
        volume,
        valueCents: item.valueCents,
        includeValue: showPrivate,
      });
      addToBucket(dispositionBuckets, item.disposition, item.disposition, {
        quantity: item.quantity,
        weight,
        volume,
        valueCents: item.valueCents,
        includeValue: showPrivate,
      });
      addToBucket(statusBuckets, item.status, item.status, {
        quantity: item.quantity,
        weight,
        volume,
        valueCents: item.valueCents,
        includeValue: showPrivate,
      });
      if (category === "relocationShipment" || category === "storage") {
        shipmentItems.push({
          itemId: item._id,
          name: item.name,
          room: item.room,
          destinationRoom: item.destinationRoom,
          category: item.category,
          disposition: item.disposition,
          status: item.status,
          quantity: item.quantity,
          estimatedWeightLb: roundEstimate(weight),
          estimatedVolumeCuFt: roundEstimate(volume),
          boxCodes: boxCodesByItemId.get(item._id) ?? [],
          private: showPrivate
            ? {
                valueCents: item.valueCents,
                serialNumber: item.serialNumber,
                privateNotes: item.privateNotes,
              }
            : undefined,
        });
      }
    }

    const resourceSummaries = resources.map((resource) => {
      const assignedBoxes = activeBoxes.filter(
        (box) => box.assignedResourceId === resource._id
      );
      return {
        resourceId: resource._id,
        name: resource.name,
        type: resource.type,
        boxCount: assignedBoxes.length,
        estimatedWeightLb: roundEstimate(
          assignedBoxes.reduce(
            (total, box) => total + (box.actualWeightLb ?? box.estimatedWeightLb ?? 0),
            0
          )
        ),
        estimatedVolumeCuFt: roundEstimate(
          assignedBoxes.reduce(
            (total, box) => total + (box.estimatedVolumeCuFt ?? 0),
            0
          )
        ),
      };
    });

    const storageBoxes = activeBoxes.filter((box) => {
      const resource = box.assignedResourceId
        ? resourceNameById.get(box.assignedResourceId)
        : undefined;
      return resource?.toLowerCase().includes("storage");
    });
    const shipmentWeightLb = roundEstimate(
      shipmentItems.reduce((total, item) => total + item.estimatedWeightLb, 0)
    );
    const shipmentVolumeCuFt = roundEstimate(
      shipmentItems.reduce((total, item) => total + item.estimatedVolumeCuFt, 0)
    );

    return {
      mode,
      generatedAt: Date.now(),
      disclaimer: employerPacketDisclaimer(),
      move: {
        title: move.title,
        origin: move.origin,
        destination: move.destination,
        dateStart: move.dateStart,
        dateEnd: move.dateEnd,
        type: move.type,
        notes: showPrivate ? move.notes : undefined,
      },
      visibility: {
        privateFieldsShown: showPrivate,
        valuesHidden: !showPrivate,
        serialsHidden: !showPrivate,
        privateNotesHidden: !showPrivate,
        photosHidden: true,
      },
      summary: {
        itemCount: activeItems.length,
        boxCount: activeBoxes.length,
        resourceCount: resources.length,
        storageBoxCount: storageBoxes.length,
        shipmentWeightLb,
        shipmentVolumeCuFt,
        estimatedPrivateValueCents: showPrivate
          ? activeItems.reduce((total, item) => total + (item.valueCents ?? 0), 0)
          : undefined,
      },
      sections: {
        categoryTotals: Array.from(categoryBuckets.values()),
        dispositionTotals: Array.from(dispositionBuckets.values()),
        statusTotals: Array.from(statusBuckets.values()),
        resourceSummaries,
        shipmentItems,
      },
    };
  },
});

function addToBucket(
  map: Map<string, SummaryBucket>,
  key: string,
  label: string,
  values: {
    quantity: number;
    weight: number;
    volume: number;
    valueCents?: number;
    includeValue: boolean;
  }
) {
  const bucket =
    map.get(key) ??
    ({
      key,
      label,
      itemCount: 0,
      quantity: 0,
      estimatedWeightLb: 0,
      estimatedVolumeCuFt: 0,
      valueCents: values.includeValue ? 0 : undefined,
    } satisfies SummaryBucket);
  bucket.itemCount += 1;
  bucket.quantity += values.quantity;
  bucket.estimatedWeightLb = roundEstimate(bucket.estimatedWeightLb + values.weight);
  bucket.estimatedVolumeCuFt = roundEstimate(
    bucket.estimatedVolumeCuFt + values.volume
  );
  if (values.includeValue) {
    bucket.valueCents = (bucket.valueCents ?? 0) + (values.valueCents ?? 0);
  }
  map.set(key, bucket);
}

function labelForCategory(category: string) {
  switch (category) {
    case "storage":
      return "Storage";
    case "personalTransport":
      return "Personal transport";
    case "excludedDisposition":
      return "Not part of relocation shipment";
    case "relocationShipment":
      return "Relocation shipment";
    default:
      return category;
  }
}
