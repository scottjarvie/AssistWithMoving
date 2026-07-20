"use client";

import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { buildMoveSwitchTarget } from "@/lib/move-links";

// Top-bar switcher between active moves. Selecting a move records the selection
// in the provider and KEEPS the user on their current section: on a per-move
// route it swaps the move id segment; on a global surface (Items, Movable Units,
// Spaces & Transport) it just updates context and the page re-renders in place.
// Previously it always jumped to the move summary root, throwing away the page
// the user was on.
export function MoveSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { activeMoves, moveId, selectedMove, selectMove } = useMoveWorkspace();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const visibleMoves = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("en-US");
    if (!query) {
      return activeMoves;
    }

    return activeMoves.filter((move) =>
      [move.title, move.origin, move.destination]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase("en-US").includes(query)),
    );
  }, [activeMoves, search]);

  if (!activeMoves.length) {
    return null;
  }

  const label = selectedMove?.title ?? "Select a move";

  function closePicker() {
    setOpen(false);
    setSearch("");
  }

  function switchMove(nextMoveId: (typeof activeMoves)[number]["_id"]) {
    selectMove(nextMoveId);
    const target = buildMoveSwitchTarget(pathname, nextMoveId);
    if (target) {
      router.replace(target);
    }
    closePicker();
  }

  function focusMoveOption(
    event: KeyboardEvent<HTMLButtonElement>,
    direction: "next" | "previous" | "first" | "last",
  ) {
    const options = Array.from(
      contentRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-move-option]",
      ) ?? [],
    );
    const currentIndex = options.indexOf(event.currentTarget);
    const nextIndex =
      direction === "first"
        ? 0
        : direction === "last"
          ? options.length - 1
          : direction === "next"
            ? (currentIndex + 1) % options.length
            : (currentIndex - 1 + options.length) % options.length;

    options[nextIndex]?.focus();
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setSearch("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          size="sm"
          className="max-w-[14rem] justify-between gap-2"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align="start"
        className="w-[min(20rem,calc(100vw-2rem))] p-2"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(() => searchRef.current?.focus());
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          Search active moves
          <Input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, origin, or destination"
            aria-label="Search active moves"
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                contentRef.current
                  ?.querySelector<HTMLButtonElement>("[data-move-option]")
                  ?.focus();
              }
            }}
          />
        </label>
        <p className="px-1 py-2 text-xs text-muted-foreground" role="status">
          {search.trim()
            ? `${visibleMoves.length} of ${activeMoves.length} moves`
            : `${activeMoves.length} moves`}
        </p>
        <div
          className="max-h-72 space-y-1 overflow-y-auto overscroll-contain"
          aria-label="Active moves"
        >
          {visibleMoves.length ? (
            visibleMoves.map((move) => {
              const route = [move.origin, move.destination]
                .filter(Boolean)
                .join(" → ");

              return (
                <Button
                  key={move._id}
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start gap-2 px-2 py-2 text-left"
                  aria-label={`Switch to ${move.title}`}
                  aria-current={move._id === moveId ? "true" : undefined}
                  data-move-option
                  onClick={() => switchMove(move._id)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      focusMoveOption(event, "next");
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      focusMoveOption(event, "previous");
                    } else if (event.key === "Home") {
                      event.preventDefault();
                      focusMoveOption(event, "first");
                    } else if (event.key === "End") {
                      event.preventDefault();
                      focusMoveOption(event, "last");
                    }
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{move.title}</span>
                    {route ? (
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {route}
                      </span>
                    ) : null}
                  </span>
                  {move._id === moveId ? (
                    <Check className="ml-auto" aria-hidden="true" />
                  ) : null}
                </Button>
              );
            })
          ) : (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No active moves match this search.
            </p>
          )}
        </div>
        <div className="-mx-2 my-2 h-px bg-border" />
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start"
          onClick={() => {
            closePicker();
            router.push("/app/moves");
          }}
        >
          <Plus aria-hidden="true" />
          New move
        </Button>
      </PopoverContent>
    </Popover>
  );
}
