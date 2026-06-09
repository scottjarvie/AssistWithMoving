import { describe, expect, it } from "vitest";

import { resolveBoxWeight } from "../../convex/lib/boxWeight";
import { normalizeBoxCode } from "../../convex/lib/moveFields";

describe("box field helpers", () => {
  it("normalizes box codes into short writable labels", () => {
    expect(normalizeBoxCode(" b 001 ")).toBe("B-001");
    expect(normalizeBoxCode("garage / 003")).toBe("GARAGE-003");
    expect(normalizeBoxCode("kit---004")).toBe("KIT-004");
  });

  it("returns an empty code when there are no usable characters", () => {
    expect(normalizeBoxCode(" *** ")).toBe("");
  });

  it("labels measured box weight ahead of estimates", () => {
    expect(
      resolveBoxWeight({
        actualWeightLb: 42,
        estimatedWeightLb: 30,
        contentsEstimatedWeightLb: 24,
      })
    ).toMatchObject({
      valueLb: 42,
      source: "actual",
      label: "actual",
    });
  });

  it("labels manual box estimates before contents-derived estimates", () => {
    expect(
      resolveBoxWeight({
        estimatedWeightLb: 31.25,
        contentsEstimatedWeightLb: 28,
      })
    ).toMatchObject({
      valueLb: 31.3,
      source: "manualEstimate",
      label: "manual estimate",
    });
  });

  it("labels contents-derived box estimates when box weights are absent", () => {
    expect(resolveBoxWeight({ contentsEstimatedWeightLb: 18 })).toMatchObject({
      valueLb: 18,
      source: "contentsDerived",
      label: "contents-derived",
    });
  });

  it("marks empty boxes with no positive weight as missing", () => {
    const summary = resolveBoxWeight({
      actualWeightLb: 0,
      estimatedWeightLb: -2,
      contentsEstimatedWeightLb: 0,
    });

    expect(summary.valueLb).toBeUndefined();
    expect(summary).toMatchObject({
      source: "missing",
      label: "missing",
    });
  });
});
