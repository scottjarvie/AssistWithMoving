import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  photos: {
    listForMove: "photos.listForMove",
    getDisplayUrl: "photos.getDisplayUrl",
    updateEvidence: "photos.updateEvidence",
  },
}));

const mocks = vi.hoisted(() => ({
  updateEvidence: vi.fn().mockResolvedValue(undefined),
  getDisplayUrl: vi.fn().mockResolvedValue({ url: "https://cdn/x.jpg" }),
  onOpenChange: vi.fn(),
  onAttached: vi.fn(),
}));

// A move photo wall: two unattached, one already on THIS item, one on a box,
// one on a different item.
const photos = vi.hoisted(() => [
  { _id: "p_unatt_1", itemId: null, boxId: null, room: null },
  { _id: "p_unatt_2", itemId: null, boxId: null, room: null },
  { _id: "p_this_item", itemId: "item_target", boxId: null, room: null },
  { _id: "p_on_box", itemId: null, boxId: "box_1", room: null },
  { _id: "p_other_item", itemId: "item_other", boxId: null, room: null },
  { _id: "p_on_space", itemId: null, boxId: null, room: null, spaceId: "space_1" },
  {
    _id: "p_on_transport",
    itemId: null,
    boxId: null,
    room: null,
    transportResourceId: "resource_1",
  },
]);

vi.mock("../../convex/_generated/api", () => ({ api: apiMock }));

vi.mock("convex/react", () => ({
  useQuery: (query: string, args: unknown) =>
    args === "skip" ? undefined : query === apiMock.photos.listForMove ? photos : undefined,
  useAction: () => mocks.getDisplayUrl,
  useMutation: () => mocks.updateEvidence,
}));

import { PhotoPickerDialog } from "@/components/photo-picker-dialog";

function renderPicker() {
  return render(
    <PhotoPickerDialog
      householdId={"household_1" as Id<"households">}
      moveId={"move_1" as Id<"moves">}
      target={{ kind: "item", itemId: "item_target" as Id<"items"> }}
      targetLabel="Red toolbox"
      open
      onOpenChange={mocks.onOpenChange}
      onAttached={mocks.onAttached}
    />,
  );
}

describe("PhotoPickerDialog (MOVE-354)", () => {
  it("defaults to unattached photos and can show all, excluding the current target", async () => {
    const user = userEvent.setup();
    renderPicker();

    // Default: "Unattached only" → just the two orphan photos.
    expect(
      screen.getAllByRole("button", { name: "Attach this photo" }),
    ).toHaveLength(2);

    // Turn the filter off → every photo EXCEPT the one already on this item
    // (p_this_item) shows: unattached, box, other item, space, and transport.
    await user.click(screen.getByLabelText("Unattached only"));
    expect(
      screen.getAllByRole("button", { name: "Attach this photo" }),
    ).toHaveLength(6);
  });

  it("attaches the chosen photo to the target item and clears sibling box attachment", async () => {
    const user = userEvent.setup();
    mocks.updateEvidence.mockClear();
    mocks.onAttached.mockClear();
    mocks.onOpenChange.mockClear();
    renderPicker();

    await user.click(
      screen.getAllByRole("button", { name: "Attach this photo" })[0],
    );

    await waitFor(() => {
      expect(mocks.updateEvidence).toHaveBeenCalledWith(
        expect.objectContaining({
          photoId: "p_unatt_1",
          itemId: "item_target",
          boxId: null,
          householdId: "household_1",
          moveId: "move_1",
        }),
      );
    });
    expect(mocks.onAttached).toHaveBeenCalled();
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "Attach this photo" })[0],
      ).not.toBeDisabled();
    });
  });
});
