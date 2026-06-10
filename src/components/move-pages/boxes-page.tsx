"use client";

import { BoxManager } from "@/components/box-manager";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { useMoveWorkspace } from "@/components/move-workspace-context";

export function BoxesWorkspacePage() {
  const { householdId, moveId } = useMoveWorkspace();

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Boxes"
        description="Boxes and bins with trackable codes — what is inside each one, its weight, and printable labels."
      />
      <BoxManager householdId={householdId} moveId={moveId} />
    </div>
  );
}
