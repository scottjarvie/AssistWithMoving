"use client";

import { Eye, FileSearch } from "lucide-react";

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
import { Separator } from "@/components/ui/separator";
import type {
  FloorplanObservation,
  FloorplanSelection,
} from "@/lib/floorplans/types";
import { floorplanObservations } from "@/lib/floorplans/sample-data";

export function ObservationsPanel({
  observations = floorplanObservations,
  onSelectionSelect,
  selectedId,
}: {
  observations?: FloorplanObservation[];
  onSelectionSelect?: (selection: FloorplanSelection) => void;
  selectedId?: string | null;
}) {
  const activeObservations = observations.filter(
    (observation) =>
      observation.status === "active" || observation.status === "needsReview",
  );

  return (
    <div className="space-y-3" data-testid="observations-panel">
      <PanelIntro
        title="Observations"
        description="Atomic things the AI or user saw: labels, measurements, walls, openings, fixtures, exterior structures, lot clues, and unknown marks."
      />

      <div className="grid gap-2">
        {activeObservations.map((observation) => (
          <Card
            className={
              selectedId === observation.id ? "border-primary bg-primary/10" : undefined
            }
            key={observation.id}
            size="sm"
          >
            <CardHeader>
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileSearch className="size-4 text-primary" aria-hidden="true" />
                  <span className="truncate">{observation.title}</span>
                </CardTitle>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{observation.observationType}</Badge>
                  {observation.subjectLabel ? (
                    <Badge variant="secondary">{observation.subjectLabel}</Badge>
                  ) : null}
                  <Badge variant={observation.status === "active" ? "default" : "outline"}>
                    {observation.status}
                  </Badge>
                </div>
              </div>
              <CardAction>
                <ConfidenceBadge confidence={observation.confidence} />
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {observation.rawText ? (
                <div className="rounded-md border border-border bg-background/60 p-2">
                  <div className="text-xs font-medium text-muted-foreground">Raw text</div>
                  <div className="mt-1">{observation.rawText}</div>
                </div>
              ) : null}
              {observation.notes ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  {observation.notes}
                </p>
              ) : null}
              <Separator />
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-xs leading-5 text-muted-foreground">
                  {observation.sourceLabel}
                  {observation.imageNumber ? ` · Image #${observation.imageNumber}` : ""}
                </div>
                {onSelectionSelect ? (
                  <Button
                    aria-label={`Inspect ${observation.title}`}
                    onClick={() =>
                      onSelectionSelect({ kind: "observation", id: observation.id })
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Eye aria-hidden="true" />
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
