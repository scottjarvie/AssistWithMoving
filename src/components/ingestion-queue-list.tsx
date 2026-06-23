"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ImageOff,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
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
import { moveWorkspacePath } from "@/lib/move-links";

type QueueTask = "needsAction" | "working" | "archive";

const scopeHintLabels: Record<string, string> = {
  singleItem: "Single item",
  multipleItems: "Multiple items",
  scene: "Scene",
};

// Renders thumbnails for an entry's media. getDisplayUrl is an action returning
// a short-lived signed/edge URL per photo, so we resolve them on mount the same
// way PhotoEvidenceStrip does. Only images resolve; audio/video and unresolved
// photos fall back to a count chip rendered by the caller.
function QueueMediaThumbnails({
  householdId,
  moveId,
  mediaPhotoIds,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  mediaPhotoIds: Id<"itemPhotos">[];
}) {
  const getDisplayUrl = useAction(api.photos.getDisplayUrl);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const thumbKey = mediaPhotoIds.slice(0, 4).join("|");
  // Stable identity keyed on the id list so the resolver effect runs once per
  // distinct set of media rather than on every parent re-render.
  const visibleIds = useMemo(
    () => (thumbKey ? (thumbKey.split("|") as Id<"itemPhotos">[]) : []),
    [thumbKey],
  );

  useEffect(() => {
    if (!householdId || !moveId || visibleIds.length === 0) {
      return;
    }
    let cancelled = false;
    void Promise.all(
      visibleIds.map(async (photoId) => {
        try {
          const display = await getDisplayUrl({
            householdId,
            moveId,
            photoId,
            variant: "card",
          });
          return [photoId, display.url] as const;
        } catch {
          return [photoId, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setUrls(
        entries.reduce<Record<string, string>>((acc, [photoId, url]) => {
          if (url) acc[photoId] = url;
          return acc;
        }, {}),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [getDisplayUrl, householdId, moveId, visibleIds]);

  if (visibleIds.length === 0) {
    return null;
  }

  const remaining = mediaPhotoIds.length - visibleIds.length;

  return (
    <div className="mt-2 flex flex-wrap gap-2" aria-label="Capture media">
      {visibleIds.map((photoId) => {
        const url = urls[photoId];
        return (
          <div
            key={photoId}
            className="size-14 overflow-hidden rounded-md border border-border bg-muted"
          >
            {url ? (
              // B2/edge delivery URLs are short-lived and provider-controlled,
              // so Next image optimization is intentionally bypassed.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt="Capture media"
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <ImageOff className="size-4" aria-hidden="true" />
              </div>
            )}
          </div>
        );
      })}
      {remaining > 0 ? (
        <div className="flex size-14 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
          +{remaining}
        </div>
      ) : null}
    </div>
  );
}

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

export function IngestionQueueList({
  householdId,
  moveId,
  view = "tabs",
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  // "tabs" = Needs action / Working / Archive (default, used inside a move).
  // "todo-done" = a simple To do / Done toggle for the top-level Queue page.
  view?: "tabs" | "todo-done";
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
  const [binaryTab, setBinaryTab] = useState<"todo" | "done">("todo");

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
  // Granular live counts for the header strip: how many captures are queued
  // (waiting for an agent), claimed (an agent is working), and processed or
  // asking a question (waiting for the user's review).
  const statusCounts = sorted.reduce<Record<string, number>>(
    (counts, entry) => {
      counts[entry.status] = (counts[entry.status] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const queuedCount = statusCounts.queued ?? 0;
  const agentWorkingCount = statusCounts.claimed ?? 0;
  const needsReviewCount =
    (statusCounts.processed ?? 0) + (statusCounts.needsInput ?? 0);
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

  function renderEntryList(
    visibleEntries: typeof sorted,
    emptyMessage: string,
    ariaLabel: string,
  ) {
    if (!visibleEntries.length) {
      return (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      );
    }

    return (
      <ul className="space-y-3" aria-label={ariaLabel}>
        {visibleEntries.map((entry) => {
          const editable =
            entry.status === "queued" || entry.status === "needsInput";
          const busy = busyEntryId === entry._id;
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
                  {entry.roomHint ? (
                    <Badge variant="secondary">{entry.roomHint}</Badge>
                  ) : null}
                  {entry.scopeHint ? (
                    <Badge variant="outline">
                      {scopeHintLabels[entry.scopeHint] ?? entry.scopeHint}
                    </Badge>
                  ) : null}
                  {entry.dispositionHint ? (
                    <Badge variant="outline">{entry.dispositionHint}</Badge>
                  ) : null}
                  <Badge variant="outline">
                    {entry.mediaPhotoIds.length} media
                  </Badge>
                  {entry.claimedByAgentLabel ? (
                    <Badge variant="secondary">
                      <Bot className="size-3" aria-hidden="true" />
                      {entry.claimedByAgentLabel}
                    </Badge>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>

              {entry.mediaPhotoIds.length ? (
                <QueueMediaThumbnails
                  householdId={householdId}
                  moveId={moveId}
                  mediaPhotoIds={entry.mediaPhotoIds}
                />
              ) : null}

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
                  {entry.resultItemIds?.length
                    ? ` (${entry.resultItemIds.length} items proposed)`
                    : ""}
                </p>
              ) : null}

              {entry.resultItemIds?.length && moveId ? (
                <Button
                  asChild
                  size="sm"
                  variant="link"
                  className="mt-1 h-auto p-0"
                >
                  <Link
                    href={`${moveWorkspacePath(moveId, "inventory")}#inventory-records`}
                  >
                    View{" "}
                    {entry.resultItemIds.length === 1
                      ? "the produced item"
                      : `${entry.resultItemIds.length} produced items`}
                    <ArrowUpRight aria-hidden="true" />
                  </Link>
                </Button>
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

  function renderEntries(task: QueueTask) {
    const visibleEntries = sorted.filter(
      (entry) => queueTaskForStatus(entry.status) === task,
    );
    const emptyMessage =
      task === "needsAction"
        ? "No captures need your answer or review right now."
        : task === "working"
          ? "No captures are queued or currently claimed by an agent."
          : "No resolved or discarded captures yet.";
    return renderEntryList(
      visibleEntries,
      emptyMessage,
      `${task} ingestion queue entries`,
    );
  }

  // The top-level Queue page collapses the three task views into a simple
  // To do (not done) vs Done (resolved/discarded) switch.
  const todoEntries = sorted.filter(
    (entry) => queueTaskForStatus(entry.status) !== "archive",
  );
  const doneEntries = sorted.filter(
    (entry) => queueTaskForStatus(entry.status) === "archive",
  );
  const todoCount = taskCounts.needsAction + taskCounts.working;
  const doneCount = taskCounts.archive;

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
            <div
              className="flex flex-wrap items-center gap-1.5"
              aria-label="Queue counts"
            >
              <Badge variant="outline">{queuedCount} queued</Badge>
              <Badge variant={agentWorkingCount ? "secondary" : "outline"}>
                {agentWorkingCount} agent-working
              </Badge>
              <Badge variant={needsReviewCount ? "secondary" : "outline"}>
                {needsReviewCount} need review
              </Badge>
            </div>
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
          view === "todo-done" ? (
            <Tabs
              value={binaryTab}
              onValueChange={(value) =>
                setBinaryTab(value as "todo" | "done")
              }
              className="gap-3"
            >
              <TabsList aria-label="Queue views">
                <TabsTrigger value="todo" className="gap-2">
                  To do
                  <Badge
                    variant={binaryTab === "todo" ? "secondary" : "outline"}
                    className="h-5 min-w-5 px-1"
                  >
                    {todoCount}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="done" className="gap-2">
                  Done
                  <Badge
                    variant={binaryTab === "done" ? "secondary" : "outline"}
                    className="h-5 min-w-5 px-1"
                  >
                    {doneCount}
                  </Badge>
                </TabsTrigger>
              </TabsList>
              <p className="text-sm text-muted-foreground">
                {binaryTab === "todo"
                  ? "Captures still being processed or waiting for your review."
                  : "Resolved or discarded captures kept out of the active queue."}
              </p>
              <TabsContent value="todo">
                {renderEntryList(
                  todoEntries,
                  "Nothing to do — captures you add show up here until they're resolved.",
                  "to-do ingestion queue entries",
                )}
              </TabsContent>
              <TabsContent value="done">
                {renderEntryList(
                  doneEntries,
                  "No resolved or discarded captures yet.",
                  "done ingestion queue entries",
                )}
              </TabsContent>
            </Tabs>
          ) : (
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
          )
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
