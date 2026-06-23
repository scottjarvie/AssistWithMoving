import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";

const photoData = vi.hoisted(() => ({
  photos: [] as Doc<"itemPhotos">[],
  getDisplayUrl: vi.fn(async ({ photoId }: { photoId: string }) => ({
    url: `https://images.example.test/${photoId}.jpg`,
    servedVariant: "card",
    derivativeStatus: "ready",
  })),
}));

vi.mock("convex/react", () => ({
  useAction: () => photoData.getDisplayUrl,
  useQuery: vi.fn((_query, args) => {
    if (args === "skip") return undefined;
    return photoData.photos;
  }),
}));

import { PhotoEvidenceStrip } from "@/components/photo-evidence-strip";

function photo(
  id: string,
  caption: string,
  createdAt: number,
): Doc<"itemPhotos"> {
  return {
    _id: id as Id<"itemPhotos">,
    _creationTime: createdAt,
    householdId: "household_123" as Id<"households">,
    moveId: "move_123" as Id<"moves">,
    itemId: "item_123" as Id<"items">,
    documentationProfileTypes: [],
    originalStorageKey: `${id}.jpg`,
    originalBucket: "test",
    derivativeRefs: {},
    mimeType: "image/jpeg",
    sizeBytes: 100,
    caption,
    photoType: "item",
    privacyLevel: "normal",
    visibilityScope: "moveCollaborators",
    source: "manualUpload",
    exifHandlingStatus: "pending",
    confidence: "manual",
    verificationStatus: "unreviewed",
    aiProcessed: false,
    uploadedByUserId: "user_123" as Id<"users">,
    createdAt,
    updatedAt: createdAt,
  } as Doc<"itemPhotos">;
}

function renderStrip({
  omitFirstPhoto = false,
}: {
  omitFirstPhoto?: boolean;
} = {}) {
  return render(
    <PhotoEvidenceStrip
      householdId={"household_123" as Id<"households">}
      moveId={"move_123" as Id<"moves">}
      itemId={"item_123" as Id<"items">}
      omitFirstPhoto={omitFirstPhoto}
      emptyLabel="No other photos yet."
    />,
  );
}

describe("PhotoEvidenceStrip", () => {
  beforeEach(() => {
    photoData.photos = [];
    photoData.getDisplayUrl.mockClear();
  });

  it("omits the first item photo when the item already shows a main thumbnail", () => {
    photoData.photos = [
      photo("photo_main", "Main photo", 3),
      photo("photo_other_1", "Side photo", 2),
      photo("photo_other_2", "Detail photo", 1),
    ];

    renderStrip({ omitFirstPhoto: true });

    expect(screen.getByText("2 photos")).toBeInTheDocument();
    expect(screen.queryByTitle("Main photo")).not.toBeInTheDocument();
    expect(screen.getByTitle("Side photo")).toBeInTheDocument();
    expect(screen.getByTitle("Detail photo")).toBeInTheDocument();
  });

  it("keeps the lower gallery empty when only the main photo exists", () => {
    photoData.photos = [photo("photo_main", "Main photo", 1)];

    renderStrip({ omitFirstPhoto: true });

    expect(screen.getByText("No other photos yet.")).toBeInTheDocument();
    expect(screen.queryByTitle("Main photo")).not.toBeInTheDocument();
  });
});
