import { afterEach, describe, expect, it } from "vitest";

import { mcpResourceIdsForAuth } from "../../convex/auth.config";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("Convex auth config", () => {
  it("accepts the canonical MCP resource ID", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.com";

    expect(mcpResourceIdsForAuth()).toEqual(["https://movingmanifest.com/api/mcp"]);
  });

  it("preserves an explicit MCP resource override", () => {
    process.env.MOVINGMANIFEST_MCP_RESOURCE_ID =
      "https://agents.example.test/api/mcp/";
    process.env.NEXT_PUBLIC_APP_URL = "https://movingmanifest.com";

    expect(mcpResourceIdsForAuth()).toContain(
      "https://agents.example.test/api/mcp"
    );
  });
});
