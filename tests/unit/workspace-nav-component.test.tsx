import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MoveWorkspaceValue } from "@/components/move-workspace-context";
import type { Id } from "../../convex/_generated/dataModel";
import type { EffectiveFeatureFlag } from "@/lib/feature-flags";

const mockState = vi.hoisted(() => ({
  pathname: "/app/moves/move_123/floorplans",
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
        moveId: "move_123" as Id<"moves">,
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
    mockState.featureFlags = undefined;
  });

  it("omits the Floorplans entry when the layoutStudio flag is unavailable", () => {
    render(<WorkspaceNav />);

    expect(screen.queryByRole("link", { name: /floorplans/i })).not.toBeInTheDocument();
  });

  it("renders an active sidebar Floorplans entry when the flag is enabled", () => {
    mockState.featureFlags = [layoutStudioFlag(true)];

    render(<WorkspaceNav />);

    const layoutLink = screen.getByRole("link", { name: /floorplans/i });
    expect(layoutLink).toHaveAttribute("href", "/app/moves/move_123/floorplans");
    expect(layoutLink).toHaveClass("bg-sidebar-accent");
    expect(layoutLink).toHaveAttribute("aria-current", "page");
  });

  it("uses the same flag-gated Floorplans entry in mobile navigation", () => {
    mockState.featureFlags = [layoutStudioFlag(true)];

    render(<WorkspaceNav variant="mobile" />);

    expect(screen.getByRole("navigation", { name: "Primary" })).toHaveClass(
      "max-w-full",
      "overflow-x-auto",
    );
    const layoutLink = screen.getByRole("link", { name: /floorplans/i });
    expect(layoutLink).toHaveAttribute("href", "/app/moves/move_123/floorplans");
    expect(layoutLink).toHaveClass("h-10");
    expect(layoutLink).toHaveAttribute("aria-current", "page");
  });
});
