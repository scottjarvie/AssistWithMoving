import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  getApiCapabilities,
  getCapabilityToolNames,
  MOVINGMANIFEST_API_CAPABILITIES,
} from "../../mcp-server/capabilities.mjs";
import { registerTools } from "../../mcp-server/movingmanifest-mcp.mjs";

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
    operationalBlockers?: string[];
  }>;
  knownLaunchBlockers: Array<{
    issue: string;
  }>;
};

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

  it("keeps the API/MCP guide tool table synced with capability discovery", () => {
    const docs = readFileSync(
      resolve(process.cwd(), "docs/api-and-mcp.md"),
      "utf8"
    );

    for (const toolName of getCapabilityToolNames()) {
      expect(docs).toContain(`\`${toolName}\``);
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
