#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { classifyRange } from "./classify-ci-change.mjs";
import { hasStateCommitTrailer, inspectStateRange, parseNameStatus, rejectedStateChanges } from "./lib/state-publication-contract.mjs";

assert.equal(hasStateCommitTrailer("Useful state\n\nskip-checks: true\n"), true);
assert.equal(hasStateCommitTrailer("skip-checks: true\nnot-final\n"), false);
assert.deepEqual(rejectedStateChanges(parseNameStatus("M\tdocs/tracker/cards/MOV-0001.md\nM\tdocs/tracker/board.html")), []);
for (const rejected of [
  "M\tsrc/app/page.tsx",
  "M\tvercel.json",
  "M\tscripts/tracker-build.mjs",
  "M\t.github/workflows/required-ci.yml",
  "M\tdocs/tracker/SYSTEM.md",
  "D\tdocs/tracker/cards/MOV-0001.md",
  "R100\tdocs/tracker/cards/MOV-0001.md",
  "malformed",
]) assert.equal(rejectedStateChanges(parseNameStatus(rejected)).length, 1, rejected);

function git(cwd, args) { return execFileSync("git", args, { cwd, encoding: "utf8" }).trim(); }
function commit(cwd, message) { git(cwd, ["add", "-A"]); git(cwd, ["commit", "-m", message]); return git(cwd, ["rev-parse", "HEAD"]); }

const fixture = mkdtempSync(join(tmpdir(), "moving-state-contract-"));
try {
  git(fixture, ["init", "--quiet"]);
  git(fixture, ["config", "user.name", "State fixture"]);
  git(fixture, ["config", "user.email", "state@example.invalid"]);
  mkdirSync(join(fixture, "docs", "tracker", "cards"), { recursive: true });
  mkdirSync(join(fixture, "src"), { recursive: true });
  writeFileSync(join(fixture, "docs", "tracker", "cards", "MOV-0001.md"), "state one\n");
  writeFileSync(join(fixture, "src", "app.txt"), "software one\n");
  const base = commit(fixture, "base");

  writeFileSync(join(fixture, "docs", "tracker", "cards", "MOV-0001.md"), "state two\n");
  const stateHead = commit(fixture, "useful state\n\nskip-checks: true");
  assert.equal(classifyRange({ base, head: stateHead, cwd: fixture }).stateOnly, true);
  assert.equal(classifyRange({ base, head: stateHead, cwd: fixture, event: "pull_request" }).runFull, true);
  assert.equal(classifyRange({ base: "bad", head: stateHead, cwd: fixture }).runFull, true);
  assert.equal(classifyRange({ base, head: "0".repeat(40), cwd: fixture }).runFull, true);

  writeFileSync(join(fixture, "src", "app.txt"), "software two\n");
  const softwareHead = commit(fixture, "marked software\n\nskip-checks: true");
  assert.equal(classifyRange({ base: stateHead, head: softwareHead, cwd: fixture }).runFull, true);

  writeFileSync(join(fixture, "docs", "tracker", "cards", "MOV-0001.md"), "state three\n");
  writeFileSync(join(fixture, "src", "app.txt"), "software three\n");
  const mixedHead = commit(fixture, "mixed\n\nskip-checks: true");
  assert.equal(classifyRange({ base: softwareHead, head: mixedHead, cwd: fixture }).runFull, true);

  git(fixture, ["mv", "docs/tracker/cards/MOV-0001.md", "docs/tracker/cards/MOV-0002.md"]);
  const renameHead = commit(fixture, "rename\n\nskip-checks: true");
  assert.equal(classifyRange({ base: mixedHead, head: renameHead, cwd: fixture }).runFull, true);

  writeFileSync(join(fixture, "docs", "tracker", "cards", "MOV-0002.md"), "unmarked\n");
  const unmarkedHead = commit(fixture, "unmarked state");
  assert.equal(classifyRange({ base: renameHead, head: unmarkedHead, cwd: fixture }).runFull, true);

  writeFileSync(join(fixture, "docs", "tracker", "cards", "MOV-0002.md"), "state four\n");
  const anotherState = commit(fixture, "state four\n\nskip-checks: true");
  assert.equal(classifyRange({ base: renameHead, head: anotherState, cwd: fixture }).runFull, true, "multiple-commit range must build");

  const cleanHistoryBase = anotherState;
  writeFileSync(join(fixture, "docs", "tracker", "cards", "MOV-0002.md"), "state five\n");
  commit(fixture, "state five\n\nskip-checks: true");
  writeFileSync(join(fixture, "docs", "tracker", "cards", "MOV-0002.md"), "state six\n");
  const accumulatedHead = commit(fixture, "state six\n\nskip-checks: true");
  assert.equal(inspectStateRange({ base: cleanHistoryBase, head: accumulatedHead, cwd: fixture }).changes.length, 2, "Vercel full range accepts multiple linear state publications");
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

const workflow = readFileSync(".github/workflows/required-ci.yml", "utf8");
for (const required of ["fetch-depth: 0", "node scripts/classify-ci-change.mjs", "state_only", "npm ci", "npm run build"]) assert(workflow.includes(required), `workflow missing ${required}`);
assert.match(workflow, /if: steps\.scope\.outputs\.run_full == 'true'[\s\S]*run: npm ci/);
const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
assert.equal(vercel.ignoreCommand, "node scripts/vercel-ignore-build.mjs");
const vercelClassifier = readFileSync("scripts/vercel-ignore-build.mjs", "utf8");
assert(vercelClassifier.includes("scripts/verify-tracker.mjs"));
assert(vercelClassifier.includes("scripts/project-philosophy-docs.mjs"));
const commitHelper = readFileSync("scripts/commit-tracker-state.mjs", "utf8");
for (const guard of ["origin/main", "no unstaged or untracked files", "--no-renames", "verify-tracker.mjs", "project-philosophy-docs.mjs"]) assert(commitHelper.includes(guard), `commit helper missing ${guard}`);
console.log("state-publication contract verified: GitHub accepts one direct push and rejects PR/multiple/mixed/uncertain ranges; Vercel validates complete linear state history and rejects software, deletion, rename, malformed, unmarked, or missing history");
