"use client";

import { ConnectAgentOnboarding } from "@/components/connect-agent-onboarding";
import { IngestionQueueList } from "@/components/ingestion-queue-list";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { useMoveWorkspace } from "@/components/move-workspace-context";

// The queue surface: the home for everything the user's AI agent works on.
// Capture itself now lives in the always-visible "Add to Queue" Sheet (rendered
// by the shell), so this page focuses on SEEING the queue — queued, agent-
// working, processed, and needs-input captures — plus the connect-your-agent
// onboarding push above it. Reached via the move workspace at
// /app/moves/[moveId]/queue.
export function QueueWorkspacePage() {
  const { householdId, moveId } = useMoveWorkspace();

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Queue"
        description="Everything you captured for your AI agent lives here. Use the Add to Queue button anytime to drop in photos, voice notes, and directions — then let your connected agent turn them into reviewed inventory."
      />
      <ConnectAgentOnboarding householdId={householdId} />
      <IngestionQueueList householdId={householdId} moveId={moveId} />
    </div>
  );
}
