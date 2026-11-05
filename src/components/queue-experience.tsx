"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { MovingSymbol, type MovingSymbolName } from "@/components/moving-symbol";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type QueueState = "needsYou" | "working" | "waitingForAi" | "done";

export type QueueDeskItem = {
  id: string;
  source: "handoff" | "capture";
  ownerUserId: string;
  ownerLabel: string | null;
  directive: string;
  summary: string | null;
  state: QueueState;
  stateLabel: string;
  requiredAction: string | null;
  nextStep: string | null;
  waitingReason: string | null;
  resultSummary: string | null;
  resultRefs: Array<{ type?: string; id?: string; label?: string }>;
  claimLabel: string | null;
  claimExpiresAt: number | null;
  terminalReason: string | null;
  failure: {
    message: string;
    retryable: boolean;
    attemptCount: number;
    maxAttempts: number;
    nextAttemptAt?: number | null;
  } | null;
  version: number | null;
  createdAt: number;
  updatedAt: number;
};

export type QueueDeskActivity = {
  id: string;
  type: string;
  actorLabel: string;
  fromState: QueueState | null;
  toState: QueueState;
  message: string;
  createdAt: number;
};

const stateOrder: QueueState[] = [
  "needsYou",
  "working",
  "waitingForAi",
  "done",
];

const statePresentation: Record<
  QueueState,
  {
    label: string;
    shortDescription: string;
    emptyTitle: string;
    emptyBody: string;
    icon: MovingSymbolName;
    markerClass: string;
    panelClass: string;
  }
> = {
  needsYou: {
    label: "Needs You",
    shortDescription: "A fact, file, or decision is blocking the handoff.",
    emptyTitle: "Nothing needs you",
    emptyBody: "When your AI needs one exact answer, it will wait here.",
    icon: "question",
    markerClass: "bg-warning",
    panelClass: "border-warning/35 bg-warning/5",
  },
  working: {
    label: "Working",
    shortDescription: "Your chosen AI has claimed the handoff.",
    emptyTitle: "Nothing is being worked",
    emptyBody: "A handoff appears here only after an AI claims it.",
    icon: "ai",
    markerClass: "bg-evidence",
    panelClass: "border-evidence/30 bg-evidence/5",
  },
  waitingForAi: {
    label: "Waiting for your AI",
    shortDescription: "Saved and ready; no AI is running yet.",
    emptyTitle: "No handoffs are waiting",
    emptyBody: "Leave a route note when you want your chosen AI to pick up work.",
    icon: "calendar",
    markerClass: "bg-warning",
    panelClass: "border-warning/35 bg-warning/5",
  },
  done: {
    label: "Done",
    shortDescription: "A result or terminal outcome is recorded.",
    emptyTitle: "No completed handoffs yet",
    emptyBody: "Finished work remains readable as part of the move record.",
    icon: "check",
    markerClass: "bg-success",
    panelClass: "border-success/25 bg-success/5",
  },
};

