import { expect, it, vi } from "vitest";
import InventoryRoute from "../../src/app/(product)/app/moves/[moveId]/inventory/page";
import PhotosRoute from "../../src/app/(product)/app/moves/[moveId]/photos/page";

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));

it.each([InventoryRoute, PhotosRoute])("preserves the linked move in %s", async (route) => {
  await route({ params: Promise.resolve({ moveId: "linked/move" }) });
  expect(redirect).toHaveBeenLastCalledWith("/app/items/linked%2Fmove");
});
