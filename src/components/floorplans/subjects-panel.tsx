"use client";

import { Boxes, MousePointer2 } from "lucide-react";

import { ConfidenceBadge, PanelIntro } from "@/components/floorplans/panel-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  FloorplanCanonicalSubject,
  FloorplanSelection,
} from "@/lib/floorplans/types";
import { floorplanSubjects } from "@/lib/floorplans/sample-data";

export function SubjectsPanel({
  subjects = floorplanSubjects,
  onSelectionSelect,
  selectedId,
}: {
  subjects?: FloorplanCanonicalSubject[];
  onSelectionSelect?: (selection: FloorplanSelection) => void;
  selectedId?: string | null;
}) {
  return (
    <div className="space-y-3" data-testid="subjects-panel">
      <PanelIntro
        title="Subjects"
        description="Canonical rooms, halls, fixtures, openings, structures, and zones clustered from observations, relationships, and measurements."
      />

      <div className="grid gap-2">
        {subjects.map((subject) => (
          <Card
            className={
              selectedId === subject.subjectKey ? "border-primary bg-primary/10" : undefined
            }
            key={subject.subjectKey}
            size="sm"
          >
            <CardHeader>
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Boxes className="size-4 text-primary" aria-hidden="true" />
                  <span className="truncate">{subject.subjectLabel}</span>
                </CardTitle>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{subject.kind}</Badge>
                  {subject.areaRole ? <Badge variant="secondary">{subject.areaRole}</Badge> : null}
                  {subject.countsTowardArea !== undefined ? (
                    <Badge variant={subject.countsTowardArea ? "default" : "outline"}>
                      {subject.countsTowardArea ? "counts in sqft" : "excluded from sqft"}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <CardAction>
                <ConfidenceBadge confidence={subject.confidence} />
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <Metric label="observations" value={subject.observationIds.length} />
                <Metric label="relationships" value={subject.relationshipIds.length} />
                <Metric label="measurements" value={subject.measurementIds.length} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-xs leading-5 text-muted-foreground">
                  {subject.hasGeometrySeed
                    ? "Has a geometry seed."
                    : "Needs geometry evidence before drafting."}
                </div>
                {onSelectionSelect ? (
                  <Button
                    aria-label={`Inspect ${subject.subjectLabel}`}
                    onClick={() =>
                      onSelectionSelect({ kind: "subject", id: subject.subjectKey })
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <MousePointer2 aria-hidden="true" />
                    Inspect
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-2">
      <div className="text-base font-semibold text-foreground">{value}</div>
      <div>{label}</div>
    </div>
  );
}
