import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { deflateSync } from "node:zlib";

import { api } from "../../convex/_generated/api";

const e2eUserEmail = process.env.E2E_CLERK_USER_EMAIL;
const e2eCleanupMaxBatches = 25;
const photoUploadSmokeOrigin = "http://localhost:3827";

test.describe("mobile movable-unit workflow", () => {
  test.setTimeout(180_000);

  test.skip(
    !e2eUserEmail,
    "Set E2E_CLERK_USER_EMAIL to run signed-in MovingManifest product flows.",
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

  test("opens a rough box from the load plan and records contents inside that same box", async ({
    context,
    page,
  }) => {
    assertConvexDeploymentUrlMatches();
    expect(
      `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3827"}`,
      "The real browser photo upload smoke must run on the local origin allowed by bucket CORS. Use PLAYWRIGHT_PORT=3827 or update storage CORS before running this test.",
    ).toBe(photoUploadSmokeOrigin);

    await setupClerkTestingToken({ context });
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await clerk.signIn({ page, emailAddress: e2eUserEmail! });
    await page.waitForFunction(() => window.Clerk?.user !== null);

    await gotoDashboard(page);
    await waitForWorkspaceAuth(page);
    await cleanupE2eData(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForWorkspaceAuth(page);

    const runStamp = Date.now();
    const runId = runStamp.toString(36);
    const householdName = `E2E movable unit household ${runId}`;
    const moveTitle = `E2E movable unit move ${runId}`;
    const boxCode = `MOB-${String(runStamp).slice(-8)}`;
    const boxLabel = `mobile garage hardware ${runId}`;
    const contentName = `spring clamps ${runId}`;
    const photoContentName = `photo router bits ${runId}`;

    await ensureHousehold(page, householdName);
    await createMove(page, moveTitle);

    await page.waitForURL(/\/app\/moves\/[^/]+$/, { timeout: 30_000 });
    const moveId = decodeURIComponent(
      new URL(page.url()).pathname.split("/").pop() ?? "",
    );
    expect(moveId).toBeTruthy();

    await page.goto(`/app/moves/${encodeURIComponent(moveId)}/load-plan`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Load Plan", exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    const roughList = page.getByLabel("Rough movable unit list");
    const parseList = page.getByRole("button", { name: "Parse list" });
    await roughList.click();
    await roughList.pressSequentially(
      `Garage: box ${boxCode} ${boxLabel} 18 lb 16x12x10`,
      { delay: 1 },
    );
    await expect(parseList).toBeEnabled();
    await parseList.click();
    await expect(page.getByLabel(`Box code for ${boxLabel}`)).toHaveValue(boxCode, {
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Create units" }).click();
    await expect(
      page.getByText("1 movable unit saved from the rough list"),
    ).toBeVisible({ timeout: 30_000 });

    const mobileCards = page.getByLabel("Movable units mobile cards");
    await expect(mobileCards.getByText(boxLabel)).toBeVisible({
      timeout: 30_000,
    });
    await mobileCards
      .getByRole("link", {
        name: `Open ${boxCode} contents from mobile card`,
      })
      .click();

    await page.waitForURL(/\/app\/boxes\/.+returnTo=load-plan/, {
      timeout: 30_000,
    });
    await expect(
      page.getByRole("heading", { name: "Open box", exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(`Everything you add here stays packed in ${boxCode}`),
    ).toBeVisible();

    await page.getByLabel(`Quick item name inside ${boxCode}`).fill(contentName);
    await page
      .getByLabel(`Quick item category inside ${boxCode}`)
      .fill("Workshop");
    await page
      .getByLabel(`Quick item notes inside ${boxCode}`)
      .fill("Added from signed-in mobile rough-box smoke.");
    await page.getByRole("button", { name: "Add to box" }).click();

    await expect(
      page.getByText(`${contentName} added to ${boxCode}.`),
    ).toBeVisible({ timeout: 30_000 });
    const recordedContents = page.getByLabel(`Recorded contents for ${boxCode}`);
    await expect(recordedContents.getByText(contentName)).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      recordedContents.getByText("1 item", { exact: true }),
    ).toBeVisible();

    const photoItem = page.locator("#box-photo-item");
    await photoItem
      .getByLabel(`Photo item name inside ${boxCode}`)
      .fill(photoContentName);
    await photoItem
      .getByLabel(`Photo item category inside ${boxCode}`)
      .fill("Workshop");
    await photoItem
      .getByLabel(`Photo item notes inside ${boxCode}`)
      .fill("Created from a mobile open-box photo smoke.");
    await photoItem.getByLabel(`Photo for new item in ${boxCode}`).setInputFiles({
      name: "open-box-photo-item.png",
      mimeType: "image/png",
      buffer: createPng({ width: 640, height: 480 }),
    });
    await photoItem.getByRole("button", { name: "Upload" }).click();
    await expect(
      page.getByText(`${photoContentName} created inside ${boxCode}.`),
    ).toBeVisible({ timeout: 45_000 });
    await expect(recordedContents.getByText(photoContentName)).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      recordedContents.getByText("2 items", { exact: true }),
    ).toBeVisible();

    await expect(
      page.getByRole("link", { name: "Review load plan" }),
    ).toHaveAttribute(
      "href",
      `/app/moves/${encodeURIComponent(moveId)}/load-plan#load-plan`,
    );
  });
});

function assertConvexDeploymentUrlMatches() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const deploymentRef = deploymentRefFromEnv(process.env.CONVEX_DEPLOYMENT);
  if (!convexUrl || !deploymentRef) {
    return;
  }

  let host = "";
  try {
    host = new URL(convexUrl).hostname;
  } catch {
    throw new Error(
      `NEXT_PUBLIC_CONVEX_URL must be a valid URL before running the mobile movable-unit smoke. Received: ${convexUrl}`,
    );
  }

  if (!host.endsWith(".convex.cloud") || host.startsWith(`${deploymentRef}.`)) {
    return;
  }

  throw new Error(
    [
      "Mobile movable-unit smoke env mismatch.",
      `CONVEX_DEPLOYMENT points at ${deploymentRef}, but NEXT_PUBLIC_CONVEX_URL is ${convexUrl}.`,
      "Start the dev server and Playwright with the same Convex deployment URL, for example:",
      `NEXT_PUBLIC_CONVEX_URL=https://${deploymentRef}.convex.cloud CONVEX_DEPLOYMENT=${process.env.CONVEX_DEPLOYMENT} PLAYWRIGHT_PORT=3827 PLAYWRIGHT_REUSE_EXISTING_SERVER=1 node --env-file=.env.local node_modules/@playwright/test/cli.js test tests/e2e/mobile-movable-units.spec.ts --project=mobile-safari`,
    ].join(" "),
  );
}

function deploymentRefFromEnv(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.includes(":") ? trimmed.split(":").pop() ?? "" : trimmed;
}

async function gotoDashboard(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
}

async function waitForWorkspaceAuth(page: Page) {
  await expect(
    page.getByText(/Convex sees this browser session as/),
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible({
    timeout: 30_000,
  });
}

async function ensureHousehold(page: Page, householdName: string) {
  await page.getByRole("tab", { name: "Household" }).click();
  const householdInput = page.getByLabel("Household name");
  const selectedHousehold = page.getByLabel("Selected household");
  const createHousehold = page.getByRole("button", {
    name: "Create household",
  });

  await expect(householdInput).toBeVisible({ timeout: 30_000 });
  await householdInput.fill(householdName);
  await expect(createHousehold).toBeEnabled({ timeout: 30_000 });
  await createHousehold.click();
  await expect(selectedHousehold).toBeVisible({ timeout: 30_000 });
  await expect(selectedHousehold).toContainText(householdName, {
    timeout: 30_000,
  });
  await selectedHousehold.selectOption({ label: `${householdName} - owner` });
}

async function createMove(page: Page, moveTitle: string) {
  await page.getByRole("tab", { name: "Create move" }).click();
  await expect(page.getByLabel("Move title")).toBeEnabled({
    timeout: 30_000,
  });
  await page.getByLabel("Move title").fill(moveTitle);
  await page.getByLabel("Move template").selectOption("local");
  await page.getByRole("button", { name: "Create move" }).click();
  await page.waitForURL(/\/app\/moves\/[^/]+$/, { timeout: 30_000 });
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

      return (
        (await session.getToken({ template: "convex" }).catch(() => null)) ??
        null
      );
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
      { batchSize: 10 },
    );
    lastResult = result;
    if (!result.mayHaveMore) {
      return result;
    }
  }

  throw new Error(
    `E2E cleanup did not finish after ${e2eCleanupMaxBatches} batches. Last result: ${JSON.stringify(lastResult)}`,
  );
}

function createPng({ width, height }: { width: number; height: number }) {
  const rowLength = width * 4 + 1;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowLength;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowStart + 1 + x * 4;
      raw[offset] = 240;
      raw[offset + 1] = 244;
      raw[offset + 2] = 248;
      raw[offset + 3] = 255;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr(width, height)),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function ihdr(width: number, height: number) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 6;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
