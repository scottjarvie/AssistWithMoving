import { afterEach, describe, expect, it, vi } from "vitest";

import {
  coverDimensions,
  fitWithin,
  maxAudioUploadBytes,
  maxPhotoUploadBytes,
  maxVideoUploadBytes,
  mediaKindForMimeType,
  uploadFileWithProgress,
  UPLOAD_STALL_TIMEOUT_MS,
  validateMediaUploadFile,
  validatePhotoUploadFile,
} from "@/lib/photo-upload";

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];

  upload: {
    onprogress?: (event: {
      lengthComputable: boolean;
      loaded: number;
      total: number;
    }) => void;
  } = {};
  status = 200;
  timeout = 0;
  aborted = false;
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  abort() {
    this.aborted = true;
    this.onabort?.();
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeXMLHttpRequest.instances = [];
});

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

describe("uploadFileWithProgress", () => {
  it("uses a progress stall watchdog instead of a total request timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);

    const onProgress = vi.fn();
    const promise = uploadFileWithProgress({
      file: new Blob(["x"], { type: "image/jpeg" }),
      uploadUrl: "https://uploads.example/file",
      contentType: "image/jpeg",
      onProgress,
      signal: new AbortController().signal,
    });
    const request = FakeXMLHttpRequest.instances[0]!;
    let settled = false;
    void promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    expect(request.timeout).toBe(0);

    await vi.advanceTimersByTimeAsync(UPLOAD_STALL_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    request.upload.onprogress?.({
      lengthComputable: true,
      loaded: 50,
      total: 100,
    });
    expect(onProgress).toHaveBeenLastCalledWith(50);

    await vi.advanceTimersByTimeAsync(UPLOAD_STALL_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    const assertion = expect(promise).rejects.toThrow(
      "Upload timed out. Check your connection.",
    );
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(request.aborted).toBe(true);
  });
});
