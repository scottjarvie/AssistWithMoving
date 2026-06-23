"use client";

import { BoxManager } from "@/components/box-manager";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { WorkspaceSubNav } from "@/components/workspace-sub-nav";
import { useMoveWorkspace } from "@/components/move-workspace-context";

export function BoxesWorkspacePage() {
  const { householdId, moveId } = useMoveWorkspace();

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Boxes"
        description="Boxes and bins with trackable codes — what is inside each one, its weight, and printable labels."
      />
      <WorkspaceSubNav parent="boxes" />
      <BoxManager householdId={householdId} moveId={moveId} />
    </div>
  );
}
