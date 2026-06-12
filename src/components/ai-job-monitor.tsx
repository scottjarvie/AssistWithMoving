"use client";

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Bot, Gauge, Play, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  aiProviderModelLabel,
  aiProviderModelLabelFromKey,
} from "@/lib/ai-display";

type AiJobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

const statuses: AiJobStatus[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
];

type AiJobMonitorTask = "history" | "usage" | "exceptions";
type AiJob = NonNullable<
  ReturnType<typeof useQuery<typeof api.aiJobs.listForMove>>
>[number];

const aiJobMonitorTasks: Array<{ value: AiJobMonitorTask; label: string }> = [
  { value: "history", label: "History" },
  { value: "usage", label: "Usage" },
  { value: "exceptions", label: "Exceptions" },
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
  const providerStatus = useQuery(
    api.aiJobs.providerStatus,
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

  async function createLocalReview() {
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
      setMessage("Local demo review completed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI review failed.");
    } finally {
      setRunning(false);
    }
  }

  async function createModelReview() {
    if (!householdId || !moveId || !providerStatus?.openai.configured) {
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
        provider: "openai",
        model: providerStatus.openai.defaultModel,
        inputSummary:
          "Review current move records for missing assignment, evidence, capacity, privacy, and packet readiness signals.",
        inputRef: {
          source: "dashboard",
          scope: "move-readiness",
        },
        maxCostCents: 5,
      });
      await executeAiJob({
        householdId,
        moveId,
        aiJobId,
        maxOutputTokens: 512,
      });
      setMessage("Model AI review completed.");
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            {providerStatus ? (
              <Badge variant="outline">
                Default:{" "}
                {aiProviderModelLabel(
                  providerStatus.defaultProvider,
                  providerStatus.defaultModel
                )}
              </Badge>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!moveId || running}
              onClick={() => void createLocalReview()}
            >
              {running ? (
                <RefreshCw className="animate-spin" aria-hidden="true" />
              ) : (
                <Play aria-hidden="true" />
              )}
              Local review
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!moveId || running || !providerStatus?.openai.configured}
              onClick={() => void createModelReview()}
            >
              {running ? (
                <RefreshCw className="animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles aria-hidden="true" />
              )}
              Model review
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? (
          <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}

        <Tabs defaultValue="history" className="gap-4">
          <div className="overflow-x-auto pb-1">
            <TabsList className="min-w-max" aria-label="AI job monitor tasks">
              {aiJobMonitorTasks.map((task) => (
                <TabsTrigger key={task.value} value={task.value}>
                  {task.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="history" className="space-y-4">
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

            {jobs === undefined ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-4/5" />
              </div>
            ) : jobs.length ? (
              <>
                <AiJobCards jobs={jobs} />
                <div className="hidden rounded-md border border-border md:block">
                  <Table aria-label="AI job table">
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
                            <AiJobStatusBadge status={job.status} />
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {aiProviderModelLabel(job.provider, job.model)}
                          </TableCell>
                          <TableCell>{job.reviewStatus}</TableCell>
                          <TableCell className="text-right">
                            {formatCost(
                              job.cost?.actualCents ?? job.cost?.estimatedCents
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                No AI jobs yet. Run a local review to exercise the auditable AI
                boundary without calling a paid model.
              </div>
            )}
          </TabsContent>

          <TabsContent value="usage" className="space-y-4">
            {usage ? (
              <>
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
                    <p className="text-xs text-muted-foreground">
                      Daily AI budget
                    </p>
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

                {Object.keys(usage.byType).length ? (
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
                        {Object.entries(usage.byProviderModel).map(
                          ([provider, count]) => (
                            <Badge key={provider} variant="outline">
                              {aiProviderModelLabelFromKey(provider)}: {count}
                            </Badge>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                    No AI usage has been recorded for this move yet.
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-5/6" />
              </div>
            )}
          </TabsContent>

          <TabsContent value="exceptions" className="space-y-4">
            {usage ? (
              usage.failedRecent.length || usage.expensiveJobs.length ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {usage.failedRecent.length ? (
                    <div className="rounded-md border border-border p-3">
                      <h3 className="text-sm font-medium">Recent failures</h3>
                      <div className="mt-3 space-y-2 text-sm">
                        {usage.failedRecent.map((job) => (
                          <div key={job.id} className="rounded-md bg-muted/40 p-2">
                            <p className="font-medium">{job.type}</p>
                            <p className="text-muted-foreground">
                              {aiProviderModelLabel(job.provider, job.model)}
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
                              {aiProviderModelLabel(job.provider, job.model)} -{" "}
                              {formatCost(job.costCents)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                  No recent failures or cost outliers for this move.
                </div>
              )
            ) : (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-5/6" />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function AiJobCards({ jobs }: { jobs: AiJob[] }) {
  return (
    <div
      role="list"
      aria-label="AI job cards"
      className="grid gap-3 md:hidden"
    >
      {jobs.map((job) => (
        <article
          key={job._id}
          role="listitem"
          className="rounded-md border border-border bg-card p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="break-words text-sm font-semibold">{job.type}</h3>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {aiProviderModelLabel(job.provider, job.model)}
              </p>
            </div>
            <AiJobStatusBadge status={job.status} />
          </div>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <AiJobCardDetail label="Review">{job.reviewStatus}</AiJobCardDetail>
            <AiJobCardDetail label="Cost">
              {formatCost(job.cost?.actualCents ?? job.cost?.estimatedCents)}
            </AiJobCardDetail>
          </div>
        </article>
      ))}
    </div>
  );
}

function AiJobStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === "failed"
          ? "destructive"
          : status === "succeeded"
            ? "secondary"
            : "outline"
      }
    >
      {status}
    </Badge>
  );
}

function AiJobCardDetail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 break-words">{children}</div>
    </div>
  );
}

function formatCost(cents: number | undefined) {
  if (typeof cents !== "number") {
    return "-";
  }
  return `$${(cents / 100).toFixed(4)}`;
}
