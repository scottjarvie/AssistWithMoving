"use client";

import { EvidenceDensityPanel } from "@/components/evidence-density-panel";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { PhotoReviewWorkspace } from "@/components/photo-review-workspace";
import { useMoveWorkspace } from "@/components/move-workspace-context";

export function PhotosWorkspacePage() {
  const { householdId, moveId } = useMoveWorkspace();

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Photos"
        description="Photo evidence for items, boxes, and rooms — originals stay private, and claim-readiness is scored as you go."
      />
      <PhotoReviewWorkspace householdId={householdId} moveId={moveId} />
      <EvidenceDensityPanel householdId={householdId} moveId={moveId} />
    </div>
  );
}
