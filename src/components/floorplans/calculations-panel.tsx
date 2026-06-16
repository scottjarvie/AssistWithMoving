"use client";

import { Calculator, TriangleAlert } from "lucide-react";

import { ConfidenceBadge, PanelIntro } from "@/components/floorplans/panel-utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type {
  FloorplanAreaSummary,
  FloorplanCalculation,
  FloorplanSolveDiagnostic,
} from "@/lib/floorplans/types";

export function CalculationsPanel({
  calculations,
  diagnostics,
  summary,
}: {
  calculations: FloorplanCalculation[];
  diagnostics: FloorplanSolveDiagnostic[];
  summary: FloorplanAreaSummary;
}) {
  const areaDiagnostics = diagnostics.filter((diagnostic) =>
    diagnostic.id.includes("area") || diagnostic.id.includes("excluded"),
  );
  return (
    <div className="space-y-3" data-testid="calculations-panel">
      <PanelIntro
        title="Calculations"
        description="Derived totals from the evidence ledger. These are shown to users and included in agent context."
      />
      <AreaSummaryCard summary={summary} />
      {areaDiagnostics.length ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4 text-amber-500" aria-hidden="true" />
              Calculation diagnostics
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {areaDiagnostics.map((diagnostic) => (
              <div
                className="rounded-md border border-border bg-background/60 p-2 text-xs leading-5"
                key={diagnostic.id}
              >
                <div className="font-medium">{diagnostic.title}</div>
                <div className="text-muted-foreground">{diagnostic.detail}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-2">
        {calculations.map((calculation) => (
          <Card key={calculation.id} size="sm">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="size-4 text-primary" aria-hidden="true" />
                  {calculation.label}
                </CardTitle>
                <CardDescription>
                  {calculation.formulaName} to {calculation.outputMeasurementType}
                </CardDescription>
              </div>
              <CardAction>
                <ConfidenceBadge confidence={calculation.confidence} />
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-lg font-semibold">{calculation.displayValue}</div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">{calculation.kind}</Badge>
                <Badge variant="outline">{calculation.unit}</Badge>
                <Badge variant="outline">
                  {calculation.inputMeasurementIds.length} inputs
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AreaSummaryCard({ summary }: { summary: FloorplanAreaSummary }) {
  return (
    <Card data-testid="area-reconciliation-card" size="sm">
      <CardHeader>
        <div>
          <CardTitle>Area reconciliation</CardTitle>
          <CardDescription>
            Official/suspected target compared with solved layout totals.
          </CardDescription>
        </div>
        <CardAction>
          <Badge variant={summary.status === "withinTarget" ? "default" : "outline"}>
            {summary.status}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Metric label="Target" value={formatMaybeSqFt(summary.officialTargetSqFt)} />
          <Metric label="Conditioned" value={formatSqFt(summary.conditionedSqFt)} />
          <Metric label="Excluded" value={formatSqFt(summary.excludedSqFt)} />
          <Metric label="Outdoor" value={formatSqFt(summary.outdoorSqFt)} />
          <Metric label="Footprint" value={formatSqFt(summary.footprintSqFt)} />
          <Metric label="Unknown" value={formatSqFt(summary.unknownSqFt)} />
        </div>
        <Separator />
        <div className="grid gap-1 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Variance</span>
            <span className="font-medium">
              {summary.varianceSqFt === undefined
                ? "No target"
                : `${formatSqFt(summary.varianceSqFt)} (${Math.round(
                    (summary.variancePercent ?? 0) * 10,
                  ) / 10}%)`}
            </span>
          </div>
          {summary.lotSqFt ? (
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Lot coverage</span>
              <span className="font-medium">
                {Math.round((summary.lotCoveragePercent ?? 0) * 10) / 10}%
              </span>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}

function formatMaybeSqFt(value: number | undefined) {
  return value === undefined ? "Not set" : formatSqFt(value);
}

function formatSqFt(value: number) {
  return `${Math.round(value).toLocaleString()} sq ft`;
}
