import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api";

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

async function waitForWorkspaceAuth(page: Page) {
  await expect(
    page.getByText(/Convex sees this browser session as/)
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible({
    timeout: 30_000,
  });
}

async function ensureHousehold(page: Page, householdName: string) {
  const householdInput = page.getByLabel("Household name");
  const selectedHousehold = page.getByLabel("Selected household");
  const createHousehold = page.getByRole("button", {
    name: "Create household",
  });

  await expect(householdInput).toBeVisible({ timeout: 30_000 });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await householdInput.fill(householdName);
      await expect(createHousehold).toBeEnabled({ timeout: 30_000 });
      await createHousehold.click();
      await expect(selectedHousehold).toBeVisible({ timeout: 30_000 });
      await expect(selectedHousehold).toContainText(householdName, {
        timeout: 30_000,
      });
      await selectedHousehold.selectOption({
        label: `${householdName} - owner`,
      });
      return;
    } catch (error) {
      const householdExists = await selectedHousehold
        .getByRole("option", { name: `${householdName} - owner` })
        .isVisible()
        .catch(() => false);
      if (householdExists) {
        await selectedHousehold.selectOption({
          label: `${householdName} - owner`,
        });
        return;
      }
      if (attempt === 2) {
        throw error;
      }
    }
  }
}

async function waitForAiOutcome(card: Locator, successPattern: RegExp) {
  const successMessage = card.getByText(successPattern);
  const quotaMessage = card.getByText(/daily AI (job limit|budget)/);
  await expect(successMessage.or(quotaMessage)).toBeVisible({
    timeout: 30_000,
  });
  return successMessage.isVisible().catch(() => false);
}

async function cleanupE2eData(page: Page) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl || !page.url().startsWith("http")) {
    return null;
  }

  const token = await page
    .evaluate(async () => {
      return (await window.Clerk?.session?.getToken({ template: "convex" })) ?? null;
    })
    .catch(() => null);
  if (!token) {
    return null;
  }

  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(token);
  return await client.mutation(api.testSupport.cleanupE2eDataForCurrentUser, {});
}

