import { afterEach, describe, expect, it, vi } from "vitest";

import {
  batchUpsertItems,
  createApiConfig,
  createItem,
  getMoveSummary,
  movingManifestRequest,
  searchInventory,
} from "../../mcp-server/movingmanifest-api.mjs";

describe("MovingManifest MCP API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads API config from environment", () => {
    expect(
      createApiConfig({
        MOVINGMANIFEST_API_BASE_URL: "https://example.com/api/v1/",
        MOVINGMANIFEST_API_KEY: "mmk_test_secret",
      } as unknown as NodeJS.ProcessEnv)
    ).toEqual({
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    });
  });

  it("requires an API key", () => {
    expect(() => createApiConfig({} as NodeJS.ProcessEnv)).toThrow(
      "MOVINGMANIFEST_API_KEY is required."
    );
  });

  it("sends bearer auth, JSON bodies, and idempotency keys for writes", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { itemId: "item1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await movingManifestRequest(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        method: "POST",
        path: "/moves/move1/items",
        query: undefined,
        body: { name: "Lamp", skipped: undefined },
        idempotencyKey: "idem1",
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/items"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "idem1",
        },
        body: JSON.stringify({ name: "Lamp" }),
      }
    );
  });

  it("filters inventory search text locally after API filters", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: [
            { itemId: "1", name: "Desk lamp", room: "Office" },
            { itemId: "2", name: "Garden hose", room: "Garage" },
          ],
          page: { limit: 50, nextCursor: null, total: 2 },
        }),
      }))
    );

    const result = await searchInventory(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { moveId: "move1", query: "office" }
    );

    expect(result.data).toEqual([{ itemId: "1", name: "Desk lamp", room: "Office" }]);
  });

  it("fetches move summaries through the compact summary endpoint", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          move: { moveId: "move1", title: "PCS move" },
          counts: { items: 2, boxes: 1 },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getMoveSummary(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { moveId: "move1" }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/summary"),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
    expect(result).toEqual({
      move: { moveId: "move1", title: "PCS move" },
      counts: { items: 2, boxes: 1 },
    });
  });

  it("sends batch item upserts to the API for backend validation", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          dryRun: true,
          total: 2,
          succeeded: 2,
          failed: 0,
          results: [],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await batchUpsertItems(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        dryRun: true,
        items: [{ name: "Lamp" }, { itemId: "item1", status: "packed" }],
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/items/batch-upsert"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          dryRun: true,
          items: [{ name: "Lamp" }, { itemId: "item1", status: "packed" }],
        }),
      }
    );
  });

  it("dry-runs item creation without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await createItem(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { moveId: "move1", name: "Chair", dryRun: true }
    );

    expect(result).toEqual({
      dryRun: true,
      request: {
        path: "/moves/move1/items",
        body: { moveId: "move1", name: "Chair", dryRun: true },
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
