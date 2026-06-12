import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PlanSideRailTabs } from "@/components/layout-studio/plan-workspace-page";

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
