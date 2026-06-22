"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { moveWorkspacePath } from "@/lib/move-links";

// Top-bar switcher between active moves. Selecting a move both records the
// selection in the provider and navigates to it, so the URL stays the source of
// truth for the active move.
export function MoveSwitcher() {
  const router = useRouter();
  const { activeMoves, moveId, selectedMove, selectMove } = useMoveWorkspace();

  if (!activeMoves.length) {
    return null;
  }

  const label = selectedMove?.title ?? "Select a move";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-w-[14rem] justify-between gap-2"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Active moves</DropdownMenuLabel>
        {activeMoves.map((move) => (
          <DropdownMenuItem
            key={move._id}
            onSelect={() => {
              selectMove(move._id);
              router.push(moveWorkspacePath(move._id));
            }}
          >
            <span className="min-w-0 flex-1 truncate">{move.title}</span>
            {move._id === moveId ? (
              <Check className="ml-auto" aria-hidden="true" />
            ) : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/app/moves")}>
          <Plus aria-hidden="true" />
          New move
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
