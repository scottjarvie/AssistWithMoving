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
    page.getByRole("main", { name: "Workspace content" }),
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel("Switch household")).toBeVisible({
    timeout: 30_000,
  });
}

async function ensureHousehold(page: Page, householdName: string) {
  const householdSwitcher = page.getByLabel("Switch household");
  if (await householdSwitcher.isVisible().catch(() => false)) {
    return (
      (await householdSwitcher.locator("option:checked").textContent())?.trim() ??
      ""
    );
  }

  const householdInput = page.getByLabel("Household name");
  const createHousehold = page.getByRole("button", {
    name: "Create household",
  });

  await expect(householdInput).toBeVisible({ timeout: 30_000 });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await householdInput.fill(householdName);
      await expect(createHousehold).toBeEnabled({ timeout: 30_000 });
      await createHousehold.click();
      await expect(page.getByRole("status")).toContainText("Household created", {
        timeout: 30_000,
      });
      return householdName;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
    }
  }

  return householdName;
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

  test("redirects signed-in users from AI start to connection settings", async ({
    context,
    page,
  }) => {
    await setupClerkTestingToken({ context });
    await page.goto("/sign-in");
    await clerk.signIn({ page, emailAddress: e2eUserEmail! });
    await page.waitForFunction(() => window.Clerk?.user !== null);

    await gotoDashboard(page);
    await waitForWorkspaceAuth(page);
    await page.goto("/ai/start", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/settings\/ai-connections$/, { timeout: 30_000 });
    await expect(
      page.getByRole("heading", {
        name: "Create an AI connection",
        exact: true,
        level: 2,
      }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("creates an AI connection from simplified settings", async ({
    context,
    page,
  }) => {
    await setupClerkTestingToken({ context });
    await page.goto("/sign-in");
    await clerk.signIn({ page, emailAddress: e2eUserEmail! });
    await page.waitForFunction(() => window.Clerk?.user !== null);

    await gotoDashboard(page);
    await waitForWorkspaceAuth(page);
    await cleanupE2eData(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForWorkspaceAuth(page);

    const runId = Date.now().toString(36);
    const requestedHouseholdName = `E2E household ${runId}`;
    const moveTitle = `E2E PCS move ${runId}`;
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    expect(convexUrl).toBeTruthy();
    const token = await page.evaluate(async () => {
      const session = window.Clerk?.session;
      return (
        (await session?.getToken().catch(() => null)) ??
        (await session?.getToken({ template: "convex" }).catch(() => null)) ??
        null
      );
    });
    expect(token).toBeTruthy();
    const client = new ConvexHttpClient(convexUrl!);
    client.setAuth(token!);
    const householdId = await client.mutation(api.households.create, {
      name: requestedHouseholdName,
    });
    const e2eMoveId = await client.mutation(api.moves.create, {
      householdId,
      title: moveTitle,
      type: "local",
    });
    const householdName = requestedHouseholdName;

    await page.goto("/ai/start", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/settings\/ai-connections$/, { timeout: 30_000 });
    await expect(
      page.getByRole("heading", {
        name: "Create an AI connection",
        exact: true,
        level: 2,
      }),
    ).toBeVisible({ timeout: 30_000 });
    const apiKeys = page.getByRole("region", {
      name: "Create an AI connection",
      exact: true,
    });
    await expect(
      apiKeys.getByText("Recommended: full trusted helper"),
    ).toBeVisible({ timeout: 30_000 });

    await apiKeys
      .getByLabel("Household")
      .selectOption({ label: `${householdName} (owner)` });
    await expect(apiKeys.getByLabel("Where can it work?")).toContainText(
      moveTitle,
      { timeout: 30_000 },
    );

    const apiKeyName = `E2E local agent ${runId}`;
    await page.getByText("Advanced API settings", { exact: true }).first().click();
    await page.getByLabel("Key name").fill(apiKeyName);
    await apiKeys.getByLabel("Where can it work?").selectOption({
      label: moveTitle,
    });
    await apiKeys.getByRole("button", { name: "Create key" }).click();
    await expect(
      page.getByText(/^AI connection created/),
    ).toBeVisible({ timeout: 30_000 });
    const rawApiKey = await page
      .getByLabel("One-time API key secret")
      .inputValue();
    const copyKeyButton = page.getByRole("button", { name: "Copy key" });
    await expect(copyKeyButton).toBeVisible();
    await expect(copyKeyButton).toHaveClass(/bg-emerald-600/);

    const apiReadResponse = await page.request.get(
      `/api/v1/moves/${e2eMoveId}/summary`,
      {
        headers: { authorization: `Bearer ${rawApiKey}` },
      },
    );
    expect(apiReadResponse.status()).toBe(200);
    const apiReadBody = (await apiReadResponse.json()) as {
      data?: { move?: { moveId?: string; title?: string } };
    };
    expect(apiReadBody.data?.move?.moveId).toBe(e2eMoveId);
    expect(apiReadBody.data?.move?.title).toBe(moveTitle);

    const broadApiReadResponse = await page.request.get("/api/v1/moves", {
      headers: { authorization: `Bearer ${rawApiKey}` },
    });
    expect(broadApiReadResponse.status()).toBe(403);

    await page.getByText("Manage existing AI connections", { exact: true }).click();
    const apiKeyRow = page.getByRole("group", {
      name: `AI connection ${apiKeyName}`,
    });
    await expect(apiKeyRow).toBeVisible({ timeout: 30_000 });
    await expect(apiKeyRow.getByText(`Move: ${moveTitle}`)).toBeVisible();
  });

  test.skip("legacy pre-global-workspace product tour", async ({
    context,
    page,
  }) => {
    page.setDefaultTimeout(30_000);
    await setupClerkTestingToken({ context });
    await page.goto("/sign-in");
    await clerk.signIn({ page, emailAddress: e2eUserEmail! });
    await page.waitForFunction(() => window.Clerk?.user !== null);

    await gotoDashboard(page);
    await expect(page.getByRole("main", { name: "Workspace content" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your moves", exact: true })
    ).toBeVisible();
    await waitForWorkspaceAuth(page);
    await cleanupE2eData(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForWorkspaceAuth(page);

    const runId = Date.now().toString(36);
    const requestedHouseholdName = `E2E household ${runId}`;
    const moveTitle = `E2E PCS move ${runId}`;
    const itemName = `E2E road bike ${runId}`;
    const freeItemName = `E2E porch lamp ${runId}`;
    const boxCode = `E2E-${runId.toUpperCase()}`;
    const boxLabel = `E2E bike parts ${runId}`;
    const contactName = `E2E transportation office ${runId}`;
    const publicComment = `E2E pickup note ${runId}`;

    const householdName = await ensureHousehold(page, requestedHouseholdName);

    await page.getByRole("button", { name: "New move" }).first().click();
    await expect(page.getByLabel("Move title")).toBeEnabled({ timeout: 30_000 });
    await page.getByLabel("Move title").fill(moveTitle);
    await page.getByLabel("Move template").selectOption("pcs");
    await page.getByRole("tab", { name: "PCS details" }).click();
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

    // The move-local operations nav reflects the current information
    // architecture. Capture and AI review now live in Queue; inventory and
    // boxes are global workspaces scoped by the selected move.
    const moveOperations = page.getByRole("navigation", {
      name: "Move operations",
    });
    for (const [label, section] of [
      ["Summary", ""],
      ["Configure", "configure"],
      ["Load Plan", "load-plan"],
      ["Plan", "plan"],
      ["Move Day", "move-day"],
      ["Packets", "packets"],
      ["Queue", "queue"],
    ] as const) {
      await expect(
        moveOperations.getByRole("link", { name: label, exact: true })
      ).toHaveAttribute("href", movePath(section));
    }

    // Overview page: move contacts.
    await page.goto(movePath("overview"));
    await page.getByRole("tab", { name: "People" }).click();
    await page.getByRole("tab", { name: "Add contact" }).click();
    await page.getByLabel("Contact name").fill(contactName);
    await page.getByLabel("Contact role").selectOption("contact");
    await page.getByLabel("Contact email").fill(`office-${runId}@example.test`);
    await page.getByLabel("Contact phone").fill("555-0100");
    await page.getByLabel("Contact notes").fill("E2E PCS counseling contact");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByText("Contact added.")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("tab", { name: "Contacts" }).click();
    await page
      .getByRole("button", { name: `Edit ${contactName}` })
      .filter({ visible: true })
      .click();
    await expect(
      page.getByLabel(`Contact name for ${contactName}`).filter({ visible: true })
    ).toBeVisible();
    await page
      .getByLabel(`Contact phone for ${contactName}`)
      .filter({ visible: true })
      .fill("555-0101");
    await page
      .getByRole("button", { name: "Save", exact: true })
      .filter({ visible: true })
      .click();
    await expect(page.getByText(`${contactName} saved.`)).toBeVisible({
      timeout: 30_000,
    });

    // Load Plan page: transport resources.
    await page.goto(movePath("load-plan"));
    await page.getByRole("tab", { name: "Resources", exact: true }).click();
    const transportResources = page
      .getByRole("heading", { name: "Transport resources", exact: true })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    await transportResources
      .getByRole("button", { name: "Add resource" })
      .click();
    await transportResources
      .getByRole("button", { name: /Military movers \/ HHG/ })
      .click();
    await expect(
      transportResources.getByText("Pro gear review").first()
    ).toBeVisible({ timeout: 30_000 });

    // Items is now a global workspace scoped by the selected move.
    await page.goto("/app/items");
    await page
      .getByRole("banner")
      .locator("button:has(svg.lucide-chevrons-up-down)")
      .click();
    await page.getByLabel("Search active moves").fill(moveTitle);
    await page
      .getByRole("button", { name: `Switch to ${moveTitle}` })
      .click();
    await page.getByRole("tab", { name: "Add", exact: true }).click();
    const inventoryManager = page
      .getByLabel("New item name")
      .locator("xpath=ancestor::form[1]");
    await page.getByLabel("New item name").fill(itemName);
    await page.getByLabel("New item room").fill("Garage");
    await page.getByLabel("New item category").fill("Sports");
    await page.getByLabel("New item disposition").selectOption("mover");
    await inventoryManager
      .getByRole("button", { name: "Add", exact: true })
      .click();
    await expect(page.getByLabel("New item name")).toHaveValue("");

    await page.getByLabel("New item name").fill(freeItemName);
    await page.getByLabel("New item room").fill("Porch");
    await page.getByLabel("New item category").fill("Lighting");
    await page.getByLabel("New item disposition").selectOption("free");
    await inventoryManager
      .getByRole("button", { name: "Add", exact: true })
      .click();
    await expect(page.getByLabel("New item name")).toHaveValue("");

    await page.getByRole("tab", { name: /Browse:/ }).click();
    await expect(
      page.getByRole("button", { name: `Open ${itemName}` })
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: `Open ${freeItemName}` })
    ).toBeVisible();
    await page.getByRole("button", { name: `Open ${itemName}` }).click();
    const itemDialog = page.getByRole("dialog", { name: itemName });
    await expect(itemDialog.getByRole("tab", { name: "Details" })).toBeVisible();
    await expect(itemDialog.getByRole("tab", { name: "Evidence" })).toBeVisible();
    await itemDialog.getByRole("button", { name: "Close" }).first().click();

    // Overview page: packing debt reflects the new inventory; archive contact.
    await page.goto(movePath("overview"));
    await page.getByRole("tab", { name: "Readiness" }).click();
    const packingDebt = page.locator("#packing-debt");
    await expect(packingDebt.getByText("Packing debt")).toBeVisible({
      timeout: 30_000,
    });
    await expect(packingDebt).toContainText("Loose load items");

    await page.getByRole("tab", { name: "People" }).click();
    await page.getByRole("tab", { name: "Contacts" }).click();
    await page
      .getByRole("button", { name: `Edit ${contactName}` })
      .filter({ visible: true })
      .click();
    await page
      .getByRole("button", { name: "Archive", exact: true })
      .filter({ visible: true })
      .click();
    await expect(page.getByText(`${contactName} archived.`)).toBeVisible({
      timeout: 30_000,
    });

    // Boxes page: create a box and pack an item.
    await page.goto(movePath("boxes"));
    await page.getByRole("tab", { name: "Add box" }).click();
    const createBoxForm = page.getByRole("form", { name: "Create box" });
    await createBoxForm.getByLabel("New box code").fill(boxCode);
    await createBoxForm.getByLabel("New box label").fill(boxLabel);
    await createBoxForm.getByLabel("New box room").fill("Garage");
    await createBoxForm.getByLabel("New box destination room").fill("Storage");
    await createBoxForm.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("cell", { name: boxCode })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("tab", { name: "Pack contents" }).click();

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
    await loadPlanner.getByRole("tab", { name: "Assign" }).click();
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
    await loadPlanner.getByRole("tab", { name: "Board" }).click();
    await loadPlanner
      .getByRole("button", { name: `Lock assignment for ${boxCode}` })
      .click();
    await expect(
      loadPlanner.getByText(`${boxCode} assignment locked.`)
    ).toBeVisible({ timeout: 30_000 });
    await loadPlanner.getByLabel(`Select ${boxCode}`).check();
    await loadPlanner.getByRole("tab", { name: "Assign" }).click();
    await expect(
      loadPlanner.getByText("1 selected in the current view, 1 locked will be skipped")
    ).toBeVisible();
    await expect(
      loadPlanner.getByRole("button", { name: "Unassign", exact: true })
    ).toBeDisabled();

    // Photos page: evidence tooling renders.
    await page.goto(movePath("photos"));
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
    await page.getByRole("tab", { name: "Add photos" }).click();
    const roomSweep = page
      .getByRole("heading", { name: "Room sweep", exact: true })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    await expect(roomSweep.getByLabel("Room or area")).toBeEnabled({
      timeout: 30_000,
    });
    await expect(roomSweep.getByLabel("Room photo")).toBeEnabled();
    await page.getByRole("tab", { name: "Coverage" }).click();
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
    await expect(
      page.getByRole("tab", { name: "Checklist" })
    ).toBeVisible();

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
    await documentationPackets.getByRole("tab", { name: "Exports" }).click();
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

    await documentationPackets.getByRole("tab", { name: "Share links" }).click();
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

    // Capture page: agent queue surfaces render.
    await page.goto(movePath("capture"));
    await expect(
      page.getByRole("heading", { name: "Capture for your AI agent" })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Directions for your agent")).toBeEnabled();
    await expect(
      page.getByRole("heading", { name: "Agent queue", exact: true })
    ).toBeVisible();

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
      .getByRole("heading", { name: "AI connections", exact: true })
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    const apiKeyHouseholdSelect = apiKeys.getByLabel("Household");
    await expect(apiKeyHouseholdSelect).toBeVisible({
      timeout: 30_000,
    });
    await apiKeyHouseholdSelect.selectOption({ label: `${householdName} (owner)` });
    await expect(
      apiKeys.getByText(`Viewing ${householdName}`)
    ).toBeVisible({ timeout: 30_000 });
    const apiKeyMoveRestriction = apiKeys.getByLabel("Where can it work?");
    await expect(apiKeyMoveRestriction).toBeVisible({ timeout: 30_000 });
    await expect(apiKeyMoveRestriction).toBeEnabled({ timeout: 30_000 });
    await expect(apiKeyMoveRestriction).toContainText(moveTitle, {
      timeout: 30_000,
    });
    const apiKeyName = `E2E local agent ${runId}`;
    await apiKeys.getByText("Advanced API settings").click();
    await apiKeys.getByLabel("Key name").fill(apiKeyName);
    await apiKeyMoveRestriction.selectOption({ label: moveTitle });
    await expect(apiKeys.getByText(`Move: ${moveTitle}`)).toBeVisible({
      timeout: 30_000,
    });
    await apiKeys.getByRole("button", { name: "Create key" }).click();
    await expect(
      apiKeys.getByText(/^AI connection created/)
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
      name: `AI connection ${apiKeyName}`,
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

  test("creates a PCS move and works through every workspace page", async ({
    context,
    page,
  }) => {
    page.setDefaultTimeout(30_000);
    await setupClerkTestingToken({ context });
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await clerk.signIn({ page, emailAddress: e2eUserEmail! });
    await page.waitForFunction(() => window.Clerk?.user !== null);

    await gotoDashboard(page);
    await waitForWorkspaceAuth(page);
    await cleanupE2eData(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForWorkspaceAuth(page);

    const runId = Date.now().toString(36);
    const moveTitle = `E2E current PCS move ${runId}`;
    const itemName = `E2E current road bike ${runId}`;
    const unitName = `E2E current bike parts ${runId}`;
    await ensureHousehold(page, `E2E current household ${runId}`);

    await page.getByRole("button", { name: "New move" }).first().click();
    await page.getByLabel("Move title").fill(moveTitle);
    await page.getByLabel("Move template").selectOption("pcs");
    await page.getByRole("tab", { name: "PCS details" }).click();
    await page.getByLabel("Military branch").selectOption("army");
    await page.getByLabel("PCS shipment type").selectOption("ppm");
    await page.getByRole("button", { name: "Create move" }).click();
    await page.waitForURL(/\/app\/moves\/[^/]+$/, { timeout: 30_000 });
    const moveId = decodeURIComponent(
      new URL(page.url()).pathname.split("/").pop() ?? ""
    );
    expect(moveId).toBeTruthy();
    const movePath = (section: string) =>
      `/app/moves/${encodeURIComponent(moveId)}/${section}`;

    for (const [section, heading] of [
      ["configure", "Configure move"],
      ["load-plan", "Load Plan"],
      ["move-day", "Move Day"],
      ["packets", "Packets"],
      ["queue", "Queue"],
    ] as const) {
      await page.goto(movePath(section));
      await expect(
        page.getByRole("heading", { name: heading, exact: true }).first()
      ).toBeVisible({ timeout: 30_000 });
    }

    await page.goto("/app/items");
    await page
      .getByRole("banner")
      .locator("button:has(svg.lucide-chevrons-up-down)")
      .click();
    await page.getByLabel("Search active moves").fill(moveTitle);
    await page
      .getByRole("button", { name: `Switch to ${moveTitle}` })
      .click();
    await page.getByRole("tab", { name: "Add", exact: true }).click();
    const addItemForm = page
      .getByLabel("New item name")
      .locator("xpath=ancestor::form[1]");
    await addItemForm.getByLabel("New item name").fill(itemName);
    await addItemForm.getByLabel("New item room").fill("Garage");
    await addItemForm.getByLabel("New item category").fill("Sports");
    await addItemForm
      .getByLabel("New item disposition")
      .selectOption("mover");
    await addItemForm.getByRole("button", { name: "Add", exact: true }).click();
    await expect(addItemForm.getByLabel("New item name")).toHaveValue("");
    await page.getByRole("tab", { name: /Browse:/ }).click();
    await expect(
      page.getByRole("button", { name: `Open ${itemName}` })
    ).toBeVisible({ timeout: 30_000 });

    await page.goto("/app/movable-units");
    await page.getByRole("button", { name: "Add unit" }).click();
    const addUnitDialog = page.getByRole("dialog", {
      name: "Add a movable unit",
    });
    await addUnitDialog.getByLabel("Movable unit name").fill(unitName);
    await addUnitDialog.getByLabel("Movable unit room").fill("Garage");
    await addUnitDialog
      .getByRole("button", { name: "Add unit", exact: true })
      .click();
    await expect(
      page.getByText(unitName, { exact: true }).filter({ visible: true })
    ).toBeVisible({ timeout: 30_000 });

    for (const [path, heading] of [
      ["/app/spaces-transport", "Spaces & Transport"],
      ["/app/queue", /^Queue/],
      ["/settings", "Settings"],
    ] as const) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: heading, exact: true }).first()
      ).toBeVisible({ timeout: 30_000 });
    }
  });
});
