import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the photo-upload primitives so we control the PUT + hashing without a
// real network call or browser image decode.
const putMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/photo-upload", () => ({
  uploadFileWithProgress: putMock,
  fileSha256Hex: vi.fn(async () => "hash"),
  imageDimensions: vi.fn(async () => ({ width: 10, height: 10 })),
}));

import {
  isRetryableUploadError,
  uploadMediaFile,
  UPLOAD_MAX_ATTEMPTS,
} from "@/lib/media-upload";

function makeDeps() {
  let n = 0;
  return {
    initUpload: vi.fn(async () => ({
      uploadSessionId: `sess_${++n}`,
      uploadUrl: `https://b2/url_${n}`,
      headers: { "Content-Type": "image/jpeg" },
    })),
    finalizeUpload: vi.fn(async () => ({ photoId: "photo_1" })),
    cancelUploadSession: vi.fn(async () => {}),
  };
}

const file = () => new File(["xx"], "a.jpg", { type: "image/jpeg" });

afterEach(() => {
  vi.useRealTimers();
  putMock.mockReset();
});

describe("isRetryableUploadError", () => {
  it("does not retry aborts or validation/permission errors", () => {
    expect(isRetryableUploadError(new Error("x"), { aborted: true } as AbortSignal)).toBe(false);
    const abort = new DOMException("stop", "AbortError");
    expect(isRetryableUploadError(abort)).toBe(false);
    expect(isRetryableUploadError(new Error("File too large"))).toBe(false);
    expect(isRetryableUploadError(new Error("403 Forbidden"))).toBe(false);
    expect(isRetryableUploadError(new Error("Unsupported file type"))).toBe(false);
  });

  it("retries generic/network/transient errors", () => {
    expect(isRetryableUploadError(new Error("Network error"))).toBe(true);
    expect(isRetryableUploadError(new Error("Upload failed"))).toBe(true);
    expect(isRetryableUploadError(new Error("SignatureDoesNotMatch"))).toBe(true);
    expect(
      isRetryableUploadError(
        new Error("Upload timed out. Check your connection."),
      ),
    ).toBe(true);
  });
});

describe("uploadMediaFile retry", () => {
  it("re-inits a fresh session and succeeds after transient failures", async () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    // Fail the first two PUTs transiently, succeed on the third.
    putMock
      .mockRejectedValueOnce(new Error("network blip"))
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce(undefined);

    const onRetry = vi.fn();
    const promise = uploadMediaFile({
      householdId: "h" as never,
      moveId: "m" as never,
      file: file(),
      kind: "image",
      deps: deps as never,
      onRetry,
    });
    await vi.runAllTimersAsync();
    const photoId = await promise;

    expect(photoId).toBe("photo_1");
    // One init per attempt (3), and the stale session cancelled after each fail (2).
    expect(deps.initUpload).toHaveBeenCalledTimes(3);
    expect(deps.cancelUploadSession).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(UPLOAD_MAX_ATTEMPTS).toBe(4);
  });

  it("does not retry a permanent error and cancels the session once", async () => {
    const deps = makeDeps();
    putMock.mockRejectedValue(new Error("File too large"));

    await expect(
      uploadMediaFile({
        householdId: "h" as never,
        moveId: "m" as never,
        file: file(),
        kind: "image",
        deps: deps as never,
      }),
    ).rejects.toThrow("File too large");

    expect(deps.initUpload).toHaveBeenCalledTimes(1);
    expect(deps.cancelUploadSession).toHaveBeenCalledTimes(1);
    expect(deps.finalizeUpload).not.toHaveBeenCalled();
  });

  it("gives up after the max attempts on persistent transient failure", async () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    putMock.mockRejectedValue(new Error("network blip"));

    const promise = uploadMediaFile({
      householdId: "h" as never,
      moveId: "m" as never,
      file: file(),
      kind: "image",
      deps: deps as never,
    });
    const assertion = expect(promise).rejects.toThrow("network blip");
    await vi.runAllTimersAsync();
    await assertion;

    expect(deps.initUpload).toHaveBeenCalledTimes(UPLOAD_MAX_ATTEMPTS);
  });
});
