"use client";

import { DispositionPipelinePanel } from "@/components/disposition-pipeline-panel";
import { EstimateSummary } from "@/components/estimate-summary";
import { InventoryDuplicateReview } from "@/components/inventory-duplicate-review";
import { InventoryTable } from "@/components/inventory-table";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { PlannedItemsPanel } from "@/components/planned-items-panel";
import { RoomWalkIntake } from "@/components/room-walk-intake";
import { MoveWorkspaceTabList } from "@/components/move-workspace-tab-list";
import { WorkspaceSubNav } from "@/components/workspace-sub-nav";
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

const inventoryWorkspaceTabs = [
  {
    value: "items",
    label: "Items",
    description:
      "Browse and edit owned inventory records before branching into review work.",
  },
  {
    value: "capture",
    label: "Capture",
    description:
      "Walk a room, add rough notes, and build inventory without a long form.",
  },
  {
    value: "planned",
    label: "Planned",
    description:
      "Track future purchases separately from inventory you already own.",
  },
  {
    value: "duplicates",
    label: "Duplicates",
    description:
      "Review likely duplicate records before reports and packets depend on them.",
  },
  {
    value: "disposition",
    label: "Disposition",
    description:
      "Work sale, donation, dump, storage, and giveaway queues after item decisions.",
  },
  {
    value: "estimates",
    label: "Estimates",
    description:
      "Check weight, volume, capacity, and estimate assumptions only when needed.",
  },
];

export function InventoryWorkspacePage() {
  const { householdId, moveId } = useMoveWorkspace();
  const [activeTab, setActiveTab] = useHashTab("items", inventoryTabHashes);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Inventory"
        description="Browse item records, capture by room, and review disposition or estimate work."
      />
      <WorkspaceSubNav parent="items" />
      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
        <MoveWorkspaceTabList
          tabs={inventoryWorkspaceTabs}
          activeValue={activeTab}
          ariaLabel="Inventory workspace tasks"
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
