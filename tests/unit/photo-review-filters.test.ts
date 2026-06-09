import { describe, expect, it } from "vitest";

import {
  filterPhotosForReview,
  photoMatchesReviewFilter,
  photoReviewFilters,
  type PhotoReviewFilterablePhoto,
} from "@/lib/photo-review-filters";

const basePhoto: PhotoReviewFilterablePhoto = {
  photoType: "item",
  privacyLevel: "normal",
  verificationStatus: "verified",
  derivativeStatus: "ready",
  confidence: "manual",
  aiProcessed: true,
};

describe("photo review filters", () => {
  it("defines the review filters shown in the photo workspace", () => {
    expect(photoReviewFilters.map((filter) => filter.key)).toEqual([
      "all",
      "review",
      "unassigned",
      "claimEvidence",
      "serialNumber",
      "condition",
      "roomOrBox",
      "aiPending",
      "sensitive",
      "derivatives",
    ]);
  });

  it("matches review, unassigned, and sensitive photos", () => {
    expect(
      photoMatchesReviewFilter(
        { ...basePhoto, verificationStatus: "needsReview" },
        "review"
      )
    ).toBe(true);
    expect(photoMatchesReviewFilter(basePhoto, "unassigned")).toBe(true);
    expect(
      photoMatchesReviewFilter(
        { ...basePhoto, itemId: "item-1" },
        "unassigned"
      )
    ).toBe(false);
    expect(
      photoMatchesReviewFilter(
        { ...basePhoto, privacyLevel: "hiddenFromGuests" },
        "sensitive"
      )
    ).toBe(true);
  });

  it("matches claim and evidence photo categories", () => {
    expect(
      filterPhotosForReview(
        [
          { ...basePhoto, photoType: "damage" },
          { ...basePhoto, photoType: "receipt" },
          { ...basePhoto, claimId: "claim-1" },
          {
            ...basePhoto,
            documentationProfileTypes: ["insuranceClaim"],
          },
          { ...basePhoto, photoType: "item" },
        ],
        "claimEvidence"
      ).length
    ).toBe(4);
  });

  it("matches serial, condition, and room or box photos", () => {
    expect(
      photoMatchesReviewFilter(
        { ...basePhoto, photoType: "serialNumber" },
        "serialNumber"
      )
    ).toBe(true);
    expect(
      photoMatchesReviewFilter(
        { ...basePhoto, photoType: "damage" },
        "condition"
      )
    ).toBe(true);
    expect(
      photoMatchesReviewFilter(
        { ...basePhoto, photoType: "boxContents", boxId: "box-1" },
        "roomOrBox"
      )
    ).toBe(true);
    expect(
      photoMatchesReviewFilter(
        { ...basePhoto, photoType: "room", room: "Garage" },
        "roomOrBox"
      )
    ).toBe(true);
  });

  it("matches AI-pending and quality issue photos", () => {
    expect(
      photoMatchesReviewFilter({ ...basePhoto, aiProcessed: false }, "aiPending")
    ).toBe(true);
    expect(
      photoMatchesReviewFilter(
        { ...basePhoto, derivativeStatus: "failed" },
        "derivatives"
      )
    ).toBe(true);
    expect(
      photoMatchesReviewFilter(
        { ...basePhoto, derivativeError: "resize failed" },
        "derivatives"
      )
    ).toBe(true);
    expect(
      photoMatchesReviewFilter(
        { ...basePhoto, confidence: "low" },
        "derivatives"
      )
    ).toBe(true);
  });
});
