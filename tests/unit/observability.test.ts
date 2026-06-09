import { describe, expect, it } from "vitest";

import {
  evaluateOperationalSignals,
  formatOperationalMetric,
  operationalHealth,
  type OperationalMetrics,
} from "../../convex/lib/observability";

const quietMetrics: OperationalMetrics = {
  authFailures24h: 0,
  apiEvents24h: 0,
  shareLinkAccesses24h: 0,
  activeShareLinks: 0,
  exportJobs24h: 0,
  failedAiJobs24h: 0,
  aiEstimatedCents24h: 0,
  uploadFailures24h: 0,
  photoStorageBytes: 0,
  activeApiKeys: 0,
  apiRateLimitedWindows24h: 0,
  apiHighestWindowUsagePercent24h: 0,
};

describe("observability helpers", () => {
  it("returns no signals for quiet metrics", () => {
    const signals = evaluateOperationalSignals(quietMetrics);

    expect(signals).toEqual([]);
    expect(operationalHealth(signals)).toBe("ok");
  });

  it("raises warning and critical signals from thresholds", () => {
    const signals = evaluateOperationalSignals({
      ...quietMetrics,
      authFailures24h: 5,
      failedAiJobs24h: 50,
    });

    expect(signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "authFailures24h",
          severity: "warning",
        }),
        expect.objectContaining({
          key: "failedAiJobs24h",
          severity: "critical",
        }),
      ])
    );
    expect(operationalHealth(signals)).toBe("critical");
  });

  it("raises API rate-limit pressure signals", () => {
    const signals = evaluateOperationalSignals({
      ...quietMetrics,
      apiRateLimitedWindows24h: 1,
      apiHighestWindowUsagePercent24h: 100,
    });

    expect(signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "apiRateLimitedWindows24h",
          severity: "warning",
        }),
        expect.objectContaining({
          key: "apiHighestWindowUsagePercent24h",
          severity: "critical",
        }),
      ])
    );
    expect(operationalHealth(signals)).toBe("critical");
  });

  it("formats operational metrics without exposing sensitive values", () => {
    expect(formatOperationalMetric(2500, "aiEstimatedCents24h")).toBe("$25.00");
    expect(formatOperationalMetric(1024 * 1024, "photoStorageBytes")).toBe(
      "1.00 MB"
    );
    expect(formatOperationalMetric(95, "apiHighestWindowUsagePercent24h")).toBe(
      "95%"
    );
    expect(formatOperationalMetric(12, "apiEvents24h")).toBe("12");
  });
});
