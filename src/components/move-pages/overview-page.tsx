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

const overviewTabs = [
  {
    value: "decisions",
    label: "Decisions",
    description:
      "Answer unresolved move questions before they affect packing, estimates, or packets.",
  },
  {
    value: "readiness",
    label: "Readiness",
    description:
      "Review packing debt and move health when you need the big picture.",
  },
  {
    value: "people",
    label: "People",
    description:
      "Manage contacts, roles, and responsibility outside the decision list.",
  },
  {
    value: "defaults",
    label: "Defaults",
    description:
      "Set reusable planning rules that steer inventory and AI suggestions.",
  },
];

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
        <MoveWorkspaceTabList tabs={overviewTabs} activeValue={activeTab} />

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
