import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("package scripts", () => {
  it("keeps OAuth cutover in the full launch doctor sweep", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8")
    );

    expect(packageJson.scripts["doctor:oauth-cutover"]).toBe(
      "node scripts/oauth-cutover-readiness.mjs"
    );
    expect(packageJson.scripts["doctor:all"]).toContain(
      "npm run doctor:oauth-cutover"
    );
    expect(packageJson.scripts["verify:agent-ready"]).toContain(
      "npm run contract:drift"
    );
    expect(packageJson.scripts["verify:agent-ready"]).toContain(
      "tests/unit/agent-journey-smoke.test.ts"
    );
    expect(packageJson.scripts["verify:agent-ready"]).toContain(
      "tests/unit/agent-kit.test.ts"
    );
    expect(packageJson.scripts["verify:agent-ready"]).toContain(
      "tests/unit/mcp-page-copy.test.ts"
    );
    expect(packageJson.scripts["verify:agent-ready"]).toContain(
      "tests/unit/mcp-endpoint-routing.test.ts"
    );
    expect(packageJson.scripts["verify:agent-ready"]).toContain(
      "tests/unit/mcp-route-auth.test.ts"
    );
    expect(packageJson.scripts["verify:agent-ready"]).toContain(
      "npm run smoke:mcp-stdio -- --mock-api"
    );
    expect(packageJson.scripts["verify:agent-ready"]).toContain(
      "npm run doctor:release"
    );
    expect(packageJson.scripts["smoke:mcp-stdio"]).toBe(
      "node scripts/mcp-stdio-smoke.mjs"
    );
    expect(packageJson.scripts["smoke:mcp-oauth"]).toBe(
      "node scripts/mcp-oauth-smoke.mjs"
    );
    expect(packageJson.scripts["mcp:doctor"]).toBe(
      "node scripts/mcp-oauth-smoke.mjs --discover --endpoint https://movingmanifest.com/api/mcp"
    );
    expect(packageJson.scripts["mcp:doctor"]).not.toContain("--authorize");
  });
});
