import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const run = path.join(repo, "design-council/2026-11-05-playbook");
const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
const sourceDirty = Boolean(execFileSync("git", ["status", "--porcelain", "--", "src"], { cwd: repo, encoding: "utf8" }).trim());
const css = fs.readFileSync(path.join(repo, "src/app/globals.css"), "utf8");
const light = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1];
const dark = css.match(/\.dark\s*\{([\s\S]*?)\}/)?.[1];
if (!light || !dark) throw new Error("Both application theme token blocks are required.");

// Render the actual pure React SVG component; the gallery does not redraw it.
const symbolsSource = fs.readFileSync(path.join(repo, "src/components/moving-symbol.tsx"), "utf8");
const generatedModule = path.join(run, ".gallery-symbols.generated.mjs");
fs.writeFileSync(generatedModule, ts.transpileModule(symbolsSource, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
let MoveIllustration;
try { ({ MoveIllustration } = await import(pathToFileURL(generatedModule).href)); }
finally { fs.unlinkSync(generatedModule); }

const manifest = JSON.parse(fs.readFileSync(path.join(run, "rounds.json"), "utf8"));
const rounds = [...manifest.rounds].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
let imageNumber = 0;
const image = (markup, caption, now = false) => `<figure><button class="art" data-image="${++imageNumber}" aria-label="Open image ${imageNumber}: ${escape(caption)}">${markup}</button><figcaption><b>${imageNumber}</b> · ${escape(caption)} ${now ? '<strong class="now">now</strong>' : ""}</figcaption></figure>`;
const sections = rounds.map(round => {
  const pictures = round.kind === "foundation"
    ? ["route", "box", "room", "truck"].map(kind => image(renderToStaticMarkup(createElement(MoveIllustration, { kind })), `${kind[0].toUpperCase() + kind.slice(1)} image slot · domain illustration`)).join("")
    : round.images.map(item => {
      const file = path.resolve(run, item.path);
      if (!file.startsWith(run + path.sep) || !/\.(png|jpe?g|webp)$/i.test(file)) throw new Error("Gallery screenshots must be raster files inside this run folder.");
      const mime = /\.png$/i.test(file) ? "image/png" : /\.webp$/i.test(file) ? "image/webp" : "image/jpeg";
      return image(`<img src="data:${mime};base64,${fs.readFileSync(file).toString("base64")}" alt="${escape(item.caption)}" />`, item.caption, item.now);
    }).join("");
  return `<section id="${escape(round.id)}"><header><p class="eyebrow">${escape(round.createdAt)} · ${escape(round.status)}</p><h2>${escape(round.title)}</h2><p>${escape(round.description)}</p></header>${round.kind === "foundation" ? '<div class="swatches"><span style="--swatch:var(--background)">Paper</span><span style="--swatch:var(--primary)">Kraft</span><span style="--swatch:var(--accent)">Attention</span><span style="--swatch:var(--evidence)">Evidence</span><span style="--swatch:var(--foreground)">Ink</span></div>' : ""}<div class="pictures">${pictures}</div></section>`;
}).join("");
const updated = new Date().toISOString();
const html = `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Moving · design council</title><style>
:root{${light}--font-sans:ui-sans-serif,system-ui,sans-serif;--font-mono:ui-monospace,monospace}html[data-theme="dark"]{${dark}}
*{box-sizing:border-box}html,body{margin:0;background:transparent;color:var(--foreground);font-family:var(--font-sans);font-size:14px;line-height:1.6}h1,h2,p{margin:0}h1{font-size:28px;letter-spacing:-.04em}h2{font-size:21px;letter-spacing:-.025em}button{font:inherit;color:inherit;cursor:pointer}button:focus-visible,a:focus-visible{outline:2px solid var(--ring);outline-offset:3px}a{color:var(--evidence)}.intro{display:flex;gap:16px;justify-content:space-between;align-items:start;flex-wrap:wrap;margin-bottom:24px}.eyebrow{font:11px var(--font-mono);text-transform:uppercase;letter-spacing:.08em;color:var(--muted-foreground);margin-bottom:8px}.note{color:var(--muted-foreground);max-width:76ch;margin-top:8px}.themes{display:flex;gap:4px}.themes button,.close,.step{min-height:44px;border:1px solid var(--border);border-radius:4px;background:var(--card);padding:6px 12px}.themes button[aria-pressed=true]{border-color:var(--primary);color:var(--primary)}section{border-top:2px solid var(--primary);margin:0 0 28px;padding:20px 16px;background:var(--card)}section header p:last-child{max-width:78ch;color:var(--muted-foreground);margin-top:6px}.swatches{display:flex;flex-wrap:wrap;gap:16px;border-block:1px solid var(--border);margin:18px 0;padding:12px 0}.swatches span{display:flex;gap:7px;align-items:center;font-size:12px}.swatches span:before{content:"";width:18px;height:18px;border:1px solid var(--border);background:var(--swatch);border-radius:2px}.pictures{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}figure{margin:0;min-width:0}.art{display:block;width:100%;border:1px solid var(--border);border-radius:4px;padding:8px;background:var(--background)}.art svg{display:block;width:100%;height:auto}.art img{display:block;max-width:100%;max-height:480px;margin:auto;object-fit:contain}figcaption{font-size:12px;color:var(--muted-foreground);margin-top:6px}.now{padding:2px 6px;color:var(--primary);border:1px solid var(--primary);font-weight:500}footer{font-size:12px;color:var(--muted-foreground);overflow-wrap:anywhere}dialog{width:min(1100px,calc(100% - 24px));max-height:90dvh;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--foreground);padding:16px}dialog::backdrop{background:#0009}.lightbox-controls{display:flex;justify-content:space-between;gap:8px;margin-bottom:12px}#lightbox-image{overflow:auto;max-height:70dvh}#lightbox-image img,#lightbox-image svg{display:block;max-width:100%;height:auto;margin:auto}.close{margin-left:auto}@media(max-width:480px){.pictures{grid-template-columns:1fr}section{padding:16px 12px}h1{font-size:24px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
</style></head><body><header class="intro"><div><p class="eyebrow">Assist With Moving · local design council</p><h1>Moving, by the playbook.</h1><p class="note">Newest round first. This first entry shows the actual SVG image slots and application palette. It is a component sampler; live pages, browser interaction and final council approval are still pending.</p></div><div class="themes" aria-label="Gallery appearance"><button data-theme-button="light" aria-pressed="true">Light</button><button data-theme-button="dark" aria-pressed="false">Dark</button></div></header>${sections}<footer>Last updated <time>${updated}</time> · Source ${sourceHead}${sourceDirty ? " + uncommitted application changes" : ""}.<br>Generated from actual application tokens and SVG components. No user data. Page screenshots and judge scores will be added to their own rounds.</footer><dialog aria-label="Numbered design image"><div class="lightbox-controls"><button class="step" data-step="-1" aria-label="Previous image">←</button><button class="step" data-step="1" aria-label="Next image">→</button><button class="close">Close</button></div><div id="lightbox-image"></div><p id="lightbox-caption"></p></dialog><script>
const dialog=document.querySelector('dialog'),art=[...document.querySelectorAll('.art')];let current=0;function show(index){current=(index+art.length)%art.length;document.getElementById('lightbox-image').replaceChildren(art[current].firstElementChild.cloneNode(true));document.getElementById('lightbox-caption').textContent=art[current].parentElement.querySelector('figcaption').textContent;}art.forEach((item,index)=>item.addEventListener('click',()=>{show(index);dialog.showModal()}));document.querySelector('.close').addEventListener('click',()=>dialog.close());document.querySelectorAll('[data-step]').forEach(button=>button.addEventListener('click',()=>show(current+Number(button.dataset.step))));dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft')show(current-1);if(event.key==='ArrowRight')show(current+1)});document.querySelectorAll('[data-theme-button]').forEach(button=>button.addEventListener('click',()=>{document.documentElement.dataset.theme=button.dataset.themeButton;document.querySelectorAll('[data-theme-button]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)))}));
</script></body></html>`;
fs.writeFileSync(path.join(run, "gallery.html"), html);
console.log(JSON.stringify({ gallery: "design-council/2026-11-05-playbook/gallery.html", images: imageNumber, rounds: rounds.length, sourceHead, sourceDirty, updated }));
