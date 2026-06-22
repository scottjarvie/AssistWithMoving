"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Inbox, PackageCheck, Plus } from "lucide-react";

import { CaptureMoveSwitcher } from "@/components/capture-move-switcher";
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

// Mobile add entry point. Rendered as the last cell of the bottom bar (a big
// green "+", not a floating FAB), it opens a bottom sheet with the three add
// choices. "Add to Queue" is the highlighted default for the active move.
export function MobileCaptureAction() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const { householdId, moveId } = useMoveWorkspace();
  const hasActiveMove = Boolean(householdId && moveId);

  function openCapture() {
    setMenuOpen(false);
    if (!hasActiveMove) {
      router.push("/app/moves");
      return;
    }
    setCaptureOpen(true);
  }

  function goToMovableUnits() {
    setMenuOpen(false);
    router.push(moveId ? "/app/movable-units" : "/app/moves");
  }

  function goToItems() {
    setMenuOpen(false);
    router.push(moveId ? "/app/items" : "/app/moves");
  }

  return (
    <>
      <button
        type="button"
        aria-label="Add"
        onClick={() => setMenuOpen(true)}
        className="flex h-14 w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 bg-primary text-[11px] font-semibold text-primary-foreground"
      >
        <Plus className="size-7" strokeWidth={2.75} aria-hidden="true" />
        Add
      </button>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="bottom"
          className="pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        >
          <SheetHeader>
            <SheetTitle>Add</SheetTitle>
            <SheetDescription>
              Drop it in the queue for your AI agent, or add a movable unit or
              item by hand.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-2 px-4 pb-2">
            <Button type="button" size="lg" onClick={openCapture}>
              <Inbox aria-hidden="true" />
              Add to Queue
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={goToMovableUnits}
            >
              <PackageCheck aria-hidden="true" />
              Manually Add Movable Unit
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={goToItems}
            >
              <ClipboardList aria-hidden="true" />
              Manually Add Item
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={captureOpen} onOpenChange={setCaptureOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        >
          <SheetHeader>
            <SheetTitle>Add to Queue</SheetTitle>
            <SheetDescription>
              Photos, voice notes, and directions for your connected agent.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-4">
            {hasActiveMove ? (
              <>
                <CaptureMoveSwitcher />
                <IngestionCaptureForm
                  householdId={householdId}
                  moveId={moveId}
                />
              </>
            ) : (
              <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                Select or create a move first.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
