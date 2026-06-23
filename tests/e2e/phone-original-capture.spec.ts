import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { deflateSync } from "node:zlib";

import { api } from "../../convex/_generated/api";

const e2eUserEmail = process.env.E2E_CLERK_USER_EMAIL;
const e2eCleanupMaxBatches = 25;

test.describe("phone-style original capture", () => {
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

  test("shows the browser-provided original image dimensions before queue upload", async ({
    context,
    page,
  }) => {
    await setupClerkTestingToken({ context });
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await clerk.signIn({ page, emailAddress: e2eUserEmail! });
    await page.waitForFunction(() => window.Clerk?.user !== null);

    await gotoDashboard(page);
    await waitForWorkspaceAuth(page);
    await cleanupE2eData(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForWorkspaceAuth(page);

    await openCaptureWorkspace(page);

    await expect(
      page.getByRole("heading", { name: "Capture for your AI agent" })
    ).toBeVisible({ timeout: 30_000 });

    const original = createPng({ width: 3000, height: 4000 });
    await page.getByLabel("Take a new photo").setInputFiles({
      name: "phone-original-3000x4000.png",
      mimeType: "image/png",
      buffer: original,
    });

    const attachments = page.getByLabel("Pending attachments");
    await expect(attachments).toContainText("phone-original-3000x4000.png");
    await expect(attachments).toContainText(formatFileSize(original.length));
    await expect(
      page.getByLabel("phone-original-3000x4000.png dimensions")
    ).toContainText("3000x4000", { timeout: 30_000 });
    await expect(attachments.getByText("app original")).toBeVisible();
  });
});

async function gotoDashboard(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });
}

async function waitForWorkspaceAuth(page: Page) {
  await expect(
    page.getByText(/Convex sees this browser session as/)
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible({
    timeout: 30_000,
  });
}

async function openCaptureWorkspace(page: Page) {
  const activeMoveOpened = await openSelectedMoveCapture(page);
  if (activeMoveOpened) {
    return;
  }

  const runId = Date.now().toString(36);
  const householdName = `E2E phone original household ${runId}`;
  const moveTitle = `E2E phone original move ${runId}`;
  await page.getByRole("tab", { name: "Create move" }).click();

  const moveTitleInput = page.getByLabel("Move title");
  await expect(moveTitleInput).toBeVisible({ timeout: 30_000 });
  if (!(await moveTitleInput.isEnabled())) {
    await ensureHousehold(page, householdName);
    await page.getByRole("tab", { name: "Create move" }).click();
  }

  await expect(moveTitleInput).toBeEnabled({ timeout: 30_000 });
  await moveTitleInput.fill(moveTitle);
  await page.getByLabel("Move template").selectOption("local");
  await page.getByRole("button", { name: "Create move" }).click();

  await page.waitForURL(/\/app\/moves\/[^/]+$/, { timeout: 30_000 });
  await page.getByRole("link", { name: "Add to queue" }).click();
  await page.waitForURL(/\/app\/moves\/[^/]+\/capture/, { timeout: 30_000 });
}

async function openSelectedMoveCapture(page: Page) {
  const activeMoves = page.getByRole("region", { name: "Active moves" });
  if (!(await activeMoves.isVisible().catch(() => false))) {
    return false;
  }

  const openSelectedMove = activeMoves.getByRole("link", {
    name: "Open selected move",
  });
  if ((await openSelectedMove.count()) !== 1) {
    return false;
  }

  const href = await openSelectedMove.getAttribute("href");
  if (!href) {
    return false;
  }

  await page.goto(href, { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Add to queue" }).click();
  await page.waitForURL(/\/app\/moves\/[^/]+\/capture/, { timeout: 30_000 });
  return true;
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

function formatFileSize(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
