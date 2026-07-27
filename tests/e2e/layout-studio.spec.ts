import AxeBuilder from "@axe-core/playwright";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const e2eUserEmail = process.env.E2E_CLERK_USER_EMAIL;
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const safeForMutationQa =
  process.env.CONVEX_DEPLOYMENT?.startsWith("dev:") ||
  process.env.CONVEX_E2E_CLEANUP_ENABLED === "true";
const layoutStudioExposed =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_LAYOUT_STUDIO_CURRENT_DB_QA === "true";
const tinyBlueprintPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

type E2eApiKeyScope =
  | "moves/read"
  | "moves/write"
  | "inventory/read"
  | "inventory/write"
  | "plans/read"
  | "plans/write"
  | "photos/write"
  | "exports/read"
  | "exports/create"
  | "members/manage";

function apiHeaders(rawKey: string, idempotencyKey?: string) {
  return {
    authorization: `Bearer ${rawKey}`,
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
  };
}

async function gotoDashboard(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
}

async function waitForWorkspaceAuth(page: Page) {
  await expect(
    page.getByRole("main", { name: "Workspace content" }),
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible({
    timeout: 30_000,
  });
}

async function ensureHousehold(page: Page, householdName: string) {
  const client = await convexClientForPage(page);
  const existingHouseholds = await client.query(api.households.listMine, {});
  if (existingHouseholds.length > 0) {
    return existingHouseholds[0]!.household._id;
  }

  const householdInput = page.getByLabel("Household name");
  const createHousehold = page.getByRole("button", {
    name: "Create household",
  });

  await expect(householdInput).toBeVisible({ timeout: 30_000 });
  await householdInput.fill(householdName);
  await expect(createHousehold).toBeEnabled({ timeout: 30_000 });
  await createHousehold.click();
  await expect(page.getByRole("status")).toContainText("Household created", {
    timeout: 30_000,
  });

  await expect
    .poll(async () => (await client.query(api.households.listMine, {})).length)
    .toBeGreaterThan(0);
  const households = await client.query(api.households.listMine, {});
  return households[0]!.household._id;
}

async function cleanupE2eData(page: Page) {
  if (!convexUrl || !page.url().startsWith("http")) {
    return;
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
    return;
  }

  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(token);
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const result = await client.mutation(
      api.testSupport.cleanupE2eDataForCurrentUser,
      { batchSize: 10 },
    );
    if (!result.mayHaveMore) {
      return;
    }
  }
  throw new Error("E2E cleanup did not finish after 25 batches.");
}

async function convexClientForPage(page: Page) {
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is required.");
  }
  const token = await page.evaluate(async () => {
    const session = window.Clerk?.session;
    if (!session) {
      return null;
    }
    const defaultToken = await session.getToken().catch(() => null);
    if (defaultToken) {
      return defaultToken;
    }
    return (await session.getToken({ template: "convex" }).catch(() => null)) ?? null;
  });
  if (!token) {
    throw new Error("Could not read Convex auth token from Clerk session.");
  }
  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(token);
  return client;
}

async function createPlanApiKey({
  client,
  householdId,
  moveId,
  name,
  scopes,
}: {
  client: Awaited<ReturnType<typeof convexClientForPage>>;
  householdId: Id<"households">;
  moveId: Id<"moves">;
  name: string;
  scopes: E2eApiKeyScope[];
}) {
  const result = await client.mutation(api.apiKeys.create, {
    householdId,
    moveId,
    name,
    scopes,
  });
  expect(result.rawKey).toMatch(/^mmk_/);
  return result.rawKey;
}

async function createE2eMove(page: Page, prefix: string) {
  const runId = Date.now().toString(36);
  const householdName = `E2E ${prefix} household ${runId}`;
  const moveTitle = `E2E ${prefix} move ${runId}`;

  const householdId = await ensureHousehold(page, householdName);
  await page.getByRole("button", { name: "New move" }).first().click();
  await expect(page.getByLabel("Move title")).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Move title").fill(moveTitle);
  await page.getByLabel("Move template").selectOption("local");
  await page.getByRole("button", { name: "Create move" }).click();
  await page.waitForURL(/\/app\/moves\/[^/]+$/, { timeout: 30_000 });

  const moveId = decodeURIComponent(
    new URL(page.url()).pathname.split("/").pop() ?? "",
  ) as Id<"moves">;
  expect(moveId).toBeTruthy();

  return { householdId, moveId };
}

