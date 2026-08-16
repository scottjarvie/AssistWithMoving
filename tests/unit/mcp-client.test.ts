import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  addItemFromPhoto,
  addItemsToBox,
  addHouseholdMember,
  approveAiPhotoSuggestions,
  approveAiTextSuggestions,
  approvePlanningSuggestions,
  archiveItem,
  archivePlannedItem,
  batchUpsertItems,
  claimQueueItem,
  applyAssignments,
  archiveMovePerson,
  archiveDocumentationProfile,
  attachPhoto,
  createApiConfig,
  createDocumentationProfile,
  createItem,
  createItemWithImages,
  createMove,
  createMovePerson,
  createPlannedItem,
  createShareLink,
  createTransportResource,
  createTransportZone,
  deleteItem,
  finalizePhotoUpload,
  generateAiPhotoSuggestions,
  generateAiTextSuggestions,
  generatePlanningSuggestions,
  getAiProviderStatus,
  getApiContext,
  getCapacityReport,
  getInlineImages,
  getMoveDayChecklist,
  getMoveQuestions,
  getMoveSummary,
  listHouseholdMembers,
  listAiJobs,
  listAiPhotoSuggestions,
  listAiTextSuggestions,
  listDocumentationProfiles,
  listMovePeople,
  listPlannedItems,
  listPlanningSuggestions,
  listQueueItems,
  listShareLinkComments,
  listShareLinks,
  planApplyOps,
  planGet,
  planProposeOps,
  planSnapshot,
  planSummary,
  plansList,
  assistWithMovingImageDerivativeVariants,
  assistWithMovingRequest,
  convertItemToBox,
  convertPlannedItem,
  removeItemFromBox,
  rejectAiPhotoSuggestions,
  rejectAiTextSuggestions,
  rejectPlanningSuggestions,
  revokeShareLink,
  searchInventory,
  setupMove,
  startPhotoUpload,
  suggestAssignments,
  uploadEvidenceImage,
  uploadEvidenceImages,
  uploadEvidenceFile,
  updateDocumentationProfile,
  updateItem,
  updateMove,
  updateMovePerson,
  updatePlannedItem,
  updateTransportResource,
  updateTransportZone,
} from "../../mcp-server/assistwithmoving-api.mjs";

const derivativeVariantsWithStatus = (status: "pending" | "ready" | "failed") =>
  assistWithMovingImageDerivativeVariants.map((variant) => ({ ...variant, status }));

const localMediaApiConfig = (allowedRoot: string) => ({
  baseUrl: "https://example.com/api/v1",
  apiKey: "mmk_test_secret",
  mediaIngress: {
    transport: "stdio" as const,
    allowedFileRoots: [allowedRoot],
  },
});

