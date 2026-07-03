import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  transportResources: {
    listForMoveWithZones: "transportResources.listForMoveWithZones",
    createFromPreset: "transportResources.createFromPreset",
    update: "transportResources.update",
  },
}));

const transportData = vi.hoisted(() => ({
  resources: [
    {
      resource: {
        _id: "resource_1" as Id<"transportResources">,
        name: "Rental truck",
        type: "movingTruck",
        capacity: { maxWeightLb: 2000 },
      },
      zones: [],
    },
  ],
  mutation: vi.fn(),
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

vi.mock("@/components/configure/transport-trips-editor", () => ({
  TransportTripsEditor: () => <div>Trips editor</div>,
}));

import { TransportMethodsPanel } from "@/components/configure/transport-methods-panel";

describe("TransportMethodsPanel inline capacity edit", () => {
  beforeEach(() => {
    transportData.mutation.mockReset();
  });

  it("closes the capacity edit with Escape without saving", async () => {
    const user = userEvent.setup();

    render(
      <TransportMethodsPanel
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(
      screen.getByLabelText("Rental truck weight limit"),
      "9999",
    );
    await user.keyboard("{Escape}");

    expect(
      screen.queryByLabelText("Rental truck weight limit"),
    ).not.toBeInTheDocument();
    expect(transportData.mutation).not.toHaveBeenCalled();
  });
});
