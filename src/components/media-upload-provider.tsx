"use client";

// Background media-upload manager. The capture form hands a saved queue entry's
// id plus the picked files to enqueue(); from there each file uploads in the
// background (init → PUT → finalize) and the resulting photo id is appended to
// the entry via api.ingestionQueue.appendMedia. The form is free immediately —
// it does not await any of this.
//
// This provider is mounted high in the (product) client tree (inside
// MoveWorkspaceProvider, above the AppShell), so jobs survive the capture Sheet
// closing and intra-app navigation. It holds the File objects in memory, so a
// full page reload DOES lose in-flight jobs — that is acceptable and handled by
// the retry / F3 "add images later" paths. Per-file progress, error, and retry
// live here (this layer owns the File); the server only tracks a coarse rollup.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAction, useMutation } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { type MediaKind, uploadMediaFile } from "@/lib/media-upload";

// How many files upload at once across the whole app. Keeps us from hammering
// the storage endpoint / finalize (which runs Sharp derivatives) when a user
// drops a big batch.
const MAX_CONCURRENT_UPLOADS = 3;

export type UploadJobStatus =
  | "queued"
  | "uploading"
  | "finalizing"
  | "done"
  | "error";

export type UploadJob = {
  id: string;
  entryId: Id<"ingestionQueueEntries">;
  householdId: Id<"households">;
  moveId: Id<"moves">;
  file: File;
  kind: MediaKind;
  status: UploadJobStatus;
  progress: number;
  error?: string;
  finalizedPhotoId?: Id<"itemPhotos">;
};

// Map a raw upload error (storage/SDK/network) to a short, actionable message
// for the background queue UI. The detailed cause is already logged; users just
// need to know whether to retry.
function friendlyUploadError(error: unknown): string {
  const raw = error instanceof Error && error.message ? error.message : "";
  const lower = raw.toLowerCase();
  if (lower.includes("too large")) return "That file is too large to upload.";
  if (lower.includes("unsupported") || lower.includes("not allowed")) {
    return "That file type can't be uploaded.";
  }
  if (
    lower.includes("forbidden") ||
    lower.includes("signature") ||
    lower.includes("403")
  ) {
    return "Storage rejected the upload. Tap retry.";
  }
  if (
    lower.includes("timed out") ||
    lower.includes("timeout")
  ) {
    return "Upload timed out. It will retry automatically.";
  }
  if (
    lower.includes("network") ||
    lower.includes("failed to fetch") ||
    raw === ""
  ) {
    return "Network problem during upload. Tap retry.";
  }
  return "Upload failed. Tap retry.";
}

export type EnqueueFile = { file: File; kind: MediaKind };

export type MediaUploadContextValue = {
  // Kick off background uploads for an already-saved entry. Returns nothing —
  // the caller does not wait.
  enqueue: (
    args: {
      entryId: Id<"ingestionQueueEntries">;
      householdId: Id<"households">;
      moveId: Id<"moves">;
    },
    files: EnqueueFile[],
  ) => void;
  // Re-run a failed job from the start.
  retry: (jobId: string) => void;
  // Drop a job from the list (used to clear a permanently-failed/dismissed job).
  dismiss: (jobId: string) => void;
  // All jobs (any status) for one entry, for inline per-file UI.
  jobsForEntry: (entryId: Id<"ingestionQueueEntries">) => UploadJob[];
  // Count of jobs still in flight (queued/uploading/finalizing) for one entry.
  pendingCountForEntry: (entryId: Id<"ingestionQueueEntries">) => number;
};

const MediaUploadContext = createContext<MediaUploadContextValue | null>(null);

function makeJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function MediaUploadProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const initUpload = useAction(api.photos.initUpload);
  const finalizeUpload = useAction(api.photos.finalizeUpload);
  const cancelUploadSession = useMutation(api.photos.cancelUploadSession);
  const appendMedia = useMutation(api.ingestionQueue.appendMedia);
  const setMediaUploadState = useMutation(
    api.ingestionQueue.setMediaUploadState,
  );

  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const jobsRef = useRef<UploadJob[]>([]);
  const deferredFailedEntryIdsRef = useRef(new Set<string>());

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  // Bound Convex hooks change identity; keep a ref so the long-lived runner loop
  // always calls the current ones without being a dependency of the loop. The
  // ref is updated in an effect (never during render) per react-hooks/refs.
  const depsRef = useRef({
    initUpload,
    finalizeUpload,
    cancelUploadSession,
    appendMedia,
    setMediaUploadState,
  });
  useEffect(() => {
    depsRef.current = {
      initUpload,
      finalizeUpload,
      cancelUploadSession,
      appendMedia,
      setMediaUploadState,
    };
  }, [
    initUpload,
    finalizeUpload,
    cancelUploadSession,
    appendMedia,
    setMediaUploadState,
  ]);

  // Number of jobs currently running, and AbortControllers so we can cancel
  // in-flight uploads on unmount.
  const runningRef = useRef(0);
  const abortControllersRef = useRef(new Map<string, AbortController>());
  // Bump to wake the scheduler whenever jobs change or one finishes.
  const [pumpTick, setPumpTick] = useState(0);
  const pump = useCallback(() => setPumpTick((tick) => tick + 1), []);

  const patchJob = useCallback(
    (jobId: string, patch: Partial<UploadJob>) => {
      setJobs((current) =>
        current.map((job) =>
          job.id === jobId ? { ...job, ...patch } : job,
        ),
      );
    },
    [],
  );

  const removeJob = useCallback((jobId: string) => {
    setJobs((current) => current.filter((job) => job.id !== jobId));
  }, []);

  const hasLiveSibling = useCallback((job: UploadJob) => {
    return jobsRef.current.some(
      (candidate) =>
        candidate.entryId === job.entryId &&
        candidate.id !== job.id &&
        (candidate.status === "queued" ||
          candidate.status === "uploading" ||
          candidate.status === "finalizing"),
    );
  }, []);

  const markEntryFailedWhenTerminal = useCallback(
    async (
      job: UploadJob,
      deps: Pick<typeof depsRef.current, "setMediaUploadState">,
    ) => {
      if (hasLiveSibling(job)) {
        deferredFailedEntryIdsRef.current.add(String(job.entryId));
        return;
      }
      deferredFailedEntryIdsRef.current.delete(String(job.entryId));
      await deps
        .setMediaUploadState({
          householdId: job.householdId,
          moveId: job.moveId,
          entryId: job.entryId,
          state: "failed",
        })
        .catch(() => {});
    },
    [hasLiveSibling],
  );

  const flushDeferredFailureIfTerminal = useCallback(
    async (
      job: UploadJob,
      deps: Pick<typeof depsRef.current, "setMediaUploadState">,
    ) => {
      if (!deferredFailedEntryIdsRef.current.has(String(job.entryId))) return;
      if (hasLiveSibling(job)) return;
      deferredFailedEntryIdsRef.current.delete(String(job.entryId));
      await deps
        .setMediaUploadState({
          householdId: job.householdId,
          moveId: job.moveId,
          entryId: job.entryId,
          state: "failed",
        })
        .catch(() => {});
    },
    [hasLiveSibling],
  );

  const runJob = useCallback(
    async (job: UploadJob) => {
      const deps = depsRef.current;
      const controller = new AbortController();
      abortControllersRef.current.set(job.id, controller);

      patchJob(job.id, { status: "uploading", progress: 0, error: undefined });

      try {
        let photoId = job.finalizedPhotoId;
        if (photoId) {
          patchJob(job.id, { status: "finalizing", progress: 100 });
        } else {
          photoId = await uploadMediaFile({
            householdId: job.householdId,
            moveId: job.moveId,
            file: job.file,
            kind: job.kind,
            deps: {
              initUpload: deps.initUpload,
              finalizeUpload: deps.finalizeUpload,
              cancelUploadSession: deps.cancelUploadSession,
            },
            onProgress: (progress) => {
              patchJob(job.id, { progress });
              // Once the PUT completes (100%), finalize/derivatives are running.
              if (progress >= 100) {
                patchJob(job.id, { status: "finalizing" });
              }
            },
            onRetry: () => {
              // A transient failure is being retried automatically — reset the
              // bar and clear the prior error so it doesn't look stuck/failed.
              patchJob(job.id, {
                status: "uploading",
                progress: 0,
                error: undefined,
              });
            },
            signal: controller.signal,
          });
          patchJob(job.id, { finalizedPhotoId: photoId });
        }

        // Attach the finished photo to the saved entry. appendMedia recomputes
        // the entry's mediaUploadState rollup (complete once all expected
        // photos land) and never requeues a needsInput entry.
        await deps.appendMedia({
          householdId: job.householdId,
          moveId: job.moveId,
          entryId: job.entryId,
          mediaPhotoIds: [photoId],
        });
        await flushDeferredFailureIfTerminal(job, deps);

        // The photo is now attached (it shows as a resolved thumbnail via the
        // entry's mediaPhotoIds), so a "done" job carries no UI value. Drop it
        // to keep the long-lived jobs array (and its File references) from
        // growing without bound across a heavy capture session. "error" jobs are
        // kept so retry/dismiss still have something to act on.
        removeJob(job.id);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          // Aborted by an explicit dismiss or by provider teardown. The PUT is
          // cancelled and will never finish, so the entry must NOT be left in
          // 'uploading' — that strands it un-claimable forever (the same
          // strand-class bug a failed upload caused, just on the abort path).
          // Flag the rollup 'failed' (best effort) so isMediaUploadPending
          // releases it and the queue surfaces a retry; the entry is never
          // auto-discarded.
          await markEntryFailedWhenTerminal(job, deps);
          return;
        }
        // Only reached after automatic retries are exhausted (uploadMediaFile
        // retries transient failures itself). Surface a short, actionable message
        // rather than a raw storage/SDK error string.
        patchJob(job.id, { status: "error", error: friendlyUploadError(error) });
        // Flag the entry rollup as failed so the queue list can surface retry.
        // The entry itself stays saved — never auto-discarded.
        await markEntryFailedWhenTerminal(job, deps);
      } finally {
        abortControllersRef.current.delete(job.id);
        runningRef.current -= 1;
        pump();
      }
    },
    [
      flushDeferredFailureIfTerminal,
      markEntryFailedWhenTerminal,
      patchJob,
      removeJob,
      pump,
    ],
  );

  // Scheduler: whenever jobs change or a slot frees up, start as many queued
  // jobs as the concurrency cap allows.
  useEffect(() => {
    if (runningRef.current >= MAX_CONCURRENT_UPLOADS) return;
    const next = jobs.filter((job) => job.status === "queued");
    for (const job of next) {
      if (runningRef.current >= MAX_CONCURRENT_UPLOADS) break;
      runningRef.current += 1;
      // Mark uploading synchronously-ish via runJob's first patch; guard against
      // double-start by flipping status here too.
      void runJob(job);
    }
    // We intentionally do not start the same job twice: runJob's first patch
    // moves it off "queued", and this effect re-runs on that state change.
  }, [jobs, pumpTick, runJob]);

  // Cancel any in-flight uploads if the provider ever unmounts (e.g. leaving the
  // whole product shell). Within /app it stays mounted, so this is a safety net.
  useEffect(() => {
    const controllers = abortControllersRef.current;
    return () => {
      for (const controller of controllers.values()) {
        controller.abort();
      }
      controllers.clear();
    };
  }, []);

  const enqueue = useCallback<MediaUploadContextValue["enqueue"]>(
    ({ entryId, householdId, moveId }, files) => {
      if (files.length === 0) return;
      const newJobs: UploadJob[] = files.map(({ file, kind }) => ({
        id: makeJobId(),
        entryId,
        householdId,
        moveId,
        file,
        kind,
        status: "queued",
        progress: 0,
      }));
      setJobs((current) => [...current, ...newJobs]);
    },
    [],
  );

  const retry = useCallback<MediaUploadContextValue["retry"]>((jobId) => {
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId && job.status === "error"
          ? {
              ...job,
              status: "queued",
              progress: job.finalizedPhotoId ? 100 : 0,
              error: undefined,
            }
          : job,
      ),
    );
  }, []);

  const dismiss = useCallback<MediaUploadContextValue["dismiss"]>(
    (jobId) => {
      const job = jobs.find((candidate) => candidate.id === jobId);
      const controller = abortControllersRef.current.get(jobId);
      controller?.abort();
      abortControllersRef.current.delete(jobId);
      // A job dismissed before it ever started uploading fires no AbortError,
      // so the runJob catch never runs to release the entry. Do it here so a
      // never-started capture isn't stranded 'uploading'. (uploading/finalizing
      // dismisses abort the PUT and are released by the catch; an 'error' job's
      // entry is already 'failed'.)
      if (job?.status === "queued") {
        void markEntryFailedWhenTerminal(job, depsRef.current);
      }
      setJobs((current) => current.filter((candidate) => candidate.id !== jobId));
    },
    [jobs, markEntryFailedWhenTerminal],
  );

  const jobsForEntry = useCallback<MediaUploadContextValue["jobsForEntry"]>(
    (entryId) => jobs.filter((job) => job.entryId === entryId),
    [jobs],
  );

  const pendingCountForEntry = useCallback<
    MediaUploadContextValue["pendingCountForEntry"]
  >(
    (entryId) =>
      jobs.filter(
        (job) =>
          job.entryId === entryId &&
          (job.status === "queued" ||
            job.status === "uploading" ||
            job.status === "finalizing"),
      ).length,
    [jobs],
  );

  const value = useMemo<MediaUploadContextValue>(
    () => ({
      enqueue,
      retry,
      dismiss,
      jobsForEntry,
      pendingCountForEntry,
    }),
    [enqueue, retry, dismiss, jobsForEntry, pendingCountForEntry],
  );

  return (
    <MediaUploadContext.Provider value={value}>
      {children}
    </MediaUploadContext.Provider>
  );
}

export function useMediaUpload(): MediaUploadContextValue {
  const context = useContext(MediaUploadContext);
  if (!context) {
    throw new Error(
      "useMediaUpload must be used within a MediaUploadProvider.",
    );
  }
  return context;
}
