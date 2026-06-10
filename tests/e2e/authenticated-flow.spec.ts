import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api";

const e2eUserEmail = process.env.E2E_CLERK_USER_EMAIL;
const e2eCleanupMaxBatches = 25;

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
      const session = window.Clerk?.session;
      if (!session) {
        return null;
      }

      const defaultToken = await session.getToken().catch(() => null);
      if (defaultToken) {
        return defaultToken;
      }

      return (await session.getToken({ template: "convex" }).catch(() => null)) ?? null;
    })
    .catch(() => null);
  if (!token) {
    return null;
  }

  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(token);
  let lastResult = null;
  for (let attempt = 0; attempt < e2eCleanupMaxBatches; attempt += 1) {
    const result = await client.mutation(
      api.testSupport.cleanupE2eDataForCurrentUser,
      { batchSize: 10 }
    );
    lastResult = result;
    if (!result.mayHaveMore) {
      return result;
    }
  }

  throw new Error(
    `E2E cleanup did not finish after ${e2eCleanupMaxBatches} batches. Last result: ${JSON.stringify(lastResult)}`
  );
}

test.describe("authenticated product flow", () => {
  test.setTimeout(180_000);

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

  test("creates a PCS move and works through every workspace page", async ({
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
    const freeItemName = `E2E porch lamp ${runId}`;
    const roomWalkItemName = `E2E office binder ${runId}`;
    const duplicateItemName = `E2E red toolbox ${runId}`;
    const duplicateMatchName = `E2E tool box ${runId}`;
    const boxCode = `E2E-${runId.toUpperCase()}`;
    const boxLabel = `E2E bike parts ${runId}`;
    const contactName = `E2E transportation office ${runId}`;
    const publicComment = `E2E pickup note ${runId}`;

    await ensureHousehold(page, householdName);

    await expect(page.getByLabel("Move title")).toBeEnabled({ timeout: 30_000 });
    await page.getByLabel("Move title").fill(moveTitle);
    await page.getByLabel("Move template").selectOption("pcs");
    await page.getByLabel("Military branch").selectOption("army");
    await page.getByLabel("PCS shipment type").selectOption("ppm");
    await page.getByLabel("Rank or pay grade").fill("E-6");
    await page.getByLabel("Official weight allowance in pounds").fill("11000");
    await page.getByRole("button", { name: "Create move" }).click();

    // Creating a move opens its workspace overview at a real URL.
    await page.waitForURL(/\/app\/moves\/[^/]+$/, { timeout: 30_000 });
    const e2eMoveId = decodeURIComponent(
      new URL(page.url()).pathname.split("/").pop() ?? ""
    );
    expect(e2eMoveId).toBeTruthy();
    const movePath = (section?: string) =>
      section
        ? `/app/moves/${encodeURIComponent(e2eMoveId)}/${section}`
        : `/app/moves/${encodeURIComponent(e2eMoveId)}`;
    await expect(
      page.getByRole("heading", { name: moveTitle, exact: true })
    ).toBeVisible({ timeout: 30_000 });

    // Nav links point at the per-section pages of this move. Desktop shows
    // the sidebar nav; mobile shows the header nav — both are labeled
    // "Primary" and only the visible one is in the accessibility tree.
    const sidebar = page.getByRole("navigation", { name: "Primary" });
    for (const [label, section] of [
      ["Inventory", "inventory"],
      ["Boxes", "boxes"],
      ["Photos", "photos"],
      ["Load Plan", "load-plan"],
      ["Move Day", "move-day"],
      ["Packets", "packets"],
      ["AI Review", "ai-review"],
    ] as const) {
      await expect(
        sidebar.getByRole("link", { name: label, exact: true })
      ).toHaveAttribute("href", movePath(section));
    }

    // Overview page: move contacts.
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

    // Load Plan page: transport resources.
    await page.goto(movePath("load-plan"));
    const transportResources = page
      .getByRole("heading", { name: "Transport resources", exact: true })
      .locator("xpath=ancestor::section[1]");
    await transportResources
      .getByRole("button", { name: /Military movers \/ HHG/ })
      .click();
    await expect(
      transportResources.getByText("Pro gear review").first()
    ).toBeVisible({ timeout: 30_000 });

    // Inventory page: room walk intake.
    await page.goto(movePath("inventory"));
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

    await page.getByLabel("New item name").fill(freeItemName);
    await page.getByLabel("New item room").fill("Porch");
    await page.getByLabel("New item category").fill("Lighting");
    await page.getByLabel("New item disposition").selectOption("free");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByLabel(`Status for ${freeItemName}`)).toBeVisible();

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

    const dispositionPipelines = page.locator("#disposition-pipelines");
    await expect(
      dispositionPipelines.getByText("Disposition pipelines")
    ).toBeVisible({ timeout: 30_000 });
    await expect(dispositionPipelines).toContainText("Free / giveaway");
    await expect(dispositionPipelines).toContainText("Free pickup link");
    await expect(dispositionPipelines).toContainText(freeItemName);

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
    const saveItemButton = itemDialog.getByRole("button", {
      name: "Save item",
    });
    await expect(async () => {
      await saveItemButton.click();
      await expect(page.getByText("Item saved.")).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 30_000 });
    await itemDialog.getByRole("tab", { name: "Planning" }).click();
    await expect(itemDialog.getByText(`${contactName} (contact)`)).toBeVisible();
    await itemDialog.getByRole("button", { name: "Close" }).first().click();

    // Overview page: packing debt reflects the new inventory; archive contact.
    await page.goto(movePath());
    const packingDebt = page.locator("#packing-debt");
    await expect(packingDebt.getByText("Packing debt")).toBeVisible({
      timeout: 30_000,
    });
    await expect(packingDebt).toContainText("Loose load items");
    await expect(packingDebt).toContainText("High-value without photos");
    await expect(packingDebt).toContainText("Boxes not assigned");

    await page.getByRole("button", { name: `Archive ${contactName}` }).click();
    await expect(page.getByText(`${contactName} archived.`)).toBeVisible({
      timeout: 30_000,
    });

    // Boxes page: create a box and pack an item.
    await page.goto(movePath("boxes"));
    const createBoxForm = page.getByRole("form", { name: "Create box" });
    await createBoxForm.getByLabel("New box code").fill(boxCode);
    await createBoxForm.getByLabel("New box label").fill(boxLabel);
    await createBoxForm.getByLabel("New box room").fill("Garage");
    await createBoxForm.getByLabel("New box destination room").fill("Storage");
    await createBoxForm.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("cell", { name: boxCode })).toBeVisible({
      timeout: 30_000,
    });

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
    await expect(boxManager.getByText("contents-derived").first()).toBeVisible({
      timeout: 30_000,
    });
    const boxLabelsHref = await boxManager
      .getByRole("link", { name: "Labels" })
      .first()
      .getAttribute("href");
    expect(boxLabelsHref).toContain("/app/box-labels");
    const boxLabelsMoveId = new URL(boxLabelsHref!, page.url()).searchParams.get(
      "moveId"
    );
    expect(boxLabelsMoveId).toBe(e2eMoveId);

    // Load Plan page: assign and lock the box.
    await page.goto(movePath("load-plan"));
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
    await loadPlanner
      .getByRole("button", { name: `Lock assignment for ${boxCode}` })
      .click();
    await expect(
      loadPlanner.getByText(`${boxCode} assignment locked.`)
    ).toBeVisible({ timeout: 30_000 });
    await loadPlanner.getByLabel(`Select ${boxCode}`).check();
    await expect(
      loadPlanner.getByText("1 selected in the current view, 1 locked will be skipped")
    ).toBeVisible();
    await expect(
      loadPlanner.getByRole("button", { name: "Unassign", exact: true })
    ).toBeDisabled();

    // Photos page: evidence tooling renders.
    await page.goto(movePath("photos"));
    const roomSweep = page
      .getByRole("heading", { name: "Room sweep", exact: true })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    await expect(roomSweep.getByLabel("Room or area")).toBeEnabled({
      timeout: 30_000,
    });
    await expect(roomSweep.getByLabel("Room photo")).toBeEnabled();
    const photoEvidence = page
      .getByRole("heading", { name: "Photo evidence", exact: true })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    await expect(
      photoEvidence.getByRole("button", { name: "Claim / evidence" })
    ).toBeVisible();
    await expect(
      photoEvidence.getByRole("button", { name: "AI not processed" })
    ).toBeVisible();
    await expect(
      photoEvidence.getByRole("button", { name: "Quality issues" })
    ).toBeVisible();
    const evidenceDensity = page.locator("#evidence-density");
    await expect(evidenceDensity.getByText("Evidence density")).toBeVisible({
      timeout: 30_000,
    });
    await expect(evidenceDensity).toContainText("Average score");
    await expect(evidenceDensity).toContainText("Top evidence gaps");

    // Move Day page renders the crew view.
    await page.goto(movePath("move-day"));
    await expect(
      page.getByRole("heading", { name: "Move Day", exact: true, level: 2 })
    ).toBeVisible({ timeout: 30_000 });

    // Packets page: claims center and documentation packets.
    await page.goto(movePath("packets"));
    const claimsCenter = page.locator("#claims-center");
    await expect(claimsCenter.getByText("Claims Center")).toBeVisible({
      timeout: 30_000,
    });
    await expect(claimsCenter).toContainText("Top claim items");
    await expect(claimsCenter).toContainText("Claim timeline");

    const documentationPackets = page
      .getByRole("heading", { name: "Documentation packets", exact: true })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    const ensureProfiles = documentationPackets.getByRole("button", {
      name: "Ensure move profiles",
    });
    await expect(ensureProfiles).toBeVisible({ timeout: 30_000 });
    if (await ensureProfiles.isEnabled()) {
      await ensureProfiles.click();
      await expect(ensureProfiles).toBeDisabled();
    }
    await documentationPackets
      .getByRole("button", { name: "Packet profile Moving company" })
      .click();
    await expect(documentationPackets.getByLabel("Packet profile name")).toHaveValue(
      "Moving company",
      { timeout: 30_000 }
    );
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
    const openShareLink = documentationPackets.getByRole("link", {
      name: "Open share link",
    });
    await expect(openShareLink).toBeVisible({ timeout: 30_000 });
    await expect(openShareLink).toHaveAttribute("href", /\/share\//);
    const sharePath = await openShareLink.getAttribute("href");
    expect(sharePath).toBeTruthy();

    await page.goto(sharePath!);
    await expect(
      page.getByRole("heading", { name: "Moving company", exact: true })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("status updates")).toBeVisible();
    const publicItemStatus = page.getByLabel(`Status for ${itemName}`);
    await expect(publicItemStatus).toBeVisible({ timeout: 30_000 });
    await publicItemStatus.selectOption("loaded");
    await expect(page.getByText("Status updated to loaded.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(publicItemStatus).toHaveValue("loaded", { timeout: 30_000 });

    // Deep link straight back into this move's packets page.
    await page.goto(movePath("packets"));
    await expect(
      page.getByRole("heading", { name: "Documentation packets", exact: true })
    ).toBeVisible({ timeout: 30_000 });
    const revokeShareLink = documentationPackets
      .getByRole("button", { name: "Revoke" })
      .first();
    await expect(revokeShareLink).toBeVisible({ timeout: 30_000 });
    await revokeShareLink.click();
    await expect(
      documentationPackets.getByText("Share link revoked.")
    ).toBeVisible({ timeout: 30_000 });
    await expect(revokeShareLink).toBeHidden({ timeout: 30_000 });

    await documentationPackets
      .getByLabel("Documentation profile type")
      .selectOption("sellOrGiveaway");
    await documentationPackets
      .getByRole("button", { name: "Create profile" })
      .click();
    await expect(
      documentationPackets.getByText("Packet profile created.")
    ).toBeVisible({ timeout: 30_000 });
    await expect(documentationPackets.getByLabel("Packet profile name")).toHaveValue(
      "Sell / giveaway",
      { timeout: 30_000 }
    );
    await documentationPackets
      .getByRole("button", { name: "Create link token" })
      .click();
    const openCommentShareLink = documentationPackets.getByRole("link", {
      name: "Open share link",
    });
    await expect(openCommentShareLink).toBeVisible({ timeout: 30_000 });
    await expect(openCommentShareLink).toHaveAttribute("href", /\/share\//);
    const commentSharePath = await openCommentShareLink.getAttribute("href");
    expect(commentSharePath).toBeTruthy();

    await page.goto(commentSharePath!);
    await expect(
      page.getByRole("heading", { name: "Sell / giveaway", exact: true })
    ).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("Comment author").fill("E2E recipient");
    await page.getByLabel("Recipient note").fill(publicComment);
    await page.getByRole("button", { name: "Send note" }).click();
    await expect(page.getByText("Note sent.")).toBeVisible({ timeout: 30_000 });

    await page.goto(movePath("packets"));
    await expect(
      documentationPackets.getByText(publicComment)
    ).toBeVisible({ timeout: 30_000 });
    const revokeCommentShareLink = documentationPackets
      .getByRole("button", { name: "Revoke" })
      .first();
    await expect(revokeCommentShareLink).toBeVisible({ timeout: 30_000 });
    await revokeCommentShareLink.click();
    await expect(
      documentationPackets.getByText("Share link revoked.")
    ).toBeVisible({ timeout: 30_000 });
    await expect(revokeCommentShareLink).toBeHidden({ timeout: 30_000 });

    const pcsPacketHref = await documentationPackets
      .getByRole("link", { name: "PCS packet" })
      .getAttribute("href");
    expect(pcsPacketHref).toBeTruthy();
    await documentationPackets
      .getByRole("button")
      .filter({ hasText: "Moving company" })
      .first()
      .click();
    const moverPacketHref = await documentationPackets
      .getByRole("link", { name: "Mover packet" })
      .getAttribute("href");
    expect(moverPacketHref).toBeTruthy();
    await documentationPackets
      .getByLabel("Documentation profile type")
      .selectOption("employerRelocation");
    await documentationPackets
      .getByRole("button", { name: "Create profile" })
      .click();
    await expect(
      documentationPackets.getByText("Packet profile created.")
    ).toBeVisible({ timeout: 30_000 });
    const employerPacketHref = await documentationPackets
      .getByRole("link", { name: "Employer packet" })
      .getAttribute("href");
    expect(employerPacketHref).toBeTruthy();

    // AI Review page: text intake and the local job monitor.
    await page.goto(movePath("ai-review"));
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
    await aiJobMonitor.getByRole("button", { name: "Local review" }).click();
    await waitForAiOutcome(aiJobMonitor, /Local demo review completed\./);

    // Printable box labels still work from the boxes page link.
    await page.goto(`${boxLabelsHref!}&layout=thermal4x6`);
    await expect(
      page.getByRole("heading", { name: "Box labels", exact: true })
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("group", { name: "Box label print layout" })
    ).toBeVisible();
    await expect(page.getByText("4 x 6 thermal")).toBeVisible();
    await page.getByRole("button", { name: "3 x 2" }).click();
    await expect(page.getByText("3 x 2 compact")).toBeVisible({
      timeout: 30_000,
    });

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
    const apiKeyHouseholdSelect = apiKeys.getByLabel("Household for API keys");
    await expect(apiKeyHouseholdSelect).toBeVisible({
      timeout: 30_000,
    });
    await apiKeyHouseholdSelect.selectOption({ label: householdName });
    await expect(
      apiKeys.locator("[data-slot='badge']").filter({ hasText: householdName })
    ).toBeVisible({ timeout: 30_000 });
    const apiKeyMoveRestriction = apiKeys.getByLabel(
      "API key move restriction"
    );
    await expect(apiKeyMoveRestriction).toBeVisible({ timeout: 30_000 });
    await expect(apiKeyMoveRestriction).toBeEnabled({ timeout: 30_000 });
    await expect(apiKeyMoveRestriction).toContainText(moveTitle, {
      timeout: 30_000,
    });
    const apiKeyName = `E2E local agent ${runId}`;
    await apiKeys.getByLabel("API key name").fill(apiKeyName);
    await apiKeyMoveRestriction.selectOption({ label: moveTitle });
    await expect(apiKeys.getByText(`Move: ${moveTitle}`)).toBeVisible({
      timeout: 30_000,
    });
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
    const apiReadResponse = await page.request.get(
      `/api/v1/moves/${e2eMoveId}/summary`,
      {
        headers: { authorization: `Bearer ${rawApiKey}` },
      }
    );
    expect(apiReadResponse.status()).toBe(200);
    expect(apiReadResponse.headers()["x-ratelimit-limit"]).toBeTruthy();
    expect(apiReadResponse.headers()["x-ratelimit-remaining"]).toBeTruthy();
    expect(apiReadResponse.headers()["x-ratelimit-reset"]).toBeTruthy();
    const apiReadBody = (await apiReadResponse.json()) as {
      data?: { move?: { moveId?: string; title?: string } };
    };
    expect(apiReadBody.data?.move?.moveId).toBe(e2eMoveId);
    expect(apiReadBody.data?.move?.title).toBe(moveTitle);

    const broadApiReadResponse = await page.request.get("/api/v1/moves", {
      headers: { authorization: `Bearer ${rawApiKey}` },
    });
    expect(broadApiReadResponse.status()).toBe(403);

    const apiKeyRow = apiKeys.getByRole("group", {
      name: `API key ${apiKeyName}`,
    });
    await expect(apiKeyRow).toBeVisible({ timeout: 30_000 });
    await expect(apiKeyRow.getByText(`Move: ${moveTitle}`)).toBeVisible();
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
    const pcsReadiness = page
      .getByRole("heading", {
        name: "PCS documentation readiness",
        exact: true,
      })
      .locator("xpath=ancestor::section[1]");
    await expect(pcsReadiness).toBeVisible({ timeout: 30_000 });
    await expect(
      pcsReadiness.getByText("PCS field check", { exact: true })
    ).toBeVisible();
    await expect(
      pcsReadiness.getByText("Weight allowance", { exact: true })
    ).toBeVisible();
    await expect(
      pcsReadiness.getByText("Evidence coverage", { exact: true })
    ).toBeVisible();
    await expect(page.getByText(moveTitle)).toBeVisible({ timeout: 30_000 });

    await page.goto(moverPacketHref!);
    const moverReadiness = page
      .getByRole("heading", {
        name: "Mover handoff readiness",
        exact: true,
      })
      .locator("xpath=ancestor::section[1]");
    await expect(moverReadiness).toBeVisible({ timeout: 30_000 });
    await expect(
      moverReadiness.getByText("Load assignment", { exact: true })
    ).toBeVisible();
    await expect(
      moverReadiness.getByText("Mover recipient privacy", { exact: true })
    ).toBeVisible();

    await page.goto(employerPacketHref!);
    const employerReadiness = page
      .getByRole("heading", {
        name: "Employer packet readiness",
        exact: true,
      })
      .locator("xpath=ancestor::section[1]");
    await expect(employerReadiness).toBeVisible({ timeout: 30_000 });
    await expect(
      employerReadiness.getByText("Relocation shipment summary", {
        exact: true,
      })
    ).toBeVisible();
    await expect(
      employerReadiness.getByText("Employer recipient privacy", { exact: true })
    ).toBeVisible();
  });
});
