import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  aiTextIntake: {
    listForMove: "aiTextIntake.listForMove",
    createFromText: "aiTextIntake.createFromText",
    approveMany: "aiTextIntake.approveMany",
    rejectMany: "aiTextIntake.rejectMany",
  },
}));

const textIntakeData = vi.hoisted(() => ({
  mutation: vi.fn(),
  suggestions: [
    {
      _id: "suggestion_1" as Id<"aiTextSuggestions">,
      status: "pending",
      type: "item",
      confidence: "medium",
      sourceLine:
        "Kitchen: two boxes of dishes, fragile glass vase, coffee maker with a very long note that should not widen the review surface",
      reasoning:
        "The user listed a kitchen item in rough text, so this should be reviewed as an item draft instead of silently becoming trusted inventory.",
      itemDraft: {
        name: "boxes of dishes",
        room: "Kitchen",
        category: "Kitchen",
        disposition: "take",
        quantity: 2,
        description: "Fragile kitchen contents.",
        suggestedBoxLabel: "K-1",
        planningDefaultKeys: ["fragile"],
      },
    },
    {
      _id: "suggestion_2" as Id<"aiTextSuggestions">,
      status: "pending",
      type: "box",
      confidence: "high",
      sourceLine: "Box K-1: plates, mugs, utensils (Kitchen)",
      reasoning: "The line starts with a box label.",
      boxDraft: {
        code: "K-1",
        label: "Kitchen box",
        room: "Kitchen",
        description: "Plates and mugs.",
      },
    },
  ],
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: () => textIntakeData.mutation,
  useQuery: (query: string) =>
    query === apiMock.aiTextIntake.listForMove
      ? textIntakeData.suggestions
      : undefined,
}));

import { AiTextIntake } from "@/components/ai-text-intake";

describe("AiTextIntake responsive review surface", () => {
  beforeEach(() => {
    textIntakeData.mutation.mockReset();
  });

  it("reviews pending text suggestions as cards while keeping a constrained desktop table", async () => {
    const user = userEvent.setup();

    render(
      <AiTextIntake
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    const cards = screen.getByRole("list", {
      name: "AI text suggestion cards",
    });
    expect(within(cards).getByDisplayValue("boxes of dishes")).toBeInTheDocument();
    expect(within(cards).getByDisplayValue("Kitchen box")).toBeInTheDocument();
    expect(
      within(cards).getByText(/Source: Kitchen: two boxes of dishes/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Suggestion" }),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText("Use boxes of dishes")).toHaveLength(2);
    expect(
      screen
        .getAllByText(/silently becoming trusted inventory/)
        .some((node) => node.classList.contains("line-clamp-3")),
    ).toBe(true);

    await user.click(screen.getAllByLabelText("Use boxes of dishes")[0]);

    for (const checkbox of screen.getAllByLabelText("Use boxes of dishes")) {
      expect(checkbox).toBeChecked();
    }
  });
});
