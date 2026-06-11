import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MoveWorkspaceValue } from "@/components/move-workspace-context";
import type { Id } from "../../convex/_generated/dataModel";
import type { EffectiveFeatureFlag } from "@/lib/feature-flags";

const mockState = vi.hoisted(() => ({
  pathname: "/app/moves/move_123/plan",
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
    mockState.pathname = "/app/moves/move_123/plan";
    mockState.featureFlags = undefined;
  });

  it("omits the Layout entry when the layoutStudio flag is unavailable", () => {
    render(<WorkspaceNav />);

    expect(screen.queryByRole("link", { name: /layout/i })).not.toBeInTheDocument();
  });

  it("renders an active sidebar Layout entry when the flag is enabled", () => {
    mockState.featureFlags = [layoutStudioFlag(true)];

    render(<WorkspaceNav />);

    const layoutLink = screen.getByRole("link", { name: /layout/i });
    expect(layoutLink).toHaveAttribute("href", "/app/moves/move_123/plan");
    expect(layoutLink).toHaveClass("bg-sidebar-accent");
  });

  it("uses the same flag-gated Layout entry in mobile navigation", () => {
    mockState.featureFlags = [layoutStudioFlag(true)];

    render(<WorkspaceNav variant="mobile" />);

    const layoutLink = screen.getByRole("link", { name: /layout/i });
    expect(layoutLink).toHaveAttribute("href", "/app/moves/move_123/plan");
    expect(layoutLink).toHaveClass("h-10");
  });
});
