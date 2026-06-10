"use client";

import { IngestionCaptureForm } from "@/components/ingestion-capture-form";
import { IngestionQueueList } from "@/components/ingestion-queue-list";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { useMoveWorkspace } from "@/components/move-workspace-context";

export function CaptureWorkspacePage() {
  const { householdId, moveId } = useMoveWorkspace();

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Capture"
        description="Walk the house with your phone: photos, voice notes, and directions go into a queue your own AI agent works through later."
      />
      <IngestionCaptureForm householdId={householdId} moveId={moveId} />
      <IngestionQueueList householdId={householdId} moveId={moveId} />
    </div>
  );
}
