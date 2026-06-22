"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  ArrowUpRight,
  ClipboardList,
  Inbox,
  ListChecks,
  PackageCheck,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import { IngestionCaptureForm } from "@/components/ingestion-capture-form";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { moveWorkspacePath } from "@/lib/move-links";
import { cn } from "@/lib/utils";

// The hero capture action. The big sidebar variant is the visual focus of the
// sidebar; the compact variant sits in the top bar. Both open the same capture
// sheet, which targets the active move. With no active move the sheet prompts
// the user to pick or create one first — queue entries are move-scoped.
export function AddToQueueButton({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "compact";
}) {
  const [open, setOpen] = useState(false);
  const { householdId, moveId, selectedMove } = useMoveWorkspace();
  const hasActiveMove = Boolean(householdId && moveId);

  // Live queue size so the always-visible capture surface doubles as the way to
  // reach the queue — no fourth top-level nav item needed. Only subscribed
  // while the Sheet is open to keep idle pages quiet.
  const entries = useQuery(
    api.ingestionQueue.listForMove,
    open && householdId && moveId ? { householdId, moveId } : "skip",
  );
  const activeQueueCount = entries
    ? entries.filter(
        (entry) =>
          entry.status === "queued" ||
          entry.status === "claimed" ||
          entry.status === "processed" ||
          entry.status === "needsInput",
      ).length
    : null;
  const queueHref = moveId ? moveWorkspacePath(moveId, "queue") : "/app/moves";

  return (
    <>
      {variant === "sidebar" ? (
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={() => setOpen(true)}
        >
          <Inbox aria-hidden="true" />
          Add to Queue
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          className={cn("hidden", variant === "compact" && "sm:inline-flex")}
          onClick={() => setOpen(true)}
        >
          <Inbox aria-hidden="true" />
          Add to Queue
        </Button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Add to Queue</SheetTitle>
            <SheetDescription>
              {hasActiveMove
                ? selectedMove
                  ? `Capturing for ${selectedMove.title}.`
                  : "Capturing for the active move."
                : "Pick or create a move before capturing — queue entries belong to a move."}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-4">
            {hasActiveMove ? (
              <>
                <Button
                  asChild
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => setOpen(false)}
                >
                  <Link href={queueHref}>
                    <span className="flex items-center gap-2">
                      <ListChecks aria-hidden="true" />
                      View the queue
                      {activeQueueCount ? (
                        <Badge variant="secondary">{activeQueueCount}</Badge>
                      ) : null}
                    </span>
                    <ArrowUpRight aria-hidden="true" />
                  </Link>
                </Button>
                <IngestionCaptureForm
                  householdId={householdId}
                  moveId={moveId}
                />
              </>
            ) : (
              <NoActiveMovePrompt onNavigate={() => setOpen(false)} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function AddToQueueSidebarSecondaryActions() {
  const { moveId } = useMoveWorkspace();
  const movableUnitsHref = "/app/movable-units";
  const itemsHref = "/app/items";

  return (
    <div className="grid gap-2">
      <Button
        asChild
        size="sm"
        variant="ghost"
        className="justify-start"
        disabled={!moveId}
        aria-disabled={!moveId}
      >
        <Link href={movableUnitsHref}>
          <PackageCheck aria-hidden="true" />
          Manually Add Movable Unit
        </Link>
      </Button>
      <Button
        asChild
        size="sm"
        variant="ghost"
        className="justify-start"
        disabled={!moveId}
        aria-disabled={!moveId}
      >
        <Link href={itemsHref}>
          <ClipboardList aria-hidden="true" />
          Manually Add Item
        </Link>
      </Button>
    </div>
  );
}

function NoActiveMovePrompt({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="space-y-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
      <p>
        Captures attach to a move. Select an existing move or create your first
        one, then come back to add photos, voice notes, and directions for your
        agent.
      </p>
      <Button asChild size="sm" onClick={onNavigate}>
        <Link href="/app/moves">Go to moves</Link>
      </Button>
    </div>
  );
}
