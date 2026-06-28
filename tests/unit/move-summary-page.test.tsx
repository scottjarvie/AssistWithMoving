import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  transportResources: { listForMove: "transportResources.listForMove" },
  moves: { householdMemberCount: "moves.householdMemberCount" },
}));

// Reconfigured per test before render.
const state = vi.hoisted(() => ({
  workspace: {} as Record<string, unknown>,
  transport: [] as unknown[],
  memberCount: undefined as number | undefined,
}));

vi.mock("../../convex/_generated/api", () => ({ api: apiMock }));

vi.mock("@/components/move-workspace-context", () => ({
  useMoveWorkspace: () => state.workspace,
}));

// Header + operations nav are exercised elsewhere; stub them so this test
// focuses on the summary content.
vi.mock("@/components/move-workspace-header", () => ({
  MoveWorkspaceHeader: () => <div>header</div>,
}));
vi.mock("@/components/move-operations-nav", () => ({
  MoveOperationsNav: () => <div>nav</div>,
}));

vi.mock("convex/react", () => ({
  useQuery: (query: string) =>
    query === apiMock.transportResources.listForMove
      ? state.transport
      : query === apiMock.moves.householdMemberCount
        ? state.memberCount
        : undefined,
}));

import { MoveSummaryPage } from "@/components/move-pages/move-summary-page";

const baseMove = {
  _id: "move_1" as Id<"moves">,
  title: "Nashua move",
  type: "household",
  status: "active",
};

describe("MoveSummaryPage (MOVE-307/308/309/310)", () => {
  it("shows configured facts with gears that deep-link to Configure tabs", () => {
    state.workspace = {
      householdId: "household_1" as Id<"households">,
      moveId: "move_1" as Id<"moves">,
      selectedMove: {
        ...baseMove,
        origin: "Boston, MA",
        destination: "Nashua, NH",
        distanceMiles: 42,
        dateStart: "2026-07-15",
        dateEnd: "2026-07-18",
      },
    };
    state.transport = [
      { _id: "t1", name: "Rental truck", archivedAt: undefined },
      { _id: "t2", name: "Trailer", archivedAt: undefined },
      { _id: "t3", name: "Archived van", archivedAt: 123 },
    ];
    state.memberCount = 3;

    render(<MoveSummaryPage />);

    // Stage badge with the agreed vocabulary.
    expect(screen.getByText("Active")).toBeInTheDocument();

    // Facts present.
    expect(screen.getByText("Boston, MA → Nashua, NH")).toBeInTheDocument();
    expect(screen.getByText("42 mi")).toBeInTheDocument();
    expect(screen.getByText("3 members")).toBeInTheDocument();
    // Transport counts only the non-archived methods.
    expect(
      screen.getByText(/2 methods · Rental truck, Trailer/),
    ).toBeInTheDocument();

    // Gears deep-link to the right Configure hash tab.
    expect(
      screen.getByRole("link", { name: "Configure Distance" }),
    ).toHaveAttribute("href", "/app/moves/move_1/configure#details");
    expect(
      screen.getByRole("link", { name: "Configure Route" }),
    ).toHaveAttribute("href", "/app/moves/move_1/configure#start");
    expect(
      screen.getByRole("link", { name: "Configure Transportation" }),
    ).toHaveAttribute("href", "/app/moves/move_1/configure#transport");
  });

  it("hides household when it's just the default member and shows a get-started prompt when nothing is configured", () => {
    state.workspace = {
      householdId: "household_1" as Id<"households">,
      moveId: "move_1" as Id<"moves">,
      selectedMove: { ...baseMove, status: "planning" },
    };
    state.transport = [];
    state.memberCount = 1;

    render(<MoveSummaryPage />);

    expect(screen.getByText("Planning")).toBeInTheDocument();
    // No facts → the empty get-started prompt with a Configure CTA.
    expect(screen.getByText(/Let.s set up this move/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Configure the move/ }),
    ).toHaveAttribute("href", "/app/moves/move_1/configure");
    // Household row is suppressed for the lone default member.
    expect(screen.queryByText("1 members")).not.toBeInTheDocument();
  });
});
