import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";

// Fallback only after shared preview rejected file:// as unsupported.
// One owned browser, serial contexts; no server or real data.
os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = path.join(repo, "output/moving-council");
const output = path.join(repo, "design-council/2026-11-05-playbook/captures/06-pattern-fixes");
fs.mkdirSync(output, { recursive: true });
const source = JSON.parse(fs.readFileSync(path.join(fixture, "provenance.json"), "utf8"));
const runnerHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
const runnerDirty = Boolean(execFileSync("git", ["status", "--porcelain", "--", "design-council/tools"], { cwd: repo, encoding: "utf8" }).trim());
const runnerSha256 = createHash("sha256").update(fs.readFileSync(fileURLToPath(import.meta.url))).digest("hex");
const evidence = { ...source, runnerHead, runnerDirty, runnerSha256, limitations: ["Offline actual-component rendering, not an authenticated app-shell or Next hydration proof", "Next-devtools Latin Geist fonts, not the app next/font metrics", "Synthetic records only; no backend writes or account access"], capturedAt: new Date().toISOString(), screenshots: [], probes: [], diagnostics: [], networkAttempts: [], errors: [] };
const browser = await chromium.launch({ channel: "msedge", headless: true });
let sequence = 0;
async function capture(page, name, fullPage = false) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage, animations: "disabled" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, `${name}: horizontal page overflow`);
  evidence.screenshots.push({ name, viewport: page.viewportSize(), fullPage, pageOverflow: overflow });
  console.log(`Captured ${name}`);
}
async function visit(surface, width, theme, run) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme });
  await context.route(/^https?:\/\//, route => { evidence.networkAttempts.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => evidence.errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") evidence.errors.push(message.text()); });
  try {
    const url = pathToFileURL(path.join(fixture, "index.html"));
    url.search = new URLSearchParams({ surface, theme }).toString();
    await page.goto(url.href);
    if (surface.startsWith("reader:")) await page.getByRole("navigation", { name: "On this page" }).waitFor();
    else await page.getByRole("heading", { name: surface === "inventory" ? "Inventory" : "AI connections", exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await run(page);
    const diagnostics = await page.evaluate(() => ({ unknownQueries: window.__fixtureUnknownQueries, writesBlocked: window.__fixtureWritesBlocked, navigationAttempts: window.__fixtureNavigationAttempts }));
    evidence.diagnostics.push({ surface, width, theme, ...diagnostics });
    assert.deepEqual(diagnostics.unknownQueries, [], "Unlisted queries cannot count as evidence");
    assert.equal(diagnostics.writesBlocked, 0, "Capture must not attempt fixture mutations/actions");
  } finally { await context.close(); }
}
try {
  await visit("ai", 1440, "light", async page => {
    await capture(page, "ai-desktop-light", true);
    await page.getByRole("button", { name: "Review [synthetic] Workshop assistant", exact: true }).click();
    const heading = page.getByRole("heading", { name: "[synthetic] Workshop assistant", exact: true });
    assert.equal(await heading.evaluate(element => document.activeElement === element), true);
    const bounds = await heading.boundingBox();
    assert.ok(bounds && bounds.y >= 0 && bounds.y < 1000, "Review heading must be in the viewport");
    evidence.probes.push("Review opens, focuses and scrolls details into the viewport");
    await page.getByRole("button", { name: "Review [synthetic] Workshop assistant", exact: true }).click();
    assert.equal(await heading.isVisible(), false);
    await page.getByRole("button", { name: /Recent refused request/ }).click();
    assert.equal(await page.getByRole("tab", { name: /^Activity:/ }).getAttribute("aria-selected"), "true");
    evidence.probes.push("Review toggles closed; refused-request mark opens Activity");
  });
  await visit("ai", 390, "dark", async page => {
    const captionWidth = await page.locator('table[aria-label="AI connection permissions"] caption').evaluate(element => element.getBoundingClientRect().width);
    assert.ok(captionWidth > 300, "Phone table caption must use the full readable column");
    await capture(page, "ai-phone-dark", true);
    await page.getByRole("button", { name: "Revoke [synthetic] Workshop assistant", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Keep it", exact: true }).evaluate(element => document.activeElement === element), true);
    await capture(page, "ai-phone-confirm-dark");
    await page.keyboard.press("Enter");
    assert.equal(await page.getByRole("button", { name: "Yes, revoke it", exact: true }).count(), 0);
    evidence.probes.push("Revoke focuses Keep it; repeated Enter cancels without a write");
    await page.getByRole("tab", { name: "Approve", exact: true }).click();
    await page.getByLabel("Name this connection").fill("Synthetic unfinished approval");
    await page.getByRole("tab", { name: "Setup", exact: true }).click();
    await page.getByRole("button", { name: "All 7 sections", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-moving-section="approve"]')?.getAttribute("aria-selected") === "true");
    await page.getByLabel("Name this connection").waitFor({ state: "visible" });
    assert.equal(await page.getByLabel("Name this connection").inputValue(), "Synthetic unfinished approval");
    await capture(page, "ai-phone-approval-dark");
    evidence.probes.push("Approval draft survives sections and pinned chooser");
    await page.getByRole("tab", { name: "API keys", exact: true }).click();
    await page.locator("summary").filter({ hasText: "Advanced API settings" }).click();
    const before = page.url();
    await page.getByRole("link", { name: "API docs", exact: true }).click();
    await page.getByText(/Destination outside this fixture: \/api/).waitFor();
    assert.equal(page.url(), before);
    evidence.probes.push("API docs navigation is blocked with a local destination notice");
  });
  await visit("inventory", 1440, "light", async page => {
    await page.getByRole("table").waitFor();
    await capture(page, "inventory-desktop-light");
    await page.getByText("[synthetic] Workshop table", { exact: true }).click();
    await page.getByRole("dialog", { name: "[synthetic] Workshop table", exact: true }).waitFor();
    const close = page.getByRole("dialog", { name: "[synthetic] Workshop table", exact: true }).getByRole("button", { name: "Close", exact: true });
    assert.equal(await close.evaluate(element => { const rect = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)); }), true, "Desktop Close must be unobscured");
    await capture(page, "item-desktop-light");
    await close.click();
    assert.equal(await page.getByRole("dialog").count(), 0);
    evidence.probes.push("Desktop Item Close is unobscured and closes to the collection");
  });
  await visit("inventory", 390, "dark", async page => {
    assert.equal(await page.getByRole("button", { name: "List", exact: true }).getAttribute("aria-pressed"), "true");
    await capture(page, "inventory-phone-dark");
    await page.getByRole("button", { name: "Collection options", exact: true }).click();
    const options = page.getByRole("dialog", { name: "Collection options", exact: true });
    await capture(page, "inventory-options-phone-dark");
    await options.getByRole("button", { name: "Grid", exact: true }).click();
    await options.getByRole("button", { name: "Show records", exact: true }).click();
    await page.getByRole("button", { name: "Discard", exact: true }).waitFor();
    await capture(page, "inventory-grid-phone-dark");
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "List", exact: true }).getAttribute("aria-pressed"), "true");
    evidence.probes.push("Phone opens List; presentation-only edit marks modified and Discard restores List");
    await page.getByRole("button", { name: "Add filter", exact: true }).click();
    await capture(page, "inventory-filter-phone-dark");
    await page.keyboard.press("Escape");
    await page.getByText("[synthetic] Workshop table", { exact: true }).click();
    await page.getByRole("dialog", { name: "[synthetic] Workshop table", exact: true }).waitFor();
    await capture(page, "item-phone-dark");
    await page.getByRole("button", { name: "Edit item details", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Synthetic unfinished rename");
    await page.getByRole("tab", { name: "Record", exact: true }).click();
    await page.getByRole("tab", { name: "Details", exact: true }).click();
    assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), "Synthetic unfinished rename");
    evidence.probes.push("Item draft survives Record and Details without saving");
  });
  for (const route of ["about", "ai", "claims-inventory", "faq", "features", "mcp/guide", "pcs-moving", "privacy", "terms", "api"]) {
    for (const [width, theme] of [[1440, "light"], [390, "dark"]]) {
      await visit(`reader:${route}`, width, theme, async page => {
        const contents = page.getByRole("navigation", { name: "On this page" });
        const links = contents.getByRole("link");
        const labels = await links.allTextContents();
        assert.ok(labels.length > 1 && labels.every(label => !/Guide section \d|At a glance/.test(label)), "Real reader destinations must be descriptive");
        const order = await page.evaluate(() => {
          const nav = document.querySelector('nav[aria-label="On this page"]');
          const article = document.querySelector("article");
          const aside = document.querySelector('aside[aria-label="Guide context"]');
          return Boolean(nav && article && aside && (nav.compareDocumentPosition(article)&Node.DOCUMENT_POSITION_FOLLOWING) && (article.compareDocumentPosition(aside)&Node.DOCUMENT_POSITION_FOLLOWING));
        });
        assert.ok(order, "Reader DOM order: Contents, article, context");
        await capture(page, `reader-${route.replaceAll("/", "-")}-${width}-${theme}`, true);
        const destination = await links.last().getAttribute("href");
        await links.last().click();
        const bounds = await page.locator(destination).boundingBox();
        assert.ok(bounds && bounds.y >= -1 && bounds.y < 1000, "Contents must bring its section into view");
        evidence.probes.push(`Reader ${route} at ${width}: explicit Contents, document order and local anchor navigation`);
      });
    }
  }
  assert.deepEqual(evidence.errors, [], "Browser console/page errors");
  assert.deepEqual(evidence.networkAttempts, [], "No HTTP navigation or network requests");
  evidence.result = "passed";
} catch (error) {
  evidence.result = "failed";
  evidence.failure = String(error);
  process.exitCode = 1;
  console.error(error);
} finally {
  await browser.close();
  evidence.sequence = ++sequence;
  fs.writeFileSync(path.join(output, "evidence.json"), JSON.stringify(evidence, null, 2)+"\n");
  fs.writeFileSync(path.join(fixture, "capture-provenance.json"), JSON.stringify(evidence, null, 2)+"\n");
  console.log(`Browser closed; ${evidence.screenshots.length} captures, ${evidence.probes.length} probes, ${evidence.result}`);
}
