import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../convex/lib/usageLimits/core.ts", import.meta.url), "utf8");
const output = "// Generated from the synced usage-limits core. Do not edit.\n" + ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const path = new URL("../shared/usage-limits.mjs", import.meta.url);
if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8") !== output) throw new Error("Run node scripts/sync-usage-limits-runtime.mjs");
} else writeFileSync(path, output);
