"use client";

import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Check,
  Home,
  Clipboard,
  DoorOpen,
  Eye,
  ImageOff,
  Lock,
  Map,
  Maximize2,
  MousePointer2,
  Palette,
  PenLine,
  RotateCcw,
  RotateCw,
  Ruler,
  Shapes,
  Sparkles,
  Square,
  Trash2,
  Unlock,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { FeatureUnavailable } from "@/components/feature-unavailable";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { MoveWorkspaceTabList } from "@/components/move-workspace-tab-list";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { PhotoUploadControl } from "@/components/photo-upload-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { itemDimensionsConfidenceForRead } from "@/lib/inventory-measurements";
import {
  distancePointToSegment,
  doorSwingArc,
  pointAlongWall,
  clampOpeningToWall,
  polygonArea,
  polygonCentroid,
  polygonSelfIntersects,
  snapToGrid,
  wallOffsetAtPoint,
  type Point,
  type WallSegment,
} from "@/lib/plan-geometry";
import {
  analyzePlanFit,
  type FitIssue,
  type FitReport,
} from "@/lib/plan-geometry/fit";
import {
  entityDisplayPoint,
  wallDisplayNames,
  type WallDisplayName,
} from "@/lib/plan-geometry/naming";
import {
  formatAreaSquareInches,
  formatLengthInches,
} from "@/lib/plan-geometry/units";
import {
  calibratedUnderlayScale,
  parsePlanLengthInput,
} from "@/lib/plan-geometry/underlay";
import {
  placementBorderStyle,
  placementCorners,
  placementFootprintFromDimensions,
  groupPlacementChildren,
  isPlacementDescendant,
  totalContainedCount,
  type MeasurementConfidence,
  type PlacementDimensions,
} from "@/lib/plan-placements";
import { planTemplateByKey, planTemplates } from "@/lib/plan-templates";
import {
  createPlanBatchId,
  usePlanHistory,
  type ApplyPlanOpsResult,
  type PlanOp,
} from "@/lib/plan-ops";
import {
  simulatePlanProposal,
  type ProposalEntity,
  type ProposalPlacement,
  type ProposalPreview,
} from "@/lib/plan-proposals";
import { flagEnabled } from "@/lib/feature-flags";

type PlanDocument = FunctionReturnType<
  typeof api.floorPlans.getActiveDocumentForMove
>;
type ActivePlanDocument = NonNullable<PlanDocument>;
type PlanEntity = ActivePlanDocument["entities"][number];
type PlanLevel = ActivePlanDocument["levels"][number];
type PlanPlacement = ActivePlanDocument["placements"][number];
type PlanProposal = FunctionReturnType<typeof api.planOps.listProposals>[number];
type PlanAgentBatch = FunctionReturnType<
  typeof api.planOps.listRecentAgentBatches
>[number];
type MoveItem = FunctionReturnType<typeof api.items.listForMove>[number];
type MoveBoxRow = FunctionReturnType<typeof api.boxes.listForMove>[number];
type PlannedItem = FunctionReturnType<typeof api.plannedItems.listForMove>[number];
type UnderlayPhoto = ActivePlanDocument["underlayPhotos"][number];
type ViewBox = { x: number; y: number; width: number; height: number };
type PlacementFootprintSource = Pick<
  PlanPlacement,
  "footprintOverrideIn" | "templateKey"
>;
type PlacementPreviewModel = PlacementFootprintSource &
  Pick<PlanPlacement, "x" | "y" | "rotationDeg">;
type PlacementTraySource =
  | {
      kind: "template";
      key: string;
      label: string;
      meta: string;
      category: string;
      room?: string;
      hasSize: boolean;
      templateKey: string;
      dimensions: PlacementDimensions;
    }
  | {
      kind: "item";
      key: string;
      label: string;
      meta: string;
      category: string;
      room?: string;
      hasSize: boolean;
      itemId: Id<"items">;
      dimensions?: PlacementDimensions;
    }
  | {
      kind: "box";
      key: string;
      label: string;
      meta: string;
      category: string;
      room?: string;
      hasSize: boolean;
      boxId: Id<"boxes">;
      dimensions?: PlacementDimensions;
    }
  | {
      kind: "planned";
      key: string;
      label: string;
      meta: string;
      category: string;
      room?: string;
      hasSize: boolean;
      plannedItemId: Id<"plannedItems">;
      dimensions?: PlacementDimensions;
    };
type UnderlayCalibration = {
  levelId: Id<"planLevels">;
  points: Point[];
};
type UnderlayMoveDraft = {
  pointerId: number;
  start: Point;
  current: Point;
  originX: number;
  originY: number;
};
type DrawingTool =
  | "select"
  | "wall"
  | "roomRect"
  | "roomPolygon"
  | "opening"
  | "feature"
  | "annotation"
  | "zone";
type OpeningKind = "door" | "window" | "passage";
type FeatureKind =
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
type ZoneKind = "driveway" | "shed" | "garden" | "fence" | "patio" | "custom";

const indoorFeatureKinds = [
  "stairs",
  "sink",
  "toilet",
  "tub",
  "shower",
  "waterHeater",
  "fireplace",
  "counter",
  "custom",
] as const satisfies readonly FeatureKind[];

const outdoorFeatureKinds = [
  "shed",
  "trampoline",
  "swingSet",
  "picnicTable",
  "grill",
  "raisedBed",
  "acUnit",
  "generator",
  "woodpile",
  "vehicle",
  "rv",
  "trailer",
  "fence",
  "custom",
] as const satisfies readonly FeatureKind[];

const zoneKinds = [
  "driveway",
  "shed",
  "garden",
  "patio",
  "fence",
  "custom",
] as const satisfies readonly ZoneKind[];
type EditDraft =
  | {
      entity: PlanEntity;
      mode: "wallStart" | "wallEnd";
      current: Point;
    }
  | {
      entity: PlanEntity;
      mode: "wallMove";
      origin: Point;
      current: Point;
    }
  | {
      entity: PlanEntity;
      mode: "roomVertex" | "zoneVertex" | "roomVertexInsert" | "zoneVertexInsert";
      vertexIndex: number;
      current: Point;
    }
  | {
      entity: PlanEntity;
      mode: "feature" | "annotation";
      current: Point;
    }
  | {
      entity: PlanEntity;
      mode: "featureResize" | "featureRotate";
      current: Point;
    }
  | {
      entity: PlanEntity;
      mode: "openingCenter" | "openingStart" | "openingEnd";
      wall: WallSegment;
      current: Point;
    };
type PlacementEditDraft =
  | {
      placement: PlanPlacement;
      mode: "placementMove";
      origin: Point;
      current: Point;
    }
  | {
      placement: PlanPlacement;
      mode: "placementRotate";
      current: Point;
    };
type ContainmentOffer =
  | {
      kind: "create";
      source: PlacementTraySource;
      point: Point;
      parent: PlanPlacement;
    }
  | {
      kind: "move";
      child: PlanPlacement;
      point: Point;
      parent: PlanPlacement;
    };

