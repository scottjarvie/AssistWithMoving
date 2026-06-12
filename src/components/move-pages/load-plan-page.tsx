"use client";

import { AiPlanningSuggestions } from "@/components/ai-planning-suggestions";
import { LoadPlannerBoard } from "@/components/load-planner-board";
import { MoveWorkspaceTabList } from "@/components/move-workspace-tab-list";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { TransportResourcesPanel } from "@/components/transport-resources-panel";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Tabs, TabsContent } from "@/components/ui/tabs";

export function LoadPlanWorkspacePage() {
  const { householdId, moveId, selectedMove } = useMoveWorkspace();

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Load Plan"
        description="Trucks, trailers, movers, and helpers — what goes in each one, zone by zone, with capacity rollups."
      />
      <Tabs defaultValue="board" className="gap-4">
        <MoveWorkspaceTabList
          tabs={[
            { value: "board", label: "Board" },
            { value: "resources", label: "Resources" },
            { value: "ai", label: "AI suggestions" },
          ]}
        />

        <TabsContent value="board">
          <LoadPlannerBoard householdId={householdId} moveId={moveId} />
        </TabsContent>
        <TabsContent value="resources">
          <TransportResourcesPanel
            householdId={householdId}
            moveId={moveId}
            moveTitle={selectedMove?.title}
            moveType={selectedMove?.type}
          />
        </TabsContent>
        <TabsContent value="ai">
          <AiPlanningSuggestions householdId={householdId} moveId={moveId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
