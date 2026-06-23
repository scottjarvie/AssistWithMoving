"use client";

import { MoveDayView } from "@/components/move-day-view";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { useMoveWorkspace } from "@/components/move-workspace-context";

export function MoveDayWorkspacePage() {
  const { householdId, moveId } = useMoveWorkspace();

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Move Day"
        description="The load-crew view: scan box codes, mark sealed/staged/loaded/delivered, and flag exceptions as they happen."
      />
      <MoveDayView householdId={householdId} moveId={moveId} />
    </div>
  );
}
