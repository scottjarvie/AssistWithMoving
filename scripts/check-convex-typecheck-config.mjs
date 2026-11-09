import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// Convex 1.43's enabled typecheck requires this file even when the root
// Next.js project already typechecks. This check is entirely offline.
export function checkConvexTypecheckConfig(root = process.cwd()) {
  const convexConfig = JSON.parse(readFileSync(path.join(root, "convex.json"), "utf8"));
  const functionsDir = path.resolve(root, convexConfig.functions ?? "convex");
  const configPath = path.join(functionsDir, "tsconfig.json");
  if (!existsSync(configPath)) {
    throw new Error(`Missing backend TypeScript configuration: ${configPath}`);
  }

  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  }
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, functionsDir);
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map((error) =>
      ts.flattenDiagnosticMessageText(error.messageText, "\n")
    ).join("\n"));
  }
  return { functionsDir, configPath, parsed };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    checkConvexTypecheckConfig();
    console.log("Convex backend TypeScript configuration is present and parseable.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
