import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  getApiCapabilities,
  getCapabilityToolNames,
  ASSISTWITHMOVING_API_CAPABILITIES,
} from "../../mcp-server/capabilities.mjs";
import {
  ASSISTWITHMOVING_TRUSTED_HELPER_MCP_TOOLS,
  createAllowedToolFilter,
  planOpSchema,
  registerTools,
} from "../../mcp-server/assistwithmoving-mcp.mjs";

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
    status: string;
    agentWorkflows?: string[];
    operationalBlockers?: string[];
  }>;
  knownLaunchBlockers: Array<{
    issue: string;
  }>;
};

function capabilitySourceObjects(source: string) {
  const start = source.indexOf("export const ASSISTWITHMOVING_API_CAPABILITIES = [");
  const end = source.indexOf("];", start);
  if (start === -1 || end === -1) {
    throw new Error("Could not locate ASSISTWITHMOVING_API_CAPABILITIES source.");
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

/**
 * The canonical catalog, read from the shipped transport rather than retyped.
 *
 * Parsed from source instead of imported because `convex/httpRoutes/mcp.ts`
 * pulls in Convex codegen and the MCP SDK; the point here is only that the
 * documentation cannot drift from the array a deployment actually serves.
 */
function canonicalToolNames(): string[] {
  const source = readFileSync(
    resolve(process.cwd(), "convex/httpRoutes/mcp.ts"),
    "utf8",
  );
  const block = source.match(
    /export const STATELESS_MOVING_TOOL_NAMES = \[([\s\S]*?)\] as const;/,
  );
  if (!block) {
    throw new Error("Could not locate STATELESS_MOVING_TOOL_NAMES.");
  }
  const names = [...block[1].matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);
  if (names.length === 0) {
    throw new Error("STATELESS_MOVING_TOOL_NAMES parsed as empty.");
  }
  return names;
}

function collectToolRegistrations(options?: { allowedToolNames?: readonly string[] }) {
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
        handler: (input: unknown) => Promise<ToolResult>
      ) => {
        registrations.set(name, { options, handler });
      },
    },
    {
      baseUrl: "https://example.com/api/v1",
      apiKey: "mmk_test_secret",
    },
    options
  );

  return registrations;
}

