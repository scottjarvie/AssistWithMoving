import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { InventoryTable } from "@/components/inventory-table";
import type { Id } from "../../convex/_generated/dataModel";

const fixture = vi.hoisted(() => ({
  sign: vi.fn(),
  photos: [] as { _id: string; itemId: string }[],
  items: [] as object[],
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const noop = vi.fn();
  return {
    useAction: () => fixture.sign,
    useMutation: () => noop,
    useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
      switch (getFunctionName(ref)) {
        case "items:facetedListForMove":
          return { items: fixture.items, facets: { total: fixture.items.length, disposition: {} } };
        case "photos:listForMove":
          return fixture.photos;
        case "transportResources:listForMoveWithZones":
          return [];
      }
    },
  };
});

const householdId = "household-test" as Id<"households">;
const moveId = "move-test" as Id<"moves">;

function seed(rows: number) {
  fixture.sign.mockReset();
  fixture.items = Array.from({ length: rows }, (_, index) => ({
    _id: `item-${index}`,
    name: `Synthetic chair ${String(index).padStart(2, "0")}`,
    status: "active",
    disposition: "mover",
    planningDefaultKeys: [],
    signals: { boxCodes: [], assignedResourceNames: [], assignedZoneNames: [] },
  }));
  fixture.photos = fixture.items.map((_, index) => ({
    _id: `photo-${index}`, itemId: `item-${index}`,
  }));
}

it("requests card URLs only for the ten mounted covers while text renders immediately", async () => {
  seed(11);
  fixture.sign.mockImplementation(({ photoId }) => Promise.resolve({ url: `https://example.test/${photoId}` }));
  const { container } = render(<InventoryTable {...{ householdId, moveId }} />);
  expect(screen.getByRole("button", { name: "Open Synthetic chair 00" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Open Synthetic chair 10" })).toBeNull();
  expect(container.querySelectorAll("img")).toHaveLength(0);
  expect(fixture.sign).toHaveBeenCalledTimes(10);
  expect(fixture.sign).toHaveBeenCalledWith({ householdId, moveId, photoId: "photo-0", variant: "card" });
  await act(async () => {});
  expect(container.querySelectorAll("img")).toHaveLength(10);
});

it("skips absent scope and covers, shows an icon on rejection and ignores a late unmounted response", async () => {
  seed(1);
  const noMove = render(<InventoryTable householdId={householdId} moveId={null} />);
  expect(fixture.sign).not.toHaveBeenCalled();
  noMove.unmount();

  const [photo] = fixture.photos;
  fixture.photos = [];
  const noCover = render(<InventoryTable {...{ householdId, moveId }} />);
  expect(fixture.sign).not.toHaveBeenCalled();
  expect(noCover.container.querySelector(".lucide-package")).toBeInTheDocument();
  noCover.unmount();

  fixture.photos = [photo];
  let resolveLate!: (result: { url: string }) => void;
  const late = new Promise<{ url: string }>((resolve) => { resolveLate = resolve; });
  fixture.sign.mockReturnValueOnce(late).mockRejectedValueOnce(new Error("Unavailable"));
  const pending = render(<InventoryTable {...{ householdId, moveId }} />);
  pending.unmount();
  const replacement = render(<InventoryTable {...{ householdId, moveId }} />);
  await act(async () => resolveLate({ url: "https://example.test/late" }));
  expect(replacement.container.querySelector("img")).toBeNull();
  expect(replacement.container.querySelector(".lucide-image-off")).toBeInTheDocument();
});
