import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { checkConvexTypecheckConfig } from "./check-convex-typecheck-config.mjs";

const require = createRequire(import.meta.url);
const compiler = require.resolve("typescript/bin/tsc");

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "moving-convex-typecheck-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "convex.json"), "{}");
  mkdirSync(path.join(root, "convex"));
  return root;
}

test("refuses a missing backend config", (t) => {
  assert.throws(() => checkConvexTypecheckConfig(fixture(t)), /Missing backend/);
});

test("a root-only TypeScript config cannot satisfy the backend prerequisite", (t) => {
  const root = fixture(t);
  writeFileSync(path.join(root, "tsconfig.json"), '{"compilerOptions":{"strict":true}}');
  assert.throws(() => checkConvexTypecheckConfig(root), /Missing backend/);
});

test("refuses a malformed backend config", (t) => {
  const root = fixture(t);
  writeFileSync(path.join(root, "convex/tsconfig.json"), '{"compilerOptions":');
  assert.throws(() => checkConvexTypecheckConfig(root));
});

test("the pinned compiler rejects a backend type error", (t) => {
  const root = fixture(t);
  writeFileSync(path.join(root, "convex/tsconfig.json"), JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, skipLibCheck: true, types: [] },
    include: ["./**/*.ts"],
  }));
  writeFileSync(path.join(root, "convex/example.ts"), 'export const count: number = "wrong";');
  const { functionsDir } = checkConvexTypecheckConfig(root);
  const result = spawnSync(process.execPath, [compiler, "--project", functionsDir, "--noEmit"], {
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /TS2322/);
});

test("the project backend config retains strictness, aliases and Convex compiler requirements", () => {
  const { parsed } = checkConvexTypecheckConfig();
  assert.equal(parsed.options.strict, true);
  assert.deepEqual(parsed.options.paths["@/*"], ["./src/*"]);
  assert.equal(parsed.options.noEmit, true);
  assert.equal(parsed.options.forceConsistentCasingInFileNames, true);
  assert.equal(parsed.options.isolatedModules, true);
  assert.ok(parsed.fileNames.some((file) => file.endsWith("/schema.ts") || file.endsWith("\\schema.ts")));
  assert.ok(parsed.fileNames.every((file) => !/\.(test|spec)\.[^/\\]+$/.test(file)));
});
