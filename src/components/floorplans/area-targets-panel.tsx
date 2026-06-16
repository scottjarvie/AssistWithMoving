"use client";

import { type FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { Home, Map, Save } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PanelIntro } from "@/components/floorplans/panel-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FloorplanAreaTarget, FloorplanMeasurement } from "@/lib/floorplans/types";

export function AreaTargetsPanel({
  areaTargets,
  householdId,
  mode,
  moveId,
  onMeasurementsRecorded,
  targetPlanId,
}: {
  areaTargets: FloorplanAreaTarget[];
  householdId?: Id<"households"> | null;
  mode: "public" | "move";
  moveId?: Id<"moves"> | null;
  onMeasurementsRecorded: (measurements: FloorplanMeasurement[]) => void;
  targetPlanId?: Id<"floorPlans"> | null;
}) {
  const recordMeasurement = useMutation(api.floorplanEvidence.recordMeasurement);
  const [conditionedSqFt, setConditionedSqFt] = useState("");
  const [lotSize, setLotSize] = useState("");
  const [excludedLabel, setExcludedLabel] = useState("Carport");
  const [excludedSqFt, setExcludedSqFt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entries = buildAreaMeasurements({
      conditionedSqFt,
      excludedLabel,
      excludedSqFt,
      lotSize,
      notes,
    });
    if (!entries.length) {
      setStatus("Enter an official area, lot size, excluded area, or all three.");
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      if (mode === "move" && householdId && moveId) {
        for (const entry of entries) {
          await recordMeasurement({
            householdId,
            moveId,
            planId: targetPlanId ?? undefined,
            subjectType: entry.subjectType,
            subjectKey: entry.subjectKey,
            subjectLabel: entry.subjectLabel,
            measurementType: entry.measurementType,
            kind: entry.kind,
            unit: entry.unit,
            value: entry.value,
            displayValue: entry.displayValue,
            confidence: evidenceConfidence(entry.confidence),
            areaRole: entry.areaRole,
            constraintStrength: entry.constraintStrength,
            notes: notes || undefined,
          });
        }
      }
      onMeasurementsRecorded(entries);
      setConditionedSqFt("");
      setLotSize("");
      setExcludedSqFt("");
      setStatus(
        mode === "move"
          ? "Saved area target evidence."
          : "Recorded locally as sample area evidence.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save area evidence.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="area-targets-panel">
      <PanelIntro
        title="Area Targets"
        description="Official square footage, suspected square footage, lot size, and excluded structures become solver constraints and displayed calculations."
      />
      <Card size="sm">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Home className="size-4 text-primary" aria-hidden="true" />
              Add area evidence
            </CardTitle>
            <CardDescription>
              Known values are weighted targets; they do not overwrite measured rooms.
            </CardDescription>
          </div>
          <CardAction>
            <Badge variant="secondary">Weighted target</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={(event) => void handleSubmit(event)}>
            <label className="grid gap-1.5 text-sm font-medium">
              Official/suspected conditioned area, sq ft
              <Input
                inputMode="decimal"
                min="0"
                onChange={(event) => setConditionedSqFt(event.target.value)}
                placeholder="2013"
                type="number"
                value={conditionedSqFt}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1.5 text-sm font-medium">
                Excluded area label
                <Input
                  onChange={(event) => setExcludedLabel(event.target.value)}
                  placeholder="Carport, patio, workshop, shed"
                  value={excludedLabel}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Excluded area, sq ft
                <Input
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setExcludedSqFt(event.target.value)}
                  placeholder="300"
                  type="number"
                  value={excludedSqFt}
                />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium">
              Lot size, sq ft
              <Input
                inputMode="decimal"
                min="0"
                onChange={(event) => setLotSize(event.target.value)}
                placeholder="9540"
                step="1"
                type="number"
                value={lotSize}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Provenance note
              <Textarea
                onChange={(event) => setNotes(event.target.value)}
                placeholder="From listing, appraisal, county record, user estimate, or tape measurement."
                rows={2}
                value={notes}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={saving} size="sm" type="submit">
                <Save aria-hidden="true" />
                Save area evidence
              </Button>
              {status ? (
                <span className="text-xs leading-5 text-muted-foreground">{status}</span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-2">
        {areaTargets.map((target) => (
          <Card key={target.id} size="sm">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Map className="size-4 text-primary" aria-hidden="true" />
                  {target.label}
                </CardTitle>
                <CardDescription>
                  {target.measurementType}: {formatTarget(target)}
                </CardDescription>
              </div>
              <CardAction>
                <Badge variant="outline">{target.strength}</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">{target.areaRole}</Badge>
              <Badge variant="outline">{target.confidence}</Badge>
              <Badge variant="outline">{target.sourceMeasurementIds.length} sources</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function buildAreaMeasurements({
  conditionedSqFt,
  excludedLabel,
  excludedSqFt,
  lotSize,
  notes,
}: {
  conditionedSqFt: string;
  excludedLabel: string;
  excludedSqFt: string;
  lotSize: string;
  notes: string;
}): FloorplanMeasurement[] {
  const now = Date.now();
  const provenanceBase = {
    sourceType: "userEdit" as const,
    sourceLabel: "User-entered area evidence",
    recordedAtLabel: new Date(now).toLocaleString(),
    recordedByLabel: "MovingManifest user",
    notes: notes || undefined,
  };
  const entries: FloorplanMeasurement[] = [];
  const conditioned = positiveNumber(conditionedSqFt);
  if (conditioned) {
    entries.push({
      id: `user-${now}-conditioned-area`,
      subjectType: "plan",
      subjectKey: "conditioned-area-target",
      subjectLabel: "Conditioned area target",
      measurementType: "conditionedArea",
      kind: "known",
      status: "active",
      unit: "sqft",
      value: conditioned,
      displayValue: `${conditioned.toLocaleString()} sq ft`,
      confidence: "high",
      areaRole: "conditioned",
      constraintStrength: "strong",
      provenance: [{ ...provenanceBase, id: `prov-user-${now}-conditioned-area` }],
    });
  }
  const excluded = positiveNumber(excludedSqFt);
  if (excluded) {
    const subjectLabel = excludedLabel.trim() || "Excluded area";
    const subjectKey = subjectLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    entries.push({
      id: `user-${now}-excluded-area`,
      subjectType: "structure",
      subjectKey,
      subjectLabel,
      measurementType: "excludedArea",
      kind: "known",
      status: "active",
      unit: "sqft",
      value: excluded,
      displayValue: `${excluded.toLocaleString()} sq ft`,
      confidence: "high",
      areaRole: "excluded",
      constraintStrength: "strong",
      provenance: [{ ...provenanceBase, id: `prov-user-${now}-excluded-area` }],
    });
  }
  const lot = positiveNumber(lotSize);
  if (lot) {
    entries.push({
      id: `user-${now}-lot-area`,
      subjectType: "lot",
      subjectKey: "lot",
      subjectLabel: "Property lot",
      measurementType: "lotArea",
      kind: "known",
      status: "active",
      unit: "sqft",
      value: lot,
      displayValue: `${lot.toLocaleString()} sq ft`,
      confidence: "high",
      areaRole: "outdoor",
      constraintStrength: "strong",
      provenance: [{ ...provenanceBase, id: `prov-user-${now}-lot-area` }],
    });
  }
  return entries;
}

function positiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatTarget(target: FloorplanAreaTarget) {
  if (typeof target.valueSqFt === "number") {
    return `${Math.round(target.valueSqFt).toLocaleString()} sq ft`;
  }
  if (typeof target.minSqFt === "number" && typeof target.maxSqFt === "number") {
    return `${Math.round(target.minSqFt).toLocaleString()}-${Math.round(
      target.maxSqFt,
    ).toLocaleString()} sq ft`;
  }
  return "range unknown";
}

function evidenceConfidence(confidence: FloorplanMeasurement["confidence"]) {
  return confidence === "conflict" ? "low" : confidence;
}
