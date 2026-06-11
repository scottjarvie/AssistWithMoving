import { describe, expect, it } from "vitest";

import {
  assertShareLinkActive,
  defaultDocumentationProfileConfig,
  hashShareToken,
  normalizeDocumentationProfileConfig,
  normalizeShareLinkActions,
  shareTokenPreview,
} from "../../convex/lib/documentation";
import { safeShareLinkMetadata } from "../../convex/lib/shareLinks";

describe("documentation profile defaults", () => {
  it("keeps PCS packets focused on military documentation needs", () => {
    const config = defaultDocumentationProfileConfig("pcsMove");

    expect(config.includedFields).toContain("pcsFields");
    expect(config.includedFields).toContain("loadAssignments");
    expect(config.imageRule).toBe("reviewedEvidence");
    expect(config.allowedActions).toContain("uploadEvidence");
  });

  it("keeps moving company packets away from private value fields", () => {
    const config = defaultDocumentationProfileConfig("movingCompany");

    expect(config.includedFields).toContain("loadAssignments");
    expect(config.includedFields).not.toContain("purchaseValues");
    expect(config.includedFields).not.toContain("serialNumbers");
    expect(config.filters.dispositions).toEqual(["take", "mover"]);
  });

  it("normalizes profile overrides without invalid fields", () => {
    const config = normalizeDocumentationProfileConfig({
      type: "sellOrGiveaway",
      name: "  Marketplace list  ",
      includedFields: ["items", "photos", "items"],
      filters: {
        dispositions: ["sell", "free", "sell"],
        room: "  Garage  ",
      },
      allowedActions: ["view", "comment", "view"],
    });

    expect(config.name).toBe("Marketplace list");
    expect(config.includedFields).toEqual(["items", "photos"]);
    expect(config.filters).toEqual({
      dispositions: ["sell", "free"],
      room: "Garage",
    });
    expect(config.allowedActions).toEqual(["view", "comment"]);
  });
});

describe("share link helpers", () => {
  it("hashes tokens and only exposes a preview", async () => {
    const token = "share-token-example";

    expect(await hashShareToken(token)).not.toBe(token);
    expect(shareTokenPreview(token)).toBe("-example");
  });

  it("denies expired and revoked share links", () => {
    expect(() =>
      assertShareLinkActive({
        status: "active",
        expiresAt: Date.UTC(2026, 5, 8),
      }, Date.UTC(2026, 5, 9))
    ).toThrow("expired");

    expect(() =>
      assertShareLinkActive({
        status: "revoked",
        expiresAt: Date.UTC(2026, 5, 10),
        revokedAt: Date.UTC(2026, 5, 8),
      }, Date.UTC(2026, 5, 9))
    ).toThrow("revoked");
  });

  it("normalizes requested link actions to the profile allowance", () => {
    expect(
      normalizeShareLinkActions(["download", "comment"], ["view", "download"])
    ).toEqual(["download"]);
    expect(
      normalizeShareLinkActions(["viewPlan"], ["view", "viewPlan", "download"])
    ).toEqual(["viewPlan"]);
  });

  it("keeps token hashes out of share link list summaries", () => {
    const summary = safeShareLinkMetadata({
      _id: "share1",
      householdId: "household1",
      moveId: "move1",
      documentationProfileId: "profile1",
      scope: "profile",
      tokenHash: "hash-that-should-not-leave-convex",
      tokenPreview: "abc12345",
      role: "guest",
      status: "active",
      allowedActions: ["view"],
      expiresAt: Date.UTC(2026, 6, 8),
      accessCount: 0,
      createdByUserId: "user1",
      createdAt: Date.UTC(2026, 5, 8),
      updatedAt: Date.UTC(2026, 5, 8),
    } as Parameters<typeof safeShareLinkMetadata>[0]);

    expect(summary.tokenPreview).toBe("abc12345");
    expect("tokenHash" in summary).toBe(false);
  });
});
