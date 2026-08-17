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
      "actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd",
    );
    expect(requiredJob).toContain(
      "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444",
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

  it("proves the Convex bindings are fresh before it typechecks", () => {
    const requiredJob = requiredJobSource(workflowSource());

    // The checked-in convex/_generated/api.d.ts is what gives api.*/internal.*
    // their types. Stale bindings make those `any`, so the typecheck passes on
    // nothing and the real errors surface only inside `convex deploy`. Proving
    // the bindings fresh FIRST is what makes the typecheck step meaningful.
    const bindingsAt = requiredJob.indexOf("run: npm run check:convex-bindings-fresh");
    const typecheckAt = requiredJob.indexOf("run: npm run typecheck");

    expect(bindingsAt).toBeGreaterThan(-1);
    expect(typecheckAt).toBeGreaterThan(-1);
    expect(bindingsAt).toBeLessThan(typecheckAt);
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
