import { expect, test } from "@playwright/test";

test("home page presents the Assist With Moving product", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Assist With Moving");
  await expect(
    page.getByRole("heading", {
      name: "Keep the whole move coherent.",
    })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Set up your chosen AI" }),
  ).toHaveAttribute("href", "/ai");
});

test("public product and legal pages are available", async ({ page }) => {
  const routes = [
    ["/features", "Everything needed to turn a move into a usable record."],
    ["/pcs-moving", "PCS move planning without pretending policy is static."],
    ["/claims-inventory", "A claim-ready record built as a side effect of being organized."],
    ["/privacy", "Moving records can be sensitive. The product treats them that way."],
    ["/terms", "Use Assist With Moving as an organizing system, not an official authority."],
  ] as const;

  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("workspace preview is protected for signed-out users", async ({ page }) => {
  await page.goto("/app/dashboard");

  await expect(page).toHaveURL(/\/sign-in/);
  await expect(
    page.getByRole("heading", { name: "Sign in to Assist With Moving" })
  ).toBeVisible();
});

test("public share links fail safely without requiring sign-in", async ({ page }) => {
  await page.goto("/share/not-a-real-token");

  await expect(page).not.toHaveURL(/\/sign-in/);
  await expect(
    page.getByRole("heading", { name: "Share link unavailable" })
  ).toBeVisible();
});
