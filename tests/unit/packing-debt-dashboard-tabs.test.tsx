import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  packingDebt: {
    summaryForMove: "packingDebt.summaryForMove",
  },
}));

const packingDebtSummary = vi.hoisted(() => ({
  counts: {
    openMetricCount: 4,
    totalOpenSignals: 9,
  },
  topActions: [
    {
      key: "needsReview",
      label: "Review inventory decisions",
      count: 3,
      severity: "warning",
      anchor: "#inventory",
      help: "Resolve item review flags before relying on packets.",
    },
  ],
  metrics: [
    {
      key: "needsReview",
      label: "Needs review",
      count: 3,
      severity: "warning",
      anchor: "#inventory",
    },
    {
      key: "undecidedDisposition",
      label: "Undecided disposition",
      count: 2,
      severity: "warning",
      anchor: "#inventory",
    },
    {
      key: "unboxedItems",
      label: "Unboxed items",
      count: 1,
      severity: "info",
      anchor: "#boxes",
    },
    {
      key: "highValueWithoutPhotos",
      label: "High value without photos",
      count: 1,
      severity: "critical",
      anchor: "#photos",
    },
    {
      key: "photosNeedingReview",
      label: "Photos needing review",
      count: 1,
      severity: "warning",
      anchor: "#photos",
    },
    {
      key: "pendingAiSuggestions",
      label: "Pending AI suggestions",
      count: 1,
      severity: "info",
      anchor: "#ai-review-queue",
    },
    {
      key: "boxesMissingDestination",
      label: "Boxes missing destination",
      count: 1,
      severity: "warning",
      anchor: "#load-plan",
    },
    {
      key: "boxesUnassigned",
      label: "Boxes unassigned",
      count: 1,
      severity: "warning",
      anchor: "#load-plan",
    },
    {
      key: "boxesNotLoaded",
      label: "Boxes not loaded",
      count: 1,
      severity: "info",
      anchor: "#move-day",
    },
    {
      key: "boxWarnings",
      label: "Box warnings",
      count: 1,
      severity: "critical",
      anchor: "#load-plan",
    },
  ],
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useQuery: (query: string) =>
    query === apiMock.packingDebt.summaryForMove
      ? packingDebtSummary
      : undefined,
}));

import { PackingDebtDashboard } from "@/components/packing-debt-dashboard";

function renderPackingDebtDashboard() {
  render(
    <PackingDebtDashboard
      householdId={"household_123" as Id<"households">}
      moveId={"move_123" as Id<"moves">}
    />
  );
}

describe("PackingDebtDashboard task tabs", () => {
  it("opens on action queues and separates area metrics and shortcuts", async () => {
    const user = userEvent.setup();

    renderPackingDebtDashboard();

    expect(screen.getByRole("tab", { name: "Actions" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByText("Review inventory decisions")).toBeInTheDocument();
    expect(screen.queryByText("Inventory")).not.toBeInTheDocument();
    expect(screen.queryByText("Go fix readiness inputs")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Areas" }));
    expect(screen.getByText("Inventory")).toBeInTheDocument();
    expect(screen.getByText("Evidence")).toBeInTheDocument();
    expect(screen.getByText("Load readiness")).toBeInTheDocument();
    expect(
      screen.queryByText("Review inventory decisions")
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Shortcuts" }));
    expect(screen.getByText("Go fix readiness inputs")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inventory" })).toHaveAttribute(
      "href",
      "#inventory"
    );
    expect(screen.queryByText("Load readiness")).not.toBeInTheDocument();
  });
});
