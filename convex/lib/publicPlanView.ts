import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  type PlanDocumentInput,
  type PlanEntitySummary,
  type PlanPlacementSummary,
  type PlanSourceSummary,
} from "../../src/lib/plan-describe";
import { itemDimensionsConfidenceForRead } from "../../src/lib/inventory-measurements";
import { pointInPolygon } from "../../src/lib/plan-geometry";
import {
  publicPlanDocument,
  renderPublicPlanSnapshotSvg,
} from "../../src/lib/plan-public";

export async function buildPublicPlanView(
  ctx: { db: QueryCtx["db"] },
  args: {
    householdId: Id<"households">;
    moveId: Id<"moves">;
  },
) {
  const plans = await ctx.db
    .query("floorPlans")
    .withIndex("by_move_status", (q) =>
      q.eq("moveId", args.moveId).eq("status", "active"),
    )
    .collect();
  const plan = plans.find(
    (entry) => entry.householdId === args.householdId && !entry.archivedAt,
  );
  if (!plan) {
    return null;
  }

  const [move, levels, entities, placements, items, boxes, plannedItems, boxItems] =
    await Promise.all([
      ctx.db.get(args.moveId),
      ctx.db
        .query("planLevels")
        .withIndex("by_plan_sort", (q) => q.eq("planId", plan._id))
        .collect(),
      ctx.db
        .query("planEntities")
        .withIndex("by_plan_type", (q) => q.eq("planId", plan._id))
        .collect(),
      ctx.db
        .query("planPlacements")
        .withIndex("by_plan", (q) => q.eq("planId", plan._id))
        .collect(),
      ctx.db
        .query("items")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("boxes")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("plannedItems")
        .withIndex("by_move_updated", (q) => q.eq("moveId", args.moveId))
        .collect(),
      ctx.db
        .query("boxItems")
        .withIndex("by_move", (q) => q.eq("moveId", args.moveId))
        .collect(),
    ]);

  if (!move || move.householdId !== args.householdId) {
    return null;
  }

  const activeLevels = levels.filter((level) => !level.archivedAt);
  const plannedItemsById = new Map(
    plannedItems
      .filter((plannedItem) => plannedItem.householdId === args.householdId)
      .map((plannedItem) => [String(plannedItem._id), plannedItem]),
  );
  const publicEntities = entities
    .filter((entity) => !entity.archivedAt && entity.entityType !== "annotation")
    .map((entity): PlanEntitySummary => ({
      entityId: entity._id,
      levelId: entity.levelId,
      shortId: entity.shortId,
      entityType: entity.entityType,
      name: entity.name,
      color: entity.color,
      locked: entity.locked,
      wall: entity.wall,
      room: entity.room,
      opening: entity.opening,
      feature: entity.feature,
      zone: entity.zone,
    }));
  const activeItems = items.filter((item) => item.status !== "archived");
  const activeBoxes = boxes.filter((box) => box.status !== "archived");
  const itemsById = new Map(activeItems.map((item) => [String(item._id), item]));
  const boxesById = new Map(activeBoxes.map((box) => [String(box._id), box]));
  const itemCountsByBox = new Map<string, number>();
  for (const assignment of boxItems) {
    if (assignment.householdId !== args.householdId) continue;
    itemCountsByBox.set(
      String(assignment.boxId),
      (itemCountsByBox.get(String(assignment.boxId)) ?? 0) + assignment.quantity,
    );
  }

  const publicPlacements = placements
    .filter((placement) => !placement.archivedAt)
    .map((placement): PlanPlacementSummary => ({
      placementId: placement._id,
      levelId: placement.levelId,
      shortId: placement.shortId,
        source: publicPlacementSource(
          placement,
          itemsById,
          boxesById,
          plannedItemsById,
        ),
      x: placement.x,
      y: placement.y,
      rotationDeg: placement.rotationDeg,
      footprintOverrideIn: placement.footprintOverrideIn,
      parentPlacementId: placement.parentPlacementId,
      containmentMode: placement.containmentMode,
      zOrder: placement.zOrder,
      color: placement.color,
      locked: placement.locked,
    }));

  const document = publicPlanDocument({
    plan: {
      planId: plan._id,
      moveId: plan.moveId,
      name: plan.name,
      kind: plan.kind,
      northAngleDeg: plan.northAngleDeg,
      defaultWallThicknessIn: plan.defaultWallThicknessIn,
      defaultCeilingHeightIn: plan.defaultCeilingHeightIn,
      gridSnapIn: plan.gridSnapIn,
      shortIdCounters: plan.shortIdCounters,
      nextSeq: plan.nextSeq,
      status: plan.status,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    },
    levels: activeLevels.map((level) => ({
      levelId: level._id,
      name: level.name,
      levelType: level.levelType,
      sortOrder: level.sortOrder,
      ceilingHeightIn: level.ceilingHeightIn,
    })),
    entities: publicEntities,
    placements: publicPlacements,
  } satisfies PlanDocumentInput);

  const rooms = document.entities.filter(
    (entity) => entity.entityType === "room" && entity.room,
  );
  const destinationRooms = new Set(
    rooms.map((room) => roomKey(publicRoomName(room))).filter(Boolean),
  );

  return {
    plan: {
      planId: document.plan.planId,
      moveId: document.plan.moveId,
      name: document.plan.name,
      kind: document.plan.kind,
      moveTitle: move.title,
      updatedAt: document.plan.updatedAt,
    },
    privacy: {
      underlayHidden: true,
      valuesHidden: true,
      privateNotesHidden: true,
      annotationsHidden: true,
    },
    levels: document.levels.map((level) => {
      const levelRooms = rooms.filter((room) => room.levelId === level.levelId);
      return {
        levelId: level.levelId,
        name: level.name,
        levelType: level.levelType,
        svg: renderPublicPlanSnapshotSvg(document, level.levelId),
        rooms: levelRooms.map((room) => ({
          roomId: room.entityId,
          shortId: room.shortId,
          name: publicRoomName(room),
          areaSqFt: room.room?.areaSqFt ?? 0,
          placed: publicPlacements
            .filter((placement) =>
              room.room
                ? pointInPolygon({ x: placement.x, y: placement.y }, room.room.points)
                : false,
            )
            .map((placement) => ({
              placementId: placement.placementId,
              shortId: placement.shortId,
              label: placement.source?.label ?? placement.shortId,
            })),
          items: activeItems
            .filter(
              (item) =>
                roomKey(item.destinationRoom ?? item.room) ===
                roomKey(publicRoomName(room)),
            )
            .map(publicManifestItem),
          boxes: activeBoxes
            .filter(
              (box) =>
                roomKey(box.destinationRoom ?? box.room) ===
                roomKey(publicRoomName(room)),
            )
            .map((box) => publicManifestBox(box, itemCountsByBox)),
        })),
      };
    }),
    unplaced: {
      items: activeItems
        .filter((item) => !destinationRooms.has(roomKey(item.destinationRoom ?? item.room)))
        .map(publicManifestItem),
      boxes: activeBoxes
        .filter((box) => !destinationRooms.has(roomKey(box.destinationRoom ?? box.room)))
        .map((box) => publicManifestBox(box, itemCountsByBox)),
    },
  };
}

