import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";

const boxData = vi.hoisted(() => ({
  queryCall: 0,
  boxes: [
    {
      box: {
        _id: "box_1" as Id<"boxes">,
        _creationTime: 1,
        householdId: "household_123" as Id<"households">,
        moveId: "move_123" as Id<"moves">,
        code: "B-001",
        label: "Garage tools",
        room: "Garage",
        destinationRoom: "Storage",
        description: "Hand tools and small parts",
        status: "sealed",
        estimatedVolumeCuFt: 4,
        assignmentLocked: false,
        createdByUserId: "user_123" as Id<"users">,
        createdAt: 1,
        updatedAt: 1,
      } as unknown as Doc<"boxes">,
      contents: [
        {
          membership: {
            _id: "boxItem_1" as Id<"boxItems">,
            _creationTime: 1,
            householdId: "household_123" as Id<"households">,
            moveId: "move_123" as Id<"moves">,
            boxId: "box_1" as Id<"boxes">,
            itemId: "item_1" as Id<"items">,
            quantity: 1,
            createdAt: 1,
            updatedAt: 1,
          } as Doc<"boxItems">,
          item: {
            _id: "item_1" as Id<"items">,
            _creationTime: 1,
            householdId: "household_123" as Id<"households">,
            moveId: "move_123" as Id<"moves">,
            name: "Socket set",
            status: "packed",
            category: "Tools",
            disposition: "mover",
            planningDefaultKeys: [],
            quantity: 1,
            highValue: false,
            fragile: false,
            hazardousFlag: false,
            requiresPersonalTransport: false,
            needsReview: false,
            createdAt: 1,
            updatedAt: 1,
          } as unknown as Doc<"items">,
        },
      ],
      itemCount: 1,
      weightSummary: {
        valueLb: 12,
        label: "contents-derived",
        source: "contents",
      },
    },
    {
      box: {
        _id: "box_2" as Id<"boxes">,
        _creationTime: 2,
        householdId: "household_123" as Id<"households">,
        moveId: "move_123" as Id<"moves">,
        code: "B-002",
        label: "Bedroom linens",
        room: "Bedroom",
        destinationRoom: "Guest room",
        description: "Sheets and towels",
        status: "sealed",
        estimatedVolumeCuFt: 3,
        assignmentLocked: false,
        createdByUserId: "user_123" as Id<"users">,
        createdAt: 2,
        updatedAt: 2,
      } as unknown as Doc<"boxes">,
      contents: [],
      itemCount: 0,
      weightSummary: {
        label: "missing",
        source: "missing",
      },
    },
  ],
  items: [
    {
      _id: "item_1" as Id<"items">,
      _creationTime: 1,
      householdId: "household_123" as Id<"households">,
      moveId: "move_123" as Id<"moves">,
      name: "Socket set",
      status: "packed",
      category: "Tools",
      disposition: "mover",
      planningDefaultKeys: [],
      quantity: 1,
      highValue: false,
      fragile: false,
      hazardousFlag: false,
      requiresPersonalTransport: false,
      needsReview: false,
      createdAt: 1,
      updatedAt: 1,
    } as unknown as Doc<"items">,
  ],
  resources: [],
}));

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useQuery: () => {
    const results = [boxData.boxes, boxData.items, boxData.resources];
    const result = results[boxData.queryCall % results.length];
    boxData.queryCall += 1;
    return result;
  },
}));

vi.mock("@/components/photo-upload-control", () => ({
  PhotoUploadControl: () => <div>Photo upload control</div>,
}));

vi.mock("@/components/photo-evidence-strip", () => ({
  PhotoEvidenceStrip: () => <div>Photo evidence strip</div>,
}));

import { BoxManager } from "@/components/box-manager";

