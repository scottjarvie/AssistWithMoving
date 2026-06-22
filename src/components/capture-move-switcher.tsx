"use client";

import { useMoveWorkspace } from "@/components/move-workspace-context";
import type { Id } from "../../convex/_generated/dataModel";

// Header of every capture sheet: "Add to move:" plus a switcher so the user can
// retarget the queue entry to a different active move without leaving the sheet.
// Queue entries are move-scoped, so this is the move the capture lands in. Uses a
// native <select> on purpose — the OS picker is the most reliable control on a
// phone, which is where most quick captures happen.
export function CaptureMoveSwitcher() {
  const { activeMoves, moveId, selectMove } = useMoveWorkspace();

  if (activeMoves.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card/40 px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Add to move
      </span>
      {activeMoves.length > 1 ? (
        <select
          aria-label="Choose which move to add to"
          value={moveId ?? ""}
          onChange={(event) => selectMove(event.target.value as Id<"moves">)}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm font-medium text-foreground sm:min-w-48 sm:flex-none"
        >
          {activeMoves.map((move) => (
            <option key={move._id} value={move._id}>
              {move.title}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-sm font-semibold text-foreground">
          {activeMoves[0]?.title}
        </span>
      )}
    </div>
  );
}