export function PlanWorkspacePage() {
  const { featureFlags, householdId, moveId, selectedMove } = useMoveWorkspace();
  const enabled = flagEnabled(featureFlags, "layoutStudio", false);
  const document = useQuery(
    api.floorPlans.getActiveDocumentForMove,
    enabled && householdId && moveId ? { householdId, moveId } : "skip",
  );
  const createFloorPlan = useMutation(api.floorPlans.createFloorPlan);
  const seedExampleHome = useMutation(api.planOps.seedExampleHome);
  const [busy, setBusy] = useState<"create" | "seed" | null>(null);

  async function handleCreatePlan() {
    if (!householdId || !moveId) {
      return;
    }

    setBusy("create");
    try {
      await createFloorPlan({ householdId, moveId });
    } finally {
      setBusy(null);
    }
  }

  async function handleLoadExampleHome() {
    if (!householdId || !moveId) {
      return;
    }

    setBusy("seed");
    try {
      const planId =
        document?.plan._id ??
        (
          await createFloorPlan({
            householdId,
            moveId,
            name: "Example destination plan",
          })
        ).planId;
      await seedExampleHome({ householdId, moveId, planId });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Layout Studio"
        description="Draw the destination home and yard, then use it as the placement map for move day."
      />

      {!enabled ? (
        <FeatureUnavailable
          title="Layout Studio is not enabled"
          description="This experimental planner is behind a feature flag while the data model and renderer settle."
        />
      ) : document === undefined ? (
        <PlanLoadingState />
      ) : document === null ? (
        <PlanEmptyState
          busy={busy}
          onCreatePlan={handleCreatePlan}
          onLoadExampleHome={handleLoadExampleHome}
        />
      ) : (
        <PlanStudioSurface
          document={document}
          unitSystem={selectedMove?.unitSystem ?? "imperial"}
          busy={busy}
          onLoadExampleHome={handleLoadExampleHome}
        />
      )}
    </div>
  );
}

function PlanLoadingState() {
  return (
    <section className="grid min-h-[520px] place-items-center rounded-lg border border-border bg-card">
      <div className="text-sm text-muted-foreground">Loading plan...</div>
    </section>
  );
}

function PlanEmptyState({
  busy,
  onCreatePlan,
  onLoadExampleHome,
}: {
  busy: "create" | "seed" | null;
  onCreatePlan: () => void;
  onLoadExampleHome: () => void;
}) {
  return (
    <section className="grid min-h-[520px] place-items-center rounded-lg border border-dashed border-border bg-card p-6">
      <div className="max-w-xl text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-lg border border-border bg-secondary">
          <Home className="size-5 text-secondary-foreground" aria-hidden="true" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">Start the destination plan</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Layout Studio turns rooms, walls, doors, and yard zones into a shared
          map for the move. Start blank, or load a sample home so the renderer
          has walls, openings, labels, and a Yard level to inspect.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={onCreatePlan} disabled={busy !== null}>
            <Home className="size-4" aria-hidden="true" />
            {busy === "create" ? "Creating..." : "Create plan"}
          </Button>
          <Button
            variant="outline"
            onClick={onLoadExampleHome}
            disabled={busy !== null}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {busy === "seed" ? "Loading..." : "Load example home"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function PlanStudioSurface({
  document,
  unitSystem,
  busy,
  onLoadExampleHome,
}: {
  document: ActivePlanDocument;
  unitSystem: "imperial" | "metric";
  busy: "create" | "seed" | null;
  onLoadExampleHome: () => void;
}) {
  const [levelId, setLevelId] = useState<Id<"planLevels"> | null>(
    document.levels[0]?._id ?? null,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedPlacementIds, setSelectedPlacementIds] = useState<string[]>([]);
  const [hoverPlacementId, setHoverPlacementId] = useState<string | null>(null);
  const [placingSource, setPlacingSource] = useState<PlacementTraySource | null>(
    null,
  );
  const [opError, setOpError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<DrawingTool>("select");
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [openingKind, setOpeningKind] = useState<OpeningKind>("door");
  const [featureKind, setFeatureKind] = useState<FeatureKind>("counter");
  const [zoneKind, setZoneKind] = useState<ZoneKind>("driveway");
  const [underlayCalibration, setUnderlayCalibration] =
    useState<UnderlayCalibration | null>(null);
  const [underlayMoveLevelId, setUnderlayMoveLevelId] =
    useState<Id<"planLevels"> | null>(null);
  const [requestedProposalId, setRequestedProposalId] = useState<string | null>(null);
  const [proposalOpSelection, setProposalOpSelection] = useState<{
    proposalId: string;
    indexes: number[];
  } | null>(null);
  const [proposalBusy, setProposalBusy] = useState<
    "apply" | "reject" | null
  >(null);
  const [revertingBatchId, setRevertingBatchId] = useState<string | null>(null);
  const applyOpsMutation = useMutation(api.planOps.applyOps);
  const revertBatchMutation = useMutation(api.planOps.revertBatch);
  const updateItemMutation = useMutation(api.items.update);
  const reviewProposalMutation = useMutation(api.planOps.reviewProposal);
  const rejectProposalMutation = useMutation(api.planOps.rejectProposal);
  const proposals = useQuery(api.planOps.listProposals, {
    householdId: document.plan.householdId,
    moveId: document.plan.moveId,
    planId: document.plan._id,
    includeReviewed: true,
  });
  const agentBatches = useQuery(api.planOps.listRecentAgentBatches, {
    householdId: document.plan.householdId,
    moveId: document.plan.moveId,
    planId: document.plan._id,
    limit: 5,
  });
  const moveItems = useQuery(api.items.listForMove, {
    householdId: document.plan.householdId,
    moveId: document.plan.moveId,
  });
  const moveBoxes = useQuery(api.boxes.listForMove, {
    householdId: document.plan.householdId,
    moveId: document.plan.moveId,
  });
  const plannedItems = useQuery(api.plannedItems.listForMove, {
    householdId: document.plan.householdId,
    moveId: document.plan.moveId,
  });
  const historyApplyOps = useCallback(
    (batchId: string, ops: PlanOp[]) =>
      applyOpsMutation({
        householdId: document.plan.householdId,
        moveId: document.plan.moveId,
        planId: document.plan._id,
        batchId,
        ops,
      }),
    [applyOpsMutation, document.plan],
  );
  const historyRevertBatch = useCallback(
    (batchId: string) =>
      revertBatchMutation({
        householdId: document.plan.householdId,
        moveId: document.plan.moveId,
        planId: document.plan._id,
        batchId,
      }),
    [document.plan, revertBatchMutation],
  );
  const { apply: applyHistory, undo } = usePlanHistory({
    applyOps: historyApplyOps,
    revertBatch: historyRevertBatch,
  });
  const activeLevel =
    document.levels.find((level) => level._id === levelId) ??
    document.levels[0];
  const activeUnderlayPhoto = activeLevel?.underlay
    ? document.underlayPhotos.find(
        (photo) => photo._id === activeLevel.underlay?.photoId,
      )
    : undefined;
  const levelEntities = useMemo(
    () =>
      activeLevel
        ? document.entities.filter((entity) => entity.levelId === activeLevel._id)
        : [],
    [activeLevel, document.entities],
  );
  const levelPlacements = useMemo(
    () =>
      activeLevel
        ? document.placements.filter(
            (placement) => placement.levelId === activeLevel._id,
          ).sort((a, b) => a.zOrder - b.zOrder)
        : [],
    [activeLevel, document.placements],
  );
  const selectedEntities = useMemo(
    () => document.entities.filter((entity) => selectedIds.includes(entity._id)),
    [document.entities, selectedIds],
  );
  const selectedPlacements = useMemo(
    () =>
      document.placements.filter((placement) =>
        selectedPlacementIds.includes(placement._id),
      ),
    [document.placements, selectedPlacementIds],
  );
  const wallNames = useMemo(
    () =>
      wallDisplayNames({
        walls: document.entities
          .filter((entity) => entity.wall)
          .map((entity) => ({
            shortId: entity.shortId,
            name: entity.name,
            wall: entity.wall,
          })),
        rooms: document.entities
          .filter((entity) => entity.room)
          .map((entity) => ({
            shortId: entity.shortId,
            name: entity.name,
            room: entity.room,
          })),
        northAngleDeg: document.plan.northAngleDeg,
      }),
    [document.entities, document.plan.northAngleDeg],
  );
  const fitReport = useMemo(
    () =>
      buildFitReport({
        entities: levelEntities,
        placements: levelPlacements,
        items: moveItems ?? [],
        boxes: moveBoxes ?? [],
      }),
    [levelEntities, levelPlacements, moveBoxes, moveItems],
  );
  const pendingProposals = useMemo(
    () => (proposals ?? []).filter((proposal) => proposal.status === "pending"),
    [proposals],
  );
  const reviewedProposals = useMemo(
    () => (proposals ?? []).filter((proposal) => proposal.status !== "pending"),
    [proposals],
  );
  const activeProposal =
    pendingProposals.find(
      (proposal) => proposal.proposalId === requestedProposalId,
    ) ??
    pendingProposals[0] ??
    null;
  const activeProposalOps = useMemo(
    () => (activeProposal ? (activeProposal.ops as PlanOp[]) : []),
    [activeProposal],
  );
  const activeProposalPreview = useMemo(
    () =>
      activeProposal
        ? simulatePlanProposal({
            plan: document.plan,
            entities: document.entities,
            placements: document.placements,
            ops: activeProposalOps,
          })
        : null,
    [activeProposal, activeProposalOps, document.entities, document.placements, document.plan],
  );
  const acceptableProposalOpIndexes = useMemo(
    () =>
      activeProposalPreview?.ops
        .filter((entry) => entry.status === "acceptable")
        .map((entry) => entry.index) ?? [],
    [activeProposalPreview],
  );
  const selectedProposalOpIndexes =
    activeProposal && proposalOpSelection?.proposalId === activeProposal.proposalId
      ? proposalOpSelection.indexes
      : acceptableProposalOpIndexes;
  const setSelectedProposalOpIndexes = useCallback(
    (indexes: number[]) => {
      if (!activeProposal) {
        return;
      }
      setProposalOpSelection({
        proposalId: activeProposal.proposalId,
        indexes,
      });
    },
    [activeProposal],
  );
  const selectedProposalPreview = useMemo(() => {
    if (!activeProposal || !activeProposalPreview) {
      return null;
    }
    const selected = new Set(selectedProposalOpIndexes);
    const selectedOps = activeProposalPreview.ops
      .filter((entry) => selected.has(entry.index) && entry.status === "acceptable")
      .map((entry) => entry.op);

    if (!selectedOps.length) {
      return null;
    }

    return simulatePlanProposal({
      plan: document.plan,
      entities: document.entities,
      placements: document.placements,
      ops: selectedOps,
    });
  }, [
    activeProposal,
    activeProposalPreview,
    document.entities,
    document.placements,
    document.plan,
    selectedProposalOpIndexes,
  ]);

  const applyPlanOps = useCallback(
    async (ops: PlanOp[]) => {
      try {
        const result = await applyHistory(ops, createPlanBatchId("layout"));
        setOpError(null);
        return result;
      } catch (error) {
        setOpError(planOpErrorMessage(error));
        return {
          batchId: "failed",
          created: {
            levelIds: [],
            entityIds: [],
            placementIds: [],
          },
        };
      }
    },
    [applyHistory],
  );

  function toggleSelection(entityId: string, additive: boolean) {
    if (!additive) {
      setSelectedPlacementIds([]);
    }
    setSelectedIds((current) => {
      if (!additive) {
        return [entityId];
      }
      return current.includes(entityId)
        ? current.filter((id) => id !== entityId)
        : [...current, entityId];
    });
  }

  function togglePlacementSelection(placementId: string, additive: boolean) {
    if (!additive) {
      setSelectedIds([]);
    }
    setSelectedPlacementIds((current) => {
      if (!additive) {
        return [placementId];
      }
      return current.includes(placementId)
        ? current.filter((id) => id !== placementId)
        : [...current, placementId];
    });
  }

  const deleteSelected = useCallback(async () => {
    if (!selectedEntities.length && !selectedPlacements.length) {
      return;
    }
    await applyPlanOps(
      [
        ...selectedEntities.map((entity) => ({
          type: "deleteEntity" as const,
          entityId: entity._id,
        })),
        ...selectedPlacements.map((placement) => ({
          type: "deletePlacement" as const,
          placementId: placement._id,
        })),
      ],
    );
    setSelectedIds([]);
    setSelectedPlacementIds([]);
  }, [applyPlanOps, selectedEntities, selectedPlacements]);

  const reviewActiveProposal = useCallback(
    async (acceptedOpIndexes: number[]) => {
      if (!activeProposal) {
        return;
      }
      setProposalBusy("apply");
      try {
        await reviewProposalMutation({
          householdId: document.plan.householdId,
          moveId: document.plan.moveId,
          planId: document.plan._id,
          proposalId: activeProposal.proposalId,
          acceptedOpIndexes,
        });
        setOpError(null);
      } catch (error) {
        setOpError(planOpErrorMessage(error));
      } finally {
        setProposalBusy(null);
      }
    },
    [activeProposal, document.plan, reviewProposalMutation],
  );

  const rejectActiveProposal = useCallback(async () => {
    if (!activeProposal) {
      return;
    }
    setProposalBusy("reject");
    try {
      await rejectProposalMutation({
        householdId: document.plan.householdId,
        moveId: document.plan.moveId,
        planId: document.plan._id,
        proposalId: activeProposal.proposalId,
      });
      setOpError(null);
    } catch (error) {
      setOpError(planOpErrorMessage(error));
    } finally {
      setProposalBusy(null);
    }
  }, [activeProposal, document.plan, rejectProposalMutation]);

  const linkTemplatePlacementToItem = useCallback(
    async (
      placement: PlanPlacement,
      itemId: Id<"items">,
      backfillDimensions: boolean,
    ) => {
      const template = planTemplateByKey(placement.templateKey);
      if (!template) {
        return;
      }
      await applyPlanOps([
        {
          type: "updatePlacement",
          placementId: placement._id,
          patch: {
            itemId,
            footprintOverrideIn: {
              lengthIn: template.lengthIn,
              widthIn: template.widthIn,
            },
          },
        },
      ]);
      if (backfillDimensions) {
        await updateItemMutation({
          householdId: document.plan.householdId,
          moveId: document.plan.moveId,
          itemId,
          dimensionsIn: {
            lengthIn: template.lengthIn,
            widthIn: template.widthIn,
            heightIn: template.heightIn,
          },
          dimensionsConfidence: "medium",
        });
      }
    },
    [applyPlanOps, document.plan, updateItemMutation],
  );

  const revertAgentBatch = useCallback(
    async (batchId: string) => {
      setRevertingBatchId(batchId);
      try {
        await revertBatchMutation({
          householdId: document.plan.householdId,
          moveId: document.plan.moveId,
          planId: document.plan._id,
          batchId,
        });
        setOpError(null);
      } catch (error) {
        setOpError(planOpErrorMessage(error));
      } finally {
        setRevertingBatchId(null);
      }
    },
    [document.plan, revertBatchMutation],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedIds([]);
        setSelectedPlacementIds([]);
        setPlacingSource(null);
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedIds.length || selectedPlacementIds.length) {
          event.preventDefault();
          void deleteSelected();
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        void undo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteSelected, selectedIds.length, selectedPlacementIds.length, undo]);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <h2 className="sr-only">Plan workspace</h2>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="secondary">{document.plan.kind}</Badge>
          <span className="truncate text-sm font-medium">{document.plan.name}</span>
          <span className="text-xs text-muted-foreground">
            {levelEntities.length} entities
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onLoadExampleHome}
          disabled={busy !== null}
        >
          <Sparkles className="size-4" aria-hidden="true" />
          {busy === "seed" ? "Loading..." : "Load example"}
        </Button>
      </div>
      {opError ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {opError}
        </div>
      ) : null}

      <div className="grid gap-0 lg:grid-cols-[72px_minmax(0,1fr)_260px]">
        <ToolPalette
          activeTool={activeTool}
          onToolChange={setActiveTool}
          snapEnabled={snapEnabled}
          onSnapChange={setSnapEnabled}
          openingKind={openingKind}
          onOpeningKindChange={setOpeningKind}
          featureKind={featureKind}
          onFeatureKindChange={setFeatureKind}
          zoneKind={zoneKind}
          onZoneKindChange={setZoneKind}
          levelType={activeLevel?.levelType ?? "indoor"}
        />
        <PlanCanvas
          key={activeLevel?._id ?? "empty"}
          plan={document.plan}
          level={activeLevel}
          entities={levelEntities}
          placements={levelPlacements}
          items={moveItems ?? []}
          underlayPhoto={activeUnderlayPhoto}
          unitSystem={unitSystem}
          activeTool={activeTool}
          snapEnabled={snapEnabled}
          openingKind={openingKind}
          featureKind={featureKind}
          zoneKind={zoneKind}
          selectedIds={selectedIds}
          selectedPlacementIds={selectedPlacementIds}
          hoverId={hoverId}
          hoverPlacementId={hoverPlacementId}
          placingSource={placingSource}
          fitReport={fitReport}
          wallNames={wallNames}
          proposalPreview={selectedProposalPreview}
          underlayCalibration={underlayCalibration}
          underlayMoveActive={
            Boolean(activeLevel && underlayMoveLevelId === activeLevel._id)
          }
          onUnderlayCalibrationChange={setUnderlayCalibration}
          onUnderlayMoveActiveChange={(active) =>
            setUnderlayMoveLevelId(active && activeLevel ? activeLevel._id : null)
          }
          onApplyOps={applyPlanOps}
          onSelect={toggleSelection}
          onPlacementSelect={togglePlacementSelection}
          onHover={setHoverId}
          onPlacementHover={setHoverPlacementId}
          onClearSelection={() => {
            setSelectedIds([]);
            setSelectedPlacementIds([]);
          }}
          onToolChange={setActiveTool}
          onPlacementSourcePlaced={() => setPlacingSource(null)}
        />
        <div className="border-t border-border p-4 lg:border-l lg:border-t-0">
          <PlanSideRailTabs
            review={
              <div className="space-y-4">
                <ProposalReviewPanel
                  proposals={pendingProposals}
                  reviewedProposals={reviewedProposals}
                  loading={proposals === undefined}
                  activeProposal={activeProposal}
                  preview={activeProposalPreview}
                  selectedOpIndexes={selectedProposalOpIndexes}
                  busy={proposalBusy}
                  onProposalChange={(proposalId) => {
                    setRequestedProposalId(proposalId);
                    setProposalOpSelection(null);
                  }}
                  onSelectedOpIndexesChange={setSelectedProposalOpIndexes}
                  onApplySelected={() =>
                    reviewActiveProposal(selectedProposalOpIndexes)
                  }
                  onApplyAll={() =>
                    reviewActiveProposal(
                      activeProposalPreview?.ops
                        .filter((entry) => entry.status === "acceptable")
                        .map((entry) => entry.index) ?? [],
                    )
                  }
                  onReject={rejectActiveProposal}
                />
                <AgentBatchHistoryPanel
                  batches={agentBatches ?? []}
                  loading={agentBatches === undefined}
                  revertingBatchId={revertingBatchId}
                  onRevert={revertAgentBatch}
                />
              </div>
            }
            inspect={
              <div className="space-y-4">
                <PlanInspector
                  document={document}
                  selectedEntities={selectedEntities}
                  selectedPlacements={selectedPlacements}
                  placements={document.placements}
                  items={moveItems ?? []}
                  fitReport={fitReport}
                  unitSystem={unitSystem}
                  wallNames={wallNames}
                  onApplyOps={applyPlanOps}
                  onPlacementSelect={togglePlacementSelection}
                  onDeleteSelected={deleteSelected}
                  onLinkTemplateToItem={linkTemplatePlacementToItem}
                />
                <div>
                  <h3 className="text-sm font-semibold">Levels</h3>
                  <div className="mt-3 grid gap-2">
                    {document.levels.map((level) => (
                      <Button
                        key={level._id}
                        variant={
                          level._id === activeLevel?._id ? "secondary" : "outline"
                        }
                        className="justify-start"
                        onClick={() => setLevelId(level._id)}
                      >
                        {level.name}
                        <Badge className="ml-auto" variant="outline">
                          {level.levelType}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-border p-3 text-xs leading-5 text-muted-foreground">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <MousePointer2 className="size-4" aria-hidden="true" />
                    Read-only viewer
                  </div>
                  <p className="mt-2">
                    Drag the canvas to pan. Use the zoom controls or mouse wheel
                    to inspect walls, door swings, room areas, and yard zones.
                  </p>
                </div>
              </div>
            }
            blueprint={
              <UnderlayPanel
                householdId={document.plan.householdId}
                moveId={document.plan.moveId}
                level={activeLevel}
                underlayPhoto={activeUnderlayPhoto}
                calibration={underlayCalibration}
                moving={Boolean(
                  activeLevel && underlayMoveLevelId === activeLevel._id,
                )}
                onCalibrationChange={setUnderlayCalibration}
                onMovingChange={(moving) =>
                  setUnderlayMoveLevelId(
                    moving && activeLevel ? activeLevel._id : null,
                  )
                }
                onApplyOps={applyPlanOps}
              />
            }
            place={
              <TemplatePlacementPanel
                level={activeLevel}
                placements={document.placements}
                items={moveItems ?? []}
                boxes={moveBoxes ?? []}
                plannedItems={plannedItems ?? []}
                placingSource={placingSource}
                onBeginPlacement={(source) => {
                  setActiveTool("select");
                  setPlacingSource(source);
                }}
                onCancelPlacement={() => setPlacingSource(null)}
              />
            }
          />
        </div>
      </div>
    </section>
  );
}

export function PlanSideRailTabs({
  review,
  inspect,
  blueprint,
  place,
}: {
  review: ReactNode;
  inspect: ReactNode;
  blueprint: ReactNode;
  place: ReactNode;
}) {
  return (
    <Tabs defaultValue="inspect" className="gap-4">
      <MoveWorkspaceTabList
        tabs={[
          { value: "inspect", label: "Inspect" },
          { value: "place", label: "Place" },
          { value: "review", label: "Review" },
          { value: "blueprint", label: "Blueprint" },
        ]}
      />

      <TabsContent value="inspect">{inspect}</TabsContent>
      <TabsContent value="place">{place}</TabsContent>
      <TabsContent value="review">{review}</TabsContent>
      <TabsContent value="blueprint">{blueprint}</TabsContent>
    </Tabs>
  );
}

function ToolPalette({
  activeTool,
  onToolChange,
  snapEnabled,
  onSnapChange,
  openingKind,
  onOpeningKindChange,
  featureKind,
  onFeatureKindChange,
  zoneKind,
  onZoneKindChange,
  levelType,
}: {
  activeTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  snapEnabled: boolean;
  onSnapChange: (enabled: boolean) => void;
  openingKind: OpeningKind;
  onOpeningKindChange: (kind: OpeningKind) => void;
  featureKind: FeatureKind;
  onFeatureKindChange: (kind: FeatureKind) => void;
  zoneKind: ZoneKind;
  onZoneKindChange: (kind: ZoneKind) => void;
  levelType: PlanLevel["levelType"];
}) {
  const tools: Array<{
    tool: DrawingTool;
    label: string;
    icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
    disabled?: boolean;
  }> = [
    { tool: "select", label: "Select (V)", icon: MousePointer2 },
    { tool: "wall", label: "Wall (W)", icon: PenLine },
    { tool: "roomRect", label: "Room rectangle (R)", icon: Square },
    { tool: "roomPolygon", label: "Room polygon", icon: Shapes },
    { tool: "opening", label: "Opening (D)", icon: DoorOpen },
    { tool: "feature", label: "Feature", icon: Home },
    { tool: "annotation", label: "Annotation (T)", icon: Clipboard },
    {
      tool: "zone",
      label: "Outdoor zone",
      icon: Map,
      disabled: levelType !== "outdoor",
    },
  ];

  return (
    <div className="flex flex-col gap-2 border-b border-border p-2 lg:border-b-0 lg:border-r">
      {tools.map((item) => (
        <Button
          key={item.tool}
          variant={activeTool === item.tool ? "secondary" : "ghost"}
          size="icon-lg"
          disabled={item.disabled}
          aria-label={item.label}
          title={item.label}
          onClick={() => onToolChange(item.tool)}
        >
          <item.icon className="size-4" aria-hidden />
        </Button>
      ))}
      <div className="my-1 h-px bg-border" />
      <Button
        variant={snapEnabled ? "secondary" : "ghost"}
        size="icon-lg"
        aria-label="Toggle snap"
        title="Toggle snap"
        onClick={() => onSnapChange(!snapEnabled)}
      >
        <Ruler className="size-4" aria-hidden />
      </Button>
      {activeTool === "opening" ? (
        <select
          className="h-8 w-full rounded-md border border-input bg-background text-xs"
          value={openingKind}
          aria-label="Opening kind"
          onChange={(event) =>
            onOpeningKindChange(event.target.value as OpeningKind)
          }
        >
          <option value="door">Door</option>
          <option value="window">Window</option>
          <option value="passage">Passage</option>
        </select>
      ) : null}
      {activeTool === "feature" ? (
        <select
          className="h-8 w-full rounded-md border border-input bg-background text-xs"
          value={featureKind}
          aria-label="Feature kind"
          onChange={(event) =>
            onFeatureKindChange(event.target.value as FeatureKind)
          }
        >
          <optgroup label="Indoor">
            {indoorFeatureKinds.map((kind) => (
              <option key={kind} value={kind}>
                {featureKindLabel(kind)}
              </option>
            ))}
          </optgroup>
          <optgroup label="Outdoor">
            {outdoorFeatureKinds.map((kind) => (
              <option key={kind} value={kind} disabled={levelType !== "outdoor"}>
                {featureKindLabel(kind)}
              </option>
            ))}
          </optgroup>
        </select>
      ) : null}
      {activeTool === "zone" ? (
        <select
          className="h-8 w-full rounded-md border border-input bg-background text-xs"
          value={zoneKind}
          aria-label="Outdoor zone kind"
          disabled={levelType !== "outdoor"}
          onChange={(event) => onZoneKindChange(event.target.value as ZoneKind)}
        >
          {zoneKinds.map((kind) => (
            <option key={kind} value={kind}>
              {zoneKindLabel(kind)}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

function ProposalReviewPanel({
  proposals,
  reviewedProposals,
  loading,
  activeProposal,
  preview,
  selectedOpIndexes,
  busy,
  onProposalChange,
  onSelectedOpIndexesChange,
  onApplySelected,
  onApplyAll,
  onReject,
}: {
  proposals: PlanProposal[];
  reviewedProposals: PlanProposal[];
  loading: boolean;
  activeProposal: PlanProposal | null;
  preview: ProposalPreview | null;
  selectedOpIndexes: number[];
  busy: "apply" | "reject" | null;
  onProposalChange: (proposalId: string) => void;
  onSelectedOpIndexesChange: (indexes: number[]) => void;
  onApplySelected: () => void;
  onApplyAll: () => void;
  onReject: () => void;
}) {
  const acceptableIndexes =
    preview?.ops
      .filter((entry) => entry.status === "acceptable")
      .map((entry) => entry.index) ?? [];
  const selected = new Set(selectedOpIndexes);
  const selectedAcceptableCount = acceptableIndexes.filter((index) =>
    selected.has(index),
  ).length;
  const staleCount =
    preview?.ops.filter((entry) => entry.status === "stale").length ?? 0;

  function toggleOp(index: number, checked: boolean) {
    onSelectedOpIndexesChange(
      checked
        ? Array.from(new Set([...selectedOpIndexes, index])).sort((a, b) => a - b)
        : selectedProposalOpIndexesWithout(selectedOpIndexes, index),
    );
  }

  return (
    <section className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Eye className="size-4" aria-hidden="true" />
            Agent proposals
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {loading
              ? "Loading suggestions..."
              : proposals.length
                ? `${proposals.length} pending`
                : "No pending suggestions"}
          </p>
        </div>
        {proposals.length ? <Badge variant="secondary">{proposals.length}</Badge> : null}
      </div>

      {proposals.length > 1 ? (
        <div className="mt-3 grid gap-2">
          {proposals.map((proposal) => (
            <Button
              key={proposal.proposalId}
              variant={
                activeProposal?.proposalId === proposal.proposalId
                  ? "secondary"
                  : "outline"
              }
              size="sm"
              className="justify-start"
              onClick={() => onProposalChange(proposal.proposalId)}
            >
              <span className="truncate">
                {proposal.agentLabel ?? "Layout agent"}
              </span>
              <Badge className="ml-auto" variant="outline">
                {proposal.ops.length}
              </Badge>
            </Button>
          ))}
        </div>
      ) : null}

      {activeProposal && preview ? (
        <div className="mt-4 space-y-3">
          <div>
            <div className="text-xs font-semibold">
              {activeProposal.agentLabel ?? "Layout agent"}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {formatProposalTime(activeProposal.createdAt)}
            </div>
            {activeProposal.reasoning ? (
              <p className="mt-2 line-clamp-4 text-xs leading-5 text-muted-foreground">
                {activeProposal.reasoning}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="xs"
              variant="outline"
              onClick={() => onSelectedOpIndexesChange(acceptableIndexes)}
              disabled={!acceptableIndexes.length || busy !== null}
            >
              Select all
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onSelectedOpIndexesChange([])}
              disabled={!selectedOpIndexes.length || busy !== null}
            >
              Clear
            </Button>
            {staleCount ? (
              <Badge variant="destructive">{staleCount} stale</Badge>
            ) : null}
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {preview.ops.map((entry) => {
              const isStale = entry.status === "stale";
              return (
                <label
                  key={`${activeProposal.proposalId}-${entry.index}`}
                  className={
                    isStale
                      ? "block rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs"
                      : "block rounded-md border border-border bg-background p-2 text-xs"
                  }
                >
                  <span className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-3.5 accent-primary"
                      checked={selected.has(entry.index)}
                      disabled={isStale || busy !== null}
                      onChange={(event) =>
                        toggleOp(entry.index, event.currentTarget.checked)
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium leading-4">
                        {entry.label}
                      </span>
                      {entry.staleReason ? (
                        <span className="mt-1 block leading-4 text-destructive">
                          {entry.staleReason}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              onClick={onApplySelected}
              disabled={!selectedAcceptableCount || busy !== null}
            >
              <Check className="size-4" aria-hidden="true" />
              {busy === "apply" ? "Applying..." : `Apply ${selectedAcceptableCount}`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onApplyAll}
              disabled={!acceptableIndexes.length || busy !== null}
            >
              Apply all
            </Button>
            <Button
              className="col-span-2"
              size="sm"
              variant="destructive"
              onClick={onReject}
              disabled={busy !== null}
            >
              <X className="size-4" aria-hidden="true" />
              {busy === "reject" ? "Rejecting..." : "Reject proposal"}
            </Button>
          </div>
        </div>
      ) : null}

      {reviewedProposals.length ? (
        <details className="mt-4 rounded-md border border-border bg-muted/30 p-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold">
            <span>Reviewed history</span>
            <Badge variant="outline">{reviewedProposals.length}</Badge>
          </summary>
          <div className="mt-3 space-y-2">
            {reviewedProposals.slice(0, 6).map((proposal) => (
              <div
                key={proposal.proposalId}
                className="rounded-md border border-border bg-background p-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold">
                      {proposal.agentLabel ?? "Layout agent"}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {proposal.ops.length} ops /{" "}
                      {formatProposalTime(proposal.reviewedAt ?? proposal.updatedAt)}
                    </div>
                  </div>
                  <Badge variant={proposal.status === "rejected" ? "destructive" : "secondary"}>
                    {proposalStatusLabel(proposal)}
                  </Badge>
                </div>
                {proposal.status !== "rejected" ? (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {proposal.appliedOpIndexes?.length ?? 0} applied
                  </div>
                ) : null}
                {proposal.reasoning ? (
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                    {proposal.reasoning}
                  </p>
                ) : null}
              </div>
            ))}
            {reviewedProposals.length > 6 ? (
              <p className="text-[11px] text-muted-foreground">
                Showing latest 6 reviewed proposals.
              </p>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function selectedProposalOpIndexesWithout(indexes: number[], index: number) {
  return indexes.filter((value) => value !== index);
}

function proposalStatusLabel(proposal: PlanProposal) {
  switch (proposal.status) {
    case "applied":
      return "Applied";
    case "partiallyApplied":
      return "Partially applied";
    case "rejected":
      return "Rejected";
    default:
      return "Pending";
  }
}

function AgentBatchHistoryPanel({
  batches,
  loading,
  revertingBatchId,
  onRevert,
}: {
  batches: PlanAgentBatch[];
  loading: boolean;
  revertingBatchId: string | null;
  onRevert: (batchId: string) => void;
}) {
  return (
    <section className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <RotateCw className="size-4" aria-hidden="true" />
            Recent agent changes
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {loading
              ? "Loading activity..."
              : batches.length
                ? `${batches.length} direct batches`
                : "No direct agent changes"}
          </p>
        </div>
      </div>
      {batches.length ? (
        <div className="mt-3 space-y-2">
          {batches.map((batch) => (
            <div
              key={batch.batchId}
              className="rounded-md border border-border bg-background p-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">
                    {batch.agentLabel ?? "API agent"}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {batch.opCount} ops / {formatProposalTime(batch.updatedAt)}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    {shortBatchId(batch.batchId)}
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => onRevert(batch.batchId)}
                  disabled={revertingBatchId !== null}
                >
                  {revertingBatchId === batch.batchId ? "Reverting..." : "Revert"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatProposalTime(createdAt: number) {
  return new Date(createdAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortBatchId(batchId: string) {
  return batchId.length > 28 ? `${batchId.slice(0, 25)}...` : batchId;
}

function PlanInspector({
  document,
  selectedEntities,
  selectedPlacements,
  placements,
  items,
  fitReport,
  unitSystem,
  wallNames,
  onApplyOps,
  onPlacementSelect,
  onDeleteSelected,
  onLinkTemplateToItem,
}: {
  document: ActivePlanDocument;
  selectedEntities: PlanEntity[];
  selectedPlacements: PlanPlacement[];
  placements: PlanPlacement[];
  items: MoveItem[];
  fitReport: FitReport;
  unitSystem: "imperial" | "metric";
  wallNames: Map<string, WallDisplayName>;
  onApplyOps: (ops: PlanOp[]) => Promise<ApplyPlanOpsResult>;
  onPlacementSelect: (placementId: string, additive: boolean) => void;
  onDeleteSelected: () => Promise<void>;
  onLinkTemplateToItem: (
    placement: PlanPlacement,
    itemId: Id<"items">,
    backfillDimensions: boolean,
  ) => Promise<void>;
}) {
  const selectedEntity = selectedEntities[0];
  const selectedPlacement = selectedPlacements[0];
  const selectedCount = selectedEntities.length + selectedPlacements.length;
  const multi = selectedCount > 1;

  async function copySelectedLabel() {
    if (selectedEntity) {
      await navigator.clipboard?.writeText(displayLabel(selectedEntity, wallNames));
      return;
    }
    if (selectedPlacement) {
      await navigator.clipboard?.writeText(placementDisplayLabel(selectedPlacement));
      return;
    }
  }

  async function setSelectedLock(locked: boolean) {
    if (!selectedCount) {
      return;
    }
    await onApplyOps(
      [
        ...selectedEntities.map((entity) => ({
          type: "updateEntity" as const,
          entityId: entity._id,
          patch: { locked },
        })),
        ...selectedPlacements.map((placement) => ({
          type: "updatePlacement" as const,
          placementId: placement._id,
          patch: { locked },
        })),
      ],
    );
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Inspector</h3>
        {selectedCount ? (
          <Badge variant="outline">{selectedCount} selected</Badge>
        ) : null}
      </div>

      {!selectedCount ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Select a room, wall, opening, feature, zone, annotation, or placement
          to inspect its shared ID and editable properties.
        </p>
      ) : multi ? (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Bulk actions apply through the plan op layer.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelectedLock(true)}>
              <Lock className="size-4" aria-hidden="true" />
              Lock
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelectedLock(false)}>
              <Unlock className="size-4" aria-hidden="true" />
              Unlock
            </Button>
            <Button size="sm" variant="destructive" onClick={onDeleteSelected}>
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          </div>
        </div>
      ) : selectedPlacement ? (
        <PlacementInspector
          placement={selectedPlacement}
          placements={placements}
          items={items}
          fitReport={fitReport}
          unitSystem={unitSystem}
          onApplyOps={onApplyOps}
          onPlacementSelect={onPlacementSelect}
          onCopy={copySelectedLabel}
          onDeleteSelected={onDeleteSelected}
          onLinkTemplateToItem={onLinkTemplateToItem}
        />
      ) : selectedEntity ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-1">
            <label className="text-xs font-medium" htmlFor="entity-name">
              Name
            </label>
            <Input
              id="entity-name"
              defaultValue={selectedEntity.name ?? ""}
              placeholder={autoEntityLabel(selectedEntity, wallNames)}
              disabled={selectedEntity.locked}
              onBlur={(event) => {
                void onApplyOps([
                  {
                    type: "renameEntity",
                    entityId: selectedEntity._id,
                    name: event.currentTarget.value,
                  },
                ]);
              }}
            />
          </div>
          <div className="grid gap-2 text-xs">
            <InfoRow label="ID" value={selectedEntity.shortId} />
            <InfoRow label="Type" value={selectedEntity.entityType} />
            <InfoRow
              label="Label"
              value={displayLabel(selectedEntity, wallNames).replace(
                `${selectedEntity.shortId} — `,
                "",
              )}
            />
            <InfoRow
              label="Size"
              value={entityMetric(selectedEntity, unitSystem) ?? "Not measured"}
            />
          </div>
          {selectedEntity.opening &&
          (selectedEntity.opening.kind === "door" ||
            selectedEntity.opening.kind === "passage") ? (
            <DoorFitInspector
              doorShortId={selectedEntity.shortId}
              issues={fitReport.doorIssues.get(selectedEntity.shortId) ?? []}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copySelectedLabel}>
              <Clipboard className="size-4" aria-hidden="true" />
              Copy ID
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                onApplyOps([
                  {
                    type: "updateEntity",
                    entityId: selectedEntity._id,
                    patch: { locked: !selectedEntity.locked },
                  },
                ])
              }
            >
              {selectedEntity.locked ? (
                <Unlock className="size-4" aria-hidden="true" />
              ) : (
                <Lock className="size-4" aria-hidden="true" />
              )}
              {selectedEntity.locked ? "Unlock" : "Lock"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={selectedEntity.locked}
              onClick={onDeleteSelected}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          </div>
          {selectedEntity.opening?.kind === "door" ? (
            <div>
              <div className="mb-2 text-xs font-medium">Door swing</div>
              <div className="flex flex-wrap gap-2">
                {(["left", "right", "none"] as const).map((swing) => (
                  <Button
                    key={swing}
                    size="xs"
                    variant={
                      selectedEntity.opening?.swing === swing
                        ? "secondary"
                        : "outline"
                    }
                    disabled={selectedEntity.locked}
                    onClick={() =>
                      onApplyOps([
                        {
                          type: "updateEntity",
                          entityId: selectedEntity._id,
                          patch: {
                            opening: {
                              ...selectedEntity.opening!,
                              swing,
                            },
                          },
                        },
                      ])
                    }
                  >
                    {swing}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium">
              <Palette className="size-3.5" aria-hidden="true" />
              Color
            </div>
            <div className="flex flex-wrap gap-2">
              {["var(--chart-1)", "var(--chart-2)", "var(--chart-4)"].map(
                (color) => (
                  <button
                    key={color}
                    type="button"
                    className="size-7 rounded-md border border-border"
                    style={{ background: color }}
                    disabled={selectedEntity.locked}
                    aria-label={`Set color ${color}`}
                    onClick={() =>
                      onApplyOps([
                        {
                          type: "updateEntity",
                          entityId: selectedEntity._id,
                          patch: { color },
                        },
                      ])
                    }
                  />
                ),
              )}
              <Button
                size="xs"
                variant="outline"
                disabled={selectedEntity.locked}
                onClick={() =>
                  onApplyOps([
                    {
                      type: "updateEntity",
                      entityId: selectedEntity._id,
                      patch: { color: "" },
                    },
                  ])
                }
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 border-t border-border pt-3">
        <h4 className="text-xs font-semibold">Plan settings</h4>
        <div className="mt-2 grid gap-2">
          <Input
            aria-label="Plan name"
            defaultValue={document.plan.name}
            onBlur={(event) =>
              onApplyOps([
                {
                  type: "updatePlanSettings",
                  patch: { name: event.currentTarget.value },
                },
              ])
            }
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              aria-label="North angle"
              type="number"
              defaultValue={document.plan.northAngleDeg}
              onBlur={(event) =>
                onApplyOps([
                  {
                    type: "updatePlanSettings",
                    patch: {
                      northAngleDeg: Number(event.currentTarget.value),
                    },
                  },
                ])
              }
            />
            <Input
              aria-label="Grid snap inches"
              type="number"
              defaultValue={document.plan.gridSnapIn}
              onBlur={(event) =>
                onApplyOps([
                  {
                    type: "updatePlanSettings",
                    patch: { gridSnapIn: Number(event.currentTarget.value) },
                  },
                ])
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PlacementInspector({
  placement,
  placements,
  items,
  fitReport,
  unitSystem,
  onApplyOps,
  onPlacementSelect,
  onCopy,
  onDeleteSelected,
  onLinkTemplateToItem,
}: {
  placement: PlanPlacement;
  placements: PlanPlacement[];
  items: MoveItem[];
  fitReport: FitReport;
  unitSystem: "imperial" | "metric";
  onApplyOps: (ops: PlanOp[]) => Promise<ApplyPlanOpsResult>;
  onPlacementSelect: (placementId: string, additive: boolean) => void;
  onCopy: () => Promise<void>;
  onDeleteSelected: () => Promise<void>;
  onLinkTemplateToItem: (
    placement: PlanPlacement,
    itemId: Id<"items">,
    backfillDimensions: boolean,
  ) => Promise<void>;
}) {
  const [linkItemId, setLinkItemId] = useState<Id<"items"> | "">("");
  const [backfillTemplateDimensions, setBackfillTemplateDimensions] =
    useState(true);
  const [linkingItem, setLinkingItem] = useState(false);
  const template = planTemplateByKey(placement.templateKey);
  const linkedItem = placement.itemId
    ? items.find((item) => item._id === placement.itemId)
    : undefined;
  const itemsById = useMemo(
    () => new globalThis.Map<string, MoveItem>(items.map((item) => [item._id, item])),
    [items],
  );
  const linkableItems = useMemo(
    () =>
      [...items].sort((first, second) =>
        first.name.localeCompare(second.name),
      ),
    [items],
  );
  const footprint = placementFootprint(placement);
  const border = placementBorderStyle(
    footprint,
    placementMeasurementConfidence(placement, itemsById),
  );
  const confidenceLabel = border.marker
    ? "Unknown footprint"
    : border.dashArray
      ? "Estimated footprint"
      : "Measured footprint";
  const children = placements.filter(
    (candidate) => candidate.parentPlacementId === placement._id,
  );
  const candidateParents = placements.filter(
    (candidate) =>
      candidate._id !== placement._id &&
      !isPlacementDescendant(candidate._id, placement._id, placements),
  );
  const parent = placement.parentPlacementId
    ? placements.find((candidate) => candidate._id === placement.parentPlacementId)
    : undefined;
  const placementIssues = fitReport.issues.filter(
    (issue) => issue.placementShortId === placement.shortId,
  );

  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-2 text-xs">
        <InfoRow label="ID" value={placement.shortId} />
        <InfoRow label="Type" value="placement" />
        <InfoRow
          label="Source"
          value={linkedItem?.name ?? template?.label ?? "Move item"}
        />
        <InfoRow label="Size" value={placementMetric(placement, unitSystem)} />
        <InfoRow label="Confidence" value={confidenceLabel} />
        {parent ? <InfoRow label="Contained by" value={parent.shortId} /> : null}
      </div>
      {placementIssues.length ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2">
          <div className="text-xs font-semibold text-destructive">
            Fit warnings
          </div>
          <div className="mt-2 grid gap-1">
            {placementIssues.map((issue) => (
              <button
                key={`${issue.type}-${issue.message}`}
                type="button"
                className="text-left text-xs leading-5 text-destructive"
                onClick={() => void navigator.clipboard?.writeText(issue.message)}
              >
                {issue.message}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {template ? (
        <div className="rounded-md border border-border p-2">
          <div className="text-xs font-semibold">Link template to item</div>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            Re-point this placement to real inventory while keeping the same
            position, rotation, color, and containment.
          </p>
          <div className="mt-2 grid gap-2">
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              aria-label="Inventory item for template placement"
              value={linkItemId}
              disabled={placement.locked || linkingItem}
              onChange={(event) =>
                setLinkItemId(event.currentTarget.value as Id<"items">)
              }
            >
              <option value="">Choose item...</option>
              {linkableItems.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                  {item.destinationRoom || item.room
                    ? ` (${item.destinationRoom ?? item.room})`
                    : ""}
                </option>
              ))}
            </select>
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5 size-3.5 accent-primary"
                checked={backfillTemplateDimensions}
                disabled={placement.locked || linkingItem}
                onChange={(event) =>
                  setBackfillTemplateDimensions(event.currentTarget.checked)
                }
              />
              <span>
                Backfill item dimensions from {template.label} as medium
                confidence.
              </span>
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={!linkItemId || placement.locked || linkingItem}
              onClick={async () => {
                if (!linkItemId) {
                  return;
                }
                setLinkingItem(true);
                try {
                  await onLinkTemplateToItem(
                    placement,
                    linkItemId,
                    backfillTemplateDimensions,
                  );
                } finally {
                  setLinkingItem(false);
                }
              }}
            >
              {linkingItem ? "Linking..." : "Link item"}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Input
          aria-label="Placement X"
          type="number"
          defaultValue={placement.x}
          disabled={placement.locked}
          onBlur={(event) =>
            onApplyOps([
              {
                type: "movePlacement",
                placementId: placement._id,
                x: Number(event.currentTarget.value),
                y: placement.y,
                rotationDeg: placement.rotationDeg,
              },
            ])
          }
        />
        <Input
          aria-label="Placement Y"
          type="number"
          defaultValue={placement.y}
          disabled={placement.locked}
          onBlur={(event) =>
            onApplyOps([
              {
                type: "movePlacement",
                placementId: placement._id,
                x: placement.x,
                y: Number(event.currentTarget.value),
                rotationDeg: placement.rotationDeg,
              },
            ])
          }
        />
        <Input
          aria-label="Placement rotation"
          type="number"
          defaultValue={Math.round(placement.rotationDeg)}
          disabled={placement.locked}
          onBlur={(event) =>
            onApplyOps([
              {
                type: "movePlacement",
                placementId: placement._id,
                x: placement.x,
                y: placement.y,
                rotationDeg: Number(event.currentTarget.value),
              },
            ])
          }
        />
        <Input
          aria-label="Placement z order"
          type="number"
          defaultValue={placement.zOrder}
          disabled={placement.locked}
          onBlur={(event) =>
            onApplyOps([
              {
                type: "updatePlacement",
                placementId: placement._id,
                patch: { zOrder: Number(event.currentTarget.value) },
              },
            ])
          }
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onCopy}>
          <Clipboard className="size-4" aria-hidden="true" />
          Copy ID
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onApplyOps([
              {
                type: "updatePlacement",
                placementId: placement._id,
                patch: { locked: !placement.locked },
              },
            ])
          }
        >
          {placement.locked ? (
            <Unlock className="size-4" aria-hidden="true" />
          ) : (
            <Lock className="size-4" aria-hidden="true" />
          )}
          {placement.locked ? "Unlock" : "Lock"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={placement.locked}
          onClick={() =>
            onApplyOps([
              {
                type: "movePlacement",
                placementId: placement._id,
                x: placement.x,
                y: placement.y,
                rotationDeg: normalizeDegrees(placement.rotationDeg + 90),
              },
            ])
          }
        >
          <RotateCw className="size-4" aria-hidden="true" />
          Rotate
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={placement.locked}
          onClick={onDeleteSelected}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Delete
        </Button>
      </div>
      <div className="rounded-md border border-border p-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold">Containment</h4>
          {children.length ? (
            <Badge variant="outline">{children.length} direct</Badge>
          ) : null}
        </div>
        <div className="mt-2 grid gap-2">
          {parent ? (
            <div className="flex flex-wrap gap-2">
              {(["inside", "onTop"] as const).map((mode) => (
                <Button
                  key={mode}
                  size="xs"
                  variant={
                    placement.containmentMode === mode ? "secondary" : "outline"
                  }
                  disabled={placement.locked}
                  onClick={() =>
                    onApplyOps([
                      {
                        type: "setContainment",
                        placementId: placement._id,
                        parentPlacementId: parent._id,
                        containmentMode: mode,
                      },
                    ])
                  }
                >
                  {mode === "inside" ? "Inside" : "On top"}
                </Button>
              ))}
              <Button
                size="xs"
                variant="outline"
                disabled={placement.locked}
                onClick={() =>
                  onApplyOps([
                    {
                      type: "setContainment",
                      placementId: placement._id,
                    },
                    {
                      type: "movePlacement",
                      placementId: placement._id,
                      x: parent.x + 36,
                      y: parent.y + 36,
                      rotationDeg: placement.rotationDeg,
                    },
                  ])
                }
              >
                Pop out
              </Button>
            </div>
          ) : null}
          <select
            className="h-8 rounded-md border border-input bg-background text-xs"
            aria-label="Move placement into another placement"
            value=""
            disabled={placement.locked || !candidateParents.length}
            onChange={(event) => {
              const parentPlacementId = event.currentTarget.value;
              if (!parentPlacementId) {
                return;
              }
              void onApplyOps([
                {
                  type: "setContainment",
                  placementId: placement._id,
                  parentPlacementId,
                  containmentMode: "inside",
                },
              ]);
            }}
          >
            <option value="">Move into...</option>
            {candidateParents.map((candidate) => (
              <option key={candidate._id} value={candidate._id}>
                {candidate.shortId} {placementDisplayLabel(candidate)}
              </option>
            ))}
          </select>
          {children.length ? (
            <div className="grid gap-2">
              {(["inside", "onTop"] as const).map((mode) => {
                const grouped = children.filter(
                  (child) => child.containmentMode === mode,
                );
                if (!grouped.length) {
                  return null;
                }
                return (
                  <div key={mode} className="grid gap-1">
                    <div className="text-[11px] font-medium text-muted-foreground">
                      {mode === "inside" ? "Inside" : "On top"} ({grouped.length})
                    </div>
                    {grouped.map((child, index) => {
                      const childCandidateParents = placements.filter(
                        (candidate) =>
                          candidate._id !== child._id &&
                          !isPlacementDescendant(
                            candidate._id,
                            child._id,
                            placements,
                          ),
                      );

                      return (
                        <div
                          key={child._id}
                          className="rounded-md border border-border p-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              className="truncate text-left text-xs font-medium"
                              onClick={() => onPlacementSelect(child._id, false)}
                            >
                              {placementDisplayLabel(child)}
                            </button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() =>
                                onApplyOps([
                                  {
                                    type: "deletePlacement",
                                    placementId: child._id,
                                  },
                                ])
                              }
                            >
                              Unplace
                            </Button>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() =>
                                onApplyOps([
                                  {
                                    type: "setContainment",
                                    placementId: child._id,
                                  },
                                  {
                                    type: "movePlacement",
                                    placementId: child._id,
                                    x: placement.x + 36 + index * 12,
                                    y: placement.y + 36 + index * 12,
                                    rotationDeg: child.rotationDeg,
                                  },
                                ])
                              }
                            >
                              Pop out
                            </Button>
                            {(["inside", "onTop"] as const).map((nextMode) => (
                              <Button
                                key={nextMode}
                                size="xs"
                                variant={
                                  child.containmentMode === nextMode
                                    ? "secondary"
                                    : "outline"
                                }
                                onClick={() =>
                                  onApplyOps([
                                    {
                                      type: "setContainment",
                                      placementId: child._id,
                                      parentPlacementId: placement._id,
                                      containmentMode: nextMode,
                                    },
                                  ])
                                }
                              >
                                {nextMode === "inside" ? "Inside" : "On top"}
                              </Button>
                            ))}
                          </div>
                          <select
                            className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                            aria-label={`Move ${child.shortId} into another placement`}
                            value=""
                            disabled={!childCandidateParents.length}
                            onChange={(event) => {
                              const parentPlacementId = event.currentTarget.value;
                              if (!parentPlacementId) {
                                return;
                              }
                              void onApplyOps([
                                {
                                  type: "setContainment",
                                  placementId: child._id,
                                  parentPlacementId,
                                  containmentMode: child.containmentMode ?? "inside",
                                },
                              ]);
                            }}
                          >
                            <option value="">Move to...</option>
                            {childCandidateParents.map((candidate) => (
                              <option key={candidate._id} value={candidate._id}>
                                {candidate.shortId} {placementDisplayLabel(candidate)}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              No placements are inside or on top of this one yet.
            </p>
          )}
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-medium">
          <Palette className="size-3.5" aria-hidden="true" />
          Color
        </div>
        <div className="flex flex-wrap gap-2">
          {["var(--chart-1)", "var(--chart-2)", "var(--chart-4)"].map(
            (color) => (
              <button
                key={color}
                type="button"
                className="size-7 rounded-md border border-border"
                style={{ background: color }}
                disabled={placement.locked}
                aria-label={`Set color ${color}`}
                onClick={() =>
                  onApplyOps([
                    {
                      type: "updatePlacement",
                      placementId: placement._id,
                      patch: { color },
                    },
                  ])
                }
              />
            ),
          )}
          <Button
            size="xs"
            variant="outline"
            disabled={placement.locked}
            onClick={() =>
              onApplyOps([
                {
                  type: "updatePlacement",
                  placementId: placement._id,
                  patch: { color: "" },
                },
              ])
            }
          >
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}

function DoorFitInspector({
  doorShortId,
  issues,
}: {
  doorShortId: string;
  issues: FitIssue[];
}) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold">Door fit</h4>
        <Badge variant={issues.length ? "destructive" : "outline"}>
          {issues.length}
        </Badge>
      </div>
      {issues.length ? (
        <div className="mt-2 grid gap-1">
          {issues.map((issue) => (
            <button
              key={`${doorShortId}-${issue.placementShortId}`}
              type="button"
              className="rounded-md bg-destructive/10 px-2 py-1 text-left text-xs leading-5 text-destructive"
              onClick={() => void navigator.clipboard?.writeText(issue.message)}
            >
              {issue.message}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          No placed items are flagged against this opening.
        </p>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function UnderlayPanel({
  householdId,
  moveId,
  level,
  underlayPhoto,
  calibration,
  moving,
  onCalibrationChange,
  onMovingChange,
  onApplyOps,
}: {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  level: PlanLevel | undefined;
  underlayPhoto: UnderlayPhoto | undefined;
  calibration: UnderlayCalibration | null;
  moving: boolean;
  onCalibrationChange: (calibration: UnderlayCalibration | null) => void;
  onMovingChange: (moving: boolean) => void;
  onApplyOps: (ops: PlanOp[]) => Promise<ApplyPlanOpsResult>;
}) {
  const underlay = level?.underlay;
  const calibrating = Boolean(
    level && calibration?.levelId === level._id && underlay,
  );

  function updateUnderlay(
    patch: Partial<NonNullable<PlanLevel["underlay"]>>,
  ) {
    if (!level || !underlay) {
      return;
    }
    void onApplyOps([
      {
        type: "setLevelUnderlay",
        levelId: level._id,
        underlay: {
          ...underlay,
          ...patch,
        },
      },
    ]);
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Blueprint underlay</h3>
        {underlay ? <Badge variant="outline">journaled</Badge> : null}
      </div>
      {level ? (
        <div className="mt-3 grid gap-3">
          <PhotoUploadControl
            householdId={householdId}
            moveId={moveId}
            label="Upload blueprint"
            photoType="blueprint"
            privacyLevel="private"
            visibilityScope="moveCollaborators"
            onUploaded={({ photoId, width, height }) => {
              onMovingChange(false);
              void onApplyOps([
                {
                  type: "setLevelUnderlay",
                  levelId: level._id,
                  underlay: {
                    photoId,
                    opacity: 0.3,
                    originX: 0,
                    originY: 0,
                    scaleInPerPx: 120 / Math.max(width, height, 1),
                    rotationDeg: 0,
                  },
                },
              ]).then(() =>
                onCalibrationChange({ levelId: level._id, points: [] }),
              );
            }}
          />
          {underlay ? (
            <div className="grid gap-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  {underlayPhoto?.caption ?? "Active blueprint"}
                </span>
                <div className="flex gap-1">
                  <Button
                    size="xs"
                    variant={calibrating ? "secondary" : "outline"}
                    onClick={() => {
                      onMovingChange(false);
                      onCalibrationChange(
                        calibrating ? null : { levelId: level._id, points: [] },
                      );
                    }}
                  >
                    {calibrating ? "Calibrating" : "Calibrate"}
                  </Button>
                  <Button
                    size="xs"
                    variant={moving ? "secondary" : "outline"}
                    onClick={() => {
                      onCalibrationChange(null);
                      onMovingChange(!moving);
                    }}
                  >
                    {moving ? "Moving" : "Move"}
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      onCalibrationChange(null);
                      onMovingChange(false);
                      void onApplyOps([
                        {
                          type: "setLevelUnderlay",
                          levelId: level._id,
                        },
                      ]);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
              {calibrating ? (
                <div className="rounded-md bg-secondary px-2 py-1 text-secondary-foreground">
                  {calibration?.points.length === 1
                    ? "Pick the second point."
                    : "Pick two known-distance points."}
                </div>
              ) : null}
              {moving ? (
                <div className="rounded-md bg-secondary px-2 py-1 text-secondary-foreground">
                  Drag on the canvas, then release to save one underlay move.
                </div>
              ) : null}
              <label className="grid gap-1">
                <span className="text-muted-foreground">Opacity</span>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  defaultValue={underlay.opacity}
                  onPointerUp={(event) =>
                    updateUnderlay({ opacity: Number(event.currentTarget.value) })
                  }
                  onKeyUp={(event) =>
                    updateUnderlay({ opacity: Number(event.currentTarget.value) })
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  aria-label="Underlay X origin"
                  defaultValue={underlay.originX}
                  onBlur={(event) =>
                    updateUnderlay({ originX: Number(event.currentTarget.value) })
                  }
                />
                <Input
                  type="number"
                  aria-label="Underlay Y origin"
                  defaultValue={underlay.originY}
                  onBlur={(event) =>
                    updateUnderlay({ originY: Number(event.currentTarget.value) })
                  }
                />
                <Input
                  type="number"
                  step="0.001"
                  aria-label="Underlay inches per pixel"
                  defaultValue={underlay.scaleInPerPx}
                  onBlur={(event) =>
                    updateUnderlay({
                      scaleInPerPx: Number(event.currentTarget.value),
                    })
                  }
                />
                <div className="grid grid-cols-[1fr_auto_auto] gap-1">
                  <Input
                    type="number"
                    aria-label="Underlay rotation"
                    defaultValue={underlay.rotationDeg}
                    onBlur={(event) =>
                      updateUnderlay({
                        rotationDeg: Number(event.currentTarget.value),
                      })
                    }
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    aria-label="Rotate underlay left 90 degrees"
                    title="Rotate underlay left 90 degrees"
                    onClick={() =>
                      updateUnderlay({
                        rotationDeg: normalizeDegrees(underlay.rotationDeg - 90),
                      })
                    }
                  >
                    <RotateCcw className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    aria-label="Rotate underlay right 90 degrees"
                    title="Rotate underlay right 90 degrees"
                    onClick={() =>
                      updateUnderlay({
                        rotationDeg: normalizeDegrees(underlay.rotationDeg + 90),
                      })
                    }
                  >
                    <RotateCw className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              Upload a blueprint, sketch, or listing floor plan for this level.
              It will render under the drawing layer for tracing.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <ImageOff className="size-4" aria-hidden="true" />
          No active level.
        </div>
      )}
    </div>
  );
}

function TemplatePlacementPanel({
  level,
  placements,
  items,
  boxes,
  plannedItems,
  placingSource,
  onBeginPlacement,
  onCancelPlacement,
}: {
  level: PlanLevel | undefined;
  placements: PlanPlacement[];
  items: MoveItem[];
  boxes: MoveBoxRow[];
  plannedItems: PlannedItem[];
  placingSource: PlacementTraySource | null;
  onBeginPlacement: (source: PlacementTraySource) => void;
  onCancelPlacement: () => void;
}) {
  const [activeTab, setActiveTab] =
    useState<"templates" | "items" | "planned" | "boxes">("templates");
  const [query, setQuery] = useState("");
  const [placedFilter, setPlacedFilter] = useState<"all" | "unplaced" | "placed">(
    "all",
  );
  const [roomFilter, setRoomFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const placedItemIds = useMemo(
    () =>
      new Set(
        placements
          .map((placement) => placement.itemId)
          .filter((id): id is Id<"items"> => Boolean(id)),
      ),
    [placements],
  );
  const placedBoxIds = useMemo(
    () =>
      new Set(
        placements
          .map((placement) => placement.boxId)
          .filter((id): id is Id<"boxes"> => Boolean(id)),
      ),
    [placements],
  );
  const placedPlannedItemIds = useMemo(
    () =>
      new Set(
        placements
          .map((placement) => placement.plannedItemId)
          .filter((id): id is Id<"plannedItems"> => Boolean(id)),
      ),
    [placements],
  );
  const sources = useMemo(() => {
    if (activeTab === "items") {
      return items.map(itemTraySource);
    }
    if (activeTab === "planned") {
      return plannedItems.map(plannedItemTraySource);
    }
    if (activeTab === "boxes") {
      return boxes.map(boxTraySource);
    }
    return planTemplates.map(templateTraySource);
  }, [activeTab, boxes, items, plannedItems]);
  const sourcePlaced = useCallback(
    (source: PlacementTraySource) => {
      if (source.kind === "template") {
        return false;
      }
      if (source.kind === "item") {
        return placedItemIds.has(source.itemId);
      }
      if (source.kind === "planned") {
        return placedPlannedItemIds.has(source.plannedItemId);
      }
      return placedBoxIds.has(source.boxId);
    },
    [placedBoxIds, placedItemIds, placedPlannedItemIds],
  );
  const visibleSources = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sources.filter((source) => {
      if (
        normalized &&
        !`${source.label} ${source.meta}`.toLowerCase().includes(normalized)
      ) {
        return false;
      }
      if (roomFilter !== "all" && source.room !== roomFilter) {
        return false;
      }
      if (categoryFilter !== "all" && source.category !== categoryFilter) {
        return false;
      }
      if (placedFilter === "placed" && !sourcePlaced(source)) {
        return false;
      }
      if (placedFilter === "unplaced" && sourcePlaced(source)) {
        return false;
      }
      return true;
    });
  }, [categoryFilter, placedFilter, query, roomFilter, sourcePlaced, sources]);
  const roomOptions = useMemo(
    () =>
      Array.from(
        new Set(sources.map((source) => source.room).filter(Boolean)),
      ).sort(),
    [sources],
  );
  const categoryOptions = useMemo(
    () =>
      Array.from(new Set(sources.map((source) => source.category))).sort(),
    [sources],
  );

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Place</h3>
        <Badge variant="outline">{visibleSources.length}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1">
        {(["templates", "items", "planned", "boxes"] as const).map((tab) => (
          <Button
            key={tab}
            size="xs"
            variant={activeTab === tab ? "secondary" : "outline"}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </Button>
        ))}
      </div>
      <Input
        className="mt-2 h-8"
        aria-label="Filter placement tray"
        placeholder="Filter"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          aria-label="Filter placement tray by placed state"
          value={placedFilter}
          onChange={(event) =>
            setPlacedFilter(event.currentTarget.value as typeof placedFilter)
          }
        >
          <option value="all">All states</option>
          <option value="unplaced">Unplaced</option>
          <option value="placed">Placed</option>
        </select>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          aria-label="Filter placement tray by category"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.currentTarget.value)}
        >
          <option value="all">All categories</option>
          {categoryOptions.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <select
          className="col-span-2 h-8 rounded-md border border-input bg-background px-2 text-xs"
          aria-label="Filter placement tray by room"
          value={roomFilter}
          onChange={(event) => setRoomFilter(event.currentTarget.value)}
        >
          <option value="all">All rooms</option>
          {roomOptions.map((room) => (
            <option key={room} value={room}>
              {room}
            </option>
          ))}
        </select>
      </div>
      {placingSource ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">
          <span className="truncate">Drop {placingSource.label}</span>
          <Button size="xs" variant="ghost" onClick={onCancelPlacement}>
            Cancel
          </Button>
        </div>
      ) : null}
      <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1">
        {visibleSources.map((source) => {
          const placed = sourcePlaced(source);
          const beginPlacement = () => {
            if (!level) {
              return;
            }
            onBeginPlacement(source);
          };

          return (
            <Button
              key={source.key}
              size="sm"
              variant={
                placingSource?.key === source.key || placed
                  ? "secondary"
                  : "outline"
              }
              className="h-auto justify-start px-2 py-2 text-left"
              disabled={!level}
              onPointerDown={beginPlacement}
              onMouseDown={(event) => {
                if (event.button !== 0) {
                  return;
                }
                beginPlacement();
              }}
              onClick={beginPlacement}
            >
              <span className="grid w-full gap-1">
                <span className="flex min-w-0 items-center gap-2">
                  {placed ? (
                    <Check className="size-3.5 shrink-0" aria-hidden="true" />
                  ) : null}
                  <span className="truncate text-xs font-medium">
                    {source.label}
                  </span>
                  {!source.hasSize ? (
                    <Badge className="ml-auto shrink-0" variant="outline">
                      no size
                    </Badge>
                  ) : null}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {source.meta}
                </span>
              </span>
            </Button>
          );
        })}
        {!visibleSources.length ? (
          <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            No {activeTab} match the filter.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PlanCanvas({
  plan,
  level,
  entities,
  placements,
  items,
  underlayPhoto,
  unitSystem,
  activeTool,
  snapEnabled,
  openingKind,
  featureKind,
  zoneKind,
  selectedIds,
  selectedPlacementIds,
  hoverId,
  hoverPlacementId,
  placingSource,
  fitReport,
  wallNames,
  proposalPreview,
  underlayCalibration,
  underlayMoveActive,
  onUnderlayCalibrationChange,
  onUnderlayMoveActiveChange,
  onApplyOps,
  onSelect,
  onPlacementSelect,
  onHover,
  onPlacementHover,
  onClearSelection,
  onToolChange,
  onPlacementSourcePlaced,
}: {
  plan: ActivePlanDocument["plan"];
  level: PlanLevel | undefined;
  entities: PlanEntity[];
  placements: PlanPlacement[];
  items: MoveItem[];
  underlayPhoto: UnderlayPhoto | undefined;
  unitSystem: "imperial" | "metric";
  activeTool: DrawingTool;
  snapEnabled: boolean;
  openingKind: OpeningKind;
  featureKind: FeatureKind;
  zoneKind: ZoneKind;
  selectedIds: string[];
  selectedPlacementIds: string[];
  hoverId: string | null;
  hoverPlacementId: string | null;
  placingSource: PlacementTraySource | null;
  fitReport: FitReport;
  wallNames: Map<string, WallDisplayName>;
  proposalPreview: ProposalPreview | null;
  underlayCalibration: UnderlayCalibration | null;
  underlayMoveActive: boolean;
  onUnderlayCalibrationChange: (calibration: UnderlayCalibration | null) => void;
  onUnderlayMoveActiveChange: (active: boolean) => void;
  onApplyOps: (ops: PlanOp[]) => Promise<ApplyPlanOpsResult>;
  onSelect: (entityId: string, additive: boolean) => void;
  onPlacementSelect: (placementId: string, additive: boolean) => void;
  onHover: (entityId: string | null) => void;
  onPlacementHover: (placementId: string | null) => void;
  onClearSelection: () => void;
  onToolChange: (tool: DrawingTool) => void;
  onPlacementSourcePlaced: () => void;
}) {
  const bounds = useMemo(() => entityBounds(entities), [entities]);
  const [viewBox, setViewBox] = useState<ViewBox>(bounds);
  const [wallStart, setWallStart] = useState<Point | null>(null);
  const [cursorPoint, setCursorPoint] = useState<Point | null>(null);
  const [rectStart, setRectStart] = useState<Point | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<Point[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [placementEditDraft, setPlacementEditDraft] =
    useState<PlacementEditDraft | null>(null);
  const [containmentOffer, setContainmentOffer] =
    useState<ContainmentOffer | null>(null);
  const [fitWarningsOpen, setFitWarningsOpen] = useState(false);
  const [underlayMoveDraft, setUnderlayMoveDraft] =
    useState<UnderlayMoveDraft | null>(null);
  const getDisplayUrl = useAction(api.photos.getDisplayUrl);
  const [underlayUrl, setUnderlayUrl] = useState<{
    photoId: string;
    url: string;
  } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    viewBox: ViewBox;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const svgPointerDownIds = useRef<Set<number>>(new Set());

  function resetView() {
    setViewBox(bounds);
  }

  function zoom(multiplier: number, center?: Point) {
    const target = center ?? {
      x: viewBox.x + viewBox.width / 2,
      y: viewBox.y + viewBox.height / 2,
    };
    const nextWidth = viewBox.width * multiplier;
    const nextHeight = viewBox.height * multiplier;
    const ratioX = (target.x - viewBox.x) / viewBox.width;
    const ratioY = (target.y - viewBox.y) / viewBox.height;
    setViewBox({
      x: target.x - nextWidth * ratioX,
      y: target.y - nextHeight * ratioY,
      width: nextWidth,
      height: nextHeight,
    });
  }

  const clientPointToSvgPoint = useCallback(
    (clientX: number, clientY: number) => {
      const element = svgRef.current;
      if (!element) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      if (
        !rect.width ||
        !rect.height ||
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return null;
      }
      return {
        x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.width,
        y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.height,
      };
    },
    [viewBox],
  );

  function svgPoint(event: React.PointerEvent<SVGSVGElement> | React.WheelEvent<SVGSVGElement>) {
    const point = clientPointToSvgPoint(event.clientX, event.clientY);
    if (point) {
      return point;
    }
    return {
      x: viewBox.x + viewBox.width / 2,
      y: viewBox.y + viewBox.height / 2,
    };
  }

  const walls = entities.filter((entity) => entity.entityType === "wall" && entity.wall);
  const draftingTool = activeTool !== "select";
  const underlayPhotoId =
    level?.underlay && underlayPhoto ? level.underlay.photoId : null;
  const activeUnderlayCalibration =
    level && underlayCalibration?.levelId === level._id && level.underlay
      ? underlayCalibration
      : null;
  const activeUnderlayMove = Boolean(level?.underlay && underlayMoveActive);
  const underlayPreviewLevel =
    level?.underlay && underlayMoveDraft
      ? {
          ...level,
          underlay: {
            ...level.underlay,
            originX:
              underlayMoveDraft.originX +
              (underlayMoveDraft.current.x - underlayMoveDraft.start.x),
            originY:
              underlayMoveDraft.originY +
              (underlayMoveDraft.current.y - underlayMoveDraft.start.y),
          },
        }
      : level;
  const placementChildrenByParent = useMemo(
    () => groupPlacementChildren(placements),
    [placements],
  );
  const itemsById = useMemo(
    () => new globalThis.Map<string, MoveItem>(items.map((item) => [item._id, item])),
    [items],
  );

  useEffect(() => {
    if (!underlayPhotoId) {
      return;
    }

    let cancelled = false;
    void getDisplayUrl({
      householdId: plan.householdId,
      moveId: plan.moveId,
      photoId: underlayPhotoId,
      variant: "detail",
    })
      .then((display) => {
        if (!cancelled) {
          setUnderlayUrl({ photoId: underlayPhotoId, url: display.url });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUnderlayUrl((current) =>
            current?.photoId === underlayPhotoId ? null : current,
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getDisplayUrl, plan.householdId, plan.moveId, underlayPhotoId]);

  const snapPoint = useCallback(
    (point: Point, shiftKey = false, origin?: Point | null) => {
      let next = snapEnabled ? snapToGrid(point, plan.gridSnapIn) : point;
      const endpoints = walls.flatMap((entity) =>
        entity.wall
          ? [
              { x: entity.wall.x1, y: entity.wall.y1 },
              { x: entity.wall.x2, y: entity.wall.y2 },
            ]
          : [],
      );
      const endpoint = endpoints.find(
        (candidate) => Math.hypot(candidate.x - next.x, candidate.y - next.y) <= 10,
      );
      if (endpoint) {
        next = endpoint;
      }
      if (shiftKey && origin) {
        const dx = next.x - origin.x;
        const dy = next.y - origin.y;
        next =
          Math.abs(dx) >= Math.abs(dy)
            ? { x: next.x, y: origin.y }
            : { x: origin.x, y: next.y };
      }
      return next;
    },
    [plan.gridSnapIn, snapEnabled, walls],
  );

  const commitOps = useCallback(
    async (ops: PlanOp[]) => {
      if (!ops.length) {
        return null;
      }
      return await onApplyOps(ops);
    },
    [onApplyOps],
  );
  const commitPlacementSource = useCallback(
    (
      source: PlacementTraySource,
      point: Point,
      containment?: {
        parentPlacementId: string;
        containmentMode: "inside" | "onTop";
      },
    ) => {
      if (!level) {
        return false;
      }
      const footprintOverride =
        source.kind === "template"
          ? undefined
          : footprintOverrideFromDimensions(source.dimensions);
      void commitOps([
        {
          type: "createPlacement",
          placement: {
            levelId: level._id,
            ...placementSourceFields(source),
            x: point.x,
            y: point.y,
            rotationDeg: 0,
            ...(footprintOverride
              ? { footprintOverrideIn: footprintOverride }
              : {}),
            ...(containment ?? {}),
            zOrder: Date.now(),
          },
        },
      ]).then((result) => {
        const placementId = result?.created.placementIds[0];
        if (placementId) {
          onPlacementSelect(placementId, false);
        }
      });
      setHint(`${source.label} placed.`);
      return true;
    },
    [commitOps, level, onPlacementSelect],
  );
  const placeSourceAt = useCallback(
    (point: Point) => {
      if (!placingSource || !level) {
        return false;
      }
      const parent = parentPlacementAtPoint(point, placements);
      if (parent) {
        setContainmentOffer({ kind: "create", source: placingSource, point, parent });
        onPlacementSourcePlaced();
        setHint(`Place ${placingSource.label} relative to ${parent.shortId}.`);
        return true;
      }
      commitPlacementSource(placingSource, point);
      onPlacementSourcePlaced();
      return true;
    },
    [
      commitPlacementSource,
      level,
      onPlacementSourcePlaced,
      placingSource,
      placements,
    ],
  );

  useEffect(() => {
    if (!placingSource || !level) {
      return;
    }

    function handleWindowPointerUp(event: PointerEvent) {
      const startedOnCanvas = svgPointerDownIds.current.has(event.pointerId);
      svgPointerDownIds.current.delete(event.pointerId);
      if (startedOnCanvas) {
        return;
      }

      const rawPoint = clientPointToSvgPoint(event.clientX, event.clientY);
      if (!rawPoint) {
        return;
      }

      if (placeSourceAt(snapPoint(rawPoint))) {
        event.preventDefault();
      }
    }

    window.addEventListener("pointerup", handleWindowPointerUp);
    return () => window.removeEventListener("pointerup", handleWindowPointerUp);
  }, [clientPointToSvgPoint, level, placeSourceAt, placingSource, snapPoint]);

  const startEditDraft = useCallback((draft: EditDraft) => {
    setEditDraft(draft);
    setHint("Drag handle, release to commit one undoable change.");
  }, []);
  const startPlacementEditDraft = useCallback((draft: PlacementEditDraft) => {
    setPlacementEditDraft(draft);
    setHint("Drag placement handle, release to commit one undoable change.");
  }, []);

  const editSnapOrigin = editDraft ? editDraftOrthogonalOrigin(editDraft) : null;
  const fitIssuesByPlacement = useMemo(() => {
    const groups = new globalThis.Map<string, FitIssue[]>();
    for (const issue of fitReport.issues) {
      const current = groups.get(issue.placementShortId) ?? [];
      current.push(issue);
      groups.set(issue.placementShortId, current);
    }
    return groups;
  }, [fitReport.issues]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableEventTarget(event.target)) {
        return;
      }
      if (event.key === "Escape") {
        setWallStart(null);
        setRectStart(null);
        setPolygonPoints([]);
        setCursorPoint(null);
        setEditDraft(null);
        setPlacementEditDraft(null);
        setUnderlayMoveDraft(null);
        setContainmentOffer(null);
        setHint(null);
        onPlacementSourcePlaced();
        onUnderlayMoveActiveChange(false);
        onToolChange("select");
      }
      if (
        event.key.toLowerCase() === "r" &&
        activeTool === "select" &&
        selectedPlacementIds.length
      ) {
        event.preventDefault();
        const selectedPlacements = placements.filter((placement) =>
          selectedPlacementIds.includes(placement._id),
        );
        const unlockedPlacements = selectedPlacements.filter(
          (placement) => !placement.locked,
        );
        if (!unlockedPlacements.length) {
          setHint("Locked placements cannot be rotated.");
          return;
        }
        void commitOps(
          unlockedPlacements.map((placement) => ({
            type: "movePlacement" as const,
            placementId: placement._id,
            x: placement.x,
            y: placement.y,
            rotationDeg: normalizeDegrees(placement.rotationDeg + 90),
          })),
        );
        setHint(
          unlockedPlacements.length === 1
            ? "Placement rotated."
            : `${unlockedPlacements.length} placements rotated.`,
        );
        return;
      }
      if (event.key.toLowerCase() === "v") onToolChange("select");
      if (event.key.toLowerCase() === "w") onToolChange("wall");
      if (event.key.toLowerCase() === "r") onToolChange("roomRect");
      if (event.key.toLowerCase() === "d") onToolChange("opening");
      if (event.key.toLowerCase() === "t") onToolChange("annotation");
      if (event.key === "Enter" && level && polygonPoints.length >= 3) {
        if (polygonSelfIntersects(polygonPoints)) {
          setHint("Can't close shape: polygon intersects itself.");
          return;
        }
        void commitOps([polygonCreateOp(activeTool, level, polygonPoints, zoneKind)]);
        setPolygonPoints([]);
        setCursorPoint(null);
        setHint("Shape added.");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeTool,
    commitOps,
    level,
    onPlacementSourcePlaced,
    onUnderlayMoveActiveChange,
    onToolChange,
    polygonPoints,
    placements,
    selectedPlacementIds,
    zoneKind,
  ]);

  if (!level) {
    return (
      <div className="grid min-h-[560px] place-items-center text-sm text-muted-foreground">
        No level found.
      </div>
    );
  }

  const rooms = entities.filter((entity) => entity.entityType === "room" && entity.room);
  const zones = entities.filter((entity) => entity.entityType === "zone" && entity.zone);
  const openings = entities.filter(
    (entity) => entity.entityType === "opening" && entity.opening,
  );
  const features = entities.filter(
    (entity) => entity.entityType === "feature" && entity.feature,
  );
  const annotations = entities.filter(
    (entity) => entity.entityType === "annotation" && entity.annotation,
  );
  const resolvedUnderlayUrl =
    underlayUrl && underlayUrl.photoId === level.underlay?.photoId
      ? underlayUrl.url
      : null;
  const visiblePlacements = placements.filter(
    (placement) => !placement.parentPlacementId,
  );

  return (
    <div className="relative min-h-[560px] bg-background">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-sm">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom in"
          onClick={() => zoom(0.82)}
        >
          <ZoomIn className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom out"
          onClick={() => zoom(1.22)}
        >
          <ZoomOut className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Reset view"
          onClick={resetView}
        >
          <Maximize2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <FitWarningsPanel
        report={fitReport}
        open={fitWarningsOpen}
        onOpenChange={setFitWarningsOpen}
      />
      <div className="absolute bottom-3 left-3 z-10 rounded-md border border-border bg-card/95 px-2 py-1 text-xs text-muted-foreground shadow-sm">
        <Ruler className="mr-1 inline size-3" aria-hidden="true" />
        {hint ?? toolHint(activeTool, level?.levelType)}
      </div>
      <svg
        ref={svgRef}
        role="img"
        aria-label={`${level.name} plan`}
        className="block h-[560px] w-full touch-none"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        onWheel={(event) => {
          event.preventDefault();
          zoom(event.deltaY > 0 ? 1.12 : 0.88, svgPoint(event));
        }}
        onPointerDown={(event) => {
          svgPointerDownIds.current.add(event.pointerId);
          const rawPoint = svgPoint(event);
          const point = activeUnderlayCalibration
            ? rawPoint
            : snapPoint(
                rawPoint,
                event.shiftKey,
                editSnapOrigin ?? wallStart ?? rectStart,
              );
          setCursorPoint(point);

          if (editDraft) {
            return;
          }
          if (placementEditDraft) {
            return;
          }

          if (activeUnderlayCalibration && level.underlay) {
            event.stopPropagation();
            const nextPoints = [...activeUnderlayCalibration.points, point].slice(
              -2,
            );
            if (nextPoints.length < 2) {
              onUnderlayCalibrationChange({
                levelId: level._id,
                points: nextPoints,
              });
              setHint("Pick the second calibration point.");
              return;
            }

            const label = measurementLabel(nextPoints[0], nextPoints[1], unitSystem);
            const answer = window.prompt(
              `Known real-world length for ${label}. Enter inches, or use ft/m suffix.`,
              "120",
            );
            const realLengthIn = parsePlanLengthInput(answer);
            if (!realLengthIn) {
              onUnderlayCalibrationChange({
                levelId: level._id,
                points: nextPoints,
              });
              setHint("Calibration length was not valid.");
              return;
            }

            const planDistance = Math.hypot(
              nextPoints[1].x - nextPoints[0].x,
              nextPoints[1].y - nextPoints[0].y,
            );
            if (planDistance < 1) {
              setHint("Calibration points are too close together.");
              return;
            }

            const nextScale = calibratedUnderlayScale({
              currentScaleInPerPx: level.underlay.scaleInPerPx,
              firstPoint: nextPoints[0],
              secondPoint: nextPoints[1],
              realLengthIn,
            });
            if (!nextScale) {
              setHint("Calibration scale was not valid.");
              return;
            }
            void commitOps([
              {
                type: "setLevelUnderlay",
                levelId: level._id,
                underlay: {
                  ...level.underlay,
                  opacity: 0.3,
                  scaleInPerPx: nextScale,
                },
              },
            ]);
            onUnderlayCalibrationChange(null);
            setHint(`Blueprint calibrated to ${formatLengthInches(realLengthIn, unitSystem)}.`);
            return;
          }

          if (activeUnderlayMove && level.underlay) {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            setUnderlayMoveDraft({
              pointerId: event.pointerId,
              start: rawPoint,
              current: rawPoint,
              originX: level.underlay.originX,
              originY: level.underlay.originY,
            });
            setHint("Drag blueprint underlay, release to save.");
            return;
          }

          if (placeSourceAt(point)) {
            return;
          }

          if (activeTool === "wall") {
            if (!wallStart) {
              setWallStart(point);
              setHint("Click to place the wall end point.");
              return;
            }
            if (Math.hypot(point.x - wallStart.x, point.y - wallStart.y) < 1) {
              setHint("Wall is too short.");
              return;
            }
            void commitOps([
              {
                type: "createEntity",
                entity: {
                  levelId: level._id,
                  entityType: "wall",
                  wall: {
                    x1: wallStart.x,
                    y1: wallStart.y,
                    x2: point.x,
                    y2: point.y,
                    thicknessIn: plan.defaultWallThicknessIn,
                    heightIn: level.ceilingHeightIn ?? plan.defaultCeilingHeightIn,
                  },
                },
              },
            ]);
            setWallStart(point);
            setHint("Wall added. Click again to continue the chain.");
            return;
          }

          if (activeTool === "roomRect") {
            setRectStart(point);
            setHint("Drag to size the room.");
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }

          if (activeTool === "roomPolygon" || activeTool === "zone") {
            if (activeTool === "zone" && level.levelType !== "outdoor") {
              setHint("Zones are available on outdoor levels.");
              return;
            }
            if (
              polygonPoints.length >= 3 &&
              pointNearPolygonStart(point, polygonPoints, viewBox)
            ) {
              if (polygonSelfIntersects(polygonPoints)) {
                setHint("Can't close shape: polygon intersects itself.");
                return;
              }
              void commitOps([
                polygonCreateOp(activeTool, level, polygonPoints, zoneKind),
              ]);
              setPolygonPoints([]);
              setCursorPoint(null);
              setHint("Shape added.");
              return;
            }
            setPolygonPoints((current) => [...current, point]);
            setHint("Click more vertices, Enter or double-click to close.");
            return;
          }

          if (activeTool === "opening") {
            const targetWall = nearestWall(point, walls, viewBox);
            if (!targetWall?.wall) {
              setHint("Click closer to a wall to place an opening.");
              return;
            }
            const wallLength = Math.hypot(
              targetWall.wall.x2 - targetWall.wall.x1,
              targetWall.wall.y2 - targetWall.wall.y1,
            );
            const widthIn = Math.min(openingKind === "window" ? 48 : 36, wallLength);
            const opening = clampOpeningToWall({
              opening: {
                wallShortId: targetWall.shortId,
                offsetAlongWallIn: wallOffsetAtPoint(targetWall.wall, point),
                widthIn,
                kind: openingKind,
                swing: openingKind === "door" ? "right" : "none",
                sillHeightIn: openingKind === "window" ? 30 : undefined,
                headHeightIn: openingKind === "window" ? 78 : undefined,
              },
              wall: targetWall.wall,
              point,
              mode: "center",
            });
            if (!opening) {
              setHint("Wall is too short for an opening.");
              return;
            }
            void commitOps([
              {
                type: "createEntity",
                entity: {
                  levelId: level._id,
                  entityType: "opening",
                  opening,
                },
              },
            ]);
            setHint(`${openingKind} added.`);
            return;
          }

          if (activeTool === "feature") {
            const size = defaultFeatureSize(featureKind);
            void commitOps([
              {
                type: "createEntity",
                entity: {
                  levelId: level._id,
                  entityType: "feature",
                  feature: {
                    x: point.x,
                    y: point.y,
                    rotationDeg: 0,
	                    featureKind,
	                    widthIn: size.widthIn,
	                    depthIn: size.depthIn,
	                    heightIn: size.heightIn,
	                  },
                },
              },
            ]);
            setHint(`${featureKind} stamped.`);
            return;
          }

          if (activeTool === "annotation") {
            const text = window.prompt("Annotation text");
            if (!text?.trim()) {
              return;
            }
            void commitOps([
              {
                type: "createEntity",
                entity: {
                  levelId: level._id,
                  entityType: "annotation",
                  annotation: {
                    x: point.x,
                    y: point.y,
                    text: text.trim(),
                    fontSizeIn: 6,
                  },
                },
              },
            ]);
            setHint("Annotation added.");
            return;
          }

          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            viewBox,
          };
        }}
        onPointerMove={(event) => {
          const rawPoint = svgPoint(event);
          const point = activeUnderlayCalibration
            ? rawPoint
            : snapPoint(
                rawPoint,
                event.shiftKey,
                editSnapOrigin ?? wallStart ?? rectStart,
              );
          if (editDraft) {
            setEditDraft({ ...editDraft, current: point } as EditDraft);
            return;
          }
          if (placementEditDraft) {
            setPlacementEditDraft({
              ...placementEditDraft,
              current: point,
            } as PlacementEditDraft);
            return;
          }
          if (underlayMoveDraft) {
            setUnderlayMoveDraft({
              ...underlayMoveDraft,
              current: rawPoint,
            });
            return;
          }
          if (draftingTool || placingSource) {
            setCursorPoint(point);
            if (placingSource) {
              setHint(`Drop ${placingSource.label} on the plan.`);
            } else if (activeTool === "wall" && wallStart) {
              setHint(`Wall ${measurementLabel(wallStart, point, unitSystem)}`);
            } else if (activeTool === "roomRect" && rectStart) {
              const width = Math.abs(point.x - rectStart.x);
              const depth = Math.abs(point.y - rectStart.y);
              setHint(
                `Room ${formatLengthInches(width, unitSystem)} x ${formatLengthInches(
                  depth,
                  unitSystem,
                )}`,
              );
            } else if (
              (activeTool === "roomPolygon" || activeTool === "zone") &&
              polygonPoints.length
            ) {
              const previewPoints = [...polygonPoints, point];
              setHint(
                polygonSelfIntersects(previewPoints)
                  ? "Can't close shape: polygon intersects itself."
                  : `${previewPoints.length} points. Enter or double-click to close.`,
              );
            }
          }
          if (rectStart) {
            return;
          }
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) {
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          setViewBox({
            ...drag.viewBox,
            x:
              drag.viewBox.x -
              ((event.clientX - drag.startX) / rect.width) * drag.viewBox.width,
            y:
              drag.viewBox.y -
              ((event.clientY - drag.startY) / rect.height) * drag.viewBox.height,
          });
        }}
        onPointerUp={(event) => {
          svgPointerDownIds.current.delete(event.pointerId);
          if (placingSource) {
            const rawPoint = svgPoint(event);
            const point = snapPoint(rawPoint);
            if (placeSourceAt(point)) {
              return;
            }
          }
          if (underlayMoveDraft && level.underlay) {
            const dx = underlayMoveDraft.current.x - underlayMoveDraft.start.x;
            const dy = underlayMoveDraft.current.y - underlayMoveDraft.start.y;
            void commitOps([
              {
                type: "setLevelUnderlay",
                levelId: level._id,
                underlay: {
                  ...level.underlay,
                  originX: underlayMoveDraft.originX + dx,
                  originY: underlayMoveDraft.originY + dy,
                },
              },
            ]);
            setUnderlayMoveDraft(null);
            setHint("Blueprint moved.");
            return;
          }
          if (placementEditDraft) {
            const op = placementEditDraftToOp(placementEditDraft);
            const parent =
              placementEditDraft.mode === "placementMove"
                ? parentPlacementAtPoint(
                    placementEditDraft.current,
                    placements.filter(
                      (placement) =>
                        placement._id !== placementEditDraft.placement._id,
                    ),
                  )
                : undefined;
            if (
              parent &&
              !isPlacementDescendant(
                parent._id,
                placementEditDraft.placement._id,
                placements,
              )
            ) {
              setContainmentOffer({
                kind: "move",
                child: placementEditDraft.placement,
                point: placementEditDraft.current,
                parent,
              });
              setPlacementEditDraft(null);
              setHint(
                `Move ${placementEditDraft.placement.shortId} relative to ${parent.shortId}.`,
              );
              return;
            }
            if (op) {
              void commitOps([op]);
              setHint("Placement updated.");
            }
            setPlacementEditDraft(null);
            return;
          }
          if (editDraft) {
            const op = editDraftToOp(editDraft);
            if (op) {
              void commitOps([op]);
              setHint("Geometry updated.");
            }
            setEditDraft(null);
            return;
          }
          if (rectStart && cursorPoint) {
            const points = rectanglePoints(rectStart, cursorPoint);
            if (polygonArea(points) >= 4) {
              void commitOps([
                {
                  type: "createEntity",
                  entity: {
                    levelId: level._id,
                    entityType: "room",
                    room: { points },
                  },
                },
              ]);
              setHint("Room added.");
            } else {
              setHint("Room is too small.");
            }
            setRectStart(null);
            setCursorPoint(null);
          }
          dragRef.current = null;
        }}
        onPointerCancel={(event) => {
          svgPointerDownIds.current.delete(event.pointerId);
          dragRef.current = null;
        }}
        onDoubleClick={() => {
          if (activeTool === "wall" && wallStart) {
            setWallStart(null);
            setCursorPoint(null);
            setHint("Wall chain finished.");
            return;
          }
          if (
            (activeTool === "roomPolygon" || activeTool === "zone") &&
            polygonPoints.length >= 3
          ) {
            if (polygonSelfIntersects(polygonPoints)) {
              setHint("Can't close shape: polygon intersects itself.");
              return;
            }
            void commitOps([
              polygonCreateOp(activeTool, level, polygonPoints, zoneKind),
            ]);
            setPolygonPoints([]);
            setCursorPoint(null);
            setHint("Shape added.");
          }
        }}
      >
        <defs>
          <pattern id="plan-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path
              d="M 24 0 L 0 0 0 24"
              fill="none"
              stroke="var(--border)"
              strokeWidth="0.8"
              opacity="0.45"
            />
          </pattern>
          <pattern
            id="plan-zone-driveway"
            width="18"
            height="18"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="18" height="18" fill="var(--muted)" />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="18"
              stroke="var(--muted-foreground)"
              strokeWidth="2"
              opacity="0.35"
            />
          </pattern>
          <pattern
            id="plan-zone-patio"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <rect width="24" height="24" fill="var(--card)" />
            <path
              d="M 0 0 H 24 V 24 H 0 Z M 12 0 V 24 M 0 12 H 24"
              fill="none"
              stroke="var(--border)"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect
          x={viewBox.x}
          y={viewBox.y}
          width={viewBox.width}
          height={viewBox.height}
          fill="var(--background)"
          onClick={onClearSelection}
        />
        <rect
          x={viewBox.x}
          y={viewBox.y}
          width={viewBox.width}
          height={viewBox.height}
          fill="url(#plan-grid)"
        />
        <PlanUnderlayImage
          level={underlayPreviewLevel ?? level}
          photo={underlayPhoto}
          imageUrl={resolvedUnderlayUrl}
          calibrating={Boolean(activeUnderlayCalibration)}
        />
        {activeUnderlayCalibration ? (
          <UnderlayCalibrationOverlay
            points={activeUnderlayCalibration.points}
            cursorPoint={cursorPoint}
          />
        ) : null}
        {level.levelType === "outdoor" && entities.length === 0 && !underlayPhoto ? (
          <text
            x={viewBox.x + viewBox.width / 2}
            y={viewBox.y + viewBox.height / 2}
            textAnchor="middle"
            className="fill-muted-foreground text-[12px] font-medium"
          >
            Driveways, sheds, and where the trampoline lands.
          </text>
        ) : null}
        {rooms.map((entity) => (
          <RoomShape
            key={entity._id}
            entity={entity}
            unitSystem={unitSystem}
            selected={selectedIds.includes(entity._id)}
            hovered={hoverId === entity._id}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
        {zones.map((entity) => (
          <ZoneShape
            key={entity._id}
            entity={entity}
            selected={selectedIds.includes(entity._id)}
            hovered={hoverId === entity._id}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
        {walls.map((entity) => (
          <WallShape
            key={entity._id}
            entity={entity}
            openings={openings.filter(
              (opening) => opening.opening?.wallShortId === entity.shortId,
            )}
            selected={selectedIds.includes(entity._id)}
            hovered={hoverId === entity._id}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
        {openings.map((entity) => (
          <OpeningShape
            key={entity._id}
            entity={entity}
            wall={walls.find((wall) => wall.shortId === entity.opening?.wallShortId)}
            selected={selectedIds.includes(entity._id)}
            hovered={hoverId === entity._id}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
        {features.map((entity) => (
          <FeatureShape
            key={entity._id}
            entity={entity}
            selected={selectedIds.includes(entity._id)}
            hovered={hoverId === entity._id}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
        {annotations.map((entity) => (
          <AnnotationShape
            key={entity._id}
            entity={entity}
            selected={selectedIds.includes(entity._id)}
            hovered={hoverId === entity._id}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
        {visiblePlacements.map((placement) => (
          <PlacementShape
            key={placement._id}
            placement={placement}
            label={placementCanvasLabel(placement, itemsById)}
            confidence={placementMeasurementConfidence(placement, itemsById)}
            childCount={
              placementChildrenByParent.get(placement._id)?.length ?? 0
            }
            totalChildCount={totalContainedCount(
              placement._id,
              placementChildrenByParent,
            )}
            warningCount={
              fitIssuesByPlacement.get(placement.shortId)?.filter(
                (issue) => issue.severity === "warning",
              ).length ?? 0
            }
            selected={selectedPlacementIds.includes(placement._id)}
            hovered={hoverPlacementId === placement._id}
            onSelect={onPlacementSelect}
            onHover={onPlacementHover}
          />
        ))}
        {proposalPreview ? (
          <ProposalGhostOverlay
            levelId={level._id}
            entities={entities}
            placements={placements}
            preview={proposalPreview}
          />
        ) : null}
        {selectedIds
          .map((id) => entities.find((entity) => entity._id === id))
          .filter((entity): entity is PlanEntity => Boolean(entity))
          .map((entity) => (
            <IdChip key={entity._id} entity={entity} wallNames={wallNames} />
          ))}
        {selectedPlacementIds
          .map((id) =>
            visiblePlacements.find((placement) => placement._id === id),
          )
          .filter((placement): placement is PlanPlacement => Boolean(placement))
          .map((placement) => (
            <PlacementIdChip key={placement._id} placement={placement} />
          ))}
        {activeTool === "select"
          ? selectedIds
              .map((id) => entities.find((entity) => entity._id === id))
              .filter((entity): entity is PlanEntity => Boolean(entity))
              .map((entity) => (
                <SelectedEditHandles
                  key={`handles-${entity._id}`}
                  entity={entity}
                  walls={walls}
                  editDraft={editDraft}
                  onStartEdit={startEditDraft}
                />
              ))
          : null}
        {activeTool === "select"
          ? selectedPlacementIds
              .map((id) =>
                visiblePlacements.find((placement) => placement._id === id),
              )
              .filter(
                (placement): placement is PlanPlacement => Boolean(placement),
              )
              .map((placement) => (
                <SelectedPlacementHandles
                  key={`placement-handles-${placement._id}`}
                  placement={placement}
                  editDraft={placementEditDraft}
                  onStartEdit={startPlacementEditDraft}
                />
              ))
          : null}
        <DraftPreview
          activeTool={activeTool}
          wallStart={wallStart}
          rectStart={rectStart}
          polygonPoints={polygonPoints}
          cursorPoint={cursorPoint}
          editDraft={editDraft}
          placementEditDraft={placementEditDraft}
          placingSource={placingSource}
          unitSystem={unitSystem}
        />
        {containmentOffer ? (
          <ContainmentOfferOverlay
            offer={containmentOffer}
            onChoose={(choice) => {
              if (containmentOffer.kind === "create" && choice === "beside") {
                commitPlacementSource(
                  containmentOffer.source,
                  besidePlacementPoint(containmentOffer.parent),
                );
              } else if (containmentOffer.kind === "create" && choice !== "beside") {
                commitPlacementSource(containmentOffer.source, containmentOffer.point, {
                  parentPlacementId: containmentOffer.parent._id,
                  containmentMode: choice,
                });
              } else if (containmentOffer.kind === "move" && choice === "beside") {
                void commitOps([
                  {
                    type: "setContainment",
                    placementId: containmentOffer.child._id,
                  },
                  {
                    type: "movePlacement",
                    placementId: containmentOffer.child._id,
                    ...besidePlacementPoint(containmentOffer.parent),
                    rotationDeg: containmentOffer.child.rotationDeg,
                  },
                ]);
              } else if (containmentOffer.kind === "move" && choice !== "beside") {
                void commitOps([
                  {
                    type: "setContainment",
                    placementId: containmentOffer.child._id,
                    parentPlacementId: containmentOffer.parent._id,
                    containmentMode: choice,
                  },
                ]);
              }
              setContainmentOffer(null);
            }}
            onCancel={() => setContainmentOffer(null)}
          />
        ) : null}
      </svg>
    </div>
  );
}

function FitWarningsPanel({
  report,
  open,
  onOpenChange,
}: {
  report: FitReport;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const warnings = report.issues.filter((issue) => issue.severity === "warning");
  const unknownSizeIssues = report.issues.filter(
    (issue) => issue.type === "unknownSize",
  );
  const grouped = groupFitIssuesByRoom(report.issues);

  return (
    <div className="absolute right-3 top-3 z-10 w-[min(22rem,calc(100%-1.5rem))] rounded-lg border border-border bg-card/95 shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
        onClick={() => onOpenChange(!open)}
      >
        <span className="text-xs font-semibold">Fit warnings</span>
        <span className="flex items-center gap-2">
          {unknownSizeIssues.length ? (
            <Badge variant="outline">{unknownSizeIssues.length} unknown</Badge>
          ) : null}
          <Badge variant={warnings.length ? "destructive" : "outline"}>
            {warnings.length}
          </Badge>
        </span>
      </button>
      {open ? (
        <div className="max-h-80 overflow-y-auto border-t border-border p-3">
          {report.issues.length ? (
            <div className="grid gap-3">
              {grouped.map(([roomLabel, issues]) => (
                <div key={roomLabel} className="grid gap-1">
                  <div className="text-[11px] font-semibold text-muted-foreground">
                    {roomLabel}
                  </div>
                  {issues.map((issue) => (
                    <button
                      key={`${issue.type}-${issue.placementShortId}-${issue.message}`}
                      type="button"
                      className={
                        issue.severity === "warning"
                          ? "rounded-md bg-destructive/10 px-2 py-1 text-left text-xs leading-5 text-destructive"
                          : "rounded-md bg-secondary px-2 py-1 text-left text-xs leading-5 text-secondary-foreground"
                      }
                      onClick={() =>
                        void navigator.clipboard?.writeText(issue.message)
                      }
                    >
                      {issue.message}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              No fit warnings for placed items on this level.
            </p>
          )}
          <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
            Door fit assumes items can tilt through openings; tall rigid items may
            differ. This is not multi-room pathfinding. Double-check tight fits
            with a tape measure.
          </p>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Checked in {report.durationMs.toFixed(1)}ms
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RoomShape({
  entity,
  unitSystem,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  entity: PlanEntity;
  unitSystem: "imperial" | "metric";
  selected: boolean;
  hovered: boolean;
  onSelect: (entityId: string, additive: boolean) => void;
  onHover: (entityId: string | null) => void;
}) {
  if (!entity.room) {
    return null;
  }

  const centroid = polygonCentroid(entity.room.points);
  const area = polygonArea(entity.room.points);
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Select ${entity.shortId} — ${entity.name ?? "Room"}`}
      className="cursor-pointer"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(entity._id, event.shiftKey);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(entity._id, event.shiftKey);
        }
      }}
      onPointerEnter={() => onHover(entity._id)}
      onPointerLeave={() => onHover(null)}
    >
      <polygon
        points={pointsAttribute(entity.room.points)}
        fill={entity.color ?? "var(--muted)"}
        opacity="0.7"
        stroke={selected ? "var(--primary)" : hovered ? "var(--accent)" : "var(--border)"}
        strokeWidth={selected || hovered ? 3 : 1}
      />
      <text
        x={centroid.x}
        y={centroid.y - 4}
        textAnchor="middle"
        className="fill-foreground text-[8px] font-semibold"
      >
        {entity.name ?? entity.shortId}
      </text>
      <text
        x={centroid.x}
        y={centroid.y + 7}
        textAnchor="middle"
        className="fill-muted-foreground text-[6px]"
      >
        {formatAreaSquareInches(area, unitSystem)}
      </text>
    </g>
  );
}

function PlanUnderlayImage({
  level,
  photo,
  imageUrl,
  calibrating,
}: {
  level: PlanLevel;
  photo: UnderlayPhoto | undefined;
  imageUrl: string | null;
  calibrating: boolean;
}) {
  const underlay = level.underlay;
  if (!underlay || !photo || !imageUrl || !photo.width || !photo.height) {
    return null;
  }

  return (
    <image
      href={imageUrl}
      x="0"
      y="0"
      width={photo.width}
      height={photo.height}
      opacity={calibrating ? 1 : clamp(underlay.opacity, 0.05, 1)}
      pointerEvents="none"
      preserveAspectRatio="xMinYMin meet"
      transform={`translate(${underlay.originX} ${underlay.originY}) rotate(${underlay.rotationDeg}) scale(${underlay.scaleInPerPx})`}
    />
  );
}

function UnderlayCalibrationOverlay({
  points,
  cursorPoint,
}: {
  points: Point[];
  cursorPoint: Point | null;
}) {
  const preview =
    points.length === 1 && cursorPoint ? [points[0], cursorPoint] : points;

  return (
    <g pointerEvents="none">
      {preview.length === 2 ? (
        <line
          x1={preview[0].x}
          y1={preview[0].y}
          x2={preview[1].x}
          y2={preview[1].y}
          stroke="var(--primary)"
          strokeWidth="2"
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {preview.map((point, index) => (
        <g key={`${point.x}-${point.y}-${index}`}>
          <circle
            cx={point.x}
            cy={point.y}
            r="5"
            fill="var(--primary)"
            stroke="var(--background)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={point.x + 7}
            y={point.y - 7}
            className="fill-primary text-[6px] font-semibold"
            paintOrder="stroke"
            stroke="var(--background)"
            strokeWidth="3"
          >
            {index + 1}
          </text>
        </g>
      ))}
    </g>
  );
}

function ZoneShape({
  entity,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  entity: PlanEntity;
  selected: boolean;
  hovered: boolean;
  onSelect: (entityId: string, additive: boolean) => void;
  onHover: (entityId: string | null) => void;
}) {
  if (!entity.zone) {
    return null;
  }

  const centroid = polygonCentroid(entity.zone.points);
  const style = zoneVisualStyle(entity.zone.zoneKind, entity.color);
  return (
    <g
      className="cursor-pointer"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(entity._id, event.shiftKey);
      }}
      onPointerEnter={() => onHover(entity._id)}
      onPointerLeave={() => onHover(null)}
    >
      <polygon
        points={pointsAttribute(entity.zone.points)}
        fill={style.fill}
        opacity={style.opacity}
        stroke={selected ? "var(--primary)" : hovered ? "var(--accent)" : style.stroke}
        strokeDasharray={style.strokeDasharray}
        strokeWidth={selected || hovered ? 4 : 2}
      />
      <text
        x={centroid.x}
        y={centroid.y}
        textAnchor="middle"
        className="fill-foreground text-[8px] font-semibold"
      >
        {entity.name ?? entity.zone.zoneKind}
      </text>
    </g>
  );
}

function WallShape({
  entity,
  openings,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  entity: PlanEntity;
  openings: PlanEntity[];
  selected: boolean;
  hovered: boolean;
  onSelect: (entityId: string, additive: boolean) => void;
  onHover: (entityId: string | null) => void;
}) {
  if (!entity.wall) {
    return null;
  }

  const wall = entity.wall;
  const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  const sortedOpenings = openings
    .filter((opening) => opening.opening)
    .map((opening) => opening.opening!)
    .sort((a, b) => a.offsetAlongWallIn - b.offsetAlongWallIn);
  const segments: [number, number][] = [];
  let cursor = 0;
  for (const opening of sortedOpenings) {
    const start = Math.max(0, opening.offsetAlongWallIn);
    const end = Math.min(length, opening.offsetAlongWallIn + opening.widthIn);
    if (start > cursor) {
      segments.push([cursor, start]);
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < length) {
    segments.push([cursor, length]);
  }

  return (
    <g
      className="cursor-pointer"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(entity._id, event.shiftKey);
      }}
      onPointerEnter={() => onHover(entity._id)}
      onPointerLeave={() => onHover(null)}
    >
      <line
        x1={wall.x1}
        y1={wall.y1}
        x2={wall.x2}
        y2={wall.y2}
        stroke="transparent"
        strokeWidth="12"
        vectorEffect="non-scaling-stroke"
      />
      {selected || hovered ? (
        <line
          x1={wall.x1}
          y1={wall.y1}
          x2={wall.x2}
          y2={wall.y2}
          stroke={selected ? "var(--primary)" : "var(--accent)"}
          strokeWidth={wall.thicknessIn + 5}
          strokeLinecap="butt"
          opacity="0.65"
        />
      ) : null}
      {segments.map(([start, end]) => {
        const p1 = pointAlongWall(wall, start);
        const p2 = pointAlongWall(wall, end);
        return (
          <line
            key={`${start}-${end}`}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={entity.color ?? "var(--foreground)"}
            strokeWidth={wall.thicknessIn}
            strokeLinecap="butt"
          />
        );
      })}
    </g>
  );
}

function OpeningShape({
  entity,
  wall,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  entity: PlanEntity;
  wall: PlanEntity | undefined;
  selected: boolean;
  hovered: boolean;
  onSelect: (entityId: string, additive: boolean) => void;
  onHover: (entityId: string | null) => void;
}) {
  if (!entity.opening || !wall?.wall) {
    return null;
  }

  const opening = entity.opening;
  const wallSegment = wall.wall satisfies WallSegment;
  const start = pointAlongWall(wallSegment, opening.offsetAlongWallIn);
  const end = pointAlongWall(
    wallSegment,
    opening.offsetAlongWallIn + opening.widthIn,
  );
  const arc = doorSwingArc(opening, wallSegment);

  return (
    <g
      className="cursor-pointer"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(entity._id, event.shiftKey);
      }}
      onPointerEnter={() => onHover(entity._id)}
      onPointerLeave={() => onHover(null)}
    >
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={
          selected
            ? "var(--primary)"
            : hovered
              ? "var(--accent)"
              : opening.kind === "window"
                ? "var(--primary)"
                : "var(--accent)"
        }
        strokeWidth={selected || hovered ? 5 : opening.kind === "window" ? 3 : 1.5}
      />
      {arc.length ? (
        <polyline
          points={pointsAttribute(arc)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
        />
      ) : null}
    </g>
  );
}

function FeatureShape({
  entity,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  entity: PlanEntity;
  selected: boolean;
  hovered: boolean;
  onSelect: (entityId: string, additive: boolean) => void;
  onHover: (entityId: string | null) => void;
}) {
  if (!entity.feature) {
    return null;
  }

  const feature = entity.feature;
  const style = featureVisualStyle(feature.featureKind, entity.color);
  if (feature.featureKind === "fence") {
    const posts = fencePostPositions(feature.widthIn);
    return (
      <g
        className="cursor-pointer"
        transform={`translate(${feature.x} ${feature.y}) rotate(${feature.rotationDeg})`}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(entity._id, event.shiftKey);
        }}
        onPointerEnter={() => onHover(entity._id)}
        onPointerLeave={() => onHover(null)}
      >
        <line
          x1={-feature.widthIn / 2}
          y1="0"
          x2={feature.widthIn / 2}
          y2="0"
          stroke={selected ? "var(--primary)" : hovered ? "var(--accent)" : style.stroke}
          strokeWidth={selected || hovered ? 4 : 2}
          strokeDasharray="8 5"
        />
        {posts.map((x) => (
          <line
            key={x}
            x1={x}
            y1="-8"
            x2={x}
            y2="8"
            stroke={selected ? "var(--primary)" : style.stroke}
            strokeWidth="2"
          />
        ))}
        <text
          y="-12"
          textAnchor="middle"
          className="fill-foreground text-[5px] font-medium"
        >
          {feature.label ?? entity.name ?? "Fence"}
        </text>
      </g>
    );
  }

  return (
    <g
      className="cursor-pointer"
      transform={`translate(${feature.x} ${feature.y}) rotate(${feature.rotationDeg})`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(entity._id, event.shiftKey);
      }}
      onPointerEnter={() => onHover(entity._id)}
      onPointerLeave={() => onHover(null)}
    >
      <rect
        x={-feature.widthIn / 2}
        y={-feature.depthIn / 2}
        width={feature.widthIn}
        height={feature.depthIn}
        rx="2"
        fill={style.fill}
        stroke={selected ? "var(--primary)" : hovered ? "var(--accent)" : style.stroke}
        strokeWidth={selected || hovered ? 3 : 1.5}
      />
      <text
        y="2"
        textAnchor="middle"
        className="fill-foreground text-[5px] font-medium"
      >
        {feature.label ?? entity.name ?? featureKindLabel(feature.featureKind)}
      </text>
    </g>
  );
}

function AnnotationShape({
  entity,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  entity: PlanEntity;
  selected: boolean;
  hovered: boolean;
  onSelect: (entityId: string, additive: boolean) => void;
  onHover: (entityId: string | null) => void;
}) {
  if (!entity.annotation) {
    return null;
  }

  return (
    <g
      className="cursor-pointer"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(entity._id, event.shiftKey);
      }}
      onPointerEnter={() => onHover(entity._id)}
      onPointerLeave={() => onHover(null)}
    >
      {selected || hovered ? (
        <circle
          cx={entity.annotation.x}
          cy={entity.annotation.y - 2}
          r="5"
          fill={selected ? "var(--primary)" : "var(--accent)"}
          opacity="0.35"
        />
      ) : null}
      <text
        x={entity.annotation.x}
        y={entity.annotation.y}
        className="fill-muted-foreground"
        fontSize={entity.annotation.fontSizeIn ?? 6}
      >
        {entity.annotation.text}
      </text>
    </g>
  );
}

function PlacementShape({
  placement,
  label,
  confidence,
  childCount,
  totalChildCount,
  warningCount,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  placement: PlanPlacement;
  label: string;
  confidence: MeasurementConfidence | undefined;
  childCount: number;
  totalChildCount: number;
  warningCount: number;
  selected: boolean;
  hovered: boolean;
  onSelect: (placementId: string, additive: boolean) => void;
  onHover: (placementId: string | null) => void;
}) {
  const footprint = placementFootprint(placement);
  const border = placementBorderStyle(footprint, confidence);
  const corners = placementCorners({
    x: placement.x,
    y: placement.y,
    rotationDeg: placement.rotationDeg,
    footprint,
  });
  const canFitLabel = footprint.lengthIn >= Math.max(28, label.length * 3.2);

  return (
    <g
      className="cursor-pointer"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(placement._id, event.shiftKey);
      }}
      onPointerEnter={() => onHover(placement._id)}
      onPointerLeave={() => onHover(null)}
    >
      <polygon
        points={pointsAttribute(corners)}
        fill={placement.color ?? "var(--card)"}
        opacity="0.82"
        stroke={
          selected
            ? "var(--primary)"
            : warningCount
              ? "var(--destructive)"
              : hovered
                ? "var(--accent)"
                : "var(--primary)"
        }
        strokeWidth={selected || hovered ? 3 : 2}
        strokeDasharray={border.dashArray}
      />
      {warningCount ? (
        <polygon
          points={pointsAttribute(corners)}
          fill="none"
          stroke="var(--destructive)"
          strokeWidth="4"
          opacity="0.22"
        />
      ) : null}
      {childCount ? (
        <polygon
          points={pointsAttribute(corners)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1"
          strokeDasharray="3 3"
          transform={`translate(3 3)`}
        />
      ) : null}
      <text
        x={placement.x}
        y={placement.y + 2}
        textAnchor="middle"
        className="fill-foreground text-[5px] font-semibold"
      >
        {border.marker ?? (canFitLabel ? label : placement.shortId)}
      </text>
      {!canFitLabel && !border.marker ? (
        <text
          x={placement.x}
          y={placement.y + footprint.widthIn / 2 + 8}
          textAnchor="middle"
          className="fill-muted-foreground text-[5px]"
        >
          {label}
        </text>
      ) : null}
      {childCount ? (
        <g
          role="button"
          tabIndex={0}
          aria-label={`${childCount} contained placements, ${totalChildCount} total including nested`}
          transform={`translate(${corners[1]?.x ?? placement.x} ${
            corners[1]?.y ?? placement.y
          })`}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(placement._id, false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(placement._id, false);
            }
          }}
        >
          <rect
            x="-10"
            y="-10"
            width="20"
            height="14"
            rx="3"
            fill="var(--accent)"
            stroke="var(--background)"
            strokeWidth="1.5"
          />
          <text
            x="0"
            y="-1"
            textAnchor="middle"
            className="fill-accent-foreground text-[5px] font-semibold"
          >
            {childCount}
          </text>
          <title>{`${totalChildCount} total including nested`}</title>
        </g>
      ) : null}
    </g>
  );
}

type GhostEntity = PlanEntity | ProposalEntity;
type GhostPlacement = PlanPlacement | ProposalPlacement;
type ProposalGhostTone = "create" | "update" | "delete";

function ProposalGhostOverlay({
  levelId,
  entities,
  placements,
  preview,
}: {
  levelId: string;
  entities: PlanEntity[];
  placements: PlanPlacement[];
  preview: ProposalPreview;
}) {
  const createdEntityIds = new Set(preview.createdEntityIds);
  const updatedEntityIds = new Set(preview.updatedEntityIds);
  const deletedEntityIds = new Set(preview.deletedEntityIds);
  const createdPlacementIds = new Set(preview.createdPlacementIds);
  const updatedPlacementIds = new Set(preview.updatedPlacementIds);
  const deletedPlacementIds = new Set(preview.deletedPlacementIds);
  const currentDeletedEntities = entities.filter((entity) =>
    deletedEntityIds.has(entity._id),
  );
  const nextEntities = preview.entities.filter(
    (entity) =>
      entity.levelId === levelId &&
      (createdEntityIds.has(entity._id) || updatedEntityIds.has(entity._id)),
  );
  const currentDeletedPlacements = placements.filter((placement) =>
    deletedPlacementIds.has(placement._id),
  );
  const nextPlacements = preview.placements.filter(
    (placement) =>
      placement.levelId === levelId &&
      (createdPlacementIds.has(placement._id) ||
        updatedPlacementIds.has(placement._id)),
  );
  const walls = [...entities, ...preview.entities].filter(
    (entity) => entity.entityType === "wall" && entity.wall,
  );

  if (
    !currentDeletedEntities.length &&
    !nextEntities.length &&
    !currentDeletedPlacements.length &&
    !nextPlacements.length
  ) {
    return null;
  }

  return (
    <g pointerEvents="none">
      {currentDeletedEntities.map((entity) => (
        <ProposalGhostEntityShape
          key={`proposal-delete-entity-${entity._id}`}
          entity={entity}
          walls={walls}
          tone="delete"
        />
      ))}
      {currentDeletedPlacements.map((placement) => (
        <ProposalGhostPlacementShape
          key={`proposal-delete-placement-${placement._id}`}
          placement={placement}
          tone="delete"
        />
      ))}
      {nextEntities.map((entity) => (
        <ProposalGhostEntityShape
          key={`proposal-next-entity-${entity._id}`}
          entity={entity}
          walls={walls}
          tone={createdEntityIds.has(entity._id) ? "create" : "update"}
        />
      ))}
      {nextPlacements.map((placement) => (
        <ProposalGhostPlacementShape
          key={`proposal-next-placement-${placement._id}`}
          placement={placement}
          tone={createdPlacementIds.has(placement._id) ? "create" : "update"}
        />
      ))}
    </g>
  );
}

function ProposalGhostEntityShape({
  entity,
  walls,
  tone,
}: {
  entity: GhostEntity;
  walls: GhostEntity[];
  tone: ProposalGhostTone;
}) {
  const stroke = proposalGhostStroke(tone);
  const fill = tone === "delete" ? "var(--destructive)" : stroke;

  if (entity.room) {
    return (
      <polygon
        points={pointsAttribute(entity.room.points)}
        fill={fill}
        opacity={tone === "delete" ? "0.1" : "0.16"}
        stroke={stroke}
        strokeWidth="3"
        strokeDasharray={tone === "delete" ? "3 4" : "9 5"}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (entity.zone) {
    return (
      <polygon
        points={pointsAttribute(entity.zone.points)}
        fill={fill}
        opacity={tone === "delete" ? "0.1" : "0.14"}
        stroke={stroke}
        strokeWidth="3"
        strokeDasharray={tone === "delete" ? "3 4" : "9 5"}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (entity.wall) {
    return (
      <line
        x1={entity.wall.x1}
        y1={entity.wall.y1}
        x2={entity.wall.x2}
        y2={entity.wall.y2}
        stroke={stroke}
        strokeWidth={entity.wall.thicknessIn + 5}
        strokeLinecap="butt"
        strokeDasharray={tone === "delete" ? "3 4" : "9 5"}
        opacity={tone === "delete" ? "0.55" : "0.7"}
      />
    );
  }

  if (entity.opening) {
    const wall = walls.find(
      (candidate) => candidate.shortId === entity.opening?.wallShortId,
    )?.wall;
    if (!wall) {
      return null;
    }
    const start = pointAlongWall(wall, entity.opening.offsetAlongWallIn);
    const end = pointAlongWall(
      wall,
      entity.opening.offsetAlongWallIn + entity.opening.widthIn,
    );
    return (
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={stroke}
        strokeWidth="7"
        strokeDasharray={tone === "delete" ? "3 4" : "9 5"}
        opacity="0.72"
      />
    );
  }

  if (entity.feature) {
    return (
      <rect
        x={-entity.feature.widthIn / 2}
        y={-entity.feature.depthIn / 2}
        width={entity.feature.widthIn}
        height={entity.feature.depthIn}
        transform={`translate(${entity.feature.x} ${entity.feature.y}) rotate(${entity.feature.rotationDeg})`}
        fill={fill}
        opacity={tone === "delete" ? "0.12" : "0.18"}
        stroke={stroke}
        strokeWidth="3"
        strokeDasharray={tone === "delete" ? "3 4" : "9 5"}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (entity.annotation) {
    return (
      <text
        x={entity.annotation.x}
        y={entity.annotation.y}
        className="font-semibold"
        fill={stroke}
        fontSize={entity.annotation.fontSizeIn ?? 7}
        opacity="0.82"
        paintOrder="stroke"
        stroke="var(--background)"
        strokeWidth="3"
      >
        {entity.annotation.text}
      </text>
    );
  }

  return null;
}

function ProposalGhostPlacementShape({
  placement,
  tone,
}: {
  placement: GhostPlacement;
  tone: ProposalGhostTone;
}) {
  const stroke = proposalGhostStroke(tone);
  const footprint = placementFootprint(placement);
  const corners = placementCorners({
    x: placement.x,
    y: placement.y,
    rotationDeg: placement.rotationDeg,
    footprint,
  });

  return (
    <g>
      <polygon
        points={pointsAttribute(corners)}
        fill={stroke}
        opacity={tone === "delete" ? "0.1" : "0.18"}
        stroke={stroke}
        strokeWidth="3"
        strokeDasharray={tone === "delete" ? "3 4" : "9 5"}
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={placement.x}
        y={placement.y + 2}
        textAnchor="middle"
        className="text-[5px] font-semibold"
        fill={stroke}
        paintOrder="stroke"
        stroke="var(--background)"
        strokeWidth="3"
      >
        {placement.shortId}
      </text>
    </g>
  );
}

function proposalGhostStroke(tone: ProposalGhostTone) {
  if (tone === "delete") {
    return "var(--destructive)";
  }
  if (tone === "update") {
    return "var(--accent)";
  }
  return "var(--primary)";
}

function IdChip({
  entity,
  wallNames,
}: {
  entity: PlanEntity;
  wallNames: Map<string, WallDisplayName>;
}) {
  const point = entityDisplayPoint(entity);
  const label = displayLabel(entity, wallNames);
  const width = Math.min(Math.max(label.length * 3.4 + 10, 38), 190);

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Copy ${label}`}
      className="cursor-copy"
      transform={`translate(${point.x + 8} ${point.y - 18})`}
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard?.writeText(label);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void navigator.clipboard?.writeText(label);
        }
      }}
    >
      <rect
        width={width}
        height="14"
        rx="3"
        fill="var(--primary)"
        stroke="var(--background)"
        strokeWidth="1.5"
      />
      <text
        x="5"
        y="9.5"
        className="fill-primary-foreground text-[5px] font-semibold"
      >
        {label}
      </text>
    </g>
  );
}

function PlacementIdChip({ placement }: { placement: PlanPlacement }) {
  const label = placementDisplayLabel(placement);
  const width = Math.min(Math.max(label.length * 3.4 + 10, 38), 190);

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Copy ${label}`}
      className="cursor-copy"
      transform={`translate(${placement.x + 8} ${placement.y - 18})`}
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard?.writeText(label);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void navigator.clipboard?.writeText(label);
        }
      }}
    >
      <rect
        width={width}
        height="14"
        rx="3"
        fill="var(--primary)"
        stroke="var(--background)"
        strokeWidth="1.5"
      />
      <text
        x="5"
        y="9.5"
        className="fill-primary-foreground text-[5px] font-semibold"
      >
        {label}
      </text>
    </g>
  );
}

function DraftPreview({
  activeTool,
  wallStart,
  rectStart,
  polygonPoints,
  cursorPoint,
  editDraft,
  placementEditDraft,
  placingSource,
  unitSystem,
}: {
  activeTool: DrawingTool;
  wallStart: Point | null;
  rectStart: Point | null;
  polygonPoints: Point[];
  cursorPoint: Point | null;
  editDraft: EditDraft | null;
  placementEditDraft: PlacementEditDraft | null;
  placingSource: PlacementTraySource | null;
  unitSystem: "imperial" | "metric";
}) {
  const previewPoints =
    polygonPoints.length && cursorPoint
      ? [...polygonPoints, cursorPoint]
      : polygonPoints;

  return (
    <g pointerEvents="none">
      {activeTool === "wall" && wallStart && cursorPoint ? (
        <>
          <line
            x1={wallStart.x}
            y1={wallStart.y}
            x2={cursorPoint.x}
            y2={cursorPoint.y}
            stroke="var(--primary)"
            strokeWidth="3"
            strokeDasharray="8 5"
          />
          <DraftLabel
            point={midpoint(wallStart, cursorPoint)}
            label={measurementLabel(wallStart, cursorPoint, unitSystem)}
          />
        </>
      ) : null}
      {activeTool === "roomRect" && rectStart && cursorPoint ? (
        <>
          <polygon
            points={pointsAttribute(rectanglePoints(rectStart, cursorPoint))}
            fill="var(--primary)"
            opacity="0.12"
            stroke="var(--primary)"
            strokeDasharray="8 5"
            strokeWidth="2"
          />
          <DraftLabel
            point={midpoint(rectStart, cursorPoint)}
            label={`${formatLengthInches(
              Math.abs(cursorPoint.x - rectStart.x),
              unitSystem,
            )} x ${formatLengthInches(
              Math.abs(cursorPoint.y - rectStart.y),
              unitSystem,
            )}`}
          />
        </>
      ) : null}
      {(activeTool === "roomPolygon" || activeTool === "zone") &&
      previewPoints.length ? (
        <>
          <polyline
            points={pointsAttribute(previewPoints)}
            fill="none"
            stroke="var(--primary)"
            strokeDasharray="8 5"
            strokeWidth="2"
          />
          {polygonPoints.map((point, index) => (
            <circle
              key={`${point.x}-${point.y}-${index}`}
              cx={point.x}
              cy={point.y}
              r="3"
              fill="var(--primary)"
            />
          ))}
        </>
      ) : null}
      {cursorPoint ? (
        <circle
          cx={cursorPoint.x}
          cy={cursorPoint.y}
          r="2.5"
          fill="var(--accent)"
        />
      ) : null}
      {editDraft ? <EditDraftPreview draft={editDraft} /> : null}
      {placementEditDraft ? (
        <PlacementDraftPreview draft={placementEditDraft} />
      ) : null}
      {placingSource && cursorPoint ? (
        <SourceDropPreview source={placingSource} point={cursorPoint} />
      ) : null}
    </g>
  );
}

function DraftLabel({ point, label }: { point: Point; label: string }) {
  return (
    <text
      x={point.x + 6}
      y={point.y - 6}
      className="fill-primary text-[6px] font-semibold"
      paintOrder="stroke"
      stroke="var(--background)"
      strokeWidth="3"
    >
      {label}
    </text>
  );
}

function SelectedEditHandles({
  entity,
  walls,
  editDraft,
  onStartEdit,
}: {
  entity: PlanEntity;
  walls: PlanEntity[];
  editDraft: EditDraft | null;
  onStartEdit: (draft: EditDraft) => void;
}) {
  if (editDraft?.entity._id === entity._id) {
    return null;
  }

  if (entity.wall) {
    const midpoint = {
      x: (entity.wall.x1 + entity.wall.x2) / 2,
      y: (entity.wall.y1 + entity.wall.y2) / 2,
    };
    return (
      <g>
        <HandleCircle
          point={{ x: entity.wall.x1, y: entity.wall.y1 }}
          label={`Drag ${entity.shortId} start`}
          onPointerDown={() =>
            onStartEdit({
              entity,
              mode: "wallStart",
              current: { x: entity.wall!.x1, y: entity.wall!.y1 },
            })
          }
        />
        <HandleCircle
          point={{ x: entity.wall.x2, y: entity.wall.y2 }}
          label={`Drag ${entity.shortId} end`}
          onPointerDown={() =>
            onStartEdit({
              entity,
              mode: "wallEnd",
              current: { x: entity.wall!.x2, y: entity.wall!.y2 },
            })
          }
        />
        <HandleCircle
          point={midpoint}
          label={`Move ${entity.shortId}`}
          onPointerDown={() =>
            onStartEdit({
              entity,
              mode: "wallMove",
              origin: midpoint,
              current: midpoint,
            })
          }
        />
      </g>
    );
  }

  if (entity.room) {
    return (
      <g>
        {entity.room.points.map((point, index) => {
          const next = entity.room!.points[(index + 1) % entity.room!.points.length];
          const midpoint = {
            x: (point.x + next.x) / 2,
            y: (point.y + next.y) / 2,
          };
          return (
            <HandleCircle
              key={`${entity._id}-edge-${index}`}
              point={midpoint}
              label={`Add ${entity.shortId} vertex after ${index + 1}`}
              variant="secondary"
              onPointerDown={() =>
                onStartEdit({
                  entity,
                  mode: "roomVertexInsert",
                  vertexIndex: index + 1,
                  current: midpoint,
                })
              }
            />
          );
        })}
        {entity.room.points.map((point, index) => (
          <HandleCircle
            key={`${entity._id}-${index}`}
            point={point}
            label={`Drag ${entity.shortId} vertex ${index + 1}`}
            onPointerDown={() =>
              onStartEdit({
                entity,
                mode: "roomVertex",
                vertexIndex: index,
                current: point,
              })
            }
          />
        ))}
      </g>
    );
  }

  if (entity.zone) {
    return (
      <g>
        {entity.zone.points.map((point, index) => {
          const next = entity.zone!.points[(index + 1) % entity.zone!.points.length];
          const midpoint = {
            x: (point.x + next.x) / 2,
            y: (point.y + next.y) / 2,
          };
          return (
            <HandleCircle
              key={`${entity._id}-edge-${index}`}
              point={midpoint}
              label={`Add ${entity.shortId} vertex after ${index + 1}`}
              variant="secondary"
              onPointerDown={() =>
                onStartEdit({
                  entity,
                  mode: "zoneVertexInsert",
                  vertexIndex: index + 1,
                  current: midpoint,
                })
              }
            />
          );
        })}
        {entity.zone.points.map((point, index) => (
          <HandleCircle
            key={`${entity._id}-${index}`}
            point={point}
            label={`Drag ${entity.shortId} vertex ${index + 1}`}
            onPointerDown={() =>
              onStartEdit({
                entity,
                mode: "zoneVertex",
                vertexIndex: index,
                current: point,
              })
            }
          />
        ))}
      </g>
    );
  }

  if (entity.feature) {
    return (
      <g>
        <HandleCircle
          point={{ x: entity.feature.x, y: entity.feature.y }}
          label={`Drag ${entity.shortId}`}
          onPointerDown={() =>
            onStartEdit({
              entity,
              mode: "feature",
              current: { x: entity.feature!.x, y: entity.feature!.y },
            })
          }
        />
        <HandleCircle
          point={featureLocalToWorld(entity.feature, {
            x: entity.feature.widthIn / 2,
            y: entity.feature.depthIn / 2,
          })}
          label={`Resize ${entity.shortId}`}
          variant="secondary"
          onPointerDown={() =>
            onStartEdit({
              entity,
              mode: "featureResize",
              current: featureLocalToWorld(entity.feature!, {
                x: entity.feature!.widthIn / 2,
                y: entity.feature!.depthIn / 2,
              }),
            })
          }
        />
        <HandleCircle
          point={featureLocalToWorld(entity.feature, {
            x: 0,
            y: -entity.feature.depthIn / 2 - 18,
          })}
          label={`Rotate ${entity.shortId}`}
          variant="rotate"
          onPointerDown={() =>
            onStartEdit({
              entity,
              mode: "featureRotate",
              current: featureLocalToWorld(entity.feature!, {
                x: 0,
                y: -entity.feature!.depthIn / 2 - 18,
              }),
            })
          }
        />
      </g>
    );
  }

  if (entity.opening) {
    const wall = walls.find(
      (candidate) => candidate.shortId === entity.opening?.wallShortId,
    )?.wall;
    if (!wall) {
      return null;
    }
    const start = pointAlongWall(wall, entity.opening.offsetAlongWallIn);
    const end = pointAlongWall(
      wall,
      entity.opening.offsetAlongWallIn + entity.opening.widthIn,
    );
    const center = pointAlongWall(
      wall,
      entity.opening.offsetAlongWallIn + entity.opening.widthIn / 2,
    );

    return (
      <g>
        <HandleCircle
          point={start}
          label={`Resize ${entity.shortId} start`}
          onPointerDown={() =>
            onStartEdit({
              entity,
              mode: "openingStart",
              wall,
              current: start,
            })
          }
        />
        <HandleCircle
          point={center}
          label={`Move ${entity.shortId}`}
          onPointerDown={() =>
            onStartEdit({
              entity,
              mode: "openingCenter",
              wall,
              current: center,
            })
          }
        />
        <HandleCircle
          point={end}
          label={`Resize ${entity.shortId} end`}
          onPointerDown={() =>
            onStartEdit({
              entity,
              mode: "openingEnd",
              wall,
              current: end,
            })
          }
        />
      </g>
    );
  }

  if (entity.annotation) {
    return (
      <HandleCircle
        point={{ x: entity.annotation.x, y: entity.annotation.y }}
        label={`Drag ${entity.shortId}`}
        onPointerDown={() =>
          onStartEdit({
            entity,
            mode: "annotation",
            current: { x: entity.annotation!.x, y: entity.annotation!.y },
          })
        }
      />
    );
  }

  return null;
}

function SelectedPlacementHandles({
  placement,
  editDraft,
  onStartEdit,
}: {
  placement: PlanPlacement;
  editDraft: PlacementEditDraft | null;
  onStartEdit: (draft: PlacementEditDraft) => void;
}) {
  if (editDraft?.placement._id === placement._id || placement.locked) {
    return null;
  }

  const footprint = placementFootprint(placement);
  const rotateHandle = rotatePoint(
    {
      x: placement.x,
      y: placement.y - footprint.widthIn / 2 - 18,
    },
    { x: placement.x, y: placement.y },
    placement.rotationDeg,
  );

  return (
    <g>
      <HandleCircle
        point={{ x: placement.x, y: placement.y }}
        label={`Move ${placement.shortId}`}
        onPointerDown={() =>
          onStartEdit({
            placement,
            mode: "placementMove",
            origin: { x: placement.x, y: placement.y },
            current: { x: placement.x, y: placement.y },
          })
        }
      />
      <HandleCircle
        point={rotateHandle}
        label={`Rotate ${placement.shortId}`}
        variant="rotate"
        onPointerDown={() =>
          onStartEdit({
            placement,
            mode: "placementRotate",
            current: rotateHandle,
          })
        }
      />
    </g>
  );
}

function HandleCircle({
  point,
  label,
  variant = "primary",
  onPointerDown,
}: {
  point: Point;
  label: string;
  variant?: "primary" | "secondary" | "rotate";
  onPointerDown: () => void;
}) {
  return (
    <circle
      role="button"
      aria-label={label}
      tabIndex={0}
      className="cursor-grab"
      cx={point.x}
      cy={point.y}
      r={variant === "primary" ? "5" : "4"}
      fill={variant === "rotate" ? "var(--accent)" : "var(--background)"}
      stroke={variant === "primary" ? "var(--primary)" : "var(--accent)"}
      strokeWidth="2"
      vectorEffect="non-scaling-stroke"
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown();
      }}
    />
  );
}

function EditDraftPreview({ draft }: { draft: EditDraft }) {
  const op = editDraftToOp(draft);
  if (!op || op.type !== "updateEntity") {
    return null;
  }

  if (draft.entity.wall && op.patch.wall) {
    return (
      <line
        x1={op.patch.wall.x1}
        y1={op.patch.wall.y1}
        x2={op.patch.wall.x2}
        y2={op.patch.wall.y2}
        stroke="var(--primary)"
        strokeWidth={op.patch.wall.thicknessIn + 4}
        opacity="0.35"
      />
    );
  }

  if (draft.entity.feature && op.patch.feature) {
    const feature = op.patch.feature;
    return (
      <rect
        x={-feature.widthIn / 2}
        y={-feature.depthIn / 2}
        width={feature.widthIn}
        height={feature.depthIn}
        transform={`translate(${feature.x} ${feature.y}) rotate(${feature.rotationDeg})`}
        fill="var(--primary)"
        opacity="0.12"
        stroke="var(--primary)"
        strokeWidth="2"
      />
    );
  }

  if (draft.entity.room && op.patch.room) {
    return (
      <polygon
        points={pointsAttribute(op.patch.room.points)}
        fill="var(--primary)"
        opacity="0.12"
        stroke="var(--primary)"
        strokeWidth="2"
      />
    );
  }

  if (draft.entity.zone && op.patch.zone) {
    return (
      <polygon
        points={pointsAttribute(op.patch.zone.points)}
        fill="var(--primary)"
        opacity="0.12"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeDasharray="8 5"
      />
    );
  }

  if (
    (draft.mode === "openingCenter" ||
      draft.mode === "openingStart" ||
      draft.mode === "openingEnd") &&
    draft.entity.opening &&
    op.patch.opening
  ) {
    const start = pointAlongWall(draft.wall, op.patch.opening.offsetAlongWallIn);
    const end = pointAlongWall(
      draft.wall,
      op.patch.opening.offsetAlongWallIn + op.patch.opening.widthIn,
    );
    return (
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke="var(--primary)"
        strokeWidth="7"
        opacity="0.35"
      />
    );
  }

  return (
    <circle
      cx={draft.current.x}
      cy={draft.current.y}
      r="7"
      fill="var(--primary)"
      opacity="0.35"
    />
  );
}

function PlacementDraftPreview({ draft }: { draft: PlacementEditDraft }) {
  const op = placementEditDraftToOp(draft);
  if (!op || op.type !== "movePlacement") {
    return null;
  }

  return (
    <PlacementPreview
      placement={{
        ...draft.placement,
        x: op.x,
        y: op.y,
        rotationDeg: op.rotationDeg,
      }}
      opacity={0.35}
    />
  );
}

function SourceDropPreview({
  source,
  point,
}: {
  source: PlacementTraySource;
  point: Point;
}) {
  const footprintOverride =
    source.kind === "template"
      ? undefined
      : footprintOverrideFromDimensions(source.dimensions);
  return (
    <PlacementPreview
      placement={{
        ...(source.kind === "template" ? { templateKey: source.templateKey } : {}),
        ...(footprintOverride ? { footprintOverrideIn: footprintOverride } : {}),
        x: point.x,
        y: point.y,
        rotationDeg: 0,
      }}
      opacity={0.28}
    />
  );
}

function ContainmentOfferOverlay({
  offer,
  onChoose,
  onCancel,
}: {
  offer: ContainmentOffer;
  onChoose: (choice: "inside" | "onTop" | "beside") => void;
  onCancel: () => void;
}) {
  const x = offer.point.x + 10;
  const y = offer.point.y - 46;
  const choices: Array<{
    key: "inside" | "onTop" | "beside";
    label: string;
  }> = [
    { key: "inside", label: "Inside" },
    { key: "onTop", label: "On top" },
    { key: "beside", label: "Beside" },
  ];
  const subjectLabel =
    offer.kind === "create" ? offer.source.label : offer.child.shortId;

  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        width="132"
        height="40"
        rx="4"
        fill="var(--card)"
        stroke="var(--border)"
        strokeWidth="1.5"
        filter="drop-shadow(0 2px 4px var(--border))"
      />
      <text x="6" y="10" className="fill-muted-foreground text-[5px]">
        {`${subjectLabel} to ${offer.parent.shortId}`}
      </text>
      {choices.map((choice, index) => (
        <g
          key={choice.key}
          role="button"
          tabIndex={0}
          className="cursor-pointer"
          transform={`translate(${6 + index * 40} 17)`}
          onClick={(event) => {
            event.stopPropagation();
            onChoose(choice.key);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onChoose(choice.key);
            }
          }}
        >
          <rect
            width="36"
            height="16"
            rx="3"
            fill="var(--secondary)"
            stroke="var(--border)"
          />
          <text
            x="18"
            y="10.5"
            textAnchor="middle"
            className="fill-secondary-foreground text-[5px] font-medium"
          >
            {choice.label}
          </text>
        </g>
      ))}
      <g
        role="button"
        tabIndex={0}
        className="cursor-pointer"
        transform="translate(118 3)"
        onClick={(event) => {
          event.stopPropagation();
          onCancel();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <text className="fill-muted-foreground text-[7px] font-semibold">x</text>
      </g>
    </g>
  );
}

function PlacementPreview({
  placement,
  opacity,
}: {
  placement: PlacementPreviewModel;
  opacity: number;
}) {
  const footprint = placementFootprint(placement);
  const corners = placementCorners({
    x: placement.x,
    y: placement.y,
    rotationDeg: placement.rotationDeg,
    footprint,
  });

  return (
    <polygon
      points={pointsAttribute(corners)}
      fill="var(--primary)"
      opacity={opacity}
      stroke="var(--primary)"
      strokeWidth="2"
      strokeDasharray="8 5"
    />
  );
}

function entityBounds(entities: PlanEntity[]): ViewBox {
  const points: Point[] = [];
  for (const entity of entities) {
    if (entity.wall) {
      points.push(
        { x: entity.wall.x1, y: entity.wall.y1 },
        { x: entity.wall.x2, y: entity.wall.y2 },
      );
    }
    if (entity.room) {
      points.push(...entity.room.points);
    }
    if (entity.zone) {
      points.push(...entity.zone.points);
    }
    if (entity.feature) {
      points.push({ x: entity.feature.x, y: entity.feature.y });
    }
    if (entity.annotation) {
      points.push({ x: entity.annotation.x, y: entity.annotation.y });
    }
  }

  if (!points.length) {
    return { x: -96, y: -96, width: 384, height: 288 };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const margin = 48;
  const minX = Math.min(...xs) - margin;
  const maxX = Math.max(...xs) + margin;
  const minY = Math.min(...ys) - margin;
  const maxY = Math.max(...ys) + margin;
  return {
    x: minX,
    y: minY,
    width: Math.max(240, maxX - minX),
    height: Math.max(180, maxY - minY),
  };
}

function buildFitReport({
  entities,
  placements,
  items,
  boxes,
}: {
  entities: PlanEntity[];
  placements: PlanPlacement[];
  items: MoveItem[];
  boxes: MoveBoxRow[];
}) {
  const itemsById = new globalThis.Map<string, MoveItem>(
    items.map((item) => [item._id, item]),
  );
  const boxesById = new globalThis.Map<string, MoveBoxRow>(
    boxes.map((row) => [row.box._id, row]),
  );

  return analyzePlanFit({
    placements: placements
      .filter((placement) => !placement.parentPlacementId)
      .map((placement) => ({
        shortId: placement.shortId,
        label: fitPlacementLabel(placement, itemsById, boxesById),
        x: placement.x,
        y: placement.y,
        rotationDeg: placement.rotationDeg,
        footprint: placementFootprint(placement),
        dimensions: fitPlacementDimensions(placement, itemsById, boxesById),
      })),
    rooms: entities
      .filter((entity) => entity.room)
      .map((entity) => ({
        shortId: entity.shortId,
        name: entity.name,
        points: entity.room!.points,
      })),
    walls: entities
      .filter((entity) => entity.wall)
      .map((entity) => ({
        shortId: entity.shortId,
        wall: entity.wall!,
      })),
    openings: entities
      .filter((entity) => entity.opening)
      .map((entity) => ({
        shortId: entity.shortId,
        wallShortId: entity.opening!.wallShortId,
        widthIn: entity.opening!.widthIn,
        kind: entity.opening!.kind,
      })),
  });
}

function fitPlacementLabel(
  placement: PlanPlacement,
  itemsById: Map<string, MoveItem>,
  boxesById: Map<string, MoveBoxRow>,
) {
  const template = planTemplateByKey(placement.templateKey);
  if (template) {
    return template.label;
  }
  if (placement.itemId) {
    return itemsById.get(placement.itemId)?.name ?? placement.shortId;
  }
  if (placement.boxId) {
    const box = boxesById.get(placement.boxId)?.box;
    return box ? (box.label ? `${box.code} ${box.label}` : box.code) : placement.shortId;
  }
  return placement.shortId;
}

function fitPlacementDimensions(
  placement: PlanPlacement,
  itemsById: Map<string, MoveItem>,
  boxesById: Map<string, MoveBoxRow>,
) {
  const template = planTemplateByKey(placement.templateKey);
  if (template) {
    return {
      lengthIn: template.lengthIn,
      widthIn: template.widthIn,
      heightIn: template.heightIn,
    };
  }
  if (placement.itemId) {
    return itemsById.get(placement.itemId)?.dimensionsIn;
  }
  if (placement.boxId) {
    return boxesById.get(placement.boxId)?.box.dimensionsIn;
  }
  return placement.footprintOverrideIn;
}

function groupFitIssuesByRoom(issues: FitIssue[]) {
  const groups = new globalThis.Map<string, FitIssue[]>();
  for (const issue of issues) {
    const current = groups.get(issue.roomLabel) ?? [];
    current.push(issue);
    groups.set(issue.roomLabel, current);
  }
  return Array.from(groups.entries());
}

function placementFootprint(placement: PlacementFootprintSource) {
  const template = planTemplateByKey(placement.templateKey);
  return placement.footprintOverrideIn
    ? {
        lengthIn: placement.footprintOverrideIn.lengthIn,
        widthIn: placement.footprintOverrideIn.widthIn,
        measured: true,
      }
    : placementFootprintFromDimensions(
        template
          ? {
              lengthIn: template.lengthIn,
              widthIn: template.widthIn,
              heightIn: template.heightIn,
            }
          : undefined,
      );
}

function placementMeasurementConfidence(
  placement: PlanPlacement,
  itemsById: Map<string, MoveItem>,
): MeasurementConfidence | undefined {
  if (placement.templateKey) {
    return "medium";
  }
  if (placement.itemId) {
    const item = itemsById.get(placement.itemId);
    const dimensionsConfidence = itemDimensionsConfidenceForRead({
      dimensionsIn: item?.dimensionsIn,
      dimensionsConfidence: item?.dimensionsConfidence,
    });
    if (dimensionsConfidence) {
      return dimensionsConfidence;
    }
    return placement.footprintOverrideIn ? "medium" : "none";
  }
  return placement.footprintOverrideIn ? "manual" : "none";
}

function placementCanvasLabel(
  placement: PlanPlacement,
  itemsById: Map<string, MoveItem>,
) {
  const template = planTemplateByKey(placement.templateKey);
  if (template) {
    return template.label;
  }
  if (placement.itemId) {
    return itemsById.get(placement.itemId)?.name ?? placement.shortId;
  }
  return placement.shortId;
}

function parentPlacementAtPoint(point: Point, placements: PlanPlacement[]) {
  return [...placements]
    .filter((placement) => !placement.parentPlacementId)
    .sort((a, b) => b.zOrder - a.zOrder)
    .find((placement) => pointInsidePlacement(point, placement));
}

function pointInsidePlacement(point: Point, placement: PlanPlacement) {
  return pointInPolygon(point, placementCorners({
    x: placement.x,
    y: placement.y,
    rotationDeg: placement.rotationDeg,
    footprint: placementFootprint(placement),
  }));
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const current = polygon[index]!;
    const previous = polygon[previousIndex]!;
    const crosses =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y) +
          current.x;
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}

function besidePlacementPoint(parent: PlanPlacement): Point {
  const footprint = placementFootprint(parent);
  return {
    x: parent.x + footprint.lengthIn / 2 + 36,
    y: parent.y + footprint.widthIn / 2 + 36,
  };
}

function pointNearPolygonStart(point: Point, points: Point[], viewBox: ViewBox) {
  const start = points[0];
  if (!start) {
    return false;
  }
  const closeThresholdIn = Math.max(6, viewBox.width / 120);
  return Math.hypot(point.x - start.x, point.y - start.y) <= closeThresholdIn;
}

function isEditableEventTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function templateTraySource(template: (typeof planTemplates)[number]): PlacementTraySource {
  return {
    kind: "template",
    key: `template:${template.key}`,
    label: template.label,
    meta: `${formatLengthInches(
      template.lengthIn,
      "imperial",
    )} x ${formatLengthInches(template.widthIn, "imperial")}`,
    category: template.category,
    hasSize: true,
    templateKey: template.key,
    dimensions: {
      lengthIn: template.lengthIn,
      widthIn: template.widthIn,
      heightIn: template.heightIn,
    },
  };
}

function itemTraySource(item: MoveItem): PlacementTraySource {
  const room = item.destinationRoom ?? item.room ?? item.category ?? "No room";
  const quantity = item.quantity > 1 ? `Qty ${item.quantity}` : item.status;
  const footprint = placementFootprintFromDimensions(item.dimensionsIn);
  return {
    kind: "item",
    key: `item:${item._id}`,
    label: item.name,
    meta: `${room} | ${quantity} | ${dimensionsSummary(item.dimensionsIn)}`,
    category: item.category ?? "uncategorized",
    room,
    hasSize: footprint.measured,
    itemId: item._id,
    dimensions: item.dimensionsIn,
  };
}

function plannedItemTraySource(item: PlannedItem): PlacementTraySource {
  const footprint = placementFootprintFromDimensions(item.dimensionsIn);
  return {
    kind: "planned",
    key: `planned:${item._id}`,
    label: item.name,
    meta: `planned | ${item.status} | ${dimensionsSummary(item.dimensionsIn)}`,
    category: item.category ?? "planned",
    hasSize: footprint.measured,
    plannedItemId: item._id,
    dimensions: item.dimensionsIn,
  };
}

function boxTraySource(row: MoveBoxRow): PlacementTraySource {
  const label = row.box.label
    ? `${row.box.code} ${row.box.label}`
    : row.box.code;
  const room = row.box.destinationRoom ?? row.box.room ?? "No room";
  const footprint = placementFootprintFromDimensions(row.box.dimensionsIn);
  return {
    kind: "box",
    key: `box:${row.box._id}`,
    label,
    meta: `${room} | ${row.itemCount} items | ${dimensionsSummary(
      row.box.dimensionsIn,
    )}`,
    category: "box",
    room,
    hasSize: footprint.measured,
    boxId: row.box._id,
    dimensions: row.box.dimensionsIn,
  };
}

function dimensionsSummary(dimensions: PlacementDimensions | undefined) {
  const footprint = placementFootprintFromDimensions(dimensions);
  if (!footprint.measured) {
    return "unknown size";
  }
  return `${formatLengthInches(
    footprint.lengthIn,
    "imperial",
  )} x ${formatLengthInches(footprint.widthIn, "imperial")}`;
}

function placementSourceFields(source: PlacementTraySource) {
  switch (source.kind) {
    case "template":
      return { templateKey: source.templateKey };
    case "item":
      return { itemId: source.itemId };
    case "planned":
      return { plannedItemId: source.plannedItemId };
    case "box":
      return { boxId: source.boxId };
  }
}

function footprintOverrideFromDimensions(
  dimensions: PlacementDimensions | undefined,
) {
  const footprint = placementFootprintFromDimensions(dimensions);
  if (!footprint.measured) {
    return undefined;
  }
  return {
    lengthIn: footprint.lengthIn,
    widthIn: footprint.widthIn,
  };
}

function placementDisplayLabel(placement: PlanPlacement) {
  const template = planTemplateByKey(placement.templateKey);
  return `${placement.shortId} — ${template?.label ?? "Placement"}`;
}

function placementMetric(
  placement: PlanPlacement,
  unitSystem: "imperial" | "metric",
) {
  const footprint = placementFootprint(placement);
  const suffix = footprint.measured ? "" : " estimate";
  return `${formatLengthInches(
    footprint.lengthIn,
    unitSystem,
  )} x ${formatLengthInches(footprint.widthIn, unitSystem)}${suffix}`;
}

function placementEditDraftToOp(draft: PlacementEditDraft): PlanOp | null {
  if (draft.placement.locked) {
    return null;
  }

  if (draft.mode === "placementMove") {
    const delta = {
      x: draft.current.x - draft.origin.x,
      y: draft.current.y - draft.origin.y,
    };
    return {
      type: "movePlacement",
      placementId: draft.placement._id,
      x: draft.placement.x + delta.x,
      y: draft.placement.y + delta.y,
      rotationDeg: draft.placement.rotationDeg,
    };
  }

  const angle = radiansToDegrees(
    Math.atan2(
      draft.current.y - draft.placement.y,
      draft.current.x - draft.placement.x,
    ),
  );
  return {
    type: "movePlacement",
    placementId: draft.placement._id,
    x: draft.placement.x,
    y: draft.placement.y,
    rotationDeg: normalizeDegrees(angle + 90),
  };
}

function rotatePoint(point: Point, origin: Point, rotationDeg: number): Point {
  const radians = degreesToRadians(rotationDeg);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

function pointsAttribute(points: readonly Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function rectanglePoints(start: Point, end: Point) {
  return [
    start,
    { x: end.x, y: start.y },
    end,
    { x: start.x, y: end.y },
  ];
}

function midpoint(start: Point, end: Point): Point {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
}

function measurementLabel(
  start: Point,
  end: Point,
  unitSystem: "imperial" | "metric",
) {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const angle = normalizeDegrees(
    radiansToDegrees(Math.atan2(end.y - start.y, end.x - start.x)),
  );
  return `${formatLengthInches(length, unitSystem)} @ ${Math.round(angle)}deg`;
}

function editDraftOrthogonalOrigin(draft: EditDraft): Point | null {
  if (draft.mode === "wallStart" && draft.entity.wall) {
    return { x: draft.entity.wall.x2, y: draft.entity.wall.y2 };
  }
  if (draft.mode === "wallEnd" && draft.entity.wall) {
    return { x: draft.entity.wall.x1, y: draft.entity.wall.y1 };
  }
  if (draft.mode === "wallMove") {
    return draft.origin;
  }
  return null;
}

function featureLocalToWorld(
  feature: NonNullable<PlanEntity["feature"]>,
  point: Point,
): Point {
  const radians = degreesToRadians(feature.rotationDeg);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: feature.x + point.x * cos - point.y * sin,
    y: feature.y + point.x * sin + point.y * cos,
  };
}

function featureWorldToLocal(
  feature: NonNullable<PlanEntity["feature"]>,
  point: Point,
): Point {
  const radians = degreesToRadians(-feature.rotationDeg);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - feature.x;
  const dy = point.y - feature.y;
  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos,
  };
}

function polygonCreateOp(
  activeTool: DrawingTool,
  level: PlanLevel,
  points: Point[],
  zoneKind: ZoneKind,
): PlanOp {
  if (activeTool === "zone") {
    return {
      type: "createEntity",
      entity: {
        levelId: level._id,
        entityType: "zone",
	        zone: {
	          points,
	          zoneKind,
	        },
      },
    };
  }

  return {
    type: "createEntity",
    entity: {
      levelId: level._id,
      entityType: "room",
      room: { points },
    },
  };
}

function editDraftToOp(draft: EditDraft): PlanOp | null {
  switch (draft.mode) {
    case "wallStart":
      if (!draft.entity.wall) return null;
      if (
        Math.hypot(
          draft.entity.wall.x2 - draft.current.x,
          draft.entity.wall.y2 - draft.current.y,
        ) < 1
      ) {
        return null;
      }
      return {
        type: "updateEntity",
        entityId: draft.entity._id,
        patch: {
          wall: {
            ...draft.entity.wall,
            x1: draft.current.x,
            y1: draft.current.y,
          },
        },
      };
    case "wallEnd":
      if (!draft.entity.wall) return null;
      if (
        Math.hypot(
          draft.current.x - draft.entity.wall.x1,
          draft.current.y - draft.entity.wall.y1,
        ) < 1
      ) {
        return null;
      }
      return {
        type: "updateEntity",
        entityId: draft.entity._id,
        patch: {
          wall: {
            ...draft.entity.wall,
            x2: draft.current.x,
            y2: draft.current.y,
          },
        },
      };
    case "wallMove": {
      if (!draft.entity.wall) return null;
      const delta = {
        x: draft.current.x - draft.origin.x,
        y: draft.current.y - draft.origin.y,
      };
      return {
        type: "updateEntity",
        entityId: draft.entity._id,
        patch: {
          wall: {
            ...draft.entity.wall,
            x1: draft.entity.wall.x1 + delta.x,
            y1: draft.entity.wall.y1 + delta.y,
            x2: draft.entity.wall.x2 + delta.x,
            y2: draft.entity.wall.y2 + delta.y,
          },
        },
      };
    }
    case "roomVertex": {
      if (!draft.entity.room) return null;
      const points = draft.entity.room.points.map((point, index) =>
        index === draft.vertexIndex ? draft.current : point,
      );
      if (polygonSelfIntersects(points)) return null;
      return {
        type: "updateEntity",
        entityId: draft.entity._id,
        patch: { room: { ...draft.entity.room, points } },
      };
    }
    case "roomVertexInsert": {
      if (!draft.entity.room) return null;
      const points = [
        ...draft.entity.room.points.slice(0, draft.vertexIndex),
        draft.current,
        ...draft.entity.room.points.slice(draft.vertexIndex),
      ];
      if (polygonSelfIntersects(points)) return null;
      return {
        type: "updateEntity",
        entityId: draft.entity._id,
        patch: { room: { ...draft.entity.room, points } },
      };
    }
    case "zoneVertex": {
      if (!draft.entity.zone) return null;
      const points = draft.entity.zone.points.map((point, index) =>
        index === draft.vertexIndex ? draft.current : point,
      );
      if (polygonSelfIntersects(points)) return null;
      return {
        type: "updateEntity",
        entityId: draft.entity._id,
        patch: { zone: { ...draft.entity.zone, points } },
      };
    }
    case "zoneVertexInsert": {
      if (!draft.entity.zone) return null;
      const points = [
        ...draft.entity.zone.points.slice(0, draft.vertexIndex),
        draft.current,
        ...draft.entity.zone.points.slice(draft.vertexIndex),
      ];
      if (polygonSelfIntersects(points)) return null;
      return {
        type: "updateEntity",
        entityId: draft.entity._id,
        patch: { zone: { ...draft.entity.zone, points } },
      };
    }
    case "feature":
      if (!draft.entity.feature) return null;
      return {
        type: "updateEntity",
        entityId: draft.entity._id,
        patch: {
          feature: {
            ...draft.entity.feature,
            x: draft.current.x,
            y: draft.current.y,
          },
        },
      };
    case "featureResize": {
      if (!draft.entity.feature) return null;
      const local = featureWorldToLocal(draft.entity.feature, draft.current);
      return {
        type: "updateEntity",
        entityId: draft.entity._id,
        patch: {
          feature: {
            ...draft.entity.feature,
            widthIn: Math.max(6, Math.abs(local.x) * 2),
            depthIn: Math.max(6, Math.abs(local.y) * 2),
          },
        },
      };
    }
    case "featureRotate": {
      if (!draft.entity.feature) return null;
      const angle =
        radiansToDegrees(
          Math.atan2(
            draft.current.y - draft.entity.feature.y,
            draft.current.x - draft.entity.feature.x,
          ),
        ) + 90;
      return {
        type: "updateEntity",
        entityId: draft.entity._id,
        patch: {
          feature: {
            ...draft.entity.feature,
            rotationDeg: normalizeDegrees(angle),
          },
        },
      };
    }
    case "annotation":
      if (!draft.entity.annotation) return null;
      return {
        type: "updateEntity",
        entityId: draft.entity._id,
        patch: {
          annotation: {
            ...draft.entity.annotation,
            x: draft.current.x,
            y: draft.current.y,
          },
        },
      };
    case "openingCenter":
    case "openingStart":
    case "openingEnd": {
      if (!draft.entity.opening) return null;
      const opening = draft.entity.opening;
      const clampedOpening = clampOpeningToWall({
        opening,
        wall: draft.wall,
        point: draft.current,
        mode:
          draft.mode === "openingCenter"
            ? "center"
            : draft.mode === "openingStart"
              ? "start"
              : "end",
      });
      if (!clampedOpening) return null;

      return {
        type: "updateEntity",
        entityId: draft.entity._id,
        patch: {
          opening: clampedOpening,
        },
      };
    }
  }
}

function nearestWall(
  point: Point,
  walls: PlanEntity[],
  viewBox: ViewBox,
) {
  const maxDistance = Math.max(10, viewBox.width / 80);
  let best: { wall: PlanEntity; distance: number } | null = null;
  for (const wall of walls) {
    if (!wall.wall) {
      continue;
    }
    const distance = distancePointToSegment(
      point,
      { x: wall.wall.x1, y: wall.wall.y1 },
      { x: wall.wall.x2, y: wall.wall.y2 },
    );
    if (distance <= maxDistance && (!best || distance < best.distance)) {
      best = { wall, distance };
    }
  }
  return best?.wall ?? null;
}

function defaultFeatureSize(featureKind: FeatureKind) {
  switch (featureKind) {
    case "stairs":
      return { widthIn: 42, depthIn: 96, heightIn: 96 };
    case "tub":
      return { widthIn: 60, depthIn: 30, heightIn: 24 };
    case "shower":
      return { widthIn: 36, depthIn: 36, heightIn: 84 };
    case "counter":
      return { widthIn: 48, depthIn: 24, heightIn: 36 };
    case "fireplace":
      return { widthIn: 48, depthIn: 18, heightIn: 48 };
    case "waterHeater":
      return { widthIn: 24, depthIn: 24, heightIn: 60 };
    case "shed":
      return { widthIn: 96, depthIn: 120, heightIn: 96 };
    case "trampoline":
      return { widthIn: 144, depthIn: 144, heightIn: 36 };
    case "swingSet":
      return { widthIn: 144, depthIn: 96, heightIn: 96 };
    case "picnicTable":
      return { widthIn: 72, depthIn: 60, heightIn: 30 };
    case "grill":
      return { widthIn: 48, depthIn: 24, heightIn: 48 };
    case "raisedBed":
      return { widthIn: 96, depthIn: 48, heightIn: 18 };
    case "acUnit":
      return { widthIn: 36, depthIn: 36, heightIn: 36 };
    case "generator":
      return { widthIn: 36, depthIn: 24, heightIn: 24 };
    case "woodpile":
      return { widthIn: 72, depthIn: 24, heightIn: 48 };
    case "vehicle":
      return { widthIn: 180, depthIn: 70, heightIn: 60 };
    case "rv":
      return { widthIn: 312, depthIn: 96, heightIn: 132 };
    case "trailer":
      return { widthIn: 192, depthIn: 84, heightIn: 96 };
    case "fence":
      return { widthIn: 96, depthIn: 2, heightIn: 60 };
    case "sink":
    case "toilet":
    case "custom":
      return { widthIn: 30, depthIn: 24, heightIn: 30 };
  }
}

function zoneVisualStyle(kind: ZoneKind, overrideColor: string | undefined) {
  if (overrideColor) {
    return {
      fill: overrideColor,
      stroke: "var(--accent)",
      strokeDasharray: "8 5",
      opacity: "0.65",
    };
  }

  switch (kind) {
    case "driveway":
      return {
        fill: "url(#plan-zone-driveway)",
        stroke: "var(--muted-foreground)",
        strokeDasharray: "0",
        opacity: "0.9",
      };
    case "garden":
      return {
        fill: "color-mix(in oklab, var(--secondary) 75%, var(--chart-2))",
        stroke: "var(--chart-2)",
        strokeDasharray: "5 4",
        opacity: "0.72",
      };
    case "patio":
      return {
        fill: "url(#plan-zone-patio)",
        stroke: "var(--muted-foreground)",
        strokeDasharray: "0",
        opacity: "0.82",
      };
    case "shed":
      return {
        fill: "color-mix(in oklab, var(--card) 70%, var(--chart-4))",
        stroke: "var(--chart-4)",
        strokeDasharray: "6 3",
        opacity: "0.68",
      };
    case "fence":
      return {
        fill: "transparent",
        stroke: "var(--foreground)",
        strokeDasharray: "2 7",
        opacity: "0.9",
      };
    case "custom":
      return {
        fill: "var(--secondary)",
        stroke: "var(--accent)",
        strokeDasharray: "8 5",
        opacity: "0.65",
      };
  }
}

function featureVisualStyle(kind: FeatureKind, overrideColor: string | undefined) {
  if (overrideColor) {
    return {
      fill: "var(--card)",
      stroke: overrideColor,
    };
  }

  switch (kind) {
    case "shed":
      return {
        fill: "color-mix(in oklab, var(--card) 70%, var(--chart-4))",
        stroke: "var(--chart-4)",
      };
    case "trampoline":
      return {
        fill: "color-mix(in oklab, var(--card) 70%, var(--chart-1))",
        stroke: "var(--chart-1)",
      };
    case "swingSet":
      return {
        fill: "color-mix(in oklab, var(--card) 70%, var(--chart-2))",
        stroke: "var(--chart-2)",
      };
    case "picnicTable":
    case "woodpile":
      return {
        fill: "color-mix(in oklab, var(--card) 70%, var(--chart-3))",
        stroke: "var(--chart-3)",
      };
    case "grill":
    case "generator":
    case "acUnit":
      return {
        fill: "var(--muted)",
        stroke: "var(--muted-foreground)",
      };
    case "raisedBed":
      return {
        fill: "color-mix(in oklab, var(--card) 70%, var(--chart-2))",
        stroke: "var(--chart-2)",
      };
    case "vehicle":
    case "rv":
    case "trailer":
      return {
        fill: "color-mix(in oklab, var(--card) 70%, var(--chart-5))",
        stroke: "var(--chart-5)",
      };
    case "fence":
      return { fill: "transparent", stroke: "var(--foreground)" };
    default:
      return { fill: "var(--card)", stroke: "var(--primary)" };
  }
}

function fencePostPositions(widthIn: number) {
  const spacing = 24;
  const count = Math.max(2, Math.floor(widthIn / spacing) + 1);
  const start = -widthIn / 2;
  const step = widthIn / (count - 1);
  return Array.from({ length: count }, (_, index) => start + index * step);
}

function featureKindLabel(kind: FeatureKind) {
  switch (kind) {
    case "waterHeater":
      return "Water heater";
    case "swingSet":
      return "Swing set";
    case "picnicTable":
      return "Picnic table";
    case "raisedBed":
      return "Raised bed";
    case "acUnit":
      return "AC unit";
    default:
      return kind;
  }
}

function zoneKindLabel(kind: ZoneKind) {
  return kind === "driveway"
    ? "Driveway"
    : kind === "garden"
      ? "Garden"
      : kind === "patio"
        ? "Patio"
        : kind === "shed"
          ? "Shed"
          : kind === "fence"
            ? "Fence"
            : "Custom";
}

function toolHint(tool: DrawingTool, levelType: PlanLevel["levelType"] | undefined) {
  switch (tool) {
    case "select":
      return "Select or drag to pan";
    case "wall":
      return "Click start, then click end. Shift locks orthogonal.";
    case "roomRect":
      return "Drag a rectangle room.";
    case "roomPolygon":
      return "Click vertices, Enter closes.";
    case "opening":
      return "Click near a wall to place an opening.";
    case "feature":
      return "Click to stamp the selected feature.";
    case "annotation":
      return "Click to add annotation text.";
    case "zone":
      return levelType === "outdoor"
        ? "Click outdoor zone vertices, Enter closes."
        : "Switch to Yard for zones.";
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

function normalizeDegrees(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

function planOpErrorMessage(error: unknown) {
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message) as { reason?: unknown };
      if (typeof parsed.reason === "string" && parsed.reason.trim()) {
        return parsed.reason;
      }
    } catch {
      // Fall through to the normal error message.
    }
    if (error.message.trim()) {
      return error.message;
    }
  }
  return "Layout change could not be applied.";
}

function displayLabel(
  entity: PlanEntity,
  wallNames: Map<string, WallDisplayName>,
) {
  if (entity.entityType === "wall") {
    return wallNames.get(entity.shortId)?.copyLabel ?? entity.shortId;
  }

  return `${entity.shortId} — ${autoEntityLabel(entity, wallNames)}`;
}

function autoEntityLabel(
  entity: PlanEntity,
  wallNames: Map<string, WallDisplayName>,
) {
  if (entity.name?.trim()) {
    return entity.name;
  }
  if (entity.entityType === "wall") {
    return wallNames.get(entity.shortId)?.label ?? entity.shortId;
  }
  if (entity.entityType === "room") {
    return `Room ${entity.shortId.replace(/^\D+/, "") || entity.shortId}`;
  }
  if (entity.opening) {
    return entity.opening.kind;
  }
  if (entity.feature) {
    return entity.feature.featureKind;
  }
  if (entity.zone) {
    return entity.zone.zoneKind;
  }
  return entity.entityType;
}

function entityMetric(
  entity: PlanEntity,
  unitSystem: "imperial" | "metric",
) {
  if (entity.wall) {
    return formatLengthInches(
      Math.hypot(entity.wall.x2 - entity.wall.x1, entity.wall.y2 - entity.wall.y1),
      unitSystem,
    );
  }
  if (entity.room) {
    return formatAreaSquareInches(polygonArea(entity.room.points), unitSystem);
  }
  if (entity.zone) {
    return formatAreaSquareInches(polygonArea(entity.zone.points), unitSystem);
  }
  if (entity.feature) {
    return `${formatLengthInches(
      entity.feature.widthIn,
      unitSystem,
    )} x ${formatLengthInches(entity.feature.depthIn, unitSystem)}`;
  }
  if (entity.opening) {
    return formatLengthInches(entity.opening.widthIn, unitSystem);
  }
  return null;
}
