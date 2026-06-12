import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  boxes: {
    listForMove: "boxes.listForMove",
    update: "boxes.update",
  },
  items: {
    update: "items.update",
  },
  transportResources: {
    listForMoveWithZones: "transportResources.listForMoveWithZones",
  },
}));

const moveDayData = vi.hoisted(() => ({
  boxes: [
    {
      box: {
        _id: "box_ready" as Id<"boxes">,
        _creationTime: 1,
        householdId: "household_123" as Id<"households">,
        moveId: "move_123" as Id<"moves">,
        code: "BOX-READY",
        label: "Kitchen dishes",
        room: "Kitchen",
        destinationRoom: "Kitchen",
        status: "sealed",
        assignmentWarnings: [],
        assignmentHardBlocks: [],
        assignmentLocked: false,
        createdByUserId: "user_123" as Id<"users">,
        createdAt: 1,
        updatedAt: 1,
      } as unknown as Doc<"boxes">,
      contents: [],
      itemCount: 0,
    },
    {
      box: {
        _id: "box_damaged" as Id<"boxes">,
        _creationTime: 1,
        householdId: "household_123" as Id<"households">,
        moveId: "move_123" as Id<"moves">,
        code: "BOX-DAMAGE",
        label: "Floor lamp",
        room: "Living room",
        destinationRoom: "Living room",
        status: "damaged",
        assignmentWarnings: ["needs review"],
        assignmentHardBlocks: [],
        assignmentLocked: false,
        moveDayNote: "Shade cracked.",
        createdByUserId: "user_123" as Id<"users">,
        createdAt: 1,
        updatedAt: 1,
      } as unknown as Doc<"boxes">,
      contents: [],
      itemCount: 1,
    },
  ],
  resources: [],
  mutation: vi.fn(),
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: () => moveDayData.mutation,
  useQuery: (query: string) => {
    switch (query) {
      case apiMock.boxes.listForMove:
        return moveDayData.boxes;
      case apiMock.transportResources.listForMoveWithZones:
        return moveDayData.resources;
      default:
        return undefined;
    }
  },
}));

import { MoveDayView } from "@/components/move-day-view";

function renderMoveDayView() {
  render(
    <MoveDayView
      householdId={"household_123" as Id<"households">}
      moveId={"move_123" as Id<"moves">}
    />,
  );
}

describe("MoveDayView task tabs", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app/moves/move_123/move-day");
    window.localStorage.clear();
    moveDayData.mutation.mockReset();
  });

  it("opens on checklist work and keeps exceptions, progress, and offline details separate", async () => {
    const user = userEvent.setup();

    renderMoveDayView();

    expect(screen.getByRole("tab", { name: "Checklist" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.getByText(
        "Scan, filter, and update ready boxes during the active crew workflow.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Move Day box lookup")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ready: 1 boxes" }),
    ).toHaveAttribute("data-variant", "default");
    expect(
      screen.getByRole("button", { name: "All: 2 boxes" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Sealed or staged boxes ready for the next crew action.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("BOX-READY")).toBeInTheDocument();
    expect(screen.queryByText("BOX-DAMAGE")).not.toBeInTheDocument();
    expect(screen.queryByText("Status progress")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Offline and crew safety"),
    ).not.toBeInTheDocument();

    const readyCard = screen.getByRole("listitem", {
      name: "Move day box BOX-READY",
    });
    expect(
      within(readyCard).getByRole("button", { name: /Next\s+Staged/ }),
    ).toBeInTheDocument();
    expect(
      within(readyCard).getByRole("button", { name: "Missing" }),
    ).toBeInTheDocument();
    expect(
      within(readyCard).getByRole("button", { name: "Damaged" }),
    ).toBeInTheDocument();
    const otherStatuses = within(readyCard)
      .getByText("Other statuses")
      .closest("details");
    expect(otherStatuses).not.toHaveAttribute("open");

    await user.click(within(readyCard).getByText("Other statuses"));
    expect(otherStatuses).toHaveAttribute("open");
    expect(
      within(readyCard).getByRole("button", { name: "Loaded" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All: 2 boxes" }));
    expect(
      screen.getByText("All active boxes in this move."),
    ).toBeInTheDocument();
    expect(screen.getByText("BOX-READY")).toBeInTheDocument();
    expect(screen.getByText("BOX-DAMAGE")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Exceptions" }));
    expect(screen.getByRole("tab", { name: "Exceptions" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.getByText(
        "Focus only on missing, damaged, warning, and hard-blocked boxes.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("BOX-DAMAGE")).toBeInTheDocument();
    expect(screen.getByText("needs review")).toBeInTheDocument();
    expect(screen.queryByText("BOX-READY")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Progress" }));
    expect(
      screen.getByText(
        "Check loaded, delivered, and exception totals without the scan list.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Status progress")).toBeInTheDocument();
    expect(screen.getByText("2 boxes")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Move Day box lookup"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Offline" }));
    expect(screen.getByText("Offline and crew safety")).toBeInTheDocument();
    expect(screen.getByText("Cached checklist")).toBeInTheDocument();
    expect(
      screen.getByText("Online. Status changes sync to the move record."),
    ).toBeInTheDocument();
  });

  it("opens progress when routed to the move-day progress hash", async () => {
    window.history.replaceState(
      null,
      "",
      "/app/moves/move_123/move-day#move-day-progress",
    );

    renderMoveDayView();

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Progress" })).toHaveAttribute(
        "data-state",
        "active",
      ),
    );
    expect(screen.getByText("Status progress")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Move Day box lookup"),
    ).not.toBeInTheDocument();
  });
});
