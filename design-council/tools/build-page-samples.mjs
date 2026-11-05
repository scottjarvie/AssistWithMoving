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
const sourceDirty = Boolean(execFileSync("git", ["status", "--porcelain", "--", "src", "design-council/tools"], { cwd: repo, encoding: "utf8" }).trim());
const generatedAt = new Date().toISOString();
const moves = [{
  _id: "synthetic-move-1", title: "[synthetic] A new place across town",
  origin: "Example West", destination: "Example East",
  dateStart: "2026-11-14", dateEnd: "2026-11-15",
}, {
  _id: "synthetic-move-2", title: "[synthetic] Moving the workshop, shelves, and a very long room name across town",
  origin: "Example Studio", destination: "Example House", dateStart: "2026-11-21", dateEnd: "2026-11-22",
}, {
  _id: "synthetic-move-3", title: "[synthetic] Completed storage move", origin: "Example Store", destination: "Example Unit",
}, { _id: "synthetic-move-4", title: "[synthetic] A later move" }];
const fixtures = {
  populated: { activeMoves: moves, selectedMove: moves[1], loadingMoves: false },
  empty: { activeMoves: [], loadingMoves: false },
  loading: { activeMoves: [], loadingMoves: true },
};
const bundle = path.join(output, ".home-component.generated.mjs");
try {
  await build({
    stdin: { contents: 'import React from "react"; import {renderToStaticMarkup} from "react-dom/server"; import {HomeLaunchpad} from "@/components/home-launchpad"; import {setWorkspace} from "@/components/move-workspace-context"; export function render(fixture){setWorkspace(fixture);return renderToStaticMarkup(React.createElement(HomeLaunchpad));}', resolveDir: repo, loader: "tsx" },
    outfile: bundle, bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic",
    plugins: [{ name: "council-synthetic-provider", setup(context) {
      context.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next/link.js", external: true }));
      context.onResolve({ filter: /^@\/components\/move-workspace-context$/ }, () => ({ path: "synthetic-workspace", namespace: "council" }));
      context.onLoad({ filter: /.*/, namespace: "council" }, () => ({ contents: 'let workspace={};export const setWorkspace=value=>{workspace=value};export const useMoveWorkspace=()=>workspace;', loader: "js" }));
      context.onResolve({ filter: /^@\// }, args => {
        const candidate = path.join(repo, "src", args.path.slice(2));
        const file = [candidate, `${candidate}.tsx`, `${candidate}.ts`, `${candidate}.js`].find(value => fs.existsSync(value) && fs.statSync(value).isFile());
        if (!file) throw new Error(`Unresolved local sample import: ${args.path}`);
        return { path: file };
      });
    } }],
  });
  const { render } = await import(pathToFileURL(bundle).href);
  const cssPath = path.join(repo, "src/app/globals.css");
  const sources = ["home-launchpad.tsx", "moving-symbol.tsx", "ui/button.tsx", "ui/skeleton.tsx"];
  const inputCss = fs.readFileSync(cssPath, "utf8").replace('@import "tailwindcss";', '@import "tailwindcss" source(none);') + sources.map(file => `\n@source "${path.join(repo, "src/components", file).replaceAll("\\", "/")}";`).join("");
  const { css } = await postcss([tailwind({ base: repo })]).process(inputCss, { from: cssPath });
  const sampleCss = postcss.parse(css);
  // The authenticated shell is absent from this component sample. Its fixed
  // viewport rules also cannot be used inside an auto-height gallery frame.
  sampleCss.walkRules(rule => { if (rule.selector.includes(".workspace-") || /^(html\.h-full|body\.min-h-full)$/.test(rule.selector)) rule.remove(); });
  for (const [scenario, fixture] of Object.entries(fixtures)) for (const appearance of ["light", "dark"]) {
    const markup = render(fixture);
    // These standalone capture artifacts paint the application's real canvas.
    // The inline gallery itself keeps its frame transparent and embeds PNGs.
    const html = `<!doctype html><html lang="en" class="${appearance === "dark" ? "dark" : ""}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Moving home · synthetic ${scenario} component evidence</title><style>${sampleCss}</style><style>:root{--font-geist-sans:ui-sans-serif,system-ui,sans-serif;--font-geist-mono:ui-monospace,monospace}html,body{margin:0}body{background:var(--background);color:var(--foreground)}.sample-proof{padding:12px 16px;font:11px ui-monospace,monospace;color:var(--muted-foreground);border-top:1px solid var(--border)}</style></head><body>${markup}<footer class="sample-proof">Synthetic ${scenario} component evidence · no authenticated shell or live data · system font fallback<br>Source ${sourceHead}${sourceDirty ? " + uncommitted application/generator source" : ""}<br>Generated ${generatedAt}; relative dates use this build time.</footer></body></html>`;
    fs.writeFileSync(path.join(output, `home-${scenario === "populated" ? "" : `${scenario}-`}${appearance}.html`), html);
  }
  console.log(JSON.stringify({ output: "samples/home-{light,dark}.html plus empty/loading states", sourceHead, sourceDirty, generatedAt, evidence: "SSR actual HomeLaunchpad; synthetic provider; actual app CSS/canvas; system font fallback; no browser interaction" }));
} finally {
  if (fs.existsSync(bundle)) fs.unlinkSync(bundle);
}
