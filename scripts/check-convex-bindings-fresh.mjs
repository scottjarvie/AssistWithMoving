#!/usr/bin/env node
/**
 * Guard: the checked-in Convex bindings must match the modules on disk.
 *
 * WHY THIS EXISTS — the failure it is here to prevent
 * --------------------------------------------------
 * `convex/_generated/api.d.ts` is checked into the repo. It is also the file
 * that gives `api.<module>.<fn>` and `internal.<module>.<fn>` their types. When
 * a Convex module is added or removed and the bindings are NOT regenerated,
 * that module is simply absent from the generated `api`, so every reference to
 * it silently resolves to `any`.
 *
 * `any` hides real type errors. In particular it hides circular type inference:
 * an action whose return type is inferred from `ctx.runQuery(internal.self.x)`
 * needs the type of `internal`, which needs the type of its own module, which
 * needs that action. With stale bindings there is no cycle, because the whole
 * chain short-circuits to `any`.
 *
 * `convex deploy` regenerates the bindings BEFORE typechecking. So the real
 * types appear, the cycle appears with them, and the build fails with
 * TS7022/TS7023 — in the Vercel deploy, after review, after merge. Meanwhile
 * `npm run typecheck` locally kept passing against the stale file. A sibling
 * project lost five consecutive production deployments to exactly this.
 *
 * WHAT THIS CHECK DOES
 * --------------------
 * It regenerates the expected `api.d.ts` deterministically from the modules on
 * disk and from `convex/convex.config.ts` — no network, no deploy key, no
 * Convex deployment — and requires the checked-in file to match byte for byte.
 * That is what makes it runnable in CI, where no deployment credentials exist.
 *
 * That single guarantee is what makes the rest of the pipeline honest: once the
 * checked-in bindings are provably identical to freshly generated ones, the
 * ordinary `npm run typecheck` step IS a typecheck against fresh bindings, and
 * any inference cycle surfaces at PR time instead of at deploy time. Which is
 * why this check must run BEFORE the typecheck — an ordering this script
 * asserts about itself in `--check-wiring` mode.
 *
 * If this check fails, run `npx convex codegen` against a DEV deployment (never
 * --prod) and commit the regenerated `convex/_generated/` files.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const convexDir = join(root, "convex");
const bindingsPath = join(convexDir, "_generated", "api.d.ts");

/** Files Convex never registers as function modules. */
const NOT_A_FUNCTION_MODULE = new Set(["schema", "auth.config", "convex.config"]);
const MODULE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

/* ── 1. The module surface on disk ───────────────────────────────────────── */

/** Every Convex function module, as the deployment addresses it. */
function collectModulePaths(dir, out = []) {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    // `_generated` and any other underscore-prefixed directory is not user code.
    if (entry.name.startsWith("_")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectModulePaths(full, out);
      continue;
    }
    if (entry.name.endsWith(".d.ts")) continue;
    const ext = MODULE_EXTENSIONS.find((candidate) => entry.name.endsWith(candidate));
    if (!ext) continue;
    const modulePath = relative(convexDir, full).slice(0, -ext.length).replaceAll("\\", "/");
    // Tests ship alongside the functions but are not part of the API surface.
    if (/\.(test|spec)$/.test(modulePath)) continue;
    if (NOT_A_FUNCTION_MODULE.has(modulePath)) continue;
    out.push(modulePath);
  }
  return out;
}

/** `httpRoutes/mcp` -> `httpRoutes_mcp`, matching Convex's own identifier rule. */
function toIdentifier(modulePath) {
  return modulePath.replace(/[^a-zA-Z0-9_$]/g, "_");
}

/** A key needs quoting in the generated object type unless it is a bare identifier. */
function toObjectKey(modulePath) {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(modulePath) ? modulePath : `"${modulePath}"`;
}

/* ── 2. The installed components, from convex.config.ts ──────────────────── */

/**
 * Convex renders one `components` entry per `app.use(...)`. The instance name is
 * the explicit `{ name }` when given, otherwise the name the component declares
 * in its own `defineComponent(...)` — read straight out of node_modules, still
 * offline.
 */
