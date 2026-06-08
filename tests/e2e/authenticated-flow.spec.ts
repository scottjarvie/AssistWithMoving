import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

const e2eUserEmail = process.env.E2E_CLERK_USER_EMAIL;

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

    await page.goto("/app/dashboard");
    await expect(page.getByRole("main", { name: "Workspace content" })).toBeVisible();

    const runId = Date.now().toString(36);
    const householdName = `E2E household ${runId}`;
    const moveTitle = `E2E PCS move ${runId}`;

    const householdInput = page.getByLabel("Household name");
    if (await householdInput.isVisible().catch(() => false)) {
      await householdInput.fill(householdName);
      await page.getByRole("button", { name: "Create household" }).click();
      await expect(page.getByLabel("Selected household")).toBeVisible();
    }

    await page.getByLabel("Move title").fill(moveTitle);
    await page.getByLabel("Move type").selectOption("pcs");
    await page.getByLabel("Military branch").selectOption("army");
    await page.getByLabel("PCS shipment type").selectOption("ppm");
    await page.getByLabel("Rank or pay grade").fill("E-6");
    await page.getByLabel("Official weight allowance in pounds").fill("11000");
    await page.getByRole("button", { name: "Create move" }).click();
    await expect(page.getByText(moveTitle)).toBeVisible();

    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Move Day" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Load planner" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Documentation packets" })
    ).toBeVisible();
  });
});
