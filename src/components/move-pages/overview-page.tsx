"use client";

import { MovePeopleManager } from "@/components/move-people-manager";
import { MoveQuestionsPanel } from "@/components/move-questions-panel";
import { MoveWorkspaceTabList } from "@/components/move-workspace-tab-list";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { PackingDebtDashboard } from "@/components/packing-debt-dashboard";
import { PlanningDefaultsPanel } from "@/components/planning-defaults-panel";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useHashTab } from "@/components/use-hash-tab";

const overviewTabHashes = {
  "#move-questions": "decisions",
  "#packing-debt": "readiness",
  "#move-contacts": "people",
  "#planning-defaults": "defaults",
} as const;

export function MoveOverviewPage() {
  const { householdId, moveId, selectedMove } = useMoveWorkspace();
  const [activeTab, setActiveTab] = useHashTab("decisions", overviewTabHashes);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title={selectedMove?.title ?? "Move overview"}
        description="What still needs a decision, who is involved, and the defaults that steer packing, packets, and AI suggestions."
      />
      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
        <MoveWorkspaceTabList
          tabs={[
            { value: "decisions", label: "Decisions" },
            { value: "readiness", label: "Readiness" },
            { value: "people", label: "People" },
            { value: "defaults", label: "Defaults" },
          ]}
        />

        <TabsContent value="decisions">
          <MoveQuestionsPanel householdId={householdId} moveId={moveId} />
        </TabsContent>
        <TabsContent value="readiness">
          <PackingDebtDashboard householdId={householdId} moveId={moveId} />
        </TabsContent>
        <TabsContent value="people">
          <MovePeopleManager householdId={householdId} moveId={moveId} />
        </TabsContent>
        <TabsContent value="defaults">
          <PlanningDefaultsPanel householdId={householdId} moveId={moveId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
