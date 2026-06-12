"use client";

import { AiPlanningSuggestions } from "@/components/ai-planning-suggestions";
import { LoadPlannerBoard } from "@/components/load-planner-board";
import { MoveWorkspaceTabList } from "@/components/move-workspace-tab-list";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { TransportResourcesPanel } from "@/components/transport-resources-panel";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useHashTab } from "@/components/use-hash-tab";

const loadPlanTabHashes = {
  "#add-transport-resource": "resources",
  "#ai-planning-suggestions": "ai",
  "#capacity-posture": "resources",
  "#load-plan": "board",
  "#transport-resource-presets": "resources",
  "#transport-resources": "resources",
} as const;

const loadPlanTabs = [
  {
    value: "board",
    label: "Board",
    description:
      "Assign boxes and zones on the load board before editing resources.",
  },
  {
    value: "resources",
    label: "Resources",
    description:
      "Manage trucks, trailers, movers, helpers, zones, and capacity assumptions.",
  },
  {
    value: "ai",
    label: "AI suggestions",
    description:
      "Review suggested load changes separately from the working board.",
  },
];

export function LoadPlanWorkspacePage() {
  const { householdId, moveId, selectedMove } = useMoveWorkspace();
  const [activeTab, setActiveTab] = useHashTab("board", loadPlanTabHashes);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Load Plan"
        description="Trucks, trailers, movers, and helpers — what goes in each one, zone by zone, with capacity rollups."
      />
      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
        <MoveWorkspaceTabList tabs={loadPlanTabs} activeValue={activeTab} />

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
