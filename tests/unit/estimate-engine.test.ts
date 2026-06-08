import { describe, expect, it } from "vitest";

import {
  estimateItem,
  sumEstimateValues,
  volumeFromDimensions,
} from "../../convex/lib/estimateEngine";

describe("estimate engine", () => {
  it("uses actual weight before manual or baseline values", () => {
    const estimate = estimateItem({
      name: "Tool chest",
      category: "tools",
      quantity: 2,
      actualWeightLb: 80,
      estimatedWeightLb: 20,
    });

    expect(estimate.weight).toMatchObject({
      value: 160,
      confidence: "actual",
      source: "actual",
    });
  });

  it("uses manual estimates before category baselines", () => {
    const estimate = estimateItem({
      name: "Dining chair",
      category: "furniture",
      estimatedWeightLb: 14,
      estimatedVolumeCuFt: 5,
      weightConfidence: "manual",
      volumeConfidence: "manual",
    });

    expect(estimate.weight).toMatchObject({
      value: 14,
      confidence: "manual",
      source: "manual",
    });
    expect(estimate.volume).toMatchObject({
      value: 5,
      confidence: "manual",
      source: "manual",
    });
  });

  it("calculates cubic feet from dimensions without manual volume", () => {
    expect(
      volumeFromDimensions({ lengthIn: 24, widthIn: 18, heightIn: 16 })
    ).toBe(4);

    const estimate = estimateItem({
      name: "Storage bin",
      dimensionsIn: { lengthIn: 24, widthIn: 18, heightIn: 16 },
    });

    expect(estimate.volume).toMatchObject({
      value: 4,
      confidence: "high",
      source: "dimensions",
    });
  });

  it("uses name and category baselines deterministically", () => {
    expect(estimateItem({ name: "Living room sofa" }).weight).toMatchObject({
      value: 160,
      source: "name",
    });
    expect(
      estimateItem({ name: "Loose paperwork", category: "documents" }).weight
    ).toMatchObject({
      value: 35,
      source: "category",
    });
  });

  it("emits warnings when estimates or dimensions are missing", () => {
    const estimate = estimateItem({ name: "Mystery object" });

    expect(estimate.warnings).toEqual([
      "missingWeightEstimate",
      "missingVolumeEstimate",
      "missingDimensions",
    ]);
  });

  it("sums estimate values with stable rounding", () => {
    expect(
      sumEstimateValues([{ value: 1.24, confidence: "low", source: "name" }])
    ).toBe(1.2);
  });
});
