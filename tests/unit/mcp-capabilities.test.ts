import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  getApiCapabilities,
  getCapabilityToolNames,
  MOVINGMANIFEST_API_CAPABILITIES,
} from "../../mcp-server/capabilities.mjs";
import {
  MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS,
  createAllowedToolFilter,
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
    status: string;
    agentWorkflows?: string[];
    operationalBlockers?: string[];
  }>;
  knownLaunchBlockers: Array<{
    issue: string;
  }>;
};

function capabilitySourceObjects(source: string) {
  const start = source.indexOf("export const MOVINGMANIFEST_API_CAPABILITIES = [");
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
      MOVINGMANIFEST_API_CAPABILITIES.length
    );
    expect(payload.capabilities.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "moveSetup",
        "moveQuestions",
        "inventory",
        "transportPlanning",
        "documentationProfiles",
        "publicSharing",
      ])
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
    expect(MOVINGMANIFEST_API_CAPABILITIES).toContainEqual(
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

    expect(addItemFromPhotoOptions?.description).toContain(
      "photo clearly shows a count",
    );
    expect(uploadPhotosOptions?.description).toContain("existing itemId");

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

    expect(MOVINGMANIFEST_API_CAPABILITIES).toContainEqual(
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

  it("offers a smaller trusted-helper MCP tool set for hosted assistants", () => {
    const filter = createAllowedToolFilter(MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS);
    const registrations = collectToolRegistrations({
      allowedToolNames: MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS,
    });
    const toolNames = [...registrations.keys()].sort();

    expect(MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS).toHaveLength(25);
    expect(filter("save_box_intake")).toBe(true);
    expect(filter("create_box")).toBe(false);
    expect(toolNames).toContain("save_box_intake");
    expect(toolNames).toContain("setup_move");
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
    const ids = MOVINGMANIFEST_API_CAPABILITIES.map((entry) => entry.id);

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
    const blocks = [...section.matchAll(/```json\n([\s\S]*?)\n```/g)].map(
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
    });
    expect(getApiCapabilities().summary.statuses).not.toHaveProperty(
      "availableWithOperationalBlocker"
    );
  });
});
