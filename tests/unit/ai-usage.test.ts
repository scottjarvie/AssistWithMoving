import { describe, expect, it } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import {
  aiUsageLimits,
  evaluateAiUsageLimits,
  summarizeAiUsage,
  type AiUsageJob,
} from "../../convex/lib/aiUsage";

const now = Date.UTC(2026, 5, 8, 12);

describe("AI usage limits", () => {
  it("blocks oversized AI input before job creation", () => {
    const result = evaluateAiUsageLimits({
      inputSizeBytes: aiUsageLimits.maxInputBytes + 1,
      estimatedCents: 0,
      moveDailyJobCount: 0,
      householdDailyJobCount: 0,
      userDailyJobCount: 0,
      moveInFlightJobCount: 0,
      moveDailyEstimatedCents: 0,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("too large");
  });

  it("blocks daily move budget overages", () => {
    const result = evaluateAiUsageLimits({
      estimatedCents: 75,
      moveDailyJobCount: 0,
      householdDailyJobCount: 0,
      userDailyJobCount: 0,
      moveInFlightJobCount: 0,
      moveDailyEstimatedCents: aiUsageLimits.maxDailyEstimatedCentsPerMove - 50,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("daily AI budget");
  });

  it("summarizes status, feature, provider, and cost signals", () => {
    const jobs: AiUsageJob[] = [
      job({
        id: "job1",
        type: "inventoryExtraction",
        status: "succeeded",
        provider: "mock",
        model: "text-intake-parser-v1",
        costCents: 12,
        createdAt: now - 60_000,
      }),
      job({
        id: "job2",
        type: "photoIntake",
        status: "failed",
        provider: "mock",
        model: "photo-intake-parser-v1",
        costCents: 55,
        error: "provider timeout",
        createdAt: now - 120_000,
      }),
      job({
        id: "job3",
        type: "generalReview",
        status: "queued",
        provider: "mock",
        model: "mock-model",
        maxCostCents: 1,
        createdAt: now - 2 * 24 * 60 * 60 * 1000,
      }),
    ];

    const summary = summarizeAiUsage(jobs, now);

    expect(summary.totalJobs).toBe(3);
    expect(summary.dailyJobs).toBe(2);
    expect(summary.inFlightJobs).toBe(1);
    expect(summary.dailyCostCents).toBe(67);
    expect(summary.byStatus.failed).toBe(1);
    expect(summary.byType.photoIntake).toBe(1);
    expect(summary.byProviderModel["mock/photo-intake-parser-v1"]).toBe(1);
    expect(summary.failedRecent[0].error).toBe("provider timeout");
    expect(summary.expensiveJobs[0].costCents).toBe(55);
  });
});

function job({
  id,
  type,
  status,
  provider,
  model,
  costCents,
  maxCostCents,
  error,
  createdAt,
}: {
  id: string;
  type: AiUsageJob["type"];
  status: AiUsageJob["status"];
  provider: string;
  model: string;
  costCents?: number;
  maxCostCents?: number;
  error?: string;
  createdAt: number;
}): AiUsageJob {
  return {
    _id: id as Id<"aiJobs">,
    type,
    status,
    provider,
    model,
    cost:
      costCents === undefined
        ? undefined
        : { estimatedCents: costCents, actualCents: costCents, currency: "USD" },
    maxCostCents,
    error,
    createdAt,
    updatedAt: createdAt,
  };
}
