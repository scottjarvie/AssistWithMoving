"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  ChevronDown,
  ChevronRight,
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
import { Skeleton } from "@/components/ui/skeleton";
import { moveWhenLine } from "@/lib/move-timing";
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
  queue: {
    icon: Inbox,
    description: "Leave and resume durable handoffs with your chosen AI.",
  },
};

export function HomeLaunchpad() {
  const { activeMoves, selectedMove, loadingMoves } = useMoveWorkspace();

  const hasMoves = activeMoves.length > 0;
  const continueMove = selectedMove ?? activeMoves[0];
  const continueRoute = continueMove
    ? [continueMove.origin, continueMove.destination].filter(Boolean).join(" → ")
    : "";
  const continueWhen = continueMove
    ? moveWhenLine(continueMove.dateStart, continueMove.dateEnd)
    : undefined;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Your workspace
        </h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Pick up your move, or jump to boxes, items, and handoffs.
        </p>
      </header>

      {/* Continue / first-move context — real data only, shown once it loads. */}
      {loadingMoves ? (
        // One banner-shaped skeleton: the loaded state is a single
        // "Continue where you left off" strip, not a card grid.
        <div aria-label="Loading move shortcuts">
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : hasMoves && continueMove ? (
        <Link
          href={`/app/moves/${continueMove._id}`}
          className="group flex items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Continue where you left off
            </p>
            <p className="mt-1 break-words text-lg font-semibold">
              {continueMove.title}
            </p>
            {continueRoute ? (
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {continueRoute}
              </p>
            ) : null}
            {continueWhen ? (
              <p className="mt-0.5 text-sm font-medium text-foreground">
                {continueWhen}
              </p>
            ) : null}
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
                Begin privately with a name and whatever you know about the
                route. Add detail only when it helps.
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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {globalNavItems.map((item) => {
            const meta = destinationMeta[item.iconKey];
            const Icon = meta.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex min-h-16 items-center gap-3 rounded-lg border border-border bg-card px-3 py-3",
                  "transition-colors hover:border-primary/40 hover:bg-muted/40",
                )}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold tracking-tight">
                    {item.label}
                  </span>
                  <span className="block text-sm leading-5 text-muted-foreground">
                    {meta.description}
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                  aria-hidden="true"
                />
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
                Set up your chosen AI
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                Let your AI read your move and save plans, inventory, and
                decisions here. You can disconnect it any time.
              </p>
              <details className="group mt-2 max-w-xl text-sm">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-foreground [&::-webkit-details-marker]:hidden">
                  How the connection works
                  <ChevronDown
                    className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </summary>
                <p className="leading-6 text-muted-foreground">
                  Connect a compatible AI through hosted MCP OAuth so it can
                  read bounded move context and save decisions, estimates,
                  plans, inventory, and source checks. Queue claiming uses the
                  separate scoped API-key tools today. You can revoke either
                  connection.
                </p>
              </details>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            <Button asChild size="touch">
              <Link href="/settings/ai">
                Connect your AI
                <Sparkles aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="touch">
              <Link href="/ai">See what it can do</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
