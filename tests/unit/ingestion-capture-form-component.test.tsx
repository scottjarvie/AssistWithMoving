import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  ingestionQueue: {
    createEntry: "ingestionQueue.createEntry",
  },
  photos: {
    cancelUploadSession: "photos.cancelUploadSession",
    finalizeUpload: "photos.finalizeUpload",
    initUpload: "photos.initUpload",
  },
}));

const captureData = vi.hoisted(() => {
  let uploadIndex = 0;

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
      uploadIndex = 0;
    },
    initUpload: vi.fn(async (args: { derivatives?: unknown[] }) => {
      uploadIndex += 1;
      return {
        uploadSessionId: `session_${uploadIndex}`,
        uploadUrl: `https://uploads.example.com/original-${uploadIndex}`,
        headers: { "Content-Type": "application/octet-stream" },
        derivativeUploads: args.derivatives?.length
          ? [
              {
                variant: "thumb",
                uploadUrl: `https://uploads.example.com/thumb-${uploadIndex}`,
                headers: { "Content-Type": "image/webp" },
              },
            ]
          : [],
      };
    }),
    finalizeUpload: vi.fn(async () => `photo_${uploadIndex}`),
    cancelUploadSession: vi.fn(),
    createEntry: vi.fn(),
    createImageDerivatives: vi.fn(async () => [
      {
        variant: "thumb",
        blob: new Blob(["thumb"], { type: "image/webp" }),
        mimeType: "image/webp",
        sizeBytes: 5,
        width: 200,
        height: 200,
      },
    ]),
    fileSha256Hex: vi.fn(async (file: File) => `hash-${file.name}`),
    imageDimensions: vi.fn(async () => ({ width: 1600, height: 1200 })),
    mediaKindForMimeType: vi.fn(mediaKindForMimeType),
    uploadFileWithProgress: vi.fn(),
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
  useAction: (action: string) => {
    if (action === apiMock.photos.initUpload) {
      return captureData.initUpload;
    }
    if (action === apiMock.photos.finalizeUpload) {
      return captureData.finalizeUpload;
    }
    throw new Error(`Unexpected action ${action}`);
  },
  useMutation: (mutation: string) => {
    if (mutation === apiMock.photos.cancelUploadSession) {
      return captureData.cancelUploadSession;
    }
    if (mutation === apiMock.ingestionQueue.createEntry) {
      return captureData.createEntry;
    }
    throw new Error(`Unexpected mutation ${mutation}`);
  },
}));

vi.mock("@/lib/photo-upload", () => ({
  createImageDerivatives: captureData.createImageDerivatives,
  fileSha256Hex: captureData.fileSha256Hex,
  imageDimensions: captureData.imageDimensions,
  mediaKindForMimeType: captureData.mediaKindForMimeType,
  uploadFileWithProgress: captureData.uploadFileWithProgress,
  validateMediaUploadFile: captureData.validateMediaUploadFile,
}));

import { IngestionCaptureForm } from "@/components/ingestion-capture-form";

describe("IngestionCaptureForm", () => {
  beforeEach(() => {
    captureData.reset();
    vi.clearAllMocks();
  });

  it("keeps the quick note path available without requiring media", async () => {
    const user = userEvent.setup();

    render(
      <IngestionCaptureForm
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    expect(screen.getByText("Add media for this capture")).toBeInTheDocument();
    expect(
      screen.getByText("Photos, voice notes, or short clips can travel with one set of agent directions."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add note to queue" })).toBeDisabled();
    expect(screen.getByText("Add a note or media first.")).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Directions for your agent"),
      "Sell the lamp and keep the blue bin together.",
    );
    await user.click(screen.getByRole("button", { name: "Add note to queue" }));

    await waitFor(() => {
      expect(screen.getByText("Added to the queue. Ready for the next capture.")).toBeInTheDocument();
    });

    expect(captureData.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: "Sell the lamp and keep the blue bin together.",
        mediaPhotoIds: [],
      }),
    );
    expect(captureData.initUpload).not.toHaveBeenCalled();
  });

  it("shows selected media and saves uploaded attachments to the queue", async () => {
    const user = userEvent.setup();

    render(
      <IngestionCaptureForm
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    await user.upload(screen.getByLabelText("Capture media"), [
      new File(["front"], "front.jpg", { type: "image/jpeg" }),
      new File(["voice memo"], "voice.m4a", { type: "audio/mp4" }),
    ]);

    const attachments = screen.getByLabelText("Pending attachments");
    expect(within(attachments).getByText("front.jpg")).toBeInTheDocument();
    expect(within(attachments).getByText("5 B")).toBeInTheDocument();
    expect(within(attachments).getByText("voice.m4a")).toBeInTheDocument();
    expect(within(attachments).getByText("10 B")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 2 files to queue" })).toBeEnabled();

    await user.type(
      screen.getByLabelText("Directions for your agent"),
      "These are garage items for later sorting.",
    );
    await user.type(screen.getByLabelText("Room hint"), "Garage");
    await user.click(screen.getByRole("button", { name: "Add 2 files to queue" }));

    await waitFor(() => {
      expect(screen.getByText("Added to the queue. Ready for the next capture.")).toBeInTheDocument();
    });

    expect(captureData.initUpload).toHaveBeenCalledTimes(2);
    expect(captureData.createImageDerivatives).toHaveBeenCalledTimes(1);
    expect(captureData.uploadFileWithProgress).toHaveBeenCalledTimes(3);
    expect(captureData.finalizeUpload).toHaveBeenCalledTimes(2);
    expect(captureData.cancelUploadSession).not.toHaveBeenCalled();
    expect(captureData.initUpload).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        derivatives: [expect.objectContaining({ variant: "thumb" })],
        mimeType: "image/jpeg",
        room: "Garage",
      }),
    );
    expect(captureData.initUpload).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        derivatives: undefined,
        mimeType: "audio/mp4",
        room: "Garage",
      }),
    );
    expect(captureData.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: "These are garage items for later sorting.",
        mediaPhotoIds: ["photo_1", "photo_2"],
        roomHint: "Garage",
      }),
    );
  });
});
