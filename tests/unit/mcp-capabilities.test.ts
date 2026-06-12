import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  getApiCapabilities,
  getCapabilityToolNames,
  MOVINGMANIFEST_API_CAPABILITIES,
} from "../../mcp-server/capabilities.mjs";
import {
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

function collectToolRegistrations() {
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
    }
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
        status: "availableWithOperationalBlocker",
        operationalBlockers: ["MOVE-66"],
      })
    );
    expect(payload.knownLaunchBlockers.map((blocker) => blocker.issue)).toEqual(
      expect.arrayContaining(["MOVE-63", "MOVE-66", "MOVE-68"])
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
    expect(MOVINGMANIFEST_API_CAPABILITIES).toContainEqual(
      expect.objectContaining({
        id: "photoEvidence",
        restEndpoints: expect.arrayContaining(["POST /api/v1/photos/upload"]),
        mcpTools: expect.arrayContaining([
          "create_item_with_images",
          "upload_evidence_image",
          "upload_evidence_images",
        ]),
        agentWorkflows: expect.arrayContaining([
          expect.stringContaining("create_item_with_images"),
          expect.stringContaining("upload_evidence_image first"),
          expect.stringContaining("upload_evidence_images"),
          expect.stringContaining("Do not ask the user for dimensions"),
        ]),
      }),
    );
  });

  it("documents the one-call image upload path for OpenAPI and AI readers", () => {
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
        schemas: Record<
          string,
          {
            description?: string;
            properties?: Record<string, { description?: string }>;
          }
        >;
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
    expect(
      openapi.paths["/photos/upload"]?.post?.requestBody.content
    ).toHaveProperty("multipart/form-data");
    expect(
      openapi.paths["/photos/upload"]?.post?.requestBody.content
    ).toHaveProperty("image/jpeg");
    expect(openapi.components.schemas.PhotoDirectUpload.description).toContain(
      "Provide exactly one of sourceUrl, dataUrl, or fileBase64"
    );
    expect(openapi.components.schemas.PhotoMultipartUpload.description).toContain(
      "Multipart one-call"
    );
    expect(
      openapi.components.schemas.PhotoDirectUpload.properties?.fileBase64
        ?.description
    ).toContain("local image file");
    expect(docs).toContain("one user photo should normally mean one");
    expect(docs).toContain("`upload_evidence_image` call");
    expect(docs).toContain("`upload_evidence_images`");
    expect(llms).toContain("MCP agents should call");
    expect(llms).toContain("upload_evidence_images");
    expect(fullLlms).toContain("One user photo should normally be one upload call");
    expect(fullLlms).toContain("upload_evidence_images");
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
          availableWithOperationalBlocker: 1,
        },
      },
    });
  });
});
