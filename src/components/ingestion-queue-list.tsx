"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import {
  Bot,
  Boxes,
  CheckCircle2,
  FileText,
  ListChecks,
  Map,
  Package,
  RotateCcw,
  Trash2,
  Truck,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { moveWorkspaceAnchorPath } from "@/lib/move-links";

type QueueTask = "needsAction" | "working" | "archive";

const statusLabels: Record<string, string> = {
  queued: "Queued",
  claimed: "Agent working",
  processed: "Processed — review",
  needsInput: "Needs your answer",
  resolved: "Resolved",
  discarded: "Discarded",
};

const statusOrder = [
  "needsInput",
  "processed",
  "claimed",
  "queued",
  "resolved",
  "discarded",
] as const;

const intentLabels: Record<string, string> = {
  general: "General",
  newMovableUnit: "New unit",
  newItem: "New item",
  existingBox: "Existing box",
  existingItem: "Existing item",
  boxContents: "Box contents",
  condition: "Condition",
  measurements: "Measurements",
  floorPlan: "Floorplans",
};

const queueTaskTabs: Array<{
  value: QueueTask;
  label: string;
  description: string;
}> = [
  {
    value: "needsAction",
    label: "Needs action",
    description:
      "Agent questions and processed captures waiting for your review.",
  },
  {
    value: "working",
    label: "Working",
    description:
      "Queued or claimed captures still being processed by an agent.",
  },
  {
    value: "archive",
    label: "Archive",
    description: "Resolved or discarded captures kept out of the active queue.",
  },
];

function queueTaskForStatus(status: string): QueueTask {
  if (status === "needsInput" || status === "processed") {
    return "needsAction";
  }
  if (status === "resolved" || status === "discarded") {
    return "archive";
  }
  return "working";
}

function formatQueueTaskCount(count: number) {
  return `${count} ${count === 1 ? "entry" : "entries"}`;
}

function shortIdLabel(label: string, id: string) {
  return `${label} ${id.slice(-6)}`;
}

type QueueEntry = Doc<"ingestionQueueEntries">;
type QueueResultRef = NonNullable<QueueEntry["resultRefs"]>[number];

