import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

// Freeze-check for the revamped 3-item shell. The historical bug locked the UI
// on client-side navigation (provider remount storm). This proves the new
// single-provider shell navigates between Moves / Movable Units / Items and
// deep-links into a move without hanging or a render storm.

const e2eUserEmail = process.env.E2E_CLERK_USER_EMAIL;

type ConsoleProblem = { type: string; text: string };

function watchConsole(page: Page, sink: ConsoleProblem[]) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      sink.push({ type: "console.error", text: msg.text() });
    }
  });
  page.on("pageerror", (err) => {
    sink.push({ type: "pageerror", text: String(err?.message ?? err) });
  });
}

function renderStormErrors(problems: ConsoleProblem[]) {
  return problems.filter((p) =>
    /Maximum update depth|Too many re-renders|Rendered more hooks|Should have a queue|update depth exceeded/i.test(
      p.text
    )
  );
}

test("revamp shell navigates the 3 sections without freezing", async ({
  page,
}) => {
  test.skip(!e2eUserEmail, "E2E_CLERK_USER_EMAIL not set");
  const problems: ConsoleProblem[] = [];
  watchConsole(page, problems);

  await setupClerkTestingToken({ page });
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await clerk.signIn({ page, emailAddress: e2eUserEmail! });
  await page.waitForFunction(() => window.Clerk?.user !== null, undefined, {
    timeout: 45_000,
  });

  // Land on the new home.
  await page.goto("/app/moves", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/app\/moves(\/|$|\?)/, { timeout: 30_000 });
  // The authenticated Moves home renders (single provider resolved households/moves).
  await expect(
    page.getByRole("heading", { name: "Your moves" })
  ).toBeVisible({ timeout: 45_000 });

  // The 3 global nav links must be present.
  const nav = page.getByRole("navigation").first();
  for (const label of ["Moves", "Movable Units", "Items"]) {
    await expect(
      nav.getByRole("link", { name: label, exact: true }).first()
    ).toBeVisible({ timeout: 15_000 });
  }

  // Click through each section twice (there-and-back) — a freeze would time out here.
  const order: Array<[string, RegExp]> = [
    ["Movable Units", /\/app\/movable-units/],
    ["Items", /\/app\/items/],
    ["Moves", /\/app\/moves(\/|$|\?)/],
    ["Items", /\/app\/items/],
    ["Movable Units", /\/app\/movable-units/],
    ["Moves", /\/app\/moves(\/|$|\?)/],
  ];
  for (const [label, urlRe] of order) {
    const start = Date.now();
    await nav
      .getByRole("link", { name: label, exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(urlRe, { timeout: 15_000 });
    // The body must still be interactive (a known landmark renders quickly).
    await expect(page.getByRole("navigation").first()).toBeVisible({
      timeout: 15_000,
    });
    const elapsed = Date.now() - start;
    expect(elapsed, `nav to ${label} took ${elapsed}ms`).toBeLessThan(12_000);
  }

  // Deep-link straight into a move detail (if any move exists), then back.
  const moveCardLink = page
    .locator('a[href^="/app/moves/"]')
    .filter({ hasNot: page.locator('[href="/app/moves"]') })
    .first();
  if (await moveCardLink.count()) {
    const href = await moveCardLink.getAttribute("href");
    if (href && /\/app\/moves\/[^/]+/.test(href)) {
      await page.goto(href, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/app\/moves\/[^/]+/, { timeout: 30_000 });
      // Move detail rendered under the single hoisted provider (nav stays mounted).
      await expect(page.getByRole("navigation").first()).toBeVisible({
        timeout: 30_000,
      });
      // Navigate away and back to stress the (now single) provider.
      await nav.getByRole("link", { name: "Items", exact: true }).first().click();
      await expect(page).toHaveURL(/\/app\/items/, { timeout: 15_000 });
      await page.goBack();
      await expect(page).toHaveURL(/\/app\/moves\/[^/]+/, { timeout: 15_000 });
    }
  }

  const storms = renderStormErrors(problems);
  expect(
    storms,
    `render-storm errors detected:\n${storms.map((s) => s.text).join("\n")}`
  ).toEqual([]);
});
