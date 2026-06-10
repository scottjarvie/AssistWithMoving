"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bot, CheckCircle2, RotateCcw, Trash2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";

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

export function IngestionQueueList({
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
  const updateEntry = useMutation(api.ingestionQueue.updateEntry);
  const setEntryStatus = useMutation(api.ingestionQueue.setEntryStatus);

  const [editingEntryId, setEditingEntryId] =
    useState<Id<"ingestionQueueEntries"> | null>(null);
  const [editingText, setEditingText] = useState("");
  const [busyEntryId, setBusyEntryId] =
    useState<Id<"ingestionQueueEntries"> | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loading = Boolean(householdId && moveId) && entries === undefined;
  const sorted = [...(entries ?? [])].sort(
    (a, b) =>
      statusOrder.indexOf(a.status as (typeof statusOrder)[number]) -
        statusOrder.indexOf(b.status as (typeof statusOrder)[number]) ||
      b.createdAt - a.createdAt
  );
  const openCount = (entries ?? []).filter((entry) =>
    ["queued", "claimed", "needsInput"].includes(entry.status)
  ).length;

  async function changeStatus(
    entryId: Id<"ingestionQueueEntries">,
    status: "queued" | "resolved" | "discarded"
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
          <Badge variant="secondary">{openCount} open</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-4/5" />
          </div>
        ) : sorted.length ? (
          <ul className="space-y-3" aria-label="Ingestion queue entries">
            {sorted.map((entry) => {
              const editable =
                entry.status === "queued" || entry.status === "needsInput";
              const busy = busyEntryId === entry._id;
              return (
                <li
                  key={entry._id}
                  className="rounded-md border border-border p-3"
                >
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
                      <Badge variant="outline">
                        {entry.mediaPhotoIds.length} media
                      </Badge>
                      {entry.claimedByAgentLabel ? (
                        <Badge variant="outline">
                          {entry.claimedByAgentLabel}
                        </Badge>
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
                      {entry.resultItemIds?.length
                        ? ` (${entry.resultItemIds.length} items proposed)`
                        : ""}
                    </p>
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
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-sm leading-6 text-muted-foreground">
            The queue is empty. Capture photos and notes on your phone as you
            walk through your home; then run your AI agent (Claude Code, Codex,
            Cowork) against the MovingManifest MCP server or REST API to turn
            captures into inventory. Every agent proposal comes back here and
            to AI Review for your approval.
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
