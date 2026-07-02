import { describe, expect, it } from "vitest";

import {
  canTransitionIngestionStatus,
  ingestionClaimDurationMs,
  ingestionClaimIsExpired,
  ingestionEntryIsEditable,
  ingestionQueueStatuses,
  isMediaUploadPending,
  resolveAppendedMediaState,
  uploadRollupIsInactive,
} from "../../convex/lib/ingestionQueue";

describe("ingestion queue lifecycle", () => {
  it("allows the documented forward path", () => {
    expect(canTransitionIngestionStatus("queued", "claimed")).toBe(true);
    expect(canTransitionIngestionStatus("claimed", "processed")).toBe(true);
    expect(canTransitionIngestionStatus("claimed", "needsInput")).toBe(true);
    expect(canTransitionIngestionStatus("processed", "resolved")).toBe(true);
  });

  it("allows recovery paths back to queued", () => {
    expect(canTransitionIngestionStatus("claimed", "queued")).toBe(true);
    expect(canTransitionIngestionStatus("needsInput", "queued")).toBe(true);
    expect(canTransitionIngestionStatus("processed", "queued")).toBe(true);
    expect(canTransitionIngestionStatus("discarded", "queued")).toBe(true);
  });

  it("blocks skipping the claim step and reopening resolved entries", () => {
    expect(canTransitionIngestionStatus("queued", "processed")).toBe(false);
    expect(canTransitionIngestionStatus("queued", "resolved")).toBe(false);
    expect(canTransitionIngestionStatus("resolved", "queued")).toBe(false);
    for (const status of ingestionQueueStatuses) {
      expect(canTransitionIngestionStatus("resolved", status)).toBe(false);
    }
  });

  it("only queued and needs-input entries are user-editable", () => {
    expect(ingestionEntryIsEditable("queued")).toBe(true);
    expect(ingestionEntryIsEditable("needsInput")).toBe(true);
    expect(ingestionEntryIsEditable("claimed")).toBe(false);
    expect(ingestionEntryIsEditable("processed")).toBe(false);
    expect(ingestionEntryIsEditable("resolved")).toBe(false);
    expect(ingestionEntryIsEditable("discarded")).toBe(false);
  });

  it("treats stale claims as expired so abandoned runs do not strand work", () => {
    const now = 1_000_000;
    const fresh = {
      status: "claimed" as const,
      claimExpiresAt: now + ingestionClaimDurationMs,
    };
    const stale = { status: "claimed" as const, claimExpiresAt: now - 1 };
    const unclaimed = { status: "queued" as const };

    expect(ingestionClaimIsExpired(fresh, now)).toBe(false);
    expect(ingestionClaimIsExpired(stale, now)).toBe(true);
    expect(ingestionClaimIsExpired(unclaimed, now)).toBe(false);
  });
});

// The claim gate both claimNext and the MCP claimQueue twin use to skip entries
// whose background media is still uploading — an agent must never claim a
// half-uploaded capture.
describe("isMediaUploadPending (claim-during-upload gate)", () => {
  it("flags an entry whose rollup is still 'uploading'", () => {
    expect(
      isMediaUploadPending({
        mediaUploadState: "uploading",
        mediaPhotoIds: [],
      }),
    ).toBe(true);
  });

  it("flags an entry that promised more photos than have attached", () => {
    expect(
      isMediaUploadPending({
        expectedMediaCount: 2,
        mediaPhotoIds: ["a"],
      }),
    ).toBe(true);
  });

  it("does NOT flag a complete entry (count reached, or no expectation)", () => {
    expect(
      isMediaUploadPending({
        mediaUploadState: "complete",
        expectedMediaCount: 2,
        mediaPhotoIds: ["a", "b"],
      }),
    ).toBe(false);
    // No expectation + no uploading flag => nothing pending (old/MCP/text rows).
    expect(isMediaUploadPending({ mediaPhotoIds: [] })).toBe(false);
    expect(isMediaUploadPending({ mediaPhotoIds: ["a"] })).toBe(false);
  });

  it("does NOT flag a FAILED upload even with an unmet promised count", () => {
    // Regression: a capture whose photo upload permanently failed (0 attached
    // of 1 promised) must stay CLAIMABLE — the promised photo is never arriving,
    // and the directions alone are enough to make inventory. Treating it as
    // pending stranded such captures in the queue forever.
    expect(
      isMediaUploadPending({
        mediaUploadState: "failed",
        expectedMediaCount: 1,
        mediaPhotoIds: [],
      }),
    ).toBe(false);
  });
});

// appendMedia's rollup recomputation. The load-bearing case is F3 add-images
// onto an entry that never set expectedMediaCount: it must resolve to "complete"
// so the entry stays claimable, NOT strand in a permanent "uploading".
describe("resolveAppendedMediaState (appendMedia rollup)", () => {
  it("F3/MCP/old entries with no expectedMediaCount resolve to complete", () => {
    expect(
      resolveAppendedMediaState({ attachedCount: 1 }),
    ).toBe("complete");
    expect(
      resolveAppendedMediaState({
        priorState: "uploading",
        attachedCount: 3,
      }),
    ).toBe("complete");
  });

  it("stays 'uploading' until a known expected count is reached", () => {
    expect(
      resolveAppendedMediaState({ expectedMediaCount: 3, attachedCount: 1 }),
    ).toBe("uploading");
    expect(
      resolveAppendedMediaState({ expectedMediaCount: 3, attachedCount: 3 }),
    ).toBe("complete");
  });

  it("keeps a prior 'failed' sticky until the count is fully reached", () => {
    // A slow sibling completing mid-batch must not clear a sibling's failure.
    expect(
      resolveAppendedMediaState({
        expectedMediaCount: 3,
        priorState: "failed",
        attachedCount: 2,
      }),
    ).toBe("failed");
    // Once every promised photo lands the entry is genuinely complete.
    expect(
      resolveAppendedMediaState({
        expectedMediaCount: 3,
        priorState: "failed",
        attachedCount: 3,
      }),
    ).toBe("complete");
  });

  it("age-out recompute (ageOutStuckUploadingEntries cron) resolves a stuck 'uploading' capture to a terminal state", () => {
    // The cron passes priorState 'failed' so a capture stranded mid-upload never
    // stays 'uploading' (un-claimable): it becomes 'failed' when promised photos
    // never arrived (claimable from the note + partial photos)...
    expect(
      resolveAppendedMediaState({
        expectedMediaCount: 2,
        priorState: "failed",
        attachedCount: 1,
      }),
    ).toBe("failed");
    // ...or 'complete' if every promised photo actually landed but the rollup
    // was left stranded (e.g. the tab reloaded before the final recompute).
    expect(
      resolveAppendedMediaState({
        expectedMediaCount: 1,
        priorState: "failed",
        attachedCount: 1,
      }),
    ).toBe("complete");
  });

  it("only ages out upload rollups with no recent media activity", () => {
    const cutoff = 1_000_000;
    expect(uploadRollupIsInactive({ updatedAt: cutoff - 1 }, cutoff)).toBe(true);
    expect(uploadRollupIsInactive({ updatedAt: cutoff }, cutoff)).toBe(true);
    expect(uploadRollupIsInactive({ updatedAt: cutoff + 1 }, cutoff)).toBe(
      false,
    );
  });
});
