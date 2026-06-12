import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  boxes: {
    listForMove: "boxes.listForMove",
    update: "boxes.update",
  },
  estimates: {
    reportForMove: "estimates.reportForMove",
  },
  items: {
    listForMove: "items.listForMove",
  },
  transportResources: {
    listForMoveWithZones: "transportResources.listForMoveWithZones",
  },
}));

const loadPlannerData = vi.hoisted(() => ({
  mutation: vi.fn(),
  boxes: [
    {
      box: {
        _id: "box_1" as Id<"boxes">,
        _creationTime: 1,
        householdId: "household_123" as Id<"households">,
        moveId: "move_123" as Id<"moves">,
        code: "BOX-001",
        label: "Kitchen essentials",
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
      contents: [
        {
          item: {
            _id: "item_boxed" as Id<"items">,
            _creationTime: 1,
            householdId: "household_123" as Id<"households">,
            moveId: "move_123" as Id<"moves">,
            name: "Coffee mugs",
            status: "packed",
            room: "Kitchen",
            category: "Kitchen",
            disposition: "mover",
            planningDefaultKeys: [],
            quantity: 1,
            highValue: false,
            fragile: false,
            fragility: "standard",
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
        valueLb: 18,
        label: "contents-derived",
        source: "contents",
      },
    },
  ],
  items: [
    {
      _id: "item_boxed" as Id<"items">,
      _creationTime: 1,
      householdId: "household_123" as Id<"households">,
      moveId: "move_123" as Id<"moves">,
      name: "Coffee mugs",
      status: "packed",
      room: "Kitchen",
      category: "Kitchen",
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
    {
      _id: "item_unboxed" as Id<"items">,
      _creationTime: 1,
      householdId: "household_123" as Id<"households">,
      moveId: "move_123" as Id<"moves">,
      name: "Floor lamp",
      status: "inventory",
      room: "Living room",
      category: "Lighting",
      disposition: "mover",
      planningDefaultKeys: ["firstNight"],
      quantity: 1,
      highValue: true,
      fragile: true,
      hazardousFlag: false,
      requiresPersonalTransport: true,
      needsReview: true,
      createdAt: 1,
      updatedAt: 1,
    } as unknown as Doc<"items">,
  ],
  resources: [
    {
      resource: {
        _id: "resource_1" as Id<"transportResources">,
        _creationTime: 1,
        householdId: "household_123" as Id<"households">,
        moveId: "move_123" as Id<"moves">,
        name: "Moving truck",
        type: "truck",
        createdAt: 1,
        updatedAt: 1,
      } as unknown as Doc<"transportResources">,
      zones: [
        {
          _id: "zone_1" as Id<"transportZones">,
          _creationTime: 1,
          householdId: "household_123" as Id<"households">,
          moveId: "move_123" as Id<"moves">,
          resourceId: "resource_1" as Id<"transportResources">,
          name: "Front",
          createdAt: 1,
          updatedAt: 1,
        } as unknown as Doc<"transportZones">,
      ],
    },
  ],
  report: {
    boxReports: [
      {
        boxId: "box_1" as Id<"boxes">,
        warnings: [],
        weightSummary: {
          valueLb: 18,
          label: "contents-derived",
          source: "contents",
        },
      },
    ],
    resourceReports: [
      {
        resourceId: "resource_1" as Id<"transportResources">,
        estimatedWeightLb: 0,
        estimatedVolumeCuFt: 0,
      },
    ],
  },
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: () => loadPlannerData.mutation,
  useQuery: (query: string) => {
    switch (query) {
      case apiMock.boxes.listForMove:
        return loadPlannerData.boxes;
      case apiMock.items.listForMove:
        return loadPlannerData.items;
      case apiMock.transportResources.listForMoveWithZones:
        return loadPlannerData.resources;
      case apiMock.estimates.reportForMove:
        return loadPlannerData.report;
      default:
        return undefined;
    }
  },
}));

import { LoadPlannerBoard } from "@/components/load-planner-board";

function renderLoadPlannerBoard() {
  render(
    <LoadPlannerBoard
      householdId={"household_123" as Id<"households">}
      moveId={"move_123" as Id<"moves">}
    />,
  );
}

describe("LoadPlannerBoard task tabs", () => {
  beforeEach(() => {
    loadPlannerData.mutation.mockReset();
  });

  it("opens on the load board and keeps bulk assignment and unboxed work separate", async () => {
    const user = userEvent.setup();

    renderLoadPlannerBoard();

    expect(screen.getByRole("tab", { name: "Board: 1 box" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.getByText(
        "Scan truck and zone assignments with warnings and capacity visible.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "Search box codes, rooms, labels, or contents",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("BOX-001")).toBeInTheDocument();
    expect(screen.queryByText("Bulk assignment")).not.toBeInTheDocument();
    expect(screen.queryByText("Unboxed item queue")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Assign: 0 selected" }));
    expect(
      screen.getByText(
        "Bulk-assign selected boxes after choosing them on the board.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Bulk assignment")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Bulk assignment resource"),
    ).toBeInTheDocument();
    expect(screen.getByText("Assignment workflow")).toBeInTheDocument();
    expect(screen.queryByText("BOX-001")).not.toBeInTheDocument();
    expect(screen.queryByText("Unboxed item queue")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Unboxed: 1 item" }));
    expect(
      screen.getByText(
        "Find loose inventory that still needs a box before load day.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Unboxed item queue")).toBeInTheDocument();
    expect(screen.getByText("Floor lamp")).toBeInTheDocument();
    expect(screen.getByText("first night")).toBeInTheDocument();
    expect(screen.queryByText("Bulk assignment")).not.toBeInTheDocument();
    expect(screen.queryByText("BOX-001")).not.toBeInTheDocument();
  });
});
