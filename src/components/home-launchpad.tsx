"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { useMoveWorkspace } from "@/components/move-workspace-context";
import { MoveIllustration, MovingSymbol, type MovingSymbolName } from "@/components/moving-symbol";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { moveWhenLine } from "@/lib/move-timing";
import { globalNavItems, type GlobalNavItem } from "@/lib/workspace-nav-items";

const destinationMeta: Record<GlobalNavItem["iconKey"], { icon: MovingSymbolName; description: string }> = {
  moves: { icon: "truck", description: "Set up and manage each move." },
  movableUnits: { icon: "box", description: "Boxes and units with their contents." },
  items: { icon: "note", description: "Everything you are tracking." },
  spacesTransport: { icon: "plan", description: "Organize what's in each space and transport." },
  queue: { icon: "queue", description: "Leave and resume durable handoffs with your chosen AI." },
};
const linkFocus = "focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function DeskTray({ title, count, children, footer }: { title: string; count?: string; children: ReactNode; footer?: ReactNode }) {
  return <section aria-label={title} className="min-w-0">
    <div className="flex items-end border-b border-primary/50">
      <h2 className="inline-flex min-h-9 items-center gap-3 rounded-t-md border border-b-0 border-primary/50 bg-card px-3 py-1.5 text-sm font-semibold">
        {title}{count ? <span className="font-mono text-xs font-normal text-muted-foreground">{count}</span> : null}
      </h2>
    </div>
    <div className="border-x border-b border-border bg-card p-3 sm:p-4">{children}
      {footer ? <div className="mt-3 border-t border-border pt-2 text-sm">{footer}</div> : null}
    </div>
  </section>;
}

// The desk uses only existing, loaded workspace data. No invented counts of
// Queue work, AI connections, recent activity or evidence are implied.
export function HomeLaunchpad() {
  const { activeMoves, selectedMove, loadingMoves } = useMoveWorkspace();
  const continueMove = selectedMove ?? activeMoves[0];
  const deskMoves = continueMove
    ? [continueMove, ...activeMoves.filter(move => move._id !== continueMove._id)].slice(0, 3)
    : [];

  return <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
    <header>
      <p className="mb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">Moving desk</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your workspace</h1>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">Pick up your move, or jump to boxes, items, and handoffs.</p>
    </header>

    <DeskTray title="Your moves" count={loadingMoves ? undefined : `${activeMoves.length} moves`} footer={<Link href="/app/moves" className={`${linkFocus} inline-flex min-h-9 items-center gap-2 text-evidence hover:underline`}>Open all moves<MovingSymbol name="arrow" className="size-4" /></Link>}>
      {loadingMoves ? <div aria-label="Loading move shortcuts"><Skeleton className="h-24 w-full rounded-md" /></div> : deskMoves.length ? <ul className="divide-y divide-border">
        {deskMoves.map((move, index) => {
          const route = [move.origin, move.destination].filter(Boolean).join(" → ");
          const when = moveWhenLine(move.dateStart, move.dateEnd);
          return <li key={move._id}><Link href={`/app/moves/${encodeURIComponent(move._id)}`} className={`${linkFocus} group flex min-w-0 items-start gap-3 py-3 first:pt-1 hover:text-primary sm:gap-5`}>
            <MoveIllustration decorative kind="route" className="mt-1 h-16 w-20 shrink-0 rounded-sm border border-border bg-background sm:mt-0 sm:h-24 sm:w-40" />
            <div className="min-w-0 flex-1">
              {index === 0 ? <p className="mb-1 text-xs text-muted-foreground">Continue where you left off</p> : null}
              <p className="break-words text-base font-semibold sm:text-lg">{move.title}</p>
              {route ? <p className="mt-0.5 break-words text-sm text-muted-foreground">{route}</p> : null}
              {when ? <p className="mt-1 text-sm">{when}</p> : null}
            </div>
            <MovingSymbol name="arrow" className="size-4 shrink-0 text-primary" />
          </Link></li>;
        })}
      </ul> : <div className="flex items-center gap-4 py-2">
        <MoveIllustration decorative kind="route" className="hidden h-24 w-40 shrink-0 sm:block" />
        <div><Link href="/app/moves" className={`${linkFocus} inline-flex min-h-11 items-center gap-2 font-semibold text-evidence hover:underline`}><MovingSymbol name="add" className="size-4" />Create your first move</Link>
          <p className="max-w-lg text-sm leading-6 text-muted-foreground">Begin privately with a name and whatever you know about the route. Add detail only when it helps.</p>
        </div>
      </div>}
    </DeskTray>

    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <DeskTray title="Destinations">
        <nav aria-label="Main destinations"><ul className="divide-y divide-border">
          {globalNavItems.map(item => <li key={item.href}><Link href={item.href} className={`${linkFocus} group flex min-h-14 items-center gap-3 py-2 hover:text-primary`}>
            <MovingSymbol name={destinationMeta[item.iconKey].icon} className="size-5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.label}</span><span className="block text-xs leading-5 text-muted-foreground">{destinationMeta[item.iconKey].description}</span></span>
            <MovingSymbol name="arrow" className="size-4 shrink-0 text-muted-foreground" />
          </Link></li>)}
        </ul></nav>
      </DeskTray>

      <DeskTray title="With your AI" footer={<Link href="/ai" className={`${linkFocus} inline-flex min-h-9 items-center gap-2 text-evidence hover:underline`}>See what it can do<MovingSymbol name="arrow" className="size-4" /></Link>}>
        <div className="flex items-start gap-3">
          <MovingSymbol name="ai" className="mt-1 size-5 shrink-0 text-evidence" />
          <div className="min-w-0"><h3 className="text-sm font-semibold">Set up your chosen AI</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Let your AI read your move and save plans, inventory, and decisions here. You can disconnect it any time.</p>
            <details className="group mt-2 text-sm">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium [&::-webkit-details-marker]:hidden">How the connection works<MovingSymbol name="arrow" className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" /></summary>
              <p className="leading-6 text-muted-foreground">Connect a compatible AI through hosted MCP OAuth so it can read bounded move context and save decisions, estimates, plans, inventory, and source checks. Queue claiming uses the separate scoped API-key tools today. You can revoke either connection.</p>
            </details>
            <Button asChild size="sm" variant="outline" className="mt-2"><Link href="/settings/ai">Connect your AI<MovingSymbol name="arrow" className="size-4" /></Link></Button>
          </div>
        </div>
      </DeskTray>
    </div>
  </div>;
}