function collectComponents() {
  const source = readFileSync(join(convexDir, "convex.config.ts"), "utf8");
  const packageOfLocalName = new Map();
  for (const match of source.matchAll(/^import\s+(\w+)\s+from\s+"([^"]+)";?\s*$/gm)) {
    const specifier = match[2].replace(/\/convex\.config(\.js)?$/, "");
    if (specifier !== match[2]) packageOfLocalName.set(match[1], specifier);
  }

  const require_ = createRequire(join(root, "package.json"));
  const components = [];
  for (const match of source.matchAll(
    /app\.use\(\s*(\w+)\s*(?:,\s*\{\s*name:\s*"([^"]+)"\s*\})?\s*\)/g,
  )) {
    const packageName = packageOfLocalName.get(match[1]);
    if (!packageName) continue;
    let name = match[2];
    if (!name) {
      const configPath = require_.resolve(`${packageName}/convex.config.js`);
      name = readFileSync(configPath, "utf8").match(/defineComponent\(\s*"([^"]+)"/)?.[1];
      if (!name) {
        throw new Error(
          `Could not determine the component name declared by ${packageName}. ` +
            "Give the app.use(...) call an explicit { name } so this check stays deterministic.",
        );
      }
    }
    components.push({ name, packageName });
  }
  return components;
}

/* ── 3. Render what codegen would produce ────────────────────────────────── */

function renderBindings(modulePaths, components) {
  const imports = modulePaths
    .map((path) => `import type * as ${toIdentifier(path)} from "../${path}.js";`)
    .join("\n");
  const members = modulePaths
    .map((path) => `  ${toObjectKey(path)}: typeof ${toIdentifier(path)};`)
    .join("\n");
  const componentsBlock = components.length
    ? `{\n${components
        .map(
          ({ name, packageName }) =>
            `  ${name}: import("${packageName}/_generated/component.js").ComponentApi<"${name}">;`,
        )
        .join("\n")}\n};\n`
    : "{};\n";

  return `/* eslint-disable */
/**
 * Generated \`api\` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run \`npx convex dev\`.
 * @module
 */

${imports}

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
${members}
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * \`\`\`js
 * const myFunctionReference = api.myModule.myFunction;
 * \`\`\`
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * \`\`\`js
 * const myFunctionReference = internal.myModule.myFunction;
 * \`\`\`
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: ${componentsBlock}`;
}

/* ── 4. The check ────────────────────────────────────────────────────────── */

export function findBindingsDrift() {
  const modulePaths = collectModulePaths(convexDir).sort();
  const expected = renderBindings(modulePaths, collectComponents());
  const actual = readFileSync(bindingsPath, "utf8");
  if (expected === actual) return { fresh: true, moduleCount: modulePaths.length };

  const onDisk = new Set(modulePaths);
  const declared = new Set(
    [...actual.matchAll(/^import type \* as \S+ from "\.\.\/(.+)\.js";$/gm)].map((m) => m[1]),
  );
  return {
    fresh: false,
    moduleCount: modulePaths.length,
    missing: [...onDisk].filter((name) => !declared.has(name)),
    extra: [...declared].filter((name) => !onDisk.has(name)),
  };
}

function main() {
  const result = findBindingsDrift();
  if (result.fresh) {
    console.log(
      `check:convex-bindings-fresh — OK (${result.moduleCount} modules; checked-in bindings match the modules on disk)`,
    );
    return;
  }

  console.error("check:convex-bindings-fresh — FAILED");
  console.error(
    "\nconvex/_generated/api.d.ts does not match the Convex modules on disk.\n" +
      "Stale bindings resolve `api.<module>.<fn>` and `internal.<module>.<fn>` to `any`,\n" +
      "which hides real type errors locally and lets them fail inside `convex deploy`\n" +
      "on Vercel instead.\n",
  );
  if (result.missing.length) {
    console.error(
      `  Modules on disk but MISSING from the bindings:\n    ${result.missing.join("\n    ")}`,
    );
  }
  if (result.extra.length) {
    console.error(
      `  Modules in the bindings but no longer on disk:\n    ${result.extra.join("\n    ")}`,
    );
  }
  if (!result.missing.length && !result.extra.length) {
    console.error(
      "  The module list matches but the generated file content differs (component\n" +
        "  instances in convex/convex.config.ts, or a hand-edit).",
    );
  }
  console.error(
    "\nFix: run `npx convex codegen` against a DEV deployment (never --prod) and\n" +
      "commit the regenerated convex/_generated/ files.\n",
  );
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
