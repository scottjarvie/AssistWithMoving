"use client";

import { EvidenceDensityPanel } from "@/components/evidence-density-panel";
import { MoveWorkspaceTabList } from "@/components/move-workspace-tab-list";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import {
  PhotoEvidenceGapsPanel,
  PhotoReviewWorkspace,
  PhotoRoomSweepPanel,
} from "@/components/photo-review-workspace";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useHashTab } from "@/components/use-hash-tab";

const photoTabHashes = {
  "#evidence-density": "coverage",
  "#photos": "review",
} as const;

export function PhotosWorkspacePage() {
  const { householdId, moveId } = useMoveWorkspace();
  const [activeTab, setActiveTab] = useHashTab("review", photoTabHashes);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Photos"
        description="Photo evidence for items, boxes, and rooms — originals stay private, and claim-readiness is scored as you go."
      />
      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
        <MoveWorkspaceTabList
          tabs={[
            { value: "review", label: "Review" },
            { value: "upload", label: "Add photos" },
            { value: "gaps", label: "Gaps" },
            { value: "coverage", label: "Coverage" },
          ]}
        />

        <TabsContent value="review">
          <PhotoReviewWorkspace householdId={householdId} moveId={moveId} />
        </TabsContent>
        <TabsContent value="upload">
          <PhotoRoomSweepPanel householdId={householdId} moveId={moveId} />
        </TabsContent>
        <TabsContent value="gaps">
          <PhotoEvidenceGapsPanel householdId={householdId} moveId={moveId} />
        </TabsContent>
        <TabsContent value="coverage">
          <EvidenceDensityPanel householdId={householdId} moveId={moveId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
