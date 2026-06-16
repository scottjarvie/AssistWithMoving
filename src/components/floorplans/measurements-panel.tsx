"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { Calculator, PencilRuler, Ruler } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ConfidenceBadge, PanelIntro } from "@/components/floorplans/panel-utils";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type {
  FloorplanMeasurement,
  FloorplanMeasurementKind,
  FloorplanMeasurementSubjectType,
  FloorplanSelectableSubject,
} from "@/lib/floorplans/types";
import { floorplanMeasurements } from "@/lib/floorplans/sample-data";

const kindLabels: Record<FloorplanMeasurementKind, string> = {
  known: "Known",
  assumption: "Assumption",
  derived: "Derived",
  range: "Range",
};

export function MeasurementsPanel({
  measurements = floorplanMeasurements,
  mode,
  householdId,
  moveId,
  targetPlanId,
  onMeasurementsRecorded,
  selectableSubjects = [],
  selectedSubjectKey,
}: {
  measurements?: FloorplanMeasurement[];
  mode: "public" | "move";
  householdId?: Id<"households"> | null;
  moveId?: Id<"moves"> | null;
  targetPlanId?: Id<"floorPlans"> | null;
  onMeasurementsRecorded?: (measurements: FloorplanMeasurement[]) => void;
  selectableSubjects?: FloorplanSelectableSubject[];
  selectedSubjectKey?: string | null;
}) {
  const recordMeasurement = useMutation(api.floorplanEvidence.recordMeasurement);
  const [selectedSubject, setSelectedSubject] = useState(
    selectedSubjectKey ?? "front-living",
  );
  const [widthFt, setWidthFt] = useState("");
  const [depthFt, setDepthFt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const roomOptions = useMemo(
    () => roomMeasurementSubjects(measurements, selectableSubjects),
    [measurements, selectableSubjects],
  );
  const activeSelectedSubject = selectedSubjectKey ?? selectedSubject;
  const selectedRoom =
    roomOptions.find((room) => room.subjectKey === activeSelectedSubject) ??
    roomOptions.find((room) => room.subjectKey === selectedSubjectKey) ??
    roomOptions[0];

  const visibleMeasurements = useMemo(() => {
    if (!selectedSubjectKey || !selectedRoom) {
      return measurements;
    }
    return measurements.filter(
      (measurement) => measurement.subjectKey === selectedRoom.subjectKey,
    );
  }, [measurements, selectedRoom, selectedSubjectKey]);
  const grouped = useMemo(
    () => groupMeasurements(visibleMeasurements),
    [visibleMeasurements],
  );
  const widthPlaceholder =
    measurementPlaceholder(visibleMeasurements, "width") ?? "24";
  const depthPlaceholder =
    measurementPlaceholder(visibleMeasurements, "depth") ?? "17.5";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRoom) return;
    const entries = buildUserMeasurements({
      subjectKey: selectedRoom.subjectKey,
      subjectLabel: selectedRoom.subjectLabel,
      subjectType: selectedRoom.subjectType,
      widthFt,
      depthFt,
      notes,
    });
    if (!entries.length) {
      setStatus("Enter a width, depth, or both.");
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
            kind: "known",
            valueIn: entry.valueIn,
            displayValue: entry.displayValue,
            confidence: "high",
            notes: notes || undefined,
          });
        }
      }
      onMeasurementsRecorded?.(entries);
      setWidthFt("");
      setDepthFt("");
      setNotes("");
      setStatus(
        mode === "move"
          ? "Saved as user-provided measurement evidence."
          : "Recorded locally as sample user evidence.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not save the measurement evidence.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="measurements-panel">
      <PanelIntro
        title="Measurements"
        description="Known, assumed, derived, and range measurements. User edits are treated as high-confidence evidence and immediately refresh the draft."
      />

      <Card size="sm">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <PencilRuler className="size-4 text-primary" aria-hidden="true" />
              Edit selected measurements
            </CardTitle>
            <CardDescription>
              A measurement you type here becomes authoritative user evidence and should trigger a fresh AI/solver review.
            </CardDescription>
          </div>
          <CardAction>
            <Badge variant="secondary">User evidence</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={(event) => void handleSubmit(event)}>
            <label className="grid gap-1.5 text-sm font-medium">
              Subject
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                onChange={(event) => setSelectedSubject(event.target.value)}
                value={selectedRoom?.subjectKey ?? selectedSubject}
              >
                {roomOptions.map((room) => (
                  <option key={room.subjectKey} value={room.subjectKey}>
                    {room.subjectLabel}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1.5 text-sm font-medium">
                Width / span, ft
                <Input
                  aria-label="Width, ft"
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setWidthFt(event.target.value)}
                  placeholder={widthPlaceholder}
                  step="0.01"
                  type="number"
                  value={widthFt}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Depth / clearance, ft
                <Input
                  aria-label="Depth, ft"
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setDepthFt(event.target.value)}
                  placeholder={depthPlaceholder}
                  step="0.01"
                  type="number"
                  value={depthFt}
                />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium">
              Provenance note
              <Textarea
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Measured by user with tape measure."
                rows={2}
                value={notes}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={saving} size="sm" type="submit">
                <Ruler aria-hidden="true" />
                Save evidence
              </Button>
              {status ? (
                <span className="text-xs leading-5 text-muted-foreground">{status}</span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {(["known", "derived", "range", "assumption"] as const).map((kind) => (
        <section className="space-y-2" key={kind}>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{kindLabels[kind]}</h3>
            <Badge variant="outline">{grouped[kind].length}</Badge>
          </div>
          <div className="grid gap-2">
            {grouped[kind].map((measurement) => (
              <MeasurementCard key={measurement.id} measurement={measurement} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MeasurementCard({ measurement }: { measurement: FloorplanMeasurement }) {
  return (
    <Card size="sm">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="size-4 text-primary" aria-hidden="true" />
            {measurement.subjectLabel}
          </CardTitle>
          <CardDescription>
            {measurement.measurementType}: {measurement.displayValue}
          </CardDescription>
        </div>
        <CardAction>
          <ConfidenceBadge confidence={measurement.confidence} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <Separator />
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{kindLabels[measurement.kind]}</Badge>
          <Badge variant="outline">{measurement.subjectType}</Badge>
          {measurement.status === "superseded" ? (
            <Badge variant="destructive">Superseded</Badge>
          ) : null}
        </div>
        <div className="grid gap-2">
          {measurement.provenance.map((source) => (
            <div
              className="rounded-md border border-border bg-background/60 p-2 text-xs leading-5 text-muted-foreground"
              key={source.id}
            >
              <div className="font-medium text-foreground">{source.sourceLabel}</div>
              {source.imageNumber ? <div>Image #{source.imageNumber}</div> : null}
              {source.notes ? <div>{source.notes}</div> : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function roomMeasurementSubjects(
  measurements: FloorplanMeasurement[],
  selectableSubjects: FloorplanSelectableSubject[],
) {
  const rooms = new Map<
    string,
    {
      subjectKey: string;
      subjectLabel: string;
      subjectType: FloorplanMeasurementSubjectType;
    }
  >();
  for (const subject of selectableSubjects) {
    rooms.set(subject.subjectKey, subject);
  }
  for (const measurement of measurements) {
    if (
      ![
        "room",
        "structure",
        "zone",
        "lot",
        "shell",
        "areaGroup",
        "fixture",
        "opening",
        "path",
      ].includes(measurement.subjectType)
    ) {
      continue;
    }
    rooms.set(measurement.subjectKey, {
      subjectKey: measurement.subjectKey,
      subjectLabel: measurement.subjectLabel,
      subjectType: measurement.subjectType,
    });
  }
  return [...rooms.values()];
}

function groupMeasurements(measurements: FloorplanMeasurement[]) {
  const initialGroups: Record<FloorplanMeasurementKind, FloorplanMeasurement[]> = {
    assumption: [],
    derived: [],
    known: [],
    range: [],
  };

  return measurements.reduce(
    (groups, measurement) => {
      groups[measurement.kind].push(measurement);
      return groups;
    },
    initialGroups,
  );
}

function measurementPlaceholder(
  measurements: FloorplanMeasurement[],
  measurementType: "width" | "depth",
) {
  const measurement = measurements.find(
    (entry) =>
      entry.measurementType === measurementType &&
      entry.status === "active" &&
      typeof entry.valueIn === "number",
  );
  if (!measurement?.valueIn) return null;
  return formatFeetInputValue(measurement.valueIn / 12);
}

function formatFeetInputValue(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function buildUserMeasurements({
  subjectKey,
  subjectLabel,
  subjectType,
  widthFt,
  depthFt,
  notes,
}: {
  subjectKey: string;
  subjectLabel: string;
  subjectType: FloorplanMeasurementSubjectType;
  widthFt: string;
  depthFt: string;
  notes: string;
}): FloorplanMeasurement[] {
  const now = Date.now();
  const provenance = {
    sourceType: "userEdit" as const,
    sourceLabel: "User-entered measurement",
    recordedAtLabel: new Date(now).toLocaleString(),
    recordedByLabel: "MovingManifest user",
    notes: notes || undefined,
  };
  const userMeasurements: FloorplanMeasurement[] = [];
  const widthMeasurement = measurementFromFeet({
    id: `user-${now}-width`,
    valueFt: widthFt,
    subjectKey,
    subjectLabel,
    subjectType,
    measurementType: "width",
    provenance: { ...provenance, id: `prov-user-${now}-width` },
  });
  if (widthMeasurement) userMeasurements.push(widthMeasurement);
  const depthMeasurement = measurementFromFeet({
    id: `user-${now}-depth`,
    valueFt: depthFt,
    subjectKey,
    subjectLabel,
    subjectType,
    measurementType: "depth",
    provenance: { ...provenance, id: `prov-user-${now}-depth` },
  });
  if (depthMeasurement) userMeasurements.push(depthMeasurement);
  return userMeasurements;
}

function measurementFromFeet({
  id,
  valueFt,
  subjectKey,
  subjectLabel,
  subjectType,
  measurementType,
  provenance,
}: {
  id: string;
  valueFt: string;
  subjectKey: string;
  subjectLabel: string;
  subjectType: FloorplanMeasurementSubjectType;
  measurementType: "width" | "depth";
  provenance: FloorplanMeasurement["provenance"][number];
}): FloorplanMeasurement | null {
  const parsed = Number(valueFt);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return {
    id,
    subjectType,
    subjectKey,
    subjectLabel,
    measurementType,
    kind: "known",
    status: "active",
    valueIn: parsed * 12,
    displayValue: `${parsed} ft`,
    confidence: "high",
    provenance: [provenance],
  } satisfies FloorplanMeasurement;
}
