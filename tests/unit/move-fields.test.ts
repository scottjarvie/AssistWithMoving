import { describe, expect, it } from "vitest";

import {
  defaultDocumentationProfilesForMoveType,
  normalizeDocumentationProfileTypes,
  normalizeOptionalText,
  normalizeRuleList,
  normalizeSortOrder,
} from "../../convex/lib/moveFields";

describe("move field helpers", () => {
  it("normalizes rule lists without duplicates or empty values", () => {
    expect(
      normalizeRuleList([" no liquids ", "", "fragile top", "no liquids"])
    ).toEqual(["no liquids", "fragile top"]);
  });

  it("preserves finite sort orders and falls back for invalid values", () => {
    expect(normalizeSortOrder(10)).toBe(10);
    expect(Number.isFinite(normalizeSortOrder(undefined))).toBe(true);
  });

  it("normalizes optional text fields", () => {
    expect(normalizeOptionalText("  transportation office note  ")).toBe(
      "transportation office note"
    );
    expect(normalizeOptionalText("   ")).toBeUndefined();
  });

  it("deduplicates documentation profile types", () => {
    expect(
      normalizeDocumentationProfileTypes([
        "pcsMove",
        "movingCompany",
        "pcsMove",
      ])
    ).toEqual(["pcsMove", "movingCompany"]);
  });

  it("sets recipient profile defaults by move type", () => {
    expect(defaultDocumentationProfilesForMoveType("pcs")).toEqual([
      "pcsMove",
      "movingCompany",
      "loadCrew",
    ]);
    expect(defaultDocumentationProfilesForMoveType("claimsInventory")).toEqual([
      "insuranceClaim",
      "personalFullRecord",
    ]);
  });
});
