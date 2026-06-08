import { describe, expect, it } from "vitest";

import {
  enforceAiCostGuardrails,
  estimateTokenCostCents,
  runAiProvider,
} from "../../convex/lib/aiProvider";

describe("AI provider abstraction", () => {
  it("estimates token cost in cents", () => {
    expect(
      estimateTokenCostCents({
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        inputCentsPerMillion: 15,
        outputCentsPerMillion: 60,
      })
    ).toBe(45);
  });

  it("blocks jobs above the configured cost guardrail", () => {
    expect(() =>
      enforceAiCostGuardrails({ estimatedCents: 20, maxCostCents: 10 })
    ).toThrow("AI job exceeds the configured cost guardrail.");
  });

  it("runs the mock provider through the shared interface", async () => {
    const result = await runAiProvider({
      jobId: "job-id",
      type: "inventoryExtraction",
      modality: "structured",
      provider: "mock",
      model: "mock-model",
      inputSummary: "Two boxes of kitchen items",
      maxOutputTokens: 128,
      maxCostCents: 1,
    });

    expect(result.outputSummary).toContain("Mock inventoryExtraction result");
    expect(result.confidence).toBe("low");
    expect(result.tokenUsage?.totalTokens).toBeGreaterThan(0);
    expect(result.cost?.currency).toBe("USD");
  });

  it("rejects unconfigured providers", async () => {
    await expect(
      runAiProvider({
        jobId: "job-id",
        type: "generalReview",
        modality: "text",
        provider: "missing",
        model: "missing-model",
      })
    ).rejects.toThrow("AI provider is not configured");
  });
});
