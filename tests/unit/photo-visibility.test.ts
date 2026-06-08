import { describe, expect, it } from "vitest";

import type { Doc } from "../../convex/_generated/dataModel";
import {
  canViewPhotoAssets,
  redactPhotoForVisibility,
} from "../../convex/lib/photoVisibility";

const basePhoto = {
  _id: "photo" as Doc<"itemPhotos">["_id"],
  _creationTime: 1,
  householdId: "household" as Doc<"itemPhotos">["householdId"],
  moveId: "move" as Doc<"itemPhotos">["moveId"],
  documentationProfileTypes: [],
  originalStorageKey: "private/original.jpg",
  originalBucket: "movingmanifest",
  originalHash: "hash",
  derivativeRefs: {
    thumb: "thumb/path.jpg",
    card: "card/path.jpg",
  },
  width: 1200,
  height: 800,
  mimeType: "image/jpeg",
  sizeBytes: 200000,
  photoType: "item",
  privacyLevel: "normal",
  visibilityScope: "moveCollaborators",
  source: "manualUpload",
  exifHandlingStatus: "stripped",
  confidence: "manual",
  notes: "private notes",
  verificationStatus: "unreviewed",
  aiProcessed: false,
  uploadedByUserId: "user" as Doc<"itemPhotos">["uploadedByUserId"],
  createdAt: 1,
  updatedAt: 1,
} satisfies Doc<"itemPhotos">;

describe("photo visibility", () => {
  it("never exposes original storage fields without sensitive photo visibility", () => {
    const redacted = redactPhotoForVisibility(basePhoto, {
      sensitivePhotos: false,
    });

    expect(redacted.originalStorageKey).toBeUndefined();
    expect(redacted.originalBucket).toBeUndefined();
    expect(redacted.originalHash).toBeUndefined();
    expect(redacted.derivativeRefs).toEqual(basePhoto.derivativeRefs);
  });

  it("hides sensitive derivatives from mover-safe roles", () => {
    const sensitivePhoto = {
      ...basePhoto,
      privacyLevel: "sensitive",
    } satisfies Doc<"itemPhotos">;

    expect(canViewPhotoAssets(sensitivePhoto, { sensitivePhotos: false })).toBe(
      false
    );
    expect(
      redactPhotoForVisibility(sensitivePhoto, { sensitivePhotos: false })
        .derivativeRefs
    ).toEqual({});
  });

  it("exposes original and derivative fields to roles allowed to see sensitive photos", () => {
    const redacted = redactPhotoForVisibility(
      { ...basePhoto, privacyLevel: "hiddenFromGuests" },
      { sensitivePhotos: true }
    );

    expect(redacted.originalStorageKey).toBe("private/original.jpg");
    expect(redacted.originalBucket).toBe("movingmanifest");
    expect(redacted.derivativeRefs).toEqual(basePhoto.derivativeRefs);
    expect(redacted.notes).toBe("private notes");
  });
});
