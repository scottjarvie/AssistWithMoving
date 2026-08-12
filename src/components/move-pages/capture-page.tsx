"use client";

import { AddToQueueButton } from "@/components/add-to-queue-button";
import { IngestionQueueList } from "@/components/ingestion-queue-list";
import { MoveOperationsNav } from "@/components/move-operations-nav";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { useMoveWorkspace } from "@/components/move-workspace-context";

// Capture keeps its specialized evidence and review actions. The canonical
// Queue links here from adapted capture cards instead of flattening or hiding
// domain-specific upload, review, resolve, requeue, and discard behavior.
export function CaptureWorkspacePage() {
  const { householdId, moveId } = useMoveWorkspace();

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Capture workspace"
        description="Inspect the photos, notes, upload state, and proposed records behind captured handoffs. These capture details stay specialized here while Queue provides the shared four-state handoff view."
      />
      <MoveOperationsNav />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AddToQueueButton variant="inline" scopedToCurrentMove />
      </div>
      <IngestionQueueList householdId={householdId} moveId={moveId} />
    </div>
  );
}
