import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useMutation: () => mockCreate,
}));

import { BulkInventoryIntake } from "@/components/bulk-inventory-intake";

describe("BulkInventoryIntake", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("reviews parsed inventory drafts as cards with a constrained desktop table", async () => {
    const user = userEvent.setup();

    render(
      <BulkInventoryIntake
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
        onCreated={vi.fn()}
      />,
    );

    await user.type(
      screen.getByPlaceholderText(
        "Garage: two bikes, red toolbox, camping tent",
      ),
      "Garage: two bikes, red toolbox, camping tent with extra notes that should not widen the review surface",
    );
    await user.click(screen.getByRole("button", { name: "Parse" }));

    expect(screen.getByText("Review parsed drafts")).toBeInTheDocument();
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Item" }),
    ).toBeInTheDocument();

    const cards = screen.getByRole("list", {
      name: "Parsed inventory draft cards",
    });
    expect(within(cards).getByDisplayValue("bikes")).toBeInTheDocument();
    expect(within(cards).getByDisplayValue("red toolbox")).toBeInTheDocument();
    expect(
      within(cards).getByDisplayValue(
        "camping tent with extra notes that should not widen the review surface",
      ),
    ).toBeInTheDocument();
    expect(
      within(cards).getAllByText(/Source: Garage: two bikes/).length,
    ).toBeGreaterThan(0);
  });
});
