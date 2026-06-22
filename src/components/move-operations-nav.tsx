"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
  Sparkles,
  Truck,
  CalendarClock,
  Settings2,
} from "lucide-react";

import { useOptionalMoveWorkspace } from "@/components/move-workspace-context";
import { cn } from "@/lib/utils";

type OperationLink = {
  segment: string | null; // null = the move config page (index)
  label: string;
  icon: typeof Truck;
  group: "config" | "operations";
};

// The move detail surface has two groups: Configuration (the config tabs on the
// move index) and Operations (Load Plan / Move Day / Packets / AI Review — real
// move-scoped operations that are not part of the 3-item global nav).
const OPERATION_LINKS: OperationLink[] = [
  { segment: null, label: "Configure", icon: Settings2, group: "config" },
  { segment: "load-plan", label: "Load Plan", icon: Truck, group: "operations" },
  {
    segment: "move-day",
    label: "Move Day",
    icon: CalendarClock,
    group: "operations",
  },
  {
    segment: "packets",
    label: "Packets",
    icon: ClipboardCheck,
    group: "operations",
  },
  {
    segment: "ai-review",
    label: "AI Review",
    icon: Sparkles,
    group: "operations",
  },
];

export function MoveOperationsNav() {
  const workspace = useOptionalMoveWorkspace();
  const pathname = usePathname() ?? "";
  const moveId = workspace?.moveId ?? null;
  if (!moveId) {
    return null;
  }

  const base = `/app/moves/${moveId}`;
  const operations = OPERATION_LINKS.filter((l) => l.group === "operations");
  const configLink = OPERATION_LINKS.find((l) => l.group === "config")!;

  const isActive = (segment: string | null) => {
    if (segment === null) {
      // Config = the move index (and its hash tabs), not an operational route.
      return !operations.some((op) => pathname.startsWith(`${base}/${op.segment}`));
    }
    return pathname.startsWith(`${base}/${segment}`);
  };

  const renderLink = (link: OperationLink) => {
    const href = link.segment === null ? base : `${base}/${link.segment}`;
    const active = isActive(link.segment);
    const Icon = link.icon;
    return (
      <Link
        key={link.label}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
        {link.label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Move operations"
      className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card/40 p-1.5"
    >
      {renderLink(configLink)}
      <span className="mx-1 hidden h-5 w-px bg-border sm:inline-block" aria-hidden="true" />
      <span className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Operations
      </span>
      {operations.map(renderLink)}
    </nav>
  );
}
