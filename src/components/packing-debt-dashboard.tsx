"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  ImagePlus,
  PackageOpen,
} from "lucide-react";

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
import { moveWorkspaceAnchorPath } from "@/lib/move-links";
import { cn } from "@/lib/utils";

type PackingDebtDashboardProps = {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
};

const severityClasses = {
  ok: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
  info: "border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300",
  warning:
    "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  critical:
    "border-destructive/40 bg-destructive/10 text-destructive dark:text-red-300",
};

const readinessTasks = [
  { value: "actions", label: "Actions" },
  { value: "areas", label: "Areas" },
  { value: "shortcuts", label: "Shortcuts" },
] as const;

export function PackingDebtDashboard({
  householdId,
  moveId,
}: PackingDebtDashboardProps) {
  const summary = useQuery(
    api.packingDebt.summaryForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  );

  return (
    <Card id="packing-debt">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="size-4 text-primary" aria-hidden="true" />
              Packing debt
            </CardTitle>
            <CardDescription>
              Unfinished decisions across inventory, photos, boxes, AI review,
              and Move Day.
            </CardDescription>
          </div>
          {summary ? (
            <Badge
              variant={summary.counts.openMetricCount ? "secondary" : "outline"}
            >
              {summary.counts.openMetricCount
                ? `${summary.counts.totalOpenSignals} open signals`
                : "clear"}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary === undefined ? (
          <LoadingState />
        ) : summary.counts.openMetricCount === 0 ? (
          <div className="flex items-start gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
            <CheckCircle2
              className="mt-0.5 size-4 text-emerald-600"
              aria-hidden="true"
            />
            <div>
              <div className="font-medium text-foreground">
                No packing debt detected.
              </div>
              <p className="mt-1 text-muted-foreground">
                Current move records have reviewed items, assigned boxes, photo
                evidence, and no pending AI review.
              </p>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="actions" className="gap-4">
            <div className="overflow-x-auto pb-1">
              <TabsList
                className="min-w-max"
                aria-label="Readiness review tasks"
              >
                {readinessTasks.map((task) => (
                  <TabsTrigger key={task.value} value={task.value}>
                    {task.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="actions">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {summary.topActions.map((metric) => (
                  <Link
                    key={metric.key}
                    href={moveWorkspaceAnchorPath(moveId, metric.anchor)}
                    className={cn(
                      "rounded-md border p-3 transition-colors hover:bg-muted/70",
                      severityClasses[metric.severity]
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{metric.label}</span>
                      <span className="font-mono text-2xl font-semibold leading-none">
                        {metric.count}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs opacity-80">
                      {metric.help}
                    </p>
                  </Link>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="areas">
              <div className="grid gap-2 lg:grid-cols-3">
                <SignalGroup
                  title="Inventory"
                  icon={PackageOpen}
                  metrics={summary.metrics.filter((metric) =>
                    [
                      "needsReview",
                      "undecidedDisposition",
                      "unboxedItems",
                    ].includes(metric.key)
                  )}
                  moveId={moveId}
                />
                <SignalGroup
                  title="Evidence"
                  icon={ImagePlus}
                  metrics={summary.metrics.filter((metric) =>
                    [
                      "highValueWithoutPhotos",
                      "photosNeedingReview",
                      "pendingAiSuggestions",
                    ].includes(metric.key)
                  )}
                  moveId={moveId}
                />
                <SignalGroup
                  title="Load readiness"
                  icon={AlertTriangle}
                  metrics={summary.metrics.filter((metric) =>
                    [
                      "boxesMissingDestination",
                      "boxesUnassigned",
                      "boxesNotLoaded",
                      "boxWarnings",
                    ].includes(metric.key)
                  )}
                  moveId={moveId}
                />
              </div>
            </TabsContent>

            <TabsContent value="shortcuts">
              <div className="rounded-md border border-border p-3">
                <p className="text-sm font-medium">Go fix readiness inputs</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Packing debt drops when inventory decisions, load assignments,
                  photos, and AI review are completed.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={moveWorkspaceAnchorPath(moveId, "#inventory")}>
                      Inventory
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={moveWorkspaceAnchorPath(moveId, "#load-plan")}>
                      Load planner
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={moveWorkspaceAnchorPath(moveId, "#photos")}>
                      Photos
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={moveWorkspaceAnchorPath(moveId, "#ai-review-queue")}>
                      AI review
                    </Link>
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-28 rounded-md" />
    </div>
  );
}

function SignalGroup({
  title,
  icon: Icon,
  metrics,
  moveId,
}: {
  title: string;
  icon: typeof AlertTriangle;
  metrics: Array<{
    key: string;
    label: string;
    count: number;
    severity: keyof typeof severityClasses;
    anchor: string;
  }>;
  moveId: Id<"moves"> | null;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-primary" aria-hidden="true" />
        {title}
      </div>
      <div className="space-y-1.5">
        {metrics.map((metric) => (
          <Link
            key={metric.key}
            href={moveWorkspaceAnchorPath(moveId, metric.anchor)}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted"
          >
            <span className="min-w-0 truncate text-muted-foreground">
              {metric.label}
            </span>
            <Badge
              variant={metric.count ? "secondary" : "outline"}
              className={metric.count ? severityClasses[metric.severity] : ""}
            >
              {metric.count}
            </Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}
