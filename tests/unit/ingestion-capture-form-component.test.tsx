import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  floorPlans: {
    getActiveDocumentForMove: "floorPlans.getActiveDocumentForMove",
  },
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
    initUpload: vi.fn(async (...args: Record<string, unknown>[]) => {
      void args;
      uploadIndex += 1;
      return {
        uploadSessionId: `session_${uploadIndex}`,
        uploadUrl: `https://uploads.example.com/original-${uploadIndex}`,
        headers: { "Content-Type": "application/octet-stream" },
        derivativeUploads: [],
      };
    }),
    finalizeUpload: vi.fn(async () => ({
      photoId: `photo_${uploadIndex}`,
      derivativeStatus: "ready",
    })),
    cancelUploadSession: vi.fn(),
    createEntry: vi.fn(),
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
  useQuery: (query: string) =>
    query === apiMock.floorPlans.getActiveDocumentForMove
      ? { plan: { _id: "plan_123" } }
      : undefined,
}));

vi.mock("@/lib/photo-upload", () => ({
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
      screen.getByText("Camera and picker files upload as private originals before web display versions are created."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add note to queue" })).toBeDisabled();
    expect(screen.getByText("Add a note or media first.")).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Directions for your agent"),
      "Sell the lamp and keep the blue bin together.",
    );
    await user.click(screen.getByRole("button", { name: "Add note to queue" }));

    await waitFor(() => {
      expect(screen.getByText("Added to the agent queue. Ready for the next capture.")).toBeInTheDocument();
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

    const frontPhoto = new File(["front"], "front.jpg", {
      type: "image/jpeg",
      lastModified: 1710000000000,
    });
    const voiceMemo = new File(["voice memo"], "voice.m4a", {
      type: "audio/mp4",
      lastModified: 1710000005000,
    });

    await user.upload(screen.getByLabelText("Choose media files"), [
      frontPhoto,
      voiceMemo,
    ]);

    const attachments = screen.getByLabelText("Pending attachments");
    expect(within(attachments).getByText("front.jpg")).toBeInTheDocument();
    expect(within(attachments).getByText("5 B")).toBeInTheDocument();
    expect(
      await within(attachments).findByLabelText("front.jpg dimensions"),
    ).toHaveTextContent("1600x1200");
    expect(within(attachments).getByText("voice.m4a")).toBeInTheDocument();
    expect(within(attachments).getByText("10 B")).toBeInTheDocument();
    expect(within(attachments).getAllByText("app original")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Add 2 files to queue" })).toBeEnabled();

    await user.type(
      screen.getByLabelText("Directions for your agent"),
      "These are garage items for later sorting.",
    );
    await user.type(screen.getByLabelText("Room hint"), "Garage");
    await user.click(screen.getByRole("button", { name: "Add 2 files to queue" }));

    await waitFor(() => {
      expect(
        screen.getByText("Added to agent queue with 2 app originals (15 B total). Ready for the next capture."),
      ).toBeInTheDocument();
    });

    expect(captureData.initUpload).toHaveBeenCalledTimes(2);
    expect(captureData.uploadFileWithProgress).toHaveBeenCalledTimes(2);
    expect(captureData.finalizeUpload).toHaveBeenCalledTimes(2);
    expect(captureData.cancelUploadSession).not.toHaveBeenCalled();
    expect(captureData.imageDimensions).toHaveBeenCalledTimes(1);
    expect(captureData.imageDimensions).toHaveBeenCalledWith(frontPhoto);
    expect(captureData.uploadFileWithProgress).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        file: frontPhoto,
        uploadUrl: "https://uploads.example.com/original-1",
      }),
    );
    expect(captureData.uploadFileWithProgress).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        file: voiceMemo,
        uploadUrl: "https://uploads.example.com/original-2",
      }),
    );
    expect(captureData.initUpload.mock.calls[0]?.[0]).not.toHaveProperty(
      "derivatives",
    );
    expect(captureData.initUpload).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        mimeType: "image/jpeg",
        sizeBytes: 5,
        room: "Garage",
      }),
    );
    expect(captureData.initUpload).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        mimeType: "audio/mp4",
        sizeBytes: 10,
        room: "Garage",
      }),
    );
    expect(captureData.finalizeUpload).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fileName: "front.jpg",
        width: 1600,
        height: 1200,
        originalHash: "hash-front.jpg",
        source: "manualUpload",
        capturedAt: 1710000000000,
      }),
    );
    expect(captureData.finalizeUpload).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fileName: "voice.m4a",
        width: undefined,
        height: undefined,
        originalHash: "hash-voice.m4a",
        source: "manualUpload",
        capturedAt: 1710000005000,
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

  it("offers a camera-first input for phone capture", () => {
    render(
      <IngestionCaptureForm
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    const cameraInput = screen.getByLabelText("Take a new photo");
    expect(cameraInput).toHaveAttribute("accept", "image/*");
    expect(cameraInput).toHaveAttribute("capture", "environment");
    expect(screen.getByRole("button", { name: "Take photo" })).toBeEnabled();
  });

  it("uploads floor-plan captures as blueprint media with a floor-plan queue scope", async () => {
    const user = userEvent.setup();

    render(
      <IngestionCaptureForm
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Floorplans" }));
    expect(screen.getByText("Add blueprint images")).toBeInTheDocument();
    expect(screen.getByLabelText("Choose media files")).toHaveAttribute(
      "accept",
      "image/*",
    );

    const blueprint = new File(["blueprint"], "main-floor.png", {
      type: "image/png",
      lastModified: 1710000010000,
    });

    await user.upload(screen.getByLabelText("Choose media files"), blueprint);
    await user.type(
      screen.getByLabelText("Directions for your agent"),
      "Main floor, garage on the right.",
    );
    await user.click(screen.getByRole("button", { name: "Add 1 file to queue" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Added to floorplans queue with app original main-floor.png (9 B, 1600x1200). Ready for the next capture.",
        ),
      ).toBeInTheDocument();
    });

    expect(captureData.finalizeUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "main-floor.png",
        photoType: "blueprint",
        source: "manualUpload",
      }),
    );
    expect(captureData.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: "Main floor, garage on the right.",
        mediaPhotoIds: ["photo_1"],
        scopeHint: "floorPlan",
        targetPlanId: "plan_123",
      }),
    );
  });
});
