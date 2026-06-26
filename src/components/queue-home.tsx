"use client";

import Link from "next/link";

import { AddToQueueButton } from "@/components/add-to-queue-button";
import { ConnectAgentOnboarding } from "@/components/connect-agent-onboarding";
import { IngestionQueueList } from "@/components/ingestion-queue-list";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Top-level Queue surface (the fourth global destination). Shows the active
// move's agent queue with a To-do / Done toggle, an inline Add to Queue action,
// and the connect-your-agent push. Mirrors the Movable Units / Items global
// pages: scoped to the selected move, with a friendly prompt when none is set.
export function QueueHome() {
  const { householdId, moveId, selectedMove, loadingMoves } =
    useMoveWorkspace();

  if (loadingMoves) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-44 rounded-md" />
      </div>
    );
  }

  if (!moveId) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No active move</CardTitle>
            <CardDescription>
              Select or create a move to see its capture queue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm">
              <Link href="/app/moves">Go to moves</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Workspace
          </p>
          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl">
            Queue
            {selectedMove ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {selectedMove.title}
              </span>
            ) : null}
          </h1>
        </div>
        {/* On mobile the bottom-bar "+ Add" (MobileCaptureAction) is the single
            Add-to-Queue entry point, so hide this in-page button there to avoid
            two queue buttons. Desktop has no bottom bar, so keep it on xl+. */}
        <div className="hidden xl:block">
          <AddToQueueButton variant="inline" />
        </div>
      </header>

      <ConnectAgentOnboarding householdId={householdId} />
      <IngestionQueueList
        householdId={householdId}
        moveId={moveId}
        view="todo-done"
      />
    </div>
  );
}
