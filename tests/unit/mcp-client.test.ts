import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  addBoxItemFromPhoto,
  addItemFromPhoto,
  addItemsToBox,
  appendItemNote,
  addHouseholdMember,
  approveAiPhotoSuggestions,
  approveAiTextSuggestions,
  approvePlanningSuggestions,
  archivePlannedItem,
  batchAddBoxContents,
  batchUpsertItems,
  applyAssignments,
  archiveMovePerson,
  archiveDocumentationProfile,
  attachPhoto,
  createApiConfig,
  createDocumentationProfile,
  batchUpsertMovableUnits,
  createBox,
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
  getAgentContext,
  getAiProviderStatus,
  getApiContext,
  getCapacityReport,
  getIngestionQueueEvidenceMedia,
  claimIngestionQueue,
  createFloorPlanIntake,
  createIngestionQueueEntry,
  getMoveDayChecklist,
  getMoveQuestions,
  getMoveSummary,
  getPhotoDisplayUrl,
  floorPlanEvidence,
  floorPlanCalculate,
  floorPlanContext,
  floorPlanObservations,
  floorPlanRelationships,
  floorPlanQuestions,
  floorPlanResetDraft,
  floorPlanSolve,
  listHouseholdMembers,
  listAiJobs,
  listAiPhotoSuggestions,
  listAiTextSuggestions,
  listDocumentationProfiles,
  listIngestionQueue,
  listMovePeople,
  listPlannedItems,
  listPlanningSuggestions,
  listShareLinkComments,
  listShareLinks,
  planApplyOps,
  planCreate,
  planGet,
  planProposeOps,
  planSnapshot,
  planSummary,
  plansList,
  movingManifestImageDerivativeVariants,
  movingManifestRequest,
  convertPlannedItem,
  removeItemFromBox,
  rejectAiPhotoSuggestions,
  rejectAiTextSuggestions,
  rejectPlanningSuggestions,
  revokeShareLink,
  searchInventory,
  setupMove,
  startPhotoUpload,
  submitIngestionQueueResults,
  suggestAssignments,
  toolErrorResult,
  uploadEvidenceImage,
  uploadEvidenceImages,
  uploadEvidenceFile,
  updateDocumentationProfile,
  updateItem,
  updateMovePerson,
  updatePlannedItem,
  updateTransportResource,
  updateTransportZone,
} from "../../mcp-server/movingmanifest-api.mjs";

const derivativeVariantsWithStatus = (status: "pending" | "ready" | "failed") =>
  movingManifestImageDerivativeVariants.map((variant) => ({
    ...variant,
    status,
  }));