describe("Assist With Moving MCP capability discovery", () => {
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
      ASSISTWITHMOVING_API_CAPABILITIES.length
    );
    expect(payload.capabilities.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "moveSetup",
        "moveQuestions",
        "inventory",
        "transportPlanning",
        "documentationProfiles",
        "publicSharing",
        "queueHandoffs",
      ])
    );
    expect(payload.capabilities).toContainEqual(
      expect.objectContaining({
        id: "queueHandoffs",
        status: "available",
        requiredScopes: ["queue/read", "queue/write"],
        purpose: expect.stringContaining("API key"),
        mcpTools: expect.arrayContaining([
          "list_queue_items",
          "claim_queue_item",
          "request_queue_input",
          "complete_queue_item",
          "report_queue_failure",
        ]),
      }),
    );
    expect(payload.capabilities).toContainEqual(
      expect.objectContaining({
        id: "inventory",
        restEndpoints: expect.arrayContaining([
          "POST /api/v1/items/:itemId/convert-to-box",
        ]),
        mcpTools: expect.arrayContaining([
          "archive_item",
          "convert_item_to_box",
        ]),
      }),
    );
    expect(payload.capabilities).toContainEqual(
      expect.objectContaining({
        id: "photoEvidence",
        status: "available",
      })
    );
    expect(payload.knownLaunchBlockers.map((blocker) => blocker.issue)).toEqual(
      expect.arrayContaining(["MOVE-63", "MOVE-68"])
    );
    expect(payload.knownLaunchBlockers.map((blocker) => blocker.issue)).not.toContain(
      "MOVE-66"
    );

    vi.unstubAllGlobals();
  });

  it("registers exactly the MCP tools represented in the capability matrix", () => {
    const registeredToolNames = [...collectToolRegistrations().keys()].sort();

    expect(registeredToolNames).toEqual([...getCapabilityToolNames()].sort());
  });

  it("advertises the Layout Studio floor-plan tools and scopes", () => {
    expect(ASSISTWITHMOVING_API_CAPABILITIES).toContainEqual(
      expect.objectContaining({
        id: "floorPlans",
        requiredScopes: ["plans/read", "plans/write"],
        mcpTools: [
          "plans_list",
          "plan_get",
          "plan_summary",
          "plan_apply_ops",
          "plan_propose_ops",
          "plan_snapshot",
        ],
      }),
    );
  });

  it("advertises the one-call move setup tool and scopes", () => {
    expect(ASSISTWITHMOVING_API_CAPABILITIES).toContainEqual(
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

    expect(addItemFromPhotoOptions?.description).toContain(
      "photo clearly shows a count",
    );
    expect(uploadPhotosOptions?.description).toContain("existing itemId");

    expect(ASSISTWITHMOVING_API_CAPABILITIES).toContainEqual(
      expect.objectContaining({
        id: "photoEvidence",
        restEndpoints: expect.arrayContaining([
          "POST /api/v1/photos/upload",
          "POST /api/v1/images/upload",
        ]),
        mcpTools: expect.arrayContaining([
          "add_item_from_photo",
          "create_item_with_images",
          "upload_evidence_image",
          "upload_evidence_images",
          "upload_photo",
          "upload_photos",
          "upload_image",
          "upload_images",
        ]),
        agentWorkflows: expect.arrayContaining([
          expect.stringContaining("add_item_from_photo"),
          expect.stringContaining("create_item_with_images"),
          expect.stringContaining("upload_image"),
          expect.stringContaining("upload_images"),
          expect.stringContaining("existing item"),
          expect.stringContaining("photo clearly shows a count"),
          expect.stringContaining("generateAiSuggestions true"),
          expect.stringContaining("Do not ask the user for dimensions"),
        ]),
      }),
    );
  });

  it("advertises save_box_intake as the preferred one-call box workflow", () => {
    const registrations = collectToolRegistrations();
    const saveBoxOptions = registrations.get("save_box_intake")?.options as
      | { description?: string; inputSchema?: Record<string, unknown> }
      | undefined;

    expect(saveBoxOptions?.description).toContain("One-call workflow");
    expect(saveBoxOptions?.description).toContain("idempotencyKey");
    expect(saveBoxOptions?.inputSchema).toHaveProperty("box");
    expect(saveBoxOptions?.inputSchema).toHaveProperty("photos");
    expect(saveBoxOptions?.inputSchema).toHaveProperty("contents");
    expect(saveBoxOptions?.inputSchema).toHaveProperty("linkedItems");

    expect(ASSISTWITHMOVING_API_CAPABILITIES).toContainEqual(
      expect.objectContaining({
        id: "boxes",
        requiredScopes: ["inventory/read", "inventory/write", "photos/write"],
        mcpTools: expect.arrayContaining(["save_box_intake"]),
        agentWorkflows: expect.arrayContaining([
          expect.stringContaining("save_box_intake"),
          expect.stringContaining("idempotencyKey"),
        ]),
      }),
    );
  });

  it("update_move schema accepts null for clearable fields", () => {
    type FieldSchema = {
      safeParse: (value: unknown) => { success: boolean };
      description?: string;
    };
    const updateMoveOptions = collectToolRegistrations().get("update_move")
      ?.options as { inputSchema?: Record<string, FieldSchema> } | undefined;
    const inputSchema = updateMoveOptions?.inputSchema;
    if (!inputSchema) {
      throw new Error("update_move inputSchema was not registered.");
    }

    for (const field of [
      "notes",
      "distanceMiles",
      "travelMinutes",
      "moveLevelWeightAllowanceLb",
    ]) {
      expect(inputSchema[field].safeParse(null).success).toBe(true);
    }
    expect(inputSchema.notes.safeParse("Updated notes").success).toBe(true);
    expect(inputSchema.distanceMiles.safeParse(12).success).toBe(true);
    expect(inputSchema.travelMinutes.safeParse(12).success).toBe(true);
    expect(inputSchema.moveLevelWeightAllowanceLb.safeParse(12).success).toBe(true);

    expect(inputSchema.title.safeParse(null).success).toBe(false);
    expect(inputSchema.moveId.safeParse(null).success).toBe(false);

    expect(inputSchema.notes.description).toContain("null clears");
  });

  it("offers a smaller trusted-helper MCP tool set for hosted assistants", () => {
    const filter = createAllowedToolFilter(ASSISTWITHMOVING_TRUSTED_HELPER_MCP_TOOLS);
    const registrations = collectToolRegistrations({
      allowedToolNames: ASSISTWITHMOVING_TRUSTED_HELPER_MCP_TOOLS,
    });
    const toolNames = [...registrations.keys()].sort();

    expect(ASSISTWITHMOVING_TRUSTED_HELPER_MCP_TOOLS).toHaveLength(33);
    expect(filter("save_box_intake")).toBe(true);
    expect(filter("create_box")).toBe(false);
    expect(toolNames).toContain("save_box_intake");
    expect(toolNames).toContain("setup_move");
    expect(toolNames).toContain("update_move");
    expect(toolNames).not.toContain("create_box");
    expect(toolNames).not.toContain("add_items_to_box");
    expect(toolNames).not.toContain("remove_item_from_box");
    expect(toolNames).not.toContain("delete_item");
    expect(toolNames).not.toContain("archive_documentation_profile");
  });

  it("validates save_box_intake before making write requests", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const registration = collectToolRegistrations().get("save_box_intake");
    if (!registration) throw new Error("save_box_intake was not registered.");

    const result = await registration.handler({
      moveId: "codex-test-move",
      box: { label: "Office box" },
      photos: [
        {
          sourceUrl: "https://example.com/codex-test-box.jpg",
          dataUrl: "data:image/jpeg;base64,Y29kZXgtdGVzdA==",
        },
      ],
    });
    const payload = JSON.parse(result.content[0].text);

    expect(result).toHaveProperty("isError", true);
    expect(payload.error).toContain("idempotencyKey is required");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("allows save_box_intake dry runs to preview a new box without an idempotency key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const registration = collectToolRegistrations().get("save_box_intake");
    if (!registration) throw new Error("save_box_intake was not registered.");

    const result = await registration.handler({
      moveId: "codex-test-move",
      dryRun: true,
      box: {
        label: "Office box",
        dimensionsIn: { lengthIn: 18, widthIn: 12, heightIn: 12 },
        actualWeightLb: 24,
      },
    });
    const payload = JSON.parse(result.content[0].text);

    expect(result).not.toHaveProperty("isError", true);
    expect(payload.dryRun).toBe(true);
    expect(payload.box.request).toMatchObject({
      method: "POST",
      path: "/moves/codex-test-move/boxes",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("runs save_box_intake in mock write order with synthetic fixture ids", async () => {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const parsed = new URL(String(url));
      const path = parsed.pathname;
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method, path, body });

      const data = path.endsWith("/boxes")
        ? { data: { boxId: "codex-test-box-1" } }
        : path.endsWith("/photos/upload")
          ? {
              data: {
                photoId: `codex-test-photo-${calls.length}`,
                derivativeStatus: "pending",
                media: { mimeType: "image/jpeg" },
              },
            }
          : path.endsWith("/items/batch-upsert")
            ? {
                data: {
                  dryRun: false,
                  total: 1,
                  succeeded: 1,
                  failed: 0,
                  results: [
                    {
                      index: 0,
                      ok: true,
                      action: "create",
                      itemId: "codex-test-item-1",
                    },
                  ],
                },
              }
            : path.endsWith("/boxes/codex-test-box-1/items")
              ? { data: { ok: true } }
              : { data: {} };

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const registration = collectToolRegistrations().get("save_box_intake");
    if (!registration) throw new Error("save_box_intake was not registered.");

    const result = await registration.handler({
      moveId: "codex-test-move",
      idempotencyKey: "codex-test-box-intake-001",
      box: {
        code: "codex-test-office-001",
        label: "Office box",
        dimensionsIn: { lengthIn: 18, widthIn: 12, heightIn: 12 },
        actualWeightLb: 24,
      },
      photos: [
        {
          sourceUrl: "https://example.com/codex-test-box.jpg",
          caption: "Open codex test office box",
        },
      ],
      contents: [
        {
          name: "codex-test cookbooks",
          quantity: 3,
          images: [
            {
              sourceUrl: "https://example.com/codex-test-cookbooks.jpg",
              caption: "Cookbooks in the box",
            },
          ],
        },
      ],
      linkedItems: [{ itemId: "codex-test-existing-item", quantity: 1 }],
      continueOnImageError: false,
    });
    const payload = JSON.parse(result.content[0].text);

    expect(result).not.toHaveProperty("isError", true);
    expect(payload.boxId).toBe("codex-test-box-1");
    expect(payload.summary.describedContentCount).toBe(1);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "POST /api/v1/moves/codex-test-move/boxes",
      "POST /api/v1/photos/upload",
      "POST /api/v1/moves/codex-test-move/items/batch-upsert",
      "POST /api/v1/boxes/codex-test-box-1/items",
      "POST /api/v1/boxes/codex-test-box-1/items",
      "POST /api/v1/photos/upload",
    ]);
    expect(calls[2].body).toMatchObject({
      items: [expect.objectContaining({ name: "codex-test cookbooks" })],
    });
    expect(calls[3].body).toMatchObject({
      itemId: "codex-test-item-1",
    });
    expect(calls[4].body).toMatchObject({
      itemId: "codex-test-existing-item",
    });
    vi.unstubAllGlobals();
  });

  it("documents the one-call image upload path for OpenAPI and AI readers", () => {
    type OpenApiSchema = {
      description?: string;
      properties?: Record<string, OpenApiSchema>;
    };
    const openapi = JSON.parse(
      readFileSync(resolve(process.cwd(), "public/openapi.json"), "utf8")
    ) as {
      paths: Record<
        string,
        {
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
      };
    };
    const docs = readFileSync(
      resolve(process.cwd(), "docs/api-and-mcp.md"),
      "utf8"
    );
    const llms = readFileSync(resolve(process.cwd(), "public/llms.txt"), "utf8");
    const fullLlms = readFileSync(
      resolve(process.cwd(), "public/llms-full.txt"),
      "utf8"
    );

    expect(openapi.paths["/photos/upload"]?.post?.operationId).toBe(
      "uploadPhotoEvidenceImage"
    );
    expect(openapi.paths["/images/upload"]?.post?.operationId).toBe(
      "uploadImageEvidenceImage"
    );
    expect(
      openapi.paths["/photos/upload"]?.post?.requestBody.content
    ).toHaveProperty("multipart/form-data");
    expect(
      openapi.paths["/images/upload"]?.post?.requestBody.content
    ).toHaveProperty("multipart/form-data");
    expect(
      openapi.paths["/photos/upload"]?.post?.requestBody.content
    ).toHaveProperty("image/jpeg");
    expect(openapi.components.schemas.PhotoDirectUpload.description).toContain(
      "Provide exactly one of sourceUrl, dataUrl, or fileBase64"
    );
    expect(openapi.components.schemas.PhotoDirectUpload.description).toContain(
      "generateAiSuggestions true"
    );
    expect(openapi.components.schemas.PhotoMultipartUpload.description).toContain(
      "Multipart one-call"
    );
    expect(
      openapi.components.schemas.PhotoDirectUpload.properties?.fileBase64
        ?.description
    ).toContain("local image file");
    expect(
      openapi.components.schemas.PhotoDirectUpload.properties
        ?.generateAiSuggestions?.description
    ).toContain("queue AI photo-intake suggestions");
    expect(
      openapi.components.schemas.PhotoDirectUploadResponse.properties?.data
        ?.properties?.agentReview?.description
    ).toContain("assistant-facing summary");
    expect(
      openapi.components.schemas.PhotoDirectUploadResponse.properties?.data
        ?.properties?.derivativeVariants?.description
    ).toContain("thumb/card/detail/full derivative contract");
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
    expect(docs).toContain("one user photo should normally mean one");
    expect(docs).toContain("`add_item_from_photo`");
    expect(docs).toContain("`upload_evidence_image` call");
    expect(docs).toContain("`upload_evidence_images`");
    expect(docs).toContain("`upload_photo`");
    expect(docs).toContain("`upload_photos`");
    expect(docs).toContain("`upload_image`");
    expect(docs).toContain("`upload_images`");
    expect(docs).toContain("`POST /images/upload`");
    expect(docs).toContain("clearly shows several identical units");
    expect(docs).toContain("Resolve the target item");
    expect(docs).toContain("`agentReview`");
    expect(docs).toContain("`derivativeVariants`");
    expect(docs).toContain("200x200 square");
    expect(docs).toContain("`generateAiSuggestions: true`");
    expect(llms).toContain("MCP agents should call");
    expect(llms).toContain("add_item_from_photo");
    expect(llms).toContain("upload_photo");
    expect(llms).toContain("upload_image");
    expect(llms).toContain("upload_evidence_images");
    expect(llms).toContain("photo clearly shows a count");
    expect(llms).toContain("existing `itemId`");
    expect(llms).toContain("POST /api/v1/images/upload");
    expect(llms).toContain("agentReview");
    expect(llms).toContain("derivativeVariants");
    expect(llms).toContain("generateAiSuggestions: true");
    expect(fullLlms).toContain("One user photo should normally be one upload call");
    expect(fullLlms).toContain("add_item_from_photo");
    expect(fullLlms).toContain("upload_photos");
    expect(fullLlms).toContain("upload_images");
    expect(fullLlms).toContain("upload_evidence_images");
    expect(fullLlms).toContain("one existing item");
    expect(fullLlms).toContain("sets quantity only when the user says it");
    expect(fullLlms).toContain("POST /images/upload");
    expect(fullLlms).toContain("agentReview");
    expect(fullLlms).toContain("derivativeVariants");
    expect(fullLlms).toContain("aiReview.status");
  });

  it("keeps capability ids unique for agent discovery", () => {
    const ids = ASSISTWITHMOVING_API_CAPABILITIES.map((entry) => entry.id);

    expect(ids).toHaveLength(new Set(ids).size);
  });

  it("keeps capability object literals free of duplicate top-level keys", () => {
    const source = readFileSync(
      resolve(process.cwd(), "mcp-server/capabilities.mjs"),
      "utf8"
    );
    const duplicates = capabilitySourceObjects(source).flatMap(
      (objectLines, index) =>
        duplicateTopLevelKeys(objectLines).map(
          (key) => `capability ${index + 1}: ${key}`
        )
    );

    expect(duplicates).toEqual([]);
  });

  it("keeps the API/MCP guide tool table synced with capability discovery", () => {
    const docs = readFileSync(
      resolve(process.cwd(), "docs/api-and-mcp.md"),
      "utf8"
    );

    for (const toolName of getCapabilityToolNames()) {
      expect(docs).toContain(`\`${toolName}\``);
    }
  });

  it("keeps documented floor-plan JSON op examples valid", () => {
    const docs = readFileSync(
      resolve(process.cwd(), "docs/api-and-mcp.md"),
      "utf8"
    );
    const start = docs.indexOf("## Floor Plans");
    const end = docs.indexOf("## Evidence Media", start);
    const section = docs.slice(start, end);
    // Tolerate CRLF (Windows checkouts) as well as LF line endings.
    const blocks = [...section.matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g)].map(
      (match) => JSON.parse(match[1])
    );

    expect(blocks.length).toBeGreaterThanOrEqual(4);
    for (const block of blocks) {
      const ops = Array.isArray(block.ops) ? block.ops : [block];
      for (const op of ops) {
        expect(() => planOpSchema.parse(op)).not.toThrow();
      }
    }
  });

  it("keeps the documented legacy compatibility catalog distinct from the canonical one", () => {
    const legacySource = readFileSync(
      resolve(process.cwd(), "convex/mcp.ts"),
      "utf8",
    );
    const legacyToolNames = [
      ...legacySource.matchAll(/^ {4}name: "([a-z_]+)",$/gm),
    ].map((match) => match[1]);

    // The two OAuth doors must not be describable as one catalog. If this ever
    // becomes true, the docs claiming they differ need rewriting, not muting.
    expect(legacyToolNames.length).toBeGreaterThan(
      canonicalToolNames().length,
    );
    expect(
      legacyToolNames.filter((name) => canonicalToolNames().includes(name)),
    ).toEqual([]);
  });

  it("exports stable summary metadata for non-MCP callers", () => {
    expect(getApiCapabilities()).toMatchObject({
      product: "Assist With Moving",
      apiVersion: "v1",
      defaultBaseUrl: "https://movingmanifest.com/api/v1",
      summary: {
        statuses: {
          available: expect.any(Number),
        },
      },
    });
    expect(getApiCapabilities().summary.statuses).not.toHaveProperty(
      "availableWithOperationalBlocker"
    );
  });
});

