import { describe, expect, it } from "vitest";

import {
  billingProviderDecision,
  billingTierDefinition,
  defaultBillingTier,
  evaluateEntitlement,
  normalizeBillingTier,
  tierDefinitions,
  usagePercent,
  type UsageSnapshot,
} from "../../convex/lib/billing";

const emptyUsage: UsageSnapshot = {
  activeMoves: 0,
  photoCount: 0,
  photoStorageBytes: 0,
  aiJobsMonthly: 0,
  aiEstimatedCentsMonthly: 0,
  exportJobsMonthly: 0,
  apiCallsMonthly: 0,
  activeApiKeys: 0,
  activeShareLinks: 0,
};

describe("billing readiness helpers", () => {
  it("uses a generous non-billing launch default", () => {
    expect(defaultBillingTier).toBe("launch");
    expect(tierDefinitions.launch.limits.activeMoves).toBeGreaterThan(2);
    expect(tierDefinitions.launch.limits.apiCallsMonthly).toBeGreaterThan(1000);
  });

  it("evaluates limits with an increment", () => {
    const usage = { ...emptyUsage, activeMoves: 2 };
    const result = evaluateEntitlement(
      usage,
      tierDefinitions.free.limits,
      "activeMoves",
      1
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("activeMoves");
  });

  it("allows unlimited internal tiers", () => {
    const usage = { ...emptyUsage, activeMoves: 1_000_000 };
    const result = evaluateEntitlement(
      usage,
      tierDefinitions.unlimited.limits,
      "activeMoves",
      1
    );

    expect(result.allowed).toBe(true);
    expect(result.percent).toBe(0);
  });

  it("normalizes valid tiers and rejects unknown tiers", () => {
    expect(normalizeBillingTier("pro")).toBe("pro");
    expect(() => normalizeBillingTier("enterprise")).toThrow(
      "Unknown billing tier"
    );
  });

  it("reports usage percentages without exceeding display bounds", () => {
    expect(usagePercent(5, 10)).toBe(50);
    expect(usagePercent(20, 10)).toBe(200);
    expect(usagePercent(5, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("keeps payment activation outside the code default", () => {
    expect(billingProviderDecision.activeProvider).toBe("none");
    expect(billingProviderDecision.candidates).toContain("stripe");
    expect(billingProviderDecision.note).toContain(
      "Payment collection is intentionally inactive"
    );
    expect(billingTierDefinition("launch").label).toContain("Launch");
  });

  it("uses launch-ready tier copy without placeholder wording", () => {
    const copy = Object.values(tierDefinitions)
      .flatMap((definition) => [definition.label, definition.description])
      .join(" ");

    expect(copy).not.toMatch(/placeholder/i);
    expect(billingTierDefinition("plus").label).toBe("Plus household");
    expect(billingTierDefinition("pro").label).toBe("Pro operations");
  });
});
