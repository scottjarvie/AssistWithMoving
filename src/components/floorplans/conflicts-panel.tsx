import { AlertTriangle, CheckCircle2, CircleHelp } from "lucide-react";

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
import { Separator } from "@/components/ui/separator";
import { floorplanConflicts } from "@/lib/floorplans/sample-data";

export function ConflictsPanel() {
  return (
    <div className="space-y-3" data-testid="conflicts-panel">
      <PanelIntro
        title="Conflicts"
        description="Mismatched or unresolved rules stay visible so an AI agent cannot silently combine incompatible evidence."
      />
      <div className="grid gap-2">
        {floorplanConflicts.map((conflict) => {
          const Icon =
            conflict.status === "resolved"
              ? CheckCircle2
              : conflict.status === "open"
                ? AlertTriangle
                : CircleHelp;
          return (
            <Card key={conflict.id} size="sm">
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Icon className="size-4 text-primary" aria-hidden="true" />
                    {conflict.title}
                  </CardTitle>
                  <CardDescription>{conflict.impact}</CardDescription>
                </div>
                <CardAction>
                  <Badge variant={conflict.status === "open" ? "destructive" : "secondary"}>
                    {conflict.status}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-3">
                <Separator />
                <p className="text-sm leading-6 text-muted-foreground">
                  <span className="font-medium text-foreground">Rule:</span> {conflict.rule}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {conflict.evidenceIds.map((id) => (
                    <Badge key={id} variant="outline">
                      {id}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
