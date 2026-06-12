"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { AlertTriangle, ImagePlus, ListChecks, ShieldCheck } from "lucide-react";

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
import { cn } from "@/lib/utils";

type EvidenceDensityPanelProps = {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
};

type EvidencePriority = "standard" | "watch" | "high";

const priorityClasses: Record<EvidencePriority, string> = {
  high: "border-destructive/40 bg-destructive/10 text-destructive dark:text-red-300",
  watch: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  standard:
    "border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300",
};

const coverageTasks = [
  { value: "gaps", label: "Gaps" },
  { value: "scores", label: "Scores" },
  { value: "patterns", label: "Patterns" },
  { value: "shortcuts", label: "Shortcuts" },
] as const;

export function EvidenceDensityPanel({
  householdId,
  moveId,
}: EvidenceDensityPanelProps) {
  const summary = useQuery(
    api.evidenceDensity.summaryForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  );

  return (
    <Card id="evidence-density">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
              Evidence density
            </CardTitle>
            <CardDescription>
              Claim-ready coverage for photos, value, condition, receipts,
              serials, and box association.
            </CardDescription>
          </div>
          {summary ? (
            <Badge
              variant={
                summary.summary.averageScore >= 80 ? "outline" : "secondary"
              }
            >
              {formatScore(summary.summary.averageScore)} average
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary === undefined ? (
          <LoadingState />
        ) : summary.summary.itemCount === 0 ? (
          <div className="flex items-start gap-3 rounded-md border border-dashed border-border p-4 text-sm">
            <ImagePlus
              className="mt-0.5 size-4 text-primary"
              aria-hidden="true"
            />
            <div>
              <div className="font-medium">No inventory to score yet.</div>
              <p className="mt-1 text-muted-foreground">
                Add inventory, photos, values, receipts, and box contents to
                build evidence coverage.
              </p>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="gaps" className="gap-4">
            <div className="overflow-x-auto pb-1">
              <TabsList
                className="min-w-max"
                aria-label="Evidence coverage tasks"
              >
                {coverageTasks.map((task) => (
                  <TabsTrigger key={task.value} value={task.value}>
                    {task.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="gaps" className="space-y-3">
              <TopEvidenceGaps items={summary.topGaps} />
            </TabsContent>

            <TabsContent value="scores">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  label="Average score"
                  value={formatScore(summary.summary.averageScore)}
                  note={`${summary.summary.completeItemCount} complete items`}
                />
                <Metric
                  label="Priority average"
                  value={
                    summary.summary.priorityItemCount
                      ? formatScore(summary.summary.priorityAverageScore)
                      : "N/A"
                  }
                  note={
                    summary.summary.priorityItemCount
                      ? `${summary.summary.priorityItemCount} priority items`
                      : "no priority items"
                  }
                />
                <Metric
                  label="Thin priority"
                  value={summary.summary.thinPriorityItemCount.toString()}
                  note="under 67% coverage"
                  alert={summary.summary.thinPriorityItemCount > 0}
                />
                <Metric
                  label="Zero evidence"
                  value={summary.summary.zeroEvidenceItemCount.toString()}
                  note="no satisfied factors"
                  alert={summary.summary.zeroEvidenceItemCount > 0}
                />
              </div>
            </TabsContent>

            <TabsContent value="patterns" className="space-y-3">
              <CommonEvidenceGaps gaps={summary.gapCounts} />
            </TabsContent>

            <TabsContent value="shortcuts" className="space-y-3">
              <CoverageShortcuts />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function TopEvidenceGaps({
  items,
}: {
  items: Array<{
    itemId: string;
    name: string;
    room?: string;
    category?: string;
    priority: EvidencePriority;
    score: number;
    gaps: string[];
  }>;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="size-4 text-primary" aria-hidden="true" />
        Top evidence gaps
      </div>
      {items.length ? (
        <div className="space-y-2">
          {items.map((item) => (
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
                    {item.room || item.category
                      ? [item.room, item.category].filter(Boolean).join(" - ")
                      : "No room or category"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <PriorityBadge priority={item.priority} />
                  <Badge variant="outline">{formatScore(item.score)}</Badge>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {item.gaps.slice(0, 4).map((gap) => (
                  <Badge key={gap} variant="secondary">
                    {gap}
                  </Badge>
                ))}
                {item.gaps.length > 4 ? (
                  <Badge variant="outline">+{item.gaps.length - 4} more</Badge>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <div className="font-medium text-foreground">
            Every scored item has complete evidence coverage.
          </div>
          <p className="mt-1 text-muted-foreground">
            Keep adding receipts and serial photos as new high-value items
            appear.
          </p>
        </div>
      )}
    </div>
  );
}

function CommonEvidenceGaps({
  gaps,
}: {
  gaps: Array<{ label: string; count: number }>;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <ListChecks className="size-4 text-primary" aria-hidden="true" />
        Most common gaps
      </div>
      {gaps.length ? (
        <div className="space-y-2">
          {gaps.slice(0, 6).map((gap) => (
            <div
              key={gap.label}
              className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                {gap.label}
              </span>
              <Badge variant="outline">{gap.count}</Badge>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No repeated gaps detected.
        </p>
      )}
    </div>
  );
}

function CoverageShortcuts() {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-sm font-medium">Go fix coverage inputs</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Evidence scores come from inventory details, photo review, box
        assignments, and packet readiness.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="#inventory">Inventory</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="#photos">Photos</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="#boxes">Boxes</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="#documentation-packets">Packets</Link>
        </Button>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-44 rounded-md" />
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

function PriorityBadge({ priority }: { priority: EvidencePriority }) {
  const label =
    priority === "high" ? "High" : priority === "watch" ? "Watch" : "Standard";

  return (
    <Badge variant="outline" className={priorityClasses[priority]}>
      {label}
    </Badge>
  );
}

function formatScore(score: number) {
  return `${score}%`;
}
