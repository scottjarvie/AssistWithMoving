import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

// A client-rendered, offline fixture: real components, Radix interactions,
// application CSS and bundled Geist. No Next server, credentials or backend.
os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.join(repo, "output/moving-council");
fs.mkdirSync(output, { recursive: true });
const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
const sourceDirty = Boolean(execFileSync("git", ["status", "--porcelain", "--", "src", "convex", "package.json", "package-lock.json", "design-council/tools"], { cwd: repo, encoding: "utf8" }).trim());
const approvedMark = `data:image/svg+xml;base64,${fs.readFileSync(path.join(repo,"src/app/icon.svg")).toString("base64")}`;
const modules = {
  "next/image": `import React from "react";export default function Image({src,fill,priority,unoptimized,quality,loader,placeholder,blurDataURL,...props}){if(src!=="/icon.svg")throw new Error("Unlisted image in offline reader: "+src);return <img {...props} src={${JSON.stringify(approvedMark)}}/>}` ,
  "convex/react": `import {fixtureQuery} from ${JSON.stringify(path.join(repo, "design-council/tools/offline-fixture.ts"))}; export const useQuery=fixtureQuery; const refuse=async()=>{window.__fixtureWritesBlocked=(window.__fixtureWritesBlocked??0)+1;throw new Error("Offline fixture: writes are disabled")}; export const useMutation=()=>refuse; export const useAction=()=>refuse;`,
  "@clerk/nextjs": 'export const useAuth=()=>({isLoaded:true,isSignedIn:true});',
  "next/link": 'import React from "react"; export default React.forwardRef(function Link({href,children,...props},ref){return <a {...props} ref={ref} href="#" data-fixture-destination={typeof href==="string"?href:JSON.stringify(href)}>{children}</a>});',
  "next/navigation": 'const notice=destination=>window.dispatchEvent(new CustomEvent("fixture:navigation",{detail:String(destination)}));export const useRouter=()=>({push:notice,replace:notice,refresh:()=>notice("Refresh")});export const usePathname=()=>"/offline-council";export const useSearchParams=()=>new URLSearchParams(location.search);',
  "fixture-api": 'export const api=new Proxy({},{get:(_,ns)=>new Proxy({},{get:(_,name)=>`${String(ns)}.${String(name)}`})});',
};
await build({
  absWorkingDir: repo, entryPoints: ["design-council/tools/offline-entry.tsx"], outfile: path.join(output, "components.js"), bundle: true, format: "iife", platform: "browser", minify: true, jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "fictional-offline-boundary", setup(context) {
    context.onResolve({ filter: /./ }, args => {
      if (modules[args.path]) return { path: args.path, namespace: "fixture" };
      if (/_generated\/api$/.test(args.path)) return { path: "fixture-api", namespace: "fixture" };
      return undefined;
    });
    context.onLoad({ filter: /./, namespace: "fixture" }, args => ({ contents: modules[args.path], loader: "tsx", resolveDir: repo }));
  } }],
});
const cssPath = path.join(repo, "src/app/globals.css");
const { css } = await postcss([tailwind({ base: repo })]).process(fs.readFileSync(cssPath, "utf8"), { from: cssPath });
const fontRoot = path.join(repo, "node_modules/next/dist/next-devtools/server/font");
const fonts = [["CouncilGeist", "geist-latin.woff2"], ["CouncilMono", "geist-mono-latin.woff2"]].map(([name, file]) => `@font-face{font-family:${name};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(fontRoot,file)).toString("base64")}) format("woff2");font-style:normal;font-weight:100 900;font-display:block}`).join("");
const provenance = { sourceHead, sourceDirty, generatedAt: new Date().toISOString(), rendering: "Client-rendered actual components; fictional query/auth/navigation boundary; app CSS; no authenticated shell or live data; all fixture writes refused; links show local destination notices", typography: "Latin Geist and Geist Mono bundled with Next devtools, not the app next/font build or its fallback metrics", explicitlyEmptyQueries: ["photos.listForMove", "photos.listForItem", "apiKeys.listForHousehold", "movePeople.listForMove", "moveSpaces.listForMove", "transportResources.listForMoveWithZones"], fixtureLayout: "The offline fixture has no authenticated header. Its workspace navigation offset is zero; public pages render their actual header. Fragment links stay local; all outside destinations are blocked.", runtimeDiagnostics: "Capture must record __fixtureUnknownQueries, __fixtureWritesBlocked and __fixtureNavigationAttempts; unknown queries are not accepted evidence" };
fs.writeFileSync(path.join(output, "provenance.json"), JSON.stringify(provenance, null, 2)+"\n");
const client = fs.readFileSync(path.join(output, "components.js"), "utf8").replace(/<\/script/gi, "<\\/script");
fs.writeFileSync(path.join(output, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'"><title>Moving offline component evidence</title><style>${css}${fonts}:root{--font-geist-sans:CouncilGeist;--font-geist-mono:CouncilMono;--workspace-navigation-offset:0px}html,body{margin:0;min-height:100%;background:var(--background);color:var(--foreground)}</style><script>document.documentElement.classList.toggle("dark",new URLSearchParams(location.search).get("theme")==="dark");window.__fixtureWritesBlocked=0;window.__fixtureUnknownQueries=[];window.__fixtureNavigationAttempts=[];</script></head><body><div id="root"></div><script>${client}</script></body></html>`);
console.log(JSON.stringify({ output, ...provenance }));
