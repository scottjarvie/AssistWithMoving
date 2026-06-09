import { afterEach, describe, expect, it, vi } from "vitest";

import {
  enforceAiCostGuardrails,
  estimateTokenCostCents,
  getAiProviderStatus,
  runAiProvider,
} from "../../convex/lib/aiProvider";

const originalEnv = { ...process.env };

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

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

  it("reports safe provider readiness without exposing secrets", () => {
    process.env.AI_DEFAULT_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test-secret";
    process.env.OPENAI_MODEL = "gpt-5-mini";

    expect(getAiProviderStatus()).toEqual({
      defaultProvider: "openai",
      defaultModel: "gpt-5-mini",
      openai: {
        configured: true,
        defaultModel: "gpt-5-mini",
      },
    });
  });

  it("runs the OpenAI provider through the Responses API", async () => {
    process.env.OPENAI_API_KEY = "sk-test-secret";
    process.env.OPENAI_MODEL = "gpt-5-mini";
    process.env.OPENAI_INPUT_CENTS_PER_MILLION = "25";
    process.env.OPENAI_OUTPUT_CENTS_PER_MILLION = "200";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "resp_123",
          status: "completed",
          model: "gpt-5-mini",
          output_text: JSON.stringify({
            summary: "Capacity, evidence, and packet readiness need review.",
            confidence: "medium",
            questions: ["Which trailer capacity is confirmed?"],
            risks: ["Unconfirmed capacity can make load totals misleading."],
            recommendedActions: ["Confirm truck and trailer capacities."],
          }),
          usage: {
            input_tokens: 1000,
            output_tokens: 500,
            total_tokens: 1500,
          },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAiProvider({
      jobId: "job-id",
      type: "generalReview",
      modality: "structured",
      provider: "openai",
      model: "gpt-5-mini",
      inputSummary: "Review move readiness.",
      maxOutputTokens: 256,
      maxCostCents: 1,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test-secret",
        }),
      })
    );
    expect(result.outputSummary).toBe(
      "Capacity, evidence, and packet readiness need review."
    );
    expect(result.confidence).toBe("medium");
    expect(result.tokenUsage?.totalTokens).toBe(1500);
    expect(result.cost?.estimatedCents).toBe(0.125);
    expect(result.providerMetadata).toEqual({
      responseId: "resp_123",
      status: "completed",
      model: "gpt-5-mini",
    });
  });

  it("requires an OpenAI API key before running the OpenAI provider", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      runAiProvider({
        jobId: "job-id",
        type: "generalReview",
        modality: "structured",
        provider: "openai",
        model: "gpt-5-mini",
      })
    ).rejects.toThrow("OpenAI provider is not configured.");
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
