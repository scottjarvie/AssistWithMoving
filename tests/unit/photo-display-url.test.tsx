import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { InventoryTable } from "@/components/inventory-table";
import type { Id } from "../../convex/_generated/dataModel";

const fixture = vi.hoisted(() => ({
  sign: vi.fn(),
  batch: vi.fn(),
  sessionId: "owner-session",
  photos: [] as { _id: string; targetId: string; updatedAt: number; derivativeRefs: { thumb?: string } }[],
  items: [] as object[],
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ sessionId: fixture.sessionId }) }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const noop = vi.fn();
  return {
    useAction: (ref: Parameters<typeof getFunctionName>[0]) =>
      getFunctionName(ref) === "photos:getThumbnailUrls" ? fixture.batch : fixture.sign,
    useConvexAuth: () => ({ isAuthenticated: true }),
    useMutation: () => noop,
    useQuery: (ref: Parameters<typeof getFunctionName>[0], args: { targetIds?: string[] } | "skip") => {
      if (args === "skip") return undefined;
      switch (getFunctionName(ref)) {
        case "items:facetedListForMove":
          return { items: fixture.items, facets: { total: fixture.items.length, disposition: {} } };
        case "photos:listRecordCovers":
          return fixture.photos.filter(({ targetId }) => args.targetIds?.includes(targetId));
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
  fixture.batch.mockReset();
  fixture.sessionId = "owner-session";
  fixture.items = Array.from({ length: rows }, (_, index) => ({
    _id: `item-${index}`,
    name: `Synthetic chair ${String(index).padStart(2, "0")}`,
    status: "active",
    disposition: "mover",
    planningDefaultKeys: [],
    signals: { boxCodes: [], assignedResourceNames: [], assignedZoneNames: [] },
  }));
  fixture.photos = fixture.items.map((_, index) => ({
    _id: `photo-${index}`, targetId: `item-${index}`, updatedAt: 1,
    derivativeRefs: { thumb: `cover-${index}` },
  }));
}

it("signs the ten mounted covers in one call, signs only the next page, and reuses fresh URLs", async () => {
  seed(11);
  fixture.batch.mockImplementation(async ({ photoIds }: { photoIds: string[] }) =>
    photoIds.map((photoId) => ({ photoId, url: `https://example.test/${photoId}`, expiresAt: Date.now() + 300_000 })),
  );
  const { container } = render(<InventoryTable {...{ householdId, moveId }} />);
  expect(screen.getByRole("button", { name: "Open Synthetic chair 00" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Open Synthetic chair 10" })).toBeNull();
  expect(container.querySelectorAll("img")).toHaveLength(0);
  await act(async () => {});
  expect(fixture.sign).not.toHaveBeenCalled();
  expect(fixture.batch).toHaveBeenCalledExactlyOnceWith({
    householdId, moveId, photoIds: fixture.photos.slice(0, 10).map((photo) => photo._id),
  });
  expect(container.querySelectorAll("img")).toHaveLength(10);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await act(async () => {});
  expect(fixture.batch).toHaveBeenLastCalledWith({ householdId, moveId, photoIds: ["photo-10"] });
  expect(container.querySelectorAll("img")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Prev" }));
  await act(async () => {});
  expect(fixture.batch).toHaveBeenCalledTimes(2);
  expect(container.querySelectorAll("img")).toHaveLength(10);
});

it("skips absent scope and covers, shows an icon on rejection and ignores a late unmounted response", async () => {
  seed(1);
  const noMove = render(<InventoryTable householdId={householdId} moveId={null} />);
  await act(async () => {});
  expect(fixture.batch).not.toHaveBeenCalled();
  noMove.unmount();

  const [photo] = fixture.photos;
  fixture.photos = [];
  const noCover = render(<InventoryTable {...{ householdId, moveId }} />);
  await act(async () => {});
  expect(fixture.batch).not.toHaveBeenCalled();
  expect(noCover.container.querySelector(".lucide-package")).toBeInTheDocument();
  noCover.unmount();

  fixture.photos = [photo];
  type Result = { photoId: string; url: string; expiresAt: number }[];
  let resolveLate!: (result: Result) => void;
  const late = new Promise<Result>((resolve) => { resolveLate = resolve; });
  fixture.batch.mockReturnValueOnce(late).mockRejectedValueOnce(new Error("Unavailable"));
  const pending = render(<InventoryTable {...{ householdId, moveId }} />);
  await act(async () => {});
  expect(fixture.batch).toHaveBeenCalledTimes(1);
  pending.unmount();
  const replacement = render(<InventoryTable {...{ householdId, moveId }} />);
  await act(async () => resolveLate([{ photoId: photo._id, url: "https://example.test/late", expiresAt: Date.now() + 300_000 }]));
  expect(fixture.batch).toHaveBeenCalledTimes(2);
  expect(replacement.container.querySelector("img")).toBeNull();
  expect(replacement.container.querySelector(".lucide-image-off")).toBeInTheDocument();
});

it("drops cached capabilities on redaction and never carries them into another session", async () => {
  seed(1);
  const [photo] = fixture.photos;
  fixture.batch.mockResolvedValueOnce([{ photoId: photo._id, url: "https://example.test/owner", expiresAt: Date.now() + 300_000 }]);
  fixture.batch.mockResolvedValue([]);
  const view = render(<InventoryTable {...{ householdId, moveId }} />);
  await act(async () => {});
  expect(view.container.querySelector("img")).toHaveAttribute("src", "https://example.test/owner");
  fixture.photos = [{ ...photo, derivativeRefs: {} }];
  view.rerender(<InventoryTable {...{ householdId, moveId }} />);
  expect(view.container.querySelector("img")).toBeNull();
  await act(async () => {});
  expect(fixture.batch).toHaveBeenCalledTimes(1);

  fixture.sessionId = "viewer-session";
  fixture.photos = [photo];
  view.rerender(<InventoryTable {...{ householdId, moveId }} />);
  expect(view.container.querySelector("img")).toBeNull();
  await act(async () => {});
  expect(fixture.batch).toHaveBeenCalledTimes(2);
  expect(view.container.querySelector("img")).toBeNull();
});

it("keeps the mounted cover after expiry and re-signs it only on page revisit", async () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, "visibilityState", "get");
  try {
    seed(11);
    fixture.photos = fixture.photos.slice(0, 1);
    const photoId = fixture.photos[0]._id;
    fixture.batch.mockResolvedValueOnce([{
      photoId, url: "https://example.test/expiring", expiresAt: Date.now() + 30_000,
    }]).mockImplementation(async () => [{
      photoId, url: "https://example.test/fresh", expiresAt: Date.now() + 30_000,
    }]);
    const view = render(<InventoryTable {...{ householdId, moveId }} />);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    const image = view.container.querySelector("img");
    expect(image).toHaveAttribute("src", "https://example.test/expiring");
    for (const state of ["visible", "hidden"] as const) {
      visibility.mockReturnValue(state);
      fireEvent(document, new Event("visibilitychange"));
      await act(async () => vi.advanceTimersByTimeAsync(60_000));
      expect(view.container.querySelector("img")).toBe(image);
      expect(image).toHaveAttribute("src", "https://example.test/expiring");
      expect(fixture.batch).toHaveBeenCalledTimes(1);
    }
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(fixture.batch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Prev" }));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(fixture.batch).toHaveBeenCalledTimes(2);
    expect(fixture.batch).toHaveBeenLastCalledWith({ householdId, moveId, photoIds: [photoId] });
    expect(view.container.querySelector("img")).toHaveAttribute("src", "https://example.test/fresh");
    view.unmount();
  } finally {
    visibility.mockRestore();
    vi.useRealTimers();
  }
});