async function signInCleanAndOpenDashboard({
  context,
  page,
}: {
  context: Parameters<typeof setupClerkTestingToken>[0]["context"];
  page: Page;
}) {
  await setupClerkTestingToken({ context });
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await clerk.signIn({ page, emailAddress: e2eUserEmail! });
  await page.waitForFunction(() => window.Clerk?.user !== null);

  await gotoDashboard(page);
  await waitForWorkspaceAuth(page);
  await cleanupE2eData(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForWorkspaceAuth(page);
}

async function canvasPoint(
  page: Page,
  x: number,
  y: number,
  canvasName = "Main floor plan",
) {
  const canvas = page.getByRole("img", { name: canvasName });
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error(`${canvasName} canvas was not visible.`);
  }
  const viewBox = await canvas.evaluate((element) =>
    element.getAttribute("viewBox"),
  );
  const [viewX, viewY, viewWidth, viewHeight] = String(viewBox)
    .split(/\s+/)
    .map(Number);
  return {
    x: box.x + ((x - viewX) / viewWidth) * box.width,
    y: box.y + ((y - viewY) / viewHeight) * box.height,
  };
}

async function clickCanvasPoint(
  page: Page,
  x: number,
  y: number,
  canvasName = "Main floor plan",
) {
  const point = await canvasPoint(page, x, y, canvasName);
  await page.mouse.click(point.x, point.y);
}

async function clickCanvasFraction(
  page: Page,
  xRatio: number,
  yRatio: number,
  canvasName = "Main floor plan",
) {
  const canvas = page.getByRole("img", { name: canvasName });
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error(`${canvasName} canvas was not visible.`);
  }
  await canvas.click({
    position: {
      x: box.width * xRatio,
      y: box.height * yRatio,
    },
  });
}

async function dragCanvasPoints(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
  canvasName?: string,
) {
  const startPoint = await canvasPoint(page, start.x, start.y, canvasName);
  const endPoint = await canvasPoint(page, end.x, end.y, canvasName);
  await page.mouse.move(startPoint.x, startPoint.y);
  await page.mouse.down();
  await page.mouse.move(endPoint.x, endPoint.y, { steps: 8 });
  await page.mouse.up();
}

