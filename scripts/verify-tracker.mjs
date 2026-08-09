#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "docs", "tracker");
const cardStatuses = new Set(["backlog", "next", "doing", "needs-you", "done"]);
const executions = new Set(["proposed", "ready", "active", "complete", "superseded"]);
const audits = new Set(["not-audited", "passed", "follow-up-needed"]);

function parse(path) {
  const raw = readFileSync(path, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  assert(match, `${basename(path)}: missing frontmatter`);
  const meta = {};
  for (const line of match[1].split("\n")) {
    const field = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (field) meta[field[1]] = field[2].replace(/^"|"$/g, "").trim();
  }
  return { path, body: match[2].trim(), meta };
}
function list(folder) {
  return readdirSync(folder).filter((name) => name.endsWith(".md")).sort().map((name) => parse(join(folder, name)));
}
function values(value = "") { return value.split(/[\s,]+/).filter(Boolean); }
function headings(item, names) {
  for (const name of names) assert.match(item.body, new RegExp(`^## ${name}$`, "m"), `${basename(item.path)}: missing ## ${name}`);
}

const metadata = JSON.parse(readFileSync(join(DIR, "tracker.json"), "utf8"));
assert.equal(metadata.schemaVersion, 1);
assert.equal(metadata.generatorVersion, 1);
assert.equal(metadata.project, "Assist With Moving");
assert.equal(metadata.idPrefix, "MOV");
assert.equal(metadata.familyCore.label, "Assist With Sites Core Philosophy v1.6.2");
assert.equal(metadata.familyCore.commit, "561481843793a1d0fb97eee3984bccfd004c21a2");
assert.equal(metadata.projectPhilosophy, "../planning/assist-with-moving-project-philosophy.md");

const cards = list(join(DIR, "cards"));
const orders = list(join(DIR, "work-orders"));
const cardIds = new Set();
const orderIds = new Set();
assert(cards.length > 0, "tracker needs at least one Card");
assert(orders.length > 0, "tracker needs at least one Work Order");
for (const item of cards) {
  const { meta, body, path } = item;
  assert.match(meta.id ?? "", /^MOV-\d{4}$/);
  assert.equal(basename(path, ".md"), meta.id);
  assert(!cardIds.has(meta.id), `duplicate Card ${meta.id}`); cardIds.add(meta.id);
  assert(cardStatuses.has(meta.status), `${meta.id}: invalid status`);
  for (const field of ["title", "type", "area", "priority", "created", "updated", "updated-by"]) assert(meta[field], `${meta.id}: missing ${field}`);
  assert(body.length > 300, `${meta.id}: Card is not cold-start durable`);
  headings(item, ["Why this exists", "Current truth", "Next safe action", "Constraints", "Completion evidence", "History"]);
  if (meta.status === "needs-you") headings(item, ["Why Scott is needed", "Smallest decision or action", "Recommendation", "Alternatives and trade-offs", "What each choice changes", "Safe default", "Consequence of waiting", "Evidence"]);
}
for (const item of orders) {
  const { meta, path } = item;
  assert.match(meta.id ?? "", /^MOV-WO-\d{3}$/);
  assert.equal(basename(path, ".md"), meta.id);
  assert(!orderIds.has(meta.id), `duplicate Work Order ${meta.id}`); orderIds.add(meta.id);
  assert(executions.has(meta.execution), `${meta.id}: invalid execution`);
  assert(audits.has(meta.audit), `${meta.id}: invalid audit`);
  for (const field of ["title", "cards", "created", "updated"]) assert(meta[field], `${meta.id}: missing ${field}`);
  for (const id of values(meta.cards)) assert(cardIds.has(id), `${meta.id}: unknown Card ${id}`);
  headings(item, ["Goal", "Current truth", "Sequence", "Dependencies", "Exclusions", "Stop rules", "Verification", "Human gates", "Execution evidence", "History"]);
  if (["ready", "active", "complete"].includes(meta.execution)) assert(meta["approved-by"] && meta["approval-evidence"], `${meta.id}: executable order lacks approval provenance`);
}
for (const card of cards) {
  for (const id of values(card.meta["work-orders"])) {
    assert(orderIds.has(id), `${card.meta.id}: unknown Work Order ${id}`);
    const order = orders.find((candidate) => candidate.meta.id === id);
    assert(values(order.meta.cards).includes(card.meta.id), `${card.meta.id}: Work Order backlink mismatch`);
  }
}

execFileSync(process.execPath, [join(ROOT, "scripts", "tracker-build.mjs"), "--check"], { cwd: ROOT, stdio: "inherit" });
for (const name of ["board.html", "guide.html"]) {
  const html = readFileSync(join(DIR, name), "utf8");
  assert.match(html, /class="skip" href="#(?:workspace|guide)"/);
  assert.match(html, /:focus-visible/);
  assert.match(html, /@media \(max-width:700px\)/);
  assert.match(html, /@media \(max-width:420px\)/);
  assert.match(html, /data-mode="day"/);
  assert.match(html, /<link rel="icon" href="data:," \/>/, `${name}: local reader must not request a missing favicon`);
  assert.doesNotMatch(html, /<(?:script|link|img)[^>]+(?:src|href)=["']https?:/i, `${name}: external runtime asset`);
  for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script[1], { filename: name });
}
const board = readFileSync(join(DIR, "board.html"), "utf8");
for (const label of [
  "Project", "Project Philosophy", "Family Core", "Guide", "Cards",
  "Work Orders", "Needs You", "Search every Card", "Backlog staging yard",
  "Copy handoff prompt", "Open durable Markdown", "Copy whole Work Order",
  "No automatic dispatch", "independent audit", "Personal Card order",
  "Reset to canonical order", "Shift + Arrow",
]) assert(board.includes(label), `board missing ${label}`);

// The entire Card tile is a native activation target. Native buttons provide
// click/Enter/Space detail behavior, while the same clean surface owns
// thresholded pointer ordering and a documented modifier-key ordering path.
assert.match(board, /function cardButton\(card,lane,visibleLane\)/);
assert.match(board, /const button=document\.createElement\("button"\);button\.type="button";button\.className="card"/);
assert.match(board, /wrap\.append\(button\)/);
assert.match(board, /setAttribute\("aria-label","Open "\+card\.id/);
assert.doesNotMatch(board, /Open durable Card/);
assert.doesNotMatch(board, /<details><summary>Open durable Card/);
assert.doesNotMatch(board, /order-tools|drag-handle|data-order-action|draggable="true"/i, "Cards must not reserve visible reorder chrome");

// Personal ordering is browser-local, fail-soft, and cannot mutate canonical
// lane, status, priority, source Cards, or Work Orders.
assert.match(board, /assist-with-moving:personal-card-order:v1/);
assert.match(board, /localStorage\.getItem\(PERSONAL_ORDER_KEY\)/);
assert.match(board, /localStorage\.setItem\(PERSONAL_ORDER_KEY/);
assert.match(board, /localStorage\.removeItem\(PERSONAL_ORDER_KEY\)/);
assert.match(board, /orderStorageState="unavailable"/);
assert.match(board, /Personal order is active for this viewing session only because browser storage is unavailable/);
assert.match(board, /function cardLane\(card\)\{return card\.status==="backlog"\?"backlog:"\+\(card\.priority\|\|"P2"\):card\.status\}/);
assert.match(board, /cardLane\(source\)!==lane\|\|cardLane\(target\)!==lane/);
assert.match(board, /Cards can only be reordered inside the same lane/);
assert.doesNotMatch(board, /card\.status\s*=(?!=)/, "reader must not mutate Card status");
assert.doesNotMatch(board, /card\.priority\s*=(?!=)/, "reader must not mutate Card priority");

// Pointer/touch and non-pointer paths remain distinct from Card activation.
for (const event of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) assert(board.includes(`addEventListener("${event}"`), `board missing ${event} ordering path`);
assert.match(board, /POINTER_DRAG_THRESHOLD=8,TOUCH_LONG_PRESS_MS=450/);
assert.match(board, /Math\.hypot\(event\.clientX-dragState\.startX,event\.clientY-dragState\.startY\)/);
assert.match(board, /event\.pointerType==="touch"/);
assert.match(board, /setTimeout\(activatePointerOrder,TOUCH_LONG_PRESS_MS\)/);
assert.match(board, /touch-action:pan-y/);
assert.match(board, /aria-keyshortcuts","Shift\+ArrowUp Shift\+ArrowDown Shift\+ArrowLeft Shift\+ArrowRight"/);
assert.match(board, /event\.shiftKey&&\["ArrowUp","ArrowLeft","ArrowDown","ArrowRight"\]\.includes\(event\.key\)/);
assert.match(board, /if\(suppressClickId===card\.id\)/, "a completed drag must not open Card detail");
assert.match(board, /openCard\(card,true\)/, "normal Card activation must still open detail");
assert.match(board, /id="orderAnnouncer" aria-live="assertive" aria-atomic="true"/);
assert.match(board, /announceOrder\("Moved "\+sourceId/);
assert.match(board, /resetOrder"\)\.addEventListener\("click"/);
assert.match(board, /Canonical Card order restored in every lane/);

// Card detail is addressable without a server and owns both the canonical
// Markdown link and copy-ready handoff. No Card copy control is rendered on
// the board tiles themselves.
assert.match(board, /#card-/);
assert.match(board, /cardSource" href="cards\//);
assert.match(board, /document\.getElementById\("cardSource"\)\.href=card\.relativePath/);
assert.match(board, /<dialog id="cardDialog"/);
assert.equal((board.match(/Copy handoff prompt/g) || []).length, 1, "Card handoff belongs only to the detail dialog");
for (const card of cards) {
  const href = `cards/${basename(card.path)}`;
  assert(board.includes(`"relativePath":"${href}"`), `${card.meta.id}: missing stable local source link`);
  assert(board.includes(`"id":"${card.meta.id}"`), `${card.meta.id}: missing from generated reader`);
}

// Large backlogs remain complete but navigable through hierarchy, search,
// filters, and explicit progressive disclosure.
for (const field of ["search", "priority", "area", "type"]) assert(board.includes(`id="${field}"`), `board missing ${field} control`);
assert.match(board, /className="backlog-group"/);
assert.match(board, /Show all "\+found\.length/);
assert.match(board, /Showing "\+visible\.length\+" of "\+CARDS\.length/);
assert.match(board, /card\.title,card\.status,card\.area/, "Needs You and status searches must inspect Card status");
assert.match(board, /orderedLane\(key\)\.filter\(matches\)/, "filtered views must preserve personal lane order");

// Responsive layout avoids fixed-width board columns and keeps controls and
// dialog actions at or above the 44px touch-target floor.
assert.match(board, /@media \(max-width:960px\)/);
assert.match(board, /\.card \{[\s\S]*?width:100%; min-height:118px/);
assert.match(board, /dialog \{ width:min\(780px,calc\(100vw - 28px\)\)/);
assert.match(board, /min-height:44px/);
assert.match(board, /prefers-reduced-motion:reduce/);

const guide = readFileSync(join(DIR, "guide.html"), "utf8");
for (const label of ["whole card tile", "search and filters", "stable markdown source", "copy-ready handoff", "personal card order", "normal click still opens detail", "long-press", "shift + an arrow key", "reset to canonical order", "never changes canonical card status"]) assert(guide.toLowerCase().includes(label), `guide missing ${label}`);
assert(readFileSync(join(DIR, "GUIDE.md"), "utf8").includes("Linear is not required"));
console.log(`tracker verified: ${cards.length} Cards, ${orders.length} Work Orders, source/render parity, local detail links, personal same-lane ordering, keyboard semantics, responsive contract, and JavaScript`);
