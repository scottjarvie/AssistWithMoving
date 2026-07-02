import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

// The provider's riskiest logic is the per-file job state machine (enqueue →
// uploading → finalizing → done/error), the failure → server "failed" rollup,
// and the retry transition. Drive it with a fake uploadMediaFile so we can step
// the machine deterministically.
const harness = vi.hoisted(() => ({
  appendMedia: vi.fn(async () => undefined),
  setMediaUploadState: vi.fn(async () => undefined),
  uploadMediaFile: vi.fn(),
}));

vi.mock("../../convex/_generated/api", () => ({
  api: {
    photos: {
      initUpload: "photos.initUpload",
      finalizeUpload: "photos.finalizeUpload",
      cancelUploadSession: "photos.cancelUploadSession",
    },
    ingestionQueue: {
      appendMedia: "ingestionQueue.appendMedia",
      setMediaUploadState: "ingestionQueue.setMediaUploadState",
    },
  },
}));

vi.mock("convex/react", () => ({
  useAction: () => vi.fn(),
  useMutation: (mutation: string) => {
    if (mutation === "ingestionQueue.appendMedia") return harness.appendMedia;
    if (mutation === "ingestionQueue.setMediaUploadState") {
      return harness.setMediaUploadState;
    }
    return vi.fn();
  },
}));

vi.mock("@/lib/media-upload", () => ({
  uploadMediaFile: harness.uploadMediaFile,
}));

import {
  MediaUploadProvider,
  useMediaUpload,
} from "@/components/media-upload-provider";

const household = "household_1" as Id<"households">;
const move = "move_1" as Id<"moves">;
const entry = "entry_1" as Id<"ingestionQueueEntries">;

function wrapper({ children }: { children: React.ReactNode }) {
  return <MediaUploadProvider>{children}</MediaUploadProvider>;
}

function imageFile(name: string) {
  return new File(["x"], name, { type: "image/jpeg" });
}

