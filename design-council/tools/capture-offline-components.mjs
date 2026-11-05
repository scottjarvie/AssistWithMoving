import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// Fallback only after shared preview rejected file:// as unsupported.
// One owned browser, serial contexts; no server or real data.
os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = path.join(repo, "output/moving-council");
const output = path.join(repo, "design-council/2026-11-05-playbook/captures/04-components");
fs.mkdirSync(output, { recursive: true });
const source = JSON.parse(fs.readFileSync(path.join(fixture, "provenance.json"), "utf8"));
const evidence = { ...source, capturedAt: new Date().toISOString(), screenshots: [], probes: [], diagnostics: [], networkAttempts: [], errors: [] };
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
    await page.getByRole("heading", { name: surface === "inventory" ? "Inventory" : "AI connections", exact: true }).waitFor();
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
    assert.equal(await page.getByLabel("Name this connection").inputValue(), "Synthetic unfinished approval");
    await capture(page, "ai-phone-approval-dark");
    evidence.probes.push("Approval draft survives sections and pinned chooser");
    await page.getByRole("tab", { name: "API keys", exact: true }).click();
    await page.getByText("Advanced API settings", { exact: true }).click();
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
    await capture(page, "item-desktop-light");
  });
  await visit("inventory", 390, "dark", async page => {
    assert.equal(await page.getByRole("button", { name: "List", exact: true }).getAttribute("aria-pressed"), "true");
    await capture(page, "inventory-phone-dark");
    await page.getByRole("button", { name: "Grid", exact: true }).click();
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
