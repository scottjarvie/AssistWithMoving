import {
  normalizePlanDocument,
  renderPlanSnapshotSvg,
  type PlanDocumentInput,
} from "./plan-describe";

export function publicPlanDocument(input: PlanDocumentInput): PlanDocumentInput {
  const normalized = normalizePlanDocument(input);
  return {
    ...normalized,
    levels: normalized.levels.map((level) => ({
      levelId: level.levelId,
      name: level.name,
      levelType: level.levelType,
      sortOrder: level.sortOrder,
      ceilingHeightIn: level.ceilingHeightIn,
    })),
    entities: normalized.entities.filter(
      (entity) => entity.entityType !== "annotation",
    ),
  };
}

export function renderPublicPlanSnapshotSvg(
  input: PlanDocumentInput,
  levelId?: string,
) {
  return renderPlanSnapshotSvg(publicPlanDocument(input), levelId);
}

export type PublicPlanPrintInput = {
  plan: {
    name: string;
    kind: string;
    moveTitle?: string;
    updatedAt: number;
  };
  privacy: {
    underlayHidden: boolean;
    valuesHidden: boolean;
    privateNotesHidden: boolean;
    annotationsHidden: boolean;
  };
  levels: Array<{
    name: string;
    levelType: string;
    svg: string;
    rooms: Array<{
      shortId: string;
      name: string;
      areaSqFt: number;
      placed: Array<{
        shortId: string;
        label: string;
      }>;
      items: PublicPlanPrintItem[];
      boxes: PublicPlanPrintBox[];
    }>;
  }>;
  unplaced: {
    items: PublicPlanPrintItem[];
    boxes: PublicPlanPrintBox[];
  };
};

export type PublicPlanPrintItem = {
  name: string;
  quantity: number;
  room?: string;
  category?: string;
  status: string;
  fragility?: string;
  doNotLetMoversTouch: boolean;
  fragile: boolean;
};

export type PublicPlanPrintBox = {
  code: string;
  label?: string;
  room?: string;
  status: string;
  itemCount: number;
};

export function renderPublicPlanPrintHtml(input: PublicPlanPrintInput) {
  const roomCount = input.levels.reduce(
    (total, level) => total + level.rooms.length,
    0,
  );
  const itemCount =
    input.unplaced.items.length +
    input.levels.reduce(
      (total, level) =>
        total +
        level.rooms.reduce((roomTotal, room) => roomTotal + room.items.length, 0),
      0,
    );
  const boxCount =
    input.unplaced.boxes.length +
    input.levels.reduce(
      (total, level) =>
        total +
        level.rooms.reduce((roomTotal, room) => roomTotal + room.boxes.length, 0),
      0,
    );

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(input.plan.name)} unload plan</title>`,
    "<style>",
    printStyles(),
    "</style>",
    "</head>",
    "<body>",
    '<main class="pack">',
    "<header>",
    `<p class="eyebrow">${escapeHtml(input.plan.kind)} floor plan</p>`,
    `<h1>${escapeHtml(input.plan.name)}</h1>`,
    input.plan.moveTitle
      ? `<p class="move">${escapeHtml(input.plan.moveTitle)}</p>`
      : "",
    `<dl class="metrics"><div><dt>Levels</dt><dd>${input.levels.length}</dd></div><div><dt>Rooms</dt><dd>${roomCount}</dd></div><div><dt>Items</dt><dd>${itemCount}</dd></div><div><dt>Boxes</dt><dd>${boxCount}</dd></div></dl>`,
    `<p class="privacy">${privacySummary(input.privacy)}</p>`,
    "</header>",
    input.levels.map(renderPrintLevel).join(""),
    renderUnplaced(input.unplaced),
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}

function renderPrintLevel(level: PublicPlanPrintInput["levels"][number]) {
  return [
    '<section class="level">',
    '<div class="level-heading">',
    `<h2>${escapeHtml(level.name)}</h2>`,
    `<span>${escapeHtml(level.levelType)}</span>`,
    "</div>",
    `<div class="snapshot">${level.svg}</div>`,
    `<div class="rooms">${level.rooms.map(renderPrintRoom).join("")}</div>`,
    "</section>",
  ].join("");
}

function renderPrintRoom(room: PublicPlanPrintInput["levels"][number]["rooms"][number]) {
  return [
    '<section class="room">',
    `<h3>${escapeHtml(room.shortId)} ${escapeHtml(room.name)}</h3>`,
    `<p>${formatNumber(room.areaSqFt)} sq ft - ${room.placed.length} placed</p>`,
    renderPlacementList(room.placed),
    renderItemTable(room.items),
    renderBoxTable(room.boxes),
    "</section>",
  ].join("");
}

function renderPlacementList(
  placements: PublicPlanPrintInput["levels"][number]["rooms"][number]["placed"],
) {
  if (!placements.length) return "";
  return `<ul class="placed">${placements
    .map(
      (placement) =>
        `<li><strong>${escapeHtml(placement.shortId)}</strong> ${escapeHtml(placement.label)}</li>`,
    )
    .join("")}</ul>`;
}

function renderUnplaced(unplaced: PublicPlanPrintInput["unplaced"]) {
  if (!unplaced.items.length && !unplaced.boxes.length) return "";
  return [
    '<section class="level">',
    '<div class="level-heading"><h2>Unplaced manifest</h2><span>review before unload</span></div>',
    renderItemTable(unplaced.items),
    renderBoxTable(unplaced.boxes),
    "</section>",
  ].join("");
}

function renderItemTable(items: PublicPlanPrintItem[]) {
  if (!items.length) return "";
  return `<table><caption>Items</caption><thead><tr><th>Name</th><th>Qty</th><th>Status</th><th>Flags</th></tr></thead><tbody>${items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.name)}</td><td>${item.quantity}</td><td>${escapeHtml(item.status)}</td><td>${itemFlags(item).map(escapeHtml).join(", ")}</td></tr>`,
    )
    .join("")}</tbody></table>`;
}

