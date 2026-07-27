import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const e2eUserEmail = process.env.E2E_CLERK_USER_EMAIL;
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

async function authedClient(page: Page) {
  const token = await page.evaluate(async () => {
    const session = (
      window as unknown as {
        Clerk?: { session?: { getToken: (o?: unknown) => Promise<string | null> } };
      }
    ).Clerk?.session;
    if (!session) return null;
    const tmpl = await session.getToken({ template: "convex" }).catch(() => null);
    return tmpl ?? (await session.getToken().catch(() => null));
  });
  if (!token) throw new Error("no convex token");
  const client = new ConvexHttpClient(convexUrl!);
  client.setAuth(token);
  return client;
}

test("config gaps: editable method capacity + sq-ft area limit persist", async ({
  page,
}) => {
  test.setTimeout(90_000);
  test.skip(!e2eUserEmail || !convexUrl, "E2E env not set");
  await setupClerkTestingToken({ page });
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await clerk.signIn({ page, emailAddress: e2eUserEmail! });
  await page.waitForFunction(() => window.Clerk?.user !== null, undefined, {
    timeout: 45_000,
  });
  await page.waitForLoadState("networkidle").catch(() => {});

  const client = await authedClient(page);
  const households = (await client.query(api.households.listMine, {})) as Array<{
    household: { _id: Id<"households"> };
  }>;
  const householdId = households[0].household._id;
  const moves = (await client.query(api.moves.listForHousehold, {
    householdId,
  })) as Array<{ _id: Id<"moves"> }>;
  const moveId = moves[0]._id;

  // --- Gap A: transportResources.update makes method capacity editable ---
  let resources = (await client.query(api.transportResources.listForMove, {
    householdId,
    moveId,
  })) as Array<{ _id: Id<"transportResources">; capacity?: { maxWeightLb?: number } }>;
  if (resources.length === 0) {
    await client.mutation(api.transportResources.create, {
      householdId,
      moveId,
      type: "trailer",
      name: "claude-test-gap trailer",
      capacity: {},
    });
    resources = (await client.query(api.transportResources.listForMove, {
      householdId,
      moveId,
    })) as typeof resources;
  }
  const resourceId = resources[0]._id;
  const newWeight = 4321;
  await client.mutation(api.transportResources.update, {
    householdId,
    moveId,
    resourceId,
    capacity: { maxWeightLb: newWeight },
  });
  const afterResources = (await client.query(
    api.transportResources.listForMove,
    { householdId, moveId },
  )) as typeof resources;
  const updated = afterResources.find((r) => r._id === resourceId);
  expect(updated?.capacity?.maxWeightLb, "method weight limit persisted").toBe(
    newWeight,
  );

  // --- Gap B: moveSpaces capacity now accepts a sq-ft area limit ---
  const areaId = (await client.mutation(api.moveSpaces.create, {
    householdId,
    moveId,
    kind: "originRoom",
    name: `claude-test-gap area ${newWeight}`,
  })) as Id<"moveSpaces">;
  const newArea = 275;
  await client.mutation(api.moveSpaces.update, {
    householdId,
    moveId,
    spaceId: areaId,
    capacity: { maxAreaSqFt: newArea },
  });
  const spaces = (await client.query(api.moveSpaces.listForMove, {
    householdId,
    moveId,
  })) as Array<{ _id: Id<"moveSpaces">; capacity?: { maxAreaSqFt?: number } }>;
  const area = spaces.find((s) => s._id === areaId);
  expect(area?.capacity?.maxAreaSqFt, "area sq-ft limit persisted").toBe(newArea);

  // --- UI render check: Transportation config tab renders the methods panel ---
  // (Selecting a method in the rail reveals "Method capacity: <value>" + Edit;
  // that is verified visually. Here we confirm the tab renders without crashing.)
  await page.goto(`/app/moves/${moveId}/configure`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("tab", { name: "Transportation" }).click();
  await expect(page.getByText("Methods").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Something went wrong")).toHaveCount(0);

  console.log("CONFIG_GAPS_OK");
});
