import type {
  PlanEntityInput,
  PlanOp,
  PlanPlacementInput,
} from "@/lib/plan-ops";

type PlanShortIdCounters = {
  nextWall: number;
  nextRoom: number;
  nextOpening: number;
  nextFeature: number;
  nextZone: number;
  nextAnnotation: number;
  nextPlacement: number;
};

export type ProposalPlan = {
  shortIdCounters: PlanShortIdCounters;
};

export type ProposalEntity = {
  _id: string;
  levelId: string;
  shortId: string;
  entityType: PlanEntityInput["entityType"];
  name?: string;
  color?: string;
  locked?: boolean;
  wall?: PlanEntityInput["wall"];
  room?: PlanEntityInput["room"];
  opening?: PlanEntityInput["opening"];
  feature?: PlanEntityInput["feature"];
  zone?: PlanEntityInput["zone"];
  annotation?: PlanEntityInput["annotation"];
};

export type ProposalPlacement = {
  _id: string;
  levelId: string;
  shortId: string;
  itemId?: string;
  boxId?: string;
  plannedItemId?: string;
  templateKey?: string;
  x: number;
  y: number;
  rotationDeg: number;
  footprintOverrideIn?: PlanPlacementInput["footprintOverrideIn"];
  parentPlacementId?: string;
  containmentMode?: "inside" | "onTop";
  zOrder: number;
  color?: string;
  locked?: boolean;
};

export type ProposalPreviewOp = {
  index: number;
  op: PlanOp;
  label: string;
  status: "acceptable" | "stale";
  staleReason?: string;
};

export type ProposalPreview = {
  entities: ProposalEntity[];
  placements: ProposalPlacement[];
  createdEntityIds: string[];
  updatedEntityIds: string[];
  deletedEntityIds: string[];
  createdPlacementIds: string[];
  updatedPlacementIds: string[];
  deletedPlacementIds: string[];
  ops: ProposalPreviewOp[];
};

export function simulatePlanProposal({
  plan,
  entities,
  placements,
  ops,
}: {
  plan: ProposalPlan;
  entities: ProposalEntity[];
  placements: ProposalPlacement[];
  ops: PlanOp[];
}): ProposalPreview {
  const next = { ...plan.shortIdCounters };
  const entityById = new Map(entities.map((entity) => [entity._id, { ...entity }]));
  const placementById = new Map(
    placements.map((placement) => [placement._id, { ...placement }]),
  );
  const createdEntityIds: string[] = [];
  const updatedEntityIds: string[] = [];
  const deletedEntityIds: string[] = [];
  const createdPlacementIds: string[] = [];
  const updatedPlacementIds: string[] = [];
  const deletedPlacementIds: string[] = [];
  const previewOps: ProposalPreviewOp[] = [];

  ops.forEach((op, index) => {
    const stale = staleReasonForOp(op, entityById, placementById);
    if (stale) {
      previewOps.push({
        index,
        op,
        label: planOpLabel(op),
        status: "stale",
        staleReason: stale,
      });
      return;
    }

    previewOps.push({
      index,
      op,
      label: planOpLabel(op),
      status: "acceptable",
    });

    switch (op.type) {
      case "createEntity": {
        const entityId = `proposal_entity_${index}`;
        const entity = {
          _id: entityId,
          levelId: op.entity.levelId,
          shortId: allocateEntityShortId(op.entity.entityType, next),
          entityType: op.entity.entityType,
          name: op.entity.name,
          color: op.entity.color,
          locked: op.entity.locked ?? false,
          wall: op.entity.wall,
          room: op.entity.room,
          opening: op.entity.opening,
          feature: op.entity.feature,
          zone: op.entity.zone,
          annotation: op.entity.annotation,
        } satisfies ProposalEntity;
        entityById.set(entityId, entity);
        createdEntityIds.push(entityId);
        break;
      }
      case "updateEntity":
      case "renameEntity": {
        const entity = entityById.get(op.entityId);
        if (!entity) break;
        const patch =
          op.type === "renameEntity" ? { name: op.name } : op.patch;
        entityById.set(op.entityId, {
          ...entity,
          ...definedOnly(patch),
        });
        updatedEntityIds.push(op.entityId);
        break;
      }
      case "deleteEntity": {
        entityById.delete(op.entityId);
        deletedEntityIds.push(op.entityId);
        break;
      }
      case "restoreEntity": {
        break;
      }
      case "createPlacement": {
        const placementId = `proposal_placement_${index}`;
        const placement = {
          _id: placementId,
          levelId: op.placement.levelId,
          shortId: `P${next.nextPlacement++}`,
          itemId: op.placement.itemId,
          boxId: op.placement.boxId,
          plannedItemId: op.placement.plannedItemId,
          templateKey: op.placement.templateKey,
          x: op.placement.x,
          y: op.placement.y,
          rotationDeg: op.placement.rotationDeg,
          footprintOverrideIn: op.placement.footprintOverrideIn,
          parentPlacementId: op.placement.parentPlacementId,
          containmentMode: op.placement.containmentMode,
          zOrder: op.placement.zOrder ?? placements.length + createdPlacementIds.length,
          color: op.placement.color,
          locked: op.placement.locked ?? false,
        } satisfies ProposalPlacement;
        placementById.set(placementId, placement);
        createdPlacementIds.push(placementId);
        break;
      }
      case "movePlacement": {
        const placement = placementById.get(op.placementId);
        if (!placement) break;
        placementById.set(op.placementId, {
          ...placement,
          x: op.x,
          y: op.y,
          rotationDeg: op.rotationDeg,
        });
        updatedPlacementIds.push(op.placementId);
        break;
      }
      case "updatePlacement": {
        const placement = placementById.get(op.placementId);
        if (!placement) break;
        const sourcePatch = hasPlacementSourcePatch(op.patch)
          ? {
              itemId: op.patch.itemId,
              boxId: op.patch.boxId,
              plannedItemId: op.patch.plannedItemId,
              templateKey: op.patch.templateKey,
            }
          : {};
        placementById.set(op.placementId, {
          ...placement,
          ...sourcePatch,
          ...definedOnly(op.patch),
        });
        updatedPlacementIds.push(op.placementId);
        break;
      }
      case "setContainment": {
        const placement = placementById.get(op.placementId);
        if (!placement) break;
        placementById.set(op.placementId, {
          ...placement,
          parentPlacementId: op.parentPlacementId,
          containmentMode: op.containmentMode,
        });
        updatedPlacementIds.push(op.placementId);
        break;
      }
      case "deletePlacement": {
        placementById.delete(op.placementId);
        deletedPlacementIds.push(op.placementId);
        break;
      }
      case "createLevel":
      case "updateLevel":
      case "deleteLevel":
      case "restoreLevel":
      case "setLevelUnderlay":
      case "restorePlacement":
      case "updatePlanSettings":
        break;
    }
  });

  return {
    entities: [...entityById.values()],
    placements: [...placementById.values()],
    createdEntityIds,
    updatedEntityIds: unique(updatedEntityIds),
    deletedEntityIds: unique(deletedEntityIds),
    createdPlacementIds,
    updatedPlacementIds: unique(updatedPlacementIds),
    deletedPlacementIds: unique(deletedPlacementIds),
    ops: previewOps,
  };
}

