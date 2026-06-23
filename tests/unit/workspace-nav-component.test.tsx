import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  pathname: "/app/moves",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockState.pathname,
}));

import { WorkspaceNav } from "@/components/workspace-nav";

describe("WorkspaceNav", () => {
  beforeEach(() => {
    mockState.pathname = "/app/moves";
  });

  it("renders exactly the four global destinations", () => {
    render(<WorkspaceNav />);

    const nav = screen.getByRole("navigation", { name: "Primary" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(4);

    expect(within(nav).getByRole("link", { name: "Moves" })).toHaveAttribute(
      "href",
      "/app/moves",
    );
    expect(
      within(nav).getByRole("link", { name: "Movable Units" }),
    ).toHaveAttribute("href", "/app/movable-units");
    expect(within(nav).getByRole("link", { name: "Items" })).toHaveAttribute(
      "href",
      "/app/items",
    );
    expect(within(nav).getByRole("link", { name: "Queue" })).toHaveAttribute(
      "href",
      "/app/queue",
    );
  });

  it("drops the former dashboard, capture, and section links", () => {
    render(<WorkspaceNav />);

    expect(
      screen.queryByRole("link", { name: /dashboard/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /capture/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^inventory$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /layout/i }),
    ).not.toBeInTheDocument();
  });

  it("marks Moves active on the moves home", () => {
    mockState.pathname = "/app/moves";

    render(<WorkspaceNav />);

    const movesLink = screen.getByRole("link", { name: "Moves" });
    expect(movesLink).toHaveAttribute("aria-current", "page");
    expect(movesLink).toHaveClass("bg-sidebar-accent");

    expect(
      screen.getByRole("link", { name: "Movable Units" }),
    ).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Items" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps Moves active on a nested per-move path", () => {
    mockState.pathname = "/app/moves/move_123/inventory";

    render(<WorkspaceNav />);

    expect(screen.getByRole("link", { name: "Moves" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Movable Units" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("lights up Items on the items surface and its sub-paths", () => {
    mockState.pathname = "/app/items/item_123";

    render(<WorkspaceNav />);

    const itemsLink = screen.getByRole("link", { name: "Items" });
    expect(itemsLink).toHaveAttribute("aria-current", "page");
    expect(itemsLink).toHaveClass("bg-sidebar-accent");
    expect(screen.getByRole("link", { name: "Moves" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("renders the same four links in a mobile grid with the short Units label", () => {
    mockState.pathname = "/app/movable-units";

    render(<WorkspaceNav variant="mobile" />);

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toHaveClass("grid", "grid-cols-4");
    expect(within(nav).getAllByRole("link")).toHaveLength(4);

    expect(within(nav).getByRole("link", { name: "Queue" })).toHaveAttribute(
      "href",
      "/app/queue",
    );

    // The cramped bottom bar uses the shorter "Units" label for Movable Units.
    const unitsLink = within(nav).getByRole("link", { name: "Units" });
    expect(unitsLink).toHaveAttribute("href", "/app/movable-units");
    expect(unitsLink).toHaveAttribute("aria-current", "page");
    // Mobile active styling swaps to a foreground tint instead of the sidebar
    // accent background used by the desktop rail.
    expect(unitsLink).toHaveClass("text-foreground");
    expect(unitsLink).not.toHaveClass("bg-sidebar-accent");
  });
});