describe("BoxManager", () => {
  beforeEach(() => {
    boxData.queryCall = 0;
    window.history.replaceState(null, "", "/app/moves/move_123/boxes");
  });

  it("opens on box records and keeps per-box work in task tabs", async () => {
    const user = userEvent.setup();

    render(
      <BoxManager
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    expect(screen.getByRole("tab", { name: "Boxes" })).toHaveAttribute(
      "data-state",
      "active",
    );
    const boxList = screen.getByRole("list", { name: "Box records" });
    expect(within(boxList).getByText("B-001")).toBeInTheDocument();
    expect(within(boxList).getByText("B-002")).toBeInTheDocument();
    expect(within(boxList).getByText("Garage tools")).toBeInTheDocument();
    expect(within(boxList).getByText("Socket set x1")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("form", { name: "Create box" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Item to add to box"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Box label")).not.toBeInTheDocument();

    await user.click(
      within(boxList).getByRole("button", { name: "Details for B-001" }),
    );
    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByText("Focused on B-001")).toBeInTheDocument();
    expect(screen.getByLabelText("Box label")).toBeInTheDocument();
    expect(screen.queryByText("B-002")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change box" }));
    expect(screen.queryByText("Focused on B-001")).not.toBeInTheDocument();
    expect(screen.getByText("Pick a box for details")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit details for B-002" }),
    ).toBeInTheDocument();
    expect(screen.getByText("B-002")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Add box" }));
    expect(
      screen.getByRole("form", { name: "Create box" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Contents" }));
    expect(screen.getByText("Pick a box for contents")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open contents for B-001" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Item to add to box"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Box label")).not.toBeInTheDocument();
    expect(screen.queryByText("Photo upload control")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Assigned transport resource"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Open contents for B-001" }),
    );
    expect(screen.getAllByText("Socket set").length).toBeGreaterThan(0);
    expect(screen.getByText("Focused on B-001")).toBeInTheDocument();
    expect(screen.getByLabelText("Item to add to box")).toBeInTheDocument();
    expect(screen.queryByLabelText("Box label")).not.toBeInTheDocument();
    expect(screen.queryByText("Photo upload control")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Assigned transport resource"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Details" }));
    expect(screen.getByText("Focused on B-001")).toBeInTheDocument();
    expect(screen.getByLabelText("Box label")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Estimated box weight in pounds"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Item to add to box"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Photo upload control")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Photos" }));
    expect(screen.getByText("Focused on B-001")).toBeInTheDocument();
    expect(screen.getByText("Photo upload control")).toBeInTheDocument();
    expect(screen.getByText("Photo evidence strip")).toBeInTheDocument();
    expect(screen.queryByLabelText("Box label")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Load" }));
    expect(screen.getByText("Focused on B-001")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Assigned transport resource"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Assignment override reason"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Photo upload control")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Labels" }));
    const labelCards = screen.getByRole("list", { name: "Box labels" });
    expect(within(labelCards).getByText("B-001")).toBeInTheDocument();
    expect(within(labelCards).getByText("Garage tools")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Code" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Storage").length).toBeGreaterThan(0);
  });

  it("opens label workflow when routed to the box labels hash", async () => {
    window.history.replaceState(
      null,
      "",
      "/app/moves/move_123/boxes#box-labels",
    );

    render(
      <BoxManager
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Labels" })).toHaveAttribute(
        "data-state",
        "active",
      ),
    );
    expect(
      screen.getByRole("list", { name: "Box labels" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Box records" }),
    ).not.toBeInTheDocument();
  });

  it("opens load workflow when routed to the box load hash", async () => {
    const user = userEvent.setup();

    window.history.replaceState(null, "", "/app/moves/move_123/boxes#box-load");

    render(
      <BoxManager
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Load" })).toHaveAttribute(
        "data-state",
        "active",
      ),
    );
    expect(
      screen.getByText("Pick a box for load assignment"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Assign load for B-001" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Assigned transport resource"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Box records" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Assign load for B-001" }),
    );
    expect(screen.getByText("Focused on B-001")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Assigned transport resource"),
    ).toBeInTheDocument();
  });
});
