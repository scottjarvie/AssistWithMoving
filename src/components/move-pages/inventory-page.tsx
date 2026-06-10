"use client";

import { DispositionPipelinePanel } from "@/components/disposition-pipeline-panel";
import { EstimateSummary } from "@/components/estimate-summary";
import { InventoryDuplicateReview } from "@/components/inventory-duplicate-review";
import { InventoryTable } from "@/components/inventory-table";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { RoomWalkIntake } from "@/components/room-walk-intake";
import { useMoveWorkspace } from "@/components/move-workspace-context";

export function InventoryWorkspacePage() {
  const { householdId, moveId } = useMoveWorkspace();

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Inventory"
        description="Every item you own, where it is, and what is happening to it: keep, sell, donate, dump, store, or move."
      />
      <RoomWalkIntake householdId={householdId} moveId={moveId} />
      <section id="inventory">
        <InventoryTable householdId={householdId} moveId={moveId} />
      </section>
      <InventoryDuplicateReview householdId={householdId} moveId={moveId} />
      <DispositionPipelinePanel householdId={householdId} moveId={moveId} />
      <EstimateSummary householdId={householdId} moveId={moveId} />
    </div>
  );
}
