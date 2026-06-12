import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MoveWorkspaceValue } from "@/components/move-workspace-context";
import type { Id } from "../../convex/_generated/dataModel";

const mockRouter = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
}));

vi.mock("@/components/convex-auth-status", () => ({
  ConvexAuthStatus: () => <div>Auth status surface</div>,
}));

vi.mock("@/components/move-workspace-context", () => ({
  useMoveWorkspace: () =>
    ({
      householdId: "household_123" as Id<"households">,
      moveId: "move_123" as Id<"moves">,
      selectedMove: undefined,
      selectHousehold: vi.fn(),
      households: [
        {
          household: {
            _id: "household_123" as Id<"households">,
            _creationTime: 1,
            name: "Jarvie household",
            createdAt: 1,
            updatedAt: 1,
            createdByUserId: "user_123" as Id<"users">,
            ownerUserId: "user_123" as Id<"users">,
          },
          role: "owner",
        },
      ],
      moves: [],
      activeMoves: [
        {
          _id: "move_123" as Id<"moves">,
          _creationTime: 1,
          householdId: "household_123" as Id<"households">,
          title: "Summer move",
          type: "local",
          status: "planning",
          origin: "Old house",
          destination: "New house",
          unitSystem: "imperial",
          createdByUserId: "user_123" as Id<"users">,
          createdAt: 1,
          updatedAt: 1,
          documentationProfileTypes: ["personalFullRecord"],
        },
      ],
      selectMove: vi.fn(),
      featureFlags: [],
      loadingIdentity: false,
      loadingHouseholds: false,
      loadingMoves: false,
      moveLinkMessage: null,
    }) satisfies MoveWorkspaceValue,
}));

import { MoveDashboard } from "@/components/move-dashboard";

describe("MoveDashboard", () => {
  it("opens on active moves before setup forms", () => {
    render(<MoveDashboard />);

    expect(screen.getByRole("tab", { name: "Moves" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByRole("tab", { name: "Create move" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Household" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "AI connection" })).toBeInTheDocument();
    const activeMove = screen.getByText("Summer move");
    const summary = screen.getByText("Workspace summary");
    expect(activeMove.compareDocumentPosition(summary)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(
      screen.getByRole("link", { name: "Open workspace" })
    ).toHaveAttribute("href", "/app/moves/move_123");
    expect(
      screen.getByRole("link", { name: "Open selected move" })
    ).toHaveAttribute("href", "/app/moves/move_123");
    expect(screen.queryByLabelText("Move title")).not.toBeInTheDocument();
  });
});
