"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useOptionalMoveWorkspace } from "@/components/move-workspace-context";
import { cn } from "@/lib/utils";
import { MovingSymbol, type MovingSymbolName } from "@/components/moving-symbol";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type OperationLink = {
  segment: string | null; // null = the move config page (index)
  label: string;
  group: "config" | "operations";
};

// The move detail surface has two groups: the move's own pages (Summary index +
// Configure forms) and Operations (Load Plan / Plan / Move Day / Packets /
// Queue — real move-scoped operations that are not part of the global nav). The
// "Queue" slot replaced the confusing "AI Review" tab (MOVE-311); secondary
// surfaces such as AI Review and Overview stay as contextual page links.
const OPERATION_LINKS: OperationLink[] = [
  { segment: null, label: "Summary", group: "config" },
  { segment: "configure", label: "Configure", group: "config" },
  { segment: "load-plan", label: "Load Plan", group: "operations" },
  { segment: "plan", label: "Plan", group: "operations" },
  {
    segment: "move-day",
    label: "Move Day",
    group: "operations",
  },
  {
    segment: "packets",
    label: "Packets",
    group: "operations",
  },
  {
    segment: "queue",
    label: "Queue",
    group: "operations",
  },
];

const operationSymbols: Record<string, MovingSymbolName> = { Summary: "note", Configure: "settings", "Load Plan": "truck", Plan: "plan", "Move Day": "calendar", Packets: "source", Queue: "queue" };
const operationDescriptions: Record<string, string> = { Summary: "The move at a glance", Configure: "Places, people and details", "Load Plan": "Fit units into transport", Plan: "Arrange belongings in rooms", "Move Day": "Check each handoff", Packets: "Evidence and documents", Queue: "Work with your AI" };

export function MoveContents({ moveId }: { moveId: string }) {
  return <section aria-label="Move contents" className="lg:hidden">
    <h2 className="mb-3 text-sm font-semibold">Contents</h2>
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-y border-border py-2">
      {OPERATION_LINKS.map(link => <Link key={link.label} href={`/app/moves/${encodeURIComponent(moveId)}${link.segment ? `/${link.segment}` : ""}`} className="flex min-h-11 items-center gap-2 py-2 text-sm">
        <MovingSymbol name={operationSymbols[link.label]} className="size-4 shrink-0 text-primary" />
        <span><span className="block font-medium">{link.label}</span><span className="block text-xs text-muted-foreground">{operationDescriptions[link.label]}</span></span>
      </Link>)}
    </div>
  </section>;
}

export function MoveOperationsNav() {
  const workspace = useOptionalMoveWorkspace();
  const pathname = usePathname() ?? "";
  const moveId = workspace?.moveId ?? null;
  if (!moveId) {
    return null;
  }

  const base = `/app/moves/${moveId}`;

  const isActive = (segment: string | null) => {
    if (segment === null) {
      // Summary = the move index exactly (plus its own hash, no sub-route).
      return pathname === base || pathname === `${base}/`;
    }
    return pathname.startsWith(`${base}/${segment}`);
  };

  const renderLink = (link: OperationLink) => {
    const href = link.segment === null ? base : `${base}/${link.segment}`;
    const active = isActive(link.segment);
    return (
      <Link
        key={link.label}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 text-sm font-medium transition-colors sm:min-h-9",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <MovingSymbol name={operationSymbols[link.label]} className="size-4" />
        {link.label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Move operations"
      className="moving-operation-strip sticky top-(--workspace-navigation-offset) z-20 flex min-w-0 items-start gap-2 border-y border-border bg-background py-1"
    >
      <div className="moving-section-strip flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {OPERATION_LINKS.map(renderLink)}
      </div>
      <Popover>
        <PopoverTrigger asChild><Button type="button" variant="outline" className="min-h-11 shrink-0 sm:min-h-9" aria-label={`All ${OPERATION_LINKS.length} move sections`}>
          <MovingSymbol name="contents" className="size-4" />All {OPERATION_LINKS.length}
        </Button></PopoverTrigger>
        <PopoverContent align="end" className="grid w-[min(22rem,calc(100vw-2rem))] grid-cols-2 gap-1 p-2">
          {OPERATION_LINKS.map(renderLink)}
        </PopoverContent>
      </Popover>
    </nav>
  );
}
