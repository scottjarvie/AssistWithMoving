import { useCallback, useRef } from "react";

export type PlanPoint = {
  x: number;
  y: number;
};

export type PlanUnderlay = {
  photoId: string;
  opacity: number;
  originX: number;
  originY: number;
  scaleInPerPx: number;
  rotationDeg: number;
};

export type PlanLevelInput = {
  name: string;
  levelType: "indoor" | "outdoor";
  sortOrder: number;
  ceilingHeightIn?: number;
  underlay?: PlanUnderlay;
};

export type PlanEntityInput = {
  levelId: string;
  entityType: "wall" | "room" | "opening" | "feature" | "zone" | "annotation";
  name?: string;
  color?: string;
  locked?: boolean;
  wall?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    thicknessIn: number;
    heightIn: number;
  };
  room?: {
    points: PlanPoint[];
    fillColor?: string;
  };
  opening?: {
    wallShortId: string;
    offsetAlongWallIn: number;
    widthIn: number;
    kind: "door" | "window" | "passage";
    swing: "left" | "right" | "none";
    sillHeightIn?: number;
    headHeightIn?: number;
  };
  feature?: {
    x: number;
    y: number;
    rotationDeg: number;
    featureKind:
      | "stairs"
      | "sink"
      | "toilet"
      | "tub"
      | "shower"
      | "waterHeater"
      | "fireplace"
      | "counter"
      | "shed"
      | "trampoline"
      | "swingSet"
      | "picnicTable"
      | "grill"
      | "raisedBed"
      | "acUnit"
      | "generator"
      | "woodpile"
      | "vehicle"
      | "rv"
      | "trailer"
      | "fence"
      | "custom";
    widthIn: number;
    depthIn: number;
    heightIn?: number;
    label?: string;
  };
  zone?: {
    points: PlanPoint[];
    zoneKind: "driveway" | "shed" | "garden" | "fence" | "patio" | "custom";
  };
  annotation?: {
    x: number;
    y: number;
    text: string;
    fontSizeIn?: number;
  };
};

export type PlacementSource =
  | { itemId: string; boxId?: never; plannedItemId?: never; templateKey?: never }
  | { boxId: string; itemId?: never; plannedItemId?: never; templateKey?: never }
  | {
      plannedItemId: string;
      itemId?: never;
      boxId?: never;
      templateKey?: never;
    }
  | {
      templateKey: string;
      itemId?: never;
      boxId?: never;
      plannedItemId?: never;
    };

export type PlanPlacementInput = PlacementSource & {
  levelId: string;
  x: number;
  y: number;
  rotationDeg: number;
  footprintOverrideIn?: {
    lengthIn: number;
    widthIn: number;
  };
  parentPlacementId?: string;
  containmentMode?: "inside" | "onTop";
  zOrder?: number;
  color?: string;
  locked?: boolean;
};

export type PlanOp =
  | { type: "createLevel"; level: PlanLevelInput }
  | { type: "updateLevel"; levelId: string; patch: Partial<PlanLevelInput> }
  | { type: "deleteLevel"; levelId: string }
  | { type: "restoreLevel"; level: Record<string, unknown> }
  | { type: "setLevelUnderlay"; levelId: string; underlay?: PlanUnderlay }
  | { type: "createEntity"; entity: PlanEntityInput }
  | {
      type: "updateEntity";
      entityId: string;
      patch: Partial<Omit<PlanEntityInput, "levelId" | "entityType">>;
    }
  | { type: "renameEntity"; entityId: string; name?: string }
  | { type: "deleteEntity"; entityId: string }
  | { type: "restoreEntity"; entity: Record<string, unknown> }
  | { type: "createPlacement"; placement: PlanPlacementInput }
  | {
      type: "movePlacement";
      placementId: string;
      x: number;
      y: number;
      rotationDeg: number;
    }
  | {
      type: "updatePlacement";
      placementId: string;
      patch: Partial<
        Pick<
          PlanPlacementInput,
          | "itemId"
          | "boxId"
          | "plannedItemId"
          | "templateKey"
          | "footprintOverrideIn"
          | "color"
          | "locked"
          | "zOrder"
        >
      >;
    }
  | {
      type: "setContainment";
      placementId: string;
      parentPlacementId?: string;
      containmentMode?: "inside" | "onTop";
    }
  | { type: "deletePlacement"; placementId: string }
  | { type: "restorePlacement"; placement: Record<string, unknown> }
  | {
      type: "updatePlanSettings";
      patch: {
        name?: string;
        northAngleDeg?: number;
        defaultWallThicknessIn?: number;
        defaultCeilingHeightIn?: number;
        gridSnapIn?: number;
      };
    };

export type ApplyPlanOpsResult = {
  batchId: string;
  revertedBatchId?: string;
  created: {
    levelIds: string[];
    entityIds: string[];
    placementIds: string[];
  };
};

export function createPlanBatchId(prefix = "batch") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function countPlacementSources(source: {
  itemId?: unknown;
  boxId?: unknown;
  plannedItemId?: unknown;
  templateKey?: unknown;
}) {
  return [source.itemId, source.boxId, source.plannedItemId, source.templateKey]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .length;
}

export function validatePlacementSource(source: {
  itemId?: unknown;
  boxId?: unknown;
  plannedItemId?: unknown;
  templateKey?: unknown;
}) {
  return countPlacementSources(source) === 1;
}

export function usePlanHistory({
  applyOps,
  revertBatch,
}: {
  applyOps: (batchId: string, ops: PlanOp[]) => Promise<ApplyPlanOpsResult>;
  revertBatch: (batchId: string) => Promise<ApplyPlanOpsResult>;
}) {
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);

  const apply = useCallback(
    async (ops: PlanOp[], batchId = createPlanBatchId()) => {
      const result = await applyOps(batchId, ops);
      undoStack.current.push(result.batchId);
      redoStack.current = [];
      return result;
    },
    [applyOps],
  );

  const undo = useCallback(async () => {
    const batchId = undoStack.current.pop();
    if (!batchId) {
      return null;
    }

    const result = await revertBatch(batchId);
    redoStack.current.push(result.batchId);
    return result;
  }, [revertBatch]);

  const redo = useCallback(async () => {
    const batchId = redoStack.current.pop();
    if (!batchId) {
      return null;
    }

    const result = await revertBatch(batchId);
    undoStack.current.push(result.batchId);
    return result;
  }, [revertBatch]);

  return { apply, undo, redo };
}
