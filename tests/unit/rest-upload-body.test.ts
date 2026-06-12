import { describe, expect, it } from "vitest";

import {
  base64FromBytes,
  parseRestApiBody,
  RestApiBodyParseError,
} from "../../convex/lib/restUploadBody";

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

describe("parseRestApiBody", () => {
  it("keeps ordinary JSON request parsing unchanged", async () => {
    const request = new Request("https://movingmanifest.test/api/v1/moves", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Summer move" }),
    });

    await expect(
      parseRestApiBody({
        request,
        method: "POST",
        path: "moves",
        query: {},
      }),
    ).resolves.toEqual({ title: "Summer move" });
  });

  it("turns raw image bytes into the one-call photo upload body", async () => {
    const request = new Request(
      "https://movingmanifest.test/api/v1/photos/upload?moveId=move1&room=Garage&caption=Shelf&capturedAt=12345",
      {
        method: "POST",
        headers: {
          "content-type": "image/png",
          "x-movingmanifest-file-name": "garage-shelf.png",
        },
        body: pngBytes,
      },
    );

    await expect(
      parseRestApiBody({
        request,
        method: "POST",
        path: "photos/upload",
        query: {
          moveId: "move1",
          room: "Garage",
          caption: "Shelf",
          capturedAt: "12345",
        },
      }),
    ).resolves.toEqual({
      moveId: "move1",
      room: "Garage",
      caption: "Shelf",
      capturedAt: 12345,
      fileBase64: base64FromBytes(pngBytes),
      fileName: "garage-shelf.png",
      mimeType: "image/png",
    });
  });

  it("turns multipart form uploads into the same photo upload body", async () => {
    const boundary = "----movingmanifest-test-boundary";
    const multipartFileBytes = new TextEncoder().encode("image-bytes");
    const multipartBody = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="moveId"',
      "",
      "move1",
      `--${boundary}`,
      'Content-Disposition: form-data; name="room"',
      "",
      "Kitchen",
      `--${boundary}`,
      'Content-Disposition: form-data; name="caption"',
      "",
      "Pantry shelf",
      `--${boundary}`,
      'Content-Disposition: form-data; name="photoType"',
      "",
      "room",
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="pantry.png"',
      "Content-Type: image/png",
      "",
      "image-bytes",
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const request = new Request(
      "https://movingmanifest.test/api/v1/photos/upload",
      {
        method: "POST",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body: multipartBody,
      },
    );

    await expect(
      parseRestApiBody({
        request,
        method: "POST",
        path: "photos/upload",
        query: {},
      }),
    ).resolves.toEqual({
      moveId: "move1",
      room: "Kitchen",
      caption: "Pantry shelf",
      photoType: "room",
      fileBase64: base64FromBytes(multipartFileBytes),
      fileName: "pantry.png",
      mimeType: "image/png",
    });
  });

  it("rejects multipart photo uploads without exactly one file", async () => {
    const form = new FormData();
    form.set("moveId", "move1");
    const request = new Request(
      "https://movingmanifest.test/api/v1/photos/upload",
      {
        method: "POST",
        body: form,
      },
    );

    await expect(
      parseRestApiBody({
        request,
        method: "POST",
        path: "photos/upload",
        query: {},
      }),
    ).rejects.toBeInstanceOf(RestApiBodyParseError);
  });
});
