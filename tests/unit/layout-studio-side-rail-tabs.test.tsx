import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  PlanSideRailTabs,
  ToolPalette,
} from "@/components/layout-studio/plan-workspace-page";

describe("PlanSideRailTabs", () => {
  it("keeps Layout Studio side work separated by task", async () => {
    const user = userEvent.setup();

    render(
      <PlanSideRailTabs
        inspect={<div>Inspector and levels panel</div>}
        place={<div>Placement tray panel</div>}
        review={<div>Agent proposal review panel</div>}
        blueprint={<div>Blueprint underlay panel</div>}
      />,
    );

    expect(screen.getByRole("tab", { name: "Inspect" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByText("Inspector and levels panel")).toBeInTheDocument();
    expect(screen.queryByText("Placement tray panel")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Agent proposal review panel"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Blueprint underlay panel")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Place" }));
    expect(screen.getByText("Placement tray panel")).toBeInTheDocument();
    expect(screen.queryByText("Inspector and levels panel")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Review" }));
    expect(screen.getByText("Agent proposal review panel")).toBeInTheDocument();
    expect(screen.queryByText("Placement tray panel")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Blueprint" }));
    expect(screen.getByText("Blueprint underlay panel")).toBeInTheDocument();
    expect(
      screen.queryByText("Agent proposal review panel"),
    ).not.toBeInTheDocument();
  });
});

describe("ToolPalette", () => {
  it("uses a horizontal mobile tool strip and desktop rail", () => {
    render(
      <ToolPalette
        activeTool="opening"
        onToolChange={vi.fn()}
        snapEnabled
        onSnapChange={vi.fn()}
        openingKind="door"
        onOpeningKindChange={vi.fn()}
        featureKind="counter"
        onFeatureKindChange={vi.fn()}
        zoneKind="driveway"
        onZoneKindChange={vi.fn()}
        levelType="indoor"
      />,
    );

    const palette = screen.getByLabelText("Select (V)").parentElement;
    expect(palette).toHaveClass("overflow-x-auto");
    expect(palette).toHaveClass("lg:flex-col");
    expect(palette).toHaveClass("lg:border-r");
    expect(screen.getByLabelText("Opening kind")).toHaveClass("min-w-32");
    expect(screen.getByLabelText("Outdoor zone")).toBeDisabled();
  });
});