function publicPlacementSource(
  placement: Doc<"planPlacements">,
  itemsById: Map<string, Doc<"items">>,
  boxesById: Map<string, Doc<"boxes">>,
  plannedItemsById: Map<string, Doc<"plannedItems">>,
): PlanSourceSummary | undefined {
  if (placement.itemId) {
    const item = itemsById.get(String(placement.itemId));
    return {
      kind: "item",
      sourceId: String(placement.itemId),
      label: item?.name ?? "Item",
      dimensionsIn: item?.dimensionsIn,
      confidence: itemDimensionsConfidenceForRead({
        dimensionsIn: item?.dimensionsIn,
        dimensionsConfidence: item?.dimensionsConfidence,
      }),
    };
  }
  if (placement.boxId) {
    const box = boxesById.get(String(placement.boxId));
    return {
      kind: "box",
      sourceId: String(placement.boxId),
      label: box?.label ? `${box.code} ${box.label}` : (box?.code ?? "Box"),
      dimensionsIn: box?.dimensionsIn,
    };
  }
  if (placement.plannedItemId) {
    const plannedItem = plannedItemsById.get(String(placement.plannedItemId));
    return {
      kind: "plannedItem",
      sourceId: String(placement.plannedItemId),
      label: plannedItem?.name ?? `Planned item ${placement.plannedItemId}`,
      dimensionsIn: plannedItem?.dimensionsIn,
      confidence: plannedItem?.dimensionsConfidence,
    };
  }
  if (placement.templateKey) {
    return {
      kind: "template",
      sourceId: placement.templateKey,
      label: placement.templateKey,
      confidence: "medium",
    };
  }
  return undefined;
}

function publicManifestItem(item: Doc<"items">) {
  return {
    itemId: item._id,
    name: item.name,
    quantity: item.quantity,
    room: item.destinationRoom ?? item.room,
    category: item.category,
    status: item.status,
    fragility: item.fragility,
    doNotLetMoversTouch: item.planningDefaultKeys.includes(
      "doNotLetMoversTouch",
    ),
    fragile: item.fragility === "high" || item.planningDefaultKeys.includes("fragile"),
  };
}

function publicManifestBox(
  box: Doc<"boxes">,
  itemCountsByBox: Map<string, number>,
) {
  return {
    boxId: box._id,
    code: box.code,
    label: box.label,
    room: box.destinationRoom ?? box.room,
    status: box.status,
    itemCount: itemCountsByBox.get(String(box._id)) ?? 0,
  };
}

function publicRoomName(room: PlanEntitySummary) {
  return room.name ?? room.autoName ?? room.shortId;
}

function roomKey(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}
