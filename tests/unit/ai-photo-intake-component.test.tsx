import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  photos: {
    listForMove: "photos.listForMove",
  },
  aiPhotoIntake: {
    listForMove: "aiPhotoIntake.listForMove",
    createForPhoto: "aiPhotoIntake.createForPhoto",
    approveMany: "aiPhotoIntake.approveMany",
    rejectMany: "aiPhotoIntake.rejectMany",
  },
}));

const photoIntakeData = vi.hoisted(() => ({
  mutation: vi.fn(),
  photos: [
    {
      _id: "photo_eligible" as Id<"itemPhotos">,
      caption: "Kitchen shelf photo",
      room: "Kitchen",
      photoType: "room",
      aiProcessed: false,
      itemId: undefined,
      boxId: undefined,
      visibilityScope: "moveCollaborators",
      privacyLevel: "normal",
      derivativeRefs: { card: "photos/card.jpg" },
    },
    {
      _id: "photo_private" as Id<"itemPhotos">,
      caption: "Private document photo",
      room: "Office",
      photoType: "item",
      aiProcessed: false,
      itemId: undefined,
      boxId: undefined,
      visibilityScope: "private",
      privacyLevel: "private",
      derivativeRefs: { card: "photos/private.jpg" },
    },
  ],
  suggestions: [
    {
      _id: "photo_suggestion_1" as Id<"aiPhotoSuggestions">,
      status: "pending",
      type: "item",
      confidence: "medium",
      itemDraft: { name: "Oak chair" },
      boxDraft: undefined,
      reasoning: "The image appears to show a chair near the kitchen shelf.",
      sourceSummary: "Kitchen shelf photo with one visible chair.",
    },
  ],
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: () => photoIntakeData.mutation,
  useQuery: (query: string) => {
    if (query === apiMock.photos.listForMove) {
      return photoIntakeData.photos;
    }
    if (query === apiMock.aiPhotoIntake.listForMove) {
      return photoIntakeData.suggestions;
    }
    return undefined;
  },
}));

import { AiPhotoIntake } from "@/components/ai-photo-intake";

describe("AiPhotoIntake responsive review surface", () => {
  beforeEach(() => {
    photoIntakeData.mutation.mockReset();
    photoIntakeData.mutation.mockResolvedValue({ suggestionIds: [] });
  });

  it("renders mobile suggestion cards and keeps private photos out of analysis actions", async () => {
    const user = userEvent.setup();

    render(
      <AiPhotoIntake
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Kitchen shelf photo" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Private document photo" }),
    ).not.toBeInTheDocument();

    const suggestionCards = screen.getByRole("list", {
      name: "AI photo suggestion cards",
    });
    expect(within(suggestionCards).getByText("Oak chair")).toBeInTheDocument();
    expect(
      within(suggestionCards).getByText(
        "Kitchen shelf photo with one visible chair.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Suggestion" }),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText("Use Oak chair")).toHaveLength(2);

    await user.click(screen.getAllByLabelText("Use Oak chair")[0]);

    for (const checkbox of screen.getAllByLabelText("Use Oak chair")) {
      expect(checkbox).toBeChecked();
    }
  });
});
