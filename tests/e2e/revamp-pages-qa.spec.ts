import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

const e2eUserEmail = process.env.E2E_CLERK_USER_EMAIL;

type Problem = { type: string; text: string };
function watch(page: Page, sink: Problem[]) {
  page.on("console", (m) => {
    if (m.type() === "error") sink.push({ type: "console", text: m.text() });
  });
  page.on("pageerror", (e) => sink.push({ type: "pageerror", text: String(e?.message ?? e) }));
}
function realErrors(p: Problem[]) {
  // Ignore known-benign dev noise (favicon/MIME/manifest), keep real app errors.
  return p.filter(
    (x) =>
      !/favicon|_clientMiddlewareManifest|MIME type|Failed to load resource: the server responded with a status of 4|frame-ancestors.*report-only/i.test(
        x.text
      )
  );
}

test("Items facets + Move config tabs render and navigate cleanly", async ({
  page,
}) => {
  test.setTimeout(90_000);
  test.skip(!e2eUserEmail, "E2E_CLERK_USER_EMAIL not set");
  const problems: Problem[] = [];
  watch(page, problems);

  await setupClerkTestingToken({ page });
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await clerk.signIn({ page, emailAddress: e2eUserEmail! });
  await page.waitForFunction(() => window.Clerk?.user !== null, undefined, {
    timeout: 45_000,
  });
  await page.waitForLoadState("networkidle").catch(() => {});

  // --- Items page: facet chips render, no error boundary ---
  await page.goto("/app/items", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Something went wrong")).toHaveCount(0, {
    timeout: 15_000,
  });
  // Facet chips (All / Moving / Sell / Trash / Donate).
  for (const chip of ["Moving", "Sell", "Trash", "Donate"]) {
    await expect(
      page.getByRole("button", { name: new RegExp(`^${chip}\\b`) })
    ).toBeVisible({ timeout: 15_000 });
  }
  await page.screenshot({ path: "/tmp/mm-items2.png" });

  // --- Move detail config tabs ---
  await page.goto("/app/moves", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Your moves" })).toBeVisible({
    timeout: 30_000,
  });
  const openLink = page.getByRole("link", { name: /Open/i }).first();
  await openLink.click();
  await expect(page).toHaveURL(/\/app\/moves\/[^/]+/, { timeout: 30_000 });
  await page
    .getByRole("navigation", { name: "Move operations" })
    .getByRole("link", { name: "Configure", exact: true })
    .click();
  await expect(page).toHaveURL(/\/configure$/, { timeout: 30_000 });
  await expect(page.getByText("Something went wrong")).toHaveCount(0, {
    timeout: 15_000,
  });

  // Click through whichever config tabs are present (loose match) — freeze would time out.
  const tabLabels = [
    "Start location",
    "End location",
    "Transportation",
    "Details",
    "Participants",
  ];
  let tabsFound = 0;
  for (const label of tabLabels) {
    const tab = page.getByRole("tab", { name: new RegExp(label, "i") }).first();
    if (await tab.count()) {
      tabsFound += 1;
      const t0 = Date.now();
      await tab.click();
      await expect(page.getByRole("navigation").first()).toBeVisible({
        timeout: 10_000,
      });
      expect(Date.now() - t0, `tab ${label}`).toBeLessThan(10_000);
    }
  }
  await page.screenshot({ path: "/tmp/mm-move-config.png", fullPage: false });
  console.log(`CONFIG_TABS_FOUND=${tabsFound}`);

  const errs = realErrors(problems);
  expect(errs, `app errors:\n${errs.map((e) => e.text).join("\n")}`).toEqual([]);
});
