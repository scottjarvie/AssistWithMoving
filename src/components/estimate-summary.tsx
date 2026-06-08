"use client";

import { useQuery } from "convex/react";
import { AlertTriangle, Gauge, Scale3D } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type EstimateSummaryProps = {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
};

function formatNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
    : "0";
}

export function EstimateSummary({ householdId, moveId }: EstimateSummaryProps) {
  const report = useQuery(
    api.estimates.reportForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  );

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Scale3D className="size-4 text-primary" aria-hidden="true" />
                Estimates and capacity
              </CardTitle>
              <CardDescription>
                Deterministic totals for weight, volume, boxes, and resources.
              </CardDescription>
            </div>
            <Badge variant="secondary">manual values win</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {report === undefined ? (
            <div className="grid gap-2 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-20 rounded-md" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-4">
                <EstimateMetric
                  label="Weight"
                  value={`${formatNumber(report.totalEstimatedWeightLb)} lb`}
                />
                <EstimateMetric
                  label="Volume"
                  value={`${formatNumber(report.totalEstimatedVolumeCuFt)} cu ft`}
                />
                <EstimateMetric
                  label="Missing weight"
                  value={report.missingWeightCount}
                />
                <EstimateMetric
                  label="Missing volume"
                  value={report.missingVolumeCount}
                />
              </div>
              {report.moveAllowanceLb ? (
                <div className="rounded-md border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      Move allowance
                    </span>
                    <span className="font-mono">
                      {formatNumber(report.totalEstimatedWeightLb)} /{" "}
                      {formatNumber(report.moveAllowanceLb)} lb
                    </span>
                  </div>
                </div>
              ) : null}
              <div className="grid gap-3 xl:grid-cols-2">
                {report.resourceReports.map((resource) => (
                  <div
                    key={resource.resourceId}
                    className="rounded-md border border-border p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">{resource.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {resource.type}
                        </div>
                      </div>
                      <Gauge className="size-4 text-primary" aria-hidden="true" />
                    </div>
                    <div className="mt-3 grid gap-2 text-xs">
                      <CapacityLine
                        label="Weight"
                        value={resource.estimatedWeightLb}
                        max={resource.maxWeightLb}
                        percent={resource.weightPercent}
                        unit="lb"
                      />
                      <CapacityLine
                        label="Volume"
                        value={resource.estimatedVolumeCuFt}
                        max={resource.maxVolumeCuFt}
                        percent={resource.volumePercent}
                        unit="cu ft"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-primary" aria-hidden="true" />
            Estimate warnings
          </CardTitle>
          <CardDescription>
            Unknown estimates and heavy boxes before assignment validation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {report === undefined ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-5/6" />
            </div>
          ) : (
            <div className="space-y-2">
              {report.boxReports
                .filter((box) => box.warnings.length)
                .slice(0, 8)
                .map((box) => (
                  <div
                    key={box.boxId}
                    className="rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <div className="font-medium">
                      {box.code}
                      {box.label ? ` - ${box.label}` : ""}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {box.warnings.map((warning) => (
                        <Badge key={warning} variant="outline">
                          {warning}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              {report.boxReports.every((box) => !box.warnings.length) ? (
                <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No box estimate warnings yet.
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function EstimateMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
    </div>
  );
}

function CapacityLine({
  label,
  value,
  max,
  percent,
  unit,
}: {
  label: string;
  value: number;
  max?: number;
  percent?: number;
  unit: string;
}) {
  return (
    <div>
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span>
          {formatNumber(value)}
          {max ? ` / ${formatNumber(max)}` : ""} {unit}
        </span>
      </div>
      {typeof percent === "number" ? (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary"
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
