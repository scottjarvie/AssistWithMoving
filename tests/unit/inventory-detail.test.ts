import { describe, expect, it } from "vitest";

import {
  formatOptionalCurrencyCents,
  formatOptionalNumber,
  parseCommaList,
  parseOptionalCurrencyCents,
  parseOptionalNumber,
} from "@/lib/inventory-detail";

describe("inventory detail helpers", () => {
  it("formats optional numbers for controlled inputs", () => {
    expect(formatOptionalNumber(undefined)).toBe("");
    expect(formatOptionalNumber(12.5)).toBe("12.5");
  });

  it("parses optional numbers without turning blanks into zero", () => {
    expect(parseOptionalNumber("")).toBeUndefined();
    expect(parseOptionalNumber("  ")).toBeUndefined();
    expect(parseOptionalNumber("15.75")).toBe(15.75);
    expect(parseOptionalNumber("abc")).toBeUndefined();
  });

  it("formats and parses currency dollars as cents", () => {
    expect(formatOptionalCurrencyCents(undefined)).toBe("");
    expect(formatOptionalCurrencyCents(1299)).toBe("12.99");
    expect(parseOptionalCurrencyCents("12.994")).toBe(1299);
    expect(parseOptionalCurrencyCents("")).toBeUndefined();
  });

  it("deduplicates comma-separated lists", () => {
    expect(parseCommaList(" fragile, pcs, fragile,  ")).toEqual([
      "fragile",
      "pcs",
    ]);
  });
});
