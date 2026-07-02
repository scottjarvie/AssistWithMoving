"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ImageOff,
  ImagePlus,
  Info,
  Loader2,
  RotateCcw,
  Settings,
  Trash2,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type UploadJob,
  useMediaUpload,
} from "@/components/media-upload-provider";
import { QueueEntryDetailSheet } from "@/components/queue-entry-detail-sheet";
import {
  mediaKindForMimeType,
  validateMediaUploadFile,
} from "@/lib/photo-upload";
import { toastError, toastSaved } from "@/lib/toast";
import { cn } from "@/lib/utils";

type QueueTask = "needsAction" | "working" | "archive";
type QueueFilter = "todo" | "working" | "review" | "done" | "all";

function statusToastMessage(status: "queued" | "resolved" | "discarded") {
  if (status === "resolved") return "Marked resolved";
  if (status === "discarded") return "Discarded";
  return "Requeued";
}

// The top-level Queue page filters by lifecycle bucket; each filter doubles as
// a live stat. queued -> To do, claimed -> Working, processed/needsInput ->
// Review, resolved/discarded -> Done.
function queueFilterForStatus(status: string): Exclude<QueueFilter, "all"> {
  if (status === "queued") return "todo";
  if (status === "claimed") return "working";
  if (status === "processed" || status === "needsInput") return "review";
  return "done";
}

