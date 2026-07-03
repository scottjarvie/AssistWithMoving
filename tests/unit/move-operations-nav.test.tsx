import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pathname: "/app/moves/move_123",
  moveId: "move_123",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
}));

vi.mock("@/components/move-workspace-context", () => ({
  useOptionalMoveWorkspace: () => ({ moveId: state.moveId }),
}));

import { MoveOperationsNav } from "@/components/move-operations-nav";

describe("MoveOperationsNav", () => {
  beforeEach(() => {
    state.pathname = "/app/moves/move_123";
    state.moveId = "move_123";
  });

  it("links Layout Studio from the move operations nav", () => {
    render(<MoveOperationsNav />);

    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute(
      "href",
      "/app/moves/move_123/plan",
    );
  });

  it("keeps Plan and Load Plan active states isolated", () => {
    state.pathname = "/app/moves/move_123/plan";

    const { rerender } = render(<MoveOperationsNav />);

    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Load Plan" })).not.toHaveAttribute(
      "aria-current",
    );

    state.pathname = "/app/moves/move_123/load-plan";
    rerender(<MoveOperationsNav />);

    expect(screen.getByRole("link", { name: "Load Plan" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Plan" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps Overview demoted out of the operations nav", () => {
    render(<MoveOperationsNav />);

    expect(
      screen.queryByRole("link", { name: /overview/i }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing without a selected move", () => {
    state.moveId = "";

    const { container } = render(<MoveOperationsNav />);

    expect(container).toBeEmptyDOMElement();
  });
});
