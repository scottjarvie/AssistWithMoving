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
      !/favicon|_clientMiddlewareManifest|MIME type|status of 4/i.test(x.text),
  );
}

test("Move Operations nav reaches Load Plan / Move Day / Packets / AI Review", async ({
  page,
}) => {
  test.skip(!e2eUserEmail, "no e2e user");
  const problems: Problem[] = [];
  watch(page, problems);

  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: e2eUserEmail! });
  await page.waitForFunction(() => window.Clerk?.user !== null, undefined, {
    timeout: 45_000,
  });

  // Open a move.
  await page.goto("/app/moves", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: /Open/i }).first().click();
  await expect(page).toHaveURL(/\/app\/moves\/[^/]+$/, { timeout: 30_000 });

  // The Operations nav is present with all four operational links + Configure.
  const opsNav = page.getByRole("navigation", { name: "Move operations" });
  await expect(opsNav).toBeVisible({ timeout: 15_000 });
  for (const label of ["Configure", "Load Plan", "Move Day", "Packets", "AI Review"]) {
    await expect(opsNav.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await page.screenshot({ path: "/tmp/mm-operations-nav.png" });

  // Click through each operational route — a freeze would time out here.
  for (const [label, urlRe] of [
    ["Load Plan", /\/load-plan/],
    ["Move Day", /\/move-day/],
    ["Packets", /\/packets/],
    ["AI Review", /\/ai-review/],
    ["Configure", /\/app\/moves\/[^/]+$/],
  ] as Array<[string, RegExp]>) {
    await page
      .getByRole("navigation", { name: "Move operations" })
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(page).toHaveURL(urlRe, { timeout: 15_000 });
    await expect(page.getByText("Something went wrong")).toHaveCount(0, {
      timeout: 10_000,
    });
    // Nav persists across operational pages (cross-navigation works).
    await expect(
      page.getByRole("navigation", { name: "Move operations" }),
    ).toBeVisible({ timeout: 10_000 });
  }

  const errs = realErrors(problems);
  expect(errs, `app errors:\n${errs.map((e) => e.text).join("\n")}`).toEqual([]);
});
