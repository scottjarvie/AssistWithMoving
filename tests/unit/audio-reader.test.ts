import { describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { uploadRefusal } from "@/lib/upload-refusal";
import { isRetryableUploadError, uploadMediaFile } from "@/lib/media-upload";
import { friendlyUploadError } from "@/components/media-upload-provider";
import { oldUploadRefusal, oldIsRetryableUploadError, oldFriendlyUploadError } from "../fixtures/audio/old-reader";
import { invalidAudioFileError, audioVideoTrackError, voiceNoteTooLongError } from "../../convex/lib/media/audio";
import { usageLimitError } from "../../convex/lib/usageLimits/core";
vi.mock("@/lib/photo-upload", () => ({ fileSha256Hex: async () => "synthetic-hash", imageDimensions: async () => undefined, uploadFileWithProgress: async () => {} }));
const refusals = [invalidAudioFileError(), audioVideoTrackError(), voiceNoteTooLongError(601)];
describe("audio refusal reader", () => {
  it.each(refusals)("shows $code as text and stops automatic retries", async refusal => {
    for (const data of [refusal, JSON.stringify(refusal)]) {
      const error = new ConvexError(data);
      expect(uploadRefusal(error)).toEqual(refusal);
      expect(isRetryableUploadError(error)).toBe(false);
      expect(friendlyUploadError(error)).toBe(refusal.message);
      expect(friendlyUploadError(error)).not.toContain("Tap retry");
    }
    const error = new ConvexError(refusal), initUpload = vi.fn(async () => ({ uploadSessionId: "synthetic-session", uploadUrl: "https://example.invalid", headers: { "Content-Type": "audio/wav" } })), finalizeUpload = vi.fn().mockRejectedValue(error), cancelUploadSession = vi.fn(async () => {});
    await expect(uploadMediaFile({ householdId: "h" as never, moveId: "m" as never, file: new File(["tone"], "tone.wav", { type: "audio/wav" }), kind: "audio", deps: { initUpload, finalizeUpload, cancelUploadSession } as never })).rejects.toBe(error);
    expect(initUpload).toHaveBeenCalledTimes(1); expect(finalizeUpload).toHaveBeenCalledTimes(1);
    // The old website retries this structured refusal, preserving its existing
    // bounded retry behavior during the backend-first rollout.
    expect(oldUploadRefusal(error)).toBeNull();
    expect(oldIsRetryableUploadError(error)).toBe(true);
    expect(oldFriendlyUploadError(error)).toBe("Upload failed. Tap retry.");
  });
  it.each([
    new Error("network failure"), new ConvexError("{bad json"), new ConvexError({ code: "AUDIO_TOO_LONG" }),
    new ConvexError("That file is too large. [FILE_TOO_LARGE]"),
    new ConvexError({ code: "FILE_TOO_LARGE", kind: "audio", got: 20, max: 10, message: "Example file limit." }),
    new ConvexError({ code: "REQUEST_TOO_LARGE", message: "Example request limit." }),
    new ConvexError(usageLimitError({ limit: "storedBytesPerUser", unit: "bytes", used: 10, cap: 10, requested: 1, remaining: 0, resetsAt: null })),
    new ConvexError("Request limit. [REQUEST_TOO_LARGE]"),
    new ConvexError("Usage limit. [USAGE_LIMIT_REACHED]"),
  ])("keeps all existing and unreadable error behavior: %s", error => {
    expect(uploadRefusal(error)).toEqual(oldUploadRefusal(error));
    expect(isRetryableUploadError(error)).toEqual(oldIsRetryableUploadError(error));
    expect(friendlyUploadError(error)).toEqual(oldFriendlyUploadError(error));
  });
  it("continues to accept the old backend's successful finalize result", async () => {
    const initUpload = vi.fn(async () => ({ uploadSessionId: "synthetic-session", uploadUrl: "https://example.invalid", headers: { "Content-Type": "audio/wav" } }));
    const finalizeUpload = vi.fn(async () => ({ photoId: "synthetic-photo", derivativeNote: "" }));
    const cancelUploadSession = vi.fn();
    await expect(uploadMediaFile({ householdId: "h" as never, moveId: "m" as never, file: new File(["tone"], "tone.wav", { type: "audio/wav" }), kind: "audio", deps: { initUpload, finalizeUpload, cancelUploadSession } as never })).resolves.toBe("synthetic-photo");
    expect(cancelUploadSession).not.toHaveBeenCalled();
  });
});