function deferredPhotoUpload() {
  let resolve!: (photoId: Id<"itemPhotos">) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Id<"itemPhotos">>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("MediaUploadProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs a job to completion, appends the photo, and prunes the done job", async () => {
    harness.uploadMediaFile.mockResolvedValue(
      "photo_1" as Id<"itemPhotos">,
    );

    const { result } = renderHook(() => useMediaUpload(), { wrapper });

    act(() => {
      result.current.enqueue({ entryId: entry, householdId: household, moveId: move }, [
        { file: imageFile("a.jpg"), kind: "image" },
      ]);
    });

    // The finished photo is attached to the saved entry...
    await waitFor(() => {
      expect(harness.appendMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          entryId: entry,
          mediaPhotoIds: ["photo_1"],
        }),
      );
    });
    // ...and the done job is pruned (it shows as a resolved thumbnail instead).
    await waitFor(() => {
      expect(result.current.jobsForEntry(entry)).toHaveLength(0);
    });
    expect(result.current.pendingCountForEntry(entry)).toBe(0);
    expect(harness.setMediaUploadState).not.toHaveBeenCalled();
  });

  it("marks a failed upload 'error', writes the 'failed' server rollup, and retry re-queues it", async () => {
    harness.uploadMediaFile.mockRejectedValueOnce(new Error("network blip"));

    const { result } = renderHook(() => useMediaUpload(), { wrapper });

    act(() => {
      result.current.enqueue({ entryId: entry, householdId: household, moveId: move }, [
        { file: imageFile("a.jpg"), kind: "image" },
      ]);
    });

    // The job lands in 'error' and the entry rollup is flagged 'failed' (the
    // entry stays saved — never auto-discarded).
    await waitFor(() => {
      const jobs = result.current.jobsForEntry(entry);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.status).toBe("error");
    });
    expect(harness.setMediaUploadState).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: entry, state: "failed" }),
    );

    // Retry succeeds: the failed job re-queues and runs to completion.
    harness.uploadMediaFile.mockResolvedValue("photo_2" as Id<"itemPhotos">);
    const failedJobId = result.current.jobsForEntry(entry)[0]!.id;
    act(() => {
      result.current.retry(failedJobId);
    });

    await waitFor(() => {
      expect(harness.appendMedia).toHaveBeenCalledWith(
        expect.objectContaining({ mediaPhotoIds: ["photo_2"] }),
      );
    });
    await waitFor(() => {
      expect(result.current.jobsForEntry(entry)).toHaveLength(0);
    });
  });

  it("dismiss drops a failed job from the list", async () => {
    harness.uploadMediaFile.mockRejectedValue(new Error("nope"));

    const { result } = renderHook(() => useMediaUpload(), { wrapper });

    act(() => {
      result.current.enqueue({ entryId: entry, householdId: household, moveId: move }, [
        { file: imageFile("a.jpg"), kind: "image" },
      ]);
    });

    await waitFor(() => {
      expect(result.current.jobsForEntry(entry)[0]?.status).toBe("error");
    });

    const jobId = result.current.jobsForEntry(entry)[0]!.id;
    act(() => {
      result.current.dismiss(jobId);
    });

    expect(result.current.jobsForEntry(entry)).toHaveLength(0);
  });

  it("releases the entry to 'failed' when an IN-FLIGHT upload is aborted (dismiss/teardown) — never stranded 'uploading'", async () => {
    // An upload that only settles when its signal aborts — mimics dismiss() or
    // provider unmount cancelling the in-flight PUT mid-flight.
    harness.uploadMediaFile.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new DOMException("Upload cancelled.", "AbortError")),
          );
        }),
    );

    const { result } = renderHook(() => useMediaUpload(), { wrapper });

    act(() => {
      result.current.enqueue({ entryId: entry, householdId: household, moveId: move }, [
        { file: imageFile("a.jpg"), kind: "image" },
      ]);
    });

    // Job is in flight ('uploading').
    await waitFor(() => {
      expect(result.current.jobsForEntry(entry)[0]?.status).toBe("uploading");
    });

    const jobId = result.current.jobsForEntry(entry)[0]!.id;
    act(() => {
      result.current.dismiss(jobId);
    });

    // The cancelled upload MUST flag the entry rollup 'failed' — otherwise it
    // stays 'uploading' forever and the agent can never claim it (the same
    // strand-class bug fixed for failed uploads, on the abort path).
    await waitFor(() => {
      expect(harness.setMediaUploadState).toHaveBeenCalledWith(
        expect.objectContaining({ entryId: entry, state: "failed" }),
      );
    });
  });

  it("defers a failed rollup while sibling uploads for the same entry are still live", async () => {
    const uploads: ReturnType<typeof deferredPhotoUpload>[] = [];
    harness.uploadMediaFile.mockImplementation(
      ({ signal }: { signal: AbortSignal }) => {
        const upload = deferredPhotoUpload();
        uploads.push(upload);
        signal.addEventListener("abort", () =>
          upload.reject(new DOMException("Upload cancelled.", "AbortError")),
        );
        return upload.promise;
      },
    );

    const { result } = renderHook(() => useMediaUpload(), { wrapper });

    act(() => {
      result.current.enqueue({ entryId: entry, householdId: household, moveId: move }, [
        { file: imageFile("a.jpg"), kind: "image" },
        { file: imageFile("b.jpg"), kind: "image" },
      ]);
    });

    await waitFor(() => {
      expect(uploads).toHaveLength(2);
      expect(result.current.jobsForEntry(entry)).toHaveLength(2);
    });

    const firstJobId = result.current.jobsForEntry(entry)[0]!.id;
    act(() => {
      result.current.dismiss(firstJobId);
    });

    await waitFor(() => {
      expect(result.current.jobsForEntry(entry)).toHaveLength(1);
    });
    expect(harness.setMediaUploadState).not.toHaveBeenCalled();

    act(() => {
      uploads[1]!.resolve("photo_2" as Id<"itemPhotos">);
    });

    await waitFor(() => {
      expect(harness.appendMedia).toHaveBeenCalledWith(
        expect.objectContaining({ mediaPhotoIds: ["photo_2"] }),
      );
    });
    await waitFor(() => {
      expect(harness.setMediaUploadState).toHaveBeenCalledWith(
        expect.objectContaining({ entryId: entry, state: "failed" }),
      );
    });
  });

  it("retries a finalized-but-unattached photo without uploading a duplicate", async () => {
    harness.uploadMediaFile.mockResolvedValue("photo_1" as Id<"itemPhotos">);
    harness.appendMedia
      .mockRejectedValueOnce(new Error("entry temporarily locked"))
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useMediaUpload(), { wrapper });

    act(() => {
      result.current.enqueue({ entryId: entry, householdId: household, moveId: move }, [
        { file: imageFile("a.jpg"), kind: "image" },
      ]);
    });

    await waitFor(() => {
      expect(result.current.jobsForEntry(entry)[0]?.status).toBe("error");
    });
    expect(harness.uploadMediaFile).toHaveBeenCalledTimes(1);

    const failedJobId = result.current.jobsForEntry(entry)[0]!.id;
    act(() => {
      result.current.retry(failedJobId);
    });

    await waitFor(() => {
      expect(harness.appendMedia).toHaveBeenCalledTimes(2);
    });
    expect(harness.uploadMediaFile).toHaveBeenCalledTimes(1);
    expect(harness.appendMedia).toHaveBeenLastCalledWith(
      expect.objectContaining({ mediaPhotoIds: ["photo_1"] }),
    );
  });
});
