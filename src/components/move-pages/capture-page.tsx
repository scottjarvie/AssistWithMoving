"use client";

import { IngestionCaptureForm } from "@/components/ingestion-capture-form";
import { IngestionQueueList } from "@/components/ingestion-queue-list";
import { MoveWorkspaceTabList } from "@/components/move-workspace-tab-list";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useHashTab } from "@/components/use-hash-tab";

const captureTabHashes = {
  "#capture": "capture",
  "#capture-queue": "queue",
  "#ingestion-queue": "queue",
} as const;

const captureTabs = [
  {
    value: "capture",
    label: "Capture",
    description:
      "Add rough notes, photos, and room observations without opening the review queue.",
  },
  {
    value: "queue",
    label: "Queue",
    description:
      "Review captured inputs after they are saved or ready for cleanup.",
  },
];

export function CaptureWorkspacePage() {
  const { householdId, moveId } = useMoveWorkspace();
  const [activeTab, setActiveTab] = useHashTab("capture", captureTabHashes);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Capture"
        description="Walk the house with your phone: photos, voice notes, and directions go into a queue your own AI agent works through later."
      />
      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
        <MoveWorkspaceTabList tabs={captureTabs} activeValue={activeTab} />

        <TabsContent value="capture">
          <IngestionCaptureForm householdId={householdId} moveId={moveId} />
        </TabsContent>
        <TabsContent value="queue">
          <IngestionQueueList householdId={householdId} moveId={moveId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
