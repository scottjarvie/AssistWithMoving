"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import {
  ArchiveRestore,
  EllipsisVertical,
  Loader2,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type ManagedMove = {
  _id: Id<"moves">;
  title: string;
  status: string;
  type: string;
  origin?: string;
  destination?: string;
};

// Kebab menu on an active move card: the everyday, reversible "remove" archives
// the move (it can be restored from the archived list).
export function ActiveMoveMenu({
  householdId,
  move,
}: {
  householdId: Id<"households">;
  move: ManagedMove;
}) {
  const archive = useMutation(api.moves.archive);
  const [busy, setBusy] = useState(false);

  async function handleArchive() {
    setBusy(true);
    try {
      await archive({ householdId, moveId: move._id });
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label={`Manage ${move.title}`}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <EllipsisVertical aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void handleArchive()}>
          <ArchiveRestore aria-hidden="true" />
          Remove (archive)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Archived moves stay recoverable. Owners additionally get a guarded permanent
// delete that erases the move and every linked record.
export function ArchivedMovesSection({
  householdId,
  moves,
  canPurge,
}: {
  householdId: Id<"households">;
  moves: ManagedMove[];
  canPurge: boolean;
}) {
  const unarchive = useMutation(api.moves.unarchive);
  const [busyId, setBusyId] = useState<Id<"moves"> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedMove | null>(null);

  if (!moves.length) {
    return null;
  }

  async function handleRestore(moveId: Id<"moves">) {
    setBusyId(moveId);
    try {
      await unarchive({ householdId, moveId });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-2" aria-label="Archived moves">
      <h2 className="text-sm font-semibold text-muted-foreground">
        Archived ({moves.length})
      </h2>
      <ul className="space-y-2" role="list">
        {moves.map((move) => {
          const route = [move.origin, move.destination]
            .filter(Boolean)
            .join(" → ");
          return (
            <li
              key={move._id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border bg-muted/20 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{move.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {route || "Route not set"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={busyId === move._id}
                  onClick={() => void handleRestore(move._id)}
                >
                  {busyId === move._id ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <RotateCcw aria-hidden="true" />
                  )}
                  Restore
                </Button>
                {canPurge ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="h-8"
                    onClick={() => setDeleteTarget(move)}
                  >
                    <Trash2 aria-hidden="true" />
                    Delete
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <PermanentDeleteSheet
        householdId={householdId}
        move={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </section>
  );
}

function PermanentDeleteSheet({
  householdId,
  move,
  onClose,
}: {
  householdId: Id<"households">;
  move: ManagedMove | null;
  onClose: () => void;
}) {
  const purge = useMutation(api.moves.purge);
  const [confirmText, setConfirmText] = useState("");
  const [recordCount, setRecordCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = Boolean(move);

  // Pull the record count once the sheet opens so the warning is concrete.
  async function loadPreview(target: ManagedMove) {
    setPreviewing(true);
    setError(null);
    try {
      const result = await purge({
        householdId,
        moveId: target._id,
        confirmTitle: "",
        dryRun: true,
      });
      setRecordCount(result.deletedRecordCount);
    } catch {
      setRecordCount(null);
    } finally {
      setPreviewing(false);
    }
  }

  function reset() {
    setConfirmText("");
    setRecordCount(null);
    setError(null);
  }

  async function handleDelete() {
    if (!move) return;
    setDeleting(true);
    setError(null);
    try {
      await purge({
        householdId,
        moveId: move._id,
        confirmTitle: confirmText.trim(),
      });
      onClose();
      reset();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not delete the move.",
      );
    } finally {
      setDeleting(false);
    }
  }

  const confirmed = move ? confirmText.trim() === move.title.trim() : false;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next && move) {
          void loadPreview(move);
        } else {
          onClose();
          reset();
        }
      }}
    >
      <SheetContent side="bottom" className="gap-4">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlert className="size-4" aria-hidden="true" />
            Permanently delete this move?
          </SheetTitle>
          <SheetDescription>
            {move ? (
              <>
                This erases <span className="font-medium">{move.title}</span> and{" "}
                {previewing || recordCount === null
                  ? "all of its linked"
                  : `all ${recordCount.toLocaleString()} of its linked`}{" "}
                records — items, boxes, photos, plans, and queue entries. This
                cannot be undone.
              </>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2 px-4">
          <label
            htmlFor="confirm-move-title"
            className="text-xs font-medium text-muted-foreground"
          >
            Type{" "}
            <span className="font-semibold text-foreground">{move?.title}</span>{" "}
            to confirm
          </label>
          <Input
            id="confirm-move-title"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder={move?.title}
            autoComplete="off"
            aria-label="Confirm move title"
          />
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Badge variant="outline" className="text-destructive">
            Irreversible
          </Badge>
        </div>

        <SheetFooter className="flex-row justify-end gap-2">
          <SheetClose asChild>
            <Button type="button" variant="outline" size="sm">
              Cancel
            </Button>
          </SheetClose>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!confirmed || deleting}
            onClick={() => void handleDelete()}
          >
            {deleting ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 aria-hidden="true" />
            )}
            Delete forever
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
