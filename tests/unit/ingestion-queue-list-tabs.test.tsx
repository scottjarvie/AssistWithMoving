import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  ingestionQueue: {
    listForMove: "ingestionQueue.listForMove",
    setEntryStatus: "ingestionQueue.setEntryStatus",
    updateEntry: "ingestionQueue.updateEntry",
  },
}));

const queueData = vi.hoisted(() => ({
  mutation: vi.fn(),
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: () => queueData.mutation,
  useQuery: (query: string) =>
    query === apiMock.ingestionQueue.listForMove
      ? [
          queueEntry({
            _id: "entry_needs_input" as Id<"ingestionQueueEntries">,
            status: "needsInput",
            instructions: "Identify the blue bin.",
            agentQuestion: "Which room is this from?",
            roomHint: "Garage",
            mediaPhotoIds: ["photo_1" as Id<"itemPhotos">],
            createdAt: 6,
          }),
          queueEntry({
            _id: "entry_processed" as Id<"ingestionQueueEntries">,
            status: "processed",
            instructions: "Turn this shelf photo into items.",
            agentSummary: "Proposed two items.",
            resultItemIds: ["item_1" as Id<"items">, "item_2" as Id<"items">],
            mediaPhotoIds: ["photo_2" as Id<"itemPhotos">],
            createdAt: 5,
          }),
          queueEntry({
            _id: "entry_queued" as Id<"ingestionQueueEntries">,
            status: "queued",
            instructions: "Holiday bins need inventory.",
            mediaPhotoIds: [],
            createdAt: 4,
          }),
          queueEntry({
            _id: "entry_claimed" as Id<"ingestionQueueEntries">,
            status: "claimed",
            instructions: "Kitchen counter walkthrough.",
            claimedByAgentLabel: "Codex helper",
            mediaPhotoIds: ["photo_3" as Id<"itemPhotos">],
            createdAt: 3,
          }),
          queueEntry({
            _id: "entry_resolved" as Id<"ingestionQueueEntries">,
            status: "resolved",
            instructions: "Resolved capture.",
            mediaPhotoIds: [],
            createdAt: 2,
          }),
          queueEntry({
            _id: "entry_discarded" as Id<"ingestionQueueEntries">,
            status: "discarded",
            instructions: "Discarded duplicate capture.",
            mediaPhotoIds: [],
            createdAt: 1,
          }),
        ]
      : undefined,
}));

import { IngestionQueueList } from "@/components/ingestion-queue-list";

describe("IngestionQueueList task tabs", () => {
  it("separates action-needed, working, and archived queue entries", async () => {
    const user = userEvent.setup();

    render(
      <IngestionQueueList
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />
    );

    expect(screen.getByText("2 need action")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Needs action2/i })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByText(/Which room is this from?/i)).toBeInTheDocument();
    expect(screen.getByText(/Proposed two items./i)).toBeInTheDocument();
    expect(screen.queryByText("Holiday bins need inventory.")).not.toBeInTheDocument();
    expect(screen.queryByText("Resolved capture.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Working2/i }));
    expect(screen.getByText("Holiday bins need inventory.")).toBeInTheDocument();
    expect(screen.getByText("Kitchen counter walkthrough.")).toBeInTheDocument();
    expect(screen.getByText("Codex helper")).toBeInTheDocument();
    expect(screen.queryByText(/Which room is this from?/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Archive2/i }));
    expect(screen.getByText("Resolved capture.")).toBeInTheDocument();
    expect(screen.getByText("Discarded duplicate capture.")).toBeInTheDocument();
    expect(screen.queryByText("Holiday bins need inventory.")).not.toBeInTheDocument();
  });
});

function queueEntry(value: Partial<Doc<"ingestionQueueEntries">>) {
  return {
    _creationTime: 1,
    householdId: "household_123" as Id<"households">,
    moveId: "move_123" as Id<"moves">,
    sortOrder: value.createdAt ?? 1,
    createdByUserId: "user_123" as Id<"users">,
    updatedAt: value.createdAt ?? 1,
    ...value,
  } as Doc<"ingestionQueueEntries">;
}
