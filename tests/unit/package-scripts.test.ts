import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("package scripts", () => {
  it("keeps mcp:doctor as a read-only OAuth discovery proof", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    // Must target the canonical stateless OAuth door, not the API-key door.
    expect(packageJson.scripts["mcp:doctor"]).toBe(
      "node scripts/mcp-oauth-discovery-proof.mjs --endpoint https://movingmanifest.com/mcp"
    );
    expect(packageJson.scripts["mcp:doctor:legacy"]).toContain("/mcp/connect");
    expect(packageJson.scripts["mcp:doctor"]).not.toContain("--authorize");
    expect(packageJson.scripts["mcp:doctor"]).not.toContain("register");
    expect(packageJson.scripts["mcp:doctor"]).not.toContain("token");
  });

  it("proves the Convex bindings are fresh before verify:launch typechecks", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts["check:convex-bindings-fresh"]).toBe(
      "node scripts/check-convex-bindings-fresh.mjs"
    );

    // Ordering is the whole point: a typecheck run against stale bindings
    // typechecks `any`, and the errors it misses fail inside `convex deploy`.
    const launch: string = packageJson.scripts["verify:launch"];
    expect(launch.indexOf("check:convex-bindings-fresh")).toBeGreaterThan(-1);
    expect(launch.indexOf("check:convex-bindings-fresh")).toBeLessThan(
      launch.indexOf("run typecheck")
    );
  });
});
