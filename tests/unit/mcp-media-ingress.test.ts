import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { uploadEvidenceFile, uploadEvidenceImage } from "../../mcp-server/assistwithmoving-api.mjs";
import { downloadPublicHttpsMedia, parsePublicHttpsUrl, readAllowedLocalMedia, resolvePublicAddresses } from "../../mcp-server/media-ingress.mjs";

const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAADZrBkAAAAADUlEQVR42mP8z8BQDwAFgwJ/lpQqNwAAAABJRU5ErkJggg==", "base64");
const apiConfig = (mediaIngress: { transport: "stdio" | "hosted"; allowedFileRoots: string[] }) => ({ baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret", mediaIngress });

describe("MCP media ingress policy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects hosted filePath input before reading or calling the API", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "assistwithmoving-hosted-"));
    const filePath = path.join(tempDir, "private.png");
    await writeFile(filePath, pngBytes);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(uploadEvidenceImage(apiConfig({ transport: "hosted", allowedFileRoots: [] }), { moveId: "move1", filePath })).rejects.toThrow(/filePath is disabled for hosted MCP/i);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { await rm(tempDir, { recursive: true, force: true }); }
  });

  it("requires an explicit allowed root for local filePath input", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "assistwithmoving-local-"));
    const filePath = path.join(tempDir, "private.png");
    await writeFile(filePath, pngBytes);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(uploadEvidenceFile(apiConfig({ transport: "stdio", allowedFileRoots: [] }), { moveId: "move1", filePath })).rejects.toThrow(/configure ASSISTWITHMOVING_MCP_ALLOWED_FILE_ROOTS/i);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { await rm(tempDir, { recursive: true, force: true }); }
  });

  it("rejects a claimed MIME type that disagrees with local magic bytes", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "assistwithmoving-mime-"));
    const filePath = path.join(tempDir, "mismatch.jpg");
    await writeFile(filePath, pngBytes);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(uploadEvidenceFile(apiConfig({ transport: "stdio", allowedFileRoots: [tempDir] }), { moveId: "move1", filePath, mimeType: "image/jpeg" })).rejects.toThrow(/content is image\/png, not image\/jpeg/i);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { await rm(tempDir, { recursive: true, force: true }); }
  });

  it("rejects a private sourceUrl before making a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadEvidenceFile(apiConfig({ transport: "stdio", allowedFileRoots: [] }), { moveId: "move1", sourceUrl: "http://169.254.169.254/latest/meta-data" })).rejects.toThrow(/public HTTPS URL/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["file:///etc/hosts", "http://example.com/image.png", "https://user:pass@example.com/image.png", "https://localhost:3210/image.png", "https://127.0.0.1/image.png", "https://169.254.169.254/latest/meta-data", "https://192.0.2.1/image.png", "https://198.51.100.1/image.png", "https://203.0.113.1/image.png", "https://[::1]/image.png", "https://[fc00::1]/image.png", "https://[fe80::1]/image.png", "https://[fec0::1]/image.png", "https://[feff::1]/image.png", "https://[2001:db8::1]/image.png", "https://[0:0:0:0:0:ffff:7f00:1]/image.png"])("refuses a non-public URL before download: %s", (sourceUrl) => {
    expect(() => parsePublicHttpsUrl(sourceUrl)).toThrow();
  });

  it("rejects a DNS name when any resolved address is private", async () => {
    const url = parsePublicHttpsUrl("https://images.example/photo.png");
    await expect(resolvePublicAddresses(url, async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.4", family: 4 }])).rejects.toThrow(/only to public Internet addresses/i);
  });

  it("rejects site-local IPv6 DNS answers, including mixed public results", async () => {
    const url = parsePublicHttpsUrl("https://images.example/photo.png");
    await expect(resolvePublicAddresses(url, async () => [{ address: "fec0::1", family: 6 }])).rejects.toThrow(/only to public Internet addresses/i);
    await expect(resolvePublicAddresses(url, async () => [{ address: "2606:4700:4700::1111", family: 6 }, { address: "feff::1", family: 6 }])).rejects.toThrow(/only to public Internet addresses/i);
  });

  it("revalidates a redirect target before the next request", async () => {
    const requestFn = vi.fn(async () => ({ status: 302, headers: new Headers({ location: "https://127.0.0.1/private.png" }), body: [], destroy: vi.fn() }));
    await expect(downloadPublicHttpsMedia("https://images.example/photo.png", { lookupFn: async () => [{ address: "93.184.216.34", family: 4 }], requestFn })).rejects.toThrow(/public Internet address/i);
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it("refuses a redirect to a site-local IPv6 target", async () => {
    const requestFn = vi.fn(async () => ({ status: 302, headers: new Headers({ location: "https://[fec0::1]/private.png" }), body: [], destroy: vi.fn() }));
    await expect(downloadPublicHttpsMedia("https://images.example/photo.png", { lookupFn: async () => [{ address: "93.184.216.34", family: 4 }], requestFn })).rejects.toThrow(/public Internet address/i);
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it("refuses an HTTPS-to-HTTP redirect before the next request", async () => {
    const requestFn = vi.fn(async () => ({ status: 302, headers: new Headers({ location: "http://images.example/private.png" }), body: [], destroy: vi.fn() }));
    await expect(downloadPublicHttpsMedia("https://images.example/photo.png", { lookupFn: async () => [{ address: "93.184.216.34", family: 4 }], requestFn })).rejects.toThrow(/public HTTPS URL/i);
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it("caps redirect hops", async () => {
    const requestFn = vi.fn(async ({ url }: { url: URL }) => ({ status: 302, headers: new Headers({ location: new URL(`/next-${requestFn.mock.calls.length}`, url).href }), body: [], destroy: vi.fn() }));
    await expect(downloadPublicHttpsMedia("https://images.example/photo.png", { maxRedirects: 2, lookupFn: async () => [{ address: "93.184.216.34", family: 4 }], requestFn })).rejects.toThrow(/2-redirect limit/i);
    expect(requestFn).toHaveBeenCalledTimes(3);
  });

  it("preserves an actionable timeout refusal", async () => {
    await expect(downloadPublicHttpsMedia("https://images.example/photo.png", { timeoutMs: 25, lookupFn: async () => [{ address: "93.184.216.34", family: 4 }], requestFn: async () => { throw new Error("sourceUrl timed out after 25ms."); } })).rejects.toThrow(/timed out after 25ms/i);
  });

  it("applies one total deadline to DNS resolution", async () => {
    const requestFn = vi.fn();
    await expect(downloadPublicHttpsMedia("https://images.example/photo.png", { timeoutMs: 10, lookupFn: async () => await new Promise(() => undefined), requestFn })).rejects.toThrow(/timed out after 10ms/i);
    expect(requestFn).not.toHaveBeenCalled();
  });

  it("applies one total deadline to a slow streaming body", async () => {
    async function* slowBody() {
      yield Buffer.from([1]);
      await new Promise(() => undefined);
    }
    const destroy = vi.fn();
    await expect(downloadPublicHttpsMedia("https://images.example/photo.png", { timeoutMs: 10, lookupFn: async () => [{ address: "93.184.216.34", family: 4 }], requestFn: async () => ({ status: 200, headers: new Headers(), body: slowBody(), destroy }) })).rejects.toThrow(/timed out after 10ms/i);
    expect(destroy).toHaveBeenCalled();
  });

  it("rejects oversized declared and chunked bodies", async () => {
    const lookupFn = async () => [{ address: "93.184.216.34", family: 4 }];
    await expect(downloadPublicHttpsMedia("https://images.example/photo.png", { maxBytes: 10, lookupFn, requestFn: async () => ({ status: 200, headers: new Headers({ "content-length": "11" }), body: [], destroy: vi.fn() }) })).rejects.toThrow(/10-byte media limit/i);
    async function* chunks() { yield Buffer.alloc(6); yield Buffer.alloc(6); }
    const destroy = vi.fn();
    await expect(downloadPublicHttpsMedia("https://images.example/photo.png", { maxBytes: 10, lookupFn, requestFn: async () => ({ status: 200, headers: new Headers({ "content-type": "image/png" }), body: chunks(), destroy }) })).rejects.toThrow(/10-byte media limit/i);
    expect(destroy).toHaveBeenCalled();
  });

  it("accepts a bounded public HTTPS response", async () => {
    const result = await downloadPublicHttpsMedia("https://images.example/photo.png", { maxBytes: pngBytes.length, lookupFn: async () => [{ address: "93.184.216.34", family: 4 }], requestFn: async () => ({ status: 200, headers: new Headers({ "content-type": "image/png", "content-length": String(pngBytes.length) }), body: [pngBytes], destroy: vi.fn() }) });
    expect(result.bytes).toEqual(pngBytes);
    expect(result.contentType).toBe("image/png");
  });

  it("allows only regular files whose real path stays inside an allowed root", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "assistwithmoving-roots-"));
    const allowedRoot = path.join(tempDir, "allowed");
    const outsideFile = path.join(tempDir, "outside.png");
    const insideFile = path.join(allowedRoot, "inside.png");
    const symlinkPath = path.join(allowedRoot, "escape.png");
    await mkdir(allowedRoot);
    await writeFile(insideFile, pngBytes);
    await writeFile(outsideFile, pngBytes);
    try {
      // Windows file symlinks need an elevated privilege; directory junctions
      // exercise the same refusal without changing machine security settings.
      await symlink(process.platform === "win32" ? tempDir : outsideFile, symlinkPath, process.platform === "win32" ? "junction" : "file");
      await expect(readAllowedLocalMedia({ filePath: insideFile, transport: "stdio", allowedFileRoots: [allowedRoot] })).resolves.toMatchObject({ bytes: pngBytes });
      await expect(readAllowedLocalMedia({ filePath: outsideFile, transport: "stdio", allowedFileRoots: [allowedRoot] })).rejects.toThrow(/outside ASSISTWITHMOVING_MCP_ALLOWED_FILE_ROOTS/i);
      await expect(readAllowedLocalMedia({ filePath: symlinkPath, transport: "stdio", allowedFileRoots: [allowedRoot] })).rejects.toThrow(/symlinks, devices, directories, and pipes/i);
      await expect(readAllowedLocalMedia({ filePath: allowedRoot, transport: "stdio", allowedFileRoots: [allowedRoot] })).rejects.toThrow(/regular file/i);
      if (process.platform !== "win32") {
        await expect(readAllowedLocalMedia({ filePath: "/dev/zero", transport: "stdio", allowedFileRoots: [allowedRoot] })).rejects.toThrow(/regular file/i);
      }
    } finally { await rm(tempDir, { recursive: true, force: true }); }
  });

  it.each([
    { name: "voice-note.m4a", mimeType: "audio/mp4", bytes: readFileSync("tests/fixtures/audio/aac.m4a") },
    { name: "voice-note.weba", mimeType: "audio/webm", bytes: readFileSync("tests/fixtures/audio/opus.webm") },
    { name: "voice-note.mp3", mimeType: "audio/mpeg", bytes: readFileSync("tests/fixtures/audio/tone.mp3") },
  ])("keeps advertised $mimeType local media compatible with signature checks", async ({ name, mimeType, bytes }) => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "assistwithmoving-media-compat-"));
    const filePath = path.join(tempDir, name);
    await writeFile(filePath, bytes);
    try {
      await expect(uploadEvidenceFile(apiConfig({ transport: "stdio", allowedFileRoots: [tempDir] }), { moveId: "move1", filePath, mimeType, dryRun: true })).resolves.toMatchObject({ media: { mimeType } });
    } finally { await rm(tempDir, { recursive: true, force: true }); }
  });
});

