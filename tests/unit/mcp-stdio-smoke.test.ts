import { describe, expect, it } from "vitest";

import {
  assertCapabilitiesPayload,
  assertMockGoalRequests,
  assertWorkbenchPayload,
  createSmokeServerEnv,
  missingRequiredTools,
  parseToolJson,
  runMcpStdioSmoke,
} from "../../scripts/mcp-stdio-smoke.mjs";

describe("MCP stdio smoke", () => {
  it("uses a dummy API key and invalid base URL for metadata-only stdio smoke", () => {
    expect(
      createSmokeServerEnv({
        PATH: "/usr/bin",
        MOVINGMANIFEST_API_BASE_URL: "https://example.test/api/v1",
        MOVINGMANIFEST_API_KEY: "mmk_real_key",
      } as unknown as NodeJS.ProcessEnv)
    ).toEqual({
      PATH: "/usr/bin",
      NODE_ENV: "test",
      MOVINGMANIFEST_API_BASE_URL: "https://example.test/api/v1",
      MOVINGMANIFEST_API_KEY: "mmk_stdio_smoke_do_not_use",
    });
  });

  it("detects missing goal-critical tools", () => {
    expect(
      missingRequiredTools(
        [{ name: "agent_workbench" }, { name: "get_api_capabilities" }],
        ["agent_workbench", "ingestion_queue"]
      )
    ).toEqual(["ingestion_queue"]);
  });

  it("parses text JSON tool results and rejects MCP errors", () => {
    expect(
      parseToolJson("agent_workbench", {
        content: [{ type: "text", text: "{\"ok\":true}" }],
      })
    ).toEqual({ ok: true });

    expect(() =>
      parseToolJson("agent_workbench", {
        isError: true,
        content: [{ type: "text", text: "failed" }],
      })
    ).toThrow("agent_workbench returned an MCP error: failed");
  });

  it("asserts capability and workbench payload coverage for Scott's workflow", () => {
    expect(() =>
      assertCapabilitiesPayload({
        capabilities: [
          {
            mcpTools: [
              "agent_workbench",
              "ingestion_queue",
              "create_item",
              "update_item",
              "append_item_note",
              "upload_evidence_file",
              "upload_photo",
              "upload_photos",
              "add_item_from_photo",
              "save_box_intake",
              "add_box_item_from_photo",
              "add_items_to_box",
              "batch_upsert_movable_units",
              "apply_assignments",
            ],
          },
        ],
        knownLaunchBlockers: [{ issue: "MOVE-238" }],
      })
    ).not.toThrow();

    expect(() =>
      assertWorkbenchPayload({
        steps: [
          "ingestion_queue action=list",
          "ingestion_queue action=claim",
          "ingestion_queue action=media",
          "submitResults",
          "researchSummary",
          "researchSources",
          "apply_assignments",
        ],
      })
    ).not.toThrow();
  });

  it("asserts mock goal requests preserve item, queue, packing, and transport fields", () => {
    expect(() =>
      assertMockGoalRequests([
        {
          method: "POST",
          path: "/api/v1/moves/move1/items",
          body: {
            name: "Mock transport contract item",
            currentSpaceId: "space-origin",
            destinationSpaceId: "space-destination",
            estimatedWeightLb: 12,
            researchSources: [{ status: "used" }],
          },
        },
        {
          method: "POST",
          path: "/api/v1/moves/move1/items",
          body: {
            name: "Mock photo-created item",
            quantity: 1,
            currentSpaceId: "space-origin",
            destinationSpaceId: "space-destination",
            estimatedWeightLb: 4,
            researchSources: [{ status: "checked" }],
          },
          headers: {
            "idempotency-key": "mock-add-item-from-photo-item",
          },
        },
        {
          method: "GET",
          path: "/api/v1/moves/move1/items/item1",
          body: null,
        },
        {
          method: "PATCH",
          path: "/api/v1/moves/move1/items/item1",
          body: {
            actualWeightLb: 14,
            destinationSpaceName: "New office",
            researchNotes: "Mock correction from follow-up inspection.",
            researchSources: [
              {
                title: "Existing mock source",
                url: "https://example.test/existing-source",
                status: "checked",
              },
              {
                title: "Mock update source",
                url: "https://example.test/mock-update-source",
                status: "used",
              },
            ],
          },
          headers: {
            "idempotency-key": "mock-update-item-research",
          },
        },
        {
          method: "POST",
          path: "/api/v1/moves/move1/items/item1/notes",
          body: { note: "Mock note appended after queue review." },
        },
        {
          method: "POST",
          path: "/api/v1/photos/upload",
          query: {
            moveId: "move1",
            itemId: "item1",
            generateAiSuggestions: "true",
          },
          headers: {
            "x-movingmanifest-file-name": "mock-item.png",
          },
          body: {
            _binary: true,
            contentType: "image/png",
            sizeBytes: 68,
          },
        },
        {
          method: "POST",
          path: "/api/v1/photos/upload",
          query: {
            moveId: "move1",
            itemId: "item1",
            room: "Garage",
            photoType: "item",
            privacyLevel: "normal",
            visibilityScope: "moveCollaborators",
            caption: "Mock follow-up angle 1.",
          },
          headers: {
            "x-movingmanifest-file-name": "mock-follow-up-1.png",
            "idempotency-key": "mock-follow-up-photos-1",
          },
          body: {
            _binary: true,
            contentType: "image/png",
            sizeBytes: 68,
          },
        },
        {
          method: "POST",
          path: "/api/v1/photos/upload",
          query: {
            moveId: "move1",
            itemId: "item1",
            room: "Garage",
            photoType: "item",
            privacyLevel: "normal",
            visibilityScope: "moveCollaborators",
            caption: "Mock follow-up angle 2.",
          },
          headers: {
            "x-movingmanifest-file-name": "mock-follow-up-2.png",
            "idempotency-key": "mock-follow-up-photos-2",
          },
          body: {
            _binary: true,
            contentType: "image/png",
            sizeBytes: 68,
          },
        },
        {
          method: "POST",
          path: "/api/v1/photos/upload",
          query: {
            moveId: "move1",
            itemId: "photo-item1",
            room: "Garage",
            caption: "Mock photo-created item",
          },
          headers: {
            "x-movingmanifest-file-name": "mock-photo-item.png",
            "idempotency-key": "mock-add-item-from-photo-image-1",
          },
          body: {
            _binary: true,
            contentType: "image/png",
            sizeBytes: 68,
          },
        },
        {
          method: "GET",
          path: "/mock-media/audio-note.wav",
          body: null,
        },
        {
          method: "POST",
          path: "/api/v1/uploads/init",
          body: {
            moveId: "move1",
            room: "Garage",
            agentLabel: "mcp-stdio-smoke",
            mimeType: "audio/wav",
            sizeBytes: 44,
          },
        },
        {
          method: "PUT",
          path: "/mock-storage/audio-note.wav",
          body: {
            _binary: true,
            contentType: "audio/wav",
            sizeBytes: 44,
            sha256:
              "4f8734c5e13ac599e168cf247a51c1dd0758537ce00bf16d7fed1a3d14d07041",
          },
        },
        {
          method: "POST",
          path: "/api/v1/photos/finalize",
          body: {
            moveId: "move1",
            uploadSessionId: "audio-upload-session1",
            originalHash:
              "4f8734c5e13ac599e168cf247a51c1dd0758537ce00bf16d7fed1a3d14d07041",
            caption: "Mock audio note about fragile items.",
            photoType: "note",
            privacyLevel: "normal",
            visibilityScope: "moveCollaborators",
            source: "mcp",
            exifHandlingStatus: "pending",
          },
        },
        {
          method: "GET",
          path: "/api/v1/moves/move1/ingestion-queue",
          query: {
            scopeHint: "inventory",
            includeMedia: "true",
            limit: "5",
          },
          body: null,
        },
        {
          method: "POST",
          path: "/api/v1/moves/move1/ingestion-queue/claim",
          body: {
            batchSize: 1,
            agentLabel: "mcp-stdio-smoke",
            scopeHint: "inventory",
          },
          headers: {
            "idempotency-key": "mock-queue-claim-1",
          },
        },
        {
          method: "GET",
          path: "/api/v1/moves/move1/ingestion-queue/entry1/evidence/photo1/url",
          query: {
            variant: "detail",
          },
          body: null,
        },
        {
          method: "GET",
          path: "/mock-media/photo1-detail.png",
          body: null,
        },
        {
          method: "GET",
          path: "/api/v1/moves/move1/ingestion-queue/entry1/evidence/audio-photo1/url",
          query: {
            variant: "original",
          },
          body: null,
        },
        {
          method: "GET",
          path: "/mock-media/audio-note.wav",
          body: null,
        },
        {
          method: "GET",
          path: "/api/v1/moves/move1/ingestion-queue/entry1/evidence/audio-photo1/url",
          query: {
            variant: "original",
          },
          body: null,
        },
        {
          method: "POST",
          path: "/api/v1/moves/move1/ingestion-queue/entry1/results",
          body: {
            committedItems: [
              {
                attachMediaPhotoIds: ["photo1"],
                researchSources: [{ status: "checked" }],
                appendNote: "Queue capture note preserved with the committed item.",
                appendNoteLabel: "MCP stdio smoke",
                researchSourceMode: "append",
              },
            ],
            committedBoxes: [{ code: "BOX-1" }],
            boxAssignments: [{ boxCode: "BOX-1" }],
            loadAssignments: [{ assignedResourceId: "truck1" }],
          },
        },
        {
          method: "GET",
          path: "/api/v1/moves/move1/boxes",
          query: {
            query: "B-012",
            limit: "25",
          },
          body: null,
        },
        {
          method: "POST",
          path: "/api/v1/moves/move1/boxes",
          body: {
            code: "B-012",
            label: "Mock rough garage hand tools",
            room: "Garage",
            estimatedWeightLb: 35,
            estimatedVolumeCuFt: 4,
            assignedResourceId: "truck1",
            assignedZoneId: "truck-front",
          },
          headers: {
            "idempotency-key": "mock-rough-units-1:box:B-012",
          },
        },
        {
          method: "POST",
          path: "/api/v1/moves/move1/items/batch-upsert",
          body: {
            items: [
              {
                externalSource: "mcp-stdio-smoke",
                externalId: "garage-treadmill",
                name: "Mock treadmill",
                status: "active",
                createdVia: "bulkImport",
                disposition: "mover",
                estimatedWeightLb: 220,
                estimatedVolumeCuFt: 82.17,
                assignedResourceId: "truck1",
                reviewFlags: ["movableUnitReview"],
                aiTags: ["movable-unit", "loose-item"],
              },
            ],
          },
          headers: {
            "idempotency-key": "mock-rough-units-1:items:batch",
          },
        },
        {
          method: "POST",
          path: "/api/v1/moves/move1/box-items",
          body: {
            boxCode: "BOX-1",
            items: [{ itemId: "item1" }],
          },
        },
        {
          method: "GET",
          path: "/api/v1/moves/move1/boxes",
          query: {
            query: "B-900",
          },
          body: null,
        },
        {
          method: "POST",
          path: "/api/v1/moves/move1/boxes",
          body: {
            code: "B-900",
            label: "Mock kitchen essentials",
            destinationSpaceId: "space-destination",
            description: "Cookbooks and setup items for first week.",
            dimensionsIn: { lengthIn: 18, widthIn: 12, heightIn: 12 },
            estimatedWeightLb: 35,
          },
          headers: {
            "idempotency-key": "mock-box-intake-1-box",
          },
        },
        {
          method: "POST",
          path: "/api/v1/moves/move1/items/batch-upsert",
          body: {
            items: [
              {
                name: "Mock cookbooks",
                status: "packed",
                estimatedWeightLb: 24,
              },
            ],
          },
          headers: {
            "idempotency-key": "mock-box-intake-1-contents-items",
          },
        },
        {
          method: "POST",
          path: "/api/v1/moves/move1/box-items",
          body: {
            boxId: "box-rough-1",
            items: [{ itemId: "rough-item-1" }],
          },
        },
        {
          method: "POST",
          path: "/api/v1/moves/move1/box-items",
          body: {
            boxId: "box-rough-1",
            items: [{ itemId: "item1" }],
          },
        },
        {
          method: "POST",
          path: "/api/v1/photos/upload",
          query: {
            boxId: "box-rough-1",
            photoType: "box",
          },
        },
        {
          method: "POST",
          path: "/api/v1/photos/upload",
          query: {
            boxId: "box-rough-1",
            itemId: "rough-item-1",
            photoType: "item",
          },
        },
        {
          method: "POST",
          path: "/api/v1/moves/move1/assignments/apply",
          body: {
            assignments: [
              { boxId: "box1", assignedResourceId: "truck1" },
              { itemId: "item2", assignedResourceId: "truck1" },
            ],
          },
        },
      ])
    ).not.toThrow();
  });

  it("boots the real MCP stdio server and calls local read-first tools", async () => {
    await expect(runMcpStdioSmoke({ timeoutMs: 15_000 })).resolves.toMatchObject({
      status: "passed",
      toolCount: expect.any(Number),
    });
  }, 20_000);

  it("calls goal-critical MCP tools through stdio against a mock REST API", async () => {
    await expect(
      runMcpStdioSmoke({ timeoutMs: 15_000, mockApi: true })
    ).resolves.toMatchObject({
      status: "passed",
      toolCount: expect.any(Number),
    });
  }, 20_000);
});
