import { expect, test } from "@playwright/test";

test("home page presents the MovingManifest product", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("MovingManifest");
  await expect(
    page.getByRole("heading", {
      name: "The manifest for everything that moves.",
    })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Open workspace preview/i })).toBeVisible();
});

test("public product and legal pages are available", async ({ page }) => {
  const routes = [
    ["/features", "Everything needed to turn a move into a usable record."],
    ["/pcs-moving", "PCS move planning without pretending policy is static."],
    ["/claims-inventory", "A claim-ready record built as a side effect of being organized."],
    ["/privacy", "Moving records can be sensitive. The product treats them that way."],
    ["/terms", "Use MovingManifest as an organizing system, not an official authority."],
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
    page.getByRole("heading", { name: "Sign in to MovingManifest" })
  ).toBeVisible();
});

test("public share links fail safely without requiring sign-in", async ({ page }) => {
  await page.goto("/share/not-a-real-token");

  await expect(page).not.toHaveURL(/\/sign-in/);
  await expect(
    page.getByRole("heading", { name: "Share link unavailable" })
  ).toBeVisible();
});
