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
  push: vi.fn(),
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
  useRouter: () => ({ push: movesHomeData.push }),
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
    movesHomeData.createMove.mockResolvedValue("move_new" as Id<"moves">);
    movesHomeData.push.mockReset();
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

  it("creates the private workspace and first move from one short form", async () => {
    const user = userEvent.setup();

    render(<MovesHome />);

    const title = screen.getByLabelText("Move name");
    await user.clear(title);
    await user.type(title, "Codex first move");
    await user.type(screen.getByLabelText("Moving from (optional)"), "Phoenix");
    await user.type(screen.getByLabelText("Moving to (optional)"), "Tucson");
    await user.click(screen.getByRole("button", { name: "Create private move" }));

    await waitFor(() => {
      expect(movesHomeData.createHousehold).toHaveBeenCalledWith({
        name: "My moving workspace",
      });
    });
    expect(movesHomeData.createMove).toHaveBeenCalledWith({
      householdId: "household_new",
      title: "Codex first move",
      type: "local",
      origin: "Phoenix",
      destination: "Tucson",
      unitSystem: "imperial",
    });
    expect(movesHomeData.selectHousehold).toHaveBeenCalledWith("household_new");
    expect(movesHomeData.selectMove).toHaveBeenCalledWith("move_new");
    expect(movesHomeData.push).toHaveBeenCalledWith("/app/moves/move_new");
    expect(screen.getByText(/Nothing is shared when you create it/)).toBeVisible();
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

  it("keeps a dense move list searchable, filterable, and deterministically sortable", async () => {
    const user = userEvent.setup();
    movesHomeData.workspace.householdId = "household_123" as Id<"households">;
    movesHomeData.workspace.households = [
      {
        household: { _id: "household_123" as Id<"households">, name: "Home" },
        role: "owner",
      },
    ];
    movesHomeData.workspace.activeMoves = [
      {
        _id: "move_zion" as Id<"moves">,
        title: "Zion move",
        origin: "Phoenix",
        destination: "Denver",
        status: "planning",
      },
      {
        _id: "move_alpine" as Id<"moves">,
        title: "Alpine move",
        origin: "Boise",
        destination: "Seattle",
        status: "active",
      },
      {
        _id: "move_bay" as Id<"moves">,
        title: "Bay move",
        origin: "Tampa",
        destination: "Miami",
        status: "completed",
      },
      ...Array.from({ length: 33 }, (_, index) => ({
        _id: `move_bulk_${index}` as Id<"moves">,
        title: `Bulk move ${String(index + 1).padStart(2, "0")}`,
        origin: "Salt Lake City",
        destination: "Cedar City",
        status: index % 2 === 0 ? "planning" : "active",
      })),
    ];

    render(<MovesHome />);

    expect(screen.getAllByRole("link", { name: /^Open / })).toHaveLength(36);
    expect(screen.getByRole("status")).toHaveTextContent("36 moves");

    await user.type(screen.getByRole("searchbox", { name: "Search moves" }), "phoenix");

    expect(screen.getAllByRole("link", { name: /^Open / })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open Zion move" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("1 of 36 moves");

    await user.clear(screen.getByRole("searchbox", { name: "Search moves" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter moves by status" }),
      "completed",
    );

    expect(screen.getAllByRole("link", { name: /^Open / })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open Bay move" })).toBeVisible();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter moves by status" }),
      "all",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sort moves" }),
      "name",
    );

    expect(screen.getAllByRole("link", { name: /^Open / })[0]).toHaveAccessibleName(
      "Open Alpine move",
    );

    await user.type(screen.getByRole("searchbox", { name: "Search moves" }), "no such move");

    expect(screen.getByText("No moves match this search and status.")).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Clear search and filters" }),
    ).toHaveLength(1);
    await user.click(
      screen.getByRole("button", { name: "Clear search and filters" }),
    );
    expect(screen.getAllByRole("link", { name: /^Open / })).toHaveLength(36);
  });
});
