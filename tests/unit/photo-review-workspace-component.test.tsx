import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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
          createdAt: 1,
          updatedAt: 1,
        } as unknown as Doc<"itemPhotos">,
      ];
    }
    if (query === apiMock.photos.evidenceSummary) {
      return {
        photoCount: 1,
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
  it("keeps photo review cards scan-first until privacy controls are opened", async () => {
    const user = userEvent.setup();

    render(
      <PhotoReviewWorkspace
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />
    );

    expect(screen.getByText("Kitchen table photo")).toBeInTheDocument();
    expect(screen.getByText("needsReview")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Privacy level for Kitchen table photo")
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Original" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Privacy" }));

    expect(
      screen.getByLabelText("Privacy level for Kitchen table photo")
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Visibility scope for Kitchen table photo")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Original" })).toBeInTheDocument();

    await waitFor(() => {
      expect(photoData.getDisplayUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          photoId: "photo_1",
          variant: "card",
        })
      );
    });
  });
});
