import type { LucideIcon } from "lucide-react";
import { Calculator, Layers3, Ruler } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { floorplanMeasurements } from "@/lib/floorplans/sample-data";

export function EvidenceCalculationsPanel() {
  const activeMeasurements = floorplanMeasurements.filter(
    (measurement) => measurement.status === "active",
  );
  const conditionedTarget = activeMeasurements.find(
    (measurement) => measurement.measurementType === "conditionedArea",
  );
  const lotTarget = activeMeasurements.find(
    (measurement) => measurement.measurementType === "lotArea",
  );
  const excluded = activeMeasurements.filter(
    (measurement) => measurement.measurementType === "excludedArea",
  );
  const excludedLow = excluded.reduce(
    (sum, measurement) => sum + (measurement.minValue ?? measurement.value ?? 0),
    0,
  );
  const excludedHigh = excluded.reduce(
    (sum, measurement) => sum + (measurement.maxValue ?? measurement.value ?? 0),
    0,
  );

  return (
    <div className="space-y-3" data-testid="calculations-panel">
      <Card size="sm">
        <CardHeader>
          <div>
            <CardTitle>Calculations</CardTitle>
            <CardDescription>
              Durable calculations should be recomputed from evidence before a
              draft is generated.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2">
          <CalculationRow
            icon={Ruler}
            label="Listed conditioned area"
            value={conditionedTarget?.displayValue ?? "unknown"}
          />
          <CalculationRow
            icon={Layers3}
            label="Listed lot size"
            value={lotTarget?.displayValue ?? "unknown"}
          />
          <CalculationRow
            icon={Calculator}
            label="Excluded known/estimated structures"
            value={`${Math.round(excludedLow).toLocaleString()}-${Math.round(
              excludedHigh,
            ).toLocaleString()} sq ft`}
          />
          <div className="rounded-md border border-dashed border-border bg-background/60 p-3 text-sm leading-6 text-muted-foreground">
            Room-by-room solved area, variance, missing area, and lot coverage
            are intentionally pending until the evidence graph generates a
            valid draft.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CalculationRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/65 p-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <span className="shrink-0 font-medium">{value}</span>
    </div>
  );
}
