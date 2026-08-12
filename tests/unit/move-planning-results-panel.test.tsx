import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const useQueryMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

import { MovePlanningResultsPanel } from "@/components/move-planning-results-panel";

describe("MovePlanningResultsPanel", () => {
  beforeEach(() => useQueryMock.mockReset());

  it("shows the honest empty state for a move with no saved AI work", () => {
    useQueryMock.mockReturnValue({ records: [], hasMore: false });
    render(
      <MovePlanningResultsPanel
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    expect(screen.getByText("Saved move work")).toBeInTheDocument();
    expect(screen.getByText(/No AI planning results have been saved/)).toBeInTheDocument();
  });

  it("renders web-visible provenance, version, status, and a checked source", () => {
    useQueryMock.mockReturnValue({
      hasMore: false,
      records: [
        {
          planningRecordId: "planning_123",
          kind: "sourceCheck",
          title: "Mover estimate source",
          summary: "The published estimate was checked for this plan.",
          status: "current",
          version: 2,
          source: {
            title: "Example mover guidance",
            publisher: "Example Movers",
            url: "https://example.test/moving",
            status: "checked",
            checkedAt: 1,
          },
        },
      ],
    });
    render(
      <MovePlanningResultsPanel
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    expect(screen.getByText("Mover estimate source")).toBeInTheDocument();
    expect(screen.getByText("Source check")).toBeInTheDocument();
    expect(screen.getByText("current")).toBeInTheDocument();
    expect(screen.getByText("Your AI via MCP · version 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Example Movers/ })).toHaveAttribute(
      "href",
      "https://example.test/moving",
    );
  });
});
