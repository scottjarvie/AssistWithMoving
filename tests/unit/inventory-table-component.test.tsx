import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import type { InventoryItem } from "@/lib/inventory-types";

const mockItems = vi.hoisted(() => ({
  rows: [
    {
      _id: "item_1",
      name: "Walnut media console",
      description:
        "A very long note about scratches, cable holes, accessories, matching shelves, and packing context that should not force the entire table to become unusably wide.",
      room: "Den",
      category: "Furniture",
      ownerContact: null,
      ownerPersonId: undefined,
      condition: "good",
      weightConfidence: "medium",
      volumeConfidence: "medium",
      status: "active",
      disposition: "mover",
      needsReview: true,
      highValue: true,
      requiresPersonalTransport: true,
      planningDefaultKeys: [],
      signals: {
        photoCount: 2,
        evidencePhotoCount: 1,
        boxCount: 1,
        assignmentCount: 1,
        boxCodes: ["B-001"],
        assignedResourceNames: ["Truck"],
        assignedZoneNames: ["Front"],
      },
    },
  ] as unknown as InventoryItem[],
  update: vi.fn(),
  create: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => mockItems.rows,
  useMutation: mockItems.useMutation,
}));

import { InventoryTable } from "@/components/inventory-table";

describe("InventoryTable", () => {
  it("keeps filters and columns above a sortable, compact item table", () => {
    mockItems.useMutation
      .mockReturnValueOnce(mockItems.create)
      .mockReturnValueOnce(mockItems.update);

    render(
      <InventoryTable
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />
    );

    expect(screen.getByText("Saved views")).toBeInTheDocument();
    expect(screen.getByLabelText("Search inventory")).toBeInTheDocument();
    expect(screen.getByText("Columns")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort by Item" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort by Room" })).toBeInTheDocument();
    expect(screen.getByText("Walnut media console")).toBeInTheDocument();
    expect(screen.getByText("review")).toBeInTheDocument();
    expect(screen.getByText("value")).toBeInTheDocument();
    expect(screen.getByText("personal")).toBeInTheDocument();
    expect(screen.getByText("+4")).toBeInTheDocument();
    expect(screen.queryByText("photos 2")).not.toBeInTheDocument();
  });
});
