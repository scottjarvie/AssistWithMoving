import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MoveWorkspaceValue } from "@/components/move-workspace-context";
import type { Id } from "../../convex/_generated/dataModel";

const routerMock = vi.hoisted(() => ({
  replace: vi.fn(),
}));

const workspaceMock = vi.hoisted(() => ({
  pathname: "/app/moves/move_123/inventory",
  selectMove: vi.fn(),
  activeMoves: [
    {
      _id: "move_123" as Id<"moves">,
      _creationTime: 1,
      householdId: "household_123" as Id<"households">,
      title: "Local move",
      type: "local" as const,
      status: "planning" as const,
      origin: "Old home",
      destination: "New home",
      unitSystem: "imperial" as const,
      createdByUserId: "user_123" as Id<"users">,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      _id: "move_456" as Id<"moves">,
      _creationTime: 2,
      householdId: "household_123" as Id<"households">,
      title: "Storage move",
      type: "storage" as const,
      status: "planning" as const,
      origin: "Storage unit",
      destination: "Apartment",
      unitSystem: "imperial" as const,
      createdByUserId: "user_123" as Id<"users">,
      createdAt: 2,
      updatedAt: 2,
    },
  ],
  moveLinkMessage: null as string | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => workspaceMock.pathname,
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
      moveId: "move_123" as Id<"moves">,
      selectMove: workspaceMock.selectMove,
      selectedMove: workspaceMock.activeMoves[0],
      featureFlags: [],
      loadingIdentity: false,
      loadingHouseholds: false,
      loadingMoves: false,
      loadingParticipantMoves: false,
      moveLinkMessage: workspaceMock.moveLinkMessage,
    }) satisfies MoveWorkspaceValue,
}));

import { MoveWorkspaceHeader } from "@/components/move-workspace-header";

describe("MoveWorkspaceHeader", () => {
  beforeEach(() => {
    workspaceMock.pathname = "/app/moves/move_123/inventory";
    workspaceMock.moveLinkMessage = null;
    workspaceMock.selectMove.mockClear();
    routerMock.replace.mockClear();
  });

  it("renders compact move context before page task content", () => {
    const { container } = render(
      <MoveWorkspaceHeader
        title="Inventory"
        description="Browse item records, capture by room, and review disposition or estimate work."
      />,
    );

    expect(screen.getByRole("heading", { name: "Inventory" })).toBeInTheDocument();
    const header = container.querySelector("section");
    expect(header).toHaveClass("border-b", "pb-4");
    expect(header).not.toHaveClass("rounded-lg");
    expect(within(header!).getByText("local")).toBeInTheDocument();
    expect(within(header!).getAllByText("Local move")).toHaveLength(2);
    expect(within(header!).getByText("Old home -> New home")).toBeInTheDocument();
  });

  it("switches moves without losing the current workspace section", async () => {
    const user = userEvent.setup();

    render(
      <MoveWorkspaceHeader
        title="Inventory"
        description="Browse item records, capture by room, and review disposition or estimate work."
      />,
    );

    await user.selectOptions(screen.getByLabelText("Selected move"), "move_456");

    expect(workspaceMock.selectMove).toHaveBeenCalledWith("move_456");
    expect(routerMock.replace).toHaveBeenCalledWith(
      "/app/moves/move_456/inventory",
    );
  });
});
