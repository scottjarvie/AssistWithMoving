import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  moveQuestions: {
    summaryForMove: "moveQuestions.summaryForMove",
  },
}));

const questionsSummary = vi.hoisted(() => ({
  prompts: [],
  topPrompts: [
    {
      key: "inventory-missing-photos",
      category: "inventory",
      severity: "critical",
      title: "High-value items need photos",
      question: "Which high-value items still need claim-ready photos?",
      detail: "Add photo evidence before relying on packet exports.",
      count: 3,
      anchor: "#inventory",
      actionLabel: "Review inventory",
    },
  ],
  counts: {
    totalPrompts: 3,
    openPrompts: 3,
    critical: 1,
    warning: 1,
    info: 1,
    totalOpenItems: 8,
  },
  categories: {
    inventory: 3,
    evidence: 2,
    packets: 1,
    pcs: 1,
  },
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useQuery: (query: string) =>
    query === apiMock.moveQuestions.summaryForMove
      ? questionsSummary
      : undefined,
}));

import { MoveQuestionsPanel } from "@/components/move-questions-panel";

function renderMoveQuestionsPanel() {
  render(
    <MoveQuestionsPanel
      householdId={"household_123" as Id<"households">}
      moveId={"move_123" as Id<"moves">}
    />,
  );
}

describe("MoveQuestionsPanel task tabs", () => {
  it("opens on priority questions and separates area counts and shortcuts", async () => {
    const user = userEvent.setup();

    renderMoveQuestionsPanel();

    expect(
      screen.getByRole("tab", { name: "Priority: 3 prompts" }),
    ).toHaveAttribute("data-state", "active");
    expect(
      screen.getByText(
        "Review the highest-risk missing details before they block planning or packets.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("High-value items need photos"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /High-value items need photos/i }),
    ).toHaveAttribute("href", "/app/moves/move_123/inventory#inventory");
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.queryByText("Go fix the source")).not.toBeInTheDocument();
    expect(screen.queryByText("PCS")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Areas: 4 areas" }));
    expect(
      screen.getByText(
        "See which workspace areas are creating the most open questions.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("PCS")).toBeInTheDocument();
    expect(screen.getByText("Evidence")).toBeInTheDocument();
    expect(
      screen.queryByText("High-value items need photos"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Go fix the source")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Shortcuts: 5 links" }));
    expect(
      screen.getByText(
        "Jump to the source records that need cleanup, then return here to verify the count drops.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Go fix the source")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inventory" })).toHaveAttribute(
      "href",
      "/app/moves/move_123/inventory#inventory",
    );
    expect(screen.getByRole("link", { name: "Resources" })).toHaveAttribute(
      "href",
      "/app/moves/move_123/load-plan#transport-resources",
    );
    expect(screen.getByRole("link", { name: "Photos" })).toHaveAttribute(
      "href",
      "/app/moves/move_123/photos#photos",
    );
    expect(
      screen.getByText(/verified against current official guidance/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("High-value items need photos"),
    ).not.toBeInTheDocument();
  });
});
