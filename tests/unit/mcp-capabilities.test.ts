import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  getApiCapabilities,
  getCapabilityToolNames,
  MOVINGMANIFEST_API_CAPABILITIES,
} from "../../mcp-server/capabilities.mjs";
import {
  MOVINGMANIFEST_MCP_INSTRUCTIONS,
  MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS,
  planOpSchema,
  registerTools,
} from "../../mcp-server/movingmanifest-mcp.mjs";

type ToolResult = {
  content: Array<{
    type: "text";
    text: string;
  }>;
};

type CapabilityPayload = {
  summary: {
    capabilityCount: number;
  };
  capabilities: Array<{
    id: string;
    title?: string;
    purpose?: string;
    status: string;
    requiredScopes?: string[];
    agentWorkflows?: string[];
    operationalBlockers?: string[];
  }>;
  knownLaunchBlockers: Array<{
    issue: string;
  }>;
};

function capabilitySourceObjects(source: string) {
  const start = source.indexOf(
    "export const MOVINGMANIFEST_API_CAPABILITIES = [",
  );
  const end = source.indexOf("];", start);
  if (start === -1 || end === -1) {
    throw new Error("Could not locate MOVINGMANIFEST_API_CAPABILITIES source.");
  }

  const lines = source.slice(start, end).split("\n");
  const objects: string[][] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    if (line === "  {") {
      current = [line];
      continue;
    }
    if (!current) {
      continue;
    }
    current.push(line);
    if (line === "  }," || line === "  }") {
      objects.push(current);
      current = null;
    }
  }

  return objects;
}

function duplicateTopLevelKeys(objectLines: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const line of objectLines) {
    const match = line.match(/^    ([A-Za-z][A-Za-z0-9_]*):/);
    if (!match) continue;
    const key = match[1];
    if (seen.has(key)) {
      duplicates.add(key);
    }
    seen.add(key);
  }

  return [...duplicates];
}

