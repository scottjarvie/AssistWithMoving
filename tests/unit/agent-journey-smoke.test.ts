import { describe, expect, it, vi } from "vitest";

import {
  createSmokeApiConfig,
  isProductionSmokeTarget,
  productionSmokeWritesAllowed,
  runAgentJourneySmoke,
} from "../../scripts/agent-journey-smoke.mjs";

type SmokeApi = NonNullable<Parameters<typeof runAgentJourneySmoke>[0]>["api"];

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
    const api = {
      getApiContext: vi.fn(async () => ({
        data: {
          household: { householdId: "household1", name: "Jarvie" },
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
      })),
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
      batchUpsertItems: vi.fn(async () => {
        throw new Error("batch failed");
      }),
      updateItem: vi.fn(),
      appendItemNote: vi.fn(),
      uploadEvidenceImages: vi.fn(),
      uploadEvidenceImage: vi.fn(),
      createIngestionQueueEntry: vi.fn(),
      claimIngestionQueue: vi.fn(),
      getIngestionQueueEvidenceMedia: vi.fn(),
      submitIngestionQueueResults: vi.fn(),
      approveAiTextSuggestions: vi.fn(),
      createBox: vi.fn(),
      addItemsToBox: vi.fn(),
      applyAssignments: vi.fn(),
      getMoveSummary: vi.fn(),
      getPhotoDisplayUrl: vi.fn(),
      movingManifestRequest: vi.fn(async () => ({ data: { moveId: "move1" } })),
    };

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

  it("smokes the queue media and committed result path", async () => {
    const log = vi.fn();
    const firstBatchResults = Array.from({ length: 10 }, (_, index) => ({
      ok: true,
      itemId: `item${index + 1}`,
      action: "create",
    }));
    const secondBatchResults = firstBatchResults.map((row) => ({
      ...row,
      action: "update",
    }));
    const api = {
      getApiContext: vi.fn(async () => ({
        data: {
          household: { householdId: "household1", name: "Jarvie" },
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
      })),
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
      batchUpsertMovableUnits: vi
        .fn()
        .mockResolvedValueOnce({
          dryRun: true,
          summary: { totalUnits: 2, boxes: 2, looseItems: 0 },
          requests: [
            {
              method: "POST",
              path: "/moves/move1/boxes",
              unitIndex: 0,
              unitCountIndex: 0,
              unitCount: 2,
            },
            {
              method: "POST",
              path: "/moves/move1/boxes",
              unitIndex: 0,
              unitCountIndex: 1,
              unitCount: 2,
            },
          ],
        })
        .mockResolvedValueOnce({
          data: {
            summary: { totalUnits: 2, boxes: 2, looseItems: 0 },
            boxes: [
              {
                unitIndex: 0,
                unitCountIndex: 0,
                unitCount: 2,
                action: "created",
                boxId: "counted-box1",
              },
              {
                unitIndex: 0,
                unitCountIndex: 1,
                unitCount: 2,
                action: "created",
                boxId: "counted-box2",
              },
            ],
            looseItems: [],
          },
        })
        .mockResolvedValueOnce({
          data: {
            summary: { totalUnits: 2, boxes: 1, looseItems: 1 },
            boxes: [{ unitIndex: 0, action: "created", boxId: "rough-box1" }],
            looseItems: [
              {
                unitIndex: 1,
                itemIndex: 0,
                ok: true,
                action: "create",
                itemId: "rough-loose-item1",
              },
            ],
          },
        }),
      batchAddBoxContents: vi.fn(async () => ({
        packedCount: 2,
        skipped: [],
        agentReview: {
          userFacingSummary: "2 items saved into ROUGH-0000000Z.",
          boxId: "rough-box1",
          boxCode: "ROUGH-0000000Z",
        },
      })),
      addBoxItemFromPhoto: vi.fn(async () => ({
        itemId: "rough-photo-item1",
        photoIds: ["rough-photo1"],
        agentReview: {
          userFacingSummary:
            'Created "Smoke photo-backed box item" from a photo and packed it into ROUGH-0000000Z.',
          boxId: "rough-box1",
          boxCode: "ROUGH-0000000Z",
        },
      })),
      updateItem: vi.fn(async () => ({ data: { itemId: "item1" } })),
      appendItemNote: vi.fn(async () => ({ data: { itemId: "item1", appended: true } })),
      uploadEvidenceImages: vi.fn(async () => ({
        imageCount: 1,
        uploadedCount: 1,
        failedCount: 0,
        results: [
          {
            index: 0,
            ok: true,
            photoId: "photo-extra",
            uploadSessionId: "upload-extra",
            derivativeStatus: "pending",
            derivativeError: undefined,
            derivativeVariants: [],
            media: { photoId: "photo-extra", fileName: "follow-up.png", mimeType: "image/png" },
            agentReview: { userFacingSummary: "Uploaded follow-up evidence." },
            result: {
              photoId: "photo-extra",
              uploadSessionId: "upload-extra",
              derivativeStatus: "pending",
              derivativeVariants: [],
              media: { photoId: "photo-extra", fileName: "follow-up.png", mimeType: "image/png" },
              agentReview: { userFacingSummary: "Uploaded follow-up evidence." },
            },
          },
        ],
        derivativeNote: "MovingManifest creates web-ready derivatives server-side.",
        derivativeVariants: [],
        agentReview: { userFacingSummary: "Uploaded 1 image evidence file." },
      })),
      uploadEvidenceImage: vi
        .fn()
        .mockResolvedValueOnce({ photoId: "photo1" })
        .mockResolvedValueOnce({ photoId: "photo-review" }),
      createIngestionQueueEntry: vi
        .fn()
        .mockResolvedValueOnce({
          data: { entryId: "entry1" },
        })
        .mockResolvedValueOnce({
          data: { entryId: "entry-review" },
        }),
      claimIngestionQueue: vi
        .fn()
        .mockResolvedValueOnce({
          data: [{ entryId: "entry1", mediaPhotoIds: ["photo1"] }],
        })
        .mockResolvedValueOnce({
          data: [{ entryId: "entry-review", mediaPhotoIds: ["photo-review"] }],
        }),
      getIngestionQueueEvidenceMedia: vi.fn(async () => ({
        content: [
          { type: "text", text: "{}" },
          { type: "image", data: "abc", mimeType: "image/png" },
        ],
      })),
      submitIngestionQueueResults: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            committedItemIds: ["queueItem1"],
            committedBoxIds: ["queueBox1"],
            boxAssignmentIds: ["queueBoxItem1"],
            loadAssignmentBoxIds: ["queueBox1"],
          },
        })
        .mockResolvedValueOnce({
          data: { suggestionIds: ["suggestion-review"] },
        }),
      approveAiTextSuggestions: vi.fn(async () => ({
        data: { createdItemIds: ["approved-review-item"], createdBoxIds: [] },
      })),
      createBox: vi
        .fn()
        .mockResolvedValueOnce({ data: { boxId: "box1" } }),
      addItemsToBox: vi
        .fn()
        .mockResolvedValueOnce({
          data: Array.from({ length: 5 }, (_, index) => ({
            itemId: `item${index + 1}`,
            boxId: "box1",
          })),
        }),
      applyAssignments: vi.fn(async () => ({
        data: { total: 1, succeeded: 1, failed: 0 },
      })),
      getMoveSummary: vi
        .fn()
        .mockResolvedValueOnce({
          photos: [{ photoId: "photo1", derivativeStatus: "ready" }],
        })
        .mockResolvedValueOnce({
          photos: [{ photoId: "photo-review", derivativeStatus: "ready" }],
        })
        .mockResolvedValueOnce({
          counts: { items: 21, boxes: 5, photos: 4 },
          movableUnitSummary: {
            total: 7,
            boxes: 5,
            looseItems: 2,
            knownWeightLb: 335,
            knownVolumeCuFt: 122.3,
            missingWeight: 0,
            missingDimensions: 1,
            missingVolume: 1,
            assigned: 5,
            unassigned: 2,
            measurementRoute: [
              {
                roomLabel: "Garage",
                unitCount: 2,
                missingWeight: 0,
                missingDimensions: 0,
                missingVolume: 0,
                unassigned: 2,
                priority: 102,
                exampleNames: ["Smoke counted garage box 1"],
                gapExamples: [],
                assignmentExamples: [
                  {
                    kind: "box",
                    boxId: "counted-box1",
                    code: "B-001",
                    name: "Smoke counted garage box 1",
                    assignmentPatchHint: {
                      tool: "apply_assignments",
                      target: { kind: "box", boxId: "counted-box1" },
                    },
                  },
                ],
              },
            ],
            gapExamples: [
              {
                kind: "box",
                boxId: "box1",
                code: "SMOKE-0000000Z",
                name: "Smoke packed box",
                missingFields: ["dimensions", "volume"],
                measurementPatchHint: {
                  tool: "batch_upsert_movable_units",
                  target: {
                    kind: "box",
                    boxId: "box1",
                    code: "SMOKE-0000000Z",
                  },
                  fieldsToUpdate: ["dimensions", "volume"],
                },
              },
            ],
            assignmentExamples: [
              {
                kind: "box",
                boxId: "counted-box1",
                code: "B-001",
                name: "Smoke counted garage box 1",
                assignmentPatchHint: {
                  tool: "apply_assignments",
                  target: { kind: "box", boxId: "counted-box1" },
                },
              },
            ],
          },
          photos: [
            {
              photoId: "photo-review",
              itemId: "approved-review-item",
            },
          ],
        }),
      getPhotoDisplayUrl: vi.fn(async () => ({
        url: "https://storage.example.test/detail.webp",
        expiresAt: Date.now() + 60_000,
        servedVariant: "detail",
      })),
      movingManifestRequest: vi.fn(async () => ({ data: { moveId: "move1" } })),
    };
    const fetchUrl = vi.fn(async () => ({ ok: true, status: 206 }));

    await expect(
      runAgentJourneySmoke({
        env: {
          SMOKE_TEST_API_KEY: "mmk_smoke",
          SMOKE_TEST_ALLOW_PRODUCTION_WRITES: "true",
        } as unknown as NodeJS.ProcessEnv,
        now: new Date("2026-06-13T01:00:00.000Z"),
        log,
        fetchUrl: fetchUrl as unknown as typeof fetch,
        api: api as unknown as SmokeApi,
      })
    ).resolves.toEqual({ status: "passed", moveId: "move1" });

    expect(api.updateItem).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        itemId: "item1",
        currentSpaceId: "space-garage",
        destinationSpaceId: "space-staging",
        estimatedWeightLb: 12,
        requiresPersonalTransport: true,
        researchSummary: expect.stringContaining("enrich existing item"),
        researchSources: [
          expect.objectContaining({
            title: "Smoke source check",
            url: "https://example.com/movingmanifest-agent-journey-smoke",
            status: "checked",
            summary: expect.stringContaining("agent research sources survive"),
            checkedAt: new Date("2026-06-13T01:00:00.000Z").getTime(),
          }),
        ],
        researchNotes: expect.stringContaining("source append/merge"),
        idempotencyKey: "agent-journey-smoke-research-20260613T010000000Z",
      })
    );
    expect(api.batchUpsertItems).toHaveBeenNthCalledWith(
      1,
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        items: [
          expect.objectContaining({
            externalSource: "agent-journey-smoke",
            externalId: "20260613T010000000Z-item-01",
            researchSummary: expect.stringContaining("append-safe research"),
            researchSources: [
              expect.objectContaining({
                title: "Smoke batch source",
                url: "https://example.com/movingmanifest-agent-journey-batch",
                status: "checked",
              }),
            ],
            researchSourceMode: "append",
          }),
          ...Array.from({ length: 4 }, () => expect.any(Object)),
          expect.objectContaining({
            externalSource: "agent-journey-smoke",
            externalId: "20260613T010000000Z-item-06",
            name: "Smoke loose sofa",
            category: "furniture",
            estimatedWeightLb: 80,
            dimensionsIn: { lengthIn: 84, widthIn: 36, heightIn: 32 },
          }),
          ...Array.from({ length: 4 }, () => expect.any(Object)),
        ],
      })
    );
    expect(api.batchUpsertMovableUnits).toHaveBeenNthCalledWith(
      1,
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        dryRun: true,
        units: [
          expect.objectContaining({
            kind: "box",
            count: 2,
            label: "Smoke counted garage boxes",
            room: "Garage",
            destinationSpaceId: "space-staging",
            estimatedWeightLb: 24,
            dimensionsIn: { lengthIn: 18, widthIn: 16, heightIn: 12 },
          }),
        ],
      })
    );
    expect(api.batchUpsertMovableUnits).toHaveBeenNthCalledWith(
      2,
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        idempotencyKey:
          "agent-journey-smoke-counted-boxes-20260613T010000000Z",
        units: [
          expect.objectContaining({
            kind: "box",
            count: 2,
            label: "Smoke counted garage boxes",
            room: "Garage",
            destinationSpaceId: "space-staging",
            estimatedWeightLb: 24,
            dimensionsIn: { lengthIn: 18, widthIn: 16, heightIn: 12 },
          }),
        ],
      })
    );
    expect(api.batchUpsertMovableUnits).toHaveBeenNthCalledWith(
      3,
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        idempotencyKey:
          "agent-journey-smoke-movable-units-20260613T010000000Z",
        units: [
          expect.objectContaining({
            kind: "box",
            code: "ROUGH-0000000Z",
            label: "Smoke rough garage box",
            room: "Garage",
            destinationSpaceId: "space-staging",
            assignedResourceId: "resource1",
          }),
          expect.objectContaining({
            kind: "looseItem",
            externalSource: "agent-journey-smoke",
            externalId: "20260613T010000000Z-rough-treadmill",
            name: "Smoke rough treadmill",
            assignedResourceId: "resource1",
          }),
        ],
      })
    );
    expect(api.batchAddBoxContents).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        boxId: "rough-box1",
        boxCode: "ROUGH-0000000Z",
        idempotencyKey:
          "agent-journey-smoke-open-box-contents-20260613T010000000Z",
        items: [
          expect.objectContaining({
            externalSource: "agent-journey-smoke-open-box",
            externalId: "20260613T010000000Z-rough-box-hand-tools",
            name: "Smoke rough box hand tools",
            boxQuantity: 4,
          }),
          expect.objectContaining({
            externalSource: "agent-journey-smoke-open-box",
            externalId: "20260613T010000000Z-rough-box-extension-cords",
            name: "Smoke rough box extension cords",
            boxQuantity: 2,
          }),
        ],
      })
    );
    expect(api.addBoxItemFromPhoto).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        boxId: "rough-box1",
        boxCode: "ROUGH-0000000Z",
        name: "Smoke photo-backed box item",
        fileBase64: expect.any(String),
        fileName: "agent-journey-smoke-box-item.png",
        mimeType: "image/png",
        boxItemNotes: expect.stringContaining("rough box"),
        idempotencyKey:
          "agent-journey-smoke-open-box-photo-20260613T010000000Z",
      })
    );
    expect(api.appendItemNote).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        itemId: "item1",
        note: expect.stringContaining("appended note"),
      })
    );
    expect(api.uploadEvidenceImages).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        itemId: "item1",
        images: [
          expect.objectContaining({
            fileBase64: expect.any(String),
            caption: "Smoke-test follow-up item photo",
          }),
        ],
      })
    );
    expect(api.createIngestionQueueEntry).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        scopeHint: "inventory",
        mediaPhotoIds: ["photo1"],
      })
    );
    expect(api.claimIngestionQueue).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        batchSize: 1,
        scopeHint: "inventory",
      })
    );
    expect(api.getIngestionQueueEvidenceMedia).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      {
        moveId: "move1",
        entryId: "entry1",
        photoIds: ["photo1"],
        variant: "detail",
      }
    );
    expect(api.submitIngestionQueueResults).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        entryId: "entry1",
        committedItems: [
          expect.objectContaining({
            externalSource: "agent-journey-smoke",
            name: "Smoke queue photo item",
            currentSpaceId: "space-garage",
            destinationSpaceId: "space-staging",
            attachMediaPhotoIds: ["photo1"],
            researchSummary: expect.stringContaining("MCP media blocks"),
            appendNote: expect.stringContaining("Original queue capture note"),
            appendNoteLabel: "Agent journey smoke",
          }),
        ],
        committedBoxes: [
          expect.objectContaining({
            code: "QUEUE-0000000Z",
            label: "Smoke queue packed box",
            destinationSpaceId: "space-staging",
            dimensionsIn: { lengthIn: 18, widthIn: 12, heightIn: 12 },
          }),
        ],
        boxAssignments: [
          expect.objectContaining({
            boxCode: "QUEUE-0000000Z",
            externalSource: "agent-journey-smoke",
            externalId: "20260613T010000000Z-queue-photo-item",
          }),
        ],
        loadAssignments: [
          expect.objectContaining({
            boxCode: "QUEUE-0000000Z",
            assignedResourceId: "resource1",
          }),
        ],
      })
    );
    expect(api.createIngestionQueueEntry).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        scopeHint: "inventory",
        mediaPhotoIds: ["photo-review"],
      })
    );
    expect(api.submitIngestionQueueResults).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        entryId: "entry-review",
        proposedItems: [
          expect.objectContaining({
            name: "Smoke review queue item",
            currentSpaceId: "space-garage",
            destinationSpaceId: "space-staging",
            attachMediaPhotoIds: ["photo-review"],
            researchSummary: expect.stringContaining("preserving research"),
          }),
        ],
      })
    );
    expect(api.approveAiTextSuggestions).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      {
        moveId: "move1",
        approvals: [{ suggestionId: "suggestion-review" }],
      }
    );
    expect(api.applyAssignments).toHaveBeenCalledWith(
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        assignments: [
          expect.objectContaining({
            boxId: "box1",
            assignedResourceId: "resource1",
          }),
        ],
      })
    );
    expect(api.createBox).toHaveBeenNthCalledWith(
      1,
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        destinationSpaceId: "space-staging",
      })
    );
    expect(api.createBox).toHaveBeenCalledTimes(1);
    expect(api.addItemsToBox).toHaveBeenCalledTimes(1);
    expect(api.applyAssignments).toHaveBeenNthCalledWith(
      2,
      { baseUrl: "https://movingmanifest.com/api/v1", apiKey: "mmk_smoke" },
      expect.objectContaining({
        moveId: "move1",
        idempotencyKey: "agent-journey-smoke-loose-load-20260613T010000000Z",
        assignments: [
          expect.objectContaining({
            itemId: "item6",
            assignedResourceId: "resource1",
            overrideReason: expect.stringContaining("direct loose-item"),
          }),
        ],
      })
    );
    expect(
      api.getIngestionQueueEvidenceMedia.mock.invocationCallOrder[0]
    ).toBeLessThan(api.submitIngestionQueueResults.mock.invocationCallOrder[0]);
    expect(
      api.batchUpsertMovableUnits.mock.invocationCallOrder[0]
    ).toBeLessThan(api.batchAddBoxContents.mock.invocationCallOrder[0]);
    expect(
      api.batchAddBoxContents.mock.invocationCallOrder[0]
    ).toBeLessThan(api.addBoxItemFromPhoto.mock.invocationCallOrder[0]);
    expect(
      api.submitIngestionQueueResults.mock.invocationCallOrder[1]
    ).toBeLessThan(api.approveAiTextSuggestions.mock.invocationCallOrder[0]);
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
