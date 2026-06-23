"use client";

import { usePathname, useRouter } from "next/navigation";

import type { Id } from "../../convex/_generated/dataModel";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

  const routeLabel =
    [selectedMove?.origin, selectedMove?.destination].filter(Boolean).join(" -> ") ||
    "route not set";

  return (
    <section className="border-b border-border pb-3">
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight sm:text-2xl">
              {title}
            </h1>
            {selectedMove ? (
              <Badge variant="outline" className="shrink-0">
                {selectedMove.type}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 max-w-prose text-[0.8125rem] leading-5 text-muted-foreground sm:text-sm sm:leading-6">
            {description}
          </p>
          {selectedMove ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {selectedMove.title}
              </span>
              <span aria-hidden="true">/</span>
              <span className="break-words">{routeLabel}</span>
            </div>
          ) : null}
        </div>
        <div
          className={cn(
            "flex min-w-0 items-center gap-2",
            activeMoves.length > 1 && "lg:justify-end",
          )}
        >
          {activeMoves.length > 1 ? (
            <select
              className="h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm"
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
            <Badge variant="secondary" className="max-w-full truncate">
              active move
            </Badge>
          ) : null}
        </div>
      </div>
      {moveLinkMessage ? (
        <p className="mt-3 text-xs text-muted-foreground" role="status">
          {moveLinkMessage}
        </p>
      ) : null}
    </section>
  );
}
