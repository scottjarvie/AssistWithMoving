import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  photos: {
    evidenceSummary: "photos.evidenceSummary",
    getDisplayUrl: "photos.getDisplayUrl",
    getOriginalDownloadUrl: "photos.getOriginalDownloadUrl",
    listForMove: "photos.listForMove",
    updateEvidence: "photos.updateEvidence",
  },
}));

const photoData = vi.hoisted(() => ({
  getDisplayUrl: vi.fn(async () => ({ url: "https://example.com/card.jpg" })),
  getOriginalDownloadUrl: vi.fn(async () => ({
    url: "https://example.com/original.jpg",
  })),
  updateEvidence: vi.fn(),
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useAction: (action: string) => {
    if (action === apiMock.photos.getOriginalDownloadUrl) {
      return photoData.getOriginalDownloadUrl;
    }
    return photoData.getDisplayUrl;
  },
  useMutation: () => photoData.updateEvidence,
  useQuery: (query: string) => {
    if (query === apiMock.photos.listForMove) {
      return [
        {
          _id: "photo_1" as Id<"itemPhotos">,
          _creationTime: 1,
          householdId: "household_123" as Id<"households">,
          moveId: "move_123" as Id<"moves">,
          photoType: "condition",
          caption: "Kitchen table photo",
          room: "Kitchen",
          privacyLevel: "normal",
          visibilityScope: "moveCollaborators",
          verificationStatus: "needsReview",
          aiProcessed: false,
          confidence: "medium",
          derivativeStatus: "ready",
          mimeType: "image/jpeg",
          sizeBytes: 2048,
          source: "web",
          width: 1600,
          height: 1200,
          uploadedByUserId: "user_1" as Id<"users">,
          documentationProfileTypes: [],
          originalStorageKey: "photo_1.jpg",
          originalBucket: "photos",
          derivativeRefs: {},
          exifHandlingStatus: "stripped",
          createdAt: 1,
          updatedAt: 1,
        } as unknown as Doc<"itemPhotos">,
        {
          _id: "photo_2" as Id<"itemPhotos">,
          _creationTime: 2,
          householdId: "household_123" as Id<"households">,
          moveId: "move_123" as Id<"moves">,
          photoType: "room",
          caption: "Garage shelf photo",
          room: "Garage",
          privacyLevel: "claimOnly",
          visibilityScope: "documentationScoped",
          verificationStatus: "verified",
          aiProcessed: true,
          confidence: "high",
          derivativeStatus: "ready",
          mimeType: "image/jpeg",
          sizeBytes: 1048576,
          source: "api",
          width: 2400,
          height: 1800,
          uploadedByUserId: "user_1" as Id<"users">,
          documentationProfileTypes: [],
          originalStorageKey: "photo_2.jpg",
          originalBucket: "photos",
          derivativeRefs: {},
          exifHandlingStatus: "stripped",
          createdAt: 2,
          updatedAt: 2,
        } as unknown as Doc<"itemPhotos">,
      ];
    }
    if (query === apiMock.photos.evidenceSummary) {
      return {
        photoCount: 2,
        unassignedCount: 0,
        needsReviewCount: 1,
        highValueWithoutPhotoCount: 0,
      };
    }
    return undefined;
  },
}));

import { PhotoReviewWorkspace } from "@/components/photo-review-workspace";

describe("PhotoReviewWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps photo cards scan-first and moves review controls into one selected panel", async () => {
    const user = userEvent.setup();

    render(
      <PhotoReviewWorkspace
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Review Kitchen table photo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Review Garage shelf photo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "All: 2 photos" }),
    ).toHaveAttribute("data-variant", "default");
    expect(
      screen.getByRole("button", { name: "Review: 1 photo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sensitive: 1 photo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Every photo tied to this move."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("needsReview").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading", { name: "Selected photo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Privacy level for Kitchen table photo"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Visibility scope for Kitchen table photo"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Original" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Privacy" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Review Garage shelf photo" }),
    );

    expect(
      screen.getByLabelText("Privacy level for Garage shelf photo"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Visibility scope for Garage shelf photo"),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(photoData.getDisplayUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          photoId: "photo_1",
          variant: "card",
        }),
      );
    });

    await user.click(
      screen.getByRole("button", { name: "Sensitive: 1 photo" }),
    );

    expect(
      screen.getByText("Photos with restricted privacy settings."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Review Kitchen table photo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Review Garage shelf photo" }),
    ).toBeInTheDocument();
  });
});
