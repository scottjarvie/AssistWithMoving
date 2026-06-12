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
  "#add-inventory": "items",
  "#bulk-inventory": "items",
  "#bulk-paste": "items",
  "#disposition-pipelines": "disposition",
  "#estimate-assumptions": "estimates",
  "#estimate-capacity": "estimates",
  "#estimate-summary": "estimates",
  "#estimate-warnings": "estimates",
  "#inventory": "items",
  "#inventory-duplicate-review": "duplicates",
  "#inventory-records": "items",
  "#planned-items": "planned",
  "#room-walk": "capture",
} as const;

export function InventoryWorkspacePage() {
  const { householdId, moveId } = useMoveWorkspace();
  const [activeTab, setActiveTab] = useHashTab("items", inventoryTabHashes);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Inventory"
        description="Browse item records, capture by room, and review disposition or estimate work."
      />
      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
        <MoveWorkspaceTabList
          tabs={[
            { value: "items", label: "Items" },
            { value: "capture", label: "Capture" },
            { value: "planned", label: "Planned" },
            { value: "duplicates", label: "Duplicates" },
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
        <TabsContent value="duplicates">
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