describe("audio originals in the file helper", () => {
  it.each([
    ["opus.webm", "audio/webm"], ["opus.ogg", "audio/ogg"], ["aac.m4a", "audio/mp4"], ["fragmented.mp4", "audio/mp4"], ["tone.mp3", "audio/mpeg"], ["tone.wav", "audio/wav"], ["tone.flac", "audio/flac"], ["tone.aac", "audio/aac"],
  ])("refuses incomplete %s before starting an upload", async (name, mimeType) => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "synthetic-audio-"));
    const filePath = path.join(tempDir, name), bytes = readFileSync(`tests/fixtures/audio/${name}`);
    const fetchMock = vi.fn(() => { throw new Error("Unexpected network request"); });
    vi.stubGlobal("fetch", fetchMock);
    try {
      for (const part of [bytes.subarray(0, 12), bytes.subarray(0, Math.floor(bytes.length / 2))]) {
        await writeFile(filePath, part);
        await expect(uploadEvidenceFile(apiConfig({ transport: "stdio", allowedFileRoots: [tempDir] }), { moveId: "synthetic-move", filePath, mimeType, dryRun: true })).rejects.toMatchObject({ data: { code: "INVALID_AUDIO_CONTAINER" } });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); await rm(tempDir, { recursive: true, force: true }); }
  });
  it("refuses an oversized declared remote audio body before iterating it", async () => {
    let read = false;
    await expect(downloadPublicHttpsMedia("https://example.invalid/audio", { maxBytes: 10, fileKind: "audio", lookupFn: async () => [{ address: "93.184.216.34", family: 4 }], requestFn: async () => ({ status: 200, headers: new Headers({ "content-length": "11" }), body: { *[Symbol.iterator]() { read = true; yield Buffer.alloc(11); } } }) })).rejects.toMatchObject({ payload: { error: { code: "FILE_TOO_LARGE", kind: "audio", max: 10, got: 11 } } });
    expect(read).toBe(false);
  });
  it("downloads audio into one bounded allocation", async () => {
    const part = Buffer.from([1, 2, 3]);
    const result = await downloadPublicHttpsMedia("https://example.invalid/audio", { maxBytes: 32, fileKind: "audio", lookupFn: async () => [{ address: "93.184.216.34", family: 4 }], requestFn: async () => ({ status: 200, headers: new Headers({ "content-length": "6" }), body: [part, part] }) });
    expect(result.bytes).toEqual(Buffer.from([1, 2, 3, 1, 2, 3]));
  });
});
