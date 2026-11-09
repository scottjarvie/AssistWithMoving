"use client";
import { useState } from "react";
import { useMutation, useQuery, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toastError } from "@/lib/toast";

type Suggestion = FunctionReturnType<
  typeof api.queue.suggestionView
>["items"][number];
type Decision = "accept" | "dismiss" | "restore" | "archive";
export function SuggestionPanel({
  items,
  count,
  archived,
  active,
  onActive,
  onArchived,
  onReview,
}: {
  items: Suggestion[];
  count: number | null;
  archived: boolean;
  active: boolean;
  onActive: (active: boolean) => void;
  onArchived: (archived: boolean) => void;
  onReview: (
    item: Suggestion,
    action: Decision,
    directive?: string,
    reason?: string,
  ) => Promise<void>;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [wording, setWording] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function decide(
    item: Suggestion,
    action: Decision,
    directive?: string,
  ) {
    setBusy(true);
    try {
      await onReview(item, action, directive, reason || undefined);
      setEditId(null);
      setReason("");
    } catch (e) {
      toastError(
        e instanceof Error ? e.message : "Could not save your decision.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Queue filters" className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={active ? "secondary" : "outline"}
          aria-pressed={active}
          onClick={() => onActive(!active)}
        >
          AI suggestions{" "}
          <span className="text-muted-foreground tabular-nums">
            {count ?? "…"}
          </span>
        </Button>
        <Button
          variant={archived ? "secondary" : "outline"}
          aria-pressed={archived}
          onClick={() => {
            onArchived(!archived);
            onActive(true);
          }}
        >
          Show archived
        </Button>
      </div>
      {active ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {archived
              ? "Archived Queue items and decisions. Restore brings unaccepted ideas back for your review."
              : "Your AI’s own work ideas. Only you can accept or dismiss them; nothing starts until you accept."}
          </p>
          {!items.length ? (
            <p>{count === null ? "Loading…" : "Nothing waiting here."}</p>
          ) : (
            items.map((item) => (
              <article
                key={item.queueItemId}
                className="rounded-xl border bg-card p-4 space-y-3"
              >
                <p className="text-xs font-medium text-muted-foreground">
                  {item.addedBy === "ai_suggestion"
                    ? `AI suggestion · ${item.addedByLabel ?? "Your AI"}`
                    : "Queue item"}
                  {item.suggestionStatus && item.suggestionStatus !== "open"
                    ? ` · ${item.suggestionStatus}`
                    : ""}
                </p>
                <h3 className="font-semibold">{item.directive}</h3>
                <p className="whitespace-pre-wrap text-sm">
                  {item.suggestionReason}
                </p>
                {item.fromRecord ? (
                  <p className="text-sm">
                    From:{" "}
                    <a
                      className="underline"
                      href={item.fromRecordHref ?? "/app/queue"}
                    >
                      {item.fromRecord.label ?? item.fromRecord.type}
                    </a>
                  </p>
                ) : null}
                {item.suggestionOptions.length ? (
                  <ol className="space-y-2">
                    {item.suggestionOptions.map((option, i) => (
                      <li key={i} className="flex gap-2 items-start">
                        <span>
                          {String.fromCharCode(97 + i)}) {option}
                        </span>
                        {!archived ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              setEditId(item.queueItemId);
                              setWording(option);
                            }}
                          >
                            Choose {String.fromCharCode(97 + i)}
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : null}
                {item.suggestionEvidence ? (
                  <details>
                    <summary>Evidence</summary>
                    <p className="whitespace-pre-wrap text-sm">
                      {item.suggestionEvidence}
                    </p>
                  </details>
                ) : null}
                {item.dismissReason !== null ? (
                  <p className="text-sm whitespace-pre-wrap">
                    Reason: {item.dismissReason}
                  </p>
                ) : null}
                {editId === item.queueItemId ? (
                  <div className="space-y-2">
                    <label className="block text-sm">
                      Edit first
                      <Textarea
                        aria-label="Edit suggestion wording"
                        value={wording}
                        onChange={(e) => setWording(e.target.value)}
                        maxLength={4000}
                      />
                    </label>
                    <Button
                      disabled={busy || !wording.trim()}
                      onClick={() => decide(item, "accept", wording)}
                    >
                      Accept edited work
                    </Button>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  {archived ? (
                    <Button
                      disabled={busy}
                      onClick={() => decide(item, "restore")}
                    >
                      Restore
                    </Button>
                  ) : (
                    <>
                      <Button
                        disabled={busy}
                        onClick={() => decide(item, "accept")}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setEditId(item.queueItemId);
                          setWording(item.directive);
                        }}
                      >
                        Edit first
                      </Button>
                      <label className="text-sm">
                        Dismiss reason (optional)
                        <input
                          className="ml-2 border rounded p-2"
                          value={reason}
                          maxLength={4000}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </label>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => decide(item, "dismiss")}
                      >
                        Dismiss
                      </Button>
                    </>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
export function QueueSuggestions({
  householdId,
  moveId,
  onFilterChange,
  active,
}: {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  onFilterChange: (active: boolean) => void;
  active: boolean;
}) {
  const [archived, setArchived] = useState(false);
  const suggestions = usePaginatedQuery(
    api.queue.suggestionPage,
    { householdId, moveId, archived },
    { initialNumItems: 50 },
  );
  const counts = useQuery(api.queue.counts, { householdId, moveId });
  const review = useMutation(api.queue.reviewSuggestion);
  return (
    <>
      <SuggestionPanel
        items={suggestions.results}
        count={counts?.suggestions ?? null}
        archived={archived}
        active={active}
        onArchived={setArchived}
        onActive={onFilterChange}
        onReview={async (item, action, directive, reason) => {
          await review({
            householdId,
            moveId,
            queueItemId: item.queueItemId,
            expectedVersion: item.version,
            operationId: crypto.randomUUID(),
            action,
            directive,
            reason,
          });
        }}
      />
      {active && suggestions.status === "CanLoadMore" ? (
        <Button variant="outline" onClick={() => suggestions.loadMore(50)}>
          Load more {archived ? "archived items" : "AI suggestions"}
        </Button>
      ) : null}
    </>
  );
}
