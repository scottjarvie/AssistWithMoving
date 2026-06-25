import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  ingestionQueue: {
    createEntry: "ingestionQueue.createEntry",
  },
}));

const captureData = vi.hoisted(() => {
  let entryIndex = 0;

  function mediaKindForMimeType(mimeType: string) {
    if (mimeType.startsWith("image/")) {
      return "image";
    }
    if (mimeType.startsWith("audio/")) {
      return "audio";
    }
    if (mimeType.startsWith("video/")) {
      return "video";
    }
    return null;
  }

  return {
    reset() {
      entryIndex = 0;
    },
    // F1: createEntry runs FIRST and returns the new entry id; photos upload in
    // the background afterward, so the form never awaits an upload.
    createEntry: vi.fn(async () => {
      entryIndex += 1;
      return `entry_${entryIndex}` as Id<"ingestionQueueEntries">;
    }),
    enqueue: vi.fn(),
    mediaKindForMimeType: vi.fn(mediaKindForMimeType),
    validateMediaUploadFile: vi.fn((file: File) => ({
      ok: mediaKindForMimeType(file.type) !== null,
      message:
        mediaKindForMimeType(file.type) === null
          ? "Unsupported file."
          : undefined,
    })),
  };
});

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: (mutation: string) => {
    if (mutation === apiMock.ingestionQueue.createEntry) {
      return captureData.createEntry;
    }
    throw new Error(`Unexpected mutation ${mutation}`);
  },
}));

// F1 background upload: the form hands files to the media-upload provider's
// enqueue() instead of awaiting the upload itself. Stub the hook so we can
// assert enqueue is called with the saved entry id + the picked files.
vi.mock("@/components/media-upload-provider", () => ({
  useMediaUpload: () => ({ enqueue: captureData.enqueue }),
}));

vi.mock("@/lib/photo-upload", () => ({
  mediaKindForMimeType: captureData.mediaKindForMimeType,
  validateMediaUploadFile: captureData.validateMediaUploadFile,
}));

import { IngestionCaptureForm } from "@/components/ingestion-capture-form";

const household = "household_123" as Id<"households">;
const move = "move_123" as Id<"moves">;

function imageFile(name: string) {
  return new File(["front"], name, { type: "image/jpeg" });
}

describe("IngestionCaptureForm", () => {
  beforeEach(() => {
    captureData.reset();
    vi.clearAllMocks();
  });

  it("keeps the quick note path available without requiring media", async () => {
    const user = userEvent.setup();

    render(<IngestionCaptureForm householdId={household} moveId={move} />);

    expect(screen.getByText("Media")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Choose files" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add note to queue" }),
    ).toBeDisabled();
    expect(screen.getByText("Add a note or media first.")).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Directions/Requests"),
      "Sell the lamp and keep the blue bin together.",
    );
    await user.click(screen.getByRole("button", { name: "Add note to queue" }));

    await waitFor(() => {
      expect(
        screen.getByText("Added to the queue. Ready for the next capture."),
      ).toBeInTheDocument();
    });

    // A text-only entry saves with empty media and nothing to upload.
    expect(captureData.createEntry).toHaveBeenCalledTimes(1);
    expect(captureData.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: "Sell the lamp and keep the blue bin together.",
        mediaPhotoIds: [],
        expectedMediaCount: 0,
      }),
    );
    expect(captureData.enqueue).not.toHaveBeenCalled();
  });

  it("saves the entry FIRST with empty media and hands files to the background uploader", async () => {
    const user = userEvent.setup();

    render(<IngestionCaptureForm householdId={household} moveId={move} />);

    await user.upload(screen.getByLabelText("Choose media files"), [
      imageFile("front.jpg"),
      new File(["voice memo"], "voice.m4a", { type: "audio/mp4" }),
    ]);

    const attachments = screen.getByLabelText("Pending attachments");
    expect(within(attachments).getByText("front.jpg")).toBeInTheDocument();
    expect(within(attachments).getByText("voice.m4a")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add 2 files to queue" }),
    ).toBeEnabled();

    await user.type(
      screen.getByLabelText("Directions/Requests"),
      "These are garage items for later sorting.",
    );
    await user.click(screen.getByRole("button", { name: "Add 2 files to queue" }));

    await waitFor(() => {
      expect(
        screen.getByText(/photos uploading in the background/i),
      ).toBeInTheDocument();
    });

    // F1: the entry is created up front with NO media attached and an
    // expectedMediaCount the background rollup will count down to.
    expect(captureData.createEntry).toHaveBeenCalledTimes(1);
    expect(captureData.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: "These are garage items for later sorting.",
        mediaPhotoIds: [],
        expectedMediaCount: 2,
      }),
    );

    // The picked files are handed to the background uploader for the saved
    // entry rather than uploaded synchronously during submit.
    expect(captureData.enqueue).toHaveBeenCalledTimes(1);
    const [enqueueTarget, enqueueFiles] = captureData.enqueue.mock.calls[0]!;
    expect(enqueueTarget).toEqual(
      expect.objectContaining({
        entryId: "entry_1",
        householdId: household,
        moveId: move,
      }),
    );
    expect(enqueueFiles).toHaveLength(2);
    expect(enqueueFiles.map((f: { file: File }) => f.file.name)).toEqual([
      "front.jpg",
      "voice.m4a",
    ]);
  });

  it("defaults multiple photos to ONE combined entry (F2 default)", async () => {
    const user = userEvent.setup();

    render(<IngestionCaptureForm householdId={household} moveId={move} />);

    await user.upload(screen.getByLabelText("Choose media files"), [
      imageFile("a.jpg"),
      imageFile("b.jpg"),
      imageFile("c.jpg"),
    ]);

    // The combined option is the default selection.
    expect(
      screen.getByRole("button", { name: "One combined entry" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Add 3 files to queue" }));

    await waitFor(() => {
      expect(captureData.createEntry).toHaveBeenCalledTimes(1);
    });
    // One entry, all three photos enqueued onto it.
    expect(captureData.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ mediaPhotoIds: [], expectedMediaCount: 3 }),
    );
    expect(captureData.enqueue).toHaveBeenCalledTimes(1);
    expect(captureData.enqueue.mock.calls[0]![1]).toHaveLength(3);
  });

  it("opts IN to splitting into one entry per photo", async () => {
    const user = userEvent.setup();

    render(<IngestionCaptureForm householdId={household} moveId={move} />);

    await user.upload(screen.getByLabelText("Choose media files"), [
      imageFile("a.jpg"),
      imageFile("b.jpg"),
    ]);

    await user.click(
      screen.getByRole("button", { name: "Split into separate entries" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add 2 entries to queue" }),
    );

    await waitFor(() => {
      expect(captureData.createEntry).toHaveBeenCalledTimes(2);
    });
    // Two entries, each gets one photo enqueued.
    expect(captureData.enqueue).toHaveBeenCalledTimes(2);
    expect(captureData.enqueue.mock.calls[0]![1]).toHaveLength(1);
    expect(captureData.enqueue.mock.calls[1]![1]).toHaveLength(1);
  });
});
