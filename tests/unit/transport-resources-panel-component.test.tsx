import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  transportResources: {
    listForMoveWithZones: "transportResources.listForMoveWithZones",
    createFromPreset: "transportResources.createFromPreset",
    updateCapacityReview: "transportResources.updateCapacityReview",
  },
}));

const transportData = vi.hoisted(() => ({
  mutation: vi.fn(),
  resources: [
    {
      resource: {
        _id: "resource_1" as Id<"transportResources">,
        _creationTime: 1,
        householdId: "household_123" as Id<"households">,
        moveId: "move_123" as Id<"moves">,
        name: "Moving truck",
        type: "truck",
        description: "26 ft truck with lift gate.",
        rules: ["load heavy items low", "fragile last"],
        capacityReviewStatus: "estimated",
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
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: () => transportData.mutation,
  useQuery: (query: string) =>
    query === apiMock.transportResources.listForMoveWithZones
      ? transportData.resources
      : undefined,
}));

import { TransportResourcesPanel } from "@/components/transport-resources-panel";

describe("TransportResourcesPanel", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app/moves/move_123/load-plan");
    transportData.mutation.mockReset();
  });

  it("opens on transport resources before setup and capacity review", async () => {
    const user = userEvent.setup();

    render(
      <TransportResourcesPanel
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
        moveTitle="Summer move"
        moveType="local"
      />,
    );

    const cards = screen.getByRole("list", {
      name: "Transport resource cards",
    });
    expect(within(cards).getByText("Moving truck")).toBeInTheDocument();
    expect(screen.getByText("1 resources")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Resources" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByRole("tab", { name: "Add" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Capacity" })).toBeInTheDocument();
    expect(screen.queryByText("Add from preset")).not.toBeInTheDocument();
    expect(screen.queryByText("Box truck")).not.toBeInTheDocument();
    expect(screen.queryByText("Capacity posture")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Trucks and trailers get weight\/volume defaults/),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add resource" }));

    expect(screen.getByRole("tab", { name: "Add" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.queryByText("Moving truck")).not.toBeInTheDocument();

    expect(screen.getByText("Add from preset")).toBeInTheDocument();
    expect(screen.getByText("Box truck")).toBeInTheDocument();
    expect(screen.queryByText("Military movers / HHG")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Transport resource cards" }),
    ).not.toBeInTheDocument();
  });

  it("opens the add resource workflow from the add hash", async () => {
    window.history.replaceState(
      null,
      "",
      "/app/moves/move_123/load-plan#add-transport-resource",
    );

    render(
      <TransportResourcesPanel
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
        moveTitle="Summer move"
        moveType="local"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Add" })).toHaveAttribute(
        "data-state",
        "active",
      );
    });

    expect(screen.getByText("Add from preset")).toBeInTheDocument();
    expect(screen.getByText("Box truck")).toBeInTheDocument();
    expect(screen.queryByText("Moving truck")).not.toBeInTheDocument();
  });

  it("opens capacity posture from the capacity hash", async () => {
    window.history.replaceState(
      null,
      "",
      "/app/moves/move_123/load-plan#capacity-posture",
    );

    render(
      <TransportResourcesPanel
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
        moveTitle="Summer move"
        moveType="local"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Capacity" })).toHaveAttribute(
        "data-state",
        "active",
      );
    });

    expect(screen.getByText("Capacity posture")).toBeInTheDocument();
    expect(
      screen.getByText(/Trucks and trailers get weight\/volume defaults/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Transport capacity review" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Add from preset")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Transport resource cards" }),
    ).not.toBeInTheDocument();
  });
});
