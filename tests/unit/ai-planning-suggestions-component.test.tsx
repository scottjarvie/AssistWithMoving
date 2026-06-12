import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  aiPlanningSuggestions: {
    listForMove: "aiPlanningSuggestions.listForMove",
    createForMove: "aiPlanningSuggestions.createForMove",
    approveMany: "aiPlanningSuggestions.approveMany",
    rejectMany: "aiPlanningSuggestions.rejectMany",
  },
}));

const planningData = vi.hoisted(() => ({
  mutation: vi.fn(),
  suggestions: [
    {
      _id: "suggestion_estimate" as Id<"aiPlanningSuggestions">,
      status: "pending",
      type: "estimate",
      confidence: "medium",
      estimateDraft: {
        category: "Furniture",
        estimatedWeightLb: 70,
        estimatedVolumeCuFt: 9,
        estimatedPackedVolumeCuFt: 11,
      },
      reasoning: "Measured from rough inventory notes and similar furniture.",
      assumptions: ["Assumes removable shelves stay packed separately."],
    },
    {
      _id: "suggestion_assignment" as Id<"aiPlanningSuggestions">,
      status: "pending",
      type: "assignment",
      confidence: "high",
      assignmentDraft: {
        assignedResourceId: "transport_resource_123456" as Id<"transportResources">,
        assignmentWarnings: ["over preferred zone weight"],
        overrideReason: "Truck is closest to the garage door.",
      },
      reasoning: "Box is already staged near the truck loading zone.",
      assumptions: [],
    },
  ],
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: () => planningData.mutation,
  useQuery: (query: string) =>
    query === apiMock.aiPlanningSuggestions.listForMove
      ? planningData.suggestions
      : undefined,
}));

import { AiPlanningSuggestions } from "@/components/ai-planning-suggestions";

describe("AiPlanningSuggestions", () => {
  beforeEach(() => {
    planningData.mutation.mockReset();
    planningData.mutation.mockResolvedValue(null);
  });

  it("renders mobile cards and desktop table from the same pending suggestions", async () => {
    const user = userEvent.setup();

    render(
      <AiPlanningSuggestions
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    const cardList = screen.getByRole("list", {
      name: "AI planning suggestion cards",
    });
    expect(within(cardList).getByText("70 lb / 9 cu ft")).toBeInTheDocument();
    expect(within(cardList).getByText("Target resource 123456")).toBeInTheDocument();
    expect(
      within(cardList).getByText(
        "Measured from rough inventory notes and similar furniture.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Use estimate suggestion")).toHaveLength(2);
    expect(screen.getAllByLabelText("Use assignment suggestion")).toHaveLength(2);

    await user.click(within(cardList).getByLabelText("Use estimate suggestion"));

    for (const checkbox of screen.getAllByLabelText("Use estimate suggestion")) {
      expect(checkbox).toBeChecked();
    }
    expect(screen.getByRole("button", { name: "Approve selected" })).toBeEnabled();
  });
});
