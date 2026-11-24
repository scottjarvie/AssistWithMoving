import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MovableUnitsTable } from "@/components/movable-units-table";
import type { Id } from "../../convex/_generated/dataModel";

const fixture = vi.hoisted(() => ({ sign: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: fixture.push }),
  usePathname: () => "/app/movable-units",
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const empty: unknown[] = [];
  const photos = [{ _id: "cover-test", boxId: "box-test" }, { _id: "other-test", boxId: "box-test" }];
  const boxes = [{ box: { _id: "box-test", label: "Synthetic box", code: "B-001", status: "open" }, contents: [], itemCount: 0 }];
  const noop = vi.fn();
  return {
    useAction: () => fixture.sign,
    useMutation: () => noop,
    useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
      switch (getFunctionName(ref)) {
        case "boxes:listForMove": return boxes;
        case "photos:listForMove": return photos;
        default: return empty;
      }
    },
  };
});

vi.mock("@/components/photo-lightbox", () => ({
  PhotoLightbox: ({ open, photoIds }: { open: boolean; photoIds: string[] }) =>
    open ? <div role="dialog">{photoIds.join(", ")}</div> : null,
}));

it("uses the first photo as the cover and opens the full gallery without opening the unit", async () => {
  const householdId = "household-test" as Id<"households">;
  const moveId = "move-test" as Id<"moves">;
  fixture.sign.mockResolvedValue({ url: "https://example.test/cover-test" });
  render(<MovableUnitsTable {...{ householdId, moveId }} />);
  const buttons = screen.getAllByRole("button", { name: "View photos" });
  await act(async () => {});
  expect(fixture.sign).toHaveBeenCalledWith({ householdId, moveId, photoId: "cover-test", variant: "card" });
  expect(buttons[0].querySelector("img")).toHaveAttribute("src", "https://example.test/cover-test");
  act(() => buttons[0].click());
  expect(screen.getByRole("dialog")).toHaveTextContent("cover-test, other-test");
  expect(fixture.push).not.toHaveBeenCalled();
});
