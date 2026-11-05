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

  it("retains every destination and AI guidance while limiting the move overview to three real records", () => {
    const moves = ["Spring", "Summer", "Autumn", "Winter"].map((title, index) => ({ _id: `move_${index}` as Id<"moves">, title }));
    state.workspace = { activeMoves: moves, selectedMove: moves[1], loadingMoves: false };
    render(<HomeLaunchpad />);

    expect(screen.getByRole("region", { name: "Your moves" })).toHaveTextContent("4 active");
    expect(screen.getByRole("link", { name: /Summer/ })).toHaveAttribute("href", "/app/moves/move_1");
    expect(screen.getByRole("link", { name: /Open all moves/ })).toHaveAttribute("href", "/app/moves");
    expect(screen.queryByRole("link", { name: /Winter/ })).not.toBeInTheDocument();
    const destinations = screen.getByRole("navigation", { name: "Main destinations" });
    for (const href of ["/app/moves", "/app/movable-units", "/app/items", "/app/spaces-transport", "/app/queue"]) {
      expect(destinations.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
    expect(screen.getByRole("link", { name: "Connect your AI" })).toHaveAttribute("href", "/settings/ai");
    expect(screen.getByRole("link", { name: /See what it can do/ })).toHaveAttribute("href", "/ai");
    expect(screen.getByText(/Queue claiming uses the separate scoped API-key tools today/)).toBeInTheDocument();
  });
});
