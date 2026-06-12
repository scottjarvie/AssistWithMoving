import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  aiTextIntake: {
    listForMove: "aiTextIntake.listForMove",
    approveMany: "aiTextIntake.approveMany",
    rejectMany: "aiTextIntake.rejectMany",
  },
  aiPhotoIntake: {
    listForMove: "aiPhotoIntake.listForMove",
    approveMany: "aiPhotoIntake.approveMany",
    rejectMany: "aiPhotoIntake.rejectMany",
  },
  aiPlanningSuggestions: {
    listForMove: "aiPlanningSuggestions.listForMove",
    approveMany: "aiPlanningSuggestions.approveMany",
    rejectMany: "aiPlanningSuggestions.rejectMany",
  },
}));

const queueData = vi.hoisted(() => ({
  mutation: vi.fn(),
  textSuggestions: [
    {
      _id: "text_1" as Id<"aiTextSuggestions">,
      type: "item",
      confidence: "medium",
      itemDraft: { name: "Lamp" },
      sourceLine: "Living room: brass lamp",
      reasoning: "User mentioned the lamp in text intake.",
    },
  ],
  photoSuggestions: [
    {
      _id: "photo_1" as Id<"aiPhotoSuggestions">,
      type: "duplicateCandidate",
      confidence: "high",
      itemDraft: { name: "Duplicate chair photo" },
      sourceSummary: "Same perceptual hash",
      reasoning: "Two photos appear to show the same chair.",
      duplicatePhotoIds: ["photo_a", "photo_b"],
    },
  ],
  planningSuggestions: [
    {
      _id: "planning_1" as Id<"aiPlanningSuggestions">,
      type: "estimate",
      confidence: "low",
      estimateDraft: {
        estimatedWeightLb: 45,
        estimatedVolumeCuFt: 6,
      },
      reasoning: "Dimensions were inferred from a partial photo.",
    },
  ],
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: () => queueData.mutation,
  useQuery: (query: string) => {
    if (query === apiMock.aiTextIntake.listForMove) {
      return queueData.textSuggestions;
    }
    if (query === apiMock.aiPhotoIntake.listForMove) {
      return queueData.photoSuggestions;
    }
    if (query === apiMock.aiPlanningSuggestions.listForMove) {
      return queueData.planningSuggestions;
    }
    return undefined;
  },
}));

import { AiReviewQueue } from "@/components/ai-review-queue";

describe("AiReviewQueue responsive review surface", () => {
  beforeEach(() => {
    queueData.mutation.mockReset();
    queueData.mutation.mockResolvedValue(null);
  });

  it("renders mobile review cards while keeping the desktop table controls", async () => {
    const user = userEvent.setup();

    render(
      <AiReviewQueue
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    const reviewCards = screen.getByRole("list", { name: "AI review cards" });
    expect(
      within(reviewCards).getByText("Duplicate chair photo"),
    ).toBeInTheDocument();
    expect(
      within(reviewCards).getByText("Estimate suggestion"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Suggestion" }),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText("Use Lamp")).toHaveLength(2);
    expect(screen.getAllByText("2 duplicates").length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByText("User mentioned the lamp in text intake.")
        .some((node) => node.classList.contains("line-clamp-3")),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("link", { name: "Edit" })
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      "/app/moves/move_123/ai-review#ai-photo-intake",
      "/app/moves/move_123/load-plan#ai-planning-suggestions",
      "/app/moves/move_123/ai-review#ai-text-intake",
      "/app/moves/move_123/ai-review#ai-photo-intake",
      "/app/moves/move_123/load-plan#ai-planning-suggestions",
      "/app/moves/move_123/ai-review#ai-text-intake",
    ]);

    expect(
      screen.getByRole("button", { name: "All: 3 suggestions" }),
    ).toHaveAttribute("data-variant", "default");
    expect(
      screen.getByText("Every pending suggestion, sorted by review risk."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Photo: 1 suggestion" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Needs closer look: 2 suggestions",
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Photo: 1 suggestion" }),
    );
    expect(
      screen.getByText(
        "Suggestions produced from photo evidence and image analysis.",
      ),
    ).toBeInTheDocument();
    expect(
      within(reviewCards).getByText("Duplicate chair photo"),
    ).toBeInTheDocument();
    expect(
      within(reviewCards).queryByText("Estimate suggestion"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Use Lamp")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select visible" }));

    for (const checkbox of screen.getAllByLabelText(
      "Use Duplicate chair photo",
    )) {
      expect(checkbox).toBeChecked();
    }
  });
});
