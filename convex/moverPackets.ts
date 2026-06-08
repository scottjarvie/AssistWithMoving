import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import {
  moverBoxExceptionLevel,
  moverFlagsForItem,
  shouldShowMoverContents,
  shouldShowMoverPrivateFields,
  type MoverPacketMode,
} from "./lib/moverPacket";
import { requireMovePermission } from "./lib/permissions";

export const getForMove = query({
  args: {
    householdId: v.id("households"),
    moveId: v.id("moves"),
    mode: v.optional(
      v.union(v.literal("movingCompany"), v.literal("loadCrew"), v.literal("owner"))
    ),
  },
  handler: async (ctx, args) => {
    await requireMovePermission(
      ctx,
      args.householdId,
      args.moveId,
      "documentation:read"
    );
    const mode: MoverPacketMode = args.mode ?? "movingCompany";
    const showContents = shouldShowMoverContents(mode);
    const showPrivate = shouldShowMoverPrivateFields(mode);

    const [move, boxes, boxItems, items, resources, zones] = await Promise.all([
      ctx.db.get(args.moveId),
      ctx.db
        .query("boxes")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db.query("boxItems").withIndex("by_move", (q) => q.eq("moveId", args.moveId)).collect(),
      ctx.db
        .query("items")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
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

    const activeBoxes = boxes.filter((box) => !box.archivedAt);
    const activeItems = items.filter((item) => !item.deletedAt);
    const itemById = new Map(activeItems.map((item) => [item._id, item]));
    const resourceNameById = new Map(resources.map((resource) => [resource._id, resource.name]));
    const zoneNameById = new Map(zones.map((zone) => [zone._id, zone.name]));

    const packetBoxes = activeBoxes.map((box) => {
      const memberships = boxItems.filter((membership) => membership.boxId === box._id);
      const contents = memberships
        .map((membership) => {
          const item = itemById.get(membership.itemId);
          return item ? contentForItem(item, membership.quantity, showPrivate) : null;
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
      const contentFlags = contents.flatMap((entry) => entry.flags);
      const flags = Array.from(new Set(contentFlags));
      const warnings = [
        ...(box.assignmentWarnings ?? []),
        ...(box.assignmentHardBlocks ?? []),
      ];
      const assignedResource = box.assignedResourceId
        ? resourceNameById.get(box.assignedResourceId)
        : undefined;
      const assignedZone = box.assignedZoneId ? zoneNameById.get(box.assignedZoneId) : undefined;

      return {
        boxId: box._id,
        code: box.code,
        label: box.label,
        room: box.room,
        destinationRoom: box.destinationRoom,
        status: box.status,
        assignedResource,
        assignedZone,
        itemCount: memberships.reduce((total, entry) => total + entry.quantity, 0),
        estimatedWeightLb: box.actualWeightLb ?? box.estimatedWeightLb,
        estimatedVolumeCuFt: box.estimatedVolumeCuFt,
        flags,
        warnings,
        exceptionLevel: moverBoxExceptionLevel({
          flags,
          warnings,
          assignedResource,
        }),
        contents: showContents ? contents : [],
      };
    });

    const resourceSections = resources.map((resource) => {
      const resourceBoxes = packetBoxes.filter(
        (box) => box.assignedResource === resource.name
      );
      return {
        resourceId: resource._id,
        name: resource.name,
        type: resource.type,
        zones: [
          {
            zoneId: `${resource._id}:any`,
            name: "Any zone",
            boxes: resourceBoxes.filter((box) => !box.assignedZone),
          },
          ...zones
            .filter((zone) => zone.resourceId === resource._id)
            .map((zone) => ({
              zoneId: zone._id,
              name: zone.name,
              boxes: resourceBoxes.filter((box) => box.assignedZone === zone.name),
            })),
        ],
      };
    });

    return {
      mode,
      generatedAt: Date.now(),
      move: {
        title: move.title,
        origin: move.origin,
        destination: move.destination,
        dateStart: move.dateStart,
        dateEnd: move.dateEnd,
      },
      visibility: {
        contentsShown: showContents,
        privateFieldsShown: showPrivate,
        valuesHidden: !showPrivate,
        serialsHidden: !showPrivate,
        privateNotesHidden: !showPrivate,
      },
      summary: {
        boxCount: packetBoxes.length,
        itemCount: packetBoxes.reduce((total, box) => total + box.itemCount, 0),
        clearCount: packetBoxes.filter((box) => box.exceptionLevel === "clear")
          .length,
        attentionCount: packetBoxes.filter(
          (box) => box.exceptionLevel === "attention"
        ).length,
        blockerCount: packetBoxes.filter((box) => box.exceptionLevel === "blocker")
          .length,
        unassignedCount: packetBoxes.filter((box) => !box.assignedResource).length,
      },
      sections: {
        resources: resourceSections,
        unassigned: packetBoxes.filter((box) => !box.assignedResource),
        attention: packetBoxes.filter((box) => box.exceptionLevel !== "clear"),
        allBoxes: packetBoxes,
      },
    };
  },
});

function contentForItem(
  item: Doc<"items">,
  quantity: number,
  showPrivate: boolean
) {
  return {
    itemId: item._id,
    name: item.name,
    quantity,
    room: item.room,
    destinationRoom: item.destinationRoom,
    status: item.status,
    condition: item.condition,
    flags: moverFlagsForItem({ ...item, quantity }),
    private: showPrivate
      ? {
          valueCents: item.valueCents,
          serialNumber: item.serialNumber,
          privateNotes: item.privateNotes,
        }
      : undefined,
  };
}