describe("MovingManifest MCP API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads API config from environment", () => {
    expect(
      createApiConfig({
        MOVINGMANIFEST_API_BASE_URL: "https://example.com/api/v1/",
        MOVINGMANIFEST_API_KEY: "mmk_test_secret",
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual({
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    });
  });

  it("requires an API key", () => {
    expect(() => createApiConfig({} as NodeJS.ProcessEnv)).toThrow(
      "MOVINGMANIFEST_API_KEY is required.",
    );
  });

  it("surfaces structured API errors and remediation in tool results", () => {
    const error = new Error(
      "API key is missing required scope: inventory/write.",
    );
    Object.assign(error, {
      status: 403,
      payload: {
        error: {
          code: "insufficient_scope",
          message: "API key is missing required scope: inventory/write.",
          fields: [
            {
              path: "scopes",
              message:
                "API key lacks one or more scopes required for this route.",
              validValues: ["inventory/write"],
            },
          ],
        },
      },
    });

    const result = toolErrorResult(error);
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      status: 403,
      code: "insufficient_scope",
      fields: [
        {
          path: "scopes",
          validValues: ["inventory/write"],
        },
      ],
    });
    expect(payload.remediation[0]).toContain("/settings/ai-connections");
  });

  it("surfaces OAuth no-household remediation without API-key scope copy", () => {
    const error = new Error(
      "OAuth user does not belong to an active household.",
    );
    Object.assign(error, {
      status: 403,
      payload: {
        error: {
          code: "forbidden",
          message: "OAuth user does not belong to an active household.",
        },
      },
    });

    const result = toolErrorResult(error);
    const payload = JSON.parse(result.content[0].text);

    expect(payload.remediation[0]).toContain("/app/dashboard#household-setup");
    expect(payload.remediation.join(" ")).not.toContain("API key lacks");
  });

  it("surfaces stale OAuth connector recovery for malformed bearer tokens", () => {
    const error = new Error("Invalid API key format.");
    Object.assign(error, {
      status: 401,
      payload: {
        error: {
          code: "unauthorized",
          message: "Invalid API key format.",
        },
      },
    });

    const result = toolErrorResult(error);
    const payload = JSON.parse(result.content[0].text);

    expect(payload.remediation.join(" ")).toContain("refresh the MCP tool list");
    expect(payload.remediation.join(" ")).toContain(
      "disconnect and reconnect the MovingManifest connector",
    );
    expect(payload.remediation.join(" ")).toContain(
      "current Next + Convex OAuth changes deployed together",
    );
    expect(payload.remediation.join(" ")).toContain("starts with mmk_");
  });

  it("gets OAuth/API-key connection context", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          household: { householdId: "household1", name: "Jarvie" },
          apiKey: { scopes: ["moves/read"], moveRestricted: false },
          connection: {
            type: "oauth",
            connectionId: "connection1",
            scopes: ["moves/read"],
            moveRestricted: false,
            user: {
              email: "scott@thejarvie.com",
            },
            householdMember: {
              role: "owner",
              status: "active",
              apiAccessAllowed: true,
            },
          },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const context = await getApiContext({
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    });

    expect(context.data.connection).toMatchObject({
      type: "oauth",
      scopes: ["moves/read"],
      moveRestricted: false,
      user: {
        email: "scott@thejarvie.com",
      },
      householdMember: {
        role: "owner",
        apiAccessAllowed: true,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/me"),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
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
      },
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
      },
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
      },
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
      },
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
      },
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
      },
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
      },
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
      },
    );
  });

  it("passes inventory search text through to the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: [
          { itemId: "1", name: "Desk lamp", room: "Office" },
          { itemId: "2", name: "Garden hose", room: "Garage" },
        ],
        page: { limit: 50, nextCursor: null, total: 2 },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchInventory(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        query: "office",
        status: "active",
        disposition: "take",
        destinationSpaceId: "space-kitchen",
        agentLabel: "Codex",
        maxConfidence: 0.7,
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://example.com/api/v1/moves/move1/items?limit=50&query=office&status=active&disposition=take&destinationSpaceId=space-kitchen&agentLabel=Codex&maxConfidence=0.7",
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
    );
    expect(result.data).toEqual([
      { itemId: "1", name: "Desk lamp", room: "Office" },
      { itemId: "2", name: "Garden hose", room: "Garage" },
    ]);
  });

  it("fetches move summaries through the compact summary endpoint", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          move: { moveId: "move1", title: "PCS move" },
          counts: { items: 2, boxes: 1 },
          movableUnitSummary: {
            total: 2,
            boxes: 1,
            looseItems: 1,
            knownWeightLb: 40,
            knownVolumeCuFt: 3.2,
            missingWeight: 1,
            missingDimensions: 2,
            missingVolume: 1,
            assigned: 1,
            unassigned: 1,
            measurementRoute: [
              {
                roomLabel: "Garage",
                unitCount: 2,
                missingWeight: 1,
                missingDimensions: 2,
                missingVolume: 1,
                unassigned: 1,
                exampleNames: ["B-002", "Planer"],
                gapExamples: [
                  {
                    kind: "box",
                    boxId: "box2",
                    code: "B-002",
                    name: "Garage tools",
                    missingFields: ["dimensions", "volume"],
                    measurementPatchHint: {
                      tool: "batch_upsert_movable_units",
                      target: {
                        kind: "box",
                        boxId: "box2",
                        code: "B-002",
                      },
                      fieldsToUpdate: ["dimensions", "volume"],
                    },
                  },
                ],
                assignmentExamples: [
                  {
                    kind: "looseItem",
                    itemId: "item_planer",
                    name: "Planer",
                    assignmentPatchHint: {
                      tool: "apply_assignments",
                      target: {
                        kind: "looseItem",
                        itemId: "item_planer",
                      },
                    },
                  },
                ],
              },
            ],
            gapExamples: [],
            assignmentExamples: [],
          },
          sectionMeta: {
            items: { total: 2, limit: 25, returned: 2, truncated: false },
          },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getMoveSummary(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { moveId: "move1", sections: ["items", "boxes"], maxPerSection: 25 },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://example.com/api/v1/moves/move1/summary?sections=items%2Cboxes&maxPerSection=25",
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
    );
    expect(result).toEqual({
      move: { moveId: "move1", title: "PCS move" },
      counts: { items: 2, boxes: 1 },
      movableUnitSummary: {
        total: 2,
        boxes: 1,
        looseItems: 1,
        knownWeightLb: 40,
        knownVolumeCuFt: 3.2,
        missingWeight: 1,
        missingDimensions: 2,
        missingVolume: 1,
        assigned: 1,
        unassigned: 1,
        measurementRoute: [
          {
            roomLabel: "Garage",
            unitCount: 2,
            missingWeight: 1,
            missingDimensions: 2,
            missingVolume: 1,
            unassigned: 1,
            exampleNames: ["B-002", "Planer"],
            gapExamples: [
              {
                kind: "box",
                boxId: "box2",
                code: "B-002",
                name: "Garage tools",
                missingFields: ["dimensions", "volume"],
                measurementPatchHint: {
                  tool: "batch_upsert_movable_units",
                  target: {
                    kind: "box",
                    boxId: "box2",
                    code: "B-002",
                  },
                  fieldsToUpdate: ["dimensions", "volume"],
                },
              },
            ],
            assignmentExamples: [
              {
                kind: "looseItem",
                itemId: "item_planer",
                name: "Planer",
                assignmentPatchHint: {
                  tool: "apply_assignments",
                  target: {
                    kind: "looseItem",
                    itemId: "item_planer",
                  },
                },
              },
            ],
          },
        ],
        gapExamples: [],
        assignmentExamples: [],
      },
      sectionMeta: {
        items: { total: 2, limit: 25, returned: 2, truncated: false },
      },
    });
  });

  it("fetches bounded agent context sections through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          move: { moveId: "move1", title: "PCS move" },
          movableUnitSummary: {
            total: 1,
            boxes: 1,
            looseItems: 0,
            knownWeightLb: 0,
            knownVolumeCuFt: 0,
            missingWeight: 1,
            missingDimensions: 1,
            missingVolume: 1,
            assigned: 0,
            unassigned: 1,
            measurementRoute: [
              {
                roomLabel: "Garage",
                unitCount: 1,
                missingWeight: 1,
                missingDimensions: 1,
                missingVolume: 1,
                unassigned: 1,
                exampleNames: ["B-010"],
                gapExamples: [
                  {
                    kind: "box",
                    boxId: "box10",
                    code: "B-010",
                    name: "Garage rough box",
                    missingFields: ["weight", "dimensions", "volume"],
                    measurementPatchHint: {
                      tool: "batch_upsert_movable_units",
                      target: {
                        kind: "box",
                        boxId: "box10",
                        code: "B-010",
                      },
                      fieldsToUpdate: ["weight", "dimensions", "volume"],
                    },
                  },
                ],
                assignmentExamples: [],
              },
            ],
            gapExamples: [],
            assignmentExamples: [],
          },
          sectionMeta: {
            photos: { total: 300, limit: 50, returned: 50, truncated: true },
          },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getAgentContext(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { moveId: "move1", sections: ["photos"], maxPerSection: 50 },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://example.com/api/v1/moves/move1/agent-context?sections=photos&maxPerSection=50",
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
    );
    expect(result.movableUnitSummary.measurementRoute).toEqual([
      expect.objectContaining({
        roomLabel: "Garage",
        gapExamples: [
          expect.objectContaining({
            measurementPatchHint: expect.objectContaining({
              tool: "batch_upsert_movable_units",
            }),
          }),
        ],
      }),
    ]);
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
      { moveId: "move1" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/questions"),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
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
      { moveId: "move1", limit: 10 },
    );
    await planGet(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { planId: "plan1", moveId: "move1" },
    );
    await planSummary(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { planId: "plan1", moveId: "move1" },
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL("https://example.com/api/v1/plans?moveId=move1&limit=10"),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL("https://example.com/api/v1/plans/plan1?moveId=move1"),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL("https://example.com/api/v1/plans/plan1/summary?moveId=move1"),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
    );
  });

  it("creates floor plans through the top-level plan endpoint", async () => {
    const dryRun = await planCreate(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        name: "Blueprint draft",
        kind: "destination",
        dryRun: true,
      },
    );

    expect(dryRun).toEqual({
      dryRun: true,
      request: {
        method: "POST",
        path: "/plans",
        body: {
          moveId: "move1",
          name: "Blueprint draft",
          kind: "destination",
        },
      },
    });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { planId: "plan1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await planCreate(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        name: "Blueprint draft",
        kind: "destination",
        idempotencyKey: "plan-create-1",
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/plans"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "plan-create-1",
        },
        body: JSON.stringify({
          moveId: "move1",
          name: "Blueprint draft",
          kind: "destination",
        }),
      },
    );
  });

  it("creates and filters floor-plan ingestion queue entries", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: [{ entryId: "entry1" }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    };

    await listIngestionQueue(config, {
      moveId: "move1",
      status: "queued",
      scopeHint: "floorPlan",
      targetPlanId: "plan1",
      includeMedia: false,
      limit: 25,
    });
    await claimIngestionQueue(config, {
      moveId: "move1",
      batchSize: 2,
      agentLabel: "Codex",
      scopeHint: "floorPlan",
      targetPlanId: "plan1",
    });
    await createIngestionQueueEntry(config, {
      moveId: "move1",
      instructions: "Trace this blueprint.",
      room: "Garage",
      scopeHint: "floorPlan",
      intent: "floorPlan",
      targetLabel: "Main floor blueprint",
      targetPlanId: "plan1",
      mediaPhotoIds: ["photo1"],
      idempotencyKey: "queue-create-1",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL(
        "https://example.com/api/v1/moves/move1/ingestion-queue?limit=25&status=queued&includeMedia=false&scopeHint=floorPlan&targetPlanId=plan1",
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL("https://example.com/api/v1/moves/move1/ingestion-queue/claim"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          batchSize: 2,
          agentLabel: "Codex",
          scopeHint: "floorPlan",
          targetPlanId: "plan1",
        }),
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL("https://example.com/api/v1/moves/move1/ingestion-queue"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "queue-create-1",
        },
        body: JSON.stringify({
          instructions: "Trace this blueprint.",
          roomHint: "Garage",
          scopeHint: "floorPlan",
          intent: "floorPlan",
          targetLabel: "Main floor blueprint",
          targetPlanId: "plan1",
          mediaPhotoIds: ["photo1"],
        }),
      },
    );
  });

  it("fetches ingestion queue evidence images as MCP content blocks", async () => {
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64",
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: {
            moveId: "move1",
            entryId: "entry1",
            photoId: "photo1",
            url: "https://storage.example.test/evidence/photo1.webp",
            expiresAt: 1_234_567,
            requestedVariant: "detail",
            servedVariant: "detail",
            mediaKind: "image",
            deliveryProvider: "b2SignedUrl",
            mimeType: "image/webp",
            derivativeStatus: "ready",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          "content-type": "image/webp",
          "content-length": String(pngBytes.length),
        }),
        arrayBuffer: async () =>
          pngBytes.buffer.slice(
            pngBytes.byteOffset,
            pngBytes.byteOffset + pngBytes.byteLength,
          ),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getIngestionQueueEvidenceMedia(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        entryId: "entry1",
        photoIds: ["photo1"],
      },
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL(
        "https://example.com/api/v1/moves/move1/ingestion-queue/entry1/evidence/photo1/url?variant=detail",
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://storage.example.test/evidence/photo1.webp",
    );
    const metadataBlock = result.content[0];
    expect(metadataBlock).toMatchObject({ type: "text" });
    if (metadataBlock.type !== "text") {
      throw new Error("Expected metadata text block.");
    }
    if (!metadataBlock.text) {
      throw new Error("Expected metadata text.");
    }
    expect(JSON.parse(metadataBlock.text)).toMatchObject({
      moveId: "move1",
      entryId: "entry1",
      requestedVariant: "detail",
      fetched: [
        expect.objectContaining({
          photoId: "photo1",
          mimeType: "image/webp",
          sizeBytes: pngBytes.length,
        }),
      ],
      failed: [],
    });
    expect(result.content[1]).toEqual({
      type: "image",
      data: pngBytes.toString("base64"),
      mimeType: "image/webp",
    });

    vi.unstubAllGlobals();
  });

  it("submits trusted committed items through ingestion queue results", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          committedItemIds: ["item1"],
          committedResults: [
            {
              index: 0,
              ok: true,
              action: "create",
              itemId: "item1",
              attachedMediaPhotoIds: ["photo1"],
            },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await submitIngestionQueueResults(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        entryId: "entry1",
        idempotencyKey: "queue-entry1-commit",
        agentSummary:
          "Created one researched toolbox item, packed it, and assigned the box from queue evidence.",
        committedItems: [
          {
            externalSource: "ingestionQueue",
            externalId: "entry1:red-toolbox",
            name: "Red toolbox",
            room: "Garage",
            currentSpaceId: "space-garage",
            disposition: "take",
            quantity: 1,
            estimatedWeightLb: 18,
            weightConfidence: "medium",
            researchSummary:
              "Common household steel toolbox; exact brand not visible.",
            researchSources: [
              {
                title: "Toolbox reference",
                url: "https://example.com/toolbox",
                status: "used",
                summary: "Similar size steel toolbox reference.",
              },
            ],
            researchConfidence: "low",
            destinationSpaceId: "space-workshop",
            attachMediaPhotoIds: ["photo1"],
            appendNote: "Original capture note: fragile latch, keep upright.",
            appendNoteLabel: "Queue capture",
            researchSourceMode: "append",
          },
        ],
        committedBoxes: [
          {
            code: "GARAGE-TOOLS-1",
            label: "Garage tools",
            room: "Garage",
            destinationSpaceName: "Workshop",
            dimensionsIn: { lengthIn: 18, widthIn: 12, heightIn: 12 },
            estimatedWeightLb: 24,
          },
        ],
        boxAssignments: [
          {
            boxCode: "GARAGE-TOOLS-1",
            externalSource: "ingestionQueue",
            externalId: "entry1:red-toolbox",
            quantity: 1,
            notes: "Toolbox identified from queue evidence.",
          },
        ],
        loadAssignments: [
          {
            boxCode: "GARAGE-TOOLS-1",
            assignedResourceId: "resource1",
            assignedZoneId: "zone1",
          },
          {
            externalSource: "ingestionQueue",
            externalId: "entry1:red-toolbox",
            assignedResourceId: "resource1",
            assignedZoneId: "zone1",
            overrideReason: "Queue evidence showed this moves loose.",
          },
        ],
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://example.com/api/v1/moves/move1/ingestion-queue/entry1/results",
      ),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "queue-entry1-commit",
        },
        body: JSON.stringify({
          agentSummary:
            "Created one researched toolbox item, packed it, and assigned the box from queue evidence.",
          committedItems: [
            {
              externalSource: "ingestionQueue",
              externalId: "entry1:red-toolbox",
              name: "Red toolbox",
              room: "Garage",
              currentSpaceId: "space-garage",
              disposition: "take",
              quantity: 1,
              estimatedWeightLb: 18,
              weightConfidence: "medium",
              researchSummary:
                "Common household steel toolbox; exact brand not visible.",
              researchSources: [
                {
                  title: "Toolbox reference",
                  url: "https://example.com/toolbox",
                  status: "used",
                  summary: "Similar size steel toolbox reference.",
                },
              ],
              researchConfidence: "low",
              destinationSpaceId: "space-workshop",
              attachMediaPhotoIds: ["photo1"],
              appendNote: "Original capture note: fragile latch, keep upright.",
              appendNoteLabel: "Queue capture",
              researchSourceMode: "append",
            },
          ],
          committedBoxes: [
            {
              code: "GARAGE-TOOLS-1",
              label: "Garage tools",
              room: "Garage",
              destinationSpaceName: "Workshop",
              dimensionsIn: { lengthIn: 18, widthIn: 12, heightIn: 12 },
              estimatedWeightLb: 24,
            },
          ],
          boxAssignments: [
            {
              boxCode: "GARAGE-TOOLS-1",
              externalSource: "ingestionQueue",
              externalId: "entry1:red-toolbox",
              quantity: 1,
              notes: "Toolbox identified from queue evidence.",
            },
          ],
          loadAssignments: [
            {
              boxCode: "GARAGE-TOOLS-1",
              assignedResourceId: "resource1",
              assignedZoneId: "zone1",
            },
            {
              externalSource: "ingestionQueue",
              externalId: "entry1:red-toolbox",
              assignedResourceId: "resource1",
              assignedZoneId: "zone1",
              overrideReason: "Queue evidence showed this moves loose.",
            },
          ],
        }),
      },
    );
  });

  it("submits review-first proposed items with queue media attachments", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          suggestionIds: ["suggestion1"],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await submitIngestionQueueResults(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        entryId: "entry1",
        idempotencyKey: "queue-entry1-propose",
        agentSummary: "Proposed one researched toolbox item for review.",
        proposedItems: [
          {
            name: "Red toolbox",
            room: "Garage",
            currentSpaceId: "space-garage",
            disposition: "take",
            quantity: 1,
            estimatedWeightLb: 18,
            weightConfidence: "medium",
            researchSummary:
              "Common household steel toolbox; exact brand not visible.",
            researchSources: [
              {
                title: "Toolbox reference",
                url: "https://example.com/toolbox",
                status: "checked",
                summary: "Checked as context, but exact brand was not visible.",
              },
            ],
            researchConfidence: "low",
            destinationSpaceId: "space-workshop",
            attachMediaPhotoIds: ["photo1"],
          },
        ],
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://example.com/api/v1/moves/move1/ingestion-queue/entry1/results",
      ),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "queue-entry1-propose",
        },
        body: JSON.stringify({
          agentSummary: "Proposed one researched toolbox item for review.",
          proposedItems: [
            {
              name: "Red toolbox",
              room: "Garage",
              currentSpaceId: "space-garage",
              disposition: "take",
              quantity: 1,
              estimatedWeightLb: 18,
              weightConfidence: "medium",
              researchSummary:
                "Common household steel toolbox; exact brand not visible.",
              researchSources: [
                {
                  title: "Toolbox reference",
                  url: "https://example.com/toolbox",
                  status: "checked",
                  summary:
                    "Checked as context, but exact brand was not visible.",
                },
              ],
              researchConfidence: "low",
              destinationSpaceId: "space-workshop",
              attachMediaPhotoIds: ["photo1"],
            },
          ],
        }),
      },
    );
  });

  it("dry-runs floor-plan intake without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await createFloorPlanIntake(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        photoIds: ["photo1"],
        dryRun: true,
      },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      planId: "PLAN_ID_CREATED_BY_THIS_TOOL",
      photoIds: ["photo1"],
      planCreate: {
        dryRun: true,
        request: {
          method: "POST",
          path: "/plans",
        },
      },
      entry: {
        dryRun: true,
        request: {
          method: "POST",
          path: "/moves/move1/ingestion-queue",
          body: {
            scopeHint: "floorPlan",
            targetPlanId: "PLAN_ID_CREATED_BY_THIS_TOOL",
            mediaPhotoIds: ["photo1"],
          },
        },
      },
    });
  });

  it("builds floor-plan agent context with unplaced counts", async () => {
    const fetchMock = vi.fn(async (url: URL) => {
      const requestUrl = new URL(String(url));
      const payloadForPath = () => {
        if (requestUrl.pathname === "/api/v1/plans") {
          return {
            data: [
              {
                planId: "plan1",
                moveId: "move1",
                name: "Destination",
                kind: "destination",
                status: "active",
              },
            ],
            page: { nextCursor: null },
          };
        }
        if (requestUrl.pathname === "/api/v1/plans/plan1") {
          return {
            data: {
              plan: { planId: "plan1", moveId: "move1", name: "Destination" },
              placements: [
                {
                  placementId: "p1",
                  source: { kind: "item", sourceId: "item1" },
                },
                {
                  placementId: "p2",
                  source: { kind: "box", sourceId: "box1" },
                },
                {
                  placementId: "p3",
                  source: { kind: "plannedItem", sourceId: "planned1" },
                },
              ],
            },
          };
        }
        if (requestUrl.pathname === "/api/v1/plans/plan1/floorplan-evidence") {
          return {
            data: {
              evidence: [],
              measurements: [],
              latestSolveRun: null,
            },
          };
        }
        if (requestUrl.pathname === "/api/v1/moves/move1/spaces") {
          return {
            data: [
              {
                spaceId: "space1",
                kind: "destinationRoom",
                name: "Living room",
              },
              { spaceId: "space2", kind: "originRoom", name: "Garage" },
            ],
            page: { nextCursor: null },
          };
        }
        if (requestUrl.pathname === "/api/v1/moves/move1/ingestion-queue") {
          return {
            data: [
              {
                entryId: "entry1",
                status: "needsInput",
                targetPlanId: "plan1",
                agentQuestion: "What is the scale?",
              },
            ],
            page: { nextCursor: null },
          };
        }
        if (requestUrl.pathname === "/api/v1/moves/move1/questions") {
          return { data: { topPrompts: [] } };
        }
        if (requestUrl.pathname === "/api/v1/moves/move1/items") {
          return {
            data: [{ itemId: "item1" }, { itemId: "item2" }],
            page: { nextCursor: null },
          };
        }
        if (requestUrl.pathname === "/api/v1/moves/move1/boxes") {
          return {
            data: [{ boxId: "box1" }, { boxId: "box2" }],
            page: { nextCursor: null },
          };
        }
        if (requestUrl.pathname === "/api/v1/moves/move1/planned-items") {
          return {
            data: [
              { plannedItemId: "planned1" },
              { plannedItemId: "planned2" },
            ],
            page: { nextCursor: null },
          };
        }
        throw new Error(`Unexpected path ${requestUrl.pathname}`);
      };
      return {
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => payloadForPath(),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const context = await floorPlanContext(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { moveId: "move1" },
    );

    expect(context.activePlanId).toBe("plan1");
    expect(context.destinationSpaces).toEqual([
      { spaceId: "space1", kind: "destinationRoom", name: "Living room" },
    ]);
    expect(context.unresolvedAgentQuestions).toEqual([
      expect.objectContaining({
        entryId: "entry1",
        question: "What is the scale?",
      }),
    ]);
    expect(context.placementProgress).toMatchObject({
      placedInventoryItemCount: 1,
      placedBoxCount: 1,
      placedPlannedItemCount: 1,
      unplacedInventoryItemCount: 1,
      unplacedBoxCount: 1,
      unplacedPlannedItemCount: 1,
    });
    expect(context.floorplanEvidence).toEqual({
      evidence: [],
      measurements: [],
      calculations: [],
      latestSolveRun: null,
    });
  });

  it("dry-runs floor-plan evidence creation with measurement provenance", async () => {
    const dryRun = await floorPlanEvidence(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        action: "create",
        planId: "plan1",
        moveId: "move1",
        evidenceType: "measurement",
        title: "Image #2 bonus room dimensions",
        sourceType: "image",
        areaRole: "conditioned",
        constraintStrength: "strong",
        sourcePhotoId: "photo1",
        sourceLabel: "Image #2",
        imageNumber: 2,
        measurements: [
          {
            subjectType: "room",
            subjectKey: "bonus-room",
            subjectLabel: "Bonus room",
            measurementType: "width",
            kind: "known",
            valueIn: 300,
            displayValue: "25 ft",
            confidence: "high",
          },
          {
            subjectType: "plan",
            subjectKey: "conditioned-area",
            subjectLabel: "Official conditioned area",
            measurementType: "conditionedArea",
            kind: "known",
            unit: "sqft",
            value: 1800,
            displayValue: "1,800 sq ft",
            confidence: "high",
            areaRole: "conditioned",
            constraintStrength: "strong",
          },
        ],
        dryRun: true,
      },
    );

    expect(dryRun).toEqual({
      dryRun: true,
      request: {
        method: "POST",
        path: "/plans/plan1/floorplan-evidence",
        query: { moveId: "move1" },
        body: expect.objectContaining({
          evidenceType: "measurement",
          measurements: [
            expect.objectContaining({
              kind: "known",
              measurementType: "width",
              valueIn: 300,
            }),
            expect.objectContaining({
              measurementType: "conditionedArea",
              unit: "sqft",
              value: 1800,
              areaRole: "conditioned",
              constraintStrength: "strong",
            }),
          ],
          sourcePhotoId: "photo1",
          areaRole: "conditioned",
          constraintStrength: "strong",
        }),
      },
    });
  });

  it("dry-runs floor-plan observation, relationship, and draft reset tools", async () => {
    const observationsDryRun = await floorPlanObservations(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        action: "create",
        planId: "plan1",
        moveId: "move1",
        agentLabel: "Agent OCR",
        observations: [
          {
            observationType: "doorlessPassage",
            title: "Hall opening to kitchen",
            sourcePhotoId: "photo1",
            sourceLabel: "Image #7",
            imageNumber: 7,
            region: { x: 0.42, y: 0.55, width: 0.08, height: 0.05 },
            subjectKind: "opening",
            subjectKey: "hall-kitchen-opening",
            subjectLabel: "Hall to kitchen opening",
            rawText: "Hall ->",
            normalized: { connects: ["hall", "kitchen"] },
            confidence: "medium",
          },
        ],
        dryRun: true,
      },
    );

    const relationshipsDryRun = await floorPlanRelationships(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        action: "create",
        planId: "plan1",
        moveId: "move1",
        relationships: [
          {
            relationshipType: "connectedTo",
            fromSubjectKind: "space",
            fromSubjectKey: "hall",
            fromSubjectLabel: "Hall",
            toSubjectKind: "space",
            toSubjectKey: "kitchen",
            toSubjectLabel: "Kitchen",
            sourceObservationIds: ["obs1"],
            confidence: "medium",
            notes: "Doorless passage visible in the kitchen detail sketch.",
          },
        ],
        dryRun: true,
      },
    );

    const resetDryRun = await floorPlanResetDraft(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        planId: "plan1",
        moveId: "move1",
        reason: "User rejected the generated geometry.",
        dryRun: true,
      },
    );

    expect(observationsDryRun).toEqual({
      dryRun: true,
      request: {
        method: "POST",
        path: "/plans/plan1/floorplan-observations",
        query: { moveId: "move1" },
        body: expect.objectContaining({
          agentLabel: "Agent OCR",
          observations: [
            expect.objectContaining({
              observationType: "doorlessPassage",
              subjectKey: "hall-kitchen-opening",
              region: expect.objectContaining({ width: 0.08 }),
            }),
          ],
        }),
      },
    });

    expect(relationshipsDryRun).toEqual({
      dryRun: true,
      request: {
        method: "POST",
        path: "/plans/plan1/floorplan-relationships",
        query: { moveId: "move1" },
        body: expect.objectContaining({
          relationships: [
            expect.objectContaining({
              relationshipType: "connectedTo",
              fromSubjectKey: "hall",
              toSubjectKey: "kitchen",
              sourceObservationIds: ["obs1"],
            }),
          ],
        }),
      },
    });

    expect(resetDryRun).toEqual({
      dryRun: true,
      request: {
        method: "POST",
        path: "/plans/plan1/floorplan-reset-draft",
        query: { moveId: "move1" },
        body: { reason: "User rejected the generated geometry." },
      },
    });
  });

  it("dry-runs floor-plan solve requests with non-overlap constraints", async () => {
    const dryRun = await floorPlanSolve(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        planId: "plan1",
        moveId: "move1",
        rooms: [
          {
            id: "living",
            label: "Living",
            xIn: 0,
            yIn: 0,
            widthIn: 120,
            depthIn: 120,
            areaRole: "conditioned",
          },
          {
            id: "kitchen",
            label: "Kitchen",
            relativeTo: {
              roomId: "living",
              relation: "rightOf",
            },
            widthIn: 120,
            depthIn: 120,
            areaRole: "conditioned",
          },
        ],
        zones: [
          {
            id: "garage",
            label: "Garage",
            kind: "garage",
            areaRole: "excluded",
            xIn: 300,
            yIn: 0,
            widthIn: 240,
            depthIn: 240,
          },
        ],
        includeProposedOps: true,
        createProposal: true,
        dryRun: true,
      },
    );

    expect(dryRun).toEqual({
      dryRun: true,
      request: {
        method: "POST",
        path: "/plans/plan1/floorplan-solve",
        query: { moveId: "move1" },
        body: expect.objectContaining({
          createProposal: true,
          includeProposedOps: true,
          rooms: [
            expect.objectContaining({ id: "living" }),
            expect.objectContaining({
              id: "kitchen",
              relativeTo: expect.objectContaining({ relation: "rightOf" }),
            }),
          ],
          zones: [
            expect.objectContaining({
              id: "garage",
              areaRole: "excluded",
            }),
          ],
        }),
      },
    });
  });

  it("dry-runs floor-plan calculations without proposal writes", async () => {
    const dryRun = await floorPlanCalculate(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        planId: "plan1",
        moveId: "move1",
        rooms: [
          {
            id: "living",
            label: "Living",
            widthIn: 120,
            depthIn: 120,
          },
        ],
        dryRun: true,
      },
    );

    expect(dryRun).toEqual({
      dryRun: true,
      request: {
        method: "POST",
        path: "/plans/plan1/floorplan-solve",
        query: { moveId: "move1" },
        body: expect.objectContaining({
          createProposal: false,
          includeProposedOps: false,
          reasoning:
            "Recompute derived floorplan calculations from the measurement ledger.",
        }),
      },
    });
  });

  it("returns prioritized floor-plan questions from solve gaps", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          solve: {
            gaps: [{ id: "gap1", question: "What is the garage size?" }],
            diagnostics: [
              { severity: "warning", title: "Missing excluded area" },
            ],
          },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await floorPlanQuestions(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        planId: "plan1",
        moveId: "move1",
      },
    );

    expect(result.questions).toEqual([
      { id: "gap1", question: "What is the garage size?" },
    ]);
    expect(result.diagnostics).toEqual([
      { severity: "warning", title: "Missing excluded area" },
    ]);
    expect(result.nextStep).toContain("Ask or record");
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://example.com/api/v1/plans/plan1/floorplan-solve?moveId=move1",
      ),
      expect.objectContaining({
        method: "POST",
      }),
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
      },
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
      },
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
      },
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
      { planId: "plan1", moveId: "move1", levelId: "level1" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://example.com/api/v1/plans/plan1/snapshot.svg?moveId=move1&level=level1",
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
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
      { moveId: "move1", filter: "ready", query: "truck", limit: 20 },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://example.com/api/v1/moves/move1/move-day?filter=ready&query=truck&limit=20",
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
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
        spaceName: "Garage",
        currentSpaceId: "space-garage",
        destinationSpaceName: "New house office",
        agentLabel: "Codex intake",
        aiConfidenceScore: 0.64,
        researchSummary:
          "Likely a brass adjustable desk lamp from the late 1990s.",
        researchSources: [
          {
            title: "Maker catalog",
            url: "https://example.com/catalog/lamp",
            status: "used",
            summary: "Shows a matching brass finish and adjustable arm.",
            checkedAt: 1710000000000,
          },
        ],
        researchConfidence: "medium",
        researchNotes: "Confirm exact model before using value estimates.",
      },
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
          spaceName: "Garage",
          currentSpaceId: "space-garage",
          destinationSpaceName: "New house office",
          agentLabel: "Codex intake",
          aiConfidenceScore: 0.64,
          researchSummary:
            "Likely a brass adjustable desk lamp from the late 1990s.",
          researchSources: [
            {
              title: "Maker catalog",
              url: "https://example.com/catalog/lamp",
              status: "used",
              summary: "Shows a matching brass finish and adjustable arm.",
              checkedAt: 1710000000000,
            },
          ],
          researchConfidence: "medium",
          researchNotes: "Confirm exact model before using value estimates.",
        }),
      },
    );
  });

  it("appends and merges item research sources by default on item updates", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: {
            itemId: "item1",
            researchSources: [
              {
                title: "Old manual",
                url: "https://example.com/manual",
                status: "checked",
                summary: "Older note.",
              },
              {
                title: "Blocked reseller page",
                url: "https://example.com/login-only",
                status: "gated",
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: { itemId: "item1", researchSummary: "Updated" },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await updateItem(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        itemId: "item1",
        researchSummary: "Likely a brass adjustable desk lamp.",
        researchSources: [
          {
            title: "Updated manual",
            url: "https://example.com/manual",
            status: "used",
            summary: "Matches the shade and base dimensions.",
            checkedAt: 1710000000000,
          },
          {
            title: "Recall search",
            url: "https://example.com/recalls/lamp",
            status: "checked",
            summary: "No matching recall found.",
          },
        ],
        researchNotes: "Confirm the exact model from the sticker when visible.",
        researchConfidence: "medium",
        measurementProvenance: {
          weight: {
            sourceType: "productResearch",
            confidence: "medium",
            label: "Manufacturer manual",
            needsVerification: true,
          },
        },
        idempotencyKey: "research-item1-001",
      },
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL("https://example.com/api/v1/moves/move1/items/item1"),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL("https://example.com/api/v1/moves/move1/items/item1"),
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "research-item1-001",
        },
        body: JSON.stringify({
          moveId: "move1",
          itemId: "item1",
          researchSummary: "Likely a brass adjustable desk lamp.",
          researchSources: [
            {
              title: "Updated manual",
              url: "https://example.com/manual",
              status: "used",
              summary: "Matches the shade and base dimensions.",
              checkedAt: 1710000000000,
            },
            {
              title: "Blocked reseller page",
              url: "https://example.com/login-only",
              status: "gated",
            },
            {
              title: "Recall search",
              url: "https://example.com/recalls/lamp",
              status: "checked",
              summary: "No matching recall found.",
            },
          ],
          researchNotes:
            "Confirm the exact model from the sticker when visible.",
          researchConfidence: "medium",
          measurementProvenance: {
            weight: {
              sourceType: "productResearch",
              confidence: "medium",
              label: "Manufacturer manual",
              needsVerification: true,
            },
          },
        }),
      },
    );
  });

  it("can intentionally replace item research sources on item updates", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: { itemId: "item1", researchSources: [{ title: "Only source" }] },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await updateItem(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        itemId: "item1",
        researchSourceMode: "replace",
        researchSources: [{ title: "Only source", status: "used" }],
      },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/items/item1"),
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          moveId: "move1",
          itemId: "item1",
          researchSources: [{ title: "Only source", status: "used" }],
        }),
      },
    );
  });

  it("appends an item note without sending existing private notes", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: { itemId: "item1", appended: true, updatedAt: 1710000000000 },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await appendItemNote(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        itemId: "item1",
        note: "Glass top needs blanket wrap.",
        label: "Codex intake",
        idempotencyKey: "append-note-item1-001",
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/items/item1/notes"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "append-note-item1-001",
        },
        body: JSON.stringify({
          note: "Glass top needs blanket wrap.",
          label: "Codex intake",
        }),
      },
    );
  });

  it("updates item current and destination spaces through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { itemId: "item1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await updateItem(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        itemId: "item1",
        spaceId: "space-garage",
        spaceName: "Garage",
        currentSpaceId: "space-garage",
        destinationSpaceId: "space-office",
        destinationSpaceName: "New house office",
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/items/item1"),
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          moveId: "move1",
          itemId: "item1",
          spaceId: "space-garage",
          spaceName: "Garage",
          currentSpaceId: "space-garage",
          destinationSpaceId: "space-office",
          destinationSpaceName: "New house office",
        }),
      },
    );
  });

  it("creates an item and uploads attached images through one MCP helper", async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), "movingmanifest-mcp-"),
    );
    const filePath = path.join(tempDir, "red-toolbox.png");
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAADZrBkAAAAADUlEQVR42mP8z8BQDwAFgwJ/lpQqNwAAAABJRU5ErkJggg==",
      "base64",
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
          { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
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
              notes:
                "Quantity defaults to one because the user did not mention a count.",
            },
          },
        ),
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
      },
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
      notes:
        "Quantity defaults to one because the user did not mention a count.",
    });
    expect(uploadInit).toEqual({
      method: "POST",
      headers: {
        authorization: "Bearer mmk_test_secret",
        "content-type": "image/png",
        "content-length": String(pngBytes.length),
        "x-movingmanifest-file-name": "red-toolbox.png",
        "idempotency-key": "toolbox-intake-image-1",
      },
      body: pngBytes,
    });
  });

  it("adds a household item from one photo through the plain MCP helper", async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), "movingmanifest-mcp-"),
    );
    const filePath = path.join(tempDir, "desk-lamp.png");
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAADZrBkAAAAADUlEQVR42mP8z8BQDwAFgwJ/lpQqNwAAAABJRU5ErkJggg==",
      "base64",
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
          { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
          {
            moveId: "move1",
            name: "Desk lamp",
            room: "Office",
            category: "Lighting",
            filePath,
            confidence: "medium",
            generateAiSuggestions: true,
            idempotencyKey: "desk-lamp-photo",
          },
        ),
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
      },
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
        "x-movingmanifest-file-name": "desk-lamp.png",
        "idempotency-key": "desk-lamp-photo-image-1",
      },
      body: pngBytes,
    });
  });

  it("creates a photo-backed item inside an existing box through one MCP helper", async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), "movingmanifest-mcp-"),
    );
    const filePath = path.join(tempDir, "drill-bits.png");
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAADZrBkAAAAADUlEQVR42mP8z8BQDwAFgwJ/lpQqNwAAAABJRU5ErkJggg==",
      "base64",
    );
    await writeFile(filePath, pngBytes);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: {
            itemId: "item-drill-bits",
            name: "Loose drill bits",
            quantity: 3,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: {
            photoId: "photo-drill-bits",
            uploadSessionId: "session-drill-bits",
            derivativeStatus: "ready",
            media: {
              source: "filePath",
              fileName: "drill-bits.png",
              mimeType: "image/png",
              sizeBytes: pngBytes.length,
              width: 2,
              height: 3,
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: { assignmentId: "box-item-drill-bits" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: {
            photoId: "photo-drill-bits",
            itemId: "item-drill-bits",
            boxId: "box-12",
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(
        addBoxItemFromPhoto(
          { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
          {
            moveId: "move1",
            boxCode: "B-012",
            name: "Loose drill bits",
            room: "Garage",
            category: "Tools",
            quantity: 3,
            filePath,
            caption: "Three bins of drill bits from B-012",
            notes: "Small bits visible in the open box.",
            boxItemNotes: "Created while opening B-012.",
            idempotencyKey: "b012-drill-bits-photo",
          },
        ),
      ).resolves.toMatchObject({
        itemId: "item-drill-bits",
        photoIds: ["photo-drill-bits"],
        packedItem: {
          index: 0,
          name: "Loose drill bits",
          itemId: "item-drill-bits",
          quantity: 3,
          notes: "Created while opening B-012.",
          assignmentId: "box-item-drill-bits",
        },
        packedItemIds: ["item-drill-bits"],
        assignmentIds: ["box-item-drill-bits"],
        boxTarget: { boxCode: "B-012" },
        boxAssignment: { data: { assignmentId: "box-item-drill-bits" } },
        photoAttachments: [
          {
            data: {
              photoId: "photo-drill-bits",
              itemId: "item-drill-bits",
              boxId: "box-12",
            },
          },
        ],
        agentReview: {
          userFacingSummary:
            'Created "Loose drill bits" from a photo and packed it into B-012.',
          quantity: 3,
          boxCode: "B-012",
          packedItemIds: ["item-drill-bits"],
          assignmentIds: ["box-item-drill-bits"],
          nextStep: expect.stringContaining("get_move_summary"),
        },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL("https://example.com/api/v1/moves/move1/items"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "b012-drill-bits-photo-item",
        },
        body: JSON.stringify({
          moveId: "move1",
          name: "Loose drill bits",
          room: "Garage",
          category: "Tools",
          quantity: 3,
        }),
      },
    );

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[1] as unknown as [
      URL,
      { headers: Record<string, string>; body: Buffer },
    ];
    expect(uploadUrl.pathname).toBe("/api/v1/photos/upload");
    expect(Object.fromEntries(uploadUrl.searchParams)).toMatchObject({
      moveId: "move1",
      itemId: "item-drill-bits",
      fileName: "drill-bits.png",
      mimeType: "image/png",
      room: "Garage",
      caption: "Three bins of drill bits from B-012",
      photoType: "item",
      source: "mcp",
    });
    expect(uploadInit.headers["idempotency-key"]).toBe(
      "b012-drill-bits-photo-image-1",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL("https://example.com/api/v1/moves/move1/box-items"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "b012-drill-bits-photo-box",
        },
        body: JSON.stringify({
          moveId: "move1",
          boxCode: "B-012",
          items: [
            {
              itemId: "item-drill-bits",
              quantity: 3,
              notes: "Created while opening B-012.",
            },
          ],
        }),
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      new URL("https://example.com/api/v1/photos/photo-drill-bits/attach"),
      {
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        }),
        body: JSON.stringify({
          moveId: "move1",
          photoId: "photo-drill-bits",
          itemId: "item-drill-bits",
          boxCode: "B-012",
          room: "Garage",
          caption: "Three bins of drill bits from B-012",
          photoType: "item",
          notes: "Small bits visible in the open box.",
        }),
      },
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
            spaceId: "space-garage",
            spaceName: "Garage",
            currentSpaceId: "space-garage",
            destinationSpaceName: "New house office",
            researchSummary:
              "Similar lamp appears in the maker's archived catalog.",
            researchSources: [
              {
                title: "Archived catalog",
                url: "https://example.com/archive/lamp",
                status: "checked",
                summary: "Lists similar dimensions and materials.",
                checkedAt: 1710000000000,
              },
            ],
            researchConfidence: "low",
            researchSourceMode: "append",
          },
          { itemId: "item1", status: "packed" },
        ],
      },
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
              spaceId: "space-garage",
              spaceName: "Garage",
              currentSpaceId: "space-garage",
              destinationSpaceName: "New house office",
              researchSummary:
                "Similar lamp appears in the maker's archived catalog.",
              researchSources: [
                {
                  title: "Archived catalog",
                  url: "https://example.com/archive/lamp",
                  status: "checked",
                  summary: "Lists similar dimensions and materials.",
                  checkedAt: 1710000000000,
                },
              ],
              researchConfidence: "low",
              researchSourceMode: "append",
            },
            { itemId: "item1", status: "packed" },
          ],
        }),
      },
    );
  });

  it("batch-adds discovered contents into an existing rough box in one workflow", async () => {
    const fetchMock = vi.fn(async (url: URL) => {
      if (url.pathname.endsWith("/items/batch-upsert")) {
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: {
              dryRun: false,
              total: 2,
              succeeded: 2,
              failed: 0,
              results: [
                {
                  index: 0,
                  ok: true,
                  action: "create",
                  itemId: "item_blades",
                  name: "Circular saw blades",
                  externalSource: "open-box:B-012",
                  externalId: "saw-blades",
                },
                {
                  index: 1,
                  ok: true,
                  action: "update",
                  itemId: "item_bits",
                  externalSource: "open-box:B-012",
                  externalId: "router-bits",
                },
              ],
            },
          }),
        };
      }
      return {
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          data: {
            total: 2,
            succeeded: 2,
            failed: 0,
            results: [
              { index: 0, ok: true, assignmentId: "box_item_blades" },
              { index: 1, ok: true, assignmentId: "box_item_bits" },
            ],
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      batchAddBoxContents(
        { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
        {
          moveId: "move1",
          boxCode: "B-012",
          idempotencyKey: "open-b012-contents",
          items: [
            {
              externalSource: "open-box:B-012",
              externalId: "saw-blades",
              name: "Circular saw blades",
              room: "Garage",
              category: "Workshop",
              quantity: 3,
              boxItemNotes: "Top tray.",
            },
            {
              externalSource: "open-box:B-012",
              externalId: "router-bits",
              name: "Router bits",
              quantity: 6,
              boxQuantity: 4,
              reviewFlags: ["quantityReview"],
              aiTags: ["tools"],
            },
          ],
        },
      ),
    ).resolves.toMatchObject({
      packedCount: 2,
      packedItemIds: ["item_blades", "item_bits"],
      assignmentIds: ["box_item_blades", "box_item_bits"],
      boxTarget: { boxCode: "B-012" },
      packedItems: [
        {
          index: 0,
          name: "Circular saw blades",
          itemId: "item_blades",
          quantity: 3,
          notes: "Top tray.",
          assignmentId: "box_item_blades",
        },
        {
          index: 1,
          name: "Router bits",
          itemId: "item_bits",
          quantity: 4,
          assignmentId: "box_item_bits",
        },
      ],
      skipped: [],
      agentReview: {
        userFacingSummary: "2 items saved into B-012.",
        boxCode: "B-012",
        packedCount: 2,
        packedItemIds: ["item_blades", "item_bits"],
        assignmentIds: ["box_item_blades", "box_item_bits"],
        nextStep: expect.stringContaining("get_move_summary"),
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL("https://example.com/api/v1/moves/move1/items/batch-upsert"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "open-b012-contents-items",
        },
        body: JSON.stringify({
          items: [
            {
              externalSource: "open-box:B-012",
              externalId: "saw-blades",
              name: "Circular saw blades",
              room: "Garage",
              category: "Workshop",
              quantity: 3,
              status: "packed",
              disposition: "mover",
              needsReview: true,
              reviewFlags: ["boxContentsReview"],
              aiTags: ["box-content-capture"],
              description:
                "Created while opening box contents: Circular saw blades.",
            },
            {
              externalSource: "open-box:B-012",
              externalId: "router-bits",
              name: "Router bits",
              quantity: 6,
              reviewFlags: ["quantityReview", "boxContentsReview"],
              aiTags: ["tools", "box-content-capture"],
              status: "packed",
              disposition: "mover",
              needsReview: true,
              description: "Created while opening box contents: Router bits.",
            },
          ],
        }),
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL("https://example.com/api/v1/moves/move1/box-items"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "open-b012-contents-box",
        },
        body: JSON.stringify({
          moveId: "move1",
          boxCode: "B-012",
          items: [
            { itemId: "item_blades", quantity: 3, notes: "Top tray." },
            { itemId: "item_bits", quantity: 4 },
          ],
        }),
      },
    );
  });

  it("dry-runs rough movable-unit batches as box rows plus loose item rows", async () => {
    const result = await batchUpsertMovableUnits(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        dryRun: true,
        units: [
          {
            kind: "box",
            code: "B-012",
            label: "Garage hand tools",
            containerType: "plasticTote",
            room: "Garage",
            estimatedWeightLb: 35,
            estimatedVolumeCuFt: 4,
            assignedResourceId: "resource_truck",
            assignedZoneId: "zone_front",
            assignmentOverrideReason: "Rough list load hint.",
          },
          {
            kind: "looseItem",
            externalSource: "agent-rough-list",
            externalId: "treadmill",
            name: "Treadmill",
            room: "Basement",
            estimatedWeightLb: 220,
            estimatedVolumeCuFt: 28,
            dimensionsIn: { lengthIn: 72, widthIn: 34, heightIn: 58 },
            assignedResourceId: "resource_truck",
            assignedZoneId: "zone_front",
            assignmentOverrideReason: "Rough list load hint.",
          },
        ],
      },
    );

    expect(result).toMatchObject({
      dryRun: true,
      summary: {
        totalUnits: 2,
        boxes: 1,
        looseItems: 1,
      },
      requests: [
        {
          method: "POST",
          path: "/moves/move1/boxes",
          body: {
            code: "B-012",
            label: "Garage hand tools",
            containerType: "plasticTote",
            room: "Garage",
            estimatedWeightLb: 35,
            estimatedVolumeCuFt: 4,
            assignedResourceId: "resource_truck",
            assignedZoneId: "zone_front",
            assignmentOverrideReason: "Rough list load hint.",
          },
          unitIndex: 0,
        },
        {
          method: "POST",
          path: "/moves/move1/items/batch-upsert",
          body: {
            dryRun: true,
            items: [
              expect.objectContaining({
                externalSource: "agent-rough-list",
                externalId: "treadmill",
                name: "Treadmill",
                status: "active",
                createdVia: "bulkImport",
                needsReview: true,
                disposition: "mover",
                quantity: 1,
                reviewFlags: ["movableUnitReview"],
                dimensionsConfidence: "low",
                weightConfidence: "low",
                volumeConfidence: "low",
                estimatedVolumeCuFt: 28,
                assignedResourceId: "resource_truck",
                assignedZoneId: "zone_front",
                assignmentOverrideReason: "Rough list load hint.",
                aiTags: ["movable-unit", "loose-item"],
              }),
            ],
          },
        },
      ],
    });
  });

  it("dry-runs box photo attachments in rough movable-unit batches", async () => {
    const result = await batchUpsertMovableUnits(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        dryRun: true,
        units: [
          {
            kind: "box",
            code: "t 001",
            label: "Blue plastic tote",
            photoIds: ["photo_tote_front", "photo_tote_label"],
          },
        ],
      },
    );

    expect(result.summary).toMatchObject({
      totalUnits: 1,
      boxes: 1,
      looseItems: 0,
      photoAttachments: 2,
    });
    expect(result.requests).toEqual([
      expect.objectContaining({
        method: "POST",
        path: "/moves/move1/boxes",
        body: {
          code: "T-001",
          label: "Blue plastic tote",
        },
        unitIndex: 0,
      }),
      expect.objectContaining({
        method: "POST",
        path: "/photos/photo_tote_front/attach",
        body: {
          moveId: "move1",
          photoId: "photo_tote_front",
          boxCode: "T-001",
          dryRun: true,
        },
        unitIndex: 0,
        photoIndex: 0,
      }),
      expect.objectContaining({
        method: "POST",
        path: "/photos/photo_tote_label/attach",
        body: {
          moveId: "move1",
          photoId: "photo_tote_label",
          boxCode: "T-001",
          dryRun: true,
        },
        unitIndex: 0,
        photoIndex: 1,
      }),
    ]);
    expect(result.requests?.[0].body).not.toHaveProperty("photoIds");
    expect(result.note).toContain(
      "Box row photoIds attach to the resolved box after the box upsert.",
    );
  });

  it("warns when dry-running auto-coded movable-unit boxes without a retry key", async () => {
    const result = await batchUpsertMovableUnits(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        dryRun: true,
        units: [
          {
            kind: "box",
            label: "medium box 1",
            room: "Garage",
          },
        ],
      },
    );

    expect(result.warnings).toEqual([
      expect.stringContaining(
        "Pass a stable idempotencyKey before live writes",
      ),
    ]);
    expect(result.warnings?.[0]).toContain("row index 0");
    expect(result.note).toContain(
      "Live writes with auto-coded box rows require a stable idempotencyKey.",
    );
  });

  it("expands counted rough box rows into physical auto-coded box requests", async () => {
    const result = await batchUpsertMovableUnits(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        dryRun: true,
        units: [
          {
            kind: "box",
            count: 3,
            label: "medium boxes",
            room: "Garage",
            estimatedWeightLb: 30,
            dimensionsIn: { lengthIn: 18, widthIn: 16, heightIn: 12 },
          },
        ],
      },
    );

    expect(result.summary).toEqual({
      totalUnits: 3,
      boxes: 3,
      looseItems: 0,
    });
    expect(result.requests).toEqual([
      expect.objectContaining({
        method: "POST",
        path: "/moves/move1/boxes",
        unitIndex: 0,
        unitCountIndex: 0,
        unitCount: 3,
        body: expect.objectContaining({
          label: "medium box 1",
          room: "Garage",
          estimatedWeightLb: 30,
          estimatedVolumeCuFt: 2,
          dimensionsIn: { lengthIn: 18, widthIn: 16, heightIn: 12 },
        }),
      }),
      expect.objectContaining({
        unitIndex: 0,
        unitCountIndex: 1,
        unitCount: 3,
        body: expect.objectContaining({ label: "medium box 2" }),
      }),
      expect.objectContaining({
        unitIndex: 0,
        unitCountIndex: 2,
        unitCount: 3,
        body: expect.objectContaining({ label: "medium box 3" }),
      }),
    ]);
    expect(result.requests?.[0].body).not.toHaveProperty("count");
    expect(result.warnings?.[0]).toContain("row index 0");
  });

  it("rejects counted rough box rows when a code or boxId is also present", async () => {
    await expect(
      batchUpsertMovableUnits(
        { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
        {
          moveId: "move1",
          dryRun: true,
          units: [
            {
              kind: "box",
              count: 3,
              code: "B-001",
              label: "medium boxes",
            },
          ],
        },
      ),
    ).rejects.toThrow(/has count 3 with an existing boxId\/code/);
  });

  it("rejects counted rough box rows with photo attachments", async () => {
    await expect(
      batchUpsertMovableUnits(
        { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
        {
          moveId: "move1",
          dryRun: true,
          units: [
            {
              kind: "box",
              count: 3,
              label: "photographed totes",
              photoIds: ["photo_tote_front"],
            },
          ],
        },
      ),
    ).rejects.toThrow(
      /Expand photographed boxes into one row per physical box/,
    );
  });

  it("rejects live auto-coded movable-unit box rows without a retry key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      batchUpsertMovableUnits(
        { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
        {
          moveId: "move1",
          units: [
            {
              kind: "box",
              label: "medium box 1",
              room: "Garage",
            },
          ],
        },
      ),
    ).rejects.toThrow(
      /box rows without boxId or code will receive server-generated box codes/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows live auto-coded movable-unit box rows with a stable retry key", async () => {
    const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const requestUrl = new URL(String(url));
      if (
        requestUrl.pathname === "/api/v1/moves/move1/boxes" &&
        init?.method === "POST"
      ) {
        expect(init.headers).toMatchObject({
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "rough-garage:box:0",
        });
        expect(JSON.parse(String(init.body))).toMatchObject({
          label: "medium box 1",
          room: "Garage",
        });
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: { boxId: "box_auto_1", code: "B-001" },
          }),
        };
      }
      throw new Error(
        `Unexpected request ${init?.method ?? "GET"} ${requestUrl}`,
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await batchUpsertMovableUnits(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        idempotencyKey: "rough-garage",
        units: [
          {
            kind: "box",
            label: "medium box 1",
            room: "Garage",
          },
        ],
      },
    );

    expect(result.data?.boxes).toEqual([
      expect.objectContaining({
        unitIndex: 0,
        action: "created",
        boxId: "box_auto_1",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates counted rough box rows with stable per-box retry keys", async () => {
    const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const requestUrl = new URL(String(url));
      if (
        requestUrl.pathname === "/api/v1/moves/move1/boxes" &&
        init?.method === "POST"
      ) {
        const callIndex = fetchMock.mock.calls.length;
        expect(init.headers).toMatchObject({
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": `rough-garage:box:${callIndex - 1}`,
        });
        expect(JSON.parse(String(init.body))).toMatchObject({
          label: `medium box ${callIndex}`,
          room: "Garage",
        });
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: {
              boxId: `box_auto_${callIndex}`,
              code: `B-00${callIndex}`,
            },
          }),
        };
      }
      throw new Error(
        `Unexpected request ${init?.method ?? "GET"} ${requestUrl}`,
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await batchUpsertMovableUnits(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        idempotencyKey: "rough-garage",
        units: [
          {
            kind: "box",
            count: 3,
            label: "medium boxes",
            room: "Garage",
          },
        ],
      },
    );

    expect(result.data?.summary).toEqual({
      totalUnits: 3,
      boxes: 3,
      looseItems: 0,
    });
    expect(result.data?.boxes).toEqual([
      expect.objectContaining({
        unitIndex: 0,
        unitCountIndex: 0,
        unitCount: 3,
        action: "created",
        boxId: "box_auto_1",
      }),
      expect.objectContaining({
        unitIndex: 0,
        unitCountIndex: 1,
        unitCount: 3,
        action: "created",
        boxId: "box_auto_2",
      }),
      expect.objectContaining({
        unitIndex: 0,
        unitCountIndex: 2,
        unitCount: 3,
        action: "created",
        boxId: "box_auto_3",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("preserves original unit indexes for mixed rough movable-unit dry runs", async () => {
    const result = await batchUpsertMovableUnits(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        dryRun: true,
        units: [
          {
            kind: "looseItem",
            externalSource: "agent-rough-list",
            externalId: "garage-treadmill",
            name: "Treadmill",
          },
          {
            kind: "box",
            code: "B-012",
            label: "Garage hand tools",
          },
          {
            kind: "looseItem",
            externalSource: "agent-rough-list",
            externalId: "workshop-planer",
            name: "Planer",
          },
        ],
      },
    );

    expect(result.requests).toEqual([
      expect.objectContaining({
        method: "POST",
        path: "/moves/move1/boxes",
        unitIndex: 1,
      }),
      expect.objectContaining({
        method: "POST",
        path: "/moves/move1/items/batch-upsert",
        unitIndexes: [0, 2],
      }),
    ]);
  });

  it("requires stable keys for new rough loose movable units", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      batchUpsertMovableUnits(
        { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
        {
          moveId: "move1",
          dryRun: true,
          units: [
            {
              kind: "box",
              code: "B-012",
              label: "Garage hand tools",
            },
            {
              kind: "looseItem",
              name: "Treadmill",
              room: "Basement",
              estimatedWeightLb: 220,
            },
          ],
        },
      ),
    ).rejects.toThrow(
      /looseItem rows require itemId for existing units or externalSource plus externalId/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("defaults owner-carried rough loose units to personal transport", async () => {
    const result = await batchUpsertMovableUnits(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        dryRun: true,
        units: [
          {
            kind: "looseItem",
            externalSource: "agent-rough-list",
            externalId: "camera-backpack",
            name: "Camera backpack",
            room: "Office",
            requiresPersonalTransport: true,
          },
        ],
      },
    );

    expect(result).toMatchObject({
      dryRun: true,
      summary: {
        totalUnits: 1,
        boxes: 0,
        looseItems: 1,
      },
      requests: [
        {
          method: "POST",
          path: "/moves/move1/items/batch-upsert",
          body: {
            dryRun: true,
            items: [
              expect.objectContaining({
                externalSource: "agent-rough-list",
                externalId: "camera-backpack",
                name: "Camera backpack",
                status: "active",
                createdVia: "bulkImport",
                needsReview: true,
                disposition: "personalTransport",
                quantity: 1,
                requiresPersonalTransport: true,
                reviewFlags: ["movableUnitReview"],
                aiTags: ["movable-unit", "loose-item", "personal-transport"],
              }),
            ],
          },
        },
      ],
    });
  });

  it("dry-runs existing movable-unit measurement patches without defaulting item status or quantity", async () => {
    const result = await batchUpsertMovableUnits(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        dryRun: true,
        units: [
          {
            kind: "box",
            boxId: "box1",
            dimensionsIn: { lengthIn: 18, widthIn: 16, heightIn: 12 },
          },
          {
            kind: "looseItem",
            itemId: "item_treadmill",
            name: "Treadmill",
            estimatedWeightLb: 220,
            dimensionsIn: { lengthIn: 72, widthIn: 34, heightIn: 58 },
          },
        ],
      },
    );

    expect(result).toMatchObject({
      dryRun: true,
      summary: {
        totalUnits: 2,
        boxes: 1,
        looseItems: 1,
      },
      requests: [
        {
          method: "PATCH",
          path: "/moves/move1/boxes/box1",
          body: {
            dimensionsIn: { lengthIn: 18, widthIn: 16, heightIn: 12 },
            estimatedVolumeCuFt: 2,
          },
          unitIndex: 0,
        },
        {
          method: "POST",
          path: "/moves/move1/items/batch-upsert",
          body: {
            dryRun: true,
            items: [
              {
                itemId: "item_treadmill",
                name: "Treadmill",
                estimatedWeightLb: 220,
                dimensionsIn: { lengthIn: 72, widthIn: 34, heightIn: 58 },
                estimatedVolumeCuFt: 82.17,
                dimensionsConfidence: "low",
                weightConfidence: "low",
                volumeConfidence: "low",
              },
            ],
          },
        },
      ],
    });
    const requests = result.requests ?? [];
    expect(requests).toHaveLength(2);
    const itemPatchRequest = requests[1].body.items[0];
    expect(itemPatchRequest).not.toHaveProperty("status");
    expect(itemPatchRequest).not.toHaveProperty("quantity");
    expect(itemPatchRequest).not.toHaveProperty("createdVia");
    expect(itemPatchRequest).not.toHaveProperty("needsReview");
    expect(itemPatchRequest).not.toHaveProperty("reviewFlags");
    expect(itemPatchRequest).not.toHaveProperty("aiTags");
    expect(result.note).toContain(
      "without defaulting omitted status, quantity, createdVia, needsReview, reviewFlags, or aiTags",
    );
  });

  it("normalizes rough box codes before live movable-unit upsert lookup and patch", async () => {
    const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const requestUrl = new URL(String(url));
      if (
        requestUrl.pathname === "/api/v1/moves/move1/boxes" &&
        (init?.method ?? "GET") === "GET"
      ) {
        expect(requestUrl.searchParams.get("query")).toBe("B-012");
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: [{ boxId: "box_existing", code: "B-012" }],
            page: { nextCursor: null },
          }),
        };
      }
      if (
        requestUrl.pathname === "/api/v1/moves/move1/boxes/box_existing" &&
        init?.method === "PATCH"
      ) {
        expect(init.headers).toMatchObject({
          "idempotency-key": "rough-garage:box:B-012",
        });
        expect(JSON.parse(String(init.body))).toMatchObject({
          code: "B-012",
          label: "Garage hand tools",
          estimatedWeightLb: 40,
        });
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: { boxId: "box_existing", code: "B-012" },
          }),
        };
      }
      throw new Error(
        `Unexpected request ${init?.method ?? "GET"} ${requestUrl}`,
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await batchUpsertMovableUnits(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        idempotencyKey: "rough-garage",
        units: [
          {
            kind: "box",
            code: "b 012",
            label: "Garage hand tools",
            estimatedWeightLb: 40,
          },
        ],
      },
    );

    expect(result.data).toBeDefined();
    expect(result.data?.boxes).toEqual([
      expect.objectContaining({
        action: "updated",
        boxId: "box_existing",
        code: "B-012",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/boxes"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("attaches existing photo IDs to box rows after live movable-unit upsert", async () => {
    const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const requestUrl = new URL(String(url));
      if (
        requestUrl.pathname === "/api/v1/moves/move1/boxes/box_existing" &&
        init?.method === "PATCH"
      ) {
        expect(init.headers).toMatchObject({
          "idempotency-key": "rough-garage:box:box_existing",
        });
        const body = JSON.parse(String(init.body));
        expect(body).toMatchObject({
          label: "Blue plastic tote",
          estimatedWeightLb: 42,
        });
        expect(body).not.toHaveProperty("photoIds");
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: { boxId: "box_existing", code: "T-001" },
          }),
        };
      }
      if (
        requestUrl.pathname.startsWith("/api/v1/photos/") &&
        requestUrl.pathname.endsWith("/attach") &&
        init?.method === "POST"
      ) {
        const photoId = requestUrl.pathname.split("/")[4];
        expect(init.headers).toMatchObject({
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": `rough-garage:box-photo:0:${photoId}`,
        });
        expect(JSON.parse(String(init.body))).toEqual({
          moveId: "move1",
          photoId,
          boxId: "box_existing",
        });
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: { photoId, boxId: "box_existing" },
          }),
        };
      }
      throw new Error(
        `Unexpected request ${init?.method ?? "GET"} ${requestUrl}`,
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await batchUpsertMovableUnits(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        idempotencyKey: "rough-garage",
        units: [
          {
            kind: "box",
            boxId: "box_existing",
            label: "Blue plastic tote",
            estimatedWeightLb: 42,
            photoIds: ["photo_front", "photo_front", "photo_label"],
          },
        ],
      },
    );

    expect(result.data).toMatchObject({
      summary: {
        totalUnits: 1,
        boxes: 1,
        looseItems: 0,
        photoAttachments: 2,
      },
      boxes: [
        {
          unitIndex: 0,
          action: "updated",
          boxId: "box_existing",
          photoIds: ["photo_front", "photo_label"],
          photoAttachments: [
            {
              photoId: "photo_front",
              boxId: "box_existing",
              response: { data: { photoId: "photo_front" } },
            },
            {
              photoId: "photo_label",
              boxId: "box_existing",
              response: { data: { photoId: "photo_label" } },
            },
          ],
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns original unit indexes and stable ids after live rough movable-unit upsert", async () => {
    const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const requestUrl = new URL(String(url));
      if (
        requestUrl.pathname === "/api/v1/moves/move1/boxes/box_existing" &&
        init?.method === "PATCH"
      ) {
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: { boxId: "box_existing", code: "B-012" },
          }),
        };
      }
      if (
        requestUrl.pathname === "/api/v1/moves/move1/items/batch-upsert" &&
        init?.method === "POST"
      ) {
        expect(JSON.parse(String(init.body))).toMatchObject({
          items: [
            {
              externalSource: "agent-rough-list",
              externalId: "garage-treadmill",
              name: "Treadmill",
              status: "active",
            },
            {
              itemId: "item_planer",
              name: "Planer",
              estimatedWeightLb: 90,
            },
          ],
        });
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: {
              dryRun: false,
              total: 2,
              succeeded: 2,
              failed: 0,
              results: [
                {
                  index: 0,
                  ok: true,
                  action: "create",
                  itemId: "item_treadmill",
                  name: "Treadmill",
                  externalSource: "agent-rough-list",
                  externalId: "garage-treadmill",
                },
                {
                  index: 1,
                  ok: true,
                  action: "update",
                  itemId: "item_planer",
                  name: "Planer",
                },
              ],
            },
          }),
        };
      }
      throw new Error(
        `Unexpected request ${init?.method ?? "GET"} ${requestUrl}`,
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await batchUpsertMovableUnits(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        units: [
          {
            kind: "looseItem",
            externalSource: "agent-rough-list",
            externalId: "garage-treadmill",
            name: "Treadmill",
          },
          {
            kind: "box",
            boxId: "box_existing",
            estimatedWeightLb: 40,
          },
          {
            kind: "looseItem",
            itemId: "item_planer",
            name: "Planer",
            estimatedWeightLb: 90,
          },
        ],
      },
    );

    expect(result.data).toMatchObject({
      boxes: [
        {
          unitIndex: 1,
          action: "updated",
          boxId: "box_existing",
        },
      ],
      looseItems: [
        {
          unitIndex: 0,
          itemIndex: 0,
          ok: true,
          action: "create",
          itemId: "item_treadmill",
          externalSource: "agent-rough-list",
          externalId: "garage-treadmill",
        },
        {
          unitIndex: 2,
          itemIndex: 1,
          ok: true,
          action: "update",
          itemId: "item_planer",
          name: "Planer",
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
      { moveId: "move1" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/capacity-report"),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
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
        "https://example.com/api/v1/moves/move1/people?limit=25&includeArchived=true",
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
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
      },
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
      },
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
      },
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
      },
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
      },
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
      },
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
      },
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
      },
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
      },
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
      { moveId: "move1", limit: 10 },
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
      },
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
          {
            itemId: "item-large1",
            assignedResourceId: "resource1",
            assignedZoneId: "zone1",
            overrideReason: "Reviewed loose item placement.",
          },
        ],
        idempotencyKey: "apply-load-plan-001",
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/assignments/apply"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "apply-load-plan-001",
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
            {
              itemId: "item-large1",
              assignedResourceId: "resource1",
              assignedZoneId: "zone1",
              overrideReason: "Reviewed loose item placement.",
            },
          ],
        }),
      },
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
        "https://example.com/api/v1/moves/move1/planning-suggestions?limit=20&status=pending",
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL(
        "https://example.com/api/v1/moves/move1/planning-suggestions/generate",
      ),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({}),
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL(
        "https://example.com/api/v1/moves/move1/planning-suggestions/approve",
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
              estimateDraft: {
                estimatedWeightLb: 42,
                weightConfidence: "manual",
              },
            },
          ],
        }),
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      new URL(
        "https://example.com/api/v1/moves/move1/planning-suggestions/reject",
      ),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({ suggestionIds: ["suggestion2"] }),
      },
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
      new URL(
        "https://example.com/api/v1/moves/move1/ai-jobs?limit=5&status=succeeded",
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL(
        "https://example.com/api/v1/moves/move1/ai-text-suggestions?limit=10&status=pending",
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL(
        "https://example.com/api/v1/moves/move1/ai-photo-suggestions?limit=15&status=rejected",
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
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
      { moveId: "move1" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/ai-jobs/provider-status"),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
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
      new URL(
        "https://example.com/api/v1/moves/move1/ai-text-suggestions/generate",
      ),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({ sourceText: "Garage: red toolbox, two bikes" }),
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL(
        "https://example.com/api/v1/moves/move1/ai-photo-suggestions/generate",
      ),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({ photoIds: ["photo1", "photo2"] }),
      },
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
      new URL(
        "https://example.com/api/v1/moves/move1/ai-text-suggestions/approve",
      ),
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
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL(
        "https://example.com/api/v1/moves/move1/ai-text-suggestions/reject",
      ),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({ suggestionIds: ["textSuggestion2"] }),
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL(
        "https://example.com/api/v1/moves/move1/ai-photo-suggestions/approve",
      ),
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
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      new URL(
        "https://example.com/api/v1/moves/move1/ai-photo-suggestions/reject",
      ),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({ suggestionIds: ["photoSuggestion2"] }),
      },
    );
  });

  it("assigns items to boxes through the move-scoped ref API", async () => {
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
        boxCode: "B-012",
        items: [
          {
            externalSource: "agent-import",
            externalId: "item-1",
            quantity: 1,
            notes: "Top tray",
          },
        ],
        idempotencyKey: "pack-b012-item1",
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/box-items"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "pack-b012-item1",
        },
        body: JSON.stringify({
          moveId: "move1",
          boxCode: "B-012",
          items: [
            {
              externalSource: "agent-import",
              externalId: "item-1",
              quantity: 1,
              notes: "Top tray",
            },
          ],
        }),
      },
    );
  });

  it("creates boxes with dimensions through the move-scoped API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: { boxId: "box1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await createBox(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        code: "B-012",
        label: "Office books",
        containerType: "carton",
        destinationSpaceName: "New house office",
        dimensionsIn: { lengthIn: 18, widthIn: 12, heightIn: 12 },
        estimatedVolumeCuFt: 1.5,
        assignedResourceId: "resource_truck",
        assignedZoneId: "zone_front",
        assignmentOverrideReason: "Owner confirmed this box goes up front.",
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/boxes"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": expect.any(String),
        },
        body: JSON.stringify({
          moveId: "move1",
          code: "B-012",
          label: "Office books",
          containerType: "carton",
          destinationSpaceName: "New house office",
          dimensionsIn: { lengthIn: 18, widthIn: 12, heightIn: 12 },
          estimatedVolumeCuFt: 1.5,
          assignedResourceId: "resource_truck",
          assignedZoneId: "zone_front",
          assignmentOverrideReason: "Owner confirmed this box goes up front.",
        }),
      },
    );
  });

  it("removes box item assignments through the move-scoped ref API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: { deleted: true, assignmentId: "assignment1" },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await removeItemFromBox(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        boxCode: "B-012",
        externalSource: "agent-import",
        externalId: "item-1",
        idempotencyKey: "remove-b012-item1",
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/moves/move1/box-items"),
      {
        method: "DELETE",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "content-type": "application/json",
          "idempotency-key": "remove-b012-item1",
        },
        body: JSON.stringify({
          moveId: "move1",
          boxCode: "B-012",
          externalSource: "agent-import",
          externalId: "item-1",
        }),
      },
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
      { moveId: "move1", itemId: "item1" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/api/v1/items/item1?moveId=move1"),
      {
        method: "DELETE",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "idempotency-key": expect.any(String),
        },
      },
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
      },
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
      },
    );
  });

  it("gets photo display URLs through the API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: {
          photoId: "photo1",
          moveId: "move1",
          url: "https://b2.test/detail.webp",
          requestedVariant: "detail",
          servedVariant: "detail",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await getPhotoDisplayUrl(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      {
        moveId: "move1",
        photoId: "photo1",
        variant: "detail",
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://example.com/api/v1/photos/photo1/display-url?moveId=move1&variant=detail",
      ),
      {
        method: "GET",
        headers: {
          authorization: "Bearer mmk_test_secret",
        },
      },
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
      },
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
      },
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
      },
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
      },
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
      },
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
      },
    );
  });

  it("uploads a local evidence file through the convenience MCP helper", async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), "movingmanifest-mcp-"),
    );
    const filePath = path.join(tempDir, "garage-shelf.png");
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAADZrBkAAAAADUlEQVR42mP8z8BQDwAFgwJ/lpQqNwAAAABJRU5ErkJggg==",
      "base64",
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
          { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
          {
            moveId: "move1",
            filePath,
            room: "Garage",
            caption: "Garage shelf before packing",
            photoType: "room",
            privacyLevel: "normal",
            visibilityScope: "moveCollaborators",
          },
        ),
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
      },
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
      }),
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
        },
      ),
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
      }),
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
        },
      ),
    ).rejects.toThrow(
      "Provide exactly one of filePath, sourceUrl, dataUrl, or fileBase64.",
    );
  });

  it("uploads a local image through the one-call MCP image helper", async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), "movingmanifest-mcp-"),
    );
    const filePath = path.join(tempDir, "closet-bin.png");
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAADZrBkAAAAADUlEQVR42mP8z8BQDwAFgwJ/lpQqNwAAAABJRU5ErkJggg==",
      "base64",
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
          { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
          {
            moveId: "move1",
            filePath,
            room: "Closet",
            caption: "Closet bin before packing",
            photoType: "item",
            generateAiSuggestions: true,
            idempotencyKey: "local-image-1",
          },
        ),
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
        "x-movingmanifest-file-name": "closet-bin.png",
        "idempotency-key": "local-image-1",
      },
      body: pngBytes,
    });
  });

  it("uploads multiple local images through the batch MCP image helper", async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), "movingmanifest-mcp-"),
    );
    const firstPath = path.join(tempDir, "garage-shelf.png");
    const secondPath = path.join(tempDir, "garage-workbench.png");
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAADZrBkAAAAADUlEQVR42mP8z8BQDwAFgwJ/lpQqNwAAAABJRU5ErkJggg==",
      "base64",
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
          { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
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
          },
        ),
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
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), "movingmanifest-mcp-"),
    );
    const filePath = path.join(tempDir, "entry-table.png");
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAADZrBkAAAAADUlEQVR42mP8z8BQDwAFgwJ/lpQqNwAAAABJRU5ErkJggg==",
      "base64",
    );
    await writeFile(filePath, pngBytes);

    try {
      const result = await uploadEvidenceImage(
        { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
        {
          moveId: "move1",
          filePath,
          room: "Entry",
          caption: "Entry table before packing",
          dryRun: true,
        },
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
            "X-MovingManifest-File-Name": "entry-table.png",
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
        "https://example.com/api/v1/moves/move1/documentation-profiles?limit=5&status=active",
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
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
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL(
        "https://example.com/api/v1/moves/move1/documentation-profiles/profile1",
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
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      new URL(
        "https://example.com/api/v1/moves/move1/documentation-profiles/profile1",
      ),
      {
        method: "DELETE",
        headers: {
          authorization: "Bearer mmk_test_secret",
          "idempotency-key": expect.any(String),
        },
      },
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
        "https://example.com/api/v1/moves/move1/share-links?limit=10&status=active",
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
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
      },
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
      },
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
        "https://example.com/api/v1/moves/move1/share-links/comments?limit=10&documentationProfileId=profile1",
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL(
        "https://example.com/api/v1/moves/move1/share-links/share1/comments?limit=5",
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
    );
  });

  it("dry-runs item creation without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await createItem(
      { baseUrl: "https://example.com/api/v1", apiKey: "mmk_test_secret" },
      { moveId: "move1", name: "Chair", dryRun: true },
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
        "https://example.com/api/v1/moves/move1/planned-items?limit=25&includeArchived=true",
      ),
      {
        method: "GET",
        headers: { authorization: "Bearer mmk_test_secret" },
      },
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
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL("https://example.com/api/v1/moves/move1/planned-items/planned1"),
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      new URL(
        "https://example.com/api/v1/moves/move1/planned-items/planned1/convert",
      ),
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      new URL("https://example.com/api/v1/moves/move1/planned-items/planned2"),
      expect.objectContaining({ method: "DELETE" }),
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
      }),
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
      }),
    ).resolves.toMatchObject({
      dryRun: true,
      request: { method: "PATCH", path: "/moves/move1/items/item1" },
    });
    await expect(
      appendItemNote(config, {
        moveId: "move1",
        itemId: "item1",
        note: "Needs blanket wrap.",
        label: "Codex",
        dryRun: true,
      }),
    ).resolves.toMatchObject({
      dryRun: true,
      request: {
        method: "POST",
        path: "/moves/move1/items/item1/notes",
        body: {
          note: "Needs blanket wrap.",
          label: "Codex",
        },
      },
    });
    await expect(
      finalizePhotoUpload(config, {
        moveId: "move1",
        uploadSessionId: "session1",
        dryRun: true,
      }),
    ).resolves.toMatchObject({
      dryRun: true,
      request: { method: "POST", path: "/photos/finalize" },
    });
    await expect(
      getPhotoDisplayUrl(config, {
        moveId: "move1",
        photoId: "photo1",
        variant: "card",
        dryRun: true,
      }),
    ).resolves.toMatchObject({
      dryRun: true,
      request: { method: "GET", path: "/photos/photo1/display-url" },
    });
    await expect(
      createShareLink(config, {
        moveId: "move1",
        documentationProfileId: "profile1",
        label: "PCS packet",
        role: "guest",
        dryRun: true,
      }),
    ).resolves.toMatchObject({
      dryRun: true,
      request: { method: "POST", path: "/moves/move1/share-links" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
