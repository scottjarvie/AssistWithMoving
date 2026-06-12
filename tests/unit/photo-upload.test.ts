import { describe, expect, it } from "vitest";

import {
  coverDimensions,
  fitWithin,
  maxAudioUploadBytes,
  maxPhotoUploadBytes,
  maxVideoUploadBytes,
  mediaKindForMimeType,
  validateMediaUploadFile,
  validatePhotoUploadFile,
} from "@/lib/photo-upload";

describe("photo upload validation", () => {
  it("allows supported image types under the size limit", () => {
    expect(validatePhotoUploadFile({ type: "image/jpeg", size: 1024 })).toEqual({
      ok: true,
    });
  });

  it("rejects unsupported file types", () => {
    expect(
      validatePhotoUploadFile({ type: "application/pdf", size: 1024 })
    ).toMatchObject({
      ok: false,
    });
  });

  it("rejects empty and oversized files", () => {
    expect(validatePhotoUploadFile({ type: "image/png", size: 0 }).ok).toBe(
      false
    );
    expect(
      validatePhotoUploadFile({
        type: "image/png",
        size: maxPhotoUploadBytes + 1,
      }).ok
    ).toBe(false);
  });

  it("validates future media uploads for image, audio, and video", () => {
    expect(validateMediaUploadFile({ type: "image/webp", size: 1024 })).toEqual(
      { ok: true }
    );
    expect(validateMediaUploadFile({ type: "audio/mpeg", size: 1024 })).toEqual(
      { ok: true }
    );
    expect(validateMediaUploadFile({ type: "video/mp4", size: 1024 })).toEqual({
      ok: true,
    });
    expect(mediaKindForMimeType("video/quicktime")).toBe("video");
    expect(mediaKindForMimeType("audio/webm; codecs=opus")).toBe("audio");
  });

  it("keeps media upload limits specific to the media kind", () => {
    expect(
      validateMediaUploadFile({
        type: "audio/mpeg",
        size: maxAudioUploadBytes + 1,
      }).message
    ).toContain("audio");
    expect(
      validateMediaUploadFile({
        type: "video/mp4",
        size: maxVideoUploadBytes + 1,
      }).message
    ).toContain("video");
  });

  it("fits derivative dimensions within a max side without upscaling", () => {
    expect(
      fitWithin({ width: 4000, height: 2000, maxWidth: 1000, maxHeight: 1000 })
    ).toEqual({
      width: 1000,
      height: 500,
    });
    expect(
      fitWithin({ width: 640, height: 480, maxWidth: 1200, maxHeight: 1200 })
    ).toEqual({
      width: 640,
      height: 480,
    });
  });

  it("calculates centered square cover dimensions for thumbnails", () => {
    expect(
      coverDimensions({
        width: 4000,
        height: 2000,
        targetWidth: 200,
        targetHeight: 200,
      })
    ).toEqual({
      sourceX: 1000,
      sourceY: 0,
      sourceWidth: 2000,
      sourceHeight: 2000,
      width: 200,
      height: 200,
    });
  });
});
