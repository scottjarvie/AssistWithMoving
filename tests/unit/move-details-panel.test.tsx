import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  moves: { updateBasics: "moves.updateBasics" },
}));
const updateBasics = vi.hoisted(() => vi.fn());

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: () => updateBasics,
}));

import { MoveDetailsPanel } from "@/components/configure/move-details-panel";

describe("MoveDetailsPanel", () => {
  it("renders form-shaped skeletons while move context loads", () => {
    const { container } = render(
      <MoveDetailsPanel householdId={null} moveId={null} move={undefined} />,
    );

    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Save logistics" }),
    ).not.toBeInTheDocument();
  });
});
