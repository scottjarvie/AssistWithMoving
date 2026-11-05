// Offline contracts, including the installed patch-package implementation.
// Run: node --test .claude/hooks/cloud-session-setup.contract.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../../", import.meta.url));
const launcher = fileURLToPath(new URL("./cloud-session-setup.mjs", import.meta.url));
const settings = JSON.parse(readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
const command = settings.hooks.SessionStart[0].hooks[0].command;

test("configured command stays silent locally in the native platform shell", () => {
  for (const remote of [undefined, "false"]) {
    const env = { ...process.env, PATH: path.dirname(process.execPath) };
    delete env.CLAUDE_CODE_REMOTE;
    if (remote !== undefined) env.CLAUDE_CODE_REMOTE = remote;
    const windows = process.platform === "win32";
    const shell = windows
      ? path.join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe")
      : "/bin/sh";
    const args = windows ? ["-NoProfile", "-NonInteractive", "-Command", command] : ["-c", command];
    const result = spawnSync(shell, args, { cwd: project, env, encoding: "utf8", windowsHide: true });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  }
});

test("remote launcher warns without blocking when Bash is unavailable", () => {
  const result = spawnSync(process.execPath, [launcher], {
    cwd: project,
    env: { ...process.env, PATH: "", CLAUDE_CODE_REMOTE: "true" },
    encoding: "utf8",
    windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim().split("\n").length, 1);
  assert.match(result.stdout, /shell setup could not complete/);
  assert.equal(result.stderr, "");
});

test("CI mode makes a real patch-package application failure fail postinstall", () => {
  const fixtureParent = os.tmpdir();
  const fixture = mkdtempSync(path.join(fixtureParent, "cloud-setup-patch-"));
  assert.equal(path.dirname(fixture), fixtureParent);
  try {
    mkdirSync(path.join(fixture, "node_modules/fixture-dependency"), { recursive: true });
    mkdirSync(path.join(fixture, "patches"));
    writeFileSync(path.join(fixture, "package.json"), JSON.stringify({
      name: "cloud-setup-fixture", version: "1.0.0", dependencies: { "fixture-dependency": "1.0.0" },
    }));
    writeFileSync(path.join(fixture, "node_modules/fixture-dependency/package.json"), JSON.stringify({
      name: "fixture-dependency", version: "1.0.0",
    }));
    writeFileSync(path.join(fixture, "node_modules/fixture-dependency/index.js"), "actual input\n");
    writeFileSync(path.join(fixture, "patches/fixture-dependency+1.0.0.patch"), [
      "diff --git a/node_modules/fixture-dependency/index.js b/node_modules/fixture-dependency/index.js",
      "--- a/node_modules/fixture-dependency/index.js",
      "+++ b/node_modules/fixture-dependency/index.js",
      "@@ -1 +1 @@",
      "-different input",
      "+patched output",
      "",
    ].join("\n"));
    for (const ci of ["false", "true"]) {
      const env = { ...process.env, CI: ci, NODE_ENV: "development" };
      delete env.PATCH_PACKAGE_INTEGRATION_TEST;
      const result = spawnSync(process.execPath, [path.join(project, "node_modules/patch-package/index.js")], {
        cwd: fixture, env, encoding: "utf8", windowsHide: true,
      });
      assert.ifError(result.error);
      assert.match(result.stdout + result.stderr, /failed to apply patch/i);
      assert.equal(result.status, ci === "true" ? 1 : 0);
      assert.equal(readFileSync(path.join(fixture, "node_modules/fixture-dependency/index.js"), "utf8"), "actual input\n");
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
