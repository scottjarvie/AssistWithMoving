import { act, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MovableUnitsTable } from "@/components/movable-units-table";
import type { Id } from "../../convex/_generated/dataModel";

const fixture = vi.hoisted(() => ({
  sign: vi.fn(), display: vi.fn(), push: vi.fn(), query: vi.fn(),
  gallery: undefined as string[] | undefined,
}));

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ sessionId: "session-test" }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: fixture.push }),
  usePathname: () => "/app/movable-units",
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const empty: unknown[] = [];
  const covers = [{
    _id: "cover-test", targetId: "box-test", derivativeRefs: { thumb: "cover-test" }, updatedAt: 1,
  }];
  const boxes = [{ box: { _id: "box-test", label: "Synthetic box", code: "B-001", status: "open" }, contents: [], itemCount: 0 }];
  const noop = vi.fn();
  return {
    useAction: (ref: Parameters<typeof getFunctionName>[0]) =>
      getFunctionName(ref) === "photos:getDisplayUrl" ? fixture.display : fixture.sign,
    useConvexAuth: () => ({ isAuthenticated: true }),
    useMutation: () => noop,
    useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      if (args === "skip") return undefined;
      fixture.query(getFunctionName(ref), args);
      switch (getFunctionName(ref)) {
        case "boxes:listForMove": return boxes;
        case "photos:listRecordCovers": return covers;
        case "photos:listRecordGallery": return fixture.gallery;
        default: return empty;
      }
    },
  };
});

it("uses the first photo as the cover and opens the full gallery without opening the unit", async () => {
  const householdId = "household-test" as Id<"households">;
  const moveId = "move-test" as Id<"moves">;
  fixture.sign.mockResolvedValue([{
    photoId: "cover-test", url: "https://example.test/cover-test", expiresAt: Date.now() + 300_000,
  }]);
  fixture.display.mockImplementation(async ({ photoId }: { photoId: string }) => ({
    url: `https://example.test/${photoId}/detail`,
  }));
  const { rerender } = render(<MovableUnitsTable {...{ householdId, moveId }} />);
  const buttons = screen.getAllByRole("button", { name: "View photos" });
  await act(async () => {});
  expect(fixture.sign).toHaveBeenCalledExactlyOnceWith({ householdId, moveId, photoIds: ["cover-test"] });
  expect(buttons[0].querySelector("img")).toHaveAttribute("src", "https://example.test/cover-test");
  expect(fixture.query).toHaveBeenCalledWith("photos:listRecordCovers", { householdId, moveId, targetIds: ["box-test"] });
  expect(fixture.query).not.toHaveBeenCalledWith("photos:listForMove", expect.anything());
  expect(fixture.query).not.toHaveBeenCalledWith("photos:listRecordGallery", expect.anything());
  act(() => buttons[0].click());
  expect(fixture.query).toHaveBeenCalledWith("photos:listRecordGallery", { householdId, moveId, targetId: "box-test" });
  expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent("Loading photos");
  expect(fixture.display).not.toHaveBeenCalled();
  fixture.gallery = ["cover-test", "other-test"];
  rerender(<MovableUnitsTable {...{ householdId, moveId }} />);
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveTextContent("1 / 2");
  expect(fixture.display).toHaveBeenLastCalledWith({ householdId, moveId, photoId: "cover-test", variant: "detail" });
  act(() => within(dialog).getByRole("button", { name: "Next photo" }).click());
  expect(dialog).toHaveTextContent("2 / 2");
  expect(fixture.display).toHaveBeenLastCalledWith({ householdId, moveId, photoId: "other-test", variant: "detail" });
  await waitFor(() => expect(dialog.querySelector("img")).toHaveAttribute("src", "https://example.test/other-test/detail"));
  expect(fixture.push).not.toHaveBeenCalled();
});