function countRefs(refs: QueueResultRef[] | undefined, type: string) {
  return refs?.filter((ref) => ref.type === type).length ?? 0;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function queueResultSummary(entry: QueueEntry) {
  const itemCount =
    entry.resultItemIds?.length || countRefs(entry.resultRefs, "item");
  const suggestionCount =
    entry.resultSuggestionIds?.length ||
    countRefs(entry.resultRefs, "aiTextSuggestion");
  const boxCount = countRefs(entry.resultRefs, "box");
  const boxAssignmentCount = countRefs(entry.resultRefs, "boxItemAssignment");
  const loadAssignmentCount =
    countRefs(entry.resultRefs, "loadAssignmentBox") +
    countRefs(entry.resultRefs, "loadAssignmentItem");
  const planProposalCount = countRefs(entry.resultRefs, "planProposal");

  return {
    itemCount,
    suggestionCount,
    boxCount,
    boxAssignmentCount,
    loadAssignmentCount,
    planProposalCount,
  };
}

function queueTargetLabel(entry: QueueEntry) {
  if (entry.targetBoxCode) return entry.targetBoxCode;
  if (entry.targetLabel) return entry.targetLabel;
  if (entry.targetBoxId) return shortIdLabel("box", entry.targetBoxId);
  if (entry.targetItemId) return shortIdLabel("item", entry.targetItemId);
  return null;
}

export function IngestionQueueList({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const entries = useQuery(
    api.ingestionQueue.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const updateEntry = useMutation(api.ingestionQueue.updateEntry);
  const setEntryStatus = useMutation(api.ingestionQueue.setEntryStatus);

  const [editingEntryId, setEditingEntryId] =
    useState<Id<"ingestionQueueEntries"> | null>(null);
  const [editingText, setEditingText] = useState("");
  const [busyEntryId, setBusyEntryId] =
    useState<Id<"ingestionQueueEntries"> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<QueueTask>("needsAction");

  const loading = Boolean(householdId && moveId) && entries === undefined;
  const sorted = [...(entries ?? [])].sort(
    (a, b) =>
      statusOrder.indexOf(a.status as (typeof statusOrder)[number]) -
        statusOrder.indexOf(b.status as (typeof statusOrder)[number]) ||
      b.createdAt - a.createdAt,
  );
  const taskCounts = sorted.reduce<Record<QueueTask, number>>(
    (counts, entry) => {
      counts[queueTaskForStatus(entry.status)] += 1;
      return counts;
    },
    { needsAction: 0, working: 0, archive: 0 },
  );
  const headerStatus = taskCounts.needsAction
    ? `${taskCounts.needsAction} need action`
    : taskCounts.working
      ? `${taskCounts.working} working`
      : "clear";
  const activeQueueTask =
    queueTaskTabs.find((task) => task.value === activeTask) ?? queueTaskTabs[0];

  async function changeStatus(
    entryId: Id<"ingestionQueueEntries">,
    status: "queued" | "resolved" | "discarded",
  ) {
    if (!householdId || !moveId) return;
    setBusyEntryId(entryId);
    setMessage(null);
    try {
      await setEntryStatus({ householdId, moveId, entryId, status });
    } catch {
      setMessage("Could not update that entry yet.");
    } finally {
      setBusyEntryId(null);
    }
  }

  async function saveInstructions(entryId: Id<"ingestionQueueEntries">) {
    if (!householdId || !moveId) return;
    setBusyEntryId(entryId);
    setMessage(null);
    try {
      await updateEntry({
        householdId,
        moveId,
        entryId,
        instructions: editingText,
      });
      setEditingEntryId(null);
      setEditingText("");
    } catch {
      setMessage("Could not save those directions yet.");
    } finally {
      setBusyEntryId(null);
    }
  }

  function renderEntries(task: QueueTask) {
    const visibleEntries = sorted.filter(
      (entry) => queueTaskForStatus(entry.status) === task,
    );

    if (!visibleEntries.length) {
      const emptyMessage =
        task === "needsAction"
          ? "No captures need your answer or review right now."
          : task === "working"
            ? "No captures are queued or currently claimed by an agent."
            : "No resolved or discarded captures yet.";
      return (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      );
    }

    return (
      <ul className="space-y-3" aria-label={`${task} ingestion queue entries`}>
        {visibleEntries.map((entry) => {
          const editable =
            entry.status === "queued" || entry.status === "needsInput";
          const busy = busyEntryId === entry._id;
          const resultSummary = queueResultSummary(entry);
          return (
            <li key={entry._id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant={
                      entry.status === "needsInput"
                        ? "destructive"
                        : entry.status === "processed"
                          ? "default"
                          : "outline"
                    }
                  >
                    {statusLabels[entry.status] ?? entry.status}
                  </Badge>
                  {entry.scopeHint === "floorPlan" ? (
                    <Badge variant="secondary" className="gap-1">
                      <Map className="size-3" aria-hidden="true" />
                      Floorplans
                    </Badge>
                  ) : null}
                  {entry.intent ? (
                    <Badge variant="secondary">
                      {intentLabels[entry.intent] ?? entry.intent}
                    </Badge>
                  ) : null}
                  {queueTargetLabel(entry) ? (
                    <Badge variant="outline" className="gap-1">
                      {entry.targetItemId ? (
                        <Package className="size-3" aria-hidden="true" />
                      ) : (
                        <Boxes className="size-3" aria-hidden="true" />
                      )}
                      {queueTargetLabel(entry)}
                    </Badge>
                  ) : null}
                  {entry.roomHint ? (
                    <Badge variant="secondary">{entry.roomHint}</Badge>
                  ) : null}
                  <Badge variant="outline">
                    {entry.mediaPhotoIds.length} media
                  </Badge>
                  {entry.targetPlanId && moveId ? (
                    <Badge variant="outline" className="gap-1" asChild>
                      <Link href={`/app/moves/${moveId}/floorplans`}>
                        <Map className="size-3" aria-hidden="true" />
                        {shortIdLabel("plan", entry.targetPlanId)}
                      </Link>
                    </Badge>
                  ) : null}
                  {entry.claimedByAgentLabel ? (
                    <Badge variant="outline">{entry.claimedByAgentLabel}</Badge>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>

              {entry.agentQuestion ? (
                <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm">
                  Agent asks: {entry.agentQuestion}
                </p>
              ) : null}

              {editingEntryId === entry._id ? (
                <div className="mt-2 space-y-2">
                  <Textarea
                    value={editingText}
                    onChange={(event) => setEditingText(event.target.value)}
                    aria-label="Edit directions"
                    className="min-h-20"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => void saveInstructions(entry._id)}
                    >
                      Save directions
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingEntryId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : entry.instructions ? (
                <p className="mt-2 text-sm leading-6">{entry.instructions}</p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No written directions — media only.
                </p>
              )}

              {entry.agentSummary ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Agent: {entry.agentSummary}
                </p>
              ) : null}
              {resultSummary.itemCount ||
              resultSummary.suggestionCount ||
              resultSummary.boxCount ||
              resultSummary.boxAssignmentCount ||
              resultSummary.loadAssignmentCount ||
              resultSummary.planProposalCount ? (
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                  {resultSummary.itemCount ? (
                    <Badge variant="secondary" className="gap-1">
                      <Package className="size-3" aria-hidden="true" />
                      {pluralize(resultSummary.itemCount, "inventory item")}
                    </Badge>
                  ) : null}
                  {resultSummary.suggestionCount ? (
                    <Badge variant="secondary" className="gap-1">
                      <ListChecks className="size-3" aria-hidden="true" />
                      {pluralize(
                        resultSummary.suggestionCount,
                        "AI review suggestion",
                      )}
                    </Badge>
                  ) : null}
                  {resultSummary.boxCount ? (
                    <Badge variant="outline" className="gap-1">
                      <Boxes className="size-3" aria-hidden="true" />
                      {pluralize(resultSummary.boxCount, "box", "boxes")}
                    </Badge>
                  ) : null}
                  {resultSummary.boxAssignmentCount ? (
                    <Badge variant="outline" className="gap-1">
                      <Boxes className="size-3" aria-hidden="true" />
                      {pluralize(
                        resultSummary.boxAssignmentCount,
                        "packed item",
                      )}
                    </Badge>
                  ) : null}
                  {resultSummary.loadAssignmentCount ? (
                    <Badge variant="outline" className="gap-1">
                      <Truck className="size-3" aria-hidden="true" />
                      {pluralize(resultSummary.loadAssignmentCount, "load assignment")}
                    </Badge>
                  ) : null}
                  {resultSummary.planProposalCount ? (
                    <Badge variant="outline" className="gap-1">
                      <Map className="size-3" aria-hidden="true" />
                      {pluralize(resultSummary.planProposalCount, "floorplan proposal")}
                    </Badge>
                  ) : null}
                </div>
              ) : null}
              {entry.resultRefs?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {entry.resultRefs.map((ref, index) => (
                    <Badge
                      key={`${ref.type}-${ref.id}-${index}`}
                      variant={ref.type === "planProposal" ? "secondary" : "outline"}
                      className="gap-1"
                    >
                      <FileText className="size-3" aria-hidden="true" />
                      {ref.label ?? shortIdLabel(ref.type, ref.id)}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {entry.status === "processed" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {resultSummary.itemCount ? (
                    <Button type="button" size="sm" variant="outline" asChild>
                      <Link
                        href={moveWorkspaceAnchorPath(moveId, "#inventory-records")}
                      >
                        <Package aria-hidden="true" />
                        Open inventory
                      </Link>
                    </Button>
                  ) : null}
                  {resultSummary.suggestionCount ? (
                    <Button type="button" size="sm" variant="outline" asChild>
                      <Link
                        href={moveWorkspaceAnchorPath(moveId, "#ai-review-queue")}
                      >
                        <ListChecks aria-hidden="true" />
                        Review suggestions
                      </Link>
                    </Button>
                  ) : null}
                  {resultSummary.boxCount || resultSummary.boxAssignmentCount ? (
                    <Button type="button" size="sm" variant="outline" asChild>
                      <Link href={moveWorkspaceAnchorPath(moveId, "#boxes")}>
                        <Boxes aria-hidden="true" />
                        Open boxes
                      </Link>
                    </Button>
                  ) : null}
                  {resultSummary.loadAssignmentCount ? (
                    <Button type="button" size="sm" variant="outline" asChild>
                      <Link href={moveWorkspaceAnchorPath(moveId, "#load-plan")}>
                        <Truck aria-hidden="true" />
                        Open load plan
                      </Link>
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                {editable && editingEntryId !== entry._id ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setEditingEntryId(entry._id);
                      setEditingText(entry.instructions ?? "");
                    }}
                  >
                    {entry.status === "needsInput"
                      ? "Answer & requeue"
                      : "Edit directions"}
                  </Button>
                ) : null}
                {entry.status === "processed" ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => void changeStatus(entry._id, "resolved")}
                    >
                      <CheckCircle2 aria-hidden="true" />
                      Mark resolved
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void changeStatus(entry._id, "queued")}
                    >
                      <RotateCcw aria-hidden="true" />
                      Requeue
                    </Button>
                  </>
                ) : null}
                {entry.status === "discarded" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void changeStatus(entry._id, "queued")}
                  >
                    <RotateCcw aria-hidden="true" />
                    Restore
                  </Button>
                ) : null}
                {entry.status === "queued" || entry.status === "needsInput" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void changeStatus(entry._id, "discarded")}
                  >
                    <Trash2 aria-hidden="true" />
                    Discard
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Card id="ingestion-queue">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="size-4 text-primary" aria-hidden="true" />
              Agent queue
            </CardTitle>
            <CardDescription>
              Captures waiting for your AI agent, plus what it produced. Connect
              an agent with an API key from Settings.
            </CardDescription>
          </div>
          {entries !== undefined ? (
            <Badge variant={taskCounts.needsAction ? "secondary" : "outline"}>
              {headerStatus}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-4/5" />
          </div>
        ) : sorted.length ? (
          <Tabs
            value={activeTask}
            onValueChange={(value) => setActiveTask(value as QueueTask)}
            className="gap-3"
          >
            <div className="overflow-x-auto pb-1">
              <TabsList className="min-w-max" aria-label="Agent queue views">
                {queueTaskTabs.map((task) => (
                  <TabsTrigger
                    key={task.value}
                    value={task.value}
                    className="gap-2"
                    aria-label={`${task.label}: ${formatQueueTaskCount(taskCounts[task.value])}`}
                  >
                    {task.label}
                    <Badge
                      variant={
                        activeTask === task.value ? "secondary" : "outline"
                      }
                      className="h-5 min-w-5 px-1"
                    >
                      {taskCounts[task.value]}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <p className="text-sm text-muted-foreground">
              {activeQueueTask.description}
            </p>

            <TabsContent value="needsAction">
              {renderEntries("needsAction")}
            </TabsContent>
            <TabsContent value="working">
              {renderEntries("working")}
            </TabsContent>
            <TabsContent value="archive">
              {renderEntries("archive")}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-sm leading-6 text-muted-foreground">
            The queue is empty. Capture photos and notes on your phone as you
            walk through your home; then run your AI agent (Claude Code, Codex,
            Cowork) against the MovingManifest MCP server or REST API to turn
            captures into inventory. Every agent proposal comes back here and to
            AI Review for your approval.
          </div>
        )}
        {message ? (
          <p
            className="text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
