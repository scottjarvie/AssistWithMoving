import { describe, expect, it, vi } from "vitest";

import {
  createSmokeApiConfig,
  isProductionSmokeTarget,
  productionSmokeWritesAllowed,
  runAgentJourneySmoke,
} from "../../scripts/agent-journey-smoke.mjs";

type SmokeApi = NonNullable<Parameters<typeof runAgentJourneySmoke>[0]>["api"];

function smokeContext() {
  return {
    data: {
      household: { householdId: "household1", name: "Smoke Household" },
      apiKey: {
        scopes: [
          "moves/read",
          "moves/write",
          "inventory/read",
          "inventory/write",
          "photos/write",
        ],
        moveRestricted: false,
      },
    },
  };
}

function moveScopedSmokeContext() {
  return {
    data: {
      household: { householdId: "household1", name: "Smoke Household" },
      apiKey: {
        scopes: [
          "moves/read",
          "moves/write",
          "inventory/read",
          "inventory/write",
          "photos/write",
        ],
        moveRestricted: false,
        moveId: "move-scoped-key",
      },
    },
  };
}

function smokeApi() {
  const firstBatchResults = Array.from({ length: 10 }, (_, index) => ({
    ok: true,
    itemId: `item${index + 1}`,
    action: "create",
  }));
  const secondBatchResults = firstBatchResults.map((row) => ({
    ...row,
    action: "update",
  }));

  return {
    getApiContext: vi.fn(async () => smokeContext()),
    setupMove: vi.fn(async () => ({
      data: {
        move: { moveId: "move1" },
        setupResults: {
          spaces: [
            { spaceId: "space-garage", name: "Garage", kind: "originRoom" },
            { spaceId: "space-living", name: "Living Room", kind: "originRoom" },
            { spaceId: "space-staging", name: "Staging", kind: "destinationRoom" },
          ],
          resources: [{ resourceId: "resource1" }],
          items: { succeeded: 5 },
        },
      },
    })),
    batchUpsertItems: vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          total: 10,
          failed: 0,
          succeeded: 10,
          results: firstBatchResults,
        },
      })
      .mockResolvedValueOnce({
        data: {
          total: 10,
          failed: 0,
          succeeded: 10,
          results: secondBatchResults,
        },
      }),
    uploadEvidenceImage: vi.fn(async () => ({ photoId: "photo1" })),
    createBox: vi.fn(async () => ({ data: { boxId: "box1" } })),
    addItemsToBox: vi.fn(async () => ({
      data: Array.from({ length: 5 }, (_, index) => ({
        itemId: `item${index + 1}`,
        boxId: "box1",
      })),
    })),
    getMoveSummary: vi
      .fn()
      .mockResolvedValueOnce({
        photos: [{ photoId: "photo1", derivativeStatus: "ready" }],
      })
      .mockResolvedValueOnce({
        counts: { items: 15, boxes: 1, photos: 1 },
        photos: [{ photoId: "photo1", derivativeStatus: "ready" }],
      }),
    movingManifestRequest: vi.fn(async () => ({ data: { moveId: "move1" } })),
  };
}

