import { describe, expect, it } from "vitest";

import {
  shouldCleanupExpiredUploadSession,
  unreferencedUploadSessionStorageRefs,
  uploadSessionStorageRefs,
} from "../../convex/lib/photoCleanup";

describe("photo upload cleanup policy", () => {
  it("selects unfinished sessions after the retention grace period", () => {
    const now = 1_000_000;
    const graceMs = 10_000;

    expect(
      shouldCleanupExpiredUploadSession(
        { status: "authorized", expiresAt: now - graceMs },
        now,
        graceMs
      )
    ).toBe(true);
    expect(
      shouldCleanupExpiredUploadSession(
        { status: "authorized", expiresAt: now - graceMs + 1 },
        now,
        graceMs
      )
    ).toBe(false);
    expect(
      shouldCleanupExpiredUploadSession(
        { status: "failed", expiresAt: now - graceMs },
        now,
        graceMs
      )
    ).toBe(true);
    expect(
      shouldCleanupExpiredUploadSession(
        { status: "cancelled", expiresAt: now - graceMs },
        now,
        graceMs
      )
    ).toBe(true);
    expect(
      shouldCleanupExpiredUploadSession(
        { status: "completed", expiresAt: now - graceMs },
        now,
        graceMs
      )
    ).toBe(false);
    expect(
      shouldCleanupExpiredUploadSession(
        {
          status: "failed",
          expiresAt: now - graceMs,
          cleanupCompletedAt: now - 1,
        },
        now,
        graceMs
      )
    ).toBe(false);
  });

  it("collects original and derivative object refs without duplicates", () => {
    expect(
      uploadSessionStorageRefs({
        status: "authorized",
        expiresAt: 1,
        originalBucket: "movingmanifest-pics",
        originalStorageKey: "moves/1/photos/original.jpg",
        derivativeUploads: [
          {
            bucket: "movingmanifest-pics",
            storageKey: "moves/1/photo-derivatives/thumb.webp",
          },
          {
            bucket: "movingmanifest-pics",
            storageKey: "moves/1/photo-derivatives/thumb.webp",
          },
        ],
      })
    ).toEqual([
      {
        bucket: "movingmanifest-pics",
        storageKey: "moves/1/photos/original.jpg",
      },
      {
        bucket: "movingmanifest-pics",
        storageKey: "moves/1/photo-derivatives/thumb.webp",
      },
    ]);
  });

  it("does not return refs that are already referenced by completed photos", () => {
    const session = {
      status: "authorized" as const,
      expiresAt: 1,
      originalBucket: "movingmanifest-pics",
      originalStorageKey: "moves/1/photos/abandoned.jpg",
      derivativeUploads: [
        {
          bucket: "movingmanifest-pics",
          storageKey: "moves/1/photo-derivatives/referenced-thumb.webp",
        },
        {
          bucket: "movingmanifest-pics",
          storageKey: "moves/1/photo-derivatives/abandoned-card.webp",
        },
      ],
    };
    const photos = [
      {
        originalBucket: "movingmanifest-pics",
        originalStorageKey: "moves/1/photos/safe.jpg",
        derivativeRefs: {
          thumb: "moves/1/photo-derivatives/referenced-thumb.webp",
        },
      },
    ];

    expect(unreferencedUploadSessionStorageRefs(session, photos)).toEqual([
      {
        bucket: "movingmanifest-pics",
        storageKey: "moves/1/photos/abandoned.jpg",
      },
      {
        bucket: "movingmanifest-pics",
        storageKey: "moves/1/photo-derivatives/abandoned-card.webp",
      },
    ]);
  });
});
