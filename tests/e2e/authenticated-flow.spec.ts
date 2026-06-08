import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

const e2eUserEmail = process.env.E2E_CLERK_USER_EMAIL;

async function gotoDashboard(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle").catch(() => {});

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      if (
        attempt === 2 ||
        !String(error).includes("interrupted by another navigation")
      ) {
        throw error;
      }

      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(500);
    }
  }
}

test.describe("authenticated product flow", () => {
  test.skip(
    !e2eUserEmail,
    "Set E2E_CLERK_USER_EMAIL to run signed-in MovingManifest product flows."
  );

  test("creates a PCS move and reaches core workspace surfaces", async ({
    context,
    page,
  }) => {
    await setupClerkTestingToken({ context });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: e2eUserEmail! });
    await page.waitForFunction(() => window.Clerk?.user !== null);

    await gotoDashboard(page);
    await expect(page.getByRole("main", { name: "Workspace content" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Household", exact: true })
    ).toBeVisible();

    const runId = Date.now().toString(36);
    const householdName = `E2E household ${runId}`;
    const moveTitle = `E2E PCS move ${runId}`;

    const householdInput = page.getByLabel("Household name");
    const selectedHousehold = page.getByLabel("Selected household");
    await expect(householdInput.or(selectedHousehold).first()).toBeVisible({
      timeout: 30_000,
    });
    if (await householdInput.isVisible()) {
      await householdInput.fill(householdName);
      await page.getByRole("button", { name: "Create household" }).click();
      await expect(selectedHousehold).toBeVisible();
    }

    await expect(page.getByLabel("Move title")).toBeEnabled({ timeout: 30_000 });
    await page.getByLabel("Move title").fill(moveTitle);
    await page.getByLabel("Move type").selectOption("pcs");
    await page.getByLabel("Military branch").selectOption("army");
    await page.getByLabel("PCS shipment type").selectOption("ppm");
    await page.getByLabel("Rank or pay grade").fill("E-6");
    await page.getByLabel("Official weight allowance in pounds").fill("11000");
    await page.getByRole("button", { name: "Create move" }).click();
    await expect(page.getByRole("cell", { name: moveTitle })).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Inventory", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Move Day", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Load planner", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Documentation packets", exact: true })
    ).toBeVisible();
  });
});
