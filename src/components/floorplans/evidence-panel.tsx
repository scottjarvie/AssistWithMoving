import { ClipboardCheck, FileText } from "lucide-react";

import { ConfidenceBadge, PanelIntro, SourcePills } from "@/components/floorplans/panel-utils";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  floorplanEvidence,
  floorplanKnownFacts,
} from "@/lib/floorplans/sample-data";

export function EvidencePanel({
  view = "evidence",
}: {
  view?: "evidence" | "knownTruths";
}) {
  if (view === "knownTruths") {
    return <KnownTruthsPanel />;
  }

  return (
    <div className="space-y-3" data-testid="evidence-panel">
      <PanelIntro
        title="Evidence"
        description="What each image or note directly supports before the app turns it into a drawn room, fixture, or question."
      />
      <div className="grid gap-2">
        {floorplanEvidence.map((entry) => (
          <Card key={entry.id} size="sm">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-4 text-primary" aria-hidden="true" />
                  {entry.sourceTitle}
                </CardTitle>
                <CardDescription>{entry.summary}</CardDescription>
              </div>
              <CardAction>
                <ConfidenceBadge confidence={entry.confidence} />
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              <Separator />
              <ul className="space-y-1 text-sm leading-6 text-muted-foreground">
                {entry.facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function KnownTruthsPanel() {
  return (
    <div className="space-y-3" data-testid="known-truths-panel">
      <PanelIntro
        title="Known Truths"
        description="Facts that should be stored as durable evidence-backed truths until new evidence changes them."
      />
      <div className="grid gap-2">
        {floorplanKnownFacts.map((fact) => (
          <Card key={fact.id} size="sm">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="size-4 text-primary" aria-hidden="true" />
                  {fact.label}
                </CardTitle>
                <CardDescription>{fact.statement}</CardDescription>
              </div>
              <CardAction>
                <ConfidenceBadge confidence={fact.confidence} />
              </CardAction>
            </CardHeader>
            <CardContent>
              <SourcePills sourceIds={fact.sourceIds} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
