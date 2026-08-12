"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

import { AddToQueueButton } from "@/components/add-to-queue-button";
import { MoveOperationsNav } from "@/components/move-operations-nav";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { QueueExperience } from "@/components/queue-experience-data";
import { Button } from "@/components/ui/button";
import { moveWorkspacePath } from "@/lib/move-links";

// Move-scoped Queue: the same durable handoff desk as the global Queue route,
// with the selected move's operational navigation around it.
export function QueueWorkspacePage() {
  const { householdId, moveId } = useMoveWorkspace();

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Queue"
        description="Leave durable route notes for your chosen AI, answer the exact questions that block it, and keep results attached to this move. Saving a handoff does not start an autonomous runner."
      />
      <MoveOperationsNav />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <AddToQueueButton variant="inline" scopedToCurrentMove />
        {moveId ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={moveWorkspacePath(moveId, "ai-review")}>
              <Sparkles aria-hidden="true" />
              Review AI suggestions
            </Link>
          </Button>
        ) : null}
      </div>

      {householdId && moveId ? (
        <QueueExperience
          key={`${householdId}:${moveId}`}
          householdId={householdId}
          moveId={moveId}
        />
      ) : null}
    </div>
  );
}
