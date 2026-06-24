"use client";

import { CheckCircle2, ListTodo, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { MoveWorkspaceValue } from "@/components/move-workspace-context";

type ActiveMoves = MoveWorkspaceValue["activeMoves"];

// A light, informational strip of metric chips. Explicitly NOT load-bearing:
// the whole component can be removed without affecting any flow.
//
// v1 derives counts client-side from the moves already loaded in the workspace.
// Box / movable-unit / items-by-disposition counts need data the move records
// don't carry, so they are intentionally omitted here.
// TODO: swap to api.moves.homeStats({ householdId }) for box/movable-unit/
// items-by-disposition counts once that query exists.
export function MovesStatsStrip({ activeMoves }: { activeMoves: ActiveMoves }) {
  if (!activeMoves.length) {
    return null;
  }

  const completed = activeMoves.filter(
    (move) => move.status === "completed"
  ).length;
  const planning = activeMoves.filter(
    (move) => move.status === "planning"
  ).length;

  const chips: Array<{ label: string; value: number; icon: LucideIcon }> = [
    { label: "Open moves", value: activeMoves.length, icon: Truck },
    { label: "In planning", value: planning, icon: ListTodo },
    { label: "Completed", value: completed, icon: CheckCircle2 },
  ];

  return (
    <div
      className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
      aria-label="Move stats"
    >
      {chips.map(({ label, value, icon: Icon }) => (
        <div
          key={label}
          className="flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-2 text-sm sm:min-w-[8rem]"
        >
          <Icon className="size-4 text-primary" aria-hidden="true" />
          <span className="font-mono text-base font-semibold">{value}</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}