/**
 * Every human- and AI-facing Bring Your AI surface, guarded against the three
 * ways this documentation has historically gone wrong: a tool list that drifts
 * from the code, a named AI product described as working, and four doors
 * blurred into one.
 */
const BRING_YOUR_AI_SURFACES = [
  "public/ai.txt",
  "public/llms.txt",
  "public/llms-full.txt",
  "src/app/(marketing)/ai/page.tsx",
  "src/app/(marketing)/ai/start/page.tsx",
  "src/app/(marketing)/mcp/guide/page.tsx",
] as const;

/** Surfaces that publish the catalog itself, and how to read it back out. */
const CATALOG_SURFACES = [
  { path: "public/ai.txt", after: "Exact canonical tools" },
  { path: "public/llms.txt", after: "exposes exactly these tools" },
  { path: "public/llms-full.txt", after: "Canonical tools and the scope" },
  { path: "src/app/(marketing)/ai/page.tsx", marker: true },
  { path: "src/app/(marketing)/mcp/guide/page.tsx", marker: true },
] as const;

function surfaceText(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/** Tool names from a plain-text bullet list that follows a named heading. */
function documentedListCatalog(text: string, after: string) {
  const start = text.indexOf(after);
  if (start === -1) throw new Error(`Missing catalog heading: ${after}`);
  const names: string[] = [];
  for (const line of text.slice(start).split("\n").slice(1)) {
    const match = line.match(/^- `?([a-z_]+)`?\b/);
    if (match) {
      names.push(match[1]);
      continue;
    }
    if (names.length > 0 && line.trim() !== "") break;
  }
  return names;
}

/** Tool names from the marked catalog literal inside a page component. */
function documentedMarkerCatalog(text: string) {
  const start = text.indexOf("canonical-tool-catalog:start");
  const end = text.indexOf("canonical-tool-catalog:end");
  if (start === -1 || end === -1) {
    throw new Error("Missing canonical-tool-catalog markers.");
  }
  return [...text.slice(start, end).matchAll(/"([a-z_]+)"/g)].map(
    (match) => match[1],
  );
}

describe("Bring Your AI documentation truth", () => {
  it("publishes exactly the shipped canonical tool catalog on every surface that lists it", () => {
    const expected = canonicalToolNames();

    expect(expected).toContain("describe_connection");
    for (const surface of CATALOG_SURFACES) {
      const text = surfaceText(surface.path);
      const documented =
        "marker" in surface
          ? documentedMarkerCatalog(text)
          : documentedListCatalog(text, surface.after);

      // Exact, ordered, no extras: a tool added to or removed from the
      // transport must be reflected here before the docs can pass again.
      expect(documented, `catalog drift in ${surface.path}`).toEqual(expected);
    }
  });

  it("names no AI product as working, and gives no client-specific setup steps", () => {
    // Naming a product as an example of the category would still invite the
    // reading this program must prevent, so these surfaces name none at all.
    const forbidden =
      /\b(claude|chatgpt|openai|codex|cowork|anthropic|gemini|grok|hermes|copilot|llama|mistral)\b/i;

    for (const path of BRING_YOUR_AI_SURFACES) {
      const offending = surfaceText(path)
        .split("\n")
        .filter((line) => forbidden.test(line));

      expect(offending, `named client claim in ${path}`).toEqual([]);
    }
  });

  it("names the same canonical endpoint everywhere", () => {
    for (const path of BRING_YOUR_AI_SURFACES) {
      expect(surfaceText(path), path).toContain("https://movingmanifest.com/mcp");
    }
  });

  it("describes all four doors distinctly on every surface", () => {
    for (const path of BRING_YOUR_AI_SURFACES) {
      const text = surfaceText(path);

      expect(text, `${path} must name the legacy door`).toContain(
        "https://movingmanifest.com/mcp/connect",
      );
      expect(text, `${path} must name the API-key door`).toContain(
        "https://movingmanifest.com/api/mcp",
      );
      expect(text, `${path} must name the local stdio package`).toContain(
        "assistwithmoving-mcp",
      );
      expect(text, `${path} must name the key format`).toContain("mmk_");
      // The catalogs differ; saying so is the whole point of naming them.
      expect(text, `${path} must not imply one shared catalog`).toMatch(
        /a\s+different[\s,]*(and\s+)?(larger[\s,]*)?catalog/i,
      );
    }
  });

  it("states the honest capability position instead of the retired eight-tool claim", () => {
    for (const path of BRING_YOUR_AI_SURFACES) {
      const text = surfaceText(path);

      expect(text, `${path} must state Partial`).toMatch(/\bPartial\b/);
      expect(text, `${path} must explain the grant`).toMatch(/\bgrant\b/i);
      expect(text, `${path} must separate sign-in from permission`).toMatch(
        /signing in is not permission|signing in proves who|proves who is calling|sign-in ties calls/i,
      );
      expect(text, `${path} must not claim eight tools`).not.toMatch(
        /eight (workflow |structured |canonical )?tools/i,
      );
    }
  });

  it("documents the guidance an AI needs to work the connection safely", () => {
    const agentSurfaces = [
      "public/ai.txt",
      "public/llms.txt",
      "public/llms-full.txt",
    ];

    for (const path of agentSurfaces) {
      const text = surfaceText(path);

      expect(text, `${path} first call`).toMatch(/`?get_move_brief`? first/i);
      expect(text, `${path} search first`).toMatch(
        /search[\s\S]{0,60}before creating/i,
      );
      expect(text, `${path} evidence rule`).toMatch(
        /get_evidence_media[\s\S]{0,200}storage URL|storage URL[\s\S]{0,200}get_evidence_media/i,
      );
      expect(text, `${path} one-call save`).toContain("completeQueueItem");
      expect(text, `${path} queue loop`).toContain("list_queue_work");
      expect(text, `${path} idempotency`).toMatch(/operationId/);
      expect(text, `${path} stale tools`).toMatch(
        /stale|disconnect and reconnect|disconnect,? then reconnect/i,
      );
      expect(text, `${path} client identity`).toMatch(
        /Client ID Metadata Document/i,
      );
      expect(text, `${path} immediate revocation`).toMatch(
        /re-read|every (discovery and every )?call|very next call/i,
      );
      expect(text, `${path} grant screen`).toContain(
        "https://movingmanifest.com/settings/ai",
      );
      expect(text, `${path} manual fallback`).toMatch(
        /copy (its|a) bounded brief|copy its bounded brief/i,
      );
    }
  });

  it("keeps the never-permitted ceiling readable on the human and agent guides", () => {
    for (const path of ["public/ai.txt", "public/llms.txt", "public/llms-full.txt", "src/app/(marketing)/ai/page.tsx"]) {
      const text = surfaceText(path);

      expect(text, `${path} permanent delete`).toMatch(/permanently delete/i);
      expect(text, `${path} whole-move archive`).toMatch(/archive a whole move/i);
      expect(text, `${path} sharing`).toMatch(/publish|share link/i);
      expect(text, `${path} household access`).toMatch(/household/i);
      expect(text, `${path} outside action`).toMatch(
        /book,?\s*(or\s+)?buy,?\s*(or\s+)?sign,?\s*(or\s+)?pay/i,
      );
      expect(text, `${path} queue is not permission`).toMatch(
        /never permission|not permission|never widens/i,
      );
    }
  });
});
