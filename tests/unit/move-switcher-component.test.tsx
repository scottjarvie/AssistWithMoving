import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import type { MoveWorkspaceValue } from "@/components/move-workspace-context";

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

const workspaceMock = vi.hoisted(() => {
  const activeMoves = [
    {
      _id: "move_current" as Id<"moves">,
      _creationTime: 1,
      householdId: "household_123" as Id<"households">,
      title: "Phoenix apartment",
      type: "local" as const,
      status: "active" as const,
      origin: "Tempe",
      destination: "Phoenix",
      unitSystem: "imperial" as const,
      createdByUserId: "user_123" as Id<"users">,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      _id: "move_denver" as Id<"moves">,
      _creationTime: 2,
      householdId: "household_123" as Id<"households">,
      title: "Denver storage",
      type: "storage" as const,
      status: "planning" as const,
      origin: "Mesa",
      destination: "Denver",
      unitSystem: "imperial" as const,
      createdByUserId: "user_123" as Id<"users">,
      createdAt: 2,
      updatedAt: 2,
    },
    ...Array.from({ length: 34 }, (_, index) => ({
      _id: `move_bulk_${index}` as Id<"moves">,
      _creationTime: index + 3,
      householdId: "household_123" as Id<"households">,
      title: `Bulk move ${String(index + 1).padStart(2, "0")}`,
      type: "local" as const,
      status: "planning" as const,
      origin: "Salt Lake City",
      destination: "Cedar City",
      unitSystem: "imperial" as const,
      createdByUserId: "user_123" as Id<"users">,
      createdAt: index + 3,
      updatedAt: index + 3,
    })),
  ];

  return {
    activeMoves,
    selectMove: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/moves/move_current/inventory",
  useRouter: () => routerMock,
}));

vi.mock("@/components/move-workspace-context", () => ({
  useMoveWorkspace: () =>
    ({
      householdId: "household_123" as Id<"households">,
      selectHousehold: vi.fn(),
      households: [],
      moves: workspaceMock.activeMoves,
      activeMoves: workspaceMock.activeMoves,
      moveId: "move_current" as Id<"moves">,
      selectMove: workspaceMock.selectMove,
      selectedMove: workspaceMock.activeMoves[0],
      featureFlags: [],
      loadingIdentity: false,
      loadingHouseholds: false,
      loadingMoves: false,
      loadingParticipantMoves: false,
      moveLinkMessage: null,
    }) satisfies MoveWorkspaceValue,
}));

import { MoveSwitcher } from "@/components/move-switcher";

describe("MoveSwitcher", () => {
  beforeEach(() => {
    workspaceMock.selectMove.mockClear();
    routerMock.push.mockClear();
    routerMock.replace.mockClear();
  });

  it("keeps a 35+ move workspace searchable and keyboard-switchable", async () => {
    const user = userEvent.setup();
    render(<MoveSwitcher />);

    await user.click(
      screen.getByRole("button", { name: /Phoenix apartment/i }),
    );

    const search = screen.getByRole("searchbox", {
      name: "Search active moves",
    });
    await waitFor(() => expect(search).toHaveFocus());
    expect(screen.getByRole("status")).toHaveTextContent("36 moves");

    await user.type(search, "Denver");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 36 moves");
    expect(
      screen.getByRole("button", { name: "Switch to Denver storage" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Switch to Bulk move 01" }),
    ).not.toBeInTheDocument();

    await user.keyboard("{ArrowDown}{Enter}");

    expect(workspaceMock.selectMove).toHaveBeenCalledWith("move_denver");
    expect(routerMock.replace).toHaveBeenCalledWith(
      "/app/moves/move_denver/inventory",
    );

    const updatedTrigger = screen.getByRole("button", {
      name: "Phoenix apartment",
    });
    expect(updatedTrigger).toHaveFocus();

    await user.click(updatedTrigger);
    await waitFor(() =>
      expect(
        screen.getByRole("searchbox", { name: "Search active moves" }),
      ).toHaveFocus(),
    );
    await user.keyboard("{Escape}");
    expect(updatedTrigger).toHaveFocus();
  });
});
