import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  evidenceDensity: {
    summaryForMove: "evidenceDensity.summaryForMove",
  },
}));

const evidenceSummary = vi.hoisted(() => ({
  summary: {
    itemCount: 2,
    averageScore: 55,
    completeItemCount: 0,
    priorityItemCount: 1,
    priorityAverageScore: 33,
    thinPriorityItemCount: 1,
    zeroEvidenceItemCount: 1,
  },
  topGaps: [
    {
      itemId: "item-camera",
      name: "Vintage camera kit",
      room: "Office",
      category: "Electronics",
      priority: "high",
      score: 33,
      gaps: [
        "Item photo",
        "Serial photo",
        "Receipt photo",
        "Box association",
        "Condition documented",
      ],
    },
  ],
  gapCounts: [
    { label: "Value documented", count: 2 },
    { label: "Condition documented", count: 1 },
  ],
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useQuery: (query: string) =>
    query === apiMock.evidenceDensity.summaryForMove
      ? evidenceSummary
      : undefined,
}));

import { EvidenceDensityPanel } from "@/components/evidence-density-panel";

function renderEvidenceDensityPanel() {
  render(
    <EvidenceDensityPanel
      householdId={"household_123" as Id<"households">}
      moveId={"move_123" as Id<"moves">}
    />
  );
}

describe("EvidenceDensityPanel task tabs", () => {
  it("opens on top gaps and separates scores, repeated patterns, and shortcuts", async () => {
    const user = userEvent.setup();

    renderEvidenceDensityPanel();

    expect(screen.getByRole("tab", { name: "Gaps" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(
      screen.getByText(
        "Start with the highest-risk items missing photos, values, receipts, serials, or box links.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Top evidence gaps")).toBeInTheDocument();
    expect(screen.getByText("Vintage camera kit")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.queryByText("Average score")).not.toBeInTheDocument();
    expect(screen.queryByText("Most common gaps")).not.toBeInTheDocument();
    expect(screen.queryByText("Go fix coverage inputs")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Scores" }));
    expect(
      screen.getByText(
        "Check evidence coverage totals before deciding whether claim packets are strong enough.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Average score")).toBeInTheDocument();
    expect(screen.getByText("Priority average")).toBeInTheDocument();
    expect(screen.queryByText("Vintage camera kit")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Patterns" }));
    expect(
      screen.getByText(
        "Find repeated evidence gaps so one review pass can improve many inventory records.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Most common gaps")).toBeInTheDocument();
    expect(screen.getByText("Value documented")).toBeInTheDocument();
    expect(screen.queryByText("Vintage camera kit")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Shortcuts" }));
    expect(
      screen.getByText(
        "Jump to the source workspace for the missing inventory, photo, box, or packet inputs.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Go fix coverage inputs")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inventory" })).toHaveAttribute(
      "href",
      "/app/items"
    );
    expect(screen.getByRole("link", { name: "Boxes" })).toHaveAttribute(
      "href",
      "/app/movable-units"
    );
    expect(screen.getByRole("link", { name: "Packets" })).toHaveAttribute(
      "href",
      "/app/moves/move_123/packets#documentation-packets"
    );
    expect(screen.queryByText("Vintage camera kit")).not.toBeInTheDocument();
  });
});
