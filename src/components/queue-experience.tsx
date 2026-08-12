"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  CircleDot,
  ClipboardList,
  Clock3,
  History,
  LoaderCircle,
  MessageCircleQuestion,
  PackageOpen,
  Route,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";

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
    icon: typeof Clock3;
    markerClass: string;
    panelClass: string;
  }
> = {
  needsYou: {
    label: "Needs You",
    shortDescription: "A fact, file, or decision is blocking the handoff.",
    emptyTitle: "Nothing needs you",
    emptyBody: "When your AI needs one exact answer, it will wait here.",
    icon: MessageCircleQuestion,
    markerClass: "bg-orange-500",
    panelClass: "border-orange-500/35 bg-orange-500/5",
  },
  working: {
    label: "Working",
    shortDescription: "Your chosen AI has claimed the handoff.",
    emptyTitle: "Nothing is being worked",
    emptyBody: "A handoff appears here only after an AI claims it.",
    icon: LoaderCircle,
    markerClass: "bg-sky-600",
    panelClass: "border-sky-600/30 bg-sky-600/5",
  },
  waitingForAi: {
    label: "Waiting for your AI",
    shortDescription: "Saved and ready; no AI is running yet.",
    emptyTitle: "No handoffs are waiting",
    emptyBody: "Leave a route note when you want your chosen AI to pick up work.",
    icon: Clock3,
    markerClass: "bg-amber-500",
    panelClass: "border-amber-500/35 bg-amber-500/5",
  },
  done: {
    label: "Done",
    shortDescription: "A result or terminal outcome is recorded.",
    emptyTitle: "No completed handoffs yet",
    emptyBody: "Finished work remains readable as part of the move record.",
    icon: Check,
    markerClass: "bg-emerald-700",
    panelClass: "border-emerald-700/25 bg-emerald-700/5",
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
            <ShieldCheck className="size-5" aria-hidden="true" />
          ) : (
            <Bot className="size-5" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0">
          <p className="font-medium">
            {loading
              ? "Checking AI access"
              : hasKey
                ? "API-key access is available"
                : "No API-key access is set up"}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">
            {loading
              ? "Connection status will appear here when it is known."
              : hasKey
                ? `${activeApiKeyCount} active key${activeApiKeyCount === 1 ? "" : "s"} can reach scoped Queue tools. MovingManifest cannot tell whether an AI client is currently online.`
                : "You can still leave handoff notes. They will wait until you give a chosen AI scoped access."}
          </p>
        </div>
      </div>
      <Button asChild variant="outline" size="sm" className="self-start sm:self-center">
        <Link href="/settings/ai-connections">Manage AI access</Link>
      </Button>
    </div>
  );
}

function QueueItemCard({
  item,
  onOpen,
}: {
  item: QueueDeskItem;
  onOpen: (item: QueueDeskItem) => void;
}) {
  const presentation = statePresentation[item.state];
  const Icon = presentation.icon;
  const primaryDetail =
    item.state === "needsYou"
      ? item.requiredAction
      : item.state === "working"
        ? item.nextStep
        : item.state === "waitingForAi"
          ? waitingReasonLabel(item.waitingReason)
          : item.resultSummary;

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="group relative w-full overflow-hidden rounded-xl border border-border bg-card p-4 text-left shadow-[0_1px_0_color-mix(in_oklch,var(--foreground),transparent_94%)] transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transform-none motion-reduce:transition-none"
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
          <Icon
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
            <p className="mt-2 text-xs font-medium text-sky-700 dark:text-sky-300">
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
        <ArrowRight
          className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
          aria-hidden="true"
        />
      </div>
    </button>
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
          {item.summary ? (
            <section>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Context
              </p>
              <p className="mt-2 leading-6">{item.summary}</p>
            </section>
          ) : null}

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
                    {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
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
                      <PackageOpen className="size-4 text-primary" aria-hidden="true" />
                      {ref.label ?? ref.type ?? "Move record"}
                    </li>
                  ))}
                </ul>
              ) : null}
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
              <History className="size-4 text-muted-foreground" aria-hidden="true" />
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
                      <CircleDot className="absolute -left-[1.35rem] top-0.5 size-3.5 bg-popover text-primary" aria-hidden="true" />
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
                <X aria-hidden="true" />
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
}) {
  const [internalActiveState, setInternalActiveState] =
    useState<QueueState>("needsYou");
  const activeState = selectedState ?? internalActiveState;
  const [directive, setDirective] = useState("");
  const [selectedItemKey, setSelectedItemKey] = useState<{
    source: QueueDeskItem["source"];
    id: string;
  } | null>(null);
  const [response, setResponse] = useState("");
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

  async function provideInput() {
    if (!selectedItem || !response.trim() || busy) return;
    setBusy(true);
    const saved = await onProvideInput(selectedItem, response.trim());
    setBusy(false);
    if (saved) {
      setResponse("");
      setSelectedItemKey(null);
      onSelectItem(null);
      selectState("waitingForAi");
    }
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
      <QueueConnectionNote activeApiKeyCount={activeApiKeyCount} />

      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="pointer-events-none absolute -right-8 -top-12 size-44 rounded-full border-[28px] border-primary/[0.04]" aria-hidden="true" />
        <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Route className="size-4" aria-hidden="true" />
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
              className="w-full"
            >
              {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ClipboardList aria-hidden="true" />}
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
            const Icon = stateMeta.icon;
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
                  <Icon className={cn("size-4 shrink-0", state === "working" && active && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
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
                    className="h-8 rounded-lg border border-input bg-background px-2 text-sm font-medium text-foreground"
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
                  onOpen={(nextItem) => {
                    setResponse("");
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
                <PackageOpen className="size-5" aria-hidden="true" />
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

      <QueueDetailSheet
        item={selectedItem}
        activities={activities}
        activitiesLoading={activitiesLoading}
        hasMoreActivities={hasMoreActivities}
        onLoadMoreActivities={onLoadMoreActivities}
        response={response}
        onResponseChange={setResponse}
        onProvideInput={provideInput}
        onCancel={cancel}
        busy={busy}
        captureWorkspacePath={captureWorkspacePath}
        onClose={() => {
          setResponse("");
          setSelectedItemKey(null);
          onSelectItem(null);
        }}
      />
    </div>
  );
}
