"use client";

import { useState } from "react";
import Link from "next/link";
import { Camera, Plus } from "lucide-react";

import { IngestionCaptureForm } from "@/components/ingestion-capture-form";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

  return (
    <>
      {variant === "sidebar" ? (
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={() => setOpen(true)}
        >
          <Camera aria-hidden="true" />
          Add to Queue
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          className={cn("hidden", variant === "compact" && "sm:inline-flex")}
          onClick={() => setOpen(true)}
        >
          <Camera aria-hidden="true" />
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
          <div className="px-4 pb-4">
            {hasActiveMove ? (
              <IngestionCaptureForm householdId={householdId} moveId={moveId} />
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
    <div className="grid grid-cols-2 gap-2">
      <Button
        asChild
        size="sm"
        variant="ghost"
        disabled={!moveId}
        aria-disabled={!moveId}
      >
        <Link href={movableUnitsHref}>
          <Plus aria-hidden="true" />
          Movable Unit
        </Link>
      </Button>
      <Button
        asChild
        size="sm"
        variant="ghost"
        disabled={!moveId}
        aria-disabled={!moveId}
      >
        <Link href={itemsHref}>
          <Plus aria-hidden="true" />
          Item
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
