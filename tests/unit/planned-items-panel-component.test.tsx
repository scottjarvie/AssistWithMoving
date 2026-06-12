import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const mockData = vi.hoisted(() => ({
  plannedItems: [] as unknown[],
  mutation: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => mockData.plannedItems,
  useMutation: () => mockData.mutation,
}));

import { PlannedItemsPanel } from "@/components/planned-items-panel";

describe("PlannedItemsPanel", () => {
  beforeEach(() => {
    mockData.mutation.mockReset();
    mockData.plannedItems = [
      {
        _id: "planned_1",
        name: "Walnut dining table",
        category: "Furniture",
        dimensionsIn: { lengthIn: 72, widthIn: 36, heightIn: 30 },
        estimatedPriceCents: 120000,
        url: "https://example.com/walnut-table",
        priority: 2,
        status: "idea",
        convertedItemId: undefined,
        archivedAt: undefined,
      },
    ];
  });

  it("shows planned item records before opening the add form", async () => {
    const user = userEvent.setup();

    render(
      <PlannedItemsPanel
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    const cards = screen.getByRole("list", { name: "Planned item cards" });
    expect(cards).toBeInTheDocument();
    expect(screen.getByText("Walnut dining table")).toBeInTheDocument();
    expect(screen.getByText("1 planned")).toBeInTheDocument();
    expect(screen.queryByLabelText("Planned item name")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add planned" }));

    const nameInput = screen.getByLabelText("Planned item name");
    expect(nameInput).toBeInTheDocument();
    expect(screen.getByText("Walnut dining table")).toBeInTheDocument();
    expect(
      cards.compareDocumentPosition(nameInput) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
