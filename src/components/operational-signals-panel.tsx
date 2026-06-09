"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

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

type OperationalHealth = "ok" | "warning" | "critical";

type OperationalSignal = {
  key: string;
  label: string;
  severity: "warning" | "critical";
  value: number;
  warningAt: number;
  criticalAt: number;
  description: string;
};

type SafeAudit = {
  id: Id<"auditLogs">;
  actorType: string;
  category: string;
  action: string;
  objectTable?: string;
  objectId?: string;
  createdAt: number;
};

type ObservabilityStatus = {
  generatedAt: number;
  health: OperationalHealth;
  signals: OperationalSignal[];
  metrics: Record<string, number>;
  distributions: Record<string, Record<string, number>>;
  healthChecks: Array<{
    key: string;
    label: string;
    status: "ok" | "planned" | "warning" | "critical";
    detail: string;
  }>;
  recentEvents: SafeAudit[];
};

export function OperationalSignalsPanel() {
  const loadStatus = useMutation(api.observability.status);
  const [status, setStatus] = useState<ObservabilityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      try {
        const nextStatus = (await loadStatus({})) as ObservabilityStatus;
        if (!cancelled) {
          setStatus(nextStatus);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Could not load observability.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [loadStatus]);

  async function refresh() {
    setLoading(true);
    setMessage(null);
    try {
      const nextStatus = (await loadStatus({})) as ObservabilityStatus;
      setStatus(nextStatus);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load observability.");
    } finally {
      setLoading(false);
    }
  }

  const visibleMetrics = useMemo(
    () =>
      status
        ? [
            "authFailures24h",
            "apiEvents24h",
            "shareLinkAccesses24h",
            "exportJobs24h",
            "failedAiJobs24h",
            "aiEstimatedCents24h",
            "uploadFailures24h",
            "activeApiKeys",
            "apiRateLimitedWindows24h",
            "apiHighestWindowUsagePercent24h",
            "activeShareLinks",
          ].map((key) => [key, status.metrics[key] ?? 0] as const)
        : [],
    [status]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4 text-primary" aria-hidden="true" />
              Observability
            </CardTitle>
            <CardDescription>
              Redacted operational health, suspicious-use signals, and recent system events.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !status ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : status ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Health</p>
                <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
                  {status.health === "ok" ? (
                    <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
                  )}
                  {labelize(status.health)}
                </p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Active signals</p>
                <p className="mt-1 text-lg font-semibold">{status.signals.length}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Generated</p>
                <p className="mt-1 text-lg font-semibold">
                  {formatDate(status.generatedAt)}
                </p>
              </div>
            </div>

            {status.signals.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {status.signals.map((signal) => (
                  <div
                    key={signal.key}
                    className="rounded-md border border-destructive/30 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-medium">{signal.label}</h3>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {signal.description}
                        </p>
                      </div>
                      <Badge
                        variant={
                          signal.severity === "critical" ? "destructive" : "outline"
                        }
                      >
                        {signal.severity}
                      </Badge>
                    </div>
                    <p className="mt-3 font-mono text-xl font-semibold">
                      {formatMetric(signal.value, signal.key)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                No thresholded abuse or reliability signals are currently active.
              </p>
            )}

            <div className="grid gap-2 md:grid-cols-3">
              {visibleMetrics.map(([key, value]) => (
                <div key={key} className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">{labelize(key)}</p>
                  <p className="mt-1 font-mono text-lg font-semibold">
                    {formatMetric(value, key)}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {status.healthChecks.map((check) => (
                <div key={check.key} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{check.label}</p>
                    <Badge variant={check.status === "ok" ? "outline" : "secondary"}>
                      {check.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {check.detail}
                  </p>
                </div>
              ))}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Object</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.recentEvents.slice(0, 10).map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <div className="font-medium">{event.action}</div>
                      <div className="text-xs text-muted-foreground">
                        {event.category}
                      </div>
                    </TableCell>
                    <TableCell>{event.actorType}</TableCell>
                    <TableCell>
                      {event.objectTable ? `${event.objectTable}:${event.objectId}` : "-"}
                    </TableCell>
                    <TableCell>{formatDate(event.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        ) : null}

        {message ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMetric(value: number, key: string) {
  if (key === "photoStorageBytes") {
    return formatBytes(value);
  }
  if (key === "aiEstimatedCents24h") {
    return `$${(value / 100).toFixed(2)}`;
  }
  if (key === "apiHighestWindowUsagePercent24h") {
    return `${value.toLocaleString()}%`;
  }
  return value.toLocaleString();
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value.toLocaleString()} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function labelize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