function renderBoxTable(boxes: PublicPlanPrintBox[]) {
  if (!boxes.length) return "";
  return `<table><caption>Boxes</caption><thead><tr><th>Code</th><th>Label</th><th>Status</th><th>Items</th></tr></thead><tbody>${boxes
    .map(
      (box) =>
        `<tr><td>${escapeHtml(box.code)}</td><td>${escapeHtml(box.label ?? "")}</td><td>${escapeHtml(box.status)}</td><td>${box.itemCount}</td></tr>`,
    )
    .join("")}</tbody></table>`;
}

function itemFlags(item: PublicPlanPrintItem) {
  return [
    item.fragile ? "fragile" : null,
    item.doNotLetMoversTouch ? "do not let movers touch" : null,
    item.fragility && item.fragility !== "normal" ? `${item.fragility} fragility` : null,
  ].filter((flag): flag is string => Boolean(flag));
}

function privacySummary(privacy: PublicPlanPrintInput["privacy"]) {
  const hidden = [
    privacy.underlayHidden ? "blueprint underlay" : null,
    privacy.valuesHidden ? "values" : null,
    privacy.privateNotesHidden ? "private notes" : null,
    privacy.annotationsHidden ? "free-text annotations" : null,
  ].filter(Boolean);
  return hidden.length ? `Hidden from this pack: ${hidden.join(", ")}.` : "";
}

function printStyles() {
  return `
    :root { color: #111827; font-family: Arial, sans-serif; }
    body { margin: 0; background: #f6f7f9; }
    .pack { max-width: 1100px; margin: 0 auto; padding: 28px; }
    header, .level { background: #fff; border: 1px solid #d9dee7; border-radius: 8px; margin-bottom: 18px; padding: 18px; }
    .eyebrow, .move, .privacy, .level-heading span, .room p { color: #586174; margin: 0; }
    .eyebrow { font-size: 12px; letter-spacing: 0; text-transform: uppercase; }
    h1 { font-size: 30px; margin: 6px 0 4px; }
    h2, h3 { margin: 0; }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 16px 0; }
    .metrics div { border: 1px solid #d9dee7; border-radius: 6px; padding: 10px; }
    dt { color: #586174; font-size: 11px; text-transform: uppercase; }
    dd { font-size: 22px; margin: 2px 0 0; }
    .level-heading { align-items: baseline; display: flex; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .snapshot { border: 1px solid #d9dee7; border-radius: 6px; margin-bottom: 14px; overflow: hidden; }
    .snapshot svg { display: block; height: auto; width: 100%; }
    .rooms { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .room { border: 1px solid #e3e7ef; border-radius: 6px; padding: 12px; break-inside: avoid; }
    .placed { margin: 8px 0 10px; padding-left: 18px; }
    table { border-collapse: collapse; font-size: 12px; margin-top: 10px; width: 100%; }
    caption { color: #586174; font-weight: 700; padding-bottom: 4px; text-align: left; }
    th, td { border: 1px solid #d9dee7; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #eef2f7; }
    @media print {
      body { background: #fff; }
      .pack { max-width: none; padding: 0; }
      header, .level { border: 0; border-radius: 0; page-break-after: auto; }
      .level { break-before: page; }
    }
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}
