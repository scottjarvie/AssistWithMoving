import { ListChecks } from "lucide-react";

import { PanelIntro } from "@/components/floorplans/panel-utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { sortedGapPriorities } from "@/lib/floorplans/sample-data";
import type { FloorplanGapCategory, FloorplanGapPriority } from "@/lib/floorplans/types";

const categoryLabels: Record<FloorplanGapCategory, string> = {
  "scale-largest-unknown": "Largest unknown area",
  "resolve-conflicts": "Resolves conflicts",
  "mover-path": "Mover path",
  "nice-to-have": "Nice to have",
};

export function GapPriorityPanel({ gaps }: { gaps?: FloorplanGapPriority[] }) {
  const displayedGaps = gaps ?? sortedGapPriorities();

  return (
    <div className="space-y-3" data-testid="gap-priority-panel">
      <PanelIntro
        title="Fill in the Gaps"
        description="Sorted by expected value: largest unknown scale first, then conflict resolution, mover-path accuracy, and optional detail."
      />
      <div className="grid gap-2">
        {displayedGaps.map((gap, index) => (
          <Card key={gap.id} size="sm">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-xs font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  {gap.question}
                </CardTitle>
                <CardDescription>{gap.whyItHelps}</CardDescription>
              </div>
              <CardAction>
                <Badge variant="outline">{gap.impactScore}</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">
                  <ListChecks aria-hidden="true" />
                  {categoryLabels[gap.category]}
                </Badge>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                <span className="font-medium text-foreground">Best answer:</span> {gap.answerFormat}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
