import { describe, expect, it } from "vitest";

import { summarizeDocumentationProfile } from "@/lib/documentation-packets";

describe("documentation packet previews", () => {
  it("shows hidden sensitive fields for recipient-scoped profiles", () => {
    const summary = summarizeDocumentationProfile({
      type: "movingCompany",
      includedFields: ["moveSummary", "items", "boxes"],
      imageRule: "thumbsOnly",
      allowedActions: ["view", "statusUpdate"],
    });

    expect(summary.hiddenSensitiveFields).toContain("Purchase values");
    expect(summary.imageRuleLabel).toBe("Thumbnails");
    expect(summary.actionLabels).toEqual(["View", "Status updates"]);
  });

  it("warns when PCS or claims evidence is under-scoped", () => {
    const summary = summarizeDocumentationProfile({
      type: "pcsMove",
      includedFields: ["moveSummary", "items"],
      imageRule: "reviewedEvidence",
      allowedActions: ["view"],
    });

    expect(summary.warnings).toContain("PCS packet is missing PCS fields.");
    expect(summary.warnings).toContain(
      "Evidence packet is missing condition/damage fields."
    );
  });

  it("summarizes filters for preview", () => {
    const summary = summarizeDocumentationProfile({
      type: "storageInventory",
      includedFields: ["items"],
      imageRule: "thumbsOnly",
      allowedActions: ["view"],
      filters: {
        dispositions: ["storage"],
        room: "Garage",
      },
    });

    expect(summary.filterSummary).toEqual([
      "Disposition: storage",
      "Room: Garage",
    ]);
  });
});
