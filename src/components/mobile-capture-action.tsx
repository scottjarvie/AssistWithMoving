"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ClipboardList, PackageCheck, Plus } from "lucide-react";

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

// Mobile capture entry point: a floating action button above the bottom tab bar
// that opens a bottom sheet with the three add choices. "Add to Queue" is the
// highlighted default and opens the capture form for the active move.
export function MobileCaptureAction() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const { householdId, moveId, selectedMove } = useMoveWorkspace();
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
    <div className="xl:hidden">
      <Button
        type="button"
        size="icon-lg"
        aria-label="Add"
        onClick={() => setMenuOpen(true)}
        className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] right-4 z-30 size-14 rounded-full shadow-lg"
      >
        <Camera className="size-6" aria-hidden="true" />
      </Button>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="bottom"
          className="pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        >
          <SheetHeader>
            <SheetTitle>Add</SheetTitle>
            <SheetDescription>
              Capture into the queue for your agent, or add a movable unit or
              item by hand.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-2 px-4 pb-2">
            <Button type="button" size="lg" onClick={openCapture}>
              <Camera aria-hidden="true" />
              Add to Queue
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={goToMovableUnits}
            >
              <PackageCheck aria-hidden="true" />
              Add Movable Unit
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={goToItems}
            >
              <ClipboardList aria-hidden="true" />
              Add Item
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
              {selectedMove
                ? `Capturing for ${selectedMove.title}.`
                : "Capturing for the active move."}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            {hasActiveMove ? (
              <IngestionCaptureForm householdId={householdId} moveId={moveId} />
            ) : (
              <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                Select or create a move first.
                <Plus className="ml-1 inline size-3.5" aria-hidden="true" />
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
