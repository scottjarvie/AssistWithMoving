import { describe, expect, it } from "vitest";

import {
  claimEvidenceScore,
  claimEvidenceWarnings,
  claimPacketDisclaimer,
  claimRelevanceReasons,
  claimSeverity,
  isClaimRelevantItem,
  shouldShowClaimOwnerFields,
  type ClaimEvidenceInput,
} from "../../convex/lib/claimPacket";
import {
  buildClaimPacketPath,
  claimPacketFilename,
  formatClaimCurrency,
} from "@/lib/claim-packet";

const baseItem: ClaimEvidenceInput = {
  status: "active",
  condition: "good",
  quantity: 1,
  valueCents: 50000,
  replacementValueCents: 75000,
  serialNumber: "SN-1",
  modelNumber: "MDL-1",
  highValue: false,
  needsReview: false,
  reviewFlags: [],
  planningDefaultKeys: [],
  photoCount: 2,
  damagePhotoCount: 0,
  conditionPhotoCount: 1,
  receiptPhotoCount: 1,
};

describe("claim packet helpers", () => {
  it("selects damaged, missing, high-value, and review-flagged items", () => {
    expect(isClaimRelevantItem(baseItem)).toBe(false);
    expect(isClaimRelevantItem({ ...baseItem, status: "missing" })).toBe(true);
    expect(isClaimRelevantItem({ ...baseItem, condition: "damaged" })).toBe(true);
    expect(isClaimRelevantItem({ ...baseItem, highValue: true })).toBe(true);
    expect(
      claimRelevanceReasons({
        ...baseItem,
        reviewFlags: ["possible claim follow-up"],
      })
    ).toContain("Claim review flag");
  });

  it("scores claim severity from status and value", () => {
    expect(claimSeverity({ ...baseItem, status: "damaged" })).toBe("high");
    expect(claimSeverity({ ...baseItem, valueCents: 120000 })).toBe("high");
    expect(claimSeverity({ ...baseItem, highValue: true })).toBe("medium");
    expect(
      claimSeverity({
        ...baseItem,
        valueCents: undefined,
        replacementValueCents: undefined,
      })
    ).toBe("watch");
  });

  it("warns when claim evidence is thin", () => {
    const warnings = claimEvidenceWarnings({
      ...baseItem,
      status: "damaged",
      condition: "damaged",
      valueCents: undefined,
      replacementValueCents: undefined,
      highValue: true,
      serialNumber: undefined,
      modelNumber: undefined,
      photoCount: 0,
      damagePhotoCount: 0,
      receiptPhotoCount: 0,
    });

    expect(warnings).toEqual([
      "No photos attached",
      "Missing damage photo",
      "No value or replacement value",
      "High-value item missing serial/model",
    ]);
    expect(claimEvidenceScore({ ...baseItem, photoCount: 0 })).toBeLessThan(
      claimEvidenceScore(baseItem)
    );
  });

  it("separates submission fields from owner-only notes", () => {
    expect(shouldShowClaimOwnerFields("submission")).toBe(false);
    expect(shouldShowClaimOwnerFields("owner")).toBe(true);
    expect(claimPacketDisclaimer()).toContain("does not guarantee claim approval");
  });
});

describe("claim packet paths", () => {
  it("builds submission and owner packet paths", () => {
    expect(
      buildClaimPacketPath({ householdId: "household-id", moveId: "move-id" })
    ).toBe(
      "/app/claim-packet?householdId=household-id&moveId=move-id&mode=submission"
    );
    expect(
      buildClaimPacketPath({
        householdId: "household-id",
        moveId: "move-id",
        mode: "owner",
      })
    ).toBe(
      "/app/claim-packet?householdId=household-id&moveId=move-id&mode=owner"
    );
    expect(claimPacketFilename("owner")).toBe("movingmanifest-claim-owner.csv");
    expect(formatClaimCurrency(12500)).toBe("$125.00");
    expect(formatClaimCurrency(undefined)).toBe("Not documented");
  });
});
