"use client";

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Bot, Gauge, Play, RefreshCw, ShieldAlert } from "lucide-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AiJobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

const statuses: AiJobStatus[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
];

export function AiJobMonitor({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const jobs = useQuery(
    api.aiJobs.listForMove,
    householdId && moveId ? { householdId, moveId, limit: 20 } : "skip"
  );
  const usage = useQuery(
    api.aiUsage.summaryForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  );
  const createAiJob = useMutation(api.aiJobs.create);
  const executeAiJob = useAction(api.aiJobs.execute);
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const counts = useMemo(() => {
    const statusCounts = new Map<AiJobStatus, number>();
    for (const status of statuses) {
      statusCounts.set(status, 0);
    }
    for (const job of jobs ?? []) {
      statusCounts.set(
        job.status as AiJobStatus,
        (statusCounts.get(job.status as AiJobStatus) ?? 0) + 1
      );
    }
    return statusCounts;
  }, [jobs]);

  async function createMockReview() {
    if (!householdId || !moveId) {
      return;
    }

    setRunning(true);
    setMessage(null);
    try {
      const aiJobId = await createAiJob({
        householdId,
        moveId,
        type: "generalReview",
        modality: "structured",
        provider: "mock",
        model: "mock-model",
        inputSummary:
          "Review current move records for missing assignment, evidence, and packet readiness signals.",
        inputRef: {
          source: "dashboard",
          scope: "move-readiness",
        },
        maxCostCents: 1,
      });
      await executeAiJob({
        householdId,
        moveId,
        aiJobId,
        maxOutputTokens: 128,
      });
      setMessage("Mock AI review completed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI review failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card id="ai">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="size-4 text-primary" aria-hidden="true" />
              AI job monitor
            </CardTitle>
            <CardDescription>
              Auditable AI jobs stay separate from user-confirmed inventory and
              packet records until reviewed.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!moveId || running}
            onClick={() => void createMockReview()}
          >
            {running ? (
              <RefreshCw className="animate-spin" aria-hidden="true" />
            ) : (
              <Play aria-hidden="true" />
            )}
            Mock review
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {usage ? (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-border p-3">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Gauge className="size-3.5" aria-hidden="true" />
                Daily jobs
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold">
                {usage.dailyJobs}
                <span className="text-sm text-muted-foreground">
                  /{usage.limits.maxDailyJobsPerMove}
                </span>
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Daily AI budget</p>
              <p className="mt-1 font-mono text-2xl font-semibold">
                {formatCost(usage.dailyCostCents)}
                <span className="text-sm text-muted-foreground">
                  /{formatCost(usage.limits.maxDailyEstimatedCentsPerMove)}
                </span>
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Queued/running</p>
              <p className="mt-1 font-mono text-2xl font-semibold">
                {usage.inFlightJobs}
                <span className="text-sm text-muted-foreground">
                  /{usage.limits.maxInFlightJobsPerMove}
                </span>
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldAlert className="size-3.5" aria-hidden="true" />
                Failed jobs
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold">
                {usage.failedJobs}
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-5">
          {statuses.map((status) => (
            <div key={status} className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">{status}</p>
              <p className="mt-1 font-mono text-2xl font-semibold">
                {counts.get(status) ?? 0}
              </p>
            </div>
          ))}
        </div>

        {message ? (
          <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}

        {usage && Object.keys(usage.byType).length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-border p-3">
              <h3 className="text-sm font-medium">Feature area usage</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(usage.byType).map(([type, count]) => (
                  <Badge key={type} variant="outline">
                    {type}: {count}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-border p-3">
              <h3 className="text-sm font-medium">Provider/model usage</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(usage.byProviderModel).map(([provider, count]) => (
                  <Badge key={provider} variant="outline">
                    {provider}: {count}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {usage && (usage.failedRecent.length || usage.expensiveJobs.length) ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {usage.failedRecent.length ? (
              <div className="rounded-md border border-border p-3">
                <h3 className="text-sm font-medium">Recent failures</h3>
                <div className="mt-3 space-y-2 text-sm">
                  {usage.failedRecent.map((job) => (
                    <div key={job.id} className="rounded-md bg-muted/40 p-2">
                      <p className="font-medium">{job.type}</p>
                      <p className="text-muted-foreground">
                        {job.provider}/{job.model}
                        {job.error ? ` - ${job.error}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {usage.expensiveJobs.length ? (
              <div className="rounded-md border border-border p-3">
                <h3 className="text-sm font-medium">Cost outliers</h3>
                <div className="mt-3 space-y-2 text-sm">
                  {usage.expensiveJobs.map((job) => (
                    <div key={job.id} className="rounded-md bg-muted/40 p-2">
                      <p className="font-medium">{job.type}</p>
                      <p className="text-muted-foreground">
                        {job.provider}/{job.model} - {formatCost(job.costCents)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {jobs === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-4/5" />
          </div>
        ) : jobs.length ? (
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job._id}>
                    <TableCell className="font-medium">{job.type}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          job.status === "failed"
                            ? "destructive"
                            : job.status === "succeeded"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {job.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {job.provider} / {job.model}
                    </TableCell>
                    <TableCell>{job.reviewStatus}</TableCell>
                    <TableCell className="text-right">
                      {formatCost(job.cost?.actualCents ?? job.cost?.estimatedCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            No AI jobs yet. Run a mock review to exercise the provider boundary
            without calling a paid model.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatCost(cents: number | undefined) {
  if (typeof cents !== "number") {
    return "-";
  }
  return `$${(cents / 100).toFixed(4)}`;
}
