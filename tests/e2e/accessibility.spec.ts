import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test("home page has no automated accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Keep the whole move coherent.",
    })
  ).toBeVisible();
  await expectNoAxeViolations(page);
});

test("signed-out workspace protection has no automated accessibility violations", async ({
  page,
}) => {
  await page.goto("/app/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(
    page.getByRole("heading", { name: "Sign in to Assist With Moving" })
  ).toBeVisible();
  await expectNoAxeViolations(page);
});
