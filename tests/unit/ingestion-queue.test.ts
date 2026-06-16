import { describe, expect, it } from "vitest";

import {
  canTransitionIngestionStatus,
  ingestionClaimDurationMs,
  ingestionClaimIsExpired,
  ingestionEntryIsEditable,
  ingestionQueueStatuses,
  ingestionScopeHints,
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

  it("includes floor-plan intake as a scoped queue lane", () => {
    expect(ingestionScopeHints).toContain("floorPlan");
  });
});
