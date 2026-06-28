"use client";

// The move detail landing (MOVE-307/308/309/310): a results-first summary of
// what's actually configured — route, distance, dates, transportation, and
// household size — instead of a stack of empty Configure forms. Each fact has a
// gear that jumps to its Configure sub-tab. Configure stays one click away in
// the operations nav.

import type { ComponentType } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  CalendarClock,
  Gauge,
  Route,
  Settings2,
  Truck,
  Users,
} from "lucide-react";

import { api } from "../../../convex/_generated/api";
import { MoveOperationsNav } from "@/components/move-operations-nav";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// One agreed vocabulary for a move's lifecycle stage (MOVE-299): Planning →
// Active → Completed, each with a hover explanation. "Archived" is here only so
// an archived move opened by deep link still reads sensibly.
const STAGE_META: Record<string, { label: string; hint: string }> = {
  planning: {
    label: "Planning",
    hint: "Setting up the move's details, spaces, and transport — no items added yet.",
  },
  active: {
    label: "Active",
    hint: "Packing — adding units, items, and photos. Where most of the move happens.",
  },
  completed: {
    label: "Completed",
    hint: "The move is finished.",
  },
  archived: {
    label: "Archived",
    hint: "Kept out of the active moves list.",
  },
};

function formatMoveDate(value?: string): string | undefined {
  if (!value) return undefined;
  // Date-only strings parse as local midnight (avoids the UTC off-by-one).
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function FactRow({
  icon: Icon,
  label,
  value,
  configHref,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  configHref: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border p-3">
      <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="break-words text-sm font-medium">{value}</div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild size="icon-sm" variant="ghost">
            <Link href={configHref} aria-label={`Configure ${label}`}>
              <Settings2 className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Configure {label.toLowerCase()}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function MoveSummaryPage() {
  const { householdId, moveId, selectedMove } = useMoveWorkspace();

  const transport = useQuery(
    api.transportResources.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const memberCount = useQuery(
    api.moves.householdMemberCount,
    householdId && moveId ? { householdId, moveId } : "skip",
  );

  const configBase = moveId ? `/app/moves/${moveId}/configure` : "#";

  const routeValue =
    [selectedMove?.origin, selectedMove?.destination]
      .filter(Boolean)
      .join(" → ") || undefined;

  const distanceValue =
    selectedMove?.distanceMiles != null
      ? `${selectedMove.distanceMiles} mi`
      : undefined;

  const startDate = formatMoveDate(selectedMove?.dateStart);
  const endDate = formatMoveDate(selectedMove?.dateEnd);
  const datesValue =
    startDate && endDate
      ? `${startDate} → ${endDate}`
      : (startDate ?? endDate);

  const activeTransport = (transport ?? []).filter(
    (resource) => !resource.archivedAt,
  );
  const transportValue = activeTransport.length
    ? `${activeTransport.length} ${
        activeTransport.length === 1 ? "method" : "methods"
      } · ${activeTransport
        .slice(0, 3)
        .map((resource) => resource.name)
        .join(", ")}${activeTransport.length > 3 ? "…" : ""}`
    : undefined;

  // Only surface household size once it's been set up beyond the lone default
  // member (MOVE-310).
  const householdValue =
    typeof memberCount === "number" && memberCount > 1
      ? `${memberCount} members`
      : undefined;

  const facts: Array<{
    icon: ComponentType<{ className?: string }>;
    label: string;
    value: string;
    hash: string;
  }> = [];
  if (routeValue)
    facts.push({ icon: Route, label: "Route", value: routeValue, hash: "#start" });
  if (distanceValue)
    facts.push({
      icon: Gauge,
      label: "Distance",
      value: distanceValue,
      hash: "#details",
    });
  if (datesValue)
    facts.push({
      icon: CalendarClock,
      label: "Dates",
      value: datesValue,
      hash: "#details",
    });
  if (transportValue)
    facts.push({
      icon: Truck,
      label: "Transportation",
      value: transportValue,
      hash: "#transport",
    });
  if (householdValue)
    facts.push({
      icon: Users,
      label: "Household",
      value: householdValue,
      hash: "#household",
    });

  const stage = selectedMove
    ? (STAGE_META[selectedMove.status] ?? {
        label: selectedMove.status,
        hint: "",
      })
    : null;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title={selectedMove?.title ?? "Move"}
        description="A summary of how this move is set up. Open Configure to change anything."
      />

      <MoveOperationsNav />

      {stage ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Stage</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="cursor-help">
                {stage.label}
              </Badge>
            </TooltipTrigger>
            {stage.hint ? <TooltipContent>{stage.hint}</TooltipContent> : null}
          </Tooltip>
        </div>
      ) : null}

      {facts.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {facts.map((fact) => (
            <FactRow
              key={fact.label}
              icon={fact.icon}
              label={fact.label}
              value={fact.value}
              configHref={`${configBase}${fact.hash}`}
            />
          ))}
        </div>
      ) : selectedMove ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-sm leading-6 text-muted-foreground">
          <p className="font-medium text-foreground">Let&apos;s set up this move.</p>
          <p className="mt-1">
            Add the route, dates, distance, transportation, and who&apos;s
            helping — then this page shows it all at a glance.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link href={configBase}>
              <Settings2 className="size-4" aria-hidden="true" />
              Configure the move
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-16 animate-pulse rounded-md border border-border bg-muted" />
          <div className="h-16 animate-pulse rounded-md border border-border bg-muted" />
        </div>
      )}
    </div>
  );
}
