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

test("workspace preview route loads foundation shell", async ({ page }) => {
  await page.goto("/app/dashboard");

  await expect(
    page.getByRole("heading", { name: "MovingManifest workspace preview" })
  ).toBeVisible();
  await expect(page.getByText("Packet defaults")).toBeVisible();
});
