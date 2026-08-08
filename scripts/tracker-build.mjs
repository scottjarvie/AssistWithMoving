#!/usr/bin/env node

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
  let listOpen = false;
  let paragraph = [];
  let code = null;
  const closeParagraph = () => {
    if (paragraph.length) output.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (listOpen) output.push("</ul>");
    listOpen = false;
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
    const list = line.match(/^[-*]\s+(?:\[([ xX])\]\s+)?(.+)$/);
    if (heading) {
      closeParagraph(); closeList();
      const level = Math.max(2, heading[1].length);
      output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (list) {
      closeParagraph();
      if (!listOpen) { output.push("<ul>"); listOpen = true; }
      const check = list[1] === undefined ? "" : `<span aria-hidden="true">${list[1].trim() ? "☑" : "☐"}</span> `;
      output.push(`<li>${check}${inline(list[2])}</li>`);
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

const cardJson = JSON.stringify(cards.map((card) => ({ ...card, html: markdown(card.body) })));
const orderJson = JSON.stringify(orders.map((order) => ({ ...order, html: markdown(order.body) })));
const styles = `
  :root { --paper:#eee9dc; --sheet:#fbf8ef; --ink:#172631; --muted:#4d5b61; --deep:#0d2634; --route:#2f718a; --sage:#657d70; --signal:#b84f2f; --amber:#c98732; --rule:#c9bfaa; --focus:#e36b35; }
  html[data-mode="night"] { --paper:#14242d; --sheet:#1b2d36; --ink:#eef2ed; --muted:#bdc8c1; --deep:#f8f1e6; --route:#80bfd4; --sage:#a9beb2; --signal:#f18a60; --amber:#edb65f; --rule:#465964; --focus:#ff9a70; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  a { color:var(--route); }
  button,.button { min-height:44px; border:1px solid var(--rule); border-radius:6px; background:var(--sheet); color:var(--ink); padding:9px 13px; font:inherit; cursor:pointer; text-decoration:none; }
  :focus-visible { outline:3px solid var(--focus); outline-offset:2px; }
  .skip { position:fixed; top:8px; left:10px; z-index:99; transform:translateY(-160%); background:var(--deep); color:var(--paper); padding:10px 14px; }
  .skip:focus { transform:none; }
  header { border-top:7px solid var(--signal); border-bottom:1px solid var(--rule); padding:18px clamp(14px,4vw,42px); background:var(--sheet); }
  .eyebrow { margin:0 0 4px; text-transform:uppercase; letter-spacing:.14em; color:var(--signal); font-weight:800; font-size:12px; }
  h1 { margin:0; font:700 clamp(24px,5vw,42px)/1.05 Georgia,serif; color:var(--deep); }
  .sub { margin:8px 0 0; color:var(--muted); max-width:74ch; }
  nav { display:flex; gap:7px; margin-top:15px; overflow-x:auto; padding-bottom:3px; }
  nav a { white-space:nowrap; }
  .mode { float:right; }
  main { padding:24px clamp(12px,3vw,34px) 60px; }
  .briefing { display:grid; grid-template-columns:repeat(5,minmax(110px,1fr)); gap:8px; margin-bottom:18px; overflow-x:auto; }
  .metric { min-width:110px; background:var(--sheet); border:1px solid var(--rule); padding:12px; }
  .metric strong { display:block; font:700 24px Georgia,serif; color:var(--deep); }
  .viewbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin:10px 0 18px; }
  .viewbar [aria-pressed="true"] { background:var(--deep); color:var(--paper); }
  .needs { border-color:var(--signal); color:var(--signal); font-weight:800; }
  .board { display:grid; grid-template-columns:repeat(4,minmax(245px,1fr)); gap:12px; overflow-x:auto; padding-bottom:12px; }
  .lane { min-width:245px; background:color-mix(in srgb,var(--sheet) 82%,var(--paper)); border-top:4px solid var(--route); padding:10px; }
  .lane[data-status="needs-you"] { border-color:var(--signal); }
  .lane[data-status="backlog"] { opacity:.82; }
  .lane h2 { margin:0 0 10px; font:700 19px Georgia,serif; }
  article { background:var(--sheet); border:1px solid var(--rule); border-radius:5px; padding:12px; margin-bottom:9px; }
  article h3 { margin:3px 0 7px; font:700 17px/1.2 Georgia,serif; }
  .meta { color:var(--muted); font-size:12px; }
  .tag { display:inline-block; border:1px solid var(--rule); border-radius:999px; padding:2px 7px; margin:3px 4px 3px 0; font-size:11px; text-transform:uppercase; letter-spacing:.05em; }
  details { margin-top:9px; } summary { min-height:44px; padding:11px 0; cursor:pointer; font-weight:700; }
  .body { border-top:1px solid var(--rule); padding-top:8px; overflow-wrap:anywhere; }
  code { background:var(--paper); padding:2px 4px; border-radius:3px; }
  pre { overflow-x:auto; background:var(--paper); border:1px solid var(--rule); padding:12px; }
  pre code { padding:0; white-space:pre; }
  blockquote { border-left:3px solid var(--amber); margin-left:0; padding-left:12px; color:var(--muted); }
  .orders { max-width:1050px; } .order { border-left:5px solid var(--sage); }
  .progress { height:8px; background:var(--paper); margin:10px 0; } .progress span { display:block; height:100%; background:var(--route); }
  .empty { color:var(--muted); font-style:italic; }
  .hidden { display:none !important; }
  @media (max-width:700px) { header { padding:15px 12px; } .mode { float:none; margin-top:10px; } main { padding-inline:10px; } .board { display:block; overflow:visible; } .lane { min-width:0; margin-bottom:12px; } .briefing { grid-template-columns:repeat(5,150px); } }
  @media (prefers-reduced-motion:reduce) { * { scroll-behavior:auto !important; } }
`;

const shell = ({ title, main, script }) => `<!doctype html>
<html lang="en" data-mode="day"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${styles}</style></head>
<body><a class="skip button" href="#main">Skip to tracker</a><header><button class="mode" id="mode" type="button">Night mode</button><p class="eyebrow">Moving field desk</p><h1>${title}</h1><p class="sub">Durable Cards, bounded Work Orders, and a Guide for Assist With Moving. The board is a generated reader; Markdown remains the source.</p><nav aria-label="Tracker links"><a class="button" href="${metadata.projectUrl}">Project</a><a class="button" href="${metadata.projectPhilosophy}">Project Philosophy</a><a class="button" href="${metadata.familyCore.url}">Family Core</a><a class="button" href="GUIDE.md">Guide</a></nav></header><main id="main" tabindex="-1">${main}</main><script>${script}</script></body></html>`;

const sharedScript = `
const root=document.documentElement,mode=document.getElementById("mode");
function setMode(value){root.dataset.mode=value;mode.textContent=value==="day"?"Night mode":"Day mode";localStorage.setItem("moving-tracker-mode",value)}
setMode(localStorage.getItem("moving-tracker-mode")||(matchMedia("(prefers-color-scheme:dark)").matches?"night":"day"));
mode.onclick=()=>setMode(root.dataset.mode==="day"?"night":"day");`;

const boardMain = `<section class="briefing" aria-label="Current briefing" id="briefing"></section><div class="viewbar"><button id="kanban" aria-pressed="true">Kanban</button><button id="workorders" aria-pressed="false">Work Orders</button><button id="needs" class="needs">Needs You</button><span class="meta">No automatic dispatch. Ready scope is owner-approved; independent audit stays separate.</span></div><section id="board" class="board" aria-label="Kanban board"></section><section id="orders" class="orders hidden" aria-label="Work Orders"></section>`;

const boardScript = `${sharedScript}
const cards=${cardJson}; const orders=${orderJson};
const statuses=[["next","Next"],["doing","Doing"],["needs-you","Needs You"],["done","Done"],["backlog","Backlog"]];
const byId=new Map(cards.map(card=>[card.id,card]));
function cardHtml(card){return \`<article data-card="\${card.id}"><div class="meta">\${card.id} · \${card.area}</div><h3>\${card.title}</h3><span class="tag">\${card.priority||"P2"}</span><span class="tag">\${card.type}</span>\${card["work-orders"]?\`<span class="tag">\${card["work-orders"]}</span>\`:""}<details><summary>Open durable Card</summary><div class="body">\${card.html}<button type="button" data-copy="card" data-id="\${card.id}">Copy as prompt</button></div></details></article>\`}
function renderBoard(filter="all"){document.getElementById("board").innerHTML=statuses.map(([key,label])=>{const found=cards.filter(card=>card.status===key&&(filter==="all"||key==="needs-you"));return \`<section class="lane" data-status="\${key}"><h2>\${label} · \${found.length}</h2>\${found.map(cardHtml).join("")||'<p class="empty">Nothing here.</p>'}</section>\`}).join("")}
function renderOrders(){document.getElementById("orders").innerHTML=orders.map(order=>{const ids=order.cards.split(/[\\s,]+/).filter(Boolean),done=ids.filter(id=>byId.get(id)?.status==="done").length,pct=ids.length?Math.round(done/ids.length*100):0;return \`<article class="order"><div class="meta">\${order.id} · execution \${order.execution} · audit \${order.audit}</div><h3>\${order.title}</h3><div class="progress" aria-label="\${done} of \${ids.length} Cards done"><span style="width:\${pct}%"></span></div><p>\${done} of \${ids.length} Cards complete.</p><details><summary>Open Work Order</summary><div class="body">\${order.html}<button type="button" data-copy="order" data-id="\${order.id}">Copy whole work order</button></div></details></article>\`}).join("")||'<p class="empty">No approved Work Order is ready.</p>'}
function briefing(){const open=cards.filter(c=>c.status!=="done").length,needs=cards.filter(c=>c.status==="needs-you").length,active=orders.filter(o=>o.execution==="active").length,ready=orders.filter(o=>o.execution==="ready").length;document.getElementById("briefing").innerHTML=[["Last updated","${metadata.lastUpdated}"],["Open Cards",open],["Needs You",needs],["Active orders",active],["Ready orders",ready]].map(([label,value])=>\`<div class="metric"><span>\${label}</span><strong>\${value}</strong></div>\`).join("")}
function show(view){const isBoard=view==="board";document.getElementById("board").classList.toggle("hidden",!isBoard);document.getElementById("orders").classList.toggle("hidden",isBoard);document.getElementById("kanban").setAttribute("aria-pressed",isBoard);document.getElementById("workorders").setAttribute("aria-pressed",!isBoard);localStorage.setItem("moving-tracker-view",view)}
document.getElementById("kanban").onclick=()=>show("board");document.getElementById("workorders").onclick=()=>show("orders");document.getElementById("needs").onclick=()=>{show("board");renderBoard("needs-you")};
document.addEventListener("click",async event=>{const button=event.target.closest("[data-copy]");if(!button)return;const item=(button.dataset.copy==="card"?cards:orders).find(candidate=>candidate.id===button.dataset.id);let prompt=\`Project: ${metadata.project}\nProject Philosophy: ${metadata.projectPhilosophy}\nFamily Core: ${metadata.familyCore.label} · ${metadata.familyCore.url}\n\n\${item.body}\n\nUpdate the durable source, regenerate both readers, record actual evidence and provenance, and do not invent authority.\`;if(button.dataset.copy==="order"){for(const id of item.cards.split(/[\\s,]+/).filter(Boolean)){const card=byId.get(id);if(card)prompt+=\`\n\n--- \${id} ---\n\${card.body}\`;}}await navigator.clipboard.writeText(prompt);button.textContent="Copied"});
renderBoard();renderOrders();briefing();show(localStorage.getItem("moving-tracker-view")||"board");`;

const guideMain = `<article class="order"><p class="eyebrow">One-minute orientation</p>${markdown(guideSource)}</article>`;
const outputs = {
  "board.html": shell({ title: `${metadata.project} — project tracker`, main: boardMain, script: boardScript }),
  "guide.html": shell({ title: `${metadata.project} — tracker guide`, main: guideMain, script: sharedScript }),
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
