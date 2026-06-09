import { describe, expect, it } from "vitest";

import {
  buildAbuseReviewQueue,
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

  it("builds specific abuse review cards for API rate-limit pressure", () => {
    const queue = buildAbuseReviewQueue({
      signals: [],
      audits: [],
      now: 10_000,
      rateLimitWindows: [
        {
          id: "window1",
          householdId: "household1",
          moveId: "move1",
          apiKeyId: "apiKey1",
          windowStart: 1_000,
          windowEnd: 2_000,
          count: 301,
          limit: 300,
          lastAction: "GET /api/v1/moves/move1/summary",
          updatedAt: 1_900,
        },
      ],
    });

    expect(queue).toEqual([
      expect.objectContaining({
        id: "rate-limit:apiKey1:1000",
        title: "API key is rate limited",
        severity: "critical",
        area: "API",
        actorApiKeyId: "apiKey1",
      }),
    ]);
    expect(queue[0].events[0]).toEqual(
      expect.objectContaining({
        action: "GET /api/v1/moves/move1/summary",
        category: "apiKey",
      })
    );
  });

  it("queues repeated original photo downloads for admin review", () => {
    const queue = buildAbuseReviewQueue({
      signals: [],
      rateLimitWindows: [],
      now: 10_000,
      audits: [3, 2, 1].map((index) => ({
        id: `audit${index}`,
        householdId: "household1",
        moveId: "move1",
        actorType: "user",
        actorUserId: "user1",
        category: "photo",
        action: "photo.original_download_url_created",
        objectTable: "itemPhotos",
        objectId: "photo1",
        createdAt: index,
      })),
    });

    expect(queue[0]).toEqual(
      expect.objectContaining({
        id: "cluster:photo-original-downloads:user1",
        title: "Repeated original photo downloads",
        severity: "warning",
        area: "Photos",
        count: 3,
      })
    );
  });

  it("prioritizes critical review cards before warning cards", () => {
    const signals = evaluateOperationalSignals({
      ...quietMetrics,
      authFailures24h: 5,
      failedAiJobs24h: 50,
    });
    const queue = buildAbuseReviewQueue({
      signals,
      rateLimitWindows: [],
      now: 10_000,
      audits: [
        {
          id: "audit1",
          actorType: "system",
          category: "auth",
          action: "auth.webhook_failed",
          createdAt: 1_000,
        },
        {
          id: "audit2",
          actorType: "system",
          category: "ai",
          action: "ai_job.failed",
          createdAt: 2_000,
        },
      ],
    });

    expect(queue[0]).toEqual(
      expect.objectContaining({
        id: "signal:failedAiJobs24h",
        severity: "critical",
      })
    );
    expect(queue).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "signal:authFailures24h",
          severity: "warning",
        }),
      ])
    );
  });
});