test.describe("authenticated product flow", () => {
  test.setTimeout(120_000);

  test.skip(
    !e2eUserEmail,
    "Set E2E_CLERK_USER_EMAIL to run signed-in MovingManifest product flows."
  );

  test.afterEach(async ({ page }, testInfo) => {
    try {
      await cleanupE2eData(page);
    } catch (error) {
      if (testInfo.status === testInfo.expectedStatus) {
        throw error;
      }
      console.warn("E2E cleanup failed after a failed test.", error);
    }
  });

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
    await waitForWorkspaceAuth(page);
    await cleanupE2eData(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForWorkspaceAuth(page);

    const runId = Date.now().toString(36);
    const householdName = `E2E household ${runId}`;
    const moveTitle = `E2E PCS move ${runId}`;
    const itemName = `E2E road bike ${runId}`;
    const roomWalkItemName = `E2E office binder ${runId}`;
    const duplicateItemName = `E2E red toolbox ${runId}`;
    const duplicateMatchName = `E2E tool box ${runId}`;
    const boxCode = `E2E-${runId.toUpperCase()}`;
    const boxLabel = `E2E bike parts ${runId}`;
    const contactName = `E2E transportation office ${runId}`;

    await ensureHousehold(page, householdName);

    await expect(page.getByLabel("Move title")).toBeEnabled({ timeout: 30_000 });
    await page.getByLabel("Move title").fill(moveTitle);
    await page.getByLabel("Move type").selectOption("pcs");
    await page.getByLabel("Military branch").selectOption("army");
    await page.getByLabel("PCS shipment type").selectOption("ppm");
    await page.getByLabel("Rank or pay grade").fill("E-6");
    await page.getByLabel("Official weight allowance in pounds").fill("11000");
    await page.getByRole("button", { name: "Create move" }).click();
    await expect(page.getByText("Move created.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("cell", { name: moveTitle })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByLabel("Contact name").fill(contactName);
    await page.getByLabel("Contact role").selectOption("contact");
    await page.getByLabel("Contact email").fill(`office-${runId}@example.test`);
    await page.getByLabel("Contact phone").fill("555-0100");
    await page.getByLabel("Contact notes").fill("E2E PCS counseling contact");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByText("Contact added.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByLabel(`Contact name for ${contactName}`)).toBeVisible();
    await page.getByLabel(`Contact phone for ${contactName}`).fill("555-0101");
    await page.getByRole("button", { name: `Save ${contactName}` }).click();
    await expect(page.getByText(`${contactName} saved.`)).toBeVisible({
      timeout: 30_000,
    });

    const transportResources = page
      .getByRole("heading", { name: "Transport resources", exact: true })
      .locator("xpath=ancestor::section[1]");
    await transportResources
      .getByRole("button", { name: /Military movers \/ HHG/ })
      .click();
    await expect(
      transportResources.getByText("Pro gear review").first()
    ).toBeVisible();

    await page.getByLabel("Room walk active room").fill("Office");
    await page.getByLabel("Room walk item name").fill(roomWalkItemName);
    await page.getByLabel("Room walk item category").fill("Documents");
    await page.getByLabel("Room walk disposition").selectOption("personalTransport");
    await page.getByLabel("Room walk owner or contact").selectOption({
      label: `${contactName} - contact`,
    });
    await page.getByLabel("Room walk item note").fill("PCS orders binder");
    await page.getByLabel("First night").check();
    await page.getByLabel("Needs evidence").check();
    await page.getByRole("button", { name: "Add room item" }).click();
    await expect(
      page.getByText(`${roomWalkItemName} added to Office.`)
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator("#room-walk").getByText(roomWalkItemName, { exact: true })
    ).toBeVisible();

    await page.getByLabel("New item name").fill(itemName);
    await page.getByLabel("New item room").fill("Garage");
    await page.getByLabel("New item category").fill("Sports");
    await page.getByLabel("New item disposition").selectOption("mover");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByLabel(`Status for ${itemName}`)).toBeVisible();

    for (const duplicateName of [duplicateItemName, duplicateMatchName]) {
      await page.getByLabel("New item name").fill(duplicateName);
      await page.getByLabel("New item room").fill("Garage");
      await page.getByLabel("New item category").fill("Tools");
      await page.getByLabel("New item disposition").selectOption("mover");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await expect(page.getByLabel(`Status for ${duplicateName}`)).toBeVisible({
        timeout: 30_000,
      });
    }

    const duplicateReview = page
      .getByRole("heading", { name: "Duplicate review", exact: true })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    await expect(duplicateReview.getByText(duplicateItemName)).toBeVisible({
      timeout: 30_000,
    });
    await expect(duplicateReview.getByText(duplicateMatchName)).toBeVisible();
    await duplicateReview
      .getByRole("button", { name: "Mark review" })
      .first()
      .click();
    await expect(
      duplicateReview.getByText(/\d+ items marked for duplicate review\./)
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page
        .getByRole("row")
        .filter({ has: page.getByText(duplicateItemName) })
        .getByLabel("needs review")
    ).toBeChecked({ timeout: 30_000 });
    await duplicateReview
      .getByRole("button", { name: "Not duplicates" })
      .first()
      .click();
    await expect(
      duplicateReview.getByText(/\d+ items kept as separate records\./)
    ).toBeVisible({ timeout: 30_000 });
    await expect(duplicateReview.getByText(duplicateItemName)).toBeHidden({
      timeout: 30_000,
    });

    const itemRow = page
      .getByRole("row")
      .filter({ has: page.getByText(itemName) });
    await itemRow.getByRole("button", { name: "Details" }).click();
    const itemDialog = page.getByRole("dialog", { name: itemName });
    await itemDialog.getByLabel("Owner / contact").selectOption({
      label: `${contactName} - contact`,
    });
    await itemDialog.getByRole("button", { name: "Save item" }).click();
    await expect(page.getByText("Item saved.")).toBeVisible({
      timeout: 30_000,
    });
    await itemDialog.getByRole("tab", { name: "Planning" }).click();
    await expect(itemDialog.getByText(`${contactName} (contact)`)).toBeVisible();
    await itemDialog.getByRole("button", { name: "Close" }).first().click();

    await page.getByRole("button", { name: `Archive ${contactName}` }).click();
    await expect(page.getByText(`${contactName} archived.`)).toBeVisible({
      timeout: 30_000,
    });

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
    const revokeShareLink = documentationPackets
      .getByRole("button", { name: "Revoke" })
      .first();
    await expect(revokeShareLink).toBeVisible({ timeout: 30_000 });
    await revokeShareLink.click();
    await expect(
      documentationPackets.getByText("Share link revoked.")
    ).toBeVisible({ timeout: 30_000 });
    await expect(revokeShareLink).toBeHidden({ timeout: 30_000 });

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

    const roomSweep = page
      .getByRole("heading", { name: "Room sweep", exact: true })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    await expect(roomSweep.getByLabel("Room or area")).toBeEnabled();
    await expect(roomSweep.getByLabel("Room photo")).toBeEnabled();

    const aiTextIntake = page
      .getByRole("heading", { name: "AI text intake", exact: true })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    await aiTextIntake
      .getByLabel("AI text intake source")
      .fill(
        `Garage: E2E helmet ${runId}, E2E riding gloves ${runId}\nBox ${boxCode}-AI: helmet, gloves (Garage)`
      );
    await aiTextIntake
      .getByRole("button", { name: "Generate suggestions" })
      .click();
    const textIntakeCreated = await waitForAiOutcome(
      aiTextIntake,
      /\d+ reviewable suggestions created\./
    );
    if (textIntakeCreated) {
      await expect(
        aiTextIntake.getByRole("button", { name: "Approve selected" })
      ).toBeEnabled({ timeout: 30_000 });
      await aiTextIntake
        .getByRole("button", { name: "Approve selected" })
        .click();
      await expect(
        aiTextIntake.getByText(/\d+ items and \d+ boxes approved\./)
      ).toBeVisible({ timeout: 30_000 });
    }

    const aiJobMonitor = page
      .getByRole("heading", { name: "AI job monitor", exact: true })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    await aiJobMonitor.getByRole("button", { name: "Mock review" }).click();
    await waitForAiOutcome(aiJobMonitor, /Mock AI review completed\./);

    const pcsPacketHref = await documentationPackets
      .getByRole("link", { name: "PCS packet" })
      .getAttribute("href");
    expect(pcsPacketHref).toBeTruthy();

    await page.goto("/settings");
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true })
    ).toBeVisible({ timeout: 30_000 });
    const apiKeys = page
      .getByRole("heading", { name: "API and MCP keys", exact: true })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    await expect(apiKeys.getByLabel("Household for API keys")).toBeVisible({
      timeout: 30_000,
    });
    const apiKeyName = `E2E local agent ${runId}`;
    await apiKeys.getByLabel("API key name").fill(apiKeyName);
    await apiKeys.getByRole("button", { name: "Create key" }).click();
    await expect(
      apiKeys.getByText(
        "API key created. Store the secret now; it will not be shown again."
      )
    ).toBeVisible({ timeout: 30_000 });
    await expect(apiKeys.getByText("One-time secret")).toBeVisible();
    const rawApiKey = await apiKeys
      .getByLabel("One-time API key secret")
      .inputValue();
    const apiReadResponse = await page.request.get("/api/v1/moves", {
      headers: { authorization: `Bearer ${rawApiKey}` },
    });
    expect(apiReadResponse.status()).toBe(200);
    const apiReadBody = (await apiReadResponse.json()) as {
      data?: unknown[];
    };
    expect(Array.isArray(apiReadBody.data)).toBe(true);

    const apiKeyRow = apiKeys.getByRole("group", {
      name: `API key ${apiKeyName}`,
    });
    await expect(apiKeyRow).toBeVisible({ timeout: 30_000 });
    await apiKeyRow.scrollIntoViewIfNeeded();
    const revokeApiKey = apiKeyRow.getByRole("button", { name: "Revoke" });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(revokeApiKey).toBeEnabled({ timeout: 30_000 });
      await revokeApiKey.click();
      const revoked = await apiKeyRow
        .getByText("Revoked")
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      if (revoked) {
        break;
      }
      if (attempt === 2) {
        await expect(apiKeyRow.getByText("Revoked")).toBeVisible({
          timeout: 30_000,
        });
      }
    }
    await expect(apiKeyRow.getByText("Revoked")).toBeVisible({
      timeout: 30_000,
    });
    const revokedApiResponse = await page.request.get("/api/v1/moves", {
      headers: { authorization: `Bearer ${rawApiKey}` },
    });
    expect(revokedApiResponse.status()).toBe(403);

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
