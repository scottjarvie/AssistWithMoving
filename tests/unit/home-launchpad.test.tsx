import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const state = vi.hoisted(() => ({
  workspace: {
    activeMoves: [] as Array<{ _id: Id<"moves">; title: string }>,
    selectedMove: null as { _id: Id<"moves">; title: string } | null,
    loadingMoves: false,
  },
}));

vi.mock("@/components/move-workspace-context", () => ({
  useMoveWorkspace: () => state.workspace,
}));

import { HomeLaunchpad } from "@/components/home-launchpad";

describe("HomeLaunchpad", () => {
  it("renders one banner-shaped skeleton while move shortcuts load", () => {
    state.workspace = {
      activeMoves: [],
      selectedMove: null,
      loadingMoves: true,
    };

    const { container } = render(<HomeLaunchpad />);

    expect(screen.getByLabelText("Loading move shortcuts")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1);
    expect(screen.queryByText("Create your first move")).not.toBeInTheDocument();
  });

  it("renders loaded move shortcuts without skeletons", () => {
    state.workspace = {
      activeMoves: [
        { _id: "move_123" as Id<"moves">, title: "Summer move" },
      ],
      selectedMove: null,
      loadingMoves: false,
    };

    const { container } = render(<HomeLaunchpad />);

    expect(screen.getByText("Summer move")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);
  });
});
