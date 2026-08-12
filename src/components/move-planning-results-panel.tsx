"use client";

import { useQuery } from "convex/react";
import { CheckCircle2, ExternalLink, Sparkles } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const kindLabels = {
  decision: "Decision",
  estimate: "Estimate",
  planResult: "Plan result",
  sourceCheck: "Source check",
} as const;

export function MovePlanningResultsPanel({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const result = useQuery(
    api.mcpPlanning.listForMove,
    householdId && moveId ? { householdId, moveId, limit: 100 } : "skip",
  );

  return (
    <Card id="planning-results">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          Saved move work
        </CardTitle>
        <CardDescription>
          Decisions, estimates, plan results, and source checks your AI saved to
          this move remain visible here for review and correction.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!moveId || result === undefined ? (
          <div className="space-y-3" aria-label="Loading saved move work">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-5/6" />
          </div>
        ) : result.records.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {result.records.map((record) => (
              <article
                key={record.planningRecordId}
                className="rounded-lg border border-border bg-background p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium leading-5">{record.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {kindLabels[record.kind]}
                    </p>
                  </div>
                  <Badge variant={record.status === "confirmed" ? "default" : "outline"}>
                    {record.status}
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {record.summary}
                </p>
                {record.source?.url ? (
                  <a
                    href={record.source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {record.source.publisher ?? record.source.title ?? "Open source"}
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                ) : null}
                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  Your AI via MCP · version {record.version}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            No AI planning results have been saved for this move yet. Connect a
            supported AI from the MCP guide, then ask it to save the finished
            decision, estimate, plan, or source check here.
          </div>
        )}
        {result?.hasMore ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing the 100 most recently updated records.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
