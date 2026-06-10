"use client";

import { AiPlanningSuggestions } from "@/components/ai-planning-suggestions";
import { LoadPlannerBoard } from "@/components/load-planner-board";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { TransportResourcesPanel } from "@/components/transport-resources-panel";
import { useMoveWorkspace } from "@/components/move-workspace-context";

export function LoadPlanWorkspacePage() {
  const { householdId, moveId, selectedMove } = useMoveWorkspace();

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Load Plan"
        description="Trucks, trailers, movers, and helpers — what goes in each one, zone by zone, with capacity rollups."
      />
      <TransportResourcesPanel
        householdId={householdId}
        moveId={moveId}
        moveTitle={selectedMove?.title}
      />
      <LoadPlannerBoard householdId={householdId} moveId={moveId} />
      <AiPlanningSuggestions householdId={householdId} moveId={moveId} />
    </div>
  );
}
