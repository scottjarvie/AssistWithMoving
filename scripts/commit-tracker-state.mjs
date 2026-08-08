#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  parseNameStatus,
  rejectedStateChanges,
  STATE_COMMIT_TRAILER,
} from "./lib/state-publication-contract.mjs";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const branch = git(["branch", "--show-current"]);
if (branch !== "main") {
  throw new Error(`Direct state publication requires local main; current branch is ${branch || "detached"}.`);
}
const localHead = git(["rev-parse", "HEAD"]);
const remoteMain = git(["rev-parse", "origin/main"]);
if (localHead !== remoteMain) {
  throw new Error(`Direct state publication requires HEAD to equal origin/main (${localHead} != ${remoteMain}).`);
}
const unstaged = git(["diff", "--name-status"]);
const untracked = git(["ls-files", "--others", "--exclude-standard"]);
if (unstaged || untracked) {
  throw new Error("Direct state publication requires an isolated checkout with no unstaged or untracked files.");
}
const staged = parseNameStatus(
  git(["diff", "--cached", "--name-status", "--no-renames", "--diff-filter=ACMRD"]),
);
if (!staged.length) throw new Error("No staged tracker or philosophy state to publish.");
const rejected = rejectedStateChanges(staged);
if (rejected.length) {
  throw new Error(`State-only commit rejected:\n${rejected.map(({ raw }) => raw).join("\n")}`);
}
execFileSync(process.execPath, ["scripts/verify-tracker.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/project-philosophy-docs.mjs", "--check"], { stdio: "inherit" });
if (process.argv.includes("--check")) {
  console.log(`state-only index verified: ${staged.length} change(s)`);
  process.exit(0);
}
const subject = process.argv.slice(2).join(" ").trim() || "Update Moving tracker state";
execFileSync("git", ["commit", "-m", `${subject}\n\n${STATE_COMMIT_TRAILER}`], { stdio: "inherit" });