function formatWhen(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function waitingReasonLabel(reason: string | null) {
  switch (reason) {
    case "aiConnectionRequired":
      return "An AI connection must be set up before this can be claimed.";
    case "retryScheduled":
      return "A bounded retry is scheduled.";
    case "released":
      return "The previous claim was released and the handoff is ready again.";
    default:
      return "Ready for your chosen AI to claim.";
  }
}

function activityTypeLabel(type: string) {
  return type
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stateLabel(state: QueueState | null) {
  return state ? statePresentation[state].label : null;
}

function QueueConnectionNote({
  activeApiKeyCount,
}: {
  activeApiKeyCount: number | null;
}) {
  const loading = activeApiKeyCount === null;
  const hasKey = (activeApiKeyCount ?? 0) > 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/[0.045] p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {hasKey ? (
            <MovingSymbol name="shield" className="size-5" aria-hidden="true" />
          ) : (
            <MovingSymbol name="ai" className="size-5" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0">
          <p className="font-medium">
            {loading
              ? "Checking AI access"
              : hasKey
                ? "A Queue API key is set up"
                : "No Queue API key is set up"}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {loading
              ? "Connection status will appear here when it is known."
              : hasKey
                ? "An AI using that key can pick up these handoffs."
                : "You can still leave handoffs. An AI you connect with Queue access, or a Queue API key, can pick them up."}
          </p>
          {loading ? null : (
            <details className="group mt-1 text-sm">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-foreground [&::-webkit-details-marker]:hidden">
                How Queue access works
                <MovingSymbol name="chevron"
                  className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
                {hasKey
                  ? `Queue-capable API-key access is available: ${activeApiKeyCount} active key${activeApiKeyCount === 1 ? "" : "s"} can reach scoped Queue tools, and a connected AI can work this Queue under a grant that includes Queue work. Assist With Moving cannot tell whether an AI client is currently online.`
                  : "A connected AI can claim and finish handoffs once you approve a grant that includes Queue work; a scoped API key is the other way in."}
              </p>
            </details>
          )}
        </div>
      </div>
      <Button asChild variant="outline" size="sm" className="min-h-11 self-start sm:min-h-8 sm:self-center">
        <Link href="/settings/ai">Manage AI access</Link>
      </Button>
    </div>
  );
}

function QueueItemCard({
  item,
  onOpen,
  response, onResponseChange, onProvideInput, busy,
}: {
  item: QueueDeskItem;
  onOpen: (item: QueueDeskItem) => void;
  response: string; onResponseChange: (value: string) => void; onProvideInput: () => void; busy: boolean;
}) {
  const answerId = useId();
  const presentation = statePresentation[item.state];
  const primaryDetail =
    item.state === "needsYou"
      ? item.requiredAction
      : item.state === "working"
        ? item.nextStep
        : item.state === "waitingForAi"
          ? waitingReasonLabel(item.waitingReason)
          : item.resultSummary;

  return (
    <article className="overflow-hidden rounded-md border border-border bg-card">
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="group relative w-full overflow-hidden bg-card p-3 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transform-none motion-reduce:transition-none"
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-1", presentation.markerClass)}
        aria-hidden="true"
      />
      <div className="flex items-start gap-3 pl-1">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border",
            presentation.panelClass,
          )}
        >
          <MovingSymbol name={presentation.icon}
            className={cn("size-4", item.state === "working" && "animate-spin motion-reduce:animate-none")}
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{presentation.label}</Badge>
            <span className="text-xs text-muted-foreground">
              {item.source === "capture" ? "Capture" : "Handoff"}
            </span>
            {item.ownerLabel ? (
              <span className="text-xs text-muted-foreground">{item.ownerLabel}</span>
            ) : null}
            <span className="text-xs text-muted-foreground">{formatWhen(item.updatedAt)}</span>
          </div>
          <h3 className="mt-2 text-sm font-semibold leading-6 text-foreground sm:text-base">
            {item.directive}
          </h3>
          {primaryDetail ? (
            <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">
              {primaryDetail}
            </p>
          ) : null}
          {item.state === "working" && item.claimLabel ? (
            <p className="mt-2 text-xs font-medium text-evidence">
              Claimed by {item.claimLabel}
            </p>
          ) : null}
          {item.failure ? (
            <p className="mt-2 text-xs font-medium text-destructive">
              {item.failure.message}
              {item.failure.retryable ? " A bounded retry may be attempted." : ""}
            </p>
          ) : null}
        </div>
        <MovingSymbol name="arrow"
          className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
          aria-hidden="true"
        />
      </div>
    </button>
    {item.state === "needsYou" && item.source === "handoff" ? <form className="space-y-2 border-t border-border px-3 py-2" onSubmit={event => { event.preventDefault(); onProvideInput(); }}>
      <label htmlFor={answerId} className="text-xs font-medium">Your answer for {item.directive}</label>
      <div className="flex items-end gap-2"><Textarea id={answerId} value={response} onChange={event => onResponseChange(event.target.value)} maxLength={4000} className="min-h-11 flex-1" placeholder="The smallest answer needed" disabled={busy} /><Button type="submit" variant="outline" size="sm" className="min-h-11 shrink-0 sm:min-h-8" disabled={busy || !response.trim()}><MovingSymbol name={busy ? "reset" : "arrow"} className={busy ? "animate-spin" : undefined} />Send answer</Button></div>
    </form> : null}
    </article>
  );
}

function QueueDetailSheet({
  item,
  activities,
  activitiesLoading,
  hasMoreActivities,
  onLoadMoreActivities,
  response,
  onResponseChange,
  onProvideInput,
  onCancel,
  busy,
  captureWorkspacePath,
  savedWorkPath,
  onClose,
}: {
  item: QueueDeskItem | null;
  activities: QueueDeskActivity[];
  activitiesLoading: boolean;
  hasMoreActivities: boolean;
  onLoadMoreActivities: () => void;
  response: string;
  onResponseChange: (value: string) => void;
  onProvideInput: () => void;
  onCancel: () => void;
  busy: boolean;
  captureWorkspacePath: string | null;
  savedWorkPath: string | null;
  onClose: () => void;
}) {
  if (!item) return null;
  const presentation = statePresentation[item.state];

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="border-b pr-12">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{presentation.label}</Badge>
            <span className="text-xs text-muted-foreground">
              {item.source === "capture" ? "Capture note" : "Queue handoff"}
            </span>
          </div>
          <SheetTitle className="text-lg leading-7">{item.directive}</SheetTitle>
          <SheetDescription>
            Saved {formatWhen(item.createdAt)} · updated {formatWhen(item.updatedAt)}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">


          {item.state === "needsYou" ? (
            <section className={cn("rounded-xl border p-4", presentation.panelClass)}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em]">Exact next step</p>
              <p className="mt-2 leading-6">
                {item.requiredAction ?? "Review this handoff and provide the missing detail."}
              </p>
              {item.source === "handoff" ? (
                <div className="mt-4 space-y-2">
                  <label htmlFor="queue-response" className="text-sm font-medium">
                    Your answer
                  </label>
                  <Textarea
                    id="queue-response"
                    value={response}
                    onChange={(event) => onResponseChange(event.target.value)}
                    placeholder="Give the smallest answer your AI needs…"
                    maxLength={4000}
                  />
                  <Button
                    onClick={onProvideInput}
                    disabled={busy || !response.trim()}
                  >
                    {busy ? <MovingSymbol name="reset" className="animate-spin" aria-hidden="true" /> : <MovingSymbol name="arrow" aria-hidden="true" />}
                    Send answer
                  </Button>
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  This older capture uses the capture review flow for responses.
                </p>
              )}
            </section>
          ) : null}

          {item.state === "working" ? (
            <section className={cn("rounded-xl border p-4", presentation.panelClass)}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em]">Current step</p>
              <p className="mt-2 leading-6">{item.nextStep ?? "The claimed work is in progress."}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{item.claimLabel ? `Claimed by ${item.claimLabel}` : "Claim identity unavailable"}</span>
                {item.claimExpiresAt ? <span>Lease until {formatWhen(item.claimExpiresAt)}</span> : null}
              </div>
            </section>
          ) : null}

          {item.state === "waitingForAi" ? (
            <section className={cn("rounded-xl border p-4", presentation.panelClass)}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em]">Handoff status</p>
              <p className="mt-2 leading-6">{waitingReasonLabel(item.waitingReason)}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Nothing starts merely because this note was saved.
              </p>
            </section>
          ) : null}

          {item.state === "done" ? (
            <section className={cn("rounded-xl border p-4", presentation.panelClass)}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em]">Recorded result</p>
              <p className="mt-2 leading-6">
                {item.resultSummary ??
                  (item.terminalReason === "canceled"
                    ? "This handoff was canceled."
                    : item.terminalReason === "expired"
                      ? "This handoff expired before completion."
                      : "The handoff is complete.")}
              </p>
              {item.resultRefs.length ? (
                <ul className="mt-3 space-y-2">
                  {item.resultRefs.map((ref, index) => (
                    <li key={`${ref.type ?? "result"}:${ref.id ?? index}`} className="flex items-center gap-2 text-sm">
                      <MovingSymbol name="box" className="size-4 text-primary" aria-hidden="true" />
                      {ref.label ?? ref.type ?? "Move record"}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {item.summary ? (
            <section>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Context
              </p>
              <p className="mt-2 leading-6">{item.summary}</p>
            </section>
          ) : null}

          {item.state !== "done" &&
          (item.resultSummary || item.resultRefs.length) ? (
            <section className="rounded-xl border border-primary/25 bg-primary/[0.045] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Linked move work
              </p>
              <p className="mt-2 leading-6">
                {item.resultSummary ?? "Your AI saved move work for this handoff."}
              </p>
              {item.resultRefs.length ? (
                <ul className="mt-3 space-y-2">
                  {item.resultRefs.map((ref, index) => (
                    <li
                      key={`${ref.type ?? "result"}:${ref.id ?? index}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <MovingSymbol name="box" className="size-4 text-primary" aria-hidden="true" />
                      {ref.label ?? ref.type ?? "Move record"}
                    </li>
                  ))}
                </ul>
              ) : null}
              {savedWorkPath ? (
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link href={savedWorkPath}>Open saved work</Link>
                </Button>
              ) : null}
              <p className="mt-3 text-xs text-muted-foreground">
                This link records useful work without claiming or completing the handoff.
              </p>
            </section>
          ) : null}

          {item.failure ? (
            <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="font-medium text-destructive">Work did not finish cleanly</p>
              <p className="mt-1 text-sm leading-6">{item.failure.message}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Attempt {item.failure.attemptCount} of {item.failure.maxAttempts}
                {item.failure.nextAttemptAt ? ` · next retry ${formatWhen(item.failure.nextAttemptAt)}` : ""}
              </p>
            </section>
          ) : null}

          <section>
            <div className="flex items-center gap-2">
              <MovingSymbol name="entry" className="size-4 text-muted-foreground" aria-hidden="true" />
              <h3 className="font-semibold">Activity</h3>
            </div>
            {item.source === "capture" ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm leading-6 text-muted-foreground">
                  This capture is shown through the compatibility view. Its detailed evidence and capture-specific actions remain attached to the capture record.
                </p>
                {captureWorkspacePath ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={captureWorkspacePath}>Open capture workspace</Link>
                  </Button>
                ) : null}
              </div>
            ) : activitiesLoading ? (
              <div className="mt-3 space-y-2" aria-label="Loading activity">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : activities.length ? (
              <div className="mt-3 space-y-3">
                <ol className="space-y-3 border-l border-border pl-4">
                  {activities.map((activity) => (
                    <li key={activity.id} className="relative">
                      <MovingSymbol name="entry" className="absolute -left-[1.35rem] top-0.5 size-3.5 bg-popover text-primary" aria-hidden="true" />
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <p className="text-sm font-medium">{activityTypeLabel(activity.type)}</p>
                        <time className="text-xs text-muted-foreground">{formatWhen(activity.createdAt)}</time>
                      </div>
                      <p className="mt-1 text-sm leading-5 text-muted-foreground">{activity.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {activity.actorLabel}
                        {activity.fromState
                          ? ` · ${stateLabel(activity.fromState)} → ${stateLabel(activity.toState)}`
                          : ` · ${stateLabel(activity.toState)}`}
                      </p>
                    </li>
                  ))}
                </ol>
                {hasMoreActivities ? (
                  <Button variant="outline" size="sm" onClick={onLoadMoreActivities}>
                    Load older activity
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No activity is recorded yet.</p>
            )}
          </section>

          {item.source === "handoff" && item.state !== "done" ? (
            <section className="border-t pt-4">
              <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy} className="text-destructive">
                <MovingSymbol name="close" aria-hidden="true" />
                Cancel handoff
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Canceling records a Done outcome; it does not delete the history.
              </p>
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function QueueDesk({
  items,
  selectedState,
  onStateChange,
  canCreateDirective = true,
  directiveTargetLabel = "My Queue",
  activeApiKeyCount,
  loading,
  hasMoreHandoffs,
  hasMoreCaptures,
  onLoadMoreHandoffs,
  onLoadMoreCaptures,
  onCreateDirective,
  onSelectItem,
  ownerScope,
  ownerOptions,
  onOwnerScopeChange,
  activities,
  activitiesLoading,
  hasMoreActivities,
  onLoadMoreActivities,
  onProvideInput,
  onCancel,
  captureWorkspacePath,
  savedWorkPath,
}: {
  items: QueueDeskItem[];
  selectedState?: QueueState;
  onStateChange?: (state: QueueState) => void;
  canCreateDirective?: boolean;
  directiveTargetLabel?: string;
  activeApiKeyCount: number | null;
  loading: boolean;
  hasMoreHandoffs: boolean;
  hasMoreCaptures: boolean;
  onLoadMoreHandoffs: () => void;
  onLoadMoreCaptures: () => void;
  onCreateDirective: (directive: string) => Promise<boolean>;
  onSelectItem: (item: QueueDeskItem | null) => void;
  ownerScope: string;
  ownerOptions: Array<{ value: string; label: string }>;
  onOwnerScopeChange: (value: string) => void;
  activities: QueueDeskActivity[];
  activitiesLoading: boolean;
  hasMoreActivities: boolean;
  onLoadMoreActivities: () => void;
  onProvideInput: (item: QueueDeskItem, response: string) => Promise<boolean>;
  onCancel: (item: QueueDeskItem) => Promise<boolean>;
  captureWorkspacePath: string | null;
  savedWorkPath: string | null;
}) {
  const [internalActiveState, setInternalActiveState] =
    useState<QueueState>("needsYou");
  const activeState = selectedState ?? internalActiveState;
  const [directive, setDirective] = useState("");
  const [selectedItemKey, setSelectedItemKey] = useState<{
    source: QueueDeskItem["source"];
    id: string;
  } | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const responseKey = (item: QueueDeskItem) => `${item.source}:${item.id}`;
  const changeResponse = (item: QueueDeskItem, value: string) => setResponses(current => ({ ...current, [responseKey(item)]: value }));
  const [busy, setBusy] = useState(false);

  function selectState(state: QueueState) {
    setInternalActiveState(state);
    onStateChange?.(state);
  }

  const visibleItems = items.filter((item) => item.state === activeState);
  const selectedItem = selectedItemKey
    ? items.find(
        (item) =>
          item.source === selectedItemKey.source && item.id === selectedItemKey.id,
      ) ?? null
    : null;

  async function createDirective() {
    if (!canCreateDirective || !directive.trim() || busy) return;
    setBusy(true);
    const saved = await onCreateDirective(directive.trim());
    setBusy(false);
    if (saved) {
      setDirective("");
      selectState("waitingForAi");
    }
  }

  async function answerItem(item: QueueDeskItem, response: string) {
    if (item.source !== "handoff" || item.state !== "needsYou" || !response.trim() || busy) return;
    setBusy(true);
    try {
      const saved = await onProvideInput(item, response.trim());
      if (saved) {
        changeResponse(item, "");
        if (selectedItemKey?.source === item.source && selectedItemKey.id === item.id) {
          setSelectedItemKey(null);
          onSelectItem(null);
        }
        selectState("waitingForAi");
      }
    } finally { setBusy(false); }
  }

  async function cancel() {
    if (!selectedItem || busy) return;
    setBusy(true);
    const saved = await onCancel(selectedItem);
    setBusy(false);
    if (saved) {
      setSelectedItemKey(null);
      onSelectItem(null);
      selectState("done");
    }
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="pointer-events-none absolute -right-8 -top-12 size-44 rounded-full border-[28px] border-primary/[0.04]" aria-hidden="true" />
        <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <MovingSymbol name="route" className="size-4" aria-hidden="true" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">Leave a route note</p>
            </div>
            <label htmlFor="queue-directive" className="mt-2 block text-lg font-semibold">
              What should your AI pick up next?
            </label>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              A clear direction is enough. The selected move is attached automatically; room, belongings, and evidence can be added when useful.
            </p>
            <Textarea
              id="queue-directive"
              value={directive}
              onChange={(event) => setDirective(event.target.value)}
              placeholder="Example: Compare the two mover estimates and flag anything that needs my decision."
              maxLength={4000}
              className="mt-3 min-h-24 bg-background"
              disabled={!canCreateDirective}
            />
          </div>
          <div className="flex flex-col items-start gap-2 lg:w-52">
            <Button
              onClick={createDirective}
              disabled={!canCreateDirective || busy || !directive.trim()}
              size="sm"
              className="min-h-11 sm:min-h-8"
            >
              {busy ? <MovingSymbol name="reset" className="animate-spin" aria-hidden="true" /> : <MovingSymbol name="queue" aria-hidden="true" />}
              Save handoff
            </Button>
            <p className="text-xs leading-5 text-muted-foreground">
              {canCreateDirective ? (
                <>
                  Saves to <strong className="font-medium text-foreground">{directiveTargetLabel}</strong> in Waiting for your AI. Nothing runs until an AI claims it.
                </>
              ) : (
                <>Choose one person&apos;s Queue before saving a handoff.</>
              )}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <nav aria-label="Queue states" className="grid grid-cols-2 gap-2 lg:sticky lg:top-4 lg:grid-cols-1">
          {stateOrder.map((state) => {
            const stateMeta = statePresentation[state];
            const active = activeState === state;
            return (
              <button
                key={state}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => selectState(state)}
                className={cn(
                  "relative overflow-hidden rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "border-primary/35 bg-primary/[0.065] shadow-sm" : "border-border bg-card hover:border-primary/25",
                )}
              >
                <span className={cn("absolute inset-y-0 left-0 w-1", stateMeta.markerClass)} aria-hidden="true" />
                <div className="flex items-center gap-2 pl-1">
                  <MovingSymbol name={stateMeta.icon} className={cn("size-4 shrink-0", state === "working" && active && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-sm font-semibold">{stateMeta.label}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                    {active ? visibleItems.length : "—"}
                  </span>
                </div>
                <p className="mt-2 hidden pl-1 text-xs leading-5 text-muted-foreground lg:block">{stateMeta.shortDescription}</p>
              </button>
            );
          })}
        </nav>

        <section aria-labelledby="queue-state-heading" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Move handoffs</p>
              <h2 id="queue-state-heading" className="mt-1 text-lg font-semibold">{statePresentation[activeState].label}</h2>
            </div>
            <div className="flex items-center gap-2">
              {ownerOptions.length > 1 ? (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Showing
                  <select
                    aria-label="Queue owner"
                    value={ownerScope}
                    onChange={(event) => onOwnerScopeChange(event.target.value)}
                    className="h-11 rounded-lg border border-input bg-background px-2 text-base font-medium text-foreground md:h-8 md:text-sm"
                  >
                    {ownerOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <span className="text-xs text-muted-foreground">{visibleItems.length} loaded</span>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3" aria-label="Loading Queue">
              <Skeleton className="h-36 rounded-xl" />
              <Skeleton className="h-36 rounded-xl" />
              <Skeleton className="h-36 rounded-xl" />
            </div>
          ) : visibleItems.length ? (
            <div className="space-y-3">
              {visibleItems.map((item) => (
                <QueueItemCard
                  key={`${item.source}:${item.id}`}
                  item={item}
                  response={responses[responseKey(item)] ?? ""}
                  onResponseChange={value => changeResponse(item, value)}
                  onProvideInput={() => void answerItem(item, responses[responseKey(item)] ?? "")}
                  busy={busy}
                  onOpen={(nextItem) => {
                    setSelectedItemKey({
                      source: nextItem.source,
                      id: nextItem.id,
                    });
                    onSelectItem(nextItem);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted/25 px-5 py-12 text-center">
              <span className="mx-auto flex size-11 items-center justify-center rounded-xl border border-border bg-background text-primary">
                <MovingSymbol name="box" className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-3 font-semibold">{statePresentation[activeState].emptyTitle}</h3>
              <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">{statePresentation[activeState].emptyBody}</p>
            </div>
          )}

          {(hasMoreHandoffs || hasMoreCaptures) ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {hasMoreHandoffs ? (
                <Button variant="outline" size="sm" onClick={onLoadMoreHandoffs}>Load older handoffs</Button>
              ) : null}
              {hasMoreCaptures ? (
                <Button variant="outline" size="sm" onClick={onLoadMoreCaptures}>Load older captures</Button>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      {/* Connection status sits after the handoffs: useful, but not what
          people open the Queue to see. */}
      <QueueConnectionNote activeApiKeyCount={activeApiKeyCount} />

      <QueueDetailSheet
        item={selectedItem}
        activities={activities}
        activitiesLoading={activitiesLoading}
        hasMoreActivities={hasMoreActivities}
        onLoadMoreActivities={onLoadMoreActivities}
        response={selectedItem ? responses[responseKey(selectedItem)] ?? "" : ""}
        onResponseChange={value => { if (selectedItem) changeResponse(selectedItem, value); }}
        onProvideInput={() => { if (selectedItem) void answerItem(selectedItem, responses[responseKey(selectedItem)] ?? ""); }}
        onCancel={cancel}
        busy={busy}
        captureWorkspacePath={captureWorkspacePath}
        savedWorkPath={savedWorkPath}
        onClose={() => {
          setSelectedItemKey(null);
          onSelectItem(null);
        }}
      />
    </div>
  );
}