describe("agent journey smoke script", () => {
  it("skips clearly without a smoke API key", async () => {
    const log = vi.fn();

    await expect(
      runAgentJourneySmoke({ env: {} as unknown as NodeJS.ProcessEnv, log })
    ).resolves.toEqual({ status: "skipped", reason: "missing_api_key" });

    expect(log).toHaveBeenCalledWith(
      "SKIP agent journey smoke: set SMOKE_TEST_API_KEY or MOVINGMANIFEST_API_KEY to run."
    );
  });

  it("prefers the dedicated smoke key over the general API key", () => {
    expect(
      createSmokeApiConfig({
        SMOKE_TEST_API_KEY: "mmk_smoke",
        MOVINGMANIFEST_API_KEY: "mmk_general",
        MOVINGMANIFEST_API_BASE_URL: "https://example.com/api/v1/",
      } as unknown as NodeJS.ProcessEnv)
    ).toEqual({
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_smoke",
    });
  });

  it("detects production smoke targets and requires explicit write confirmation", async () => {
    const log = vi.fn();

    expect(isProductionSmokeTarget("https://movingmanifest.com/api/v1")).toBe(true);
    expect(isProductionSmokeTarget("https://www.movingmanifest.com/api/v1")).toBe(true);
    expect(isProductionSmokeTarget("https://preview.example.com/api/v1")).toBe(false);
    expect(
      productionSmokeWritesAllowed({
        SMOKE_TEST_ALLOW_PRODUCTION_WRITES: "true",
      } as unknown as NodeJS.ProcessEnv)
    ).toBe(true);

    await expect(
      runAgentJourneySmoke({
        env: { SMOKE_TEST_API_KEY: "mmk_smoke" } as unknown as NodeJS.ProcessEnv,
        log,
      })
    ).resolves.toEqual({
      status: "skipped",
      reason: "production_write_confirmation_required",
    });

    expect(log).toHaveBeenCalledWith(
      "SKIP agent journey smoke: https://movingmanifest.com/api/v1 is production. Set SMOKE_TEST_ALLOW_PRODUCTION_WRITES=true only for an approved throwaway production write."
    );
  });

  it("archives the smoke move when a later step fails", async () => {
    const log = vi.fn();
    const api = smokeApi();
    api.batchUpsertItems.mockReset();
    api.batchUpsertItems.mockRejectedValueOnce(new Error("batch failed"));

    await expect(
      runAgentJourneySmoke({
        env: {
          SMOKE_TEST_API_KEY: "mmk_smoke",
          SMOKE_TEST_ALLOW_PRODUCTION_WRITES: "true",
        } as unknown as NodeJS.ProcessEnv,
        now: new Date("2026-06-13T01:00:00.000Z"),
        log,
        api: api as unknown as SmokeApi,
      })
    ).rejects.toThrow("batch failed");

    expect(api.movingManifestRequest).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      {
        method: "PATCH",
        path: "/moves/move1",
        body: { status: "archived" },
      }
    );
  });

  it("rejects a move-scoped key even when moveRestricted is false", async () => {
    const api = smokeApi();
    api.getApiContext.mockResolvedValueOnce(moveScopedSmokeContext());

    await expect(
      runAgentJourneySmoke({
        env: {
          SMOKE_TEST_API_KEY: "mmk_smoke",
          SMOKE_TEST_ALLOW_PRODUCTION_WRITES: "true",
        } as unknown as NodeJS.ProcessEnv,
        api: api as unknown as SmokeApi,
      })
    ).rejects.toThrow(
      "Smoke API key is move-restricted; use a household-scoped smoke key so setup_move can create a throwaway move."
    );

    expect(api.setupMove).not.toHaveBeenCalled();
    expect(api.movingManifestRequest).not.toHaveBeenCalled();
  });

  it("runs the canonical agent journey with synthetic fixtures", async () => {
    const log = vi.fn();
    const api = smokeApi();

    await expect(
      runAgentJourneySmoke({
        env: {
          SMOKE_TEST_API_KEY: "mmk_smoke",
          SMOKE_TEST_ALLOW_PRODUCTION_WRITES: "true",
        } as unknown as NodeJS.ProcessEnv,
        now: new Date("2026-06-13T01:00:00.000Z"),
        log,
        sleep: vi.fn(async () => undefined),
        derivativeTimeoutMs: 100,
        derivativePollMs: 1,
        api: api as unknown as SmokeApi,
      })
    ).resolves.toEqual({ status: "passed", moveId: "move1" });

    expect(api.getApiContext).toHaveBeenCalledWith({
      baseUrl: "https://movingmanifest.com/api/v1",
      apiKey: "mmk_smoke",
    });
    expect(api.setupMove).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        title: "[SMOKE] agent-journey 2026-06-13T01:00:00.000Z",
        updateExisting: false,
        originRooms: ["Garage", "Living Room"],
        destinationRooms: ["Staging"],
        transportResources: [{ type: "truck", name: "Smoke truck" }],
        items: expect.arrayContaining([
          expect.objectContaining({ name: "Smoke folding table" }),
        ]),
      })
    );
    expect(api.batchUpsertItems).toHaveBeenCalledTimes(2);
    expect(api.batchUpsertItems).toHaveBeenNthCalledWith(
      1,
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        items: [
          expect.objectContaining({
            externalSource: "agent-journey-smoke",
            externalId: "20260613T010000000Z-item-01",
          }),
          ...Array.from({ length: 9 }, () => expect.any(Object)),
        ],
      })
    );
    expect(api.uploadEvidenceImage).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        itemId: "item1",
        fileBase64: expect.any(String),
        fileName: "agent-journey-smoke.png",
        mimeType: "image/png",
      })
    );
    expect(api.createBox).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        code: "SMOKE-0000000Z",
        label: "Smoke packed box",
      })
    );
    expect(api.addItemsToBox).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        boxId: "box1",
        items: [
          { itemId: "item1", quantity: 1 },
          { itemId: "item2", quantity: 1 },
          { itemId: "item3", quantity: 1 },
          { itemId: "item4", quantity: 1 },
          { itemId: "item5", quantity: 1 },
        ],
      })
    );
    expect(api.movingManifestRequest).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      {
        method: "PATCH",
        path: "/moves/move1",
        body: { status: "archived" },
      }
    );
  });
});
