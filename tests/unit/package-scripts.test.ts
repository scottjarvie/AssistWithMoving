import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("package scripts", () => {
  it("keeps mcp:doctor as a read-only OAuth discovery proof", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    // Must target the OAuth door (/mcp/connect), not the API-key door
    // (/api/mcp) which advertises no OAuth. See src/lib/mcp-oauth.ts.
    expect(packageJson.scripts["mcp:doctor"]).toBe(
      "node scripts/mcp-oauth-discovery-proof.mjs --endpoint https://movingmanifest.com/mcp/connect"
    );
    expect(packageJson.scripts["mcp:doctor"]).not.toContain("--authorize");
    expect(packageJson.scripts["mcp:doctor"]).not.toContain("register");
    expect(packageJson.scripts["mcp:doctor"]).not.toContain("token");
  });
});
