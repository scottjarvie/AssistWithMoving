import { GitBranch } from "lucide-react";

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
import { floorplanAssumptions } from "@/lib/floorplans/sample-data";

export function AssumptionsPanel() {
  return (
    <div className="space-y-3" data-testid="assumptions-panel">
      <PanelIntro
        title="Assumptions"
        description="The logic layer: if the evidence is true, this is what the floorplan agent is allowed to infer."
      />
      <div className="grid gap-2">
        {floorplanAssumptions.map((assumption) => (
          <Card key={assumption.id} size="sm">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="size-4 text-primary" aria-hidden="true" />
                  {assumption.premise}
                </CardTitle>
                <CardDescription>{assumption.inference}</CardDescription>
              </div>
              <CardAction>
                <ConfidenceBadge confidence={assumption.confidence} />
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              <Separator />
              <p className="text-sm leading-6 text-muted-foreground">
                <span className="font-medium text-foreground">Risk:</span> {assumption.risk}
              </p>
              <SourcePills sourceIds={assumption.sourceIds} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
