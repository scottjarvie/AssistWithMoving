"use client";

import { AiJobMonitor } from "@/components/ai-job-monitor";
import { AiPhotoIntake } from "@/components/ai-photo-intake";
import { AiReviewQueue } from "@/components/ai-review-queue";
import { AiTextIntake } from "@/components/ai-text-intake";
import { FeatureUnavailable } from "@/components/feature-unavailable";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { flagEnabled } from "@/lib/feature-flags";

export function AiReviewWorkspacePage() {
  const { householdId, moveId, featureFlags } = useMoveWorkspace();
  const aiPhotoIntakeEnabled = flagEnabled(featureFlags, "aiPhotoIntake", true);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="AI Review"
        description="AI suggestions stay suggestions until you approve them here — text intake, photo intake, and the review queue."
      />
      <AiTextIntake householdId={householdId} moveId={moveId} />
      {aiPhotoIntakeEnabled ? (
        <AiPhotoIntake householdId={householdId} moveId={moveId} />
      ) : (
        <FeatureUnavailable
          title="AI photo intake disabled"
          description="Photo-based AI suggestions are currently hidden by rollout controls. Existing photo review remains available."
        />
      )}
      <AiReviewQueue householdId={householdId} moveId={moveId} />
      <AiJobMonitor householdId={householdId} moveId={moveId} />
    </div>
  );
}
