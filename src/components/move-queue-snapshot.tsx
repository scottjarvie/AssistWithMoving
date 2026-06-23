"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowRight, Inbox, Plus } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { moveWorkspaceAnchorPath, moveWorkspacePath } from "@/lib/move-links";
import { cn } from "@/lib/utils";

// Compact, queue-forward summary shown at the top of the move home so the
// pending capture work is the first thing you see — not buried behind tabs.
export function MoveQueueSnapshot({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const entries = useQuery(
    api.ingestionQueue.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  );

  if (!householdId || !moveId) {
    return null;
  }

  if (!Array.isArray(entries)) {
    return <Skeleton className="h-[4.5rem] rounded-lg" />;
  }

  const needsYou = entries.filter(
    (entry) => entry.status === "needsInput" || entry.status === "processed"
  ).length;
  const working = entries.filter(
    (entry) => entry.status === "queued" || entry.status === "claimed"
  ).length;
  const done = entries.filter((entry) => entry.status === "resolved").length;

  const queuePath = moveWorkspaceAnchorPath(moveId, "#ingestion-queue");
  const addPath = moveWorkspacePath(moveId, "capture");
  const empty = entries.length === 0;

  return (
    <section
      aria-label="Capture queue"
      className="rounded-lg border border-border bg-card/60 p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Inbox className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Capture queue</h3>
        </div>
        <Button asChild size="sm" variant={needsYou > 0 ? "default" : "outline"}>
          <Link href={queuePath}>
            {needsYou > 0 ? "Review" : "Open queue"}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {empty ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Nothing captured yet — add photos or notes for your AI agent to work.
          </p>
          <Button asChild size="sm" variant="ghost" className="h-8">
            <Link href={addPath}>
              <Plus aria-hidden="true" />
              Add
            </Link>
          </Button>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <QueueStat label="Needs you" value={needsYou} highlight={needsYou > 0} />
          <QueueStat label="Working" value={working} />
          <QueueStat label="Done" value={done} />
        </div>
      )}
    </section>
  );
}

function QueueStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border/70 px-2.5 py-1.5",
        highlight && "border-primary/40 bg-primary/5"
      )}
    >
      <p
        className={cn(
          "text-lg font-semibold leading-none tabular-nums",
          highlight && "text-primary"
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[0.68rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
