import * as convexHooks from "convex/react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { checkFileSize, usageLimitError, mcpLimitText, AI_STORAGE_NOTE } from "../../convex/lib/usageLimits/core";
import { friendlyUploadError } from "../../src/components/media-upload-provider";
import { photoUploadFailureMessage } from "../../src/components/photo-upload-control";
import { isRetryableUploadError } from "../../src/lib/media-upload";
import { StorageAdmin, StorageFailSoft, StorageLimitsForm } from "../../src/components/storage-allowance";
import { registerTools } from "../../mcp-server/assistwithmoving-mcp.mjs";
import { readFileSync } from "node:fs";
afterEach(cleanup);
vi.mock("convex/react", async importOriginal => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return { ...actual, useQuery: vi.fn(), useMutation: vi.fn() };
});

const quota = usageLimitError({ limit: "storedBytesPerUser", unit: "bytes", used: 70, cap: 100, requested: 50, remaining: 30, resetsAt: null });

describe("real website refusal readers", () => {
  it.each([quota, checkFileSize("image", 15, 10)!])("reads %s and does not retry it as a network error", refusal => {
    const error = new ConvexError(refusal);
    error.message = "Server Error";
    expect(friendlyUploadError(error)).toBe(refusal.message);
    expect(photoUploadFailureMessage(error)).toBe(refusal.message);
    expect(isRetryableUploadError(error)).toBe(false);
    const legacy = new ConvexError(`${refusal.message} [${refusal.code}]`);
    expect(friendlyUploadError(legacy)).toBe(refusal.message);
    expect(photoUploadFailureMessage(legacy)).toBe(refusal.message);
    expect(isRetryableUploadError(legacy)).toBe(false);
  });
});

