import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("package scripts", () => {
  it("keeps mcp:doctor as a read-only OAuth discovery proof", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts["mcp:doctor"]).toBe(
      "node scripts/mcp-oauth-discovery-proof.mjs --endpoint https://movingmanifest.com/api/mcp"
    );
    expect(packageJson.scripts["mcp:doctor"]).not.toContain("--authorize");
    expect(packageJson.scripts["mcp:doctor"]).not.toContain("register");
    expect(packageJson.scripts["mcp:doctor"]).not.toContain("token");
  });
});
