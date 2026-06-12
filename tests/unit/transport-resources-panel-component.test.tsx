import { render, screen, within } from "@testing-library/react";
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
    transportData.mutation.mockReset();
  });

  it("shows transport resources before opening preset setup", async () => {
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
    expect(screen.queryByText("Add from preset")).not.toBeInTheDocument();
    expect(screen.queryByText("Box truck")).not.toBeInTheDocument();
    expect(screen.getByText("Capacity posture")).toBeInTheDocument();
    expect(
      screen.queryByText(/Trucks and trailers get weight\/volume defaults/),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Review capacity" }));

    expect(
      screen.getByText(/Trucks and trailers get weight\/volume defaults/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hide capacity notes" }),
    ).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "Add resource" }));

    const presetHeading = screen.getByText("Add from preset");
    expect(presetHeading).toBeInTheDocument();
    expect(screen.getByText("Box truck")).toBeInTheDocument();
    expect(screen.queryByText("Military movers / HHG")).not.toBeInTheDocument();
    expect(
      cards.compareDocumentPosition(presetHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
