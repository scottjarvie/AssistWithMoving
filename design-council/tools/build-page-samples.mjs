import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

// Offline design evidence: actual page component + actual compiled app CSS.
// Only the data provider is replaced. No app route, auth bypass or server.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const run = path.join(repo, "design-council/2026-11-05-playbook");
const output = path.join(run, "samples");
os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL);
fs.mkdirSync(output, { recursive: true });
const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
const sourceDirty = Boolean(execFileSync("git", ["status", "--porcelain", "--", "src"], { cwd: repo, encoding: "utf8" }).trim());
const moves = [{
  _id: "synthetic-move-1", title: "[synthetic] A new place across town",
  origin: "Example West", destination: "Example East",
  dateStart: Date.UTC(2026, 10, 14), dateEnd: Date.UTC(2026, 10, 15),
}];
const fixture = { activeMoves: moves, selectedMove: moves[0], loadingMoves: false };
const bundle = path.join(output, ".home-component.generated.mjs");
try {
  await build({
    stdin: { contents: 'import React from "react"; import {renderToStaticMarkup} from "react-dom/server"; import {HomeLaunchpad} from "@/components/home-launchpad"; export const markup=renderToStaticMarkup(React.createElement(HomeLaunchpad));', resolveDir: repo, loader: "tsx" },
    outfile: bundle, bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic",
    plugins: [{ name: "council-synthetic-provider", setup(context) {
      context.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next/link.js", external: true }));
      context.onResolve({ filter: /^@\/components\/move-workspace-context$/ }, () => ({ path: "synthetic-workspace", namespace: "council" }));
      context.onLoad({ filter: /.*/, namespace: "council" }, () => ({ contents: `export const useMoveWorkspace=()=>(${JSON.stringify(fixture)});`, loader: "js" }));
      context.onResolve({ filter: /^@\// }, args => {
        const candidate = path.join(repo, "src", args.path.slice(2));
        const file = [candidate, `${candidate}.tsx`, `${candidate}.ts`, `${candidate}.js`].find(value => fs.existsSync(value) && fs.statSync(value).isFile());
        if (!file) throw new Error(`Unresolved local sample import: ${args.path}`);
        return { path: file };
      });
    } }],
  });
  const { markup } = await import(pathToFileURL(bundle).href);
  const cssPath = path.join(repo, "src/app/globals.css");
  const sources = ["home-launchpad.tsx", "moving-symbol.tsx", "ui/button.tsx", "ui/skeleton.tsx"];
  const inputCss = fs.readFileSync(cssPath, "utf8").replace('@import "tailwindcss";', '@import "tailwindcss" source(none);') + sources.map(file => `\n@source "${path.join(repo, "src/components", file).replaceAll("\\", "/")}";`).join("");
  const { css } = await postcss([tailwind({ base: repo })]).process(inputCss, { from: cssPath });
  const sampleCss = postcss.parse(css);
  // The authenticated shell is absent from this component sample. Its fixed
  // viewport rules also cannot be used inside an auto-height gallery frame.
  sampleCss.walkRules(rule => { if (rule.selector.includes(".workspace-")) rule.remove(); });
  for (const appearance of ["light", "dark"]) {
    const html = `<!doctype html><html lang="en" class="${appearance === "dark" ? "dark" : ""}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Moving home · synthetic component evidence</title><style>${sampleCss}</style><style>:root{--font-geist-sans:ui-sans-serif,system-ui,sans-serif;--font-geist-mono:ui-monospace,monospace}html,body{margin:0;background:transparent}body{color:var(--foreground)}.sample-proof{padding:12px 16px;font:11px ui-monospace,monospace;color:var(--muted-foreground);border-top:1px solid var(--border)}</style></head><body>${markup}<footer class="sample-proof">Synthetic component evidence · no authenticated shell or live data · system font fallback<br>Source ${sourceHead}${sourceDirty ? " + uncommitted source" : ""}</footer></body></html>`;
    fs.writeFileSync(path.join(output, `home-${appearance}.html`), html);
  }
  console.log(JSON.stringify({ output: "samples/home-{light,dark}.html", sourceHead, sourceDirty, evidence: "SSR actual HomeLaunchpad; synthetic provider; actual app CSS; system font fallback; no browser interaction" }));
} finally {
  if (fs.existsSync(bundle)) fs.unlinkSync(bundle);
}