test.describe("Layout Studio authenticated smoke", () => {
  test.setTimeout(120_000);

  test.skip(
    !e2eUserEmail || !convexUrl || !safeForMutationQa || !layoutStudioExposed,
    "Set E2E_CLERK_USER_EMAIL plus a dev Convex target or explicit current-DB QA cleanup opt-in, and expose Layout Studio in the tested build.",
  );

  test.afterEach(async ({ page }, testInfo) => {
    try {
      await cleanupE2eData(page);
    } catch (error) {
      if (testInfo.status === testInfo.expectedStatus) {
        throw error;
      }
      console.warn("Layout Studio E2E cleanup failed after a failed test.", error);
    }
  });

  test("seeds the example home, renders labels, and passes axe", async ({
    browserName,
    context,
    page,
  }) => {
    if (browserName === "chromium") {
      await context.grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: "http://localhost:3827",
      });
    }
    await signInCleanAndOpenDashboard({ context, page });
    const { moveId } = await createE2eMove(page, "layout");

    await page.goto(`/app/moves/${encodeURIComponent(moveId)}/plan`);
    await expect(
      page.getByRole("heading", { name: "Layout Studio", exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "Start the destination plan" }),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Load example home" }).click();
    await expect(page.getByText("Living room")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("192 sq ft")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Example room")).toBeVisible({ timeout: 30_000 });

    const roomShape = page.getByRole("button", { name: /Select R\d+ — Living room/ });
    await roomShape.focus();
    await roomShape.press("Enter");
    const roomChip = page.locator('svg [aria-label^="Copy R"]').first();
    await expect(roomChip).toBeVisible({ timeout: 30_000 });
    await expect(roomChip).toHaveAttribute(
      "aria-label",
      /^Copy R\d+ — Living room$/,
    );
    await roomChip.click();
    await roomChip.focus();
    await roomChip.press("Enter");
    if (browserName === "chromium") {
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toMatch(/^R\d+ — Living room$/);
    }

    await page.getByRole("button", { name: /Yard outdoor/ }).click();
    await expect(page.getByText("Driveway")).toBeVisible({ timeout: 30_000 });

    const results = await new AxeBuilder({ page })
      .exclude(".cl-userButtonPopoverCard")
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("draws a wall, room, and door through canvas mouse gestures", async ({
    context,
    page,
  }) => {
    await signInCleanAndOpenDashboard({ context, page });
    const { householdId, moveId } = await createE2eMove(page, "layout draw");
    const client = await convexClientForPage(page);

    await page.goto(`/app/moves/${encodeURIComponent(moveId)}/plan`);
    await page.getByRole("button", { name: "Create plan" }).click();
    await expect(page.getByRole("img", { name: "Main floor plan" })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "Wall (W)" }).click();
    await clickCanvasPoint(page, -60, -60);
    await clickCanvasPoint(page, 60, -60);
    await expect(page.getByText("Wall added. Click again to continue the chain."))
      .toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Room rectangle (R)" }).click();
    await dragCanvasPoints(page, { x: -48, y: -48 }, { x: 84, y: 60 });
    await expect(page.getByText("Room added.")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Opening (D)" }).click();
    await clickCanvasPoint(page, 0, -60);
    await expect(page.getByText("door added.")).toBeVisible({ timeout: 30_000 });

    await expect
      .poll(
        async () => {
          const document = await client.query(api.floorPlans.getActiveDocumentForMove, {
            householdId,
            moveId,
          });
          return {
            walls:
              document?.entities.filter((entity) => entity.entityType === "wall")
                .length ?? 0,
            rooms:
              document?.entities.filter((entity) => entity.entityType === "room")
                .length ?? 0,
            doors:
              document?.entities.filter(
                (entity) =>
                  entity.entityType === "opening" && entity.opening?.kind === "door",
              ).length ?? 0,
            opCount: document?.entities.length ?? 0,
          };
        },
        { timeout: 30_000 },
      )
      .toEqual({ walls: 1, rooms: 1, doors: 1, opCount: 3 });
  });

  test("places an inventory item from the tray onto the canvas", async ({
    context,
    page,
  }) => {
    await signInCleanAndOpenDashboard({ context, page });
    const { householdId, moveId } = await createE2eMove(page, "layout item");
    const client = await convexClientForPage(page);
    const itemName = `E2E floor lamp ${Date.now().toString(36)}`;

    await page.goto(`/app/moves/${encodeURIComponent(moveId)}/inventory`);
    await page.getByLabel("New item name").fill(itemName);
    await page.getByLabel("New item room").fill("Living room");
    await page.getByLabel("New item category").fill("Lighting");
    await page.getByLabel("New item disposition").selectOption("mover");
    await page.locator("#inventory").getByRole("button", { name: "Add" }).click();
    await expect(page.getByLabel(`Status for ${itemName}`)).toBeVisible({
      timeout: 30_000,
    });

    await page.goto(`/app/moves/${encodeURIComponent(moveId)}/plan`);
    await page.getByRole("button", { name: "Create plan" }).click();
    await expect(page.getByRole("img", { name: "Main floor plan" })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "items" }).click();
    const trayItem = page.getByRole("button", { name: new RegExp(itemName) });
    await expect(trayItem).toBeVisible({ timeout: 30_000 });

    await trayItem.click();
    await expect(page.getByText(`Drop ${itemName}`)).toBeVisible({
      timeout: 30_000,
    });
    await clickCanvasPoint(page, 12, 12);

    await expect(page.getByText(`${itemName} placed.`)).toBeVisible({
      timeout: 30_000,
    });
    await expect
      .poll(
        async () => {
          const [document, items] = await Promise.all([
            client.query(api.floorPlans.getActiveDocumentForMove, {
              householdId,
              moveId,
            }),
            client.query(api.items.listForMove, {
              householdId,
              moveId,
            }),
          ]);
          const item = items.find((entry) => entry.name === itemName);
          const placement = item
            ? document?.placements.find((entry) => entry.itemId === item._id)
            : undefined;
          return placement
            ? {
                hasItemSource: placement.itemId === item?._id,
                measured: Boolean(placement.footprintOverrideIn),
              }
            : null;
        },
        { timeout: 30_000 },
      )
      .toEqual({
        hasItemSource: true,
        measured: false,
      });
  });

  test("uploads and calibrates a blueprint underlay", async ({
    browserName,
    context,
    page,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Blueprint upload exercises shared storage/browser behavior once on desktop.",
    );

    await signInCleanAndOpenDashboard({ context, page });
    const { householdId, moveId } = await createE2eMove(page, "layout underlay");
    const client = await convexClientForPage(page);

    await page.goto(`/app/moves/${encodeURIComponent(moveId)}/plan`);
    await page.getByRole("button", { name: "Create plan" }).click();
    await expect(page.getByRole("img", { name: "Main floor plan" })).toBeVisible({
      timeout: 30_000,
    });

    const underlayPanel = page
      .getByRole("heading", { name: "Blueprint underlay", exact: true })
      .locator("xpath=ancestor::div[contains(@class,'rounded-md')][1]");
    await underlayPanel.getByLabel("Upload blueprint").setInputFiles({
      name: "e2e-blueprint.png",
      mimeType: "image/png",
      buffer: tinyBlueprintPng,
    });
    await underlayPanel.getByLabel("Photo caption").fill("E2E blueprint");
    await underlayPanel.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(underlayPanel.getByText("Photo uploaded.")).toBeVisible({
      timeout: 60_000,
    });
    await expect(underlayPanel.getByText("E2E blueprint")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      underlayPanel.getByRole("button", { name: "Calibrating" }),
    ).toBeVisible({ timeout: 30_000 });

    page.once("dialog", (dialog) => void dialog.accept("120"));
    await clickCanvasPoint(page, 0, 0);
    await expect(page.getByText("Pick the second calibration point.")).toBeVisible({
      timeout: 30_000,
    });
    await clickCanvasPoint(page, 120, 0);
    await expect(page.getByText(/Blueprint calibrated to/)).toBeVisible({
      timeout: 30_000,
    });

    await expect
      .poll(
        async () => {
          const document = await client.query(api.floorPlans.getActiveDocumentForMove, {
            householdId,
            moveId,
          });
          const mainLevel = document?.levels.find(
            (level) => level.name === "Main floor",
          );
          const underlayPhoto = document?.underlayPhotos.find(
            (photo) => photo._id === mainLevel?.underlay?.photoId,
          );
          return mainLevel?.underlay && underlayPhoto
            ? {
                caption: underlayPhoto.caption,
                opacity: mainLevel.underlay.opacity,
                rotationDeg: mainLevel.underlay.rotationDeg,
                scaleRounded: Math.round(mainLevel.underlay.scaleInPerPx),
              }
            : null;
        },
        { timeout: 30_000 },
      )
      .toEqual({
        caption: "E2E blueprint",
        opacity: 0.3,
        rotationDeg: 0,
        scaleRounded: 120,
      });
  });

  test("contains a placement inside another placement from the canvas chooser", async ({
    context,
    page,
  }) => {
    await signInCleanAndOpenDashboard({ context, page });
    const { householdId, moveId } = await createE2eMove(page, "layout contain");
    const client = await convexClientForPage(page);

    await page.goto(`/app/moves/${encodeURIComponent(moveId)}/plan`);
    await page.getByRole("button", { name: "Create plan" }).click();
    await expect(page.getByRole("img", { name: "Main floor plan" })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: /dresser/i }).click();
    await expect(page.getByText("Drop Dresser")).toBeVisible({
      timeout: 30_000,
    });
    await clickCanvasPoint(page, 0, 0);
    await expect(page.getByText("Dresser placed.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.locator('svg [aria-label^="Copy P"][aria-label$="— Dresser"]').first(),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /nightstand/i }).click();
    await expect(page.getByText("Drop Nightstand")).toBeVisible({
      timeout: 30_000,
    });
    await clickCanvasPoint(page, 0, 0);
    const nightstandOffer = page.getByText(/Nightstand to P\d+/);
    const offerVisible = await nightstandOffer
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    if (offerVisible) {
      const insideChoice = page.getByRole("button", { name: "Inside", exact: true });
      await insideChoice.focus();
      await insideChoice.press("Enter");
    } else {
      await expect(page.getByText("Nightstand placed.")).toBeVisible({
        timeout: 30_000,
      });
      const moveIntoPlacement = page.getByLabel("Move placement into another placement");
      await expect(moveIntoPlacement).toBeEnabled({ timeout: 30_000 });
      const dresserParentValue = await moveIntoPlacement.evaluate((element) => {
        const select = element as HTMLSelectElement;
        return (
          Array.from(select.options).find((option) =>
            option.textContent?.includes("Dresser"),
          )?.value ?? ""
        );
      });
      expect(dresserParentValue).toBeTruthy();
      await moveIntoPlacement.selectOption(dresserParentValue);
    }

    await expect
      .poll(
        async () => {
          const document = await client.query(api.floorPlans.getActiveDocumentForMove, {
            householdId,
            moveId,
          });
          const parent = document?.placements.find(
            (placement) => placement.templateKey === "dresser",
          );
          const child = document?.placements.find(
            (placement) => placement.templateKey === "nightstand",
          );
          return parent && child
            ? {
                childMode: child.containmentMode,
                childParentMatches: child.parentPlacementId === parent._id,
              }
            : null;
        },
        { timeout: 30_000 },
      )
      .toEqual({
        childMode: "inside",
        childParentMatches: true,
      });
    await expect(page.getByLabel(/1 contained placements, 1 total/)).toBeVisible({
      timeout: 30_000,
    });
  });

  test("creates a REST proposal with scoped keys and accepts it in the browser", async ({
    browserName,
    context,
    page,
  }, testInfo) => {
    type McpApiModule = {
      plansList: (
        config: { baseUrl: string; apiKey: string },
        input: Record<string, unknown>,
      ) => Promise<{ data?: Array<{ planId?: string }> }>;
      planGet: (
        config: { baseUrl: string; apiKey: string },
        input: Record<string, unknown>,
      ) => Promise<{ plan?: { planId?: string }; pendingProposalCount?: number }>;
      planSummary: (
        config: { baseUrl: string; apiKey: string },
        input: Record<string, unknown>,
      ) => Promise<{ planId?: string; summary?: string }>;
      planApplyOps: (
        config: { baseUrl: string; apiKey: string },
        input: Record<string, unknown>,
      ) => Promise<{ data?: unknown }>;
      planProposeOps: (
        config: { baseUrl: string; apiKey: string },
        input: Record<string, unknown>,
      ) => Promise<{ data?: { proposalId?: string } }>;
      planSnapshot: (
        config: { baseUrl: string; apiKey: string },
        input: Record<string, unknown>,
      ) => Promise<string>;
    };
    const mcpApi = (await import(
      "../../mcp-server/movingmanifest-api.mjs"
    )) as McpApiModule;
    test.skip(
      browserName !== "chromium",
      "REST/proposal acceptance is covered once on desktop; mobile layout is covered by canvas E2E.",
    );

    await signInCleanAndOpenDashboard({ context, page });
    const { householdId, moveId } = await createE2eMove(page, "layout api");
    const client = await convexClientForPage(page);
    const runId = Date.now().toString(36);
    const blockedMoveId = await client.mutation(api.moves.create, {
      householdId,
      title: `E2E layout api blocked move ${runId}`,
      type: "local",
    });

    await page.goto(`/app/moves/${encodeURIComponent(moveId)}/plan`);
    await page.getByRole("button", { name: "Create plan" }).click();
    await expect(page.getByRole("img", { name: "Main floor plan" })).toBeVisible({
      timeout: 30_000,
    });

    const document = await client.query(api.floorPlans.getActiveDocumentForMove, {
      householdId,
      moveId,
    });
    expect(document).toBeTruthy();
    const planId = document!.plan._id;
    const levelId = document!.levels[0]?._id;
    expect(levelId).toBeTruthy();

    const readOnlyKey = await createPlanApiKey({
      client,
      householdId,
      moveId,
      name: `E2E Layout Studio read key ${runId}`,
      scopes: ["plans/read"],
    });
    const writeKey = await createPlanApiKey({
      client,
      householdId,
      moveId,
      name: `E2E Layout Studio write key ${runId}`,
      scopes: ["plans/read", "plans/write"],
    });

    const planList = await page.request.get(
      `/api/v1/plans?moveId=${encodeURIComponent(moveId)}`,
      { headers: apiHeaders(readOnlyKey) },
    );
    expect(planList.status()).toBe(200);
    const planListBody = (await planList.json()) as {
      data?: Array<{ planId?: string }>;
    };
    expect(planListBody.data?.some((entry) => entry.planId === planId)).toBe(true);

    const blockedMoveList = await page.request.get(
      `/api/v1/plans?moveId=${encodeURIComponent(blockedMoveId)}`,
      { headers: apiHeaders(writeKey) },
    );
    expect(blockedMoveList.status()).toBe(403);

    const proposalBody = {
      batchId: `e2e-rest-proposal-${runId}`,
      agentLabel: "E2E REST agent",
      reasoning: "Add one harmless annotation so proposal review can be accepted.",
      ops: [
        {
          type: "createEntity",
          entity: {
            levelId,
            entityType: "annotation",
            annotation: {
              x: 24,
              y: 24,
              text: "E2E REST proposal note",
              fontSizeIn: 6,
            },
          },
        },
      ],
    };
    const readOnlyWrite = await page.request.post(
      `/api/v1/plans/${encodeURIComponent(planId)}/proposals?moveId=${encodeURIComponent(moveId)}`,
      {
        headers: apiHeaders(readOnlyKey, `e2e-readonly-denied-${runId}`),
        data: proposalBody,
      },
    );
    expect(readOnlyWrite.status()).toBe(403);

    const idempotencyKey = `e2e-rest-proposal-${runId}`;
    const proposalResponse = await page.request.post(
      `/api/v1/plans/${encodeURIComponent(planId)}/proposals?moveId=${encodeURIComponent(moveId)}`,
      {
        headers: apiHeaders(writeKey, idempotencyKey),
        data: proposalBody,
      },
    );
    expect(proposalResponse.status()).toBe(201);
    const proposal = (await proposalResponse.json()) as {
      data?: { proposalId?: string };
    };
    const proposalId = proposal.data?.proposalId;
    expect(proposalId).toBeTruthy();

    const duplicateProposalResponse = await page.request.post(
      `/api/v1/plans/${encodeURIComponent(planId)}/proposals?moveId=${encodeURIComponent(moveId)}`,
      {
        headers: apiHeaders(writeKey, idempotencyKey),
        data: proposalBody,
      },
    );
    expect(duplicateProposalResponse.status()).toBe(201);
    const duplicateProposal = (await duplicateProposalResponse.json()) as {
      data?: { proposalId?: string };
    };
    expect(duplicateProposal.data?.proposalId).toBe(proposalId);

    const idempotencyConflict = await page.request.post(
      `/api/v1/plans/${encodeURIComponent(planId)}/proposals?moveId=${encodeURIComponent(moveId)}`,
      {
        headers: apiHeaders(writeKey, idempotencyKey),
        data: {
          ...proposalBody,
          reasoning: "Changed request body should conflict for the same key.",
        },
      },
    );
    expect(idempotencyConflict.status()).toBe(409);

    const proposalsList = await page.request.get(
      `/api/v1/plans/${encodeURIComponent(planId)}/proposals?moveId=${encodeURIComponent(moveId)}`,
      { headers: apiHeaders(readOnlyKey) },
    );
    expect(proposalsList.status()).toBe(200);
    const proposalsListBody = (await proposalsList.json()) as {
      data?: Array<{ proposalId?: string }>;
    };
    expect(
      proposalsListBody.data?.some((entry) => entry.proposalId === proposalId),
    ).toBe(true);

    const snapshotResponse = await page.request.get(
      `/api/v1/plans/${encodeURIComponent(planId)}/snapshot.svg?moveId=${encodeURIComponent(moveId)}&level=${encodeURIComponent(levelId!)}`,
      { headers: apiHeaders(readOnlyKey) },
    );
    expect(snapshotResponse.status()).toBe(200);
    expect(snapshotResponse.headers()["content-type"]).toContain("image/svg+xml");
    await expect(snapshotResponse.text()).resolves.toContain("<svg");

    await page.goto(`/app/moves/${encodeURIComponent(moveId)}/plan`);
    await expect(page.getByText("E2E REST agent")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByLabel("Create annotation")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Apply all" }).click();

    await expect
      .poll(
        async () => {
          const updated = await client.query(api.floorPlans.getActiveDocumentForMove, {
            householdId,
            moveId,
          });
          return Boolean(
            updated?.entities.some(
              (entity) =>
                entity.entityType === "annotation" &&
                entity.annotation?.text === "E2E REST proposal note",
            ),
          );
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    await expect(page.getByText("Reviewed history")).toBeVisible({
      timeout: 30_000,
    });

    const mcpConfig = {
      baseUrl: "http://localhost:3827/api/v1",
      apiKey: writeKey,
    };
    const mcpTranscript: Array<Record<string, unknown>> = [];
    const mcpList = await mcpApi.plansList(mcpConfig, { moveId });
    expect(mcpList.data?.some((entry) => entry.planId === planId)).toBe(true);
    mcpTranscript.push({ tool: "plans_list", planCount: mcpList.data?.length ?? 0 });

    const mcpDocument = await mcpApi.planGet(mcpConfig, { planId, moveId });
    expect(mcpDocument.plan?.planId).toBe(planId);
    mcpTranscript.push({
      tool: "plan_get",
      levelCount: document!.levels.length,
      pendingProposalCount: mcpDocument.pendingProposalCount,
    });

    const mcpSummary = await mcpApi.planSummary(mcpConfig, { planId, moveId });
    expect(mcpSummary.planId).toBe(planId);
    expect(mcpSummary.summary).toContain("Destination plan");
    mcpTranscript.push({
      tool: "plan_summary",
      containsDestinationPlan: mcpSummary.summary?.includes("Destination plan"),
    });

    const directApplyOps = [
      {
        type: "createEntity",
        entity: {
          levelId,
          entityType: "annotation",
          annotation: {
            x: 48,
            y: 48,
            text: "E2E MCP direct note",
            fontSizeIn: 6,
          },
        },
      },
    ];
    const directApplyInput = {
      planId,
      moveId,
      batchId: `e2e-mcp-apply-${runId}`,
      agentLabel: "E2E MCP agent",
      idempotencyKey: `e2e-mcp-apply-${runId}`,
      ops: directApplyOps,
    };
    const mcpApply = await mcpApi.planApplyOps(mcpConfig, directApplyInput);
    const mcpApplyAgain = await mcpApi.planApplyOps(mcpConfig, directApplyInput);
    expect(mcpApplyAgain).toEqual(mcpApply);
    await expect
      .poll(
        async () => {
          const updated = await client.query(api.floorPlans.getActiveDocumentForMove, {
            householdId,
            moveId,
          });
          return (
            updated?.entities.filter(
              (entity) =>
                entity.entityType === "annotation" &&
                entity.annotation?.text === "E2E MCP direct note",
            ).length ?? 0
          );
        },
        { timeout: 30_000 },
      )
      .toBe(1);
    mcpTranscript.push({ tool: "plan_apply_ops", idempotentDuplicateCount: 1 });

    const mcpProposal = await mcpApi.planProposeOps(mcpConfig, {
      planId,
      moveId,
      batchId: `e2e-mcp-proposal-${runId}`,
      agentLabel: "E2E MCP proposal agent",
      reasoning: "Create a pending proposal through the MCP wrapper.",
      idempotencyKey: `e2e-mcp-proposal-${runId}`,
      ops: [
        {
          type: "createEntity",
          entity: {
            levelId,
            entityType: "annotation",
            annotation: {
              x: 72,
              y: 72,
              text: "E2E MCP pending proposal note",
              fontSizeIn: 6,
            },
          },
        },
      ],
    });
    expect(mcpProposal.data?.proposalId).toBeTruthy();
    mcpTranscript.push({
      tool: "plan_propose_ops",
      proposalCreated: Boolean(mcpProposal.data?.proposalId),
    });

    const mcpSnapshot = await mcpApi.planSnapshot(mcpConfig, {
      planId,
      moveId,
      levelId,
    });
    expect(mcpSnapshot).toContain("<svg");
    mcpTranscript.push({
      tool: "plan_snapshot",
      containsSvg: mcpSnapshot.includes("<svg"),
    });
    await testInfo.attach("layout-studio-mcp-transcript.json", {
      body: JSON.stringify(mcpTranscript, null, 2),
      contentType: "application/json",
    });
  });

  test("opens a public plan share link and creates a print pack", async ({
    browserName,
    browser,
    context,
    page,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Share/print acceptance is covered once on desktop; public viewer responsiveness is unit-covered.",
    );

    await signInCleanAndOpenDashboard({ context, page });
    const { householdId, moveId } = await createE2eMove(page, "layout share");
    const client = await convexClientForPage(page);

    await page.goto(`/app/moves/${encodeURIComponent(moveId)}/plan`);
    await page.getByRole("button", { name: "Create plan" }).click();
    await expect(page.getByRole("img", { name: "Main floor plan" })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Load example" }).click();
    await expect(page.getByText("Living room")).toBeVisible({ timeout: 30_000 });

    const share = await client.action(api.shareLinks.create, {
      householdId,
      moveId,
      scope: "move",
      label: "E2E unload plan",
      role: "guest",
      allowedActions: ["viewPlan"],
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
    expect(share.token).toBeTruthy();

    const publicContext = await browser.newContext();
    try {
      const publicPage = await publicContext.newPage();
      await publicPage.goto(
        `http://localhost:3827/share/${encodeURIComponent(share.token)}`,
      );
      await expect(publicPage.getByText("MovingManifest plan")).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        publicPage.getByRole("heading", { name: "Destination plan" }),
      ).toBeVisible({ timeout: 30_000 });
      const publicLivingRoom = publicPage.getByRole("button", {
        name: /Living room/,
      });
      await expect(publicLivingRoom).toBeVisible({ timeout: 30_000 });
      await publicLivingRoom.click();
      await expect(publicPage.getByText("No unload rows.")).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await publicContext.close();
    }

    const floorPlanPrint = await client.mutation(api.exports.createFloorPlanPrint, {
      householdId,
      moveId,
    });
    expect(floorPlanPrint.levelCount).toBe(2);
    expect(floorPlanPrint.roomCount).toBe(1);

    const jobs = await client.query(api.exports.listForMove, {
      householdId,
      moveId,
      limit: 5,
    });
    const floorPlanJob = jobs.find((job) => job.type === "floorPlan");
    expect(floorPlanJob?.exportJobId).toBeTruthy();
    expect(floorPlanJob?.rowCount).toBe(1);
    const artifact = await client.query(api.exports.getArtifact, {
      householdId,
      moveId,
      exportJobId: floorPlanJob!.exportJobId,
    });
    expect(artifact.mimeType).toContain("html");
    expect(artifact.artifactText).toContain("Destination plan");
    expect(artifact.artifactText).toContain("Living room");
    expect(artifact.artifactText).toContain(
      "Hidden from this pack: blueprint underlay, values, private notes, free-text annotations.",
    );
    expect(artifact.artifactText).not.toContain("scaleInPerPx");
    expect(artifact.artifactText).not.toContain("photoId");
  });

  test("stamps outdoor features and contains Yard placements", async ({
    context,
    page,
  }) => {
    await signInCleanAndOpenDashboard({ context, page });
    const { householdId, moveId } = await createE2eMove(page, "layout yard");
    const client = await convexClientForPage(page);

    await page.goto(`/app/moves/${encodeURIComponent(moveId)}/plan`);
    await page.getByRole("button", { name: "Create plan" }).click();
    await expect(page.getByRole("img", { name: "Main floor plan" })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: /Yard outdoor/ }).click();
    await expect(page.getByRole("img", { name: "Yard plan" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText("Driveways, sheds, and where the trampoline lands."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Feature" }).click();
    await expect(page.getByText("Click to stamp the selected feature.")).toBeVisible({
      timeout: 30_000,
    });
    const featureKind = page.getByLabel("Feature kind");
    for (const [kind, xRatio, yRatio] of [
      ["shed", 0.3, 0.3],
      ["vehicle", 0.45, 0.3],
      ["rv", 0.3, 0.58],
      ["trailer", 0.45, 0.58],
      ["fence", 0.38, 0.78],
    ] as const) {
      await page.getByRole("button", { name: "Feature" }).click();
      await featureKind.selectOption(kind);
      await expect(featureKind).toHaveValue(kind);
      await clickCanvasFraction(page, xRatio, yRatio, "Yard plan");
      await expect(page.getByText(`${kind} stamped.`)).toBeVisible({
        timeout: 30_000,
      });
    }

    await page.getByRole("button", { name: /bookshelf/i }).click();
    await expect(page.getByText("Drop Bookshelf")).toBeVisible({
      timeout: 30_000,
    });
    await clickCanvasPoint(page, 0, 0, "Yard plan");
    await expect(page.getByText("Bookshelf placed.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.locator('svg [aria-label^="Copy P"][aria-label$="— Bookshelf"]').first(),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /nightstand/i }).click();
    await expect(page.getByText("Drop Nightstand")).toBeVisible({
      timeout: 30_000,
    });
    await clickCanvasPoint(page, 0, 0, "Yard plan");
    const nightstandOffer = page.getByText(/Nightstand to P\d+/);
    const offerVisible = await nightstandOffer
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    if (offerVisible) {
      const insideChoice = page.getByRole("button", { name: "Inside", exact: true });
      await insideChoice.focus();
      await insideChoice.press("Enter");
    } else {
      await expect(page.getByText("Nightstand placed.")).toBeVisible({
        timeout: 30_000,
      });
      const moveIntoPlacement = page.getByLabel("Move placement into another placement");
      await expect(moveIntoPlacement).toBeEnabled({ timeout: 30_000 });
      const bookshelfParentValue = await moveIntoPlacement.evaluate((element) => {
        const select = element as HTMLSelectElement;
        return (
          Array.from(select.options).find((option) =>
            option.textContent?.includes("Bookshelf"),
          )?.value ?? ""
        );
      });
      expect(bookshelfParentValue).toBeTruthy();
      await moveIntoPlacement.selectOption(bookshelfParentValue);
    }

    await expect
      .poll(
        async () => {
          const document = await client.query(api.floorPlans.getActiveDocumentForMove, {
            householdId,
            moveId,
          });
          const yardLevel = document?.levels.find((level) => level.name === "Yard");
          const featureSummary =
            document?.entities
              .filter(
                (entity) =>
                  entity.levelId === yardLevel?._id && entity.entityType === "feature",
              )
              .map((entity) => ({
                kind: entity.feature?.featureKind,
                width: entity.feature?.widthIn,
                depth: entity.feature?.depthIn,
                height: entity.feature?.heightIn,
              }))
              .sort((a, b) => String(a.kind).localeCompare(String(b.kind))) ?? [];
          const parent = document?.placements.find(
            (placement) =>
              placement.levelId === yardLevel?._id && placement.templateKey === "bookshelf",
          );
          const child = document?.placements.find(
            (placement) =>
              placement.levelId === yardLevel?._id && placement.templateKey === "nightstand",
          );
          return {
            features: featureSummary,
            childMode: child?.containmentMode,
            childParentMatches:
              Boolean(parent && child) && child?.parentPlacementId === parent?._id,
          };
        },
        { timeout: 30_000 },
      )
      .toEqual({
        features: [
          { kind: "fence", width: 96, depth: 2, height: 60 },
          { kind: "rv", width: 312, depth: 96, height: 132 },
          { kind: "shed", width: 96, depth: 120, height: 96 },
          { kind: "trailer", width: 192, depth: 84, height: 96 },
          { kind: "vehicle", width: 180, depth: 70, height: 60 },
        ],
        childMode: "inside",
        childParentMatches: true,
      });
    await expect(page.getByLabel(/1 contained placements, 1 total/)).toBeVisible({
      timeout: 30_000,
    });
  });
});
