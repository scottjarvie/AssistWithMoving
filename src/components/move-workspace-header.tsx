"use client";

import { usePathname, useRouter } from "next/navigation";

import type { Id } from "../../convex/_generated/dataModel";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Badge } from "@/components/ui/badge";

// Shared header for every move workspace page: names the section, shows the
// move's route, and lets the user switch moves while staying on this section.
export function MoveWorkspaceHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeMoves, moveId, selectMove, selectedMove, moveLinkMessage } =
    useMoveWorkspace();

  function handleMoveChange(nextMoveId: Id<"moves">) {
    selectMove(nextMoveId);
    router.replace(
      pathname.replace(
        /\/app\/moves\/[^/]+/,
        `/app/moves/${encodeURIComponent(nextMoveId)}`
      )
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
          {selectedMove ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{selectedMove.type}</Badge>
              <span>
                {[selectedMove.origin, selectedMove.destination]
                  .filter(Boolean)
                  .join(" -> ") || "route not set"}
              </span>
            </div>
          ) : null}
        </div>
        {activeMoves.length > 1 ? (
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={moveId ?? ""}
            aria-label="Selected move"
            onChange={(event) =>
              handleMoveChange(event.target.value as Id<"moves">)
            }
          >
            {activeMoves.map((move) => (
              <option key={move._id} value={move._id}>
                {move.title}
              </option>
            ))}
          </select>
        ) : selectedMove ? (
          <Badge variant="secondary">{selectedMove.title}</Badge>
        ) : null}
      </div>
      {moveLinkMessage ? (
        <p className="mt-3 text-xs text-muted-foreground" role="status">
          {moveLinkMessage}
        </p>
      ) : null}
    </section>
  );
}
