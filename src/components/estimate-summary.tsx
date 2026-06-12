"use client";

import { useQuery } from "convex/react";
import {
  AlertTriangle,
  Boxes,
  Gauge,
  ListChecks,
  MapPinned,
  Scale3D,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MoveWorkspaceTabList } from "@/components/move-workspace-tab-list";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";

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
  const warningBoxes =
    report?.boxReports.filter(
      (box) =>
        box.warnings.length ||
        box.assignmentWarnings.length ||
        box.assignmentHardBlocks.length
    ) ?? [];
  const missingEstimateItems =
    report?.itemEstimates.filter(
      (item) =>
        item.estimate.warnings.includes("missingWeightEstimate") ||
        item.estimate.warnings.includes("missingVolumeEstimate")
    ) ?? [];
  const topRoomTotals =
    report?.roomTotals
      .slice()
      .sort((left, right) => right.itemCount - left.itemCount)
      .slice(0, 6) ?? [];

  return (
    <section className="space-y-4">
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
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-20 rounded-md" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant={warningBoxes.length ? "secondary" : "outline"}>
                  {warningBoxes.length} warning boxes
                </Badge>
                <Badge variant="outline">
                  {report.resourceReports.length} resources
                </Badge>
                <Badge variant="outline">
                  {report.roomTotals.length} room groups
                </Badge>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {report === undefined ? (
        <EstimateTabsSkeleton />
      ) : (
        <Tabs defaultValue="overview" className="gap-4">
          <MoveWorkspaceTabList
            tabs={[
              { value: "overview", label: "Overview" },
              { value: "capacity", label: "Capacity" },
              { value: "warnings", label: "Warnings" },
              { value: "assumptions", label: "Assumptions" },
            ]}
          />

          <TabsContent value="overview">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MapPinned className="size-4 text-primary" aria-hidden="true" />
                    Room and disposition rollup
                  </CardTitle>
                  <CardDescription>
                    The fastest read on where estimate work is concentrated.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 xl:grid-cols-2">
                  <BucketList
                    title="Top rooms"
                    buckets={topRoomTotals}
                    emptyText="No room estimates yet."
                  />
                  <BucketList
                    title="Disposition"
                    buckets={report.dispositionTotals}
                    emptyText="No disposition estimates yet."
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ListChecks className="size-4 text-primary" aria-hidden="true" />
                    Review posture
                  </CardTitle>
                  <CardDescription>
                    What needs attention before estimates are trusted.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
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
                  ) : (
                    <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                      No move allowance entered yet.
                    </div>
                  )}
                  <ReviewLine
                    label="Missing item weights"
                    value={report.missingWeightCount}
                  />
                  <ReviewLine
                    label="Missing item volumes"
                    value={report.missingVolumeCount}
                  />
                  <ReviewLine
                    label="Boxes with warnings"
                    value={warningBoxes.length}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="capacity">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gauge className="size-4 text-primary" aria-hidden="true" />
                  Resource capacity
                </CardTitle>
                <CardDescription>
                  Trucks, trailers, movers, and zones with weight and volume usage.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {report.resourceReports.length ? (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {report.resourceReports.map((resource) => (
                      <div
                        key={resource.resourceId}
                        className="rounded-md border border-border p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium">
                              {resource.name}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {resource.type}
                            </div>
                          </div>
                          <Gauge
                            className="size-4 text-primary"
                            aria-hidden="true"
                          />
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
                ) : (
                  <EmptyEstimateState text="No transport resources have estimate totals yet." />
                )}
                {report.zoneReports.length ? (
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Zones
                    </div>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {report.zoneReports.map((zone) => (
                        <div
                          key={zone.zoneId}
                          className="rounded-md border border-border p-3 text-sm"
                        >
                          <div className="font-medium">{zone.name}</div>
                          <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                            <span>
                              {formatNumber(zone.estimatedWeightLb)} lb
                            </span>
                            <span>
                              {formatNumber(zone.estimatedVolumeCuFt)} cu ft
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="warnings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle
                    className="size-4 text-primary"
                    aria-hidden="true"
                  />
                  Estimate warnings
                </CardTitle>
                <CardDescription>
                  Unknown estimates, heavy boxes, and assignment validation results.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <WarningBoxList warningBoxes={warningBoxes} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assumptions">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Boxes className="size-4 text-primary" aria-hidden="true" />
                  Assumptions and missing estimates
                </CardTitle>
                <CardDescription>
                  Items that still need measured, researched, or reviewed values.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {missingEstimateItems.slice(0, 12).map((item) => (
                  <div
                    key={item.itemId}
                    className="rounded-md border border-border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{item.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.room ?? "Unassigned room"} · {item.disposition}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {item.estimate.warnings.map((warning) => (
                          <Badge key={warning} variant="outline">
                            {warning}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                {!missingEstimateItems.length ? (
                  <EmptyEstimateState text="No item-level estimate gaps in the first reviewed items." />
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
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

function EstimateTabsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-8 w-64" />
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-32 rounded-md" />
        <Skeleton className="h-32 rounded-md" />
      </CardContent>
    </Card>
  );
}

function BucketList({
  title,
  buckets,
  emptyText,
}: {
  title: string;
  buckets: Array<{
    label: string;
    itemCount: number;
    estimatedWeightLb: number;
    estimatedVolumeCuFt: number;
    missingWeightCount: number;
    missingVolumeCount: number;
  }>;
  emptyText: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </div>
      {buckets.length ? (
        <div className="space-y-2">
          {buckets.map((bucket) => (
            <div
              key={bucket.label}
              className="rounded-md border border-border p-3 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{bucket.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {bucket.itemCount} items
                  </div>
                </div>
                <div className="text-right font-mono text-xs">
                  <div>{formatNumber(bucket.estimatedWeightLb)} lb</div>
                  <div>{formatNumber(bucket.estimatedVolumeCuFt)} cu ft</div>
                </div>
              </div>
              {bucket.missingWeightCount || bucket.missingVolumeCount ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {bucket.missingWeightCount ? (
                    <Badge variant="outline">
                      {bucket.missingWeightCount} missing weight
                    </Badge>
                  ) : null}
                  {bucket.missingVolumeCount ? (
                    <Badge variant="outline">
                      {bucket.missingVolumeCount} missing volume
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyEstimateState text={emptyText} />
      )}
    </div>
  );
}

function ReviewLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-lg font-semibold">{value}</span>
    </div>
  );
}

function WarningBoxList({
  warningBoxes,
}: {
  warningBoxes: Array<{
    boxId: string;
    code: string;
    label?: string;
    warnings: string[];
    assignmentWarnings: string[];
    assignmentHardBlocks: string[];
    assignmentLocked: boolean;
  }>;
}) {
  return (
    <div className="space-y-2">
      {warningBoxes.map((box) => (
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
            {box.assignmentWarnings.map((warning) => (
              <Badge key={warning} variant="secondary">
                {warning}
              </Badge>
            ))}
            {box.assignmentHardBlocks.map((block) => (
              <Badge key={block} variant="destructive">
                {block}
              </Badge>
            ))}
            {box.assignmentLocked ? <Badge variant="outline">locked</Badge> : null}
          </div>
        </div>
      ))}
      {!warningBoxes.length ? (
        <EmptyEstimateState text="No box estimate warnings yet." />
      ) : null}
    </div>
  );
}

function EmptyEstimateState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
      {text}
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
