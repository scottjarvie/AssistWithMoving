#!/usr/bin/env node

/**
 * Compile Assist With Moving's repo-owned tracker into server-free HTML.
 *
 * Canonical state stays in Cards, Work Orders, and GUIDE.md. The generated
 * readers have no external runtime dependencies and work from file://.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "docs", "tracker");
const metadata = JSON.parse(readFileSync(join(DIR, "tracker.json"), "utf8"));

function parse(relativePath) {
  const raw = readFileSync(join(DIR, relativePath), "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`${relativePath}: missing frontmatter`);
  const meta = {};
  for (const line of match[1].split("\n")) {
    const field = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (field) meta[field[1]] = field[2].replace(/^"|"$/g, "").trim();
  }
  return { ...meta, relativePath, body: match[2].trim() };
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function inline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}

function markdown(source) {
  const output = [];
  let list = null;
  let paragraph = [];
  let code = null;
  const closeParagraph = () => {
    if (paragraph.length) output.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) output.push(`</${list}>`);
    list = null;
  };
  for (const line of source.split("\n")) {
    if (line.startsWith("```")) {
      closeParagraph(); closeList();
      if (code === null) code = [];
      else { output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`); code = null; }
      continue;
    }
    if (code !== null) { code.push(line); continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    const item = line.match(/^(?:[-*]|\d+\.)\s+(?:\[([ xX])\]\s+)?(.+)$/);
    const listType = /^\d+\./.test(line) ? "ol" : "ul";
    if (heading) {
      closeParagraph(); closeList();
      const level = Math.max(2, heading[1].length);
      output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (item) {
      closeParagraph();
      if (list && list !== listType) closeList();
      if (!list) { output.push(`<${listType}>`); list = listType; }
      const check = item[1] === undefined ? "" : `<span aria-hidden="true">${item[1].trim() ? "☑" : "☐"}</span> `;
      output.push(`<li>${check}${inline(item[2])}</li>`);
    } else if (!line.trim()) {
      closeParagraph(); closeList();
    } else if (line.startsWith("> ")) {
      closeParagraph(); closeList(); output.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
    } else {
      closeList(); paragraph.push(line.trim());
    }
  }
  if (code !== null) throw new Error("unclosed Markdown code fence");
  closeParagraph(); closeList();
  return output.join("\n");
}

const cards = readdirSync(join(DIR, "cards"))
  .filter((name) => name.endsWith(".md"))
  .sort()
  .map((name) => parse(`cards/${name}`));
const orders = readdirSync(join(DIR, "work-orders"))
  .filter((name) => name.endsWith(".md"))
  .sort()
  .map((name) => parse(`work-orders/${name}`));
const guideSource = readFileSync(join(DIR, "GUIDE.md"), "utf8");

const cardData = cards.map((card) => ({ ...card, html: markdown(card.body) }));
const orderData = orders.map((order) => ({ ...order, html: markdown(order.body) }));
const cardJson = JSON.stringify(cardData);
const orderJson = JSON.stringify(orderData);

const styles = `
  :root {
    color-scheme:light; --paper:#eee9dc; --paper-2:#e5decd; --sheet:#fbf8ef;
    --ink:#172631; --muted:#536269; --deep:#0d2634; --route:#2f718a;
    --route-wash:#dce9e9; --sage:#657d70; --signal:#b84f2f;
    --signal-wash:#f4ddd3; --amber:#c98732; --rule:#c9bfaa; --focus:#e36b35;
    --shadow:0 14px 36px rgb(13 38 52 / .12);
  }
  html[data-mode="night"] {
    color-scheme:dark; --paper:#14242d; --paper-2:#102029; --sheet:#1b2d36;
    --ink:#eef2ed; --muted:#bdc8c1; --deep:#f8f1e6; --route:#80bfd4;
    --route-wash:#203c47; --sage:#a9beb2; --signal:#f18a60;
    --signal-wash:#432c2a; --amber:#edb65f; --rule:#465964; --focus:#ff9a70;
    --shadow:0 18px 42px rgb(0 0 0 / .28);
  }
  * { box-sizing:border-box; }
  html { scroll-behavior:smooth; }
  body {
    margin:0; color:var(--ink); background-color:var(--paper);
    background-image:linear-gradient(rgb(47 113 138 / .045) 1px,transparent 1px),linear-gradient(90deg,rgb(47 113 138 / .045) 1px,transparent 1px);
    background-size:28px 28px; font:15px/1.55 "Avenir Next",Avenir,"Trebuchet MS",sans-serif;
  }
  button,input,select { font:inherit; }
  button,a,select,input { -webkit-tap-highlight-color:transparent; }
  a { color:var(--route); }
  code { background:var(--paper-2); border-radius:4px; padding:2px 5px; font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
  pre { overflow:auto; padding:14px; background:var(--paper-2); border:1px solid var(--rule); border-radius:8px; }
  pre code { padding:0; white-space:pre; }
  :focus-visible { outline:3px solid var(--focus); outline-offset:3px; }
  .skip { position:fixed; top:8px; left:10px; z-index:100; transform:translateY(-170%); background:var(--deep); color:var(--paper); padding:10px 14px; border-radius:6px; }
  .skip:focus { transform:none; }
  header {
    border-top:7px solid var(--signal); border-bottom:1px solid var(--rule);
    padding:18px clamp(14px,4vw,48px) 16px; background:color-mix(in srgb,var(--sheet) 96%,transparent);
  }
  .mast { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:18px; align-items:start; max-width:1560px; margin:auto; }
  .eyebrow { margin:0 0 3px; color:var(--signal); text-transform:uppercase; letter-spacing:.15em; font-weight:800; font-size:11px; }
  h1,h2,h3 { font-family:Georgia,"Times New Roman",serif; color:var(--deep); }
  h1 { margin:0; font-size:clamp(25px,4vw,42px); line-height:1.08; }
  .sub { margin:7px 0 0; color:var(--muted); max-width:78ch; }
  .truth-key { margin:9px 0 0; color:var(--ink); font-size:12px; max-width:86ch; }
  .truth-key strong { color:var(--signal); }
  nav { display:flex; justify-content:flex-end; gap:6px; flex-wrap:wrap; }
  .button,.mode {
    display:inline-flex; align-items:center; justify-content:center; min-height:44px; padding:8px 12px;
    color:var(--ink); background:var(--sheet); border:1px solid var(--rule); border-radius:7px; text-decoration:none; cursor:pointer;
  }
  .mode { color:var(--signal); font-weight:700; }
  main { max-width:1600px; margin:auto; padding:22px clamp(12px,3vw,40px) 72px; }
  .briefing { display:grid; grid-template-columns:repeat(5,minmax(110px,1fr)); gap:8px; margin-bottom:16px; }
  .metric { min-width:0; background:var(--sheet); border:1px solid var(--rule); border-radius:7px; padding:11px 13px; }
  .metric span { display:block; color:var(--muted); font-size:12px; }
  .metric strong { display:block; color:var(--deep); font:700 23px/1.2 Georgia,serif; overflow-wrap:anywhere; }
  .viewbar { position:sticky; top:0; z-index:20; display:flex; gap:8px; align-items:center; padding:9px; margin-bottom:12px; background:color-mix(in srgb,var(--paper) 92%,transparent); border:1px solid var(--rule); border-radius:9px; backdrop-filter:blur(12px); }
  .viewbar button { min-height:44px; padding:8px 14px; color:var(--ink); background:var(--sheet); border:1px solid var(--rule); border-radius:999px; cursor:pointer; }
  .viewbar button[aria-selected="true"] { color:var(--paper); background:var(--deep); border-color:var(--deep); }
  .needs-entry { margin-left:auto; border:2px solid var(--signal) !important; color:var(--signal) !important; font-weight:800; }
  .controls { display:grid; grid-template-columns:minmax(220px,2fr) repeat(3,minmax(130px,1fr)) auto; gap:9px; padding:12px; margin-bottom:16px; background:var(--sheet); border:1px solid var(--rule); border-left:5px solid var(--route); border-radius:9px; }
  .field { display:grid; gap:4px; min-width:0; }
  .field label { color:var(--muted); font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
  .field input,.field select { width:100%; min-height:44px; padding:8px 10px; color:var(--ink); background:var(--paper); border:1px solid var(--rule); border-radius:6px; }
  .clear { align-self:end; min-height:44px; padding:8px 12px; color:var(--route); background:transparent; border:1px solid var(--route); border-radius:6px; cursor:pointer; }
  .order-note { display:flex; align-items:center; gap:14px; margin:0 0 14px; padding:11px 12px; color:var(--ink); background:var(--route-wash); border:1px solid var(--route); border-radius:9px; }
  .order-note strong { display:block; color:var(--deep); font-family:Georgia,"Times New Roman",serif; }
  .order-note p { margin:1px 0 0; color:var(--muted); font-size:12px; }
  .order-status { flex:1; min-width:0; }
  .reset-order { flex:0 0 auto; min-height:44px; padding:8px 12px; color:var(--route); background:var(--sheet); border:1px solid var(--route); border-radius:6px; cursor:pointer; }
  .reset-order:disabled { opacity:.55; cursor:not-allowed; }
  .result-line { margin:-5px 2px 15px; color:var(--muted); font-size:13px; }
  .section-head { display:flex; align-items:end; justify-content:space-between; gap:18px; margin:26px 0 10px; border-bottom:1px solid var(--rule); }
  .section-head h2 { margin:0; font-size:22px; }
  .section-head p { margin:0 0 5px; color:var(--muted); font-size:13px; }
  .current-board { display:grid; grid-template-columns:repeat(4,minmax(220px,1fr)); gap:11px; }
  .lane { min-width:0; padding:10px; background:color-mix(in srgb,var(--sheet) 88%,var(--paper)); border-top:4px solid var(--route); border-radius:7px; }
  .lane[data-status="needs-you"] { border-color:var(--signal); }
  .lane[data-status="done"] { border-color:var(--sage); }
  .lane h3 { margin:1px 2px 10px; font-size:17px; }
  .count { color:var(--muted); font:12px/1.2 ui-monospace,monospace; }
  .card-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:9px; align-items:stretch; }
  .lane .card-grid { grid-template-columns:1fr; }
  .card-wrap { min-width:0; padding:5px; border:1px solid transparent; border-radius:9px; }
  .card-wrap.dragging { opacity:.55; border-color:var(--signal); }
  .card-wrap.drop-target { background:var(--signal-wash); border-color:var(--signal); }
  .card {
    width:100%; min-height:118px; margin:0; padding:12px; text-align:left; color:var(--ink); background:var(--sheet);
    border:1px solid var(--rule); border-radius:7px; cursor:grab; touch-action:pan-y; user-select:none; box-shadow:0 2px 0 rgb(13 38 52 / .04);
    transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease,opacity .15s ease;
  }
  .card:hover { transform:translateY(-2px); border-color:var(--route); box-shadow:var(--shadow); }
  .card-wrap.dragging .card { cursor:grabbing; transform:none; }
  .card[data-status="needs-you"] { border-top:4px solid var(--signal); }
  .card .id { display:flex; justify-content:space-between; gap:8px; color:var(--muted); font:11px/1.3 ui-monospace,SFMono-Regular,monospace; }
  .card .title { display:block; margin:6px 0 9px; color:var(--deep); font:700 15px/1.28 Georgia,serif; }
  .tag { display:inline-block; margin:2px 4px 0 0; padding:2px 6px; color:var(--muted); border:1px solid var(--rule); border-radius:999px; font:10px/1.4 ui-monospace,monospace; text-transform:uppercase; }
  .tag.P1 { color:var(--signal); border-color:var(--signal); }
  .backlog { display:grid; gap:10px; }
  .backlog-group { background:color-mix(in srgb,var(--sheet) 88%,var(--paper)); border:1px solid var(--rule); border-radius:9px; overflow:hidden; }
  .backlog-group > summary { min-height:52px; display:flex; align-items:center; gap:10px; padding:11px 14px; cursor:pointer; color:var(--deep); font:700 16px Georgia,serif; list-style:none; }
  .backlog-group > summary::-webkit-details-marker { display:none; }
  .backlog-group > summary::before { content:"+"; width:23px; color:var(--route); font:700 20px/1 ui-monospace,monospace; }
  .backlog-group[open] > summary::before { content:"−"; }
  .backlog-group .card-grid { padding:0 12px 12px; }
  .show-all { display:block; min-height:44px; margin:0 12px 12px; padding:8px 13px; color:var(--route); background:var(--sheet); border:1px solid var(--route); border-radius:6px; cursor:pointer; }
  .empty { margin:0; padding:14px; color:var(--muted); font-style:italic; }
  [hidden] { display:none !important; }
  .orders { display:grid; grid-template-columns:repeat(auto-fit,minmax(290px,1fr)); gap:12px; }
  .order { padding:16px; background:var(--sheet); border:1px solid var(--rule); border-left:5px solid var(--sage); border-radius:8px; }
  .order h2 { margin:5px 0 8px; font-size:19px; }
  .order .meta { color:var(--muted); font-size:12px; }
  .progress { height:8px; margin:12px 0; overflow:hidden; background:var(--paper-2); border-radius:99px; }
  .progress span { display:block; height:100%; background:var(--route); }
  .order-actions { display:flex; flex-wrap:wrap; gap:7px; margin-top:12px; }
  .order-actions button { min-height:44px; padding:8px 12px; color:var(--ink); background:var(--paper); border:1px solid var(--rule); border-radius:6px; cursor:pointer; }
  dialog { width:min(780px,calc(100vw - 28px)); max-height:min(90dvh,920px); padding:0; color:var(--ink); background:var(--sheet); border:1px solid var(--rule); border-top:7px solid var(--signal); border-radius:10px; box-shadow:0 30px 90px rgb(0 0 0 / .42); }
  dialog::backdrop { background:rgb(8 25 34 / .68); backdrop-filter:blur(3px); }
  .dialog-bar { position:sticky; top:0; z-index:2; display:flex; align-items:center; gap:8px; padding:10px 12px; background:var(--sheet); border-bottom:1px solid var(--rule); }
  .dialog-bar .source-link { min-height:44px; display:inline-flex; align-items:center; padding:8px 12px; border:1px solid var(--route); border-radius:6px; text-decoration:none; }
  .dialog-bar button { min-height:44px; padding:8px 12px; color:var(--ink); background:var(--paper); border:1px solid var(--rule); border-radius:6px; cursor:pointer; }
  .dialog-bar .copy { margin-left:auto; color:var(--paper); background:var(--deep); border-color:var(--deep); }
  .detail { padding:18px clamp(16px,4vw,34px) 34px; overflow-wrap:anywhere; }
  .detail .detail-id { color:var(--muted); font:12px/1.4 ui-monospace,monospace; }
  .detail h2 { margin:6px 0 18px; font-size:clamp(23px,4vw,34px); line-height:1.15; }
  .detail h3 { margin-top:28px; font-size:19px; }
  .detail blockquote { margin-left:0; padding-left:14px; color:var(--muted); border-left:4px solid var(--amber); }
  .fallback { width:100%; min-height:260px; padding:10px; color:var(--ink); background:var(--paper); border:1px solid var(--rule); border-radius:6px; font:12px/1.5 ui-monospace,monospace; }
  .guide { max-width:800px; margin:auto; padding:22px; background:var(--sheet); border:1px solid var(--rule); border-top:5px solid var(--route); border-radius:9px; }
  .sr-only { position:absolute !important; width:1px !important; height:1px !important; padding:0 !important; margin:-1px !important; overflow:hidden !important; clip:rect(0,0,0,0) !important; white-space:nowrap !important; border:0 !important; }
  @media (max-width:960px) {
    .controls { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .clear { align-self:stretch; }
    .current-board { grid-template-columns:repeat(2,minmax(0,1fr)); }
  }
  @media (max-width:700px) {
    html { scroll-behavior:auto; }
    header { padding:14px 12px; }
    .mast { grid-template-columns:1fr; }
    nav { justify-content:flex-start; }
    main { padding:14px 10px 52px; }
    .briefing { display:flex; overflow-x:auto; padding-bottom:4px; scroll-snap-type:x proximity; }
    .metric { flex:0 0 142px; scroll-snap-align:start; }
    .viewbar { border-radius:0; margin-inline:-1px; overflow-x:auto; }
    .viewbar button { flex:0 0 auto; }
    .controls { grid-template-columns:1fr; }
    .order-note { align-items:flex-start; flex-direction:column; }
    .reset-order { width:100%; }
    .current-board { grid-template-columns:1fr; }
    .card-grid { grid-template-columns:1fr; }
    .section-head { display:block; }
    .section-head p { margin-top:3px; }
    dialog { width:100vw; max-width:none; max-height:100dvh; margin:auto 0 0; border-radius:12px 12px 0 0; }
    .dialog-bar { flex-wrap:wrap; }
    .dialog-bar .source-link { flex:1 0 100%; }
    .dialog-bar .copy { margin-left:0; flex:1 1 auto; }
    .dialog-bar button { flex:0 0 auto; }
  }
  @media (max-width:420px) {
    .button,.mode { min-height:46px; }
    .dialog-bar { padding-inline:8px; }
  }
  @media (prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto !important; transition:none !important; } }
`;

function shell({ title, main, script, guide = false }) {
  return `<!doctype html>
<html lang="en" data-mode="day"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:," /><title>${title}</title><style>${styles}</style></head>
<body><a class="skip" href="#${guide ? "guide" : "workspace"}">Skip to ${guide ? "guide" : "tracker"}</a>
<header><div class="mast"><div><p class="eyebrow">Moving field desk · route notes</p><h1>${title}</h1><p class="sub">A durable local view of what is moving now, what is staged for later, and what needs a decision. Markdown remains the source.</p><p class="truth-key"><strong>Truth key:</strong> Current means verified evidence; Partial means useful foundations with a named gap; Later means not selected or not yet verified. Workflow lanes never upgrade capability truth.</p></div><nav aria-label="Tracker links"><a class="button" href="${metadata.projectUrl}">Project</a><a class="button" href="${metadata.projectPhilosophy}">Project Philosophy</a><a class="button" href="${metadata.familyCore.url}">Family Core</a><a class="button" href="${guide ? "board.html" : "guide.html"}">${guide ? "Board" : "Guide"}</a><button class="mode" id="mode" type="button">Night mode</button></nav></div></header>
<main id="${guide ? "guide" : "workspace"}" tabindex="-1">${main}</main><script>${script}</script></body></html>`;
}

const sharedScript = `
const root=document.documentElement,mode=document.getElementById("mode");
function storageGet(key){try{return localStorage.getItem(key)}catch{return null}}
function storageSet(key,value){try{localStorage.setItem(key,value)}catch{}}
function setMode(value){root.dataset.mode=value;mode.textContent=value==="day"?"Night mode":"Day mode";storageSet("moving-tracker-mode",value)}
setMode(storageGet("moving-tracker-mode")||(matchMedia("(prefers-color-scheme:dark)").matches?"night":"day"));
mode.onclick=()=>setMode(root.dataset.mode==="day"?"night":"day");`;

const boardMain = `
<section class="briefing" aria-label="Tracker briefing" id="briefing"></section>
<div class="viewbar" role="tablist" aria-label="Tracker view"><button id="boardTab" type="button" role="tab" aria-selected="true" aria-controls="boardView">Cards</button><button id="ordersTab" type="button" role="tab" aria-selected="false" aria-controls="ordersView">Work Orders</button><button id="needsEntry" class="needs-entry" type="button">Needs You · 0</button></div>
<section id="boardView" role="tabpanel" aria-labelledby="boardTab">
  <form class="controls" id="filters" role="search"><div class="field"><label for="search">Search every Card</label><input id="search" type="search" autocomplete="off" placeholder="ID, title, area, type, or Card text"></div><div class="field"><label for="priority">Priority</label><select id="priority"><option value="">All priorities</option></select></div><div class="field"><label for="area">Area</label><select id="area"><option value="">All areas</option></select></div><div class="field"><label for="type">Type</label><select id="type"><option value="">All types</option></select></div><button class="clear" id="clear" type="button">Clear filters</button></form>
  <aside class="order-note" aria-labelledby="personalOrderTitle"><div class="order-status"><strong id="personalOrderTitle">Personal Card order</strong><p id="orderStatus">Canonical order shown. Drag a Card after moving the pointer; on touch, long-press then drag. Keyboard: Shift + Arrow. Click, tap, or Enter still opens details.</p></div><button class="reset-order" id="resetOrder" type="button" disabled>Reset to canonical order</button></aside>
  <p class="sr-only" id="orderHelp">Reorder only within this lane. On a focused Card, press Shift plus an arrow key to move earlier or later. Pointer users drag after moving; touch users long-press then drag. Click, tap, Enter, or Space opens Card details.</p><p class="sr-only" id="orderAnnouncer" aria-live="assertive" aria-atomic="true"></p>
  <p class="result-line" id="results" aria-live="polite"></p>
  <div class="section-head"><h2>Current route</h2><p>Active work, owner gates, and completed proof stay distinct.</p></div><section class="current-board" id="currentBoard" aria-label="Current Cards"></section>
  <div class="section-head"><h2>Backlog staging yard</h2><p>Grouped by priority; open a group or search to reveal every matching Card.</p></div><section class="backlog" id="backlog" aria-label="Backlog Cards"></section>
</section>
<section id="ordersView" role="tabpanel" aria-labelledby="ordersTab" hidden><div class="section-head"><h2>Bounded Work Orders</h2><p>No automatic dispatch. Proposed scope requires owner approval; independent audit remains separate.</p></div><section class="orders" id="orders"></section></section>
<dialog id="cardDialog" aria-labelledby="cardTitle"><div class="dialog-bar"><a class="source-link" id="cardSource" href="cards/">Open durable Markdown</a><button class="copy" id="copyCard" type="button">Copy handoff prompt</button><button class="close" type="button" aria-label="Close Card detail">Close</button></div><article class="detail" id="cardDetail"></article></dialog>
<dialog id="orderDialog" aria-labelledby="orderTitle"><div class="dialog-bar"><button class="copy" id="copyOrder" type="button">Copy whole Work Order</button><button class="close" type="button" aria-label="Close Work Order detail">Close</button></div><article class="detail" id="orderDetail"></article></dialog>
<dialog id="fallbackDialog" aria-labelledby="fallbackTitle"><div class="dialog-bar"><button class="close" type="button" aria-label="Close copy fallback">Close</button></div><article class="detail"><h2 id="fallbackTitle">Copy it yourself</h2><p>This viewer blocked automatic copying. The handoff is selected below.</p><textarea class="fallback" id="fallbackText" readonly></textarea></article></dialog>`;

const boardScript = `${sharedScript}
const CARDS=${cardJson};const ORDERS=${orderJson};
const byId=new Map(CARDS.map(card=>[card.id,card]));
const statuses=[["next","Next"],["doing","Doing"],["needs-you","Needs You"],["done","Done"]];
const state={query:"",priority:"",area:"",type:"",view:"board",expanded:new Set()};
const PERSONAL_ORDER_KEY="assist-with-moving:personal-card-order:v1";
const POINTER_DRAG_THRESHOLD=8,TOUCH_LONG_PRESS_MS=450;
let personalOrders={},orderStorageState="available",dragState=null,suppressClickId=null;
const cardDialog=document.getElementById("cardDialog"),orderDialog=document.getElementById("orderDialog"),fallbackDialog=document.getElementById("fallbackDialog");
let currentCard=null,currentOrder=null;
function option(select,value){const item=document.createElement("option");item.value=value;item.textContent=value;select.append(item)}
for(const value of [...new Set(CARDS.map(card=>card.priority))].filter(Boolean).sort())option(document.getElementById("priority"),value);
for(const value of [...new Set(CARDS.map(card=>card.area))].filter(Boolean).sort())option(document.getElementById("area"),value);
for(const value of [...new Set(CARDS.map(card=>card.type))].filter(Boolean).sort())option(document.getElementById("type"),value);
function matches(card){const haystack=[card.id,card.title,card.status,card.area,card.type,card.priority,card.body].join(" ").toLowerCase();return (!state.query||haystack.includes(state.query))&&(!state.priority||card.priority===state.priority)&&(!state.area||card.area===state.area)&&(!state.type||card.type===state.type)}
function sortCards(a,b){return (a.priority||"P9").localeCompare(b.priority||"P9")||a.id.localeCompare(b.id)}
function cardLane(card){return card.status==="backlog"?"backlog:"+(card.priority||"P2"):card.status}
function laneLabel(lane){if(lane.startsWith("backlog:"))return lane.slice(8)+" staging";return (statuses.find(item=>item[0]===lane)?.[1]||lane)+" lane"}
function canonicalLane(lane){return CARDS.filter(card=>cardLane(card)===lane).sort(sortCards)}
function orderedLane(lane){const canonical=canonicalLane(lane),valid=new Set(canonical.map(card=>card.id)),saved=Array.isArray(personalOrders[lane])?personalOrders[lane]:[],ids=[...new Set(saved.filter(id=>valid.has(id)))];for(const card of canonical)if(!ids.includes(card.id))ids.push(card.id);return ids.map(id=>byId.get(id))}
function sameIds(left,right){return left.length===right.length&&left.every((id,index)=>id===right[index])}
function prunePersonalOrders(){for(const lane of Object.keys(personalOrders)){const canonical=canonicalLane(lane).map(card=>card.id),saved=orderedLane(lane).map(card=>card.id);if(!canonical.length||sameIds(canonical,saved))delete personalOrders[lane];else personalOrders[lane]=saved}}
function hasPersonalOrder(){prunePersonalOrders();return Object.keys(personalOrders).length>0}
function loadPersonalOrders(){try{const raw=localStorage.getItem(PERSONAL_ORDER_KEY);if(!raw)return;const parsed=JSON.parse(raw);if(parsed?.version!==1||!parsed.lanes||typeof parsed.lanes!=="object")throw new Error("unsupported personal order");personalOrders=parsed.lanes;prunePersonalOrders()}catch{personalOrders={};orderStorageState="unreadable";try{localStorage.removeItem(PERSONAL_ORDER_KEY)}catch{orderStorageState="unavailable"}}}
function persistPersonalOrders(){prunePersonalOrders();try{if(hasPersonalOrder())localStorage.setItem(PERSONAL_ORDER_KEY,JSON.stringify({version:1,lanes:personalOrders}));else localStorage.removeItem(PERSONAL_ORDER_KEY);orderStorageState="available"}catch{orderStorageState="unavailable"}}
function announceOrder(message){const live=document.getElementById("orderAnnouncer");live.textContent="";requestAnimationFrame(()=>{live.textContent=message})}
function updateOrderStatus(){const personal=hasPersonalOrder(),status=document.getElementById("orderStatus"),reset=document.getElementById("resetOrder");reset.disabled=!personal;if(personal&&orderStorageState==="unavailable")status.textContent="Personal order is active for this viewing session only because browser storage is unavailable. Canonical status, priority, and source are unchanged.";else if(personal)status.textContent="Your personal order is saved in this browser only. Canonical status, priority, Cards, and source Markdown are unchanged.";else if(orderStorageState==="unreadable")status.textContent="A saved order could not be read, so canonical order was restored. You can create a new personal order safely.";else if(orderStorageState==="unavailable")status.textContent="Canonical order shown. Browser storage is unavailable; any personal order will last only for this viewing session.";else status.textContent="Canonical order shown. Drag a Card after moving the pointer; on touch, long-press then drag. Keyboard: Shift + Arrow. Click, tap, or Enter still opens details."}
function focusCard(cardId){requestAnimationFrame(()=>document.querySelector('[data-order-id="'+cardId+'"] .card')?.focus())}
function commitMove(sourceId,targetId,lane,after=false,focusAfter=false){if(sourceId===targetId)return;const source=byId.get(sourceId),target=byId.get(targetId);if(!source||!target||cardLane(source)!==lane||cardLane(target)!==lane){announceOrder("Cards can only be reordered inside the same lane. No status or priority changed.");return}const ids=orderedLane(lane).map(card=>card.id),from=ids.indexOf(sourceId);ids.splice(from,1);let to=ids.indexOf(targetId);if(after)to+=1;ids.splice(to,0,sourceId);personalOrders[lane]=ids;persistPersonalOrders();if(lane.startsWith("backlog:"))state.expanded.add(lane.slice(8));render();announceOrder("Moved "+sourceId+" "+(after?"after ":"before ")+targetId+" in your personal "+laneLabel(lane)+" order. Status and priority did not change.");if(focusAfter)focusCard(sourceId)}
function moveStep(card,lane,direction,visibleLane){const index=visibleLane.findIndex(item=>item.id===card.id),target=visibleLane[index+direction];if(!target){announceOrder(card.id+" is already at the "+(direction<0?"start":"end")+" of the visible "+laneLabel(lane)+". Show all matching Cards to move farther.");return}commitMove(card.id,target.id,lane,direction>0,true)}
function clearDropTarget(){document.querySelectorAll(".card-wrap.drop-target").forEach(item=>item.classList.remove("drop-target"))}
function activatePointerOrder(){if(!dragState||dragState.active)return;dragState.active=true;document.querySelector('[data-order-id="'+dragState.sourceId+'"]')?.classList.add("dragging");announceOrder("Reordering "+dragState.sourceId+" in "+laneLabel(dragState.lane)+". Move onto another Card in this lane, then release.")}
function cancelPendingTouch(){if(!dragState)return;if(dragState.timer)clearTimeout(dragState.timer);try{dragState.button.releasePointerCapture(dragState.pointerId)}catch{}dragState=null}
function startPointerOrder(event){if(event.pointerType==="mouse"&&event.button!==0)return;const button=event.currentTarget,wrap=button.closest(".card-wrap");dragState={sourceId:wrap.dataset.orderId,lane:wrap.dataset.lane,targetId:null,after:false,crossed:false,button,pointerId:event.pointerId,pointerType:event.pointerType,startX:event.clientX,startY:event.clientY,active:false,timer:null};try{button.setPointerCapture(event.pointerId)}catch{}if(event.pointerType==="touch")dragState.timer=setTimeout(activatePointerOrder,TOUCH_LONG_PRESS_MS)}
function movePointerOrder(event){if(!dragState||event.pointerId!==dragState.pointerId)return;const distance=Math.hypot(event.clientX-dragState.startX,event.clientY-dragState.startY);if(!dragState.active){if(dragState.pointerType==="touch"){if(distance>=POINTER_DRAG_THRESHOLD)cancelPendingTouch();return}if(distance<POINTER_DRAG_THRESHOLD)return;activatePointerOrder()}event.preventDefault();clearDropTarget();const target=document.elementFromPoint(event.clientX,event.clientY)?.closest(".card-wrap");if(!target||target.dataset.orderId===dragState.sourceId){dragState.targetId=null;return}if(target.dataset.lane!==dragState.lane){dragState.crossed=true;dragState.targetId=null;return}const rect=target.getBoundingClientRect(),horizontal=Math.abs(event.clientY-(rect.top+rect.height/2))<rect.height*.3;dragState.after=horizontal?event.clientX>rect.left+rect.width/2:event.clientY>rect.top+rect.height/2;dragState.targetId=target.dataset.orderId;target.classList.add("drop-target")}
function endPointerOrder(event){if(!dragState||event.pointerId!==dragState.pointerId)return;const finished=dragState;if(finished.timer)clearTimeout(finished.timer);try{finished.button.releasePointerCapture(event.pointerId)}catch{}document.querySelector('[data-order-id="'+finished.sourceId+'"]')?.classList.remove("dragging");clearDropTarget();dragState=null;if(!finished.active)return;suppressClickId=finished.sourceId;setTimeout(()=>{if(suppressClickId===finished.sourceId)suppressClickId=null},0);if(finished.targetId)commitMove(finished.sourceId,finished.targetId,finished.lane,finished.after);else if(finished.crossed)announceOrder("Cards stay in their current lane. No status or priority changed.");else announceOrder("Personal reorder canceled. Canonical tracker data is unchanged.")}
function cancelPointerOrder(event){if(!dragState||event.pointerId!==dragState.pointerId)return;const wasActive=dragState.active,sourceId=dragState.sourceId;if(dragState.timer)clearTimeout(dragState.timer);document.querySelector('[data-order-id="'+sourceId+'"]')?.classList.remove("dragging");clearDropTarget();dragState=null;if(wasActive)announceOrder("Personal reorder canceled. Canonical tracker data is unchanged.")}
function cardButton(card,lane,visibleLane){const wrap=document.createElement("div");wrap.className="card-wrap";wrap.dataset.orderId=card.id;wrap.dataset.lane=lane;const button=document.createElement("button");button.type="button";button.className="card";button.dataset.status=card.status;button.setAttribute("aria-label","Open "+card.id+": "+card.title);button.setAttribute("aria-describedby","orderHelp");button.setAttribute("aria-keyshortcuts","Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight");button.innerHTML='<span class="id"><span>'+card.id+'</span><span>'+card.status+'</span></span><span class="title">'+card.title+'</span><span class="tag '+(card.priority||"")+'">'+(card.priority||"P2")+'</span><span class="tag">'+card.area+'</span><span class="tag">'+card.type+'</span>'+(card["work-orders"]?'<span class="tag">'+card["work-orders"]+'</span>':"");button.addEventListener("click",event=>{if(suppressClickId===card.id){event.preventDefault();event.stopPropagation();suppressClickId=null;return}openCard(card,true)});button.addEventListener("keydown",event=>{if(event.shiftKey&&["ArrowUp","ArrowLeft","ArrowDown","ArrowRight"].includes(event.key)){event.preventDefault();moveStep(card,lane,["ArrowUp","ArrowLeft"].includes(event.key)?-1:1,visibleLane)}});button.addEventListener("pointerdown",startPointerOrder);button.addEventListener("pointermove",movePointerOrder);button.addEventListener("pointerup",endPointerOrder);button.addEventListener("pointercancel",cancelPointerOrder);wrap.append(button);return wrap}
function render(){
  const visible=CARDS.filter(matches);document.getElementById("results").textContent="Showing "+visible.length+" of "+CARDS.length+" Cards. Every Card remains available in the generated reader.";
  const current=document.getElementById("currentBoard");current.replaceChildren();
  for(const [key,label] of statuses){const lane=document.createElement("section");lane.className="lane";lane.dataset.status=key;const found=orderedLane(key).filter(matches);lane.innerHTML='<h3>'+label+' <span class="count">'+found.length+'</span></h3>';const grid=document.createElement("div");grid.className="card-grid";for(const card of found)grid.append(cardButton(card,key,found));if(!found.length)grid.innerHTML='<p class="empty">Nothing here.</p>';lane.append(grid);current.append(lane)}
  const backlog=document.getElementById("backlog");backlog.replaceChildren();
  for(const priority of ["P1","P2","P3"]){const key="backlog:"+priority,found=orderedLane(key).filter(matches);if(!found.length&&visible.length!==CARDS.length)continue;const details=document.createElement("details");details.className="backlog-group";details.dataset.priority=priority;details.open=priority!=="P3"||Boolean(state.query||state.priority||state.area||state.type);const summary=document.createElement("summary");summary.innerHTML=priority+' staging <span class="count">'+found.length+' Card'+(found.length===1?"":"s")+'</span>';details.append(summary);const grid=document.createElement("div");grid.className="card-grid";const expanded=state.expanded.has(priority)||Boolean(state.query||state.priority||state.area||state.type),shown=found.slice(0,expanded?found.length:6);for(const card of shown)grid.append(cardButton(card,key,shown));if(!found.length)grid.innerHTML='<p class="empty">No matching Cards in this group.</p>';details.append(grid);if(found.length>6&&!expanded){const more=document.createElement("button");more.type="button";more.className="show-all";more.textContent="Show all "+found.length+" "+priority+" Cards";more.addEventListener("click",()=>{state.expanded.add(priority);render()});details.append(more)}backlog.append(details)}
  const needs=CARDS.filter(card=>card.status==="needs-you").length;document.getElementById("needsEntry").textContent="Needs You · "+needs;
  updateOrderStatus();
}
function setView(view){state.view=view;const board=view==="board";document.getElementById("boardView").hidden=!board;document.getElementById("ordersView").hidden=board;document.getElementById("boardTab").setAttribute("aria-selected",String(board));document.getElementById("ordersTab").setAttribute("aria-selected",String(!board));storageSet("moving-tracker-view",view)}
function cardPrompt(card){let prompt="This is a durable Card from the ${metadata.project} project tracker. Work from the verified truth and constraints below.\\n\\nCard "+card.id+" — "+card.title+"\\nStatus "+card.status+" · priority "+card.priority+" · area "+card.area+" · type "+card.type+"\\nCanonical source: docs/tracker/"+card.relativePath+"\\n\\n"+card.body;for(const id of (card["work-orders"]||"").split(/[\\s,]+/).filter(Boolean)){const order=ORDERS.find(item=>item.id===id);if(order)prompt+="\\n\\n=== LINKED WORK ORDER "+order.id+" — "+order.title+" ("+order.execution+") ===\\n\\n"+order.body}return prompt+"\\n\\n---\\nProject Philosophy: ${metadata.projectPhilosophy}\\nFamily Core: ${metadata.familyCore.label} at ${metadata.familyCore.url}\\nTracker Guide: docs/tracker/GUIDE.md\\nNo automatic dispatch. Do not invent authority or evidence. Update the durable source, regenerate the readers, run tracker validation, and preserve execution/audit separation."}
function orderPrompt(order){let prompt="This is a bounded Work Order from the ${metadata.project} project tracker. Confirm its execution state and stop rules before acting.\\n\\n"+order.body;for(const id of order.cards.split(/[\\s,]+/).filter(Boolean)){const card=byId.get(id);if(card)prompt+="\\n\\n=== CARD "+id+" — "+card.title+" ("+card.status+") ===\\n\\n"+card.body}return prompt+"\\n\\n---\\nProject Philosophy: ${metadata.projectPhilosophy}\\nFamily Core: ${metadata.familyCore.label} at ${metadata.familyCore.url}\\nNo automatic dispatch. Work Card by Card, record actual evidence, obey human gates, and leave independent audit to a separate worker."}
async function copyText(value,button){let ok=false;try{await navigator.clipboard.writeText(value);ok=true}catch{}if(!ok){const area=document.createElement("textarea");area.value=value;area.style.position="fixed";area.style.opacity="0";document.body.append(area);area.select();try{ok=document.execCommand("copy")}catch{}area.remove()}if(!ok){document.getElementById("fallbackText").value=value;fallbackDialog.showModal();document.getElementById("fallbackText").focus();document.getElementById("fallbackText").select();return}const previous=button.textContent;button.textContent="Copied ✓";setTimeout(()=>button.textContent=previous,1800)}
function setCardHash(card){try{history.replaceState(null,"","#card-"+card.id)}catch{location.hash="card-"+card.id}}
function clearCardHash(){if(location.hash.startsWith("#card-")){try{history.replaceState(null,"","#workspace")}catch{location.hash="workspace"}}}
function openCard(card,updateHash=false){if(!card)return;currentCard=card;if(updateHash)setCardHash(card);document.getElementById("cardSource").href=card.relativePath;document.getElementById("cardSource").textContent="Open "+card.id+" Markdown";const detail=document.getElementById("cardDetail");detail.innerHTML='<div class="detail-id">'+card.id+' · '+card.status+' · '+card.priority+' · '+card.area+' · '+card.type+'</div><h2 id="cardTitle">'+card.title+'</h2>'+card.html;if(!cardDialog.open)cardDialog.showModal()}
function openOrder(order){currentOrder=order;document.getElementById("orderDetail").innerHTML='<div class="detail-id">'+order.id+' · execution '+order.execution+' · audit '+order.audit+'</div><h2 id="orderTitle">'+order.title+'</h2>'+order.html;if(!orderDialog.open)orderDialog.showModal()}
function renderOrders(){const host=document.getElementById("orders");host.replaceChildren();for(const order of ORDERS){const ids=order.cards.split(/[\\s,]+/).filter(Boolean),done=ids.filter(id=>byId.get(id)?.status==="done").length,pct=ids.length?Math.round(done/ids.length*100):0;const article=document.createElement("article");article.className="order";article.innerHTML='<div class="meta">'+order.id+' · execution <strong>'+order.execution+'</strong> · audit <strong>'+order.audit+'</strong></div><h2>'+order.title+'</h2><div class="progress" aria-label="'+done+' of '+ids.length+' Cards done"><span style="width:'+pct+'%"></span></div><p>'+done+' of '+ids.length+' Cards complete.</p><div class="order-actions"><button type="button" data-open>Open Work Order</button><button type="button" data-copy>Copy whole Work Order</button></div>';article.querySelector("[data-open]").addEventListener("click",()=>openOrder(order));article.querySelector("[data-copy]").addEventListener("click",event=>copyText(orderPrompt(order),event.currentTarget));host.append(article)}}
for(const id of ["search","priority","area","type"]){document.getElementById(id).addEventListener(id==="search"?"input":"change",event=>{state[id==="search"?"query":id]=event.target.value.toLowerCase().trim();render()})}
document.getElementById("clear").addEventListener("click",()=>{state.query=state.priority=state.area=state.type="";for(const id of ["search","priority","area","type"])document.getElementById(id).value="";state.expanded.clear();render();document.getElementById("search").focus()});
document.getElementById("resetOrder").addEventListener("click",()=>{personalOrders={};try{localStorage.removeItem(PERSONAL_ORDER_KEY);orderStorageState="available"}catch{orderStorageState="unavailable"}render();announceOrder("Canonical Card order restored in every lane. No Card status, priority, or source changed.")});
document.getElementById("boardTab").onclick=()=>setView("board");document.getElementById("ordersTab").onclick=()=>setView("orders");document.getElementById("needsEntry").onclick=()=>{setView("board");document.getElementById("search").value="needs-you";state.query="needs-you";render();document.getElementById("currentBoard").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion:reduce)").matches?"auto":"smooth"})};
for(const dialog of [cardDialog,orderDialog,fallbackDialog]){dialog.querySelector(".close").addEventListener("click",()=>dialog.close());dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close()})}
cardDialog.addEventListener("close",clearCardHash);document.getElementById("copyCard").onclick=event=>currentCard&&copyText(cardPrompt(currentCard),event.currentTarget);document.getElementById("copyOrder").onclick=event=>currentOrder&&copyText(orderPrompt(currentOrder),event.currentTarget);
function briefing(){const open=CARDS.filter(card=>card.status!=="done").length,backlog=CARDS.filter(card=>card.status==="backlog").length,needs=CARDS.filter(card=>card.status==="needs-you").length,ready=ORDERS.filter(order=>order.execution==="ready").length;document.getElementById("briefing").innerHTML=[["Updated","${metadata.lastUpdated}"],["Open Cards",open],["Backlog",backlog],["Needs You",needs],["Ready orders",ready]].map(([label,value])=>'<div class="metric"><span>'+label+'</span><strong>'+value+'</strong></div>').join("")}
loadPersonalOrders();render();renderOrders();briefing();setView(storageGet("moving-tracker-view")==="orders"?"orders":"board");
if(location.hash.startsWith("#card-"))openCard(byId.get(location.hash.slice(6)),false);
window.addEventListener("hashchange",()=>{if(location.hash.startsWith("#card-"))openCard(byId.get(location.hash.slice(6)),false)});`;

const guideMain = `<article class="guide"><p class="eyebrow">One-minute orientation</p><h2>How to use this reader</h2><p>The whole Card tile opens its durable detail experience. Search and filters cover every Card; the Backlog is grouped by priority and progressively revealed. A Card's detail owns its copy-ready handoff and links to the stable Markdown source beside this generated reader.</p><h2>Personal Card order</h2><p>Drag the Card surface after moving the pointer; a normal click still opens detail. On touch, long-press a Card before dragging. With a focused Card, press <strong>Shift + an arrow key</strong> to move it earlier or later. Personal order stays within the same visible lane and is saved only in this browser when local storage is available. It never changes canonical Card status, priority, Work Orders, or Markdown. Use <strong>Reset to canonical order</strong> at any time.</p>${markdown(guideSource)}</article>`;
const outputs = {
  "board.html": shell({ title: `${metadata.project} — project tracker`, main: boardMain, script: boardScript }),
  "guide.html": shell({ title: `${metadata.project} — tracker guide`, main: guideMain, script: sharedScript, guide: true }),
};

const checkOnly = process.argv.includes("--check");
for (const [name, content] of Object.entries(outputs)) {
  const path = join(DIR, name);
  if (checkOnly) {
    if (readFileSync(path, "utf8") !== content) throw new Error(`${name} is stale; run npm run tracker:build`);
  } else {
    writeFileSync(path, content);
    console.log(`generated docs/tracker/${name}`);
  }
}
if (checkOnly) console.log("tracker readers are synchronized");
