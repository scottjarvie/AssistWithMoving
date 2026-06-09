import { describe, expect, it } from "vitest";

import {
  assertDerivativeUploadsAllowed,
  assertImageDerivativeUploadFileShape,
  assertImageDimensions,
  assertOriginalUploadFileShape,
  fileExtensionForMediaMimeType,
  mediaObjectPrefix,
} from "../../convex/lib/mediaStorage";

describe("media storage policy", () => {
  it("accepts image, audio, and video originals", () => {
    expect(
      assertOriginalUploadFileShape({
        mimeType: "IMAGE/JPEG",
        sizeBytes: 1024,
      })
    ).toMatchObject({ mimeType: "image/jpeg", mediaKind: "image" });
    expect(
      assertOriginalUploadFileShape({
        mimeType: "audio/webm; codecs=opus",
        sizeBytes: 1024,
      })
    ).toMatchObject({ mimeType: "audio/webm", mediaKind: "audio" });
    expect(
      assertOriginalUploadFileShape({
        mimeType: "video/quicktime",
        sizeBytes: 1024,
      })
    ).toMatchObject({ mimeType: "video/quicktime", mediaKind: "video" });
  });

  it("keeps derivatives image-only", () => {
    expect(() =>
      assertImageDerivativeUploadFileShape({
        mimeType: "audio/mpeg",
        sizeBytes: 1024,
      })
    ).toThrow("Image derivatives");
    expect(() => assertDerivativeUploadsAllowed("audio", 1)).toThrow(
      "Audio and video"
    );
    expect(() => assertDerivativeUploadsAllowed("video", 0)).not.toThrow();
  });

  it("requires dimensions only for image finalization", () => {
    expect(() =>
      assertImageDimensions({
        mediaKind: "image",
      })
    ).toThrow("width and height");
    expect(() =>
      assertImageDimensions({
        mediaKind: "audio",
      })
    ).not.toThrow();
  });

  it("uses media-specific object prefixes and extensions", () => {
    expect(mediaObjectPrefix("image")).toBe("photos");
    expect(mediaObjectPrefix("audio")).toBe("audio");
    expect(mediaObjectPrefix("video")).toBe("videos");
    expect(fileExtensionForMediaMimeType("audio/mp4")).toBe("m4a");
    expect(fileExtensionForMediaMimeType("video/quicktime")).toBe("mov");
  });
});
