"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { AlertTriangle, FileText, History, ShieldAlert } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildClaimPacketPath,
  formatClaimCurrency,
} from "@/lib/claim-packet";
import { moveWorkspaceAnchorPath } from "@/lib/move-links";
import { cn } from "@/lib/utils";

type ClaimsCenterPanelProps = {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
};

type ClaimSeverity = "watch" | "medium" | "high";

const severityClasses: Record<ClaimSeverity, string> = {
  high: "border-destructive/40 bg-destructive/10 text-destructive dark:text-red-300",
  medium:
    "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  watch: "border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300",
};

const claimTasks = [
  { value: "items", label: "Items" },
  { value: "metrics", label: "Metrics" },
  { value: "timeline", label: "Timeline" },
  { value: "packets", label: "Packets" },
] as const;

export function ClaimsCenterPanel({
  householdId,
  moveId,
}: ClaimsCenterPanelProps) {
  const summary = useQuery(
    api.claimCenter.summaryForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  );
  const claimPacketPath =
    householdId && moveId
      ? buildClaimPacketPath({ householdId, moveId, mode: "submission" })
      : "#";
  const ownerPacketPath =
    householdId && moveId
      ? buildClaimPacketPath({ householdId, moveId, mode: "owner" })
      : "#";

  return (
    <Card id="claims-center">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-primary" aria-hidden="true" />
              Claims Center
            </CardTitle>
            <CardDescription>
              Evidence completeness, damaged or missing inventory, and recent
              claim-relevant history.
            </CardDescription>
          </div>
          {summary ? (
            <Badge
              variant={
                summary.summary.highSeverityCount ? "secondary" : "outline"
              }
            >
              {summary.summary.claimItemCount} claim items
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary === undefined ? (
          <LoadingState />
        ) : summary.summary.claimItemCount === 0 ? (
          <div className="flex items-start gap-3 rounded-md border border-dashed border-border p-4 text-sm">
            <FileText
              className="mt-0.5 size-4 text-primary"
              aria-hidden="true"
            />
            <div>
              <div className="font-medium">No claim-focused items yet.</div>
              <p className="mt-1 text-muted-foreground">
                Damaged, missing, high-value, irreplaceable, or claim-flagged
                items will appear here automatically.
              </p>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="items" className="gap-4">
            <div className="overflow-x-auto pb-1">
              <TabsList className="min-w-max" aria-label="Claim review tasks">
                {claimTasks.map((task) => (
                  <TabsTrigger key={task.value} value={task.value}>
                    {task.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="items" className="space-y-3">
              <TopClaimItems items={summary.topItems} />
            </TabsContent>

            <TabsContent value="metrics">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <Metric
                  label="Claim items"
                  value={summary.summary.claimItemCount.toString()}
                  note="currently relevant"
                />
                <Metric
                  label="High severity"
                  value={summary.summary.highSeverityCount.toString()}
                  note="missing, damaged, or high value"
                  alert={summary.summary.highSeverityCount > 0}
                />
                <Metric
                  label="Damaged/missing"
                  value={summary.summary.damagedOrMissingCount.toString()}
                  note="status-based flags"
                  alert={summary.summary.damagedOrMissingCount > 0}
                />
                <Metric
                  label="Evidence score"
                  value={`${summary.summary.averageEvidenceScore}/100`}
                  note={`${summary.summary.warningCount} warnings`}
                  alert={summary.summary.warningCount > 0}
                />
                <Metric
                  label="Value"
                  value={formatClaimCurrency(summary.summary.totalValueCents)}
                  note="documented item value"
                />
              </div>
            </TabsContent>

            <TabsContent value="timeline" className="space-y-3">
              <ClaimTimeline events={summary.timeline} />
            </TabsContent>

            <TabsContent value="packets" className="space-y-3">
              <ClaimPacketShortcuts
                claimPacketPath={claimPacketPath}
                moveId={moveId}
                ownerPacketPath={ownerPacketPath}
              />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function TopClaimItems({
  items,
}: {
  items: Array<{
    itemId: string;
    name: string;
    room?: string;
    category?: string;
    severity: ClaimSeverity;
    evidenceScore: number;
    relevanceReasons: string[];
    evidenceWarnings: string[];
  }>;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="size-4 text-primary" aria-hidden="true" />
        Top claim items
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const badges = [
            ...item.relevanceReasons.map((label) => ({
              label,
              variant: "secondary" as const,
            })),
            ...item.evidenceWarnings.map((label) => ({
              label,
              variant: "outline" as const,
            })),
          ];
          const visibleBadges = badges.slice(0, 4);
          const hiddenBadgeCount = Math.max(0, badges.length - visibleBadges.length);

          return (
            <div
              key={item.itemId}
              className="rounded-md border border-border bg-muted/20 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {item.name}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {[item.room, item.category].filter(Boolean).join(" - ") ||
                      "No room or category"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <SeverityBadge severity={item.severity} />
                  <Badge variant="outline">{item.evidenceScore}/100</Badge>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {visibleBadges.map((badge) => (
                  <Badge key={badge.label} variant={badge.variant}>
                    {badge.label}
                  </Badge>
                ))}
                {hiddenBadgeCount ? (
                  <Badge variant="outline">+{hiddenBadgeCount} more</Badge>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClaimTimeline({
  events,
}: {
  events: Array<{
    eventId: string;
    label: string;
    detail: string;
    itemName?: string;
    createdAt: number;
  }>;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <History className="size-4 text-primary" aria-hidden="true" />
        Claim timeline
      </div>
      {events.length ? (
        <div className="space-y-3">
          {events.map((event) => (
            <div
              key={event.eventId}
              className="border-l-2 border-border pl-3 text-sm"
            >
              <div className="font-medium">{event.label}</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {event.itemName ? `${event.itemName}: ` : ""}
                {event.detail}
              </p>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatEventTime(event.createdAt)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Claim-relevant history will appear as items, photos, and boxes are
          updated.
        </p>
      )}
    </div>
  );
}

function ClaimPacketShortcuts({
  claimPacketPath,
  moveId,
  ownerPacketPath,
}: {
  claimPacketPath: string;
  moveId: Id<"moves"> | null;
  ownerPacketPath: string;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-sm font-medium">Build or audit claim packets</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Export the insurer-ready packet, open the owner audit copy, or jump back
        to the source evidence that feeds both.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={claimPacketPath}>Claim packet</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={ownerPacketPath}>Owner audit packet</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={moveWorkspaceAnchorPath(moveId, "#inventory")}>
            Inventory
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={moveWorkspaceAnchorPath(moveId, "#photos")}>Photos</Link>
        </Button>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-md" />
    </div>
  );
}

function Metric({
  label,
  value,
  note,
  alert = false,
}: {
  label: string;
  value: string;
  note: string;
  alert?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border p-3",
        alert && "border-amber-500/35 bg-amber-500/10"
      )}
    >
      <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold leading-none">
        {value}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{note}</div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: ClaimSeverity }) {
  const label =
    severity === "high" ? "High" : severity === "medium" ? "Medium" : "Watch";

  return (
    <Badge variant="outline" className={severityClasses[severity]}>
      {label}
    </Badge>
  );
}

function formatEventTime(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
