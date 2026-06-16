"use client";

import { GitBranch, Link2 } from "lucide-react";

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
  FloorplanRelationship,
  FloorplanSelection,
} from "@/lib/floorplans/types";
import { floorplanRelationships } from "@/lib/floorplans/sample-data";

export function RelationshipsPanel({
  relationships = floorplanRelationships,
  onSelectionSelect,
  selectedId,
}: {
  relationships?: FloorplanRelationship[];
  onSelectionSelect?: (selection: FloorplanSelection) => void;
  selectedId?: string | null;
}) {
  const activeRelationships = relationships.filter(
    (relationship) =>
      relationship.status === "active" || relationship.status === "needsReview",
  );

  return (
    <div className="space-y-3" data-testid="relationships-panel">
      <PanelIntro
        title="Relationships"
        description="The topology graph: what touches, connects, contains, conflicts, counts toward area, or should be excluded."
      />

      <div className="grid gap-2">
        {activeRelationships.map((relationship) => (
          <Card
            className={
              selectedId === relationship.id ? "border-primary bg-primary/10" : undefined
            }
            key={relationship.id}
            size="sm"
          >
            <CardHeader>
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <GitBranch className="size-4 text-primary" aria-hidden="true" />
                  <span className="truncate">
                    {relationship.fromSubjectLabel} → {relationship.toSubjectLabel}
                  </span>
                </CardTitle>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{relationship.relationshipType}</Badge>
                  <Badge variant={relationship.status === "active" ? "default" : "outline"}>
                    {relationship.status}
                  </Badge>
                </div>
              </div>
              <CardAction>
                <ConfidenceBadge confidence={relationship.confidence} />
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {relationship.notes ? (
                <p className="leading-6 text-muted-foreground">{relationship.notes}</p>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-xs leading-5 text-muted-foreground">
                  {relationship.provenance.map((source) => source.sourceLabel).join("; ")}
                </div>
                {onSelectionSelect ? (
                  <Button
                    aria-label={`Inspect relationship ${relationship.fromSubjectLabel} to ${relationship.toSubjectLabel}`}
                    onClick={() =>
                      onSelectionSelect({ kind: "relationship", id: relationship.id })
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Link2 aria-hidden="true" />
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
