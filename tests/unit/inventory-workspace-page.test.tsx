import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { MoveWorkspaceValue } from "@/components/move-workspace-context";
import type { Id } from "../../convex/_generated/dataModel";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/moves/move_123/inventory",
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/components/move-workspace-context", () => ({
  useMoveWorkspace: () =>
    ({
      householdId: "household_123" as Id<"households">,
      moveId: "move_123" as Id<"moves">,
      selectedMove: {
        _id: "move_123" as Id<"moves">,
        _creationTime: 1,
        householdId: "household_123" as Id<"households">,
        title: "Test move",
        type: "local",
        status: "planning",
        origin: "Old home",
        destination: "New home",
        unitSystem: "imperial",
        createdByUserId: "user_123" as Id<"users">,
        createdAt: 1,
        updatedAt: 1,
      },
      selectHousehold: vi.fn(),
      households: [],
      moves: [],
      activeMoves: [],
      selectMove: vi.fn(),
      featureFlags: [],
      loadingIdentity: false,
      loadingHouseholds: false,
      loadingMoves: false,
      moveLinkMessage: null,
    }) satisfies MoveWorkspaceValue,
}));

vi.mock("@/components/inventory-table", () => ({
  InventoryTable: () => <div>Items table surface</div>,
}));

vi.mock("@/components/room-walk-intake", () => ({
  RoomWalkIntake: () => <div>Capture room walk</div>,
}));

vi.mock("@/components/planned-items-panel", () => ({
  PlannedItemsPanel: () => <div>Planned items workspace</div>,
}));

vi.mock("@/components/inventory-duplicate-review", () => ({
  InventoryDuplicateReview: () => <div>Duplicate review workspace</div>,
}));

vi.mock("@/components/disposition-pipeline-panel", () => ({
  DispositionPipelinePanel: () => <div>Disposition pipeline workspace</div>,
}));

vi.mock("@/components/estimate-summary", () => ({
  EstimateSummary: () => <div>Estimate summary workspace</div>,
}));

import { InventoryWorkspacePage } from "@/components/move-pages/inventory-page";

describe("InventoryWorkspacePage", () => {
  it("puts the item table first and moves secondary workflows behind tabs", async () => {
    const user = userEvent.setup();

    render(<InventoryWorkspacePage />);

    expect(screen.getByRole("tab", { name: "Items" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByRole("tab", { name: "Capture" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Planned" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Review" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Disposition" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Estimates" })).toBeInTheDocument();
    expect(screen.getByText("Items table surface")).toBeInTheDocument();
    expect(screen.queryByText("Capture room walk")).not.toBeInTheDocument();
    expect(screen.queryByText("Planned items workspace")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Capture" }));
    expect(screen.getByText("Capture room walk")).toBeInTheDocument();
    expect(screen.queryByText("Planned items workspace")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Planned" }));
    expect(screen.getByText("Planned items workspace")).toBeInTheDocument();
    expect(screen.queryByText("Capture room walk")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Duplicate review workspace")
    ).not.toBeInTheDocument();
  });
});
