#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { inspectStateRange } from "./lib/state-publication-contract.mjs";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--base", "--head"].includes(flag) || !value) {
      throw new Error("Usage: vercel-ignore-build.mjs [--base SHA --head SHA]");
    }
    options[flag.slice(2)] = value;
  }
  if (Boolean(options.base) !== Boolean(options.head)) {
    throw new Error("--base and --head must be supplied together");
  }
  return options;
}

function requireBuild(reason) {
  process.stderr.write(`Vercel build required: ${reason}\n`);
  process.exitCode = 1;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const base = options.base || process.env.VERCEL_GIT_PREVIOUS_SHA?.trim();
  const head = options.head || process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (!base) throw new Error("VERCEL_GIT_PREVIOUS_SHA is unavailable");
  if (!head) throw new Error("VERCEL_GIT_COMMIT_SHA is unavailable");
  const result = inspectStateRange({ base, head });
  execFileSync(process.execPath, ["scripts/verify-tracker.mjs"], { stdio: "inherit" });
  execFileSync(process.execPath, ["scripts/project-philosophy-docs.mjs", "--check"], { stdio: "inherit" });
  process.stdout.write(`Vercel build ignored: ${result.changes.length} verified state-only change(s).\n`);
} catch (error) {
  requireBuild(error instanceof Error ? error.message : String(error));
}
