"use client";

import { MovePeopleManager } from "@/components/move-people-manager";
import { MoveQuestionsPanel } from "@/components/move-questions-panel";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { PackingDebtDashboard } from "@/components/packing-debt-dashboard";
import { PlanningDefaultsPanel } from "@/components/planning-defaults-panel";
import { useMoveWorkspace } from "@/components/move-workspace-context";

export function MoveOverviewPage() {
  const { householdId, moveId, selectedMove } = useMoveWorkspace();

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title={selectedMove?.title ?? "Move overview"}
        description="What still needs a decision, who is involved, and the defaults that steer packing, packets, and AI suggestions."
      />
      <MoveQuestionsPanel householdId={householdId} moveId={moveId} />
      <PackingDebtDashboard householdId={householdId} moveId={moveId} />
      <MovePeopleManager householdId={householdId} moveId={moveId} />
      <PlanningDefaultsPanel householdId={householdId} moveId={moveId} />
    </div>
  );
}
