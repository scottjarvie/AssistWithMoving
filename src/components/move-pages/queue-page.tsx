"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

import { AddToQueueButton } from "@/components/add-to-queue-button";
import { ConnectAgentOnboarding } from "@/components/connect-agent-onboarding";
import { IngestionQueueList } from "@/components/ingestion-queue-list";
import { MoveOperationsNav } from "@/components/move-operations-nav";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Button } from "@/components/ui/button";
import { moveWorkspacePath } from "@/lib/move-links";

// The move's queue tab (MOVE-311): everything the user's AI agent works on,
// reached from the move operations nav (it replaced the confusing "AI Review"
// tab). Shows queued / agent-working / processed / needs-input captures plus a
// move-scoped "Add to Queue" that targets THIS move (MOVE-312). The old
// AI-suggestion approve/reject review is demoted to a secondary link.
export function QueueWorkspacePage() {
  const { householdId, moveId } = useMoveWorkspace();

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Queue"
        description="Everything you captured for your AI agent lives here. Drop in photos, voice notes, and directions — then let your connected agent turn them into reviewed inventory."
      />
      <MoveOperationsNav />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <AddToQueueButton variant="inline" scopedToCurrentMove />
        <Button asChild variant="ghost" size="sm">
          <Link href={moveWorkspacePath(moveId ?? "", "ai-review")}>
            <Sparkles aria-hidden="true" />
            Review AI suggestions
          </Link>
        </Button>
      </div>

      <ConnectAgentOnboarding householdId={householdId} />
      <IngestionQueueList householdId={householdId} moveId={moveId} />
    </div>
  );
}