function documentedMcpToolNames(docs: string) {
  const start = docs.indexOf("Available MCP tools:");
  const end = docs.indexOf("Recommended MCP key scopes", start);
  if (start === -1 || end === -1) {
    throw new Error("Could not locate the Available MCP tools guide table.");
  }

  return [...docs.slice(start, end).matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map(
    (match) => match[1],
  );
}

function collectToolRegistrations(options?: {
  allowedToolNames?: readonly string[];
}) {
  const registrations = new Map<
    string,
    {
      options: unknown;
      handler: (input: unknown) => Promise<ToolResult>;
    }
  >();

  registerTools(
    {
      registerTool: (
        name: string,
        options: unknown,
        handler: (input: unknown) => Promise<ToolResult>,
      ) => {
        registrations.set(name, { options, handler });
      },
    },
    {
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    },
    options,
  );

  return registrations;
}

describe("MovingManifest MCP capability discovery", () => {
  it("returns a code-backed capability matrix without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const registrations = collectToolRegistrations();

    const registration = registrations.get("get_api_capabilities");
    if (!registration) {
      throw new Error("get_api_capabilities was not registered.");
    }
    const result = await registration.handler({});
    const payload = JSON.parse(result.content[0].text) as CapabilityPayload;

    expect(fetchMock).not.toHaveBeenCalled();
    expect(payload.summary.capabilityCount).toBe(
      MOVINGMANIFEST_API_CAPABILITIES.length,
    );
    expect(payload.capabilities.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "moveSetup",
        "agentWorkbench",
        "moveQuestions",
        "inventory",
        "transportPlanning",
        "documentationProfiles",
        "publicSharing",
      ]),
    );
    expect(payload.capabilities).toContainEqual(
      expect.objectContaining({
        id: "photoEvidence",
        status: "available",
      }),
    );
    expect(payload.capabilities).toContainEqual(
      expect.objectContaining({
        id: "apiContext",
        title: "Connection context",
        purpose: expect.stringContaining("OAuth or API-key connection"),
        requiredScopes: expect.arrayContaining([
          "valid OAuth connection or API key",
        ]),
      }),
    );
    expect(payload.knownLaunchBlockers.map((blocker) => blocker.issue)).toEqual(
      expect.arrayContaining(["MOVE-238", "MOVE-62", "MOVE-68"]),
    );
    expect(
      payload.knownLaunchBlockers.map((blocker) => blocker.issue),
    ).not.toContain("MOVE-226");
    expect(
      payload.knownLaunchBlockers.map((blocker) => blocker.issue),
    ).not.toContain("MOVE-63");
    expect(JSON.stringify(payload.knownLaunchBlockers)).not.toContain(
      "custom production Google OAuth credentials",
    );
    expect(JSON.stringify(payload.knownLaunchBlockers)).toContain(
      "positive admin access",
    );
    expect(JSON.stringify(payload.knownLaunchBlockers)).toContain(
      "Claude connector registration failed",
    );
    expect(JSON.stringify(payload.knownLaunchBlockers)).toContain(
      "ofid_a7fc26bd131d0216",
    );
    expect(JSON.stringify(payload.knownLaunchBlockers)).not.toContain(
      "production Convex deployment is disabled",
    );
    expect(
      payload.knownLaunchBlockers.map((blocker) => blocker.issue),
    ).not.toContain("MOVE-66");

    vi.unstubAllGlobals();
  });

  it("registers a read-first agent workbench guide", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const registrations = collectToolRegistrations();

    const registration = registrations.get("agent_workbench");
    if (!registration) {
      throw new Error("agent_workbench was not registered.");
    }
    const result = await registration.handler({ mode: "intakeQueue" });
    const payload = JSON.parse(result.content[0].text);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(payload).toMatchObject({
      product: "MovingManifest",
      mode: "intakeQueue",
      connectionRecovery: {
        agentActions: expect.arrayContaining([
          expect.stringContaining("https://movingmanifest.com/api/mcp"),
          expect.stringContaining("Allow all"),
          expect.stringContaining("disconnect and reconnect"),
        ]),
      },
      guide: {
        goal: expect.stringContaining("captured queue entries"),
        steps: expect.arrayContaining([
          expect.stringContaining("ingestion_queue action=list"),
          expect.stringContaining("ingestion_queue action=claim"),
          expect.stringContaining("ingestion_queue action=media"),
          expect.stringContaining("researchSummary"),
          expect.stringContaining("measurementProvenance"),
          expect.stringContaining("submitResults"),
          expect.stringContaining("committedBoxes"),
          expect.stringContaining("batch_upsert_movable_units"),
          expect.stringContaining("apply_assignments"),
        ]),
        avoid: expect.arrayContaining([
          expect.stringContaining("transport decisions"),
          expect.stringContaining("research links"),
        ]),
      },
      availableModes: expect.arrayContaining([
        "overview",
        "intakeQueue",
        "photoInventory",
        "reviewFirst",
        "trustedHelper",
      ]),
    });

    vi.unstubAllGlobals();
  });

  it("starts MCP clients on the curated workbench before broader writes", () => {
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain(
      "call agent_workbench first",
    );
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain(
      "https://movingmanifest.com/api/mcp",
    );
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain("Allow all");
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain(
      "then call get_api_context",
    );
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain(
      "refresh the MCP tool list",
    );
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain(
      "disconnect and reconnect",
    );
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain(
      "ingestion_queue submitResults",
    );
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain("save_box_intake");
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain(
      "box photos, newly described contents, or linked existing items",
    );
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain("containerType");
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain("plastic tote");
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain(
      "batch_upsert_movable_units",
    );
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain("large loose items");
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain(
      "numbered coded box ranges",
    );
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain(
      "one row per physical code",
    );
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain(
      "use count only for new auto-coded box rows",
    );
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain(
      "weights, dimensions, volume, or assignment",
    );
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain("photoIds");
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain(
      "photographed box rows",
    );
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain(
      "include assignedResourceId",
    );
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain(
      "movableUnitSummary.measurementRoute",
    );
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).toContain(
      "what to measure next",
    );
    expect(MOVINGMANIFEST_MCP_INSTRUCTIONS).not.toContain(
      "call get_api_context first",
    );
  });

  it("uses the same canonical instructions for the hosted remote MCP route", () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), "src/app/api/mcp/route.ts"),
      "utf8",
    );

    expect(routeSource).toContain("MOVINGMANIFEST_MCP_INSTRUCTIONS");
    expect(routeSource).toContain(
      "instructions: MOVINGMANIFEST_MCP_INSTRUCTIONS",
    );
    expect(routeSource).toContain("MOVINGMANIFEST_MCP_OAUTH_TOOLSET");
    expect(routeSource).toContain("MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS");
    expect(routeSource).not.toContain(
      "Start every session with get_api_context",
    );
  });

  it("advertises measurement-route guidance on MCP summary tools", () => {
    const registrations = collectToolRegistrations();
    const getMoveSummaryOptions = registrations.get("get_move_summary")
      ?.options as { description?: string } | undefined;
    const getAgentContextOptions = registrations.get("get_agent_context")
      ?.options as { description?: string } | undefined;

    expect(getMoveSummaryOptions?.description).toContain(
      "movableUnitSummary",
    );
    expect(getMoveSummaryOptions?.description).toContain("measurementRoute");
    expect(getMoveSummaryOptions?.description).toContain(
      "what rough boxes or loose items to measure next",
    );
    expect(getAgentContextOptions?.description).toContain(
      "movableUnitSummary",
    );
    expect(getAgentContextOptions?.description).toContain("measurementRoute");
    expect(getAgentContextOptions?.description).toContain(
      "rough-load follow-up questions",
    );
  });

  it("registers exactly the MCP tools represented in the capability matrix", () => {
    const registeredToolNames = [...collectToolRegistrations().keys()].sort();

    expect(registeredToolNames).toEqual([...getCapabilityToolNames()].sort());
    expect(registeredToolNames).toContain("agent_workbench");
    expect(registeredToolNames.length).toBeLessThanOrEqual(76);
  });

  it("can register a narrower trusted-helper tool surface for OAuth MCP", () => {
    const registeredToolNames = [
      ...collectToolRegistrations({
        allowedToolNames: MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS,
      }).keys(),
    ].sort();

    expect(registeredToolNames).toEqual(
      [...MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS].sort(),
    );
    expect(registeredToolNames).toEqual(
      expect.arrayContaining([
        "agent_workbench",
        "get_api_context",
        "list_moves",
        "get_agent_context",
        "batch_upsert_movable_units",
        "save_box_intake",
        "append_item_note",
        "upload_photo",
        "upload_photos",
        "ingestion_queue",
        "apply_assignments",
      ]),
    );
    expect(registeredToolNames).not.toEqual(
      expect.arrayContaining([
        "add_household_member",
        "list_household_members",
        "delete_item",
        "remove_item_from_box",
        "create_box",
        "add_items_to_box",
        "batch_add_box_contents",
        "add_box_item_from_photo",
        "attach_photo",
        "manage_exports",
        "manage_share_link",
      ]),
    );
  });

  it("keeps app-owned queue media tools closed-world for lower approval friction", () => {
    const registrations = collectToolRegistrations();
    const ingestionQueueOptions = registrations.get("ingestion_queue")
      ?.options as { annotations?: Record<string, boolean> } | undefined;
    const photoDisplayOptions = registrations.get("get_photo_display_url")
      ?.options as { annotations?: Record<string, boolean> } | undefined;
    const householdMemberOptions = registrations.get("add_household_member")
      ?.options as { annotations?: Record<string, boolean> } | undefined;
    const floorPlanIntakeOptions = registrations.get("create_floor_plan_intake")
      ?.options as { annotations?: Record<string, boolean> } | undefined;
    const uploadPhotoOptions = registrations.get("upload_photo")?.options as
      | { annotations?: Record<string, boolean> }
      | undefined;

    expect(ingestionQueueOptions?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    });
    expect(photoDisplayOptions?.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: false,
    });
    expect(householdMemberOptions?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    });
    expect(floorPlanIntakeOptions?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    });
    expect(uploadPhotoOptions?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    });
  });

  it("advertises stable idempotency keys on packing and load write tools", () => {
    const registrations = collectToolRegistrations();

    for (const toolName of [
      "add_items_to_box",
      "remove_item_from_box",
      "apply_assignments",
    ]) {
      const options = registrations.get(toolName)?.options as
        | { inputSchema?: Record<string, unknown>; description?: string }
        | undefined;

      expect(options?.inputSchema).toHaveProperty("idempotencyKey");
      expect(options?.description).toContain("stable retries");
    }
  });

  it("returns ingestion queue media as raw MCP image blocks", async () => {
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

    const registration = collectToolRegistrations().get("ingestion_queue");
    if (!registration) {
      throw new Error("ingestion_queue was not registered.");
    }
    const result = (await registration.handler({
      action: "media",
      moveId: "move1",
      entryId: "entry1",
      photoIds: ["photo1"],
    })) as unknown as {
      content: Array<
        | { type: "text"; text: string }
        | { type: "image"; data: string; mimeType: string }
      >;
    };

    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(result.content[1]).toEqual({
      type: "image",
      data: pngBytes.toString("base64"),
      mimeType: "image/webp",
    });

    vi.unstubAllGlobals();
  });

  it("advertises box dimensions on the create box tool", () => {
    const registrations = collectToolRegistrations();
    const createBoxOptions = registrations.get("create_box")
      ?.options as { inputSchema?: Record<string, unknown> } | undefined;
    const saveBoxIntakeOptions = registrations.get("save_box_intake")
      ?.options as { inputSchema?: Record<string, unknown> } | undefined;

    expect(createBoxOptions?.inputSchema).toHaveProperty("dimensionsIn");
    expect(createBoxOptions?.inputSchema).toHaveProperty("containerType");
    expect(createBoxOptions?.inputSchema).toHaveProperty("destinationSpaceId");
    expect(createBoxOptions?.inputSchema).toHaveProperty(
      "destinationSpaceName",
    );
    expect(createBoxOptions?.inputSchema).toHaveProperty("assignedResourceId");
    expect(createBoxOptions?.inputSchema).toHaveProperty("assignedZoneId");
    expect(createBoxOptions?.inputSchema).toHaveProperty(
      "assignmentOverrideReason",
    );
    expect(saveBoxIntakeOptions?.inputSchema).toHaveProperty("box");
    expect(saveBoxIntakeOptions?.inputSchema).toHaveProperty("photos");
    expect(saveBoxIntakeOptions?.inputSchema).toHaveProperty("contents");
    expect(saveBoxIntakeOptions?.inputSchema).toHaveProperty("linkedItems");
    expect(saveBoxIntakeOptions?.inputSchema).toHaveProperty("idempotencyKey");
  });

  it("advertises current and destination space fields on item write tools", () => {
    const registrations = collectToolRegistrations();
    for (const toolName of [
      "create_item",
      "update_item",
      "add_item_from_photo",
    ]) {
      const options = registrations.get(toolName)?.options as
        | { inputSchema?: Record<string, unknown> }
        | undefined;

      expect(options?.inputSchema).toHaveProperty("spaceId");
      expect(options?.inputSchema).toHaveProperty("spaceName");
      expect(options?.inputSchema).toHaveProperty("currentSpaceId");
      expect(options?.inputSchema).toHaveProperty("destinationSpaceId");
      expect(options?.inputSchema).toHaveProperty("destinationSpaceName");
    }
  });

  it("covers Scott's required agent inventory workflow as an MCP contract", () => {
    const registrations = collectToolRegistrations();
    const createItemOptions = registrations.get("create_item")?.options as
      | { inputSchema?: Record<string, unknown> }
      | undefined;
    const updateItemOptions = registrations.get("update_item")?.options as
      | { inputSchema?: Record<string, unknown> }
      | undefined;
    const batchUpsertOptions = registrations.get("batch_upsert_items")
      ?.options as { inputSchema?: Record<string, unknown> } | undefined;
    const appendNoteOptions = registrations.get("append_item_note")?.options as
      | { inputSchema?: Record<string, unknown> }
      | undefined;
    const addFromPhotoOptions = registrations.get("add_item_from_photo")
      ?.options as { inputSchema?: Record<string, unknown> } | undefined;
    const addBoxItemFromPhotoOptions = registrations.get(
      "add_box_item_from_photo",
    )?.options as { inputSchema?: Record<string, unknown> } | undefined;
    const batchAddBoxContentsOptions = registrations.get(
      "batch_add_box_contents",
    )?.options as { inputSchema?: Record<string, unknown> } | undefined;
    const saveBoxIntakeOptions = registrations.get("save_box_intake")
      ?.options as { inputSchema?: Record<string, unknown> } | undefined;
    const uploadPhotoOptions = registrations.get("upload_photo")?.options as
      | { inputSchema?: Record<string, unknown> }
      | undefined;
    const attachPhotoOptions = registrations.get("attach_photo")?.options as
      | { inputSchema?: Record<string, unknown> }
      | undefined;
    const addItemsToBoxOptions = registrations.get("add_items_to_box")
      ?.options as { inputSchema?: Record<string, unknown> } | undefined;
    const applyAssignmentsOptions = registrations.get("apply_assignments")
      ?.options as { inputSchema?: Record<string, unknown> } | undefined;
    const ingestionQueueOptions = registrations.get("ingestion_queue")
      ?.options as { inputSchema?: Record<string, unknown> } | undefined;
    const batchMovableOptions = registrations.get("batch_upsert_movable_units")
      ?.options as { description?: string } | undefined;
    const batchItemsSchema = batchUpsertOptions?.inputSchema?.items as
      | { element?: { shape?: Record<string, unknown> } }
      | undefined;
    const batchItemShape = batchItemsSchema?.element?.shape;

    const itemFields = [
      "dimensionsIn",
      "measurementProvenance",
      "estimatedWeightLb",
      "estimatedWeightLowLb",
      "estimatedWeightHighLb",
      "actualWeightLb",
      "weightConfidence",
      "estimatedVolumeCuFt",
      "spaceId",
      "spaceName",
      "currentSpaceId",
      "destinationRoom",
      "destinationSpaceId",
      "destinationSpaceName",
      "disposition",
      "requiresPersonalTransport",
      "privateNotes",
      "researchSummary",
      "researchSources",
      "researchNotes",
      "researchConfidence",
    ];

    for (const field of itemFields) {
      expect(createItemOptions?.inputSchema).toHaveProperty(field);
      expect(updateItemOptions?.inputSchema).toHaveProperty(field);
    }

    expect(updateItemOptions?.inputSchema).toHaveProperty("idempotencyKey");
    expect(updateItemOptions?.inputSchema).toHaveProperty("researchSourceMode");
    expect(batchMovableOptions?.description).toContain("photoIds");
    expect(batchMovableOptions?.description).toContain(
      "do not combine photoIds with count",
    );
    expect(batchMovableOptions?.description).toContain("containerType");
    expect(batchUpsertOptions?.inputSchema).toHaveProperty("items");
    expect(batchItemShape).toHaveProperty("researchSourceMode");
    expect(appendNoteOptions?.inputSchema).toHaveProperty("note");
    expect(appendNoteOptions?.inputSchema).toHaveProperty("idempotencyKey");
    expect(addFromPhotoOptions?.inputSchema).toHaveProperty("filePath");
    expect(addFromPhotoOptions?.inputSchema).toHaveProperty("sourceUrl");
    expect(addBoxItemFromPhotoOptions?.inputSchema).toHaveProperty("boxId");
    expect(addBoxItemFromPhotoOptions?.inputSchema).toHaveProperty("boxCode");
    expect(addBoxItemFromPhotoOptions?.inputSchema).toHaveProperty("filePath");
    expect(addBoxItemFromPhotoOptions?.inputSchema).toHaveProperty("sourceUrl");
    expect(batchAddBoxContentsOptions?.inputSchema).toHaveProperty("boxCode");
    expect(batchAddBoxContentsOptions?.inputSchema).toHaveProperty("items");
    expect(saveBoxIntakeOptions?.inputSchema).toHaveProperty("box");
    expect(saveBoxIntakeOptions?.inputSchema).toHaveProperty("contents");
    expect(saveBoxIntakeOptions?.inputSchema).toHaveProperty("linkedItems");
    expect(saveBoxIntakeOptions?.inputSchema).toHaveProperty("photos");
    expect(uploadPhotoOptions?.inputSchema).toHaveProperty("filePath");
    expect(uploadPhotoOptions?.inputSchema).toHaveProperty(
      "generateAiSuggestions",
    );
    expect(attachPhotoOptions?.inputSchema).toHaveProperty("photoId");
    expect(attachPhotoOptions?.inputSchema).toHaveProperty("itemId");
    expect(addItemsToBoxOptions?.inputSchema).toHaveProperty("boxCode");
    expect(addItemsToBoxOptions?.inputSchema).toHaveProperty("items");
    expect(applyAssignmentsOptions?.inputSchema).toHaveProperty("assignments");
    expect(ingestionQueueOptions?.inputSchema).toHaveProperty("mediaPhotoIds");
    expect(ingestionQueueOptions?.inputSchema).toHaveProperty("intent");
    expect(ingestionQueueOptions?.inputSchema).toHaveProperty("targetBoxId");
    expect(ingestionQueueOptions?.inputSchema).toHaveProperty("targetBoxCode");
    expect(ingestionQueueOptions?.inputSchema).toHaveProperty("targetItemId");
    expect(ingestionQueueOptions?.inputSchema).toHaveProperty("committedItems");
    expect(ingestionQueueOptions?.inputSchema).toHaveProperty("committedBoxes");
    expect(ingestionQueueOptions?.inputSchema).toHaveProperty("boxAssignments");
    expect(ingestionQueueOptions?.inputSchema).toHaveProperty(
      "loadAssignments",
    );
    expect(ingestionQueueOptions?.inputSchema).toHaveProperty("proposedItems");
    expect(ingestionQueueOptions?.inputSchema).toHaveProperty("photoIds");
  });

  it("fails existing-box helpers before writes when the box target is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const registrations = collectToolRegistrations();

    const addBoxItem = await registrations
      .get("add_box_item_from_photo")
      ?.handler({
        moveId: "move1",
        name: "Photo item without box",
        fileBase64: "not-used",
        mimeType: "image/png",
      });
    const batchContents = await registrations
      .get("batch_add_box_contents")
      ?.handler({
        moveId: "move1",
        items: [{ name: "Loose content without box" }],
      });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(addBoxItem).toMatchObject({ isError: true });
    expect(batchContents).toMatchObject({ isError: true });
    expect(addBoxItem?.content[0].text).toContain(
      "requires exactly one of boxId or boxCode",
    );
    expect(batchContents?.content[0].text).toContain(
      "requires exactly one of boxId or boxCode",
    );

    vi.unstubAllGlobals();
  });

  it("advertises research fields on review-first queue proposals", () => {
    const options = collectToolRegistrations().get("ingestion_queue")
      ?.options as { inputSchema?: Record<string, unknown> } | undefined;
    const proposedItemsSchema = options?.inputSchema?.proposedItems as
      | { unwrap?: () => { element?: { shape?: Record<string, unknown> } } }
      | undefined;
    const proposedItemShape = proposedItemsSchema?.unwrap?.().element?.shape;
    const researchSourcesSchema = proposedItemShape?.researchSources as
      | { unwrap?: () => { element?: { shape?: Record<string, unknown> } } }
      | undefined;
    const researchSourceShape =
      researchSourcesSchema?.unwrap?.().element?.shape;

    expect(proposedItemShape).toHaveProperty("spaceId");
    expect(proposedItemShape).toHaveProperty("spaceName");
    expect(proposedItemShape).toHaveProperty("currentSpaceId");
    expect(proposedItemShape).toHaveProperty("destinationSpaceId");
    expect(proposedItemShape).toHaveProperty("destinationSpaceName");
    expect(proposedItemShape).toHaveProperty("researchSummary");
    expect(proposedItemShape).toHaveProperty("researchSources");
    expect(proposedItemShape).toHaveProperty("researchNotes");
    expect(proposedItemShape).toHaveProperty("researchConfidence");
    expect(proposedItemShape).toHaveProperty("attachMediaPhotoIds");
    expect(researchSourceShape).toHaveProperty("status");
  });

  it("advertises one-call packing and load fields on trusted queue commits", () => {
    const options = collectToolRegistrations().get("ingestion_queue")
      ?.options as { inputSchema?: Record<string, unknown> } | undefined;
    const committedItemsSchema = options?.inputSchema?.committedItems as
      | { unwrap?: () => { element?: { shape?: Record<string, unknown> } } }
      | undefined;
    const committedBoxesSchema = options?.inputSchema?.committedBoxes as
      | { unwrap?: () => { element?: { shape?: Record<string, unknown> } } }
      | undefined;
    const boxAssignmentsSchema = options?.inputSchema?.boxAssignments as
      | { unwrap?: () => { element?: { shape?: Record<string, unknown> } } }
      | undefined;
    const loadAssignmentsSchema = options?.inputSchema?.loadAssignments as
      | { unwrap?: () => { element?: { shape?: Record<string, unknown> } } }
      | undefined;
    const committedItemShape = committedItemsSchema?.unwrap?.().element?.shape;
    const committedBoxShape = committedBoxesSchema?.unwrap?.().element?.shape;
    const boxAssignmentShape = boxAssignmentsSchema?.unwrap?.().element?.shape;
    const loadAssignmentShape =
      loadAssignmentsSchema?.unwrap?.().element?.shape;

    expect(options?.inputSchema).toHaveProperty("committedItems");
    expect(options?.inputSchema).toHaveProperty("committedBoxes");
    expect(options?.inputSchema).toHaveProperty("boxAssignments");
    expect(options?.inputSchema).toHaveProperty("loadAssignments");
    expect(committedItemShape).toHaveProperty("attachMediaPhotoIds");
    expect(committedItemShape).toHaveProperty("appendNote");
    expect(committedItemShape).toHaveProperty("appendNoteLabel");
    expect(committedItemShape).toHaveProperty("researchSourceMode");
    expect(committedBoxShape).toHaveProperty("code");
    expect(committedBoxShape).toHaveProperty("destinationSpaceName");
    expect(committedBoxShape).toHaveProperty("dimensionsIn");
    expect(committedBoxShape).toHaveProperty("estimatedWeightLb");
    expect(boxAssignmentShape).toHaveProperty("boxCode");
    expect(boxAssignmentShape).toHaveProperty("externalSource");
    expect(boxAssignmentShape).toHaveProperty("externalId");
    expect(loadAssignmentShape).toHaveProperty("boxCode");
    expect(loadAssignmentShape).toHaveProperty("assignedResourceId");
    expect(loadAssignmentShape).toHaveProperty("assignedZoneId");
  });

  it("advertises the Layout Studio floor-plan tools and scopes", () => {
    expect(MOVINGMANIFEST_API_CAPABILITIES).toContainEqual(
      expect.objectContaining({
        id: "floorPlans",
        requiredScopes: [
          "plans/read",
          "plans/write",
          "photos/write",
          "inventory/read",
          "inventory/write",
        ],
        mcpTools: expect.arrayContaining([
          "plans_list",
          "plan_create",
          "plan_get",
          "plan_summary",
          "floor_plan_context",
          "create_floor_plan_intake",
          "floor_plan_evidence",
          "floor_plan_observations",
          "floor_plan_relationships",
          "floor_plan_calculate",
          "floor_plan_questions",
          "floor_plan_solve",
          "floor_plan_reset_draft",
          "plan_apply_ops",
          "plan_propose_ops",
          "plan_snapshot",
        ]),
      }),
    );
  });

  it("advertises the one-call move setup tool and scopes", () => {
    expect(MOVINGMANIFEST_API_CAPABILITIES).toContainEqual(
      expect.objectContaining({
        id: "moveSetup",
        requiredScopes: ["moves/read", "moves/write", "inventory/write"],
        restEndpoints: expect.arrayContaining(["POST /api/v1/moves/setup"]),
        mcpTools: expect.arrayContaining(["setup_move"]),
      }),
    );
  });

  it("advertises one-call image upload as the default agent path", () => {
    const registrations = collectToolRegistrations();
    const addItemFromPhotoOptions = registrations.get("add_item_from_photo")
      ?.options as { description?: string } | undefined;
    const uploadPhotosOptions = registrations.get("upload_photos")?.options as
      | { description?: string }
      | undefined;
    const createBoxOptions = registrations.get("create_box")?.options as
      | { description?: string }
      | undefined;
    const applyAssignmentsOptions = registrations.get("apply_assignments")
      ?.options as { description?: string } | undefined;

    expect(addItemFromPhotoOptions?.description).toContain(
      "photo clearly shows a count",
    );
    expect(uploadPhotosOptions?.description).toContain("existing itemId");
    expect(createBoxOptions?.description).toContain(
      "batch_upsert_movable_units",
    );
    expect(createBoxOptions?.description).toContain("large loose items");
    expect(createBoxOptions?.description).toContain(
      "optional current box-based load assignment",
    );
    const movableUnitsOptions = registrations.get("batch_upsert_movable_units")
      ?.options as { description?: string } | undefined;
    expect(movableUnitsOptions?.description).toContain("assignedResourceId");
    expect(movableUnitsOptions?.description).toContain("assignedZoneId");
    expect(movableUnitsOptions?.description).toContain(
      "missing weight, dimensions, volume, or assignment",
    );
    expect(movableUnitsOptions?.description).toContain("boxes 1-25");
    expect(movableUnitsOptions?.description).toContain(
      "one box row per explicit code",
    );
    expect(movableUnitsOptions?.description).toContain("count: 12");
    expect(movableUnitsOptions?.description).toContain(
      "unitCountIndex/unitCount",
    );
    expect(movableUnitsOptions?.description).toContain(
      "active, reviewable movable-unit inventory records",
    );
    expect(movableUnitsOptions?.description).toContain(
      "externalSource plus externalId",
    );
    expect(movableUnitsOptions?.description).toContain("idempotencyKey");
    expect(movableUnitsOptions?.description).toContain("unitIndex/unitIndexes");
    expect(applyAssignmentsOptions?.description).toContain(
      "itemId for a large loose item",
    );

    expect(MOVINGMANIFEST_API_CAPABILITIES).toContainEqual(
      expect.objectContaining({
        id: "photoEvidence",
        restEndpoints: expect.arrayContaining([
          "POST /api/v1/photos/upload",
          "POST /api/v1/images/upload",
        ]),
        mcpTools: expect.arrayContaining([
          "add_item_from_photo",
          "create_item_with_images",
          "upload_photo",
          "upload_photos",
        ]),
        agentWorkflows: expect.arrayContaining([
          expect.stringContaining("add_item_from_photo"),
          expect.stringContaining("create_item_with_images"),
          expect.stringContaining("upload_photo"),
          expect.stringContaining("upload_photos"),
          expect.stringContaining("existing item"),
          expect.stringContaining("photo clearly shows a count"),
          expect.stringContaining("generateAiSuggestions true"),
          expect.stringContaining("Do not ask the user for dimensions"),
        ]),
      }),
    );
  });

  it("documents the one-call image upload path for OpenAPI and AI readers", () => {
    type OpenApiSchema = {
      $ref?: string;
      description?: string;
      enum?: string[];
      required?: string[];
      properties?: Record<string, OpenApiSchema>;
      items?: OpenApiSchema;
      allOf?: OpenApiSchema[];
      oneOf?: OpenApiSchema[];
    };
    const openapi = JSON.parse(
      readFileSync(resolve(process.cwd(), "public/openapi.json"), "utf8"),
    ) as {
      paths: Record<
        string,
        {
          get?: {
            responses?: Record<
              string,
              {
                description?: string;
                content?: Record<string, { schema?: OpenApiSchema }>;
              }
            >;
          };
          post?: {
            operationId?: string;
            requestBody: {
              content: Record<string, unknown>;
            };
          };
        }
      >;
      components: {
        schemas: Record<string, OpenApiSchema>;
        parameters: Record<string, OpenApiSchema>;
      };
    };
    const docs = readFileSync(
      resolve(process.cwd(), "docs/api-and-mcp.md"),
      "utf8",
    );
    const llms = readFileSync(
      resolve(process.cwd(), "public/llms.txt"),
      "utf8",
    );
    const fullLlms = readFileSync(
      resolve(process.cwd(), "public/llms-full.txt"),
      "utf8",
    );

    expect(openapi.paths["/photos/upload"]?.post?.operationId).toBe(
      "uploadPhotoEvidenceImage",
    );
    expect(openapi.paths["/images/upload"]?.post?.operationId).toBe(
      "uploadImageEvidenceImage",
    );
    expect(
      openapi.paths["/photos/upload"]?.post?.requestBody.content,
    ).toHaveProperty("multipart/form-data");
    expect(
      openapi.paths["/images/upload"]?.post?.requestBody.content,
    ).toHaveProperty("multipart/form-data");
    expect(
      openapi.paths["/photos/upload"]?.post?.requestBody.content,
    ).toHaveProperty("image/jpeg");
    expect(openapi.components.schemas.PhotoDirectUpload.description).toContain(
      "Provide exactly one of sourceUrl, dataUrl, or fileBase64",
    );
    expect(openapi.components.schemas.PhotoDirectUpload.description).toContain(
      "generateAiSuggestions true",
    );
    expect(
      openapi.components.schemas.PhotoMultipartUpload.description,
    ).toContain("Multipart one-call");
    expect(
      openapi.components.schemas.PhotoDirectUpload.properties?.fileBase64
        ?.description,
    ).toContain("local image file");
    expect(
      openapi.components.schemas.PhotoDirectUpload.properties
        ?.generateAiSuggestions?.description,
    ).toContain("queue AI photo-intake suggestions");
    expect(
      openapi.components.schemas.PhotoDirectUploadResponse.properties?.data
        ?.properties?.agentReview?.description,
    ).toContain("assistant-facing summary");
    expect(
      openapi.components.schemas.PhotoDirectUploadResponse.properties?.data
        ?.properties?.derivativeVariants?.description,
    ).toContain("thumb/card/detail/full derivative contract");
    expect(openapi.components.parameters.offset?.description).toContain(
      "Prefer offset",
    );
    expect(openapi.components.parameters.cursor?.description).toContain(
      "Legacy pagination alias",
    );
    expect(
      openapi.components.schemas.PhotoDirectUploadResponse.properties?.data
        ?.properties?.media?.properties?.display?.$ref,
    ).toBe("#/components/schemas/PhotoDisplayMedia");
    expect(openapi.components.schemas.PhotoDisplayMedia.description).toContain(
      "Derivative display readiness",
    );
    expect(
      openapi.components.schemas.ItemResearchSource.properties?.status,
    ).toMatchObject({
      enum: ["used", "checked", "blocked", "gated", "failed", "notRelevant"],
    });
    const derivativeVariantSchema = openapi.components.schemas
      .PhotoDerivativeVariant.properties?.variant as OpenApiSchema & {
      enum?: string[];
    };
    expect(derivativeVariantSchema.enum).toEqual([
      "thumb",
      "card",
      "detail",
      "full",
    ]);
    expect(
      openapi.paths["/moves/{moveId}/summary"]?.get?.responses?.["200"]
        ?.content?.["application/json"]?.schema?.$ref,
    ).toBe("#/components/schemas/MoveSummaryResponse");
    expect(
      openapi.paths["/moves/{moveId}/agent-context"]?.get?.responses?.["200"]
        ?.content?.["application/json"]?.schema?.$ref,
    ).toBe("#/components/schemas/AgentContextResponse");
    expect(
      openapi.paths["/moves/{moveId}/movable-units/batch-upsert"]?.post
        ?.operationId,
    ).toBe("batchUpsertMovableUnits");
    expect(
      openapi.paths["/moves/{moveId}/movable-units/batch-upsert"]?.post
        ?.requestBody.content?.["application/json"],
    ).toMatchObject({
      schema: {
        $ref: "#/components/schemas/MovableUnitsBatchUpsertRequest",
      },
    });
    expect(
      openapi.components.schemas.MovableUnitsBatchUpsertRequest.properties
        ?.units?.items?.$ref,
    ).toBe("#/components/schemas/MovableUnitInput");
    expect(openapi.components.schemas.MovableUnitInput.oneOf).toEqual([
      { $ref: "#/components/schemas/MovableUnitBoxInput" },
      { $ref: "#/components/schemas/MovableUnitLooseItemInput" },
    ]);
    expect(
      openapi.components.schemas.MovableUnitBoxInput.allOf?.[1]?.properties
        ?.count?.description,
    ).toContain("12 medium boxes");
    expect(
      openapi.components.schemas.MovableUnitBoxInput.allOf?.[1]?.properties
        ?.photoIds?.description,
    ).toContain("Do not combine with count");
    expect(openapi.components.schemas.BoxInput.properties).toHaveProperty(
      "containerType",
    );
    expect(openapi.components.schemas.Box.properties).toHaveProperty(
      "containerType",
    );
    expect(
      openapi.components.schemas.MovableUnitLooseItemInput.allOf?.[1]
        ?.properties?.externalId?.description,
    ).toContain("retries update the same movable unit");
    expect(openapi.components.schemas.BoxInput.properties).toHaveProperty(
      "assignedResourceId",
    );
    expect(openapi.components.schemas.ItemInput.properties).toHaveProperty(
      "assignedZoneId",
    );
    expect(
      openapi.components.schemas.ErrorResponse.properties?.error?.properties
        ?.code?.enum,
    ).toEqual(
      expect.arrayContaining(["stable_key_required", "idempotency_required"]),
    );
    expect(openapi.components.schemas.MovableUnitSummary.required).toEqual([
      "total",
      "boxes",
      "looseItems",
      "knownWeightLb",
      "knownVolumeCuFt",
      "missingWeight",
      "missingDimensions",
      "missingVolume",
      "assigned",
      "unassigned",
      "measurementRoute",
      "gapExamples",
      "assignmentExamples",
    ]);
    expect(
      openapi.components.schemas.MovableUnitSummary.properties?.knownWeightLb
        ?.description,
    ).toContain("Known estimated weight");
    expect(
      openapi.components.schemas.MovableUnitSummary.properties?.gapExamples
        ?.items?.$ref,
    ).toBe("#/components/schemas/MovableUnitGapExample");
    expect(
      openapi.components.schemas.MovableUnitSummary.properties?.measurementRoute
        ?.items?.$ref,
    ).toBe("#/components/schemas/MovableUnitMeasurementRouteGroup");
    expect(
      openapi.components.schemas.MovableUnitSummary.properties
        ?.assignmentExamples?.items?.$ref,
    ).toBe("#/components/schemas/MovableUnitAssignmentExample");
    expect(
      openapi.components.schemas.MovableUnitGapExample.properties?.missingFields
        ?.items?.enum,
    ).toEqual(["weight", "dimensions", "volume"]);
    expect(
      openapi.components.schemas.MovableUnitGapExample.properties
        ?.measurementPatchHint?.$ref,
    ).toBe("#/components/schemas/MovableUnitMeasurementPatchHint");
    expect(
      openapi.components.schemas.MovableUnitAssignmentExample.properties
        ?.assignmentPatchHint?.$ref,
    ).toBe("#/components/schemas/MovableUnitAssignmentPatchHint");
    expect(
      openapi.components.schemas.MovableUnitMeasurementRouteGroup.properties
        ?.gapExamples?.items?.$ref,
    ).toBe("#/components/schemas/MovableUnitGapExample");
    expect(
      openapi.components.schemas.MovableUnitMeasurementRouteGroup.properties
        ?.assignmentExamples?.items?.$ref,
    ).toBe("#/components/schemas/MovableUnitAssignmentExample");
    expect(
      openapi.components.schemas.MovableUnitMeasurementPatchHint.properties
        ?.tool?.enum,
    ).toEqual(["batch_upsert_movable_units"]);
    expect(
      openapi.components.schemas.MovableUnitAssignmentPatchHint.properties?.tool
        ?.enum,
    ).toEqual(["apply_assignments"]);
    expect(
      openapi.components.schemas.MoveSummaryResponse.properties?.data
        ?.properties?.movableUnitSummary?.$ref,
    ).toBe("#/components/schemas/MovableUnitSummary");
    expect(
      openapi.components.schemas.AgentContextResponse.properties?.data
        ?.properties?.movableUnitSummary?.$ref,
    ).toBe("#/components/schemas/MovableUnitSummary");
    expect(docs).toContain("one user photo should normally mean one");
    expect(docs).toContain("`add_item_from_photo`");
    expect(docs).toContain("`save_box_intake`");
    expect(docs).toContain("`upload_photo`");
    expect(docs).toContain("`upload_photos`");
    expect(docs).toContain("`POST /images/upload`");
    expect(docs).toContain("clearly shows several identical units");
    expect(docs).toContain("Resolve the target item");
    expect(docs).toContain("`agentReview`");
    expect(docs).toContain("`derivativeVariants`");
    expect(docs).toContain("`media.display`");
    expect(docs).toContain("`offset`");
    expect(docs).toContain("200x200 square");
    expect(docs).toContain("`generateAiSuggestions: true`");
    expect(docs).toContain("rough-load view");
    expect(docs).toContain("total boxes plus large loose items");
    expect(docs).toContain("missing weight, dimensions, or volume");
    expect(docs).toContain("include `assignedResourceId`");
    expect(docs).toContain("`measurementRoute`");
    expect(docs).toContain("room/source area");
    expect(docs).toContain("`assignmentExamples`");
    expect(docs).toContain("`measurementPatchHint`");
    expect(docs).toContain("`assignmentPatchHint`");
    expect(docs).toContain("numbered box range");
    expect(docs).toContain("one box row per code");
    expect(docs).toContain("MCP refresh and reconnect recovery");
    expect(docs).toContain("disconnect");
    expect(docs).toContain("reconnect the MovingManifest connector");
    expect(llms).toContain("MCP agents should call");
    expect(llms).toContain("add_item_from_photo");
    expect(llms).toContain("save_box_intake");
    expect(llms).toContain("upload_photo");
    expect(llms).toContain("upload_photos");
    expect(llms).toContain("photo clearly shows a count");
    expect(llms).toContain("existing `itemId`");
    expect(llms).toContain("include `assignedResourceId`");
    expect(llms).toContain("optional `assignedZoneId`");
    expect(llms).toContain("boxes 1-25");
    expect(llms).toContain("one box row per");
    expect(llms).toContain("count: 12");
    expect(llms).toContain("movableUnitSummary");
    expect(llms).toContain("measurementRoute");
    expect(llms).toContain("known weight/volume");
    expect(llms).toContain("bounded assignment");
    expect(llms).toContain("measurementPatchHint.target");
    expect(llms).toContain("assignmentPatchHint.target");
    expect(llms).toContain("only the new weight, dimensions, volume, or assignment fields");
    expect(llms).toContain("When opening a rough box later");
    expect(llms).toContain("`boxId`");
    expect(llms).toContain("`boxCode`");
    expect(llms).toContain("`photoIds`");
    expect(llms).toContain("`packedItems`");
    expect(llms).toContain("verification `nextStep`");
    expect(llms).toContain("media metadata includes");
    expect(llms).toContain("attachMediaPhotoIds");
    expect(llms).toContain("boxAssignments");
    expect(llms).toContain("refresh MCP tools");
    expect(llms).toContain("connector URL to");
    expect(llms).toContain("Allow all");
    expect(llms).toContain("fresh OAuth credentials");
    expect(llms).toContain("POST /api/v1/images/upload");
    expect(llms).toContain("agentReview");
    expect(llms).toContain("derivativeVariants");
    expect(llms).toContain("media.display");
    expect(llms).toContain("generateAiSuggestions: true");
    expect(fullLlms).toContain(
      "One user photo should normally be one upload call",
    );
    expect(fullLlms).toContain("add_item_from_photo");
    expect(fullLlms).toContain("save_box_intake");
    expect(fullLlms).toContain("upload_photos");
    expect(fullLlms).toContain("one existing item");
    expect(fullLlms).toContain("batch_upsert_movable_units");
    expect(fullLlms).toContain("include `assignedResourceId`");
    expect(fullLlms).toContain("`assignedZoneId`");
    expect(fullLlms).toContain("B-001-B-025");
    expect(fullLlms).toContain("one box row per code");
    expect(fullLlms).toContain("count: 12");
    expect(fullLlms).toContain("movableUnitSummary");
    expect(fullLlms).toContain("measurementRoute");
    expect(fullLlms).toContain("ordinary unboxed detailed inventory");
    expect(fullLlms).toContain("known weight/volume");
    expect(fullLlms).toContain("bounded assignment");
    expect(fullLlms).toContain("measurementPatchHint.target");
    expect(fullLlms).toContain("assignmentPatchHint.target");
    expect(fullLlms).toContain("only the new weight, dimensions");
    expect(fullLlms).toContain("volume, or assignment fields");
    expect(fullLlms).toContain("When opening a rough box later");
    expect(fullLlms).toContain("`boxId`");
    expect(fullLlms).toContain("`boxCode`");
    expect(fullLlms).toContain("`photoIds`");
    expect(fullLlms).toContain("`packedItems`");
    expect(fullLlms).toContain("verification `nextStep`");
    expect(fullLlms).toContain("queue media or the queue target points");
    expect(fullLlms).toContain("targetBoxCode");
    expect(fullLlms).toContain("fresh assistant session");
    expect(fullLlms).toContain("human setup page");
    expect(fullLlms).toContain("Allow all");
    expect(fullLlms).toContain("disconnect and reconnect");
    expect(fullLlms).toContain("committedItems` plus");
    expect(fullLlms).toContain("boxAssignments");
    expect(fullLlms).toContain("replacement box");
    expect(fullLlms).toContain("sets quantity only when the user says it");
    expect(fullLlms).toContain("POST /images/upload");
    expect(fullLlms).toContain("agentReview");
    expect(fullLlms).toContain("derivativeVariants");
    expect(fullLlms).toContain("media.display");
    expect(fullLlms).toContain("aiReview.status");
  });

  it("keeps capability ids unique for agent discovery", () => {
    const ids = MOVINGMANIFEST_API_CAPABILITIES.map((entry) => entry.id);

    expect(ids).toHaveLength(new Set(ids).size);
  });

  it("keeps capability object literals free of duplicate top-level keys", () => {
    const source = readFileSync(
      resolve(process.cwd(), "mcp-server/capabilities.mjs"),
      "utf8",
    );
    const duplicates = capabilitySourceObjects(source).flatMap(
      (objectLines, index) =>
        duplicateTopLevelKeys(objectLines).map(
          (key) => `capability ${index + 1}: ${key}`,
        ),
    );

    expect(duplicates).toEqual([]);
  });

  it("keeps the API/MCP guide tool table exactly synced with capability discovery", () => {
    const docs = readFileSync(
      resolve(process.cwd(), "docs/api-and-mcp.md"),
      "utf8",
    );
    const documentedToolNames = documentedMcpToolNames(docs);

    expect(documentedToolNames).toEqual([...new Set(documentedToolNames)]);
    expect(documentedToolNames.sort()).toEqual(
      [...getCapabilityToolNames()].sort(),
    );
  });

  it("keeps documented floor-plan JSON op examples valid", () => {
    const docs = readFileSync(
      resolve(process.cwd(), "docs/api-and-mcp.md"),
      "utf8",
    );
    const start = docs.indexOf("## Floor Plans");
    const end = docs.indexOf("## Evidence Media", start);
    const section = docs.slice(start, end);
    const blocks = [...section.matchAll(/```json\n([\s\S]*?)\n```/g)].map(
      (match) => JSON.parse(match[1]),
    );

    expect(blocks.length).toBeGreaterThanOrEqual(4);
    for (const block of blocks) {
      const ops = Array.isArray(block.ops) ? block.ops : [block];
      for (const op of ops) {
        expect(() => planOpSchema.parse(op)).not.toThrow();
      }
    }
  });

  it("exports stable summary metadata for non-MCP callers", () => {
    expect(getApiCapabilities()).toMatchObject({
      product: "MovingManifest",
      apiVersion: "v1",
      defaultBaseUrl: "https://movingmanifest.com/api/v1",
      summary: {
        statuses: {
          available: expect.any(Number),
        },
      },
      connectionRecovery: {
        staleToolSymptoms: expect.arrayContaining([
          expect.stringContaining("https://movingmanifest.com/mcp"),
          expect.stringContaining("Invalid API key format"),
        ]),
        agentActions: expect.arrayContaining([
          expect.stringContaining("https://movingmanifest.com/api/mcp"),
          expect.stringContaining("Allow all"),
          expect.stringContaining("disconnect and reconnect"),
        ]),
      },
    });
    expect(getApiCapabilities().summary.statuses).not.toHaveProperty(
      "availableWithOperationalBlocker",
    );
  });
});