describe("Assist With Moving MCP API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads API config from environment", () => {
    expect(
      createApiConfig({
        ASSISTWITHMOVING_API_BASE_URL: "https://example.com/api/v1/",
        ASSISTWITHMOVING_API_KEY: "mmk_test_secret",
      } as unknown as NodeJS.ProcessEnv)
    ).toEqual({
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
      mediaIngress: {
        transport: "stdio",
        allowedFileRoots: [],
      },
    });
  });

  it("requires an API key", () => {
    expect(() => createApiConfig({} as NodeJS.ProcessEnv)).toThrow(
      "ASSISTWITHMOVING_API_KEY is required."
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

  it("lists and adds household members through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const config = {
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    };
    await listHouseholdMembers(config, { householdId: "household1" });
    await addHouseholdMember(config, {
      householdId: "household1",
      email: "person@example.com",
      role: "editor",
      idempotencyKey: "add-member-1",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL("https://example.com/api/v1/households/household1/members"),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL("https://example.com/api/v1/households/household1/members"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "add-member-1",
        },
        body: JSON.stringify({ email: "person@example.com", role: "editor" }),
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

    await assistWithMovingRequest(
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

  it("lists and claims canonical Queue items through the bounded REST contract", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    };

    await listQueueItems(config, {
      moveId: "move1",
      state: "waitingForAi",
      ownerUserId: "user1",
      limit: 25,
      cursor: "opaque-queue-cursor",
    });
    await claimQueueItem(config, {
      moveId: "move1",
      queueItemId: "queue1",
      expectedVersion: 7,
      idempotencyKey: "claim-queue1-v7",
      nextStep: "Review the room inventory and return a durable result.",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL(
        "https://example.com/api/v1/moves/move1/queue?state=waitingForAi&ownerUserId=user1&limit=25&cursor=opaque-queue-cursor"
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL("https://example.com/api/v1/moves/move1/queue/queue1/claim"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "claim-queue1-v7",
        },
        body: JSON.stringify({
          expectedVersion: 7,
          nextStep: "Review the room inventory and return a durable result.",
        }),
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

  it("sets up moves through the one-call setup endpoint", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          action: "create",
          move: { moveId: "move1", title: "Nashua NH to Tucson AZ Move" },
          setupResults: { resources: [], items: [] },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await setupMove(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        title: "Nashua NH to Tucson AZ Move",
        originRooms: ["Garage", "Kitchen"],
        transportResources: [{ presetKey: "pickupTruck", name: "Ram truck" }],
        items: [
          {
            externalSource: "agent:photo-walkthrough",
            externalId: "photo-1-table",
            name: "Dark wood dining table set with 4 chairs",
            weightConfidence: "estimated",
            measurementProvenance: {
              dimensions: {
                sourceType: "photoEstimate",
                confidence: "estimated",
                label: "Photo 1",
                recordedByLabel: "Codex",
                needsVerification: true,
              },
            },
          },
        ],
        idempotencyKey: "setup1",
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/setup"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "setup1",
        },
        body: JSON.stringify({
          title: "Nashua NH to Tucson AZ Move",
          originRooms: ["Garage", "Kitchen"],
          transportResources: [{ presetKey: "pickupTruck", name: "Ram truck" }],
          items: [
            {
              externalSource: "agent:photo-walkthrough",
              externalId: "photo-1-table",
              name: "Dark wood dining table set with 4 chairs",
              weightConfidence: "estimated",
              measurementProvenance: {
                dimensions: {
                  sourceType: "photoEstimate",
                  confidence: "estimated",
                  label: "Photo 1",
                  recordedByLabel: "Codex",
                  needsVerification: true,
                },
              },
            },
          ],
        }),
      }
    );
  });

  it("updates moves through the API and preserves null notes clears", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { moveId: "move1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await updateMove(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        title: undefined,
        notes: null,
        distanceMiles: null,
        idempotencyKey: "update-move-1",
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1"),
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "update-move-1",
        },
        body: JSON.stringify({
          notes: null,
          distanceMiles: null,
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

  it("fetches move questions through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          move: { moveId: "move1", title: "PCS move", type: "pcs" },
          topPrompts: [
            {
              key: "pcs-orders-allowance",
              category: "pcs",
              severity: "critical",
              title: "Orders and allowance",
              count: 2,
            },
          ],
          counts: { openPrompts: 1, critical: 1 },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getMoveQuestions(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { moveId: "move1" }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/questions"),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
    expect(result).toEqual({
      move: { moveId: "move1", title: "PCS move", type: "pcs" },
      topPrompts: [
        {
          key: "pcs-orders-allowance",
          category: "pcs",
          severity: "critical",
          title: "Orders and allowance",
          count: 2,
        },
      ],
      counts: { openPrompts: 1, critical: 1 },
    });
  });

  it("lists and reads floor plans through top-level plan endpoints", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { planId: "plan1", name: "Destination" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await plansList(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { moveId: "move1", limit: 10 }
    );
    await planGet(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { planId: "plan1", moveId: "move1" }
    );
    await planSummary(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { planId: "plan1", moveId: "move1" }
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL("https://example.com/api/v1/plans?moveId=move1&limit=10"),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL("https://example.com/api/v1/plans/plan1?moveId=move1"),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL("https://example.com/api/v1/plans/plan1/summary?moveId=move1"),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
  });

  it("supports dry-run and idempotent floor plan op writes", async () => {
    const ops = [
      {
        type: "updatePlanSettings",
        patch: { name: "Updated destination plan" },
      },
    ];
    const dryRun = await planProposeOps(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        planId: "plan1",
        moveId: "move1",
        batchId: "batch1",
        ops,
        reasoning: "Rename the plan for clarity.",
        dryRun: true,
      }
    );

    expect(dryRun).toEqual({
      dryRun: true,
      request: {
        method: "POST",
        path: "/plans/plan1/proposals",
        query: { moveId: "move1" },
        body: {
          batchId: "batch1",
          ops,
          agentLabel: undefined,
          reasoning: "Rename the plan for clarity.",
        },
      },
    });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { batchId: "batch1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await planApplyOps(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        planId: "plan1",
        moveId: "move1",
        batchId: "batch1",
        ops,
        agentLabel: "Codex test",
        idempotencyKey: "plan-ops-1",
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/plans/plan1/ops?moveId=move1"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "plan-ops-1",
        },
        body: JSON.stringify({
          batchId: "batch1",
          ops,
          agentLabel: "Codex test",
        }),
      }
    );
  });

  it("returns floor plan SVG snapshots as text", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "image/svg+xml; charset=utf-8" }),
      text: async () => "<svg><title>Main floor</title></svg>",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await planSnapshot(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { planId: "plan1", moveId: "move1", levelId: "level1" }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://example.com/api/v1/plans/plan1/snapshot.svg?moveId=move1&level=level1"
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
    expect(result).toBe("<svg><title>Main floor</title></svg>");
  });

  it("fetches the Move Day checklist through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          move: { moveId: "move1", title: "PCS move", type: "pcs" },
          filter: { mode: "ready", query: "truck" },
          counts: { totalBoxes: 2, filteredBoxes: 1 },
          checklist: [
            {
              boxId: "box1",
              code: "B-001",
              status: "staged",
              itemCount: 4,
              assignedResourceName: "Rental truck",
            },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getMoveDayChecklist(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { moveId: "move1", filter: "ready", query: "truck", limit: 20 }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://example.com/api/v1/moves/move1/move-day?filter=ready&query=truck&limit=20"
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
    expect(result.checklist).toEqual([
      expect.objectContaining({
        boxId: "box1",
        code: "B-001",
        assignedResourceName: "Rental truck",
      }),
    ]);
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

  it("creates an item and uploads attached images through one MCP helper", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "assistwithmoving-mcp-"));
    const filePath = path.join(tempDir, "red-toolbox.png");
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAADZrBkAAAAADUlEQVR42mP8z8BQDwAFgwJ/lpQqNwAAAABJRU5ErkJggg==",
      "base64"
    );
    await writeFile(filePath, pngBytes);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: { itemId: "item1", name: "Red toolbox", quantity: 1 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: {
            photoId: "photo1",
            uploadSessionId: "session1",
            derivativeStatus: "ready",
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(
        createItemWithImages(
          localMediaApiConfig(tempDir),
          {
            moveId: "move1",
            name: "Red toolbox",
            room: "Garage",
            category: "Tools",
            idempotencyKey: "toolbox-intake",
            images: [
              {
                filePath,
                caption: "Red toolbox on garage shelf",
                confidence: "medium",
              },
            ],
            photoDefaults: {
              photoType: "item",
              privacyLevel: "normal",
              notes: "Quantity defaults to one because the user did not mention a count.",
            },
          }
        )
      ).resolves.toMatchObject({
        itemId: "item1",
        imageCount: 1,
        uploadedCount: 1,
        failedCount: 0,
        photoIds: ["photo1"],
        agentReview: {
          userFacingSummary:
            'Created "Red toolbox" with quantity 1 and uploaded 1 image attached to the item.',
          item: {
            itemId: "item1",
            name: "Red toolbox",
            room: "Garage",
            category: "Tools",
            quantity: 1,
            quantityDefaulted: true,
          },
          photoIds: ["photo1"],
          failedImageCount: 0,
          correctionPrompt: expect.stringContaining("correct only the parts"),
        },
        images: {
          agentReview: {
            userFacingSummary: "Uploaded 1 image evidence file.",
          },
          results: [
            {
              ok: true,
              photoId: "photo1",
              derivativeStatus: "ready",
              derivativeVariants: derivativeVariantsWithStatus("ready"),
              agentReview: {
                decisions: {
                  attachmentTarget: {
                    type: "item",
                    id: "item1",
                    label: "item item1",
                  },
                  caption: "Red toolbox on garage shelf",
                  photoType: "item",
                  privacyLevel: "normal",
                  visibilityScope: "moveCollaborators",
                  confidence: "medium",
                  verificationStatus: "unreviewed",
                },
              },
            },
          ],
        },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL("https://example.com/api/v1/moves/move1/items"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "toolbox-intake-item",
        },
        body: JSON.stringify({
          moveId: "move1",
          name: "Red toolbox",
          room: "Garage",
          category: "Tools",
          quantity: 1,
        }),
      }
    );

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[1] as unknown as [
      URL,
      { headers: Record<string, string>; body: Buffer },
    ];
    expect(uploadUrl.pathname).toBe("/api/v1/photos/upload");
    expect(Object.fromEntries(uploadUrl.searchParams)).toMatchObject({
      moveId: "move1",
      itemId: "item1",
      fileName: "red-toolbox.png",
      mimeType: "image/png",
      room: "Garage",
      caption: "Red toolbox on garage shelf",
      photoType: "item",
      privacyLevel: "normal",
      source: "mcp",
      exifHandlingStatus: "pending",
      confidence: "medium",
      notes: "Quantity defaults to one because the user did not mention a count.",
    });
    expect(uploadInit).toEqual({
      method: "POST",
      headers: {
        authorization: "Bearer mmk_test_secret",
        "content-type": "image/png",
        "content-length": String(pngBytes.length),
        "x-assistwithmoving-file-name": "red-toolbox.png",
        "idempotency-key": "toolbox-intake-image-1",
      },
      body: pngBytes,
    });
  });

  it("adds a household item from one photo through the plain MCP helper", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "assistwithmoving-mcp-"));
    const filePath = path.join(tempDir, "desk-lamp.png");
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAADZrBkAAAAADUlEQVR42mP8z8BQDwAFgwJ/lpQqNwAAAABJRU5ErkJggg==",
      "base64"
    );
    await writeFile(filePath, pngBytes);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: { itemId: "item-lamp", name: "Desk lamp", quantity: 1 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: {
            photoId: "photo-lamp",
            uploadSessionId: "session-lamp",
            derivativeStatus: "ready",
            media: {
              source: "filePath",
              fileName: "desk-lamp.png",
              mimeType: "image/png",
              sizeBytes: pngBytes.length,
              width: 2,
              height: 3,
            },
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(
        addItemFromPhoto(
          localMediaApiConfig(tempDir),
          {
            moveId: "move1",
            name: "Desk lamp",
            room: "Office",
            category: "Lighting",
            filePath,
            confidence: "medium",
            generateAiSuggestions: true,
            idempotencyKey: "desk-lamp-photo",
          }
        )
      ).resolves.toMatchObject({
        itemId: "item-lamp",
        imageCount: 1,
        uploadedCount: 1,
        photoIds: ["photo-lamp"],
        agentReview: {
          item: {
            itemId: "item-lamp",
            name: "Desk lamp",
            room: "Office",
            category: "Lighting",
            quantity: 1,
            quantityDefaulted: true,
          },
          correctionPrompt: expect.stringContaining("correct only the parts"),
        },
        images: {
          results: [
            {
              ok: true,
              photoId: "photo-lamp",
              agentReview: {
                decisions: {
                  attachmentTarget: {
                    type: "item",
                    id: "item-lamp",
                    label: "item item-lamp",
                  },
                  caption: "Desk lamp",
                  photoType: "item",
                  privacyLevel: "normal",
                  visibilityScope: "moveCollaborators",
                  confidence: "medium",
                  generateAiSuggestions: true,
                },
              },
            },
          ],
        },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL("https://example.com/api/v1/moves/move1/items"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "desk-lamp-photo-item",
        },
        body: JSON.stringify({
          moveId: "move1",
          name: "Desk lamp",
          room: "Office",
          category: "Lighting",
          quantity: 1,
        }),
      }
    );

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[1] as unknown as [
      URL,
      { headers: Record<string, string>; body: Buffer },
    ];
    const uploadQuery = Object.fromEntries(uploadUrl.searchParams);
    expect(uploadUrl.pathname).toBe("/api/v1/photos/upload");
    expect(uploadQuery).toMatchObject({
      moveId: "move1",
      itemId: "item-lamp",
      fileName: "desk-lamp.png",
      mimeType: "image/png",
      room: "Office",
      caption: "Desk lamp",
      photoType: "item",
      source: "mcp",
      exifHandlingStatus: "pending",
      confidence: "medium",
      generateAiSuggestions: "true",
    });
    expect(uploadQuery).not.toHaveProperty("estimatedWeightLb");
    expect(uploadQuery).not.toHaveProperty("dimensionsIn");
    expect(uploadQuery).not.toHaveProperty("disposition");
    expect(uploadQuery).not.toHaveProperty("condition");
    expect(uploadInit).toEqual({
      method: "POST",
      headers: {
        authorization: "Bearer mmk_test_secret",
        "content-type": "image/png",
        "content-length": String(pngBytes.length),
        "x-assistwithmoving-file-name": "desk-lamp.png",
        "idempotency-key": "desk-lamp-photo-image-1",
      },
      body: pngBytes,
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
        capacityReviewStatus: "confirmed",
        capacityNotes: "Confirmed from rental agreement.",
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
          capacityReviewStatus: "confirmed",
          capacityNotes: "Confirmed from rental agreement.",
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

  it("lists AI job and intake review queues through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    };

    await listAiJobs(config, {
      moveId: "move1",
      status: "succeeded",
      limit: 5,
    });
    await listAiTextSuggestions(config, {
      moveId: "move1",
      status: "pending",
      limit: 10,
    });
    await listAiPhotoSuggestions(config, {
      moveId: "move1",
      status: "rejected",
      limit: 15,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL("https://example.com/api/v1/moves/move1/ai-jobs?limit=5&status=succeeded"),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL(
        "https://example.com/api/v1/moves/move1/ai-text-suggestions?limit=10&status=pending"
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL(
        "https://example.com/api/v1/moves/move1/ai-photo-suggestions?limit=15&status=rejected"
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
  });

  it("fetches safe AI provider status through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          defaultProvider: "openai",
          defaultModel: "gpt-5-mini",
          openai: {
            configured: true,
            defaultModel: "gpt-5-mini",
          },
          generatedAt: 123,
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getAiProviderStatus(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { moveId: "move1" }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/ai-jobs/provider-status"),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
    expect(result).toEqual({
      defaultProvider: "openai",
      defaultModel: "gpt-5-mini",
      openai: {
        configured: true,
        defaultModel: "gpt-5-mini",
      },
      generatedAt: 123,
    });
  });

  it("generates AI intake suggestions through review-queue endpoints", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { aiJobId: "job1", suggestionIds: [] } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    };

    await generateAiTextSuggestions(config, {
      moveId: "move1",
      sourceText: "Garage: red toolbox, two bikes",
    });
    await generateAiPhotoSuggestions(config, {
      moveId: "move1",
      photoIds: ["photo1", "photo2"],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL("https://example.com/api/v1/moves/move1/ai-text-suggestions/generate"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({ sourceText: "Garage: red toolbox, two bikes" }),
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL("https://example.com/api/v1/moves/move1/ai-photo-suggestions/generate"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({ photoIds: ["photo1", "photo2"] }),
      }
    );
  });

  it("approves and rejects AI intake suggestions through exact review endpoints", async () => {
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

    await approveAiTextSuggestions(config, {
      moveId: "move1",
      dryRun: true,
      approvals: [
        {
          suggestionId: "textSuggestion1",
          itemDraft: {
            name: "Coffee mugs",
            room: "Kitchen",
            destinationRoom: "Kitchen",
            disposition: "mover",
            quantity: 8,
            suggestedBoxLabel: "Kitchen fragile",
          },
        },
      ],
    });
    await rejectAiTextSuggestions(config, {
      moveId: "move1",
      suggestionIds: ["textSuggestion2"],
    });
    await approveAiPhotoSuggestions(config, {
      moveId: "move1",
      dryRun: true,
      approvals: [
        {
          suggestionId: "photoSuggestion1",
          boxDraft: {
            label: "Garage shelf",
            room: "Garage",
          },
        },
      ],
    });
    await rejectAiPhotoSuggestions(config, {
      moveId: "move1",
      suggestionIds: ["photoSuggestion2"],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL("https://example.com/api/v1/moves/move1/ai-text-suggestions/approve"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          dryRun: true,
          approvals: [
            {
              suggestionId: "textSuggestion1",
              itemDraft: {
                name: "Coffee mugs",
                room: "Kitchen",
                destinationRoom: "Kitchen",
                disposition: "mover",
                quantity: 8,
                suggestedBoxLabel: "Kitchen fragile",
              },
            },
          ],
        }),
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL("https://example.com/api/v1/moves/move1/ai-text-suggestions/reject"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({ suggestionIds: ["textSuggestion2"] }),
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL("https://example.com/api/v1/moves/move1/ai-photo-suggestions/approve"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          dryRun: true,
          approvals: [
            {
              suggestionId: "photoSuggestion1",
              boxDraft: {
                label: "Garage shelf",
                room: "Garage",
              },
            },
          ],
        }),
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      new URL("https://example.com/api/v1/moves/move1/ai-photo-suggestions/reject"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({ suggestionIds: ["photoSuggestion2"] }),
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

  it("archives items through the stdio alias", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { deleted: true, itemId: "item1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await archiveItem(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { moveId: "move1", itemId: "item1" }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/items/item1?moveId=move1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("converts a mistaken container item into a box through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { boxId: "box1", itemId: "item1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await convertItemToBox(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { moveId: "move1", itemId: "item1", containerType: "plasticTote" }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/items/item1/convert-to-box?moveId=move1"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({ containerType: "plasticTote" }),
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

  it("finalizes photo uploads through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          photoId: "photo1",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await finalizePhotoUpload(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        uploadSessionId: "session1",
        width: 1600,
        height: 1200,
        caption: "Pre-move condition.",
        photoType: "condition",
        privacyLevel: "reportVisible",
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/photos/finalize"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          moveId: "move1",
          uploadSessionId: "session1",
          width: 1600,
          height: 1200,
          caption: "Pre-move condition.",
          photoType: "condition",
          privacyLevel: "reportVisible",
        }),
      }
    );
  });

  it("starts photo uploads with derivative descriptors", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          uploadSessionId: "session1",
          derivativeUploads: [
            { variant: "card", uploadUrl: "https://b2.test/card" },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await startPhotoUpload(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        itemId: "item1",
        mimeType: "image/jpeg",
        sizeBytes: 123456,
        derivatives: [
          {
            variant: "card",
            mimeType: "image/webp",
            sizeBytes: 32768,
            width: 960,
            height: 720,
          },
        ],
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/uploads/init"),
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
          mimeType: "image/jpeg",
          sizeBytes: 123456,
          derivatives: [
            {
              variant: "card",
              mimeType: "image/webp",
              sizeBytes: 32768,
              width: 960,
              height: 720,
            },
          ],
        }),
      }
    );
  });

  it("starts audio evidence uploads without derivatives through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          uploadSessionId: "session-audio",
          derivativeUploads: [],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await startPhotoUpload(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        mimeType: "audio/mpeg",
        sizeBytes: 123456,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/uploads/init"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          moveId: "move1",
          mimeType: "audio/mpeg",
          sizeBytes: 123456,
        }),
      }
    );
  });

  it("uploads a local evidence file through the convenience MCP helper", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "assistwithmoving-mcp-"));
    const filePath = path.join(tempDir, "garage-shelf.png");
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAADZrBkAAAAADUlEQVR42mP8z8BQDwAFgwJ/lpQqNwAAAABJRU5ErkJggg==",
      "base64"
    );
    await writeFile(filePath, pngBytes);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: {
            uploadSessionId: "session1",
            uploadUrl: "https://b2.test/original",
            headers: { "Content-Type": "image/png" },
            derivativeUploads: [],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: { photoId: "photo1", derivativeStatus: "ready" },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(
        uploadEvidenceFile(
          localMediaApiConfig(tempDir),
          {
            moveId: "move1",
            filePath,
            room: "Garage",
            caption: "Garage shelf before packing",
            photoType: "room",
            privacyLevel: "normal",
            visibilityScope: "moveCollaborators",
          }
        )
      ).resolves.toMatchObject({
        photoId: "photo1",
        uploadSessionId: "session1",
        derivativeStatus: "ready",
        derivativeNote: expect.stringContaining("web-ready image derivatives"),
        derivativeVariants: derivativeVariantsWithStatus("ready"),
        media: {
          fileName: "garage-shelf.png",
          mimeType: "image/png",
          sizeBytes: pngBytes.length,
          width: 2,
          height: 3,
        },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL("https://example.com/api/v1/uploads/init"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          moveId: "move1",
          room: "Garage",
          mimeType: "image/png",
          sizeBytes: pngBytes.length,
        }),
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://b2.test/original", {
      method: "PUT",
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(pngBytes.length),
      },
      body: pngBytes,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL("https://example.com/api/v1/photos/finalize"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        }),
      })
    );
    const finalizeBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(finalizeBody).toMatchObject({
      moveId: "move1",
      width: 2,
      height: 3,
      originalHash: expect.any(String),
      caption: "Garage shelf before packing",
      photoType: "room",
      privacyLevel: "normal",
      visibilityScope: "moveCollaborators",
      source: "mcp",
      exifHandlingStatus: "pending",
      uploadSessionId: "session1",
    });
  });

  it("uploads an image through the one-call MCP image helper", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          photoId: "photo1",
          uploadSessionId: "session1",
          derivativeStatus: "ready",
          aiReview: {
            status: "queued",
            suggestionIds: ["suggestion1"],
          },
          media: {
            source: "sourceUrl",
            fileName: "garage-shelf.jpg",
            mimeType: "image/jpeg",
            sizeBytes: 123456,
            width: 1600,
            height: 1200,
          },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadEvidenceImage(
        { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
        {
          moveId: "move1",
          sourceUrl: "https://images.test/garage-shelf.jpg",
          room: "Garage",
          caption: "Garage shelf before packing",
          photoType: "room",
          privacyLevel: "normal",
          visibilityScope: "moveCollaborators",
          generateAiSuggestions: true,
          idempotencyKey: "upload-image-1",
        }
      )
    ).resolves.toMatchObject({
      photoId: "photo1",
      uploadSessionId: "session1",
      derivativeStatus: "ready",
      derivativeNote: expect.stringContaining("web-ready image derivatives"),
      derivativeVariants: derivativeVariantsWithStatus("ready"),
      aiReview: {
        status: "queued",
        suggestionIds: ["suggestion1"],
      },
      agentReview: {
        userFacingSummary: expect.stringContaining("for room Garage"),
        decisions: {
          attachmentTarget: {
            type: "room",
            label: "room Garage",
            room: "Garage",
          },
          caption: "Garage shelf before packing",
          photoType: "room",
          privacyLevel: "normal",
          visibilityScope: "moveCollaborators",
          source: "mcp",
          verificationStatus: "unreviewed",
          generateAiSuggestions: true,
        },
        aiReviewStatus: "queued",
        correctionPrompt: expect.stringContaining("correct the caption"),
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/photos/upload"),
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "upload-image-1",
        },
      })
    );
    const sourceUploadCall = fetchMock.mock.calls[0] as unknown as [
      URL,
      { body: string },
    ];
    expect(JSON.parse(sourceUploadCall[1].body)).toEqual({
      moveId: "move1",
      sourceUrl: "https://images.test/garage-shelf.jpg",
      room: "Garage",
      caption: "Garage shelf before packing",
      photoType: "room",
      privacyLevel: "normal",
      visibilityScope: "moveCollaborators",
      source: "mcp",
      exifHandlingStatus: "pending",
      generateAiSuggestions: true,
    });
  });

  it("rejects ambiguous one-call image upload sources", async () => {
    await expect(
      uploadEvidenceImage(
        { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
        {
          moveId: "move1",
          sourceUrl: "https://images.test/garage-shelf.jpg",
          fileBase64: "iVBORw0KGgo=",
          mimeType: "image/png",
        }
      )
    ).rejects.toThrow(
      "Provide exactly one of filePath, sourceUrl, dataUrl, or fileBase64."
    );
  });

  it("uploads a local image through the one-call MCP image helper", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "assistwithmoving-mcp-"));
    const filePath = path.join(tempDir, "closet-bin.png");
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAADZrBkAAAAADUlEQVR42mP8z8BQDwAFgwJ/lpQqNwAAAABJRU5ErkJggg==",
      "base64"
    );
    await writeFile(filePath, pngBytes);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          photoId: "photo-local",
          uploadSessionId: "session-local",
          derivativeStatus: "ready",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(
        uploadEvidenceImage(
          localMediaApiConfig(tempDir),
          {
            moveId: "move1",
            filePath,
            room: "Closet",
            caption: "Closet bin before packing",
            photoType: "item",
            generateAiSuggestions: true,
            idempotencyKey: "local-image-1",
          }
        )
      ).resolves.toMatchObject({
        photoId: "photo-local",
        uploadSessionId: "session-local",
        derivativeStatus: "ready",
        derivativeNote: expect.stringContaining("web-ready image derivatives"),
        derivativeVariants: derivativeVariantsWithStatus("ready"),
        agentReview: {
          userFacingSummary: expect.stringContaining("for room Closet"),
          decisions: {
            attachmentTarget: {
              type: "room",
              label: "room Closet",
              room: "Closet",
            },
            caption: "Closet bin before packing",
            photoType: "item",
            privacyLevel: "normal",
            visibilityScope: "moveCollaborators",
            source: "mcp",
            verificationStatus: "unreviewed",
            generateAiSuggestions: true,
          },
          media: {
            source: "filePath",
            fileName: "closet-bin.png",
            mimeType: "image/png",
            sizeBytes: pngBytes.length,
          },
        },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      {
        method: string;
        headers: Record<string, string>;
        body: Buffer;
      },
    ];
    expect(url).toBeInstanceOf(URL);
    expect(url.pathname).toBe("/api/v1/photos/upload");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      moveId: "move1",
      fileName: "closet-bin.png",
      mimeType: "image/png",
      room: "Closet",
      caption: "Closet bin before packing",
      photoType: "item",
      source: "mcp",
      exifHandlingStatus: "pending",
      generateAiSuggestions: "true",
    });
    expect(init).toEqual({
      method: "POST",
      headers: {
        authorization: "Bearer mmk_test_secret",
        "content-type": "image/png",
        "content-length": String(pngBytes.length),
        "x-assistwithmoving-file-name": "closet-bin.png",
        "idempotency-key": "local-image-1",
      },
      body: pngBytes,
    });
  });

  it("uploads multiple local images through the batch MCP image helper", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "assistwithmoving-mcp-"));
    const firstPath = path.join(tempDir, "garage-shelf.png");
    const secondPath = path.join(tempDir, "garage-workbench.png");
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAADZrBkAAAAADUlEQVR42mP8z8BQDwAFgwJ/lpQqNwAAAABJRU5ErkJggg==",
      "base64"
    );
    await writeFile(firstPath, pngBytes);
    await writeFile(secondPath, pngBytes);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: {
            photoId: "photo-shelf",
            uploadSessionId: "session-shelf",
            derivativeStatus: "ready",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: {
            photoId: "photo-workbench",
            uploadSessionId: "session-workbench",
            derivativeStatus: "pending",
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(
        uploadEvidenceImages(
          localMediaApiConfig(tempDir),
          {
            moveId: "move1",
            room: "Garage",
            photoType: "room",
            privacyLevel: "normal",
            idempotencyKey: "garage-photo-batch",
            images: [
              {
                filePath: firstPath,
                caption: "Garage shelf before packing",
              },
              {
                filePath: secondPath,
                caption: "Garage workbench before packing",
                room: "Garage workbench",
              },
            ],
          }
        )
      ).resolves.toMatchObject({
        imageCount: 2,
        uploadedCount: 2,
        failedCount: 0,
        derivativeNote: expect.stringContaining("one original upload"),
        derivativeVariants: derivativeVariantsWithStatus("pending"),
        agentReview: {
          userFacingSummary: "Uploaded 2 image evidence files.",
          defaultDecisions: {
            attachmentTarget: {
              type: "room",
              label: "room Garage",
              room: "Garage",
            },
            room: "Garage",
            photoType: "room",
            privacyLevel: "normal",
          },
          imageCount: 2,
          uploadedCount: 2,
          failedCount: 0,
        },
        results: [
          {
            index: 0,
            ok: true,
            photoId: "photo-shelf",
            uploadSessionId: "session-shelf",
            derivativeStatus: "ready",
            derivativeVariants: derivativeVariantsWithStatus("ready"),
            agentReview: {
              decisions: {
                caption: "Garage shelf before packing",
                room: "Garage",
              },
            },
          },
          {
            index: 1,
            ok: true,
            photoId: "photo-workbench",
            uploadSessionId: "session-workbench",
            derivativeStatus: "pending",
            derivativeVariants: derivativeVariantsWithStatus("pending"),
            agentReview: {
              decisions: {
                caption: "Garage workbench before packing",
                room: "Garage workbench",
              },
            },
          },
        ],
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = fetchMock.mock.calls[0] as unknown as [
      URL,
      { headers: Record<string, string>; body: Buffer },
    ];
    const [secondUrl, secondInit] = fetchMock.mock.calls[1] as unknown as [
      URL,
      { headers: Record<string, string>; body: Buffer },
    ];

    expect(firstUrl.pathname).toBe("/api/v1/photos/upload");
    expect(Object.fromEntries(firstUrl.searchParams)).toMatchObject({
      moveId: "move1",
      fileName: "garage-shelf.png",
      mimeType: "image/png",
      room: "Garage",
      caption: "Garage shelf before packing",
      photoType: "room",
      privacyLevel: "normal",
      source: "mcp",
      exifHandlingStatus: "pending",
    });
    expect(firstInit.headers["idempotency-key"]).toBe("garage-photo-batch-1");
    expect(firstInit.body).toEqual(pngBytes);

    expect(secondUrl.pathname).toBe("/api/v1/photos/upload");
    expect(Object.fromEntries(secondUrl.searchParams)).toMatchObject({
      moveId: "move1",
      fileName: "garage-workbench.png",
      mimeType: "image/png",
      room: "Garage workbench",
      caption: "Garage workbench before packing",
      photoType: "room",
      privacyLevel: "normal",
      source: "mcp",
      exifHandlingStatus: "pending",
    });
    expect(secondInit.headers["idempotency-key"]).toBe("garage-photo-batch-2");
    expect(secondInit.body).toEqual(pngBytes);
  });

  it("keeps one-call image upload dry runs free of image bytes", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "assistwithmoving-mcp-"));
    const filePath = path.join(tempDir, "entry-table.png");
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAADZrBkAAAAADUlEQVR42mP8z8BQDwAFgwJ/lpQqNwAAAABJRU5ErkJggg==",
      "base64"
    );
    await writeFile(filePath, pngBytes);

    try {
      const result = await uploadEvidenceImage(
        localMediaApiConfig(tempDir),
        {
          moveId: "move1",
          filePath,
          room: "Entry",
          caption: "Entry table before packing",
          dryRun: true,
        }
      );

      expect(result).toMatchObject({
        dryRun: true,
        media: {
          source: "filePath",
          fileName: "entry-table.png",
          mimeType: "image/png",
          sizeBytes: pngBytes.length,
        },
        request: {
          method: "POST",
          path: "/photos/upload",
          query: {
            moveId: "move1",
            fileName: "entry-table.png",
            mimeType: "image/png",
            room: "Entry",
            caption: "Entry table before packing",
            source: "mcp",
            exifHandlingStatus: "pending",
          },
          headers: {
            "Content-Type": "image/png",
            "X-AssistWithMoving-File-Name": "entry-table.png",
          },
          note: expect.stringContaining("does not upload image bytes"),
        },
        derivativeVariants: derivativeVariantsWithStatus("pending"),
        agentReview: {
          userFacingSummary: expect.stringContaining("Prepared image upload"),
          decisions: {
            attachmentTarget: {
              type: "room",
              label: "room Entry",
              room: "Entry",
            },
            caption: "Entry table before packing",
            photoType: "room",
            privacyLevel: "normal",
            visibilityScope: "moveCollaborators",
            source: "mcp",
            verificationStatus: "unreviewed",
          },
          derivativeVariants: derivativeVariantsWithStatus("pending"),
          correctionPrompt: expect.stringContaining("correct the caption"),
        },
      });
      expect(JSON.stringify(result)).not.toContain(pngBytes.toString("base64"));
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
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

  it("lists share-link recipient comments through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: [
          {
            commentId: "comment1",
            shareLinkId: "share1",
            profileName: "PCS packet",
            authorLabel: "Transportation office",
            body: "Please add the pro gear estimate.",
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    };

    await listShareLinkComments(config, {
      moveId: "move1",
      documentationProfileId: "profile1",
      limit: 10,
    });
    await listShareLinkComments(config, {
      moveId: "move1",
      shareLinkId: "share1",
      limit: 5,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL(
        "https://example.com/api/v1/moves/move1/share-links/comments?limit=10&documentationProfileId=profile1"
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL(
        "https://example.com/api/v1/moves/move1/share-links/share1/comments?limit=5"
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
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
        method: "POST",
        path: "/moves/move1/items",
        body: { moveId: "move1", name: "Chair", dryRun: true },
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("manages planned items through move-scoped endpoints", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    };

    await listPlannedItems(config, {
      moveId: "move1",
      query: "sofa",
      includeArchived: true,
      limit: 25,
    });
    await createPlannedItem(config, {
      moveId: "move1",
      name: "Future sofa",
      dimensionsIn: { lengthIn: 84, widthIn: 36 },
      dimensionsConfidence: "medium",
      estimatedPriceCents: 120000,
    });
    await updatePlannedItem(config, {
      moveId: "move1",
      plannedItemId: "planned1",
      status: "decided",
    });
    await convertPlannedItem(config, {
      moveId: "move1",
      plannedItemId: "planned1",
    });
    await archivePlannedItem(config, {
      moveId: "move1",
      plannedItemId: "planned2",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL(
        "https://example.com/api/v1/moves/move1/planned-items?limit=25&includeArchived=true"
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL("https://example.com/api/v1/moves/move1/planned-items"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          moveId: "move1",
          name: "Future sofa",
          dimensionsIn: { lengthIn: 84, widthIn: 36 },
          dimensionsConfidence: "medium",
          estimatedPriceCents: 120000,
        }),
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL("https://example.com/api/v1/moves/move1/planned-items/planned1"),
      expect.objectContaining({ method: "PATCH" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      new URL(
        "https://example.com/api/v1/moves/move1/planned-items/planned1/convert"
      ),
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      new URL("https://example.com/api/v1/moves/move1/planned-items/planned2"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("includes HTTP methods in representative dry-run request previews", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    };

    await expect(
      createMove(config, {
        title: "PCS move",
        type: "pcs",
        dryRun: true,
      })
    ).resolves.toMatchObject({
      dryRun: true,
      request: { method: "POST", path: "/moves" },
    });
    await expect(
      updateItem(config, {
        moveId: "move1",
        itemId: "item1",
        status: "packed",
        dryRun: true,
      })
    ).resolves.toMatchObject({
      dryRun: true,
      request: { method: "PATCH", path: "/moves/move1/items/item1" },
    });
    await expect(
      finalizePhotoUpload(config, {
        moveId: "move1",
        uploadSessionId: "session1",
        dryRun: true,
      })
    ).resolves.toMatchObject({
      dryRun: true,
      request: { method: "POST", path: "/photos/finalize" },
    });
    await expect(
      createShareLink(config, {
        moveId: "move1",
        documentationProfileId: "profile1",
        label: "PCS packet",
        role: "guest",
        dryRun: true,
      })
    ).resolves.toMatchObject({
      dryRun: true,
      request: { method: "POST", path: "/moves/move1/share-links" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("get_images returns inline image bytes filtered by item", async () => {
    const imageBytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/photos/photo1/display-url")) {
        expect(url).toContain("variant=detail");
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: {
              url: "https://img.example/photo1.webp",
              mimeType: "image/webp",
              servedVariant: "detail",
              width: 1200,
              height: 900,
            },
          }),
        };
      }
      if (url.includes("img.example")) {
        return {
          ok: true,
          headers: new Headers({ "content-type": "image/webp" }),
          arrayBuffer: async () => imageBytes.buffer,
        };
      }
      // photos listing
      return {
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: [
            { photoId: "photo1", itemId: "item1", caption: "front" },
            { photoId: "photo2", itemId: "other", caption: "skip" },
          ],
          page: { limit: 250, nextCursor: null, total: 2 },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const config = createApiConfig({
      ASSISTWITHMOVING_API_BASE_URL: "https://example.com/api/v1",
      ASSISTWITHMOVING_API_KEY: "mmk_test_secret",
    } as unknown as NodeJS.ProcessEnv);

    const result = await getInlineImages(config, {
      moveId: "move1",
      itemId: "item1",
      variant: "detail",
      limit: 4,
    });

    // Filtered to item1 only, fetched and base64-encoded server-side.
    expect(result.images).toHaveLength(1);
    const [img] = result.images;
    expect(img.photoId).toBe("photo1");
    expect(img.mimeType).toBe("image/webp");
    expect(img.attachedTo).toEqual({ kind: "item", id: "item1" });
    expect(img.base64).toBe(Buffer.from(imageBytes).toString("base64"));
  });

  it("get_images requires a moveId", async () => {
    const config = createApiConfig({
      ASSISTWITHMOVING_API_BASE_URL: "https://example.com/api/v1",
      ASSISTWITHMOVING_API_KEY: "mmk_test_secret",
    } as unknown as NodeJS.ProcessEnv);
    await expect(
      getInlineImages(config, {} as Record<string, unknown>)
    ).rejects.toThrow("moveId is required.");
  });

  it("get_images records a per-image error instead of failing the whole call", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/photos/photo1/display-url")) {
        return {
          ok: false,
          status: 404,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ error: { message: "gone" } }),
        };
      }
      return {
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: [{ photoId: "photo1", boxId: "box1", caption: null }],
          page: { limit: 250, nextCursor: null, total: 1 },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const config = createApiConfig({
      ASSISTWITHMOVING_API_BASE_URL: "https://example.com/api/v1",
      ASSISTWITHMOVING_API_KEY: "mmk_test_secret",
    } as unknown as NodeJS.ProcessEnv);

    const result = await getInlineImages(config, {
      moveId: "move1",
      boxId: "box1",
    });
    expect(result.images).toHaveLength(1);
    expect(result.images[0].error).toBeTruthy();
    expect(result.images[0].base64).toBeUndefined();
  });
});
