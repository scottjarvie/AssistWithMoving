import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  photos: {
    cancelUploadSession: "photos.cancelUploadSession",
    finalizeUpload: "photos.finalizeUpload",
    initUpload: "photos.initUpload",
  },
}));

const photoUploadData = vi.hoisted(() => {
  let uploadIndex = 0;

  return {
    reset() {
      uploadIndex = 0;
    },
    initUpload: vi.fn(async () => {
      uploadIndex += 1;
      return {
        uploadSessionId: `session_${uploadIndex}`,
        uploadUrl: `https://uploads.example.com/original-${uploadIndex}`,
        headers: { "Content-Type": "image/jpeg" },
        derivativeUploads: [
          {
            variant: "thumb",
            uploadUrl: `https://uploads.example.com/thumb-${uploadIndex}`,
            headers: { "Content-Type": "image/webp" },
          },
        ],
      };
    }),
    finalizeUpload: vi.fn(async () => `photo_${uploadIndex}`),
    cancelUploadSession: vi.fn(),
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
    uploadFileWithProgress: vi.fn(
      async ({ onProgress }: { onProgress: (progress: number) => void }) => {
        onProgress(100);
      },
    ),
    validatePhotoUploadFile: vi.fn((file: File) => ({
      ok: file.type.startsWith("image/"),
      message: file.type.startsWith("image/") ? undefined : "Unsupported file.",
    })),
  };
});

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useAction: (action: string) => {
    if (action === apiMock.photos.initUpload) {
      return photoUploadData.initUpload;
    }
    if (action === apiMock.photos.finalizeUpload) {
      return photoUploadData.finalizeUpload;
    }
    throw new Error(`Unexpected action ${action}`);
  },
  useMutation: (mutation: string) => {
    if (mutation === apiMock.photos.cancelUploadSession) {
      return photoUploadData.cancelUploadSession;
    }
    throw new Error(`Unexpected mutation ${mutation}`);
  },
}));

vi.mock("@/lib/photo-upload", () => ({
  createImageDerivatives: photoUploadData.createImageDerivatives,
  fileSha256Hex: photoUploadData.fileSha256Hex,
  imageDimensions: photoUploadData.imageDimensions,
  uploadFileWithProgress: photoUploadData.uploadFileWithProgress,
  validatePhotoUploadFile: photoUploadData.validatePhotoUploadFile,
}));

import { PhotoUploadControl } from "@/components/photo-upload-control";

describe("PhotoUploadControl", () => {
  beforeEach(() => {
    photoUploadData.reset();
    vi.clearAllMocks();
  });

  it("uploads a selected photo batch through the normal photo session flow", async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();

    render(
      <PhotoUploadControl
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
        room="Kitchen"
        label="Room photos"
        multiple
        onUploaded={onUploaded}
      />,
    );

    expect(screen.getByText("Drop photos here or choose files.")).toBeInTheDocument();
    expect(
      screen.getByText("JPEG, PNG, or WebP originals. Web versions are prepared during upload."),
    ).toBeInTheDocument();

    await user.upload(screen.getByLabelText("Room photos"), [
      new File(["front"], "front.jpg", { type: "image/jpeg" }),
      new File(["side"], "side.jpg", { type: "image/jpeg" }),
    ]);

    expect(screen.getByText("2 photos selected")).toBeInTheDocument();
    expect(screen.getByText("front.jpg · 5 B")).toBeInTheDocument();
    expect(screen.getByText("side.jpg · 4 B")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry upload" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Upload 2" }));

    await waitFor(() => {
      expect(
        screen.getByText("2 photos uploaded. Web versions ready."),
      ).toBeInTheDocument();
    });

    expect(photoUploadData.initUpload).toHaveBeenCalledTimes(2);
    expect(photoUploadData.finalizeUpload).toHaveBeenCalledTimes(2);
    expect(photoUploadData.createImageDerivatives).toHaveBeenCalledTimes(2);
    expect(photoUploadData.uploadFileWithProgress).toHaveBeenCalledTimes(4);
    expect(onUploaded).toHaveBeenCalledTimes(2);
    expect(photoUploadData.cancelUploadSession).not.toHaveBeenCalled();
    expect(photoUploadData.initUpload).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        derivatives: [expect.objectContaining({ variant: "thumb" })],
        mimeType: "image/jpeg",
        room: "Kitchen",
      }),
    );
    expect(photoUploadData.finalizeUpload).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        confidence: "manual",
        originalHash: "hash-front.jpg",
        photoType: "item",
        verificationStatus: "unreviewed",
      }),
    );
  });

  it("keeps remaining photos available for retry after a partial batch failure", async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();
    photoUploadData.finalizeUpload
      .mockResolvedValueOnce("photo_1")
      .mockRejectedValueOnce(new Error("Unexpected service error"));

    render(
      <PhotoUploadControl
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
        room="Kitchen"
        label="Room photos"
        multiple
        onUploaded={onUploaded}
      />,
    );

    await user.upload(screen.getByLabelText("Room photos"), [
      new File(["front"], "front.jpg", { type: "image/jpeg" }),
      new File(["side"], "side.jpg", { type: "image/jpeg" }),
    ]);
    await user.click(screen.getByRole("button", { name: "Upload 2" }));

    await waitFor(() => {
      expect(
        screen.getByText("1 photo uploaded. Upload failed. Retry when ready."),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("side.jpg")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry upload" }),
    ).toBeInTheDocument();
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(photoUploadData.cancelUploadSession).toHaveBeenCalledTimes(1);
  });
});