function staleReasonForOp(
  op: PlanOp,
  entityById: Map<string, ProposalEntity>,
  placementById: Map<string, ProposalPlacement>,
) {
  switch (op.type) {
    case "updateEntity":
    case "renameEntity":
    case "deleteEntity":
      return entityById.has(op.entityId)
        ? null
        : `Entity ${op.entityId} no longer exists.`;
    case "movePlacement":
    case "updatePlacement":
    case "setContainment":
    case "deletePlacement":
      return placementById.has(op.placementId)
        ? null
        : `Placement ${op.placementId} no longer exists.`;
    default:
      return null;
  }
}

export function planOpLabel(op: PlanOp) {
  switch (op.type) {
    case "createEntity":
      return `Create ${op.entity.entityType}`;
    case "updateEntity":
      return `Update entity ${op.entityId}`;
    case "renameEntity":
      return `Rename entity ${op.entityId}`;
    case "deleteEntity":
      return `Delete entity ${op.entityId}`;
    case "createPlacement":
      return `Place ${placementSourceLabel(op.placement)}`;
    case "movePlacement":
      return `Move placement ${op.placementId}`;
    case "updatePlacement":
      return `Update placement ${op.placementId}`;
    case "setContainment":
      return `Set containment for ${op.placementId}`;
    case "deletePlacement":
      return `Delete placement ${op.placementId}`;
    case "createLevel":
      return `Create level ${op.level.name}`;
    case "updateLevel":
      return `Update level ${op.levelId}`;
    case "deleteLevel":
      return `Delete level ${op.levelId}`;
    case "setLevelUnderlay":
      return `Set underlay for ${op.levelId}`;
    case "updatePlanSettings":
      return "Update plan settings";
    case "restoreLevel":
      return "Restore level";
    case "restoreEntity":
      return "Restore entity";
    case "restorePlacement":
      return "Restore placement";
  }
}

function allocateEntityShortId(
  type: ProposalEntity["entityType"],
  counters: PlanShortIdCounters,
) {
  switch (type) {
    case "wall":
      return `W${counters.nextWall++}`;
    case "room":
      return `R${counters.nextRoom++}`;
    case "opening":
      return `D${counters.nextOpening++}`;
    case "feature":
      return `F${counters.nextFeature++}`;
    case "zone":
      return `Z${counters.nextZone++}`;
    case "annotation":
      return `A${counters.nextAnnotation++}`;
  }
}

function placementSourceLabel(source: {
  itemId?: string;
  boxId?: string;
  plannedItemId?: string;
  templateKey?: string;
}) {
  return (
    source.itemId ??
    source.boxId ??
    source.plannedItemId ??
    source.templateKey ??
    "placement"
  );
}

function definedOnly<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

function hasPlacementSourcePatch(
  patch: Extract<PlanOp, { type: "updatePlacement" }>["patch"],
) {
  return (
    "itemId" in patch ||
    "boxId" in patch ||
    "plannedItemId" in patch ||
    "templateKey" in patch
  );
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
