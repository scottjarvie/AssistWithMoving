import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  households: {
    create: "households.create",
  },
  moves: {
    create: "moves.create",
    listForHousehold: "moves.listForHousehold",
  },
}));

const movesHomeData = vi.hoisted(() => ({
  createHousehold: vi.fn(),
  createMove: vi.fn(),
  selectHousehold: vi.fn(),
  selectMove: vi.fn(),
  workspace: {
    householdId: null as Id<"households"> | null,
    households: [] as unknown[],
    activeMoves: [] as unknown[],
    moveId: null as Id<"moves"> | null,
    loadingIdentity: false,
    loadingHouseholds: false,
    loadingMoves: false,
    loadingParticipantMoves: false,
  },
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: (mutation: string) =>
    mutation === apiMock.households.create
      ? movesHomeData.createHousehold
      : movesHomeData.createMove,
  useQuery: () => [],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/move-workspace-context", () => ({
  useMoveWorkspace: () => ({
    ...movesHomeData.workspace,
    selectHousehold: movesHomeData.selectHousehold,
    selectMove: movesHomeData.selectMove,
  }),
}));

vi.mock("@/components/moves-stats-strip", () => ({
  MovesStatsStrip: () => <div data-testid="moves-stats-strip" />,
}));

vi.mock("@/components/move-management", () => ({
  ActiveMoveMenu: () => <button type="button">Move menu</button>,
  ArchivedMovesSection: () => null,
}));

import { MovesHome } from "@/components/moves-home";

describe("MovesHome", () => {
  beforeEach(() => {
    movesHomeData.createHousehold.mockReset();
    movesHomeData.createHousehold.mockResolvedValue(
      "household_new" as Id<"households">,
    );
    movesHomeData.createMove.mockReset();
    movesHomeData.selectHousehold.mockReset();
    movesHomeData.selectMove.mockReset();
    movesHomeData.workspace.householdId = null;
    movesHomeData.workspace.households = [];
    movesHomeData.workspace.activeMoves = [];
    movesHomeData.workspace.moveId = null;
    movesHomeData.workspace.loadingIdentity = false;
    movesHomeData.workspace.loadingHouseholds = false;
    movesHomeData.workspace.loadingMoves = false;
    movesHomeData.workspace.loadingParticipantMoves = false;
  });

  it("submits the one-field household form with Enter", async () => {
    const user = userEvent.setup();

    render(<MovesHome />);

    const input = screen.getByLabelText("Household name");
    await user.clear(input);
    await user.type(input, "Jarvie home{Enter}");

    await waitFor(() => {
      expect(movesHomeData.createHousehold).toHaveBeenCalledWith({
        name: "Jarvie home",
      });
    });
    expect(movesHomeData.selectHousehold).toHaveBeenCalledWith("household_new");
    expect(
      screen.getByRole("button", { name: /Create household/ }),
    ).toHaveAttribute("type", "submit");
  });

  it("keeps move-card controls above the link overlay without nesting buttons in the link", () => {
    movesHomeData.workspace.householdId = "household_123" as Id<"households">;
    movesHomeData.workspace.households = [
      {
        household: { _id: "household_123" as Id<"households">, name: "Home" },
        role: "owner",
      },
    ];
    movesHomeData.workspace.activeMoves = [
      {
        _id: "move_123" as Id<"moves">,
        title: "Lake move",
        origin: "Salt Lake City",
        destination: "Denver",
        status: "planning",
      },
    ];

    render(<MovesHome />);

    const link = screen.getByRole("link", { name: "Open Lake move" });
    const menu = screen.getByRole("button", { name: "Move menu" });

    expect(link).toHaveClass("absolute", "inset-0", "z-0");
    expect(menu.closest("a")).toBeNull();
    expect(menu.closest(".z-10")).not.toBeNull();
  });
});
