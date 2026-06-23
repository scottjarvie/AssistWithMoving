import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MoveWorkspaceValue } from "@/components/move-workspace-context";
import type { Id } from "../../convex/_generated/dataModel";
import type { EffectiveFeatureFlag } from "@/lib/feature-flags";

const mockState = vi.hoisted(() => ({
  pathname: "/app/moves/move_123/floorplans",
  moveId: "move_123" as Id<"moves"> | null,
  featureFlags: undefined as EffectiveFeatureFlag[] | undefined,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockState.pathname,
}));

vi.mock("@/components/move-workspace-context", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/move-workspace-context")>();
  return {
    ...actual,
    useOptionalMoveWorkspace: () =>
      ({
        householdId: "household_123" as Id<"households">,
        selectHousehold: vi.fn(),
        households: [],
        moves: [],
        activeMoves: [],
        moveId: mockState.moveId,
        selectMove: vi.fn(),
        selectedMove: undefined,
        featureFlags: mockState.featureFlags,
        loadingIdentity: false,
        loadingHouseholds: false,
        loadingMoves: false,
        moveLinkMessage: null,
      }) satisfies MoveWorkspaceValue,
  };
});

import { WorkspaceNav } from "@/components/workspace-nav";
import { WorkspaceSubNav } from "@/components/workspace-sub-nav";
import { MobileAppNav } from "@/components/mobile-capture-action";

function layoutStudioFlag(enabled: boolean): EffectiveFeatureFlag {
  return {
    key: "layoutStudio",
    label: "Layout Studio",
    description: "Experimental planner",
    environment: "development",
    enabled,
    source: "default",
  };
}

describe("WorkspaceNav", () => {
  beforeEach(() => {
    mockState.pathname = "/app/moves/move_123/floorplans";
    mockState.moveId = "move_123" as Id<"moves">;
    mockState.featureFlags = undefined;
    window.history.replaceState(null, "", "/");
  });

  it("leads with the four focus destinations and the add action", () => {
    mockState.pathname = "/app/moves/move_123/inventory";

    render(<WorkspaceNav />);

    expect(screen.getByRole("link", { name: "Add to queue" })).toHaveAttribute(
      "href",
      "/app/moves/move_123/capture"
    );
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/app/moves/move_123"
    );
    expect(screen.getByRole("link", { name: "Items" })).toHaveAttribute(
      "href",
      "/app/moves/move_123/inventory"
    );
    expect(screen.getByRole("link", { name: "Queue" })).toHaveAttribute(
      "href",
      "/app/moves/move_123/capture#ingestion-queue"
    );
  });

  it("omits the Floorplans entry when the layoutStudio flag is unavailable", () => {
    render(<WorkspaceNav />);

    expect(
      screen.queryByRole("link", { name: /floorplans/i })
    ).not.toBeInTheDocument();
  });

  it("nests an active Floorplans entry under Boxes when the flag is enabled", () => {
    mockState.featureFlags = [layoutStudioFlag(true)];

    render(<WorkspaceNav />);

    const layoutLink = screen.getByRole("link", { name: /floorplans/i });
    expect(layoutLink).toHaveAttribute("href", "/app/moves/move_123/floorplans");
    expect(layoutLink).toHaveClass("bg-sidebar-accent");
    expect(layoutLink).toHaveAttribute("aria-current", "page");
  });

  it("surfaces flag-gated Floorplans inside the mobile boxes sub-nav", () => {
    mockState.featureFlags = [layoutStudioFlag(true)];

    render(<WorkspaceSubNav parent="boxes" />);

    const layoutLink = screen.getByRole("link", { name: /floorplans/i });
    expect(layoutLink).toHaveAttribute("href", "/app/moves/move_123/floorplans");
    expect(layoutLink).toHaveAttribute("aria-current", "page");
  });

  it("routes locked dashboard section links to create-move setup", () => {
    mockState.pathname = "/app/dashboard";

    render(<WorkspaceNav />);

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/app/dashboard"
    );
    expect(screen.getByRole("link", { name: "Add to queue" })).toHaveAttribute(
      "href",
      "/app/dashboard#create-move"
    );
    expect(screen.getByRole("link", { name: "Items" })).toHaveAttribute(
      "href",
      "/app/dashboard#create-move"
    );
  });

  it("renders an app-style mobile bottom nav with a center add action", () => {
    mockState.pathname = "/app/moves/move_123/inventory";

    render(<MobileAppNav />);

    expect(
      screen.getByRole("navigation", { name: "Mobile app navigation" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/app/moves/move_123"
    );
    expect(screen.getByRole("link", { name: "Items" })).toHaveAttribute(
      "href",
      "/app/moves/move_123/inventory"
    );
    expect(screen.getByRole("link", { name: "Add to queue" })).toHaveAttribute(
      "href",
      "/app/moves/move_123/capture"
    );
    expect(screen.getByRole("link", { name: "Boxes" })).toHaveAttribute(
      "href",
      "/app/moves/move_123/boxes"
    );
    expect(screen.getByRole("link", { name: "Queue" })).toHaveAttribute(
      "href",
      "/app/moves/move_123/capture#ingestion-queue"
    );
    expect(screen.queryByText("Move Day")).not.toBeInTheDocument();
  });

  it("uses the selected move for the mobile add action even from dashboard", () => {
    mockState.pathname = "/app/dashboard";

    render(<MobileAppNav />);

    expect(screen.getByRole("link", { name: "Add to queue" })).toHaveAttribute(
      "href",
      "/app/moves/move_123/capture"
    );
  });

  it("routes the mobile add action to move setup when no move exists", () => {
    mockState.pathname = "/app/dashboard";
    mockState.moveId = null;

    render(<MobileAppNav />);

    expect(screen.getByRole("link", { name: "Add to queue" })).toHaveAttribute(
      "href",
      "/app/dashboard#create-move"
    );
  });

  it("clears dashboard setup hash when Home is clicked", async () => {
    const user = userEvent.setup();
    const hashChanged = vi.fn();
    mockState.pathname = "/app/dashboard";
    window.history.replaceState(null, "", "/app/dashboard#create-move");
    window.addEventListener("hashchange", hashChanged);

    render(<WorkspaceNav />);

    await user.click(screen.getByRole("link", { name: "Home" }));

    expect(window.location.pathname).toBe("/app/dashboard");
    expect(window.location.hash).toBe("");
    expect(hashChanged).toHaveBeenCalledOnce();

    window.removeEventListener("hashchange", hashChanged);
  });
});
