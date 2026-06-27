"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  ClipboardList,
  Inbox,
  PackageCheck,
  Plus,
  Sparkles,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Button } from "@/components/ui/button";
import { globalNavItems, type GlobalNavItem } from "@/lib/workspace-nav-items";
import { cn } from "@/lib/utils";

// The logged-in home is a focused launchpad: the main destinations, the
// intake Queue, and a standing "connect your AI assistant" entry point for
// first-timers or anyone who forgot the steps. Deliberately no fabricated
// stats — only real, in-context data (the active move name).
const destinationMeta: Record<
  GlobalNavItem["iconKey"],
  { icon: LucideIcon; description: string }
> = {
  moves: { icon: Truck, description: "Set up and manage each move." },
  movableUnits: {
    icon: PackageCheck,
    description: "Boxes and units with their contents.",
  },
  items: { icon: ClipboardList, description: "Everything you are tracking." },
  spacesTransport: {
    icon: Warehouse,
    description: "Organize what's in each space and transport.",
  },
  queue: { icon: Inbox, description: "Review intake waiting for you." },
};

export function HomeLaunchpad() {
  const { activeMoves, selectedMove, loadingMoves } = useMoveWorkspace();

  const hasMoves = activeMoves.length > 0;
  const continueMove = selectedMove ?? activeMoves[0];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          MovingManifest
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Your workspace
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Jump into the part of the move you need, or let an AI assistant help
          fill it in.
        </p>
      </header>

      {/* Continue / first-move context — real data only, shown once it loads. */}
      {!loadingMoves && hasMoves && continueMove ? (
        <Link
          href={`/app/moves/${continueMove._id}`}
          className="group flex items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Continue where you left off
            </p>
            <p className="mt-1 truncate text-base font-semibold">
              {continueMove.title}
            </p>
          </div>
          <ArrowUpRight
            className="size-5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            aria-hidden="true"
          />
        </Link>
      ) : null}

      {!loadingMoves && !hasMoves ? (
        <Link
          href="/app/moves"
          className="group flex items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Plus className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-base font-semibold">Create your first move</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Start a move, then add rooms, items, boxes, and photos.
              </p>
            </div>
          </div>
          <ArrowRight
            className="size-5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      ) : null}

      {/* The four main destinations. */}
      <nav aria-label="Main destinations">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {globalNavItems.map((item) => {
            const meta = destinationMeta[item.iconKey];
            const Icon = meta.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex flex-col rounded-lg border border-border bg-card p-4",
                  "transition-colors hover:border-primary/40 hover:bg-muted/40",
                )}
              >
                <span className="flex size-10 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="mt-4 text-base font-semibold tracking-tight">
                  {item.label}
                </span>
                <span className="mt-1 text-sm leading-5 text-muted-foreground">
                  {meta.description}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Standing entry point to connect an AI assistant. */}
      <section className="rounded-lg border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
              <Bot className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Connect your AI assistant
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                First time, or need the steps again? Connect Claude, ChatGPT,
                Codex, or another assistant so it can help catalog items, boxes,
                photos, and packets. You stay in control and can revoke access
                anytime.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            <Button asChild>
              <Link href="/app/settings/ai-connections">
                Connect an assistant
                <Sparkles aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/ai">See what it can do</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