// Renders thumbnails for an entry's media. getDisplayUrl is an action returning
// a short-lived signed/edge URL per photo, so we resolve them on mount the same
// way PhotoEvidenceStrip does. Only images resolve; audio/video and unresolved
// photos fall back to a count chip rendered by the caller. In-flight and failed
// background-upload jobs from this client render as spinner / failed tiles so the
// user watches photos arrive.
function QueueMediaThumbnails({
  householdId,
  moveId,
  mediaPhotoIds,
  jobs = [],
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  mediaPhotoIds: Id<"itemPhotos">[];
  // Live background-upload jobs for this entry, still in flight or failed (done
  // jobs already show up as resolved thumbnails via mediaPhotoIds).
  jobs?: UploadJob[];
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

  // Pending (queued/uploading/finalizing) and failed jobs get their own tiles so
  // the user sees photos still arriving; done jobs are already attached and show
  // as resolved thumbnails above.
  const pendingJobs = jobs.filter(
    (job) =>
      job.status === "queued" ||
      job.status === "uploading" ||
      job.status === "finalizing",
  );
  const failedJobs = jobs.filter((job) => job.status === "error");

  if (visibleIds.length === 0 && pendingJobs.length === 0 && failedJobs.length === 0) {
    return null;
  }

  const remaining = mediaPhotoIds.length - visibleIds.length;

  const imageTile = (
    photoId: Id<"itemPhotos">,
    sizeClass: string,
    iconClass: string,
  ) => {
    const url = urls[photoId];
    return (
      <div
        key={photoId}
        className={cn(
          "overflow-hidden rounded-md border border-border bg-muted",
          sizeClass,
        )}
      >
        {url ? (
          // B2/edge delivery URLs are short-lived and provider-controlled,
          // so Next image optimization is intentionally bypassed.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Capture media" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className={iconClass} aria-hidden="true" />
          </div>
        )}
      </div>
    );
  };

  const pendingTile = (job: UploadJob) => (
    <div
      key={job.id}
      className="flex size-14 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground"
      aria-label={`Uploading ${job.file.name}`}
      title={job.file.name}
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
    </div>
  );

  const failedTile = (job: UploadJob) => (
    <div
      key={job.id}
      className="flex size-14 items-center justify-center rounded-md border border-destructive/40 bg-destructive/10 text-destructive"
      aria-label={`Upload failed for ${job.file.name}`}
      title={job.error ?? job.file.name}
    >
      <AlertTriangle className="size-4" aria-hidden="true" />
    </div>
  );

  const remainingTile =
    remaining > 0 ? (
      <div
        key="remaining"
        className="flex size-14 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground"
      >
        +{remaining}
      </div>
    ) : null;

  // One responsive render (no duplicate DOM): on desktop the primary thumbnail
  // grows to ~4× (size-56) and stacks above a small strip of the remaining
  // media + any in-flight/failed upload tiles; on mobile everything stays a
  // compact wrap of size-14 tiles.
  const [first, ...rest] = visibleIds;
  const restTiles = [
    ...rest.map((photoId) => imageTile(photoId, "size-14", "size-4")),
    ...pendingJobs.map(pendingTile),
    ...failedJobs.map(failedTile),
    ...(remainingTile ? [remainingTile] : []),
  ];

  return (
    <div
      className="flex flex-wrap items-start gap-2 md:flex-col"
      aria-label="Capture media"
    >
      {first ? imageTile(first, "size-14 md:size-56", "size-4 md:size-6") : null}
      {restTiles.length > 0 ? (
        <div className="flex flex-wrap gap-2">{restTiles}</div>
      ) : null}
    </div>
  );
}

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
  // Which person's queue we're viewing. Default follows the backend: managers
  // see the whole move, everyone else sees their own. A delegated runner can
  // switch to a queue a move owner let them run.
  const scopes = useQuery(
    api.moveParticipants.queueScopes,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const [ownerScope, setOwnerScope] = useState<
    "mine" | "all" | Id<"users"> | undefined
  >(undefined);
  const effectiveScope: "mine" | "all" | Id<"users"> =
    ownerScope ?? (scopes?.canManage ? "all" : "mine");
  const entries = useQuery(
    api.ingestionQueue.listForMove,
    householdId && moveId
      ? { householdId, moveId, ownerScope: effectiveScope }
      : "skip",
  );
  const updateEntry = useMutation(api.ingestionQueue.updateEntry);
  const setEntryStatus = useMutation(api.ingestionQueue.setEntryStatus);
  const setMediaUploadState = useMutation(
    api.ingestionQueue.setMediaUploadState,
  );
  const { enqueue, retry, jobsForEntry, pendingCountForEntry } =
    useMediaUpload();

  const [editingEntryId, setEditingEntryId] =
    useState<Id<"ingestionQueueEntries"> | null>(null);
  const [editingText, setEditingText] = useState("");
  const [busyEntryId, setBusyEntryId] =
    useState<Id<"ingestionQueueEntries"> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // One hidden file input per entry, lazily keyed so the F3 "Add images" button
  // can open the native picker for the entry it belongs to.
  const addImagesInputRefs = useRef<
    Map<string, HTMLInputElement | null>
  >(new Map());
  const [activeTask, setActiveTask] = useState<QueueTask>("needsAction");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("todo");
  // The entry whose detail modal is open (MOVE-356). detailIndex is the 1-based
  // position shown in the list at open time, purely for a friendly title.
  const [detailEntryId, setDetailEntryId] =
    useState<Id<"ingestionQueueEntries"> | null>(null);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);

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
      toastSaved(statusToastMessage(status));
    } catch {
      setMessage("Could not update that entry yet.");
      toastError("Could not update that capture");
      throw new Error("Could not update that capture");
    } finally {
      setBusyEntryId(null);
    }
  }

  async function saveInstructions(
    entryId: Id<"ingestionQueueEntries">,
    text: string,
  ) {
    if (!householdId || !moveId) return;
    setBusyEntryId(entryId);
    setMessage(null);
    try {
      await updateEntry({
        householdId,
        moveId,
        entryId,
        instructions: text,
      });
      setEditingEntryId(null);
      setEditingText("");
      toastSaved("Directions saved");
    } catch {
      setMessage("Could not save those directions yet.");
      toastError("Could not save those directions");
      throw new Error("Could not save those directions");
    } finally {
      setBusyEntryId(null);
    }
  }

  // F3: add images to an EXISTING queued/needs-input entry. We never call
  // updateEntry here — that would wholesale-replace media and (for needsInput)
  // auto-requeue, which adding a photo must not do. Instead we kick the files
  // through the background uploader, which appendMedia's them and bumps the
  // entry's expectedMediaCount-driven rollup so the uploading status shows.
  function handleAddImages(
    entry: (typeof sorted)[number],
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!householdId || !moveId || files.length === 0) return;
    setMessage(null);

    const accepted: { file: File; kind: "image" | "audio" | "video" }[] = [];
    for (const file of files) {
      const validation = validateMediaUploadFile(file);
      const kind = mediaKindForMimeType(file.type);
      if (!validation.ok || !kind) {
        setMessage(
          validation.message ?? `${file.name} is not a supported file.`,
        );
        continue;
      }
      accepted.push({ file, kind });
    }
    if (accepted.length === 0) return;

    // Hand the files to the background uploader. It appendMedia's each finished
    // photo onto this entry (never replacing, never requeuing needsInput). We do
    // NOT raise expectedMediaCount here — there's no mutation for that and the
    // live per-file spinners come from jobsForEntry, so the uploading status is
    // surfaced regardless of the coarse server rollup.
    enqueue({ entryId: entry._id, householdId, moveId }, accepted);
  }

  async function dismissPendingUpload(
    entryId: Id<"ingestionQueueEntries">,
  ) {
    if (!householdId || !moveId) return;
    setBusyEntryId(entryId);
    setMessage(null);
    try {
      await setMediaUploadState({
        householdId,
        moveId,
        entryId,
        state: "complete",
        finalizeCount: true,
      });
    } catch {
      setMessage("Could not clear that upload state yet.");
    } finally {
      setBusyEntryId(null);
    }
  }

  function openDetail(
    entryId: Id<"ingestionQueueEntries">,
    position: number,
  ) {
    setDetailEntryId(entryId);
    setDetailIndex(position);
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
        {visibleEntries.map((entry, index) => {
          const editable =
            entry.status === "queued" || entry.status === "needsInput";
          const busy = busyEntryId === entry._id;

          // Combine the server rollup (mediaUploadState, which survives reload)
          // with this client's live background jobs (which hold per-file
          // progress only while THIS tab is uploading).
          const entryJobs = jobsForEntry(entry._id);
          const livePending = pendingCountForEntry(entry._id);
          const liveFailed = entryJobs.some((job) => job.status === "error");
          const serverFailed = entry.mediaUploadState === "failed";
          // Server says still uploading when it flagged "uploading", or when it
          // expects more photos than have attached so far — but a "failed"
          // rollup takes priority (an incomplete count is exactly the failed
          // case, so it must not read as still-pending).
          const serverPending =
            !serverFailed &&
            (entry.mediaUploadState === "uploading" ||
              (entry.expectedMediaCount != null &&
                entry.mediaPhotoIds.length < entry.expectedMediaCount));

          // Live in-flight jobs always win (this tab is actively uploading);
          // otherwise fall back to the server rollup. Failed only when nothing
          // is currently in flight.
          const uploading = livePending > 0 || (serverPending && !liveFailed);
          const failed =
            !uploading && (liveFailed || serverFailed) && livePending === 0;
          // Server says pending but this session has no live job (e.g. a full
          // page reload dropped the in-memory upload). The user can't retry a
          // job that no longer exists, so offer the same recovery affordances as
          // the failed case: add the missing photos, or dismiss the stuck state.
          const orphanedPending = uploading && livePending === 0;
          // After a reload there are no in-session jobs to re-run, so retry has
          // nothing to act on — offer "Add the missing photos" + "Dismiss".
          const retryableJobs = entryJobs.filter(
            (job) => job.status === "error",
          );

          // Stop a click on any inline control from also opening the detail
          // modal (the whole <li> is clickable).
          const stop = (event: { stopPropagation: () => void }) =>
            event.stopPropagation();

          return (
            <li
              key={entry._id}
              role="button"
              tabIndex={0}
              aria-label={`Open capture ${index + 1}`}
              onClick={() => openDetail(entry._id, index + 1)}
              onKeyDown={(event) => {
                if (
                  (event.key === "Enter" || event.key === " ") &&
                  event.target === event.currentTarget
                ) {
                  event.preventDefault();
                  openDetail(entry._id, index + 1);
                }
              }}
              className="cursor-pointer rounded-md border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold tabular-nums text-muted-foreground"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  {entry.claimedByAgentLabel ? (
                    <Badge variant="secondary">
                      <Bot className="size-3" aria-hidden="true" />
                      {entry.claimedByAgentLabel}
                    </Badge>
                  ) : null}
                  {uploading ? (
                    <Badge
                      variant="secondary"
                      role="status"
                      aria-live="polite"
                    >
                      <Loader2
                        className="size-3 animate-spin"
                        aria-hidden="true"
                      />
                      {livePending > 0
                        ? `Uploading ${livePending}…`
                        : "Uploading…"}
                    </Badge>
                  ) : failed ? (
                    <Badge variant="destructive" aria-label="Upload failed">
                      <AlertTriangle className="size-3" aria-hidden="true" />
                      Upload failed
                    </Badge>
                  ) : null}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>

              {/* Desktop (md+): big primary thumbnail · content · a vertical
                  column of quick actions beside it. Mobile: stacked, with the
                  small thumbnail strip and a horizontal action row. */}
              <div className="mt-2 flex flex-col gap-3 md:flex-row md:gap-4">
                {entry.mediaPhotoIds.length || entryJobs.length ? (
                  <div className="md:w-56 md:shrink-0">
                    <QueueMediaThumbnails
                      householdId={householdId}
                      moveId={moveId}
                      mediaPhotoIds={entry.mediaPhotoIds}
                      jobs={entryJobs}
                    />
                  </div>
                ) : null}

                <div className="space-y-2 md:min-w-0 md:flex-1">
                  {failed || orphanedPending ? (
                    <div
                      className="flex flex-wrap items-center gap-2"
                      onClick={stop}
                    >
                      {retryableJobs.length > 0 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            for (const job of retryableJobs) {
                              retry(job.id);
                            }
                          }}
                        >
                          <RotateCcw aria-hidden="true" />
                          Retry upload
                        </Button>
                      ) : editable ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            addImagesInputRefs.current.get(entry._id)?.click()
                          }
                        >
                          <ImagePlus aria-hidden="true" />
                          Add the missing photos
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void dismissPendingUpload(entry._id)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  ) : null}

                  {entry.agentQuestion ? (
                    <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm">
                      Agent asks: {entry.agentQuestion}
                    </p>
                  ) : null}

                  {editingEntryId === entry._id ? (
                    <div className="space-y-2" onClick={stop}>
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
                          onClick={() =>
                            void saveInstructions(entry._id, editingText)
                          }
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
                    <p className="text-sm leading-6">{entry.instructions}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No written directions — media only.
                    </p>
                  )}

                  {entry.agentSummary ? (
                    <p className="text-sm text-muted-foreground">
                      Agent: {entry.agentSummary}
                      {entry.resultItemIds?.length
                        ? ` (${entry.resultItemIds.length} items proposed)`
                        : ""}
                    </p>
                  ) : null}

                  {entry.resultItemIds?.length ? (
                    <Button
                      asChild
                      size="sm"
                      variant="link"
                      className="h-auto p-0"
                      onClick={stop}
                    >
                      <Link href="/app/items#inventory-records">
                        View{" "}
                        {entry.resultItemIds.length === 1
                          ? "the produced item"
                          : `${entry.resultItemIds.length} produced items`}
                        <ArrowUpRight aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : null}
                </div>

                <div
                  className="flex flex-wrap gap-2 md:shrink-0 md:flex-col"
                  onClick={stop}
                >
                  {editable && editingEntryId !== entry._id ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            aria-label={
                              entry.status === "needsInput"
                                ? "Answer & requeue"
                                : "Edit directions"
                            }
                            onClick={() => {
                              setEditingEntryId(entry._id);
                              setEditingText(entry.instructions ?? "");
                            }}
                          >
                            <Settings aria-hidden="true" />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {entry.status === "needsInput"
                          ? "Answer & requeue"
                          : "Edit directions"}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                  {editable && editingEntryId !== entry._id ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            aria-label="Add images"
                            onClick={() =>
                              addImagesInputRefs.current
                                .get(entry._id)
                                ?.click()
                            }
                          >
                            <ImagePlus aria-hidden="true" />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Add images</TooltipContent>
                    </Tooltip>
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
                  {entry.status === "queued" ||
                  entry.status === "needsInput" ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            aria-label="Discard"
                            onClick={() =>
                              void changeStatus(entry._id, "discarded")
                            }
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Discard</TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
              </div>

              {/* F3: hidden picker for "Add images" — only mounted when the
                  entry is editable (queued/needsInput). */}
              {editable ? (
                <input
                  ref={(node) => {
                    addImagesInputRefs.current.set(entry._id, node);
                  }}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  aria-hidden="true"
                  tabIndex={-1}
                  // The input lives inside the clickable row, so its programmatic
                  // .click() (fired by the "Add images" buttons) would otherwise
                  // bubble up and also open the detail modal.
                  onClick={stop}
                  onChange={(event) => handleAddImages(entry, event)}
                />
              ) : null}
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

  // The top-level Queue page filters by lifecycle bucket. Each filter chip
  // doubles as a live stat, so the separate header count pills are gone.
  const doneCount = taskCounts.archive;
  const queueFilters: Array<{
    value: QueueFilter;
    label: string;
    count: number;
  }> = [
    { value: "todo", label: "To do", count: queuedCount },
    { value: "working", label: "Working", count: agentWorkingCount },
    { value: "review", label: "Review", count: needsReviewCount },
    { value: "done", label: "Done", count: doneCount },
    { value: "all", label: "All", count: sorted.length },
  ];
  const filteredEntries =
    queueFilter === "all"
      ? sorted
      : sorted.filter(
          (entry) => queueFilterForStatus(entry.status) === queueFilter,
        );
  const activeQueueFilter =
    queueFilters.find((filter) => filter.value === queueFilter) ??
    queueFilters[0];

  const detailEntry = detailEntryId
    ? (sorted.find((entry) => entry._id === detailEntryId) ?? null)
    : null;
  const detailEditable =
    detailEntry?.status === "queued" || detailEntry?.status === "needsInput";

  return (
    <Card id="ingestion-queue" size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="size-4 text-primary" aria-hidden="true" />
          Agent queue
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="text-muted-foreground"
                aria-label="About the agent queue"
              >
                <Info className="size-3.5" aria-hidden="true" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Captures wait here for your connected AI agent, alongside what it
              produced. Connect an agent with an API key in Settings.
            </TooltipContent>
          </Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {scopes && (scopes.canManage || scopes.delegatedOwners.length > 0) ? (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor="queue-scope" className="text-muted-foreground">
                Showing
              </label>
              <div className="relative inline-flex items-center">
                <select
                  id="queue-scope"
                  className="h-8 appearance-none rounded-md border border-input bg-background pl-2 pr-8 text-sm font-medium text-foreground"
                  value={effectiveScope}
                  onChange={(event) =>
                    setOwnerScope(
                      event.target.value as "mine" | "all" | Id<"users">,
                    )
                  }
                >
                  <option value="mine">My Queue</option>
                  {scopes.delegatedOwners.map((owner) => (
                    <option key={owner.userId} value={owner.userId}>
                      {owner.name}&apos;s Queue
                    </option>
                  ))}
                  {scopes.canManage ? (
                    <option value="all">Everyone&apos;s Queue</option>
                  ) : null}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2 size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {scopes.canManage
                ? "Pick whose photos and notes your AI agent turns into inventory. Because you manage this move you can run anyone's queue here; who can run yours is set per person under Configure → Participants (the “Let them run my queue” button)."
                : "Pick whose captures your AI agent processes — your own, plus any queue the owner lets you run."}
            </p>
          </div>
        ) : null}
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-4/5" />
          </div>
        ) : sorted.length ? (
          view === "todo-done" ? (
            <div className="space-y-3">
              <div
                className="flex flex-wrap gap-1.5"
                role="tablist"
                aria-label="Queue filters"
              >
                {queueFilters.map((filter) => {
                  const active = queueFilter === filter.value;
                  return (
                    <button
                      key={filter.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setQueueFilter(filter.value)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {filter.label}
                      <span className="rounded bg-background/70 px-1 text-xs font-semibold tabular-nums">
                        {filter.count}
                      </span>
                    </button>
                  );
                })}
              </div>
              {renderEntryList(
                filteredEntries,
                activeQueueFilter.value === "done"
                  ? "No resolved or discarded captures yet."
                  : activeQueueFilter.value === "all"
                    ? "The queue is empty."
                    : `Nothing in ${activeQueueFilter.label.toLowerCase()} right now.`,
                `${activeQueueFilter.value} ingestion queue entries`,
              )}
            </div>
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

        <QueueEntryDetailSheet
          householdId={householdId}
          moveId={moveId}
          entry={detailEntry}
          index={detailIndex}
          open={detailEntry !== null}
          onOpenChange={(open) => {
            if (!open) {
              setDetailEntryId(null);
              setDetailIndex(null);
            }
          }}
          busy={detailEntryId !== null && busyEntryId === detailEntryId}
          editable={Boolean(detailEditable)}
          onChangeStatus={(status) => {
            if (detailEntryId) return changeStatus(detailEntryId, status);
          }}
          onSaveInstructions={(text) => {
            if (detailEntryId) return saveInstructions(detailEntryId, text);
          }}
          onAddImages={() => {
            if (detailEntryId) {
              addImagesInputRefs.current.get(detailEntryId)?.click();
            }
          }}
        />
      </CardContent>
    </Card>
  );
}
