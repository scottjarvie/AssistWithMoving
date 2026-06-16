import { AlertTriangle, CheckCircle2, CircleHelp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { FloorplanConfidence } from "@/lib/floorplans/types";
import { cn } from "@/lib/utils";

export function ConfidenceBadge({
  confidence,
}: {
  confidence: FloorplanConfidence;
}) {
  const label =
    confidence === "high"
      ? "High"
      : confidence === "medium"
        ? "Medium"
        : confidence === "low"
          ? "Low"
          : "Conflict";
  const Icon =
    confidence === "conflict"
      ? AlertTriangle
      : confidence === "low"
        ? CircleHelp
        : CheckCircle2;

  return (
    <Badge
      variant={confidence === "high" ? "default" : confidence === "conflict" ? "destructive" : "secondary"}
      className={cn(
        confidence === "medium" && "bg-sky-500/15 text-sky-200",
        confidence === "low" && "bg-muted text-muted-foreground",
      )}
    >
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}

export function SourcePills({ sourceIds }: { sourceIds: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {sourceIds.map((sourceId) => (
        <Badge key={sourceId} variant="outline">
          {sourceId}
        </Badge>
      ))}
    </div>
  );
}

export function PanelIntro({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-base font-semibold tracking-normal">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
