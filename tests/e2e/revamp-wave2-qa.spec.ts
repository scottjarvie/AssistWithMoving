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
  return p.filter(
    (x) =>
      !/favicon|_clientMiddlewareManifest|MIME type|Failed to load resource: the server responded with a status of 4/i.test(
        x.text
      )
  );
}

test("Movable Units + Queue/onboarding render cleanly", async ({ page }) => {
  test.skip(!e2eUserEmail, "E2E_CLERK_USER_EMAIL not set");
  const problems: Problem[] = [];
  watch(page, problems);

  await setupClerkTestingToken({ page });
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await clerk.signIn({ page, emailAddress: e2eUserEmail! });
  await page.waitForFunction(() => window.Clerk?.user !== null, undefined, {
    timeout: 45_000,
  });

  // Movable Units
  await page.goto("/app/movable-units", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Something went wrong")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.getByRole("navigation").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "/tmp/mm-movable-units2.png" });

  // Queue surface (via a move). Get a move id from the Moves home.
  await page.goto("/app/moves", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Your moves" })).toBeVisible({
    timeout: 30_000,
  });
  const openLink = page.getByRole("link", { name: /Open/i }).first();
  const href = await openLink.getAttribute("href");
  expect(href, "move open href").toBeTruthy();
  await page.goto(`${href}/queue`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/app\/moves\/[^/]+\/queue/, { timeout: 30_000 });
  await expect(page.getByText("Something went wrong")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.getByRole("navigation").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/mm-queue.png", fullPage: false });

  const errs = realErrors(problems);
  expect(errs, `app errors:\n${errs.map((e) => e.text).join("\n")}`).toEqual([]);
});
