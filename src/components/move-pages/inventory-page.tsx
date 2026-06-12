"use client";

import { DispositionPipelinePanel } from "@/components/disposition-pipeline-panel";
import { EstimateSummary } from "@/components/estimate-summary";
import { InventoryDuplicateReview } from "@/components/inventory-duplicate-review";
import { InventoryTable } from "@/components/inventory-table";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { PlannedItemsPanel } from "@/components/planned-items-panel";
import { RoomWalkIntake } from "@/components/room-walk-intake";
import { MoveWorkspaceTabList } from "@/components/move-workspace-tab-list";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useHashTab } from "@/components/use-hash-tab";

const inventoryTabHashes = {
  "#disposition-pipelines": "disposition",
  "#inventory": "items",
} as const;

export function InventoryWorkspacePage() {
  const { householdId, moveId } = useMoveWorkspace();
  const [activeTab, setActiveTab] = useHashTab("items", inventoryTabHashes);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Inventory"
        description="Every item you own, where it is, and what is happening to it: keep, sell, donate, dump, store, or move."
      />
      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
        <MoveWorkspaceTabList
          tabs={[
            { value: "items", label: "Items" },
            { value: "capture", label: "Capture" },
            { value: "planned", label: "Planned" },
            { value: "review", label: "Review" },
            { value: "disposition", label: "Disposition" },
            { value: "estimates", label: "Estimates" },
          ]}
        />

        <TabsContent value="items" id="inventory">
          <InventoryTable householdId={householdId} moveId={moveId} />
        </TabsContent>
        <TabsContent value="capture" className="space-y-4">
          <RoomWalkIntake householdId={householdId} moveId={moveId} />
        </TabsContent>
        <TabsContent value="planned">
          <PlannedItemsPanel householdId={householdId} moveId={moveId} />
        </TabsContent>
        <TabsContent value="review">
          <InventoryDuplicateReview householdId={householdId} moveId={moveId} />
        </TabsContent>
        <TabsContent value="disposition">
          <DispositionPipelinePanel householdId={householdId} moveId={moveId} />
        </TabsContent>
        <TabsContent value="estimates">
          <EstimateSummary householdId={householdId} moveId={moveId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