describe("patch-only admin forms", () => {
  it.each([false, true])("leaves untouched fields absent, personal=%s", async personal => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<StorageLimitsForm personal={personal} onSave={save} />);
    if (personal) fireEvent.change(screen.getByLabelText("Person ID"), { target: { value: "synthetic-person" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Synthetic reason" } });
    fireEvent.click(screen.getByRole("button", { name: "Save limits" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toEqual({ ...(personal ? { ownerId: "synthetic-person" } : {}), limits: {}, reason: "Synthetic reason" });
  });
  it("sends only the edited cap and an explicit mode reset", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<StorageLimitsForm personal onSave={save} />);
    fireEvent.change(screen.getByLabelText("Person ID"), { target: { value: "synthetic-person" } });
    fireEvent.change(screen.getByLabelText("Personal storage cap (bytes)"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "inherit" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Synthetic" } });
    fireEvent.click(screen.getByRole("button", { name: "Save limits" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toEqual({ ownerId: "synthetic-person", limits: { storedBytesPerUser: 200 }, enforcement: null, reason: "Synthetic" });
  });
});

it("appends the shared note after each existing upload introduction", () => {
  const descriptions = new Map<string, string>();
  registerTools({ registerTool: (name: string, config: { description: string }) => descriptions.set(name, config.description) }, { baseUrl: "https://synthetic.invalid", apiKey: "synthetic-test-only" });
  const intros: Record<string, string> = {
    start_photo_upload: "Create a presigned evidence upload session for an image, audio file, or video.",
    finalize_photo_upload: "Finalize a completed presigned evidence upload after the file PUT succeeds.",
    upload_evidence_image: "Default image upload path for agents: provide exactly one public HTTPS source URL, data URL, base64 image, or maintainer-approved local filePath.",
    upload_evidence_images: "Batch convenience path for agents when the user provides several household photos.",
    upload_photo: "Plain-language alias for upload_evidence_image.",
    upload_image: "Plain-language alias for upload_evidence_image using image terminology.",
    upload_photos: "Plain-language alias for upload_evidence_images.",
    upload_images: "Plain-language alias for upload_evidence_images using image terminology.",
    upload_evidence_file: "Easy MCP upload path: provide a public HTTPS source URL, or a maintainer-approved local filePath when running stdio with ASSISTWITHMOVING_MCP_ALLOWED_FILE_ROOTS.",
  };
  for (const name of ["start_photo_upload", "finalize_photo_upload", "upload_evidence_file", "upload_evidence_image", "upload_evidence_images", "upload_photo", "upload_image", "upload_photos", "upload_images"]) {
    const description = descriptions.get(name)!;
    expect(description).toContain(AI_STORAGE_NOTE);
    expect(description.indexOf(AI_STORAGE_NOTE)).toBeGreaterThan(description.indexOf("."));
    if (intros[name]) expect(description.startsWith(intros[name])).toBe(true);
  }
  expect(readFileSync("convex/mcp.ts", "utf8")).toContain('AI_STORAGE_NOTE');
});

it("each upload description states the effective numeric file and batch policy", () => {
  const descriptions = new Map<string, string>();
  registerTools({ registerTool: (name: string, config: { description: string }) => descriptions.set(name, config.description) }, { baseUrl: "https://synthetic.invalid", apiKey: "synthetic-test-only" }, { uploadLimits: { maxFileBytes: { image: 2000000, audio: 3000000, video: 4000000 }, mcpBatchMaxItems: 7, mcpBatchMaxBytes: 5000000 } });
  for (const name of ["start_photo_upload", "finalize_photo_upload", "upload_evidence_file", "upload_evidence_image", "upload_evidence_images", "upload_photo", "upload_image", "upload_photos", "upload_images"]) {
    expect(descriptions.get(name), name).toContain("2 MB");
    if (["upload_evidence_images", "upload_photos", "upload_images"].includes(name)) { expect(descriptions.get(name), name).toContain("7"); expect(descriptions.get(name), name).toContain("5 MB"); }
    else expect(descriptions.get(name), name).not.toContain("AI batch settings");
  }
});

it("monitoring policy does not advertise an unenforced batch cap or unrelated file kinds", () => {
  const descriptions = new Map<string, string>();
  registerTools({ registerTool: (name: string, config: { description: string }) => descriptions.set(name, config.description) }, { baseUrl: "https://synthetic.invalid", apiKey: "synthetic-test-only" }, { uploadLimits: { maxFileBytes: { image: 2000000, audio: 3000000, video: 4000000 }, mcpBatchMaxItems: 7, mcpBatchMaxBytes: 5000000, batchLimitsEnforced: false } });
  expect(descriptions.get("upload_images")).not.toContain("7 items"); expect(descriptions.get("upload_images")).toContain("existing transport limits"); expect(descriptions.get("upload_image")).not.toContain("audio 3 MB"); expect(descriptions.get("get_api_context")).not.toContain("Current file caps");
});

it("a failed storage meter leaves the containing page usable", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  function BrokenMeter(): never { throw new Error("Synthetic meter failure"); }
  try { render(<main><h1>Account settings</h1><StorageFailSoft><BrokenMeter /></StorageFailSoft><button>Existing settings</button></main>); expect(screen.getByText("Storage is temporarily unavailable.")).toBeVisible(); expect(screen.getByRole("heading", { name: "Account settings" })).toBeVisible(); expect(screen.getByRole("button", { name: "Existing settings" })).toBeEnabled(); } finally { log.mockRestore(); }
});

it("refusal codes take precedence over status-like numbers in their text", () => {
  const error = new ConvexError({ ...quota, message: "500 files, 429 bytes" }); error.message = "500 storage failed; 429 retry later";
  expect(friendlyUploadError(error)).toBe(quota.message); expect(photoUploadFailureMessage(error)).toBe(quota.message); expect(isRetryableUploadError(error)).toBe(false);
});

it("the actual admin section displays a recorded storage refusal with readable units", () => {
  const query = vi.mocked(convexHooks.useQuery).mockReturnValue({ settings: null, effectiveSite: { planStoredBytes: { free: 100 }, maxFileBytes: { image: 100 }, mcpBatchMaxItems: 5, mcpBatchMaxBytes: 100 }, people: [], audit: [], events: [{ _id: "synthetic-event", at: 1, ownerId: "synthetic-owner", mode: "on", source: "begin", limit: "storedBytesPerUser", used: 90, requested: 20, remaining: 10, cap: 100 }] } as never);
  const mutation = vi.mocked(convexHooks.useMutation).mockReturnValue(vi.fn() as never);
  try { render(<StorageAdmin />); expect(screen.getByText(/90 bytes used; 20 bytes requested; 10 bytes remaining/)).toBeInTheDocument(); } finally { query.mockReset(); mutation.mockReset(); }
});

it("map editors show saved keys alone and do not submit them until edited", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<StorageLimitsForm personal={false} savedLimits={{ planStoredBytes: { pro: 300 } }} onSave={save} />);
  expect(screen.getByLabelText(/Plan table changes/)).toHaveValue('{"pro":300}');
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Synthetic reason" } }); fireEvent.click(screen.getByRole("button", { name: "Save limits" })); await waitFor(() => expect(save).toHaveBeenCalledOnce()); expect(save.mock.calls[0][0].limits).toEqual({});
  fireEvent.change(screen.getByLabelText(/Plan table changes/), { target: { value: '{"pro":400}' } }); fireEvent.click(screen.getByRole("button", { name: "Save limits" })); await waitFor(() => expect(save).toHaveBeenCalledTimes(2)); expect(save.mock.calls[1][0].limits).toEqual({ planStoredBytes: { pro: 400 } });
});

it("R4 unknown batch totals preserve numeric compatibility through real person and AI readers", async () => {
  const numeric = usageLimitError({ limit: "storedBytesPerUser", unit: "bytes", used: 0, cap: 100, requested: 120, remaining: 100, resetsAt: null });
  const refusal = { ...numeric, batchTotalUnknown: true, message: numeric.message.replace("this needs ", "this needs at least ") + " The full batch total is unknown. Retry a smaller batch once there is room." };
  for (const field of ["used", "cap", "requested", "remaining"] as const) expect(typeof refusal[field]).toBe("number");
  const error = new ConvexError(refusal); error.message = "Server Error";
  for (const reader of [friendlyUploadError, photoUploadFailureMessage]) { const message = reader(error); expect(message).toContain("full batch total is unknown"); expect(message).toContain("100"); expect(message).toContain("Retry"); expect(message).not.toContain("null"); }
  // An older numeric reader remains valid; the additive-aware client also
  // preserves uncertainty and the family's allowance/connection guidance.
  expect(mcpLimitText(refusal)).not.toContain("null");
  const { toolErrorResult } = await import("../../mcp-server/assistwithmoving-api.mjs");
  const reply = toolErrorResult({ payload: { error: refusal } });
  expect(reply.structuredContent).toEqual(refusal); expect(reply.isError).toBe(true);
  expect(reply.content[0].text).toContain("full batch total is unknown"); expect(reply.content[0].text).toContain("100"); expect(reply.content[0].text).toBe(mcpLimitText(refusal).replace("needs ", "needs at least ") + " The full batch total is unknown.");
});
