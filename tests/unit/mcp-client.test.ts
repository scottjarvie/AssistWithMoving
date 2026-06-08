import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addItemsToBox,
  approvePlanningSuggestions,
  batchUpsertItems,
  applyAssignments,
  archiveMovePerson,
  archiveDocumentationProfile,
  attachPhoto,
  createApiConfig,
  createDocumentationProfile,
  createItem,
  createMove,
  createMovePerson,
  createShareLink,
  createTransportResource,
  createTransportZone,
  deleteItem,
  generatePlanningSuggestions,
  getApiContext,
  getCapacityReport,
  getMoveSummary,
  listDocumentationProfiles,
  listMovePeople,
  listPlanningSuggestions,
  listShareLinks,
  movingManifestRequest,
  removeItemFromBox,
  rejectPlanningSuggestions,
  revokeShareLink,
  searchInventory,
  suggestAssignments,
  updateDocumentationProfile,
  updateMovePerson,
  updateTransportResource,
  updateTransportZone,
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

  it("gets API key context", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          household: { householdId: "household1", name: "Jarvie" },
          apiKey: { scopes: ["moves/read"], moveRestricted: false },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await getApiContext({
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/me"),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
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

  it("creates moves through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          move: { moveId: "move1", title: "PCS move", type: "pcs" },
          planningDefaultCount: 8,
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await createMove(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        title: "PCS move",
        type: "pcs",
        origin: "Utah",
        destination: "Virginia",
        pcsShipmentType: "mixed",
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          title: "PCS move",
          type: "pcs",
          origin: "Utah",
          destination: "Virginia",
          pcsShipmentType: "mixed",
        }),
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

  it("keeps external source keys on item create requests", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { itemId: "item1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await createItem(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        externalSource: "spreadsheet:garage-walkthrough",
        externalId: "row-42",
        name: "Lamp",
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/items"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          moveId: "move1",
          externalSource: "spreadsheet:garage-walkthrough",
          externalId: "row-42",
          name: "Lamp",
        }),
      }
    );
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
        items: [
          {
            externalSource: "spreadsheet:garage-walkthrough",
            externalId: "row-42",
            name: "Lamp",
          },
          { itemId: "item1", status: "packed" },
        ],
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
          items: [
            {
              externalSource: "spreadsheet:garage-walkthrough",
              externalId: "row-42",
              name: "Lamp",
            },
            { itemId: "item1", status: "packed" },
          ],
        }),
      }
    );
  });

  it("fetches capacity reports through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          moveId: "move1",
          totalEstimatedWeightLb: 1200,
          resourceReports: [],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCapacityReport(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { moveId: "move1" }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/capacity-report"),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
    expect(result).toEqual({
      moveId: "move1",
      totalEstimatedWeightLb: 1200,
      resourceReports: [],
    });
  });

  it("lists, creates, updates, and archives move people through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { personId: "person1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    };

    await listMovePeople(config, {
      moveId: "move1",
      includeArchived: true,
      limit: 25,
    });
    await createMovePerson(config, {
      moveId: "move1",
      name: "Transportation Office",
      role: "contact",
      email: "office@example.test",
      notes: "PCS counseling contact",
    });
    await updateMovePerson(config, {
      moveId: "move1",
      personId: "person1",
      phone: "555-0100",
    });
    await archiveMovePerson(config, {
      moveId: "move1",
      personId: "person1",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL(
        "https://example.com/api/v1/moves/move1/people?limit=25&includeArchived=true"
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL("https://example.com/api/v1/moves/move1/people"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          name: "Transportation Office",
          role: "contact",
          email: "office@example.test",
          notes: "PCS counseling contact",
        }),
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL("https://example.com/api/v1/moves/move1/people/person1"),
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({ phone: "555-0100" }),
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      new URL("https://example.com/api/v1/moves/move1/people/person1"),
      {
        method: "DELETE",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "idempotency-key": expect.any(String),
        },
      }
    );
  });

  it("creates transport resources through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { resource: { resourceId: "resource1" } } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await createTransportResource(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        presetKey: "militaryMovers",
        name: "HHG shipment",
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/resources"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          moveId: "move1",
          presetKey: "militaryMovers",
          name: "HHG shipment",
        }),
      }
    );
  });

  it("updates transport resources through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { resourceId: "resource1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await updateTransportResource(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        resourceId: "resource1",
        capacity: { maxWeightLb: 1000 },
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/resources/resource1"),
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          moveId: "move1",
          resourceId: "resource1",
          capacity: { maxWeightLb: 1000 },
        }),
      }
    );
  });

  it("creates and updates transport zones through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { zone: { zoneId: "zone1" } } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    };

    await createTransportZone(config, {
      moveId: "move1",
      resourceId: "resource1",
      name: "Door area",
    });
    await updateTransportZone(config, {
      moveId: "move1",
      zoneId: "zone1",
      preferredTags: ["access soon"],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL("https://example.com/api/v1/moves/move1/zones"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          moveId: "move1",
          resourceId: "resource1",
          name: "Door area",
        }),
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL("https://example.com/api/v1/moves/move1/zones/zone1"),
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          moveId: "move1",
          zoneId: "zone1",
          preferredTags: ["access soon"],
        }),
      }
    );
  });

  it("requests deterministic assignment suggestions from the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          suggestions: [{ boxId: "box1" }],
          counts: { suggestions: 1 },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await suggestAssignments(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { moveId: "move1", limit: 10 }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/assignments/suggest"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({ limit: 10 }),
      }
    );
  });

  it("applies explicit load assignments through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          dryRun: true,
          total: 1,
          succeeded: 1,
          failed: 0,
          results: [],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await applyAssignments(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        dryRun: true,
        assignments: [
          {
            boxId: "box1",
            assignedResourceId: "resource1",
            assignedZoneId: "zone1",
            overrideReason: "Reviewed validation warnings.",
          },
        ],
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/assignments/apply"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          dryRun: true,
          assignments: [
            {
              boxId: "box1",
              assignedResourceId: "resource1",
              assignedZoneId: "zone1",
              overrideReason: "Reviewed validation warnings.",
            },
          ],
        }),
      }
    );
  });

  it("lists, generates, approves, and rejects planning suggestions through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { ok: true } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    };

    await listPlanningSuggestions(config, {
      moveId: "move1",
      status: "pending",
      limit: 20,
    });
    await generatePlanningSuggestions(config, { moveId: "move1" });
    await approvePlanningSuggestions(config, {
      moveId: "move1",
      approvals: [
        {
          suggestionId: "suggestion1",
          estimateDraft: { estimatedWeightLb: 42, weightConfidence: "manual" },
        },
      ],
    });
    await rejectPlanningSuggestions(config, {
      moveId: "move1",
      suggestionIds: ["suggestion2"],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL(
        "https://example.com/api/v1/moves/move1/planning-suggestions?limit=20&status=pending"
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL(
        "https://example.com/api/v1/moves/move1/planning-suggestions/generate"
      ),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({}),
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL(
        "https://example.com/api/v1/moves/move1/planning-suggestions/approve"
      ),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          approvals: [
            {
              suggestionId: "suggestion1",
              estimateDraft: { estimatedWeightLb: 42, weightConfidence: "manual" },
            },
          ],
        }),
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      new URL(
        "https://example.com/api/v1/moves/move1/planning-suggestions/reject"
      ),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({ suggestionIds: ["suggestion2"] }),
      }
    );
  });

  it("assigns items to boxes through the top-level box contents API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { assignmentId: "assignment1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await addItemsToBox(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        boxId: "box1",
        items: [{ itemId: "item1", quantity: 1, notes: "Top tray" }],
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/boxes/box1/items"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          moveId: "move1",
          itemId: "item1",
          quantity: 1,
          notes: "Top tray",
        }),
      }
    );
  });

  it("removes box item assignments through the top-level box contents API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { deleted: true, assignmentId: "assignment1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await removeItemFromBox(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { moveId: "move1", boxId: "box1", itemId: "item1" }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/boxes/box1/items/item1?moveId=move1"),
      {
        method: "DELETE",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "idempotency-key": expect.any(String),
        },
      }
    );
  });

  it("soft-deletes items through the top-level API alias", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { deleted: true, itemId: "item1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteItem(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { moveId: "move1", itemId: "item1" }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/items/item1?moveId=move1"),
      {
        method: "DELETE",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "idempotency-key": expect.any(String),
        },
      }
    );
  });

  it("attaches photo evidence through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          photoId: "photo1",
          itemId: "item1",
          photoType: "condition",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await attachPhoto(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        photoId: "photo1",
        itemId: "item1",
        boxId: "box1",
        photoType: "condition",
        privacyLevel: "reportVisible",
        caption: "Pre-move condition.",
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/photos/photo1/attach"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          moveId: "move1",
          photoId: "photo1",
          itemId: "item1",
          boxId: "box1",
          photoType: "condition",
          privacyLevel: "reportVisible",
          caption: "Pre-move condition.",
        }),
      }
    );
  });

  it("lists, creates, updates, and archives documentation profiles through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { documentationProfileId: "profile1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    };

    await listDocumentationProfiles(config, {
      moveId: "move1",
      status: "active",
      limit: 5,
    });
    await createDocumentationProfile(config, {
      moveId: "move1",
      type: "pcsMove",
      name: "PCS packet",
      includedFields: ["moveSummary", "pcsFields", "items"],
      imageRule: "reviewedEvidence",
      allowedActions: ["view", "download"],
    });
    await updateDocumentationProfile(config, {
      moveId: "move1",
      documentationProfileId: "profile1",
      filters: { statuses: ["damaged", "missing"] },
      allowedActions: ["view", "download", "uploadEvidence"],
    });
    await archiveDocumentationProfile(config, {
      moveId: "move1",
      documentationProfileId: "profile1",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL(
        "https://example.com/api/v1/moves/move1/documentation-profiles?limit=5&status=active"
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL("https://example.com/api/v1/moves/move1/documentation-profiles"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          type: "pcsMove",
          name: "PCS packet",
          includedFields: ["moveSummary", "pcsFields", "items"],
          imageRule: "reviewedEvidence",
          allowedActions: ["view", "download"],
        }),
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL(
        "https://example.com/api/v1/moves/move1/documentation-profiles/profile1"
      ),
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          filters: { statuses: ["damaged", "missing"] },
          allowedActions: ["view", "download", "uploadEvidence"],
        }),
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      new URL(
        "https://example.com/api/v1/moves/move1/documentation-profiles/profile1"
      ),
      {
        method: "DELETE",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "idempotency-key": expect.any(String),
        },
      }
    );
  });

  it("lists, creates, and revokes share links through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { shareLinkId: "share1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    };

    await listShareLinks(config, {
      moveId: "move1",
      status: "active",
      limit: 10,
    });
    await createShareLink(config, {
      moveId: "move1",
      documentationProfileId: "profile1",
      label: "PCS packet",
      role: "guest",
      allowedActions: ["view", "download"],
      expiresAt: 1780876800000,
    });
    await revokeShareLink(config, {
      moveId: "move1",
      shareLinkId: "share1",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL(
        "https://example.com/api/v1/moves/move1/share-links?limit=10&status=active"
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL("https://example.com/api/v1/moves/move1/share-links"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          documentationProfileId: "profile1",
          label: "PCS packet",
          role: "guest",
          allowedActions: ["view", "download"],
          expiresAt: 1780876800000,
        }),
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL("https://example.com/api/v1/moves/move1/share-links/share1"),
      {
        method: "DELETE",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "idempotency-key": expect.any(String),
        },
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
