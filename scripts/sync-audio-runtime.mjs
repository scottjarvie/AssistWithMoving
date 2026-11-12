import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../convex/lib/media/audio.ts", import.meta.url), "utf8");
const output = "// Generated from the synced audio core. Do not edit.\n" + ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const path = new URL("../shared/audio.mjs", import.meta.url);
if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8") !== output) throw new Error("Run node scripts/sync-audio-runtime.mjs");
} else writeFileSync(path, output);
