import { describe, expect, it } from "vitest";

import {
  fitWithin,
  maxPhotoUploadBytes,
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

  it("fits derivative dimensions within a max side without upscaling", () => {
    expect(fitWithin({ width: 4000, height: 2000, maxSide: 1000 })).toEqual({
      width: 1000,
      height: 500,
    });
    expect(fitWithin({ width: 640, height: 480, maxSide: 1200 })).toEqual({
      width: 640,
      height: 480,
    });
  });
});
