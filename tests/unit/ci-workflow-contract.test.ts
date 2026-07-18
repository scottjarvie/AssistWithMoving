import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// Vitest runs from the repository root by contract (see vitest.config.ts).
const workflowPath = resolve(
  process.cwd(),
  ".github/workflows/required-ci.yml",
);

function workflowSource() {
  return readFileSync(workflowPath, "utf8");
}

function requiredJobSource(source: string) {
  const [, requiredJob] = source.split(/\n  required:\n/, 2);
  expect(requiredJob).toBeDefined();
  return requiredJob.split(/\n  full-tests:\n/, 1)[0];
}

describe("required CI workflow contract", () => {
  it("runs the credential-free Phase 1 gate for pull requests and main", () => {
    const source = workflowSource();
    const requiredJob = requiredJobSource(source);

    expect(source).toContain("pull_request:");
    expect(source).toMatch(/push:\s*\n\s+branches:\s*\[main\]/);
    expect(source).toContain("contents: read");
    expect(source).toContain(
      "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
    );
    expect(requiredJob).toContain("name: Required CI");
    expect(requiredJob).toContain(
      "actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5",
    );
    expect(requiredJob).toContain(
      "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
    );
    expect(requiredJob).toContain("node-version: 20.20.0");
    expect(requiredJob).toContain("cache: npm");
    expect(requiredJob).toContain("run: npm ci");
    expect(requiredJob).toContain("run: npm run lint");
    expect(requiredJob).toContain("run: npm run typecheck");
    expect(requiredJob).toContain("run: npm run contract:drift");
    expect(requiredJob).toContain("run: npm run build");
    expect(requiredJob).not.toContain("run: npm run test");

    expect(source).not.toMatch(/CONVEX_DEPLOY_KEY|CLERK_SECRET_KEY|B2_/);
    expect(source).not.toMatch(/convex deploy|vercel deploy|npm publish/);
  });

  it("keeps the existing anonymous-caller OAuth lock in the required job", () => {
    const source = workflowSource();
    const requiredJob = requiredJobSource(source);

    expect(requiredJob).toContain("tests/unit/mcp-oauth-config-lock.test.ts");
    expect(requiredJob).toContain("tests/unit/mcp-route-auth.test.ts");
  });

  it("runs the known-flaky full suite as informational until MOVE-395 lands", () => {
    const source = workflowSource();

    expect(source).toContain("name: Unit tests (informational)");
    expect(source).toContain("run: npm run test");
    expect(source).not.toContain("continue-on-error: true");
  });
});
