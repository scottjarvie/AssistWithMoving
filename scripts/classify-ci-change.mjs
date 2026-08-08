#!/usr/bin/env node

import { appendFileSync } from "node:fs";
import { inspectStateRange } from "./lib/state-publication-contract.mjs";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--base", "--head", "--github-output", "--event"].includes(flag) || !value) {
      throw new Error("Usage: classify-ci-change.mjs --base SHA --head SHA --event push --github-output PATH");
    }
    options[flag.slice(2)] = value;
  }
  if (!options.base || !options.head || !options.event || !options["github-output"]) {
    throw new Error("base, head, event, and github-output are required");
  }
  return options;
}

export function classifyRange({ base, head, cwd = process.cwd(), event = "push" }) {
  if (event !== "push") {
    return { runFull: true, stateOnly: false, reason: "pull-requests-always-use-full-ci", changedCount: 0 };
  }
  try {
    const result = inspectStateRange({ base, head, cwd, singleCommit: true });
    return {
      runFull: false,
      stateOnly: true,
      reason: "verified-state-range",
      changedCount: result.changes.length,
    };
  } catch (error) {
    return {
      runFull: true,
      stateOnly: false,
      reason: error instanceof Error ? error.message : String(error),
      changedCount: 0,
    };
  }
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = classifyRange({ base: options.base, head: options.head, event: options.event });
  appendFileSync(
    options["github-output"],
    [
      `run_full=${result.runFull}`,
      `state_only=${result.stateOnly}`,
      `reason=${result.reason.replaceAll("\n", " ")}`,
      `changed_count=${result.changedCount}`,
    ].join("\n") + "\n",
  );
  console.log(`CI scope: ${result.stateOnly ? "state-only" : "full"} (${result.reason})`);
  return result;
}

if (process.argv[1]?.endsWith("classify-ci-change.mjs")) {
  try {
    runCli();
  } catch (error) {
    console.error(`CI classifier failed closed: ${error.message}`);
    process.exitCode = 1;
  }
}
