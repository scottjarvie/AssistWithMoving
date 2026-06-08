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

async function ensureHousehold(page: Page, householdName: string) {
  const householdInput = page.getByLabel("Household name");
  const selectedHousehold = page.getByLabel("Selected household");
  await expect(householdInput.or(selectedHousehold).first()).toBeVisible({
    timeout: 30_000,
  });

  if (await selectedHousehold.isVisible().catch(() => false)) {
    return;
  }

  await householdInput.fill(householdName);
  await householdInput.press("Enter");
  await expect(selectedHousehold).toBeVisible({ timeout: 30_000 });
}

test.describe("authenticated product flow", () => {
  test.setTimeout(90_000);

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
    const itemName = `E2E road bike ${runId}`;
    const boxCode = `E2E-${runId.toUpperCase()}`;
    const boxLabel = `E2E bike parts ${runId}`;

    await ensureHousehold(page, householdName);

    await expect(page.getByLabel("Move title")).toBeEnabled({ timeout: 30_000 });
    await page.getByLabel("Move title").fill(moveTitle);
    await page.getByLabel("Move type").selectOption("pcs");
    await page.getByLabel("Military branch").selectOption("army");
    await page.getByLabel("PCS shipment type").selectOption("ppm");
    await page.getByLabel("Rank or pay grade").fill("E-6");
    await page.getByLabel("Official weight allowance in pounds").fill("11000");
    await page.getByRole("button", { name: "Create move" }).click();
    await expect(page.getByRole("cell", { name: moveTitle })).toBeVisible();

    const transportResources = page
      .getByRole("heading", { name: "Transport resources", exact: true })
      .locator("xpath=ancestor::section[1]");
    await transportResources
      .getByRole("button", { name: /Military movers \/ HHG/ })
      .click();
    await expect(
      transportResources.getByText("Pro gear review").first()
    ).toBeVisible();

    await page.getByLabel("New item name").fill(itemName);
    await page.getByLabel("New item room").fill("Garage");
    await page.getByLabel("New item category").fill("Sports");
    await page.getByLabel("New item disposition").selectOption("mover");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByLabel(`Status for ${itemName}`)).toBeVisible();

    const createBoxForm = page.getByRole("form", { name: "Create box" });
    await createBoxForm.getByLabel("New box code").fill(boxCode);
    await createBoxForm.getByLabel("New box label").fill(boxLabel);
    await createBoxForm.getByLabel("New box room").fill("Garage");
    await createBoxForm.getByLabel("New box destination room").fill("Storage");
    await createBoxForm.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("cell", { name: boxCode })).toBeVisible();

    const boxManager = page
      .getByRole("heading", { name: "Box manager", exact: true })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    await boxManager.getByLabel("Item to add to box").selectOption({
      label: itemName,
    });
    await boxManager.getByRole("button", { name: "Add" }).click();
    await expect(
      boxManager
        .getByRole("list", { name: `Contents for ${boxCode}` })
        .getByText(itemName)
    ).toBeVisible({ timeout: 30_000 });

    const loadPlanner = page
      .getByRole("heading", { name: "Load planner", exact: true })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    await expect(loadPlanner.getByLabel(`Select ${boxCode}`)).toBeVisible({
      timeout: 30_000,
    });
    await loadPlanner.getByLabel(`Select ${boxCode}`).check();
    await loadPlanner
      .getByLabel("Bulk assignment resource")
      .selectOption({ label: "Military movers / HHG" });
    await loadPlanner
      .getByLabel("Bulk assignment zone")
      .selectOption({ label: "HHG boxes" });
    await loadPlanner
      .getByRole("button", { name: "Assign", exact: true })
      .click();
    await expect(
      loadPlanner.getByText("1 box assignment updated.")
    ).toBeVisible({ timeout: 30_000 });

    const documentationPackets = page
      .getByRole("heading", { name: "Documentation packets", exact: true })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    const ensureProfiles = documentationPackets.getByRole("button", {
      name: "Ensure move profiles",
    });
    if (await ensureProfiles.isEnabled()) {
      await ensureProfiles.click();
      await expect(ensureProfiles).toBeDisabled();
    }
    await expect(
      documentationPackets.getByRole("button", { name: "Inventory CSV" })
    ).toBeEnabled({ timeout: 30_000 });
    await documentationPackets
      .getByRole("button", { name: "Inventory CSV" })
      .click();
    await expect(
      documentationPackets.getByText(
        /movingmanifest-inventory\.csv - completed - \d+ rows/
      )
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      documentationPackets.getByRole("button", { name: "Create link token" })
    ).toBeEnabled({ timeout: 30_000 });
    await documentationPackets
      .getByRole("button", { name: "Create link token" })
      .click();
    await expect(
      documentationPackets.getByRole("button", { name: "Revoke" }).first()
    ).toBeVisible({ timeout: 30_000 });

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

    const pcsPacketHref = await documentationPackets
      .getByRole("link", { name: "PCS packet" })
      .getAttribute("href");
    expect(pcsPacketHref).toBeTruthy();
    await page.goto(pcsPacketHref!);
    await expect(
      page.getByRole("heading", {
        name: "MovingManifest PCS Support Packet",
        exact: true,
      })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(moveTitle)).toBeVisible({ timeout: 30_000 });
  });
});
