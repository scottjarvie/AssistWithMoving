"use client";

import { Archive, CircleAlert, RotateCw, Sparkles } from "lucide-react";

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
import { Separator } from "@/components/ui/separator";
import type {
  FloorplanDraftState,
  FloorplanSolveResult,
} from "@/lib/floorplans/types";

export function DraftPreviewPanel({
  draft,
  onRegenerate,
  onTrashDraft,
  solve,
}: {
  draft: FloorplanDraftState;
  onRegenerate?: () => void;
  onTrashDraft?: () => void;
  solve?: FloorplanSolveResult | null;
}) {
  const blocked = draft.status === "blocked" || draft.status === "notGenerated";

  return (
    <div className="space-y-3" data-testid="draft-preview-panel">
      <PanelIntro
        title="Draft Preview"
        description="The preview is intentionally empty until the evidence graph can support a non-overlapping, provenance-backed layout."
      />

      <Card size="sm">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              {draft.title}
            </CardTitle>
            <CardDescription>{draft.summary}</CardDescription>
          </div>
          <CardAction>
            <Badge variant={blocked ? "outline" : "default"}>{draft.status}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          {solve ? (
            <div className="grid gap-2">
              <div className="rounded-md border border-primary/30 bg-primary/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Data quality</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">
                      {solve.dataQuality?.summary ?? "Generated from evidence graph."}
                    </div>
                  </div>
                  <div className="font-mono text-2xl font-semibold">
                    {solve.dataQuality?.overall ?? 0}%
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <QualityMetric label="Dimensions" value={solve.dataQuality?.dimensions} />
                <QualityMetric label="Topology" value={solve.dataQuality?.topology} />
                <QualityMetric label="Area" value={solve.dataQuality?.area} />
                <QualityMetric label="Openings" value={solve.dataQuality?.openings} />
                <QualityMetric label="Property" value={solve.dataQuality?.property} />
                <QualityMetric
                  label="Unresolved"
                  value={Math.max(0, 100 - (solve.unresolvedGeometry?.length ?? 0) * 12)}
                />
              </div>
              {solve.gaps.length ? (
                <div className="rounded-md border border-border bg-background/65 p-3 text-sm">
                  <div className="font-medium">Best next measurement</div>
                  <div className="mt-1 text-muted-foreground">
                    {solve.gaps[0]?.question}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border bg-background/60 p-4 text-sm leading-6 text-muted-foreground">
              No active solved geometry is shown here. The old sample drawing has been
              removed from the product path so users and agents review evidence first.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onRegenerate} size="sm" type="button">
              <RotateCw aria-hidden="true" />
              Regenerate layout
            </Button>
            <Button onClick={onTrashDraft} size="sm" type="button" variant="outline">
              <Archive aria-hidden="true" />
              Trash draft / start over
            </Button>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="text-sm font-medium">Validation diagnostics</div>
            {draft.diagnostics.length ? (
              <div className="grid gap-2">
                {draft.diagnostics.map((diagnostic) => (
                  <div
                    className="rounded-md border border-border bg-background/65 p-2 text-sm"
                    key={diagnostic.id}
                  >
                    <div className="flex items-start gap-2">
                      <CircleAlert
                        className={
                          diagnostic.severity === "conflict"
                            ? "mt-0.5 size-4 shrink-0 text-destructive"
                            : "mt-0.5 size-4 shrink-0 text-primary"
                        }
                        aria-hidden="true"
                      />
                      <div>
                        <div className="font-medium">{diagnostic.title}</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">
                          {diagnostic.detail}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                No diagnostics yet. Run extraction or record evidence first.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function QualityMetric({
  label,
  value,
}: {
  label: string;
  value: number | undefined;
}) {
  return (
    <div className="rounded-md border border-border bg-background/65 p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold">{value ?? 0}%</div>
    </div>
  );
}
