import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  ingestionQueue: {
    listForMove: "ingestionQueue.listForMove",
    setEntryStatus: "ingestionQueue.setEntryStatus",
    updateEntry: "ingestionQueue.updateEntry",
    setMediaUploadState: "ingestionQueue.setMediaUploadState",
  },
  // Entries with media resolve thumbnail URLs through this action.
  photos: {
    getDisplayUrl: "photos.getDisplayUrl",
  },
  // The queue owner-picker reads available scopes; the mock returns undefined
  // for it so the picker stays hidden and the lane assertions are unaffected.
  moveParticipants: {
    queueScopes: "moveParticipants.queueScopes",
  },
}));

const queueData = vi.hoisted(() => ({
  mutation: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({
  toastSaved: vi.fn(),
  toastError: vi.fn(),
}));

// The list reads live background-upload jobs from the media-upload provider.
// Stub the hook so we control jobsForEntry / pendingCountForEntry per entry and
// the component never needs the real provider mounted.
const uploadStub = vi.hoisted(() => ({
  enqueue: vi.fn(),
  retry: vi.fn(),
  dismiss: vi.fn(),
  jobsForEntry: vi
    .fn<(id: Id<"ingestionQueueEntries">) => unknown[]>()
    .mockReturnValue([]),
  pendingCountForEntry: vi
    .fn<(id: Id<"ingestionQueueEntries">) => number>()
    .mockReturnValue(0),
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("@/components/media-upload-provider", () => ({
  useMediaUpload: () => uploadStub,
}));

vi.mock("@/lib/toast", () => toastMock);

vi.mock("convex/react", () => ({
  useMutation: () => queueData.mutation,
  // Entries with media render thumbnails that resolve display URLs through a
  // Convex action; stub it so the lane assertions don't depend on image loads.
  useAction: () => vi.fn(),
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
          // A queued entry whose background photo upload is still in flight: the
          // server rollup says "uploading" and it promised more photos than have
          // attached so far. Drives the "Uploading…" badge.
          queueEntry({
            _id: "entry_uploading" as Id<"ingestionQueueEntries">,
            status: "queued",
            instructions: "Pantry shelf, still uploading.",
            mediaPhotoIds: [],
            expectedMediaCount: 2,
            mediaUploadState: "uploading",
            createdAt: 4.5,
          }),
          // A queued entry whose upload permanently failed with no in-session
          // jobs (e.g. after a reload). Drives the "Upload failed" badge plus the
          // recovery affordances.
          queueEntry({
            _id: "entry_failed" as Id<"ingestionQueueEntries">,
            status: "queued",
            instructions: "Closet photo failed to upload.",
            mediaPhotoIds: [],
            expectedMediaCount: 1,
            mediaUploadState: "failed",
            createdAt: 4.2,
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

beforeEach(() => {
  queueData.mutation.mockReset();
  queueData.mutation.mockResolvedValue(undefined);
  toastMock.toastSaved.mockReset();
  toastMock.toastError.mockReset();
  uploadStub.pendingCountForEntry.mockReturnValue(0);
  uploadStub.jobsForEntry.mockReturnValue([] as unknown[]);
});

describe("IngestionQueueList tabs view", () => {
  it("separates needs-action, working, and archived entries", async () => {
    const user = userEvent.setup();

    render(
      <IngestionQueueList
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    // Default "Needs action" tab: needsInput + processed entries only.
    expect(screen.getByText(/Which room is this from?/i)).toBeInTheDocument();
    expect(screen.getByText(/Proposed two items./i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /View 2 produced items/ }),
    ).toHaveAttribute("href", "/app/items#inventory-records");
    expect(
      screen.getByText(
        "Agent questions and processed captures waiting for your review.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Holiday bins need inventory."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Resolved capture.")).not.toBeInTheDocument();

    // Working tab: queued + claimed (including the uploading/failed queued ones).
    await user.click(screen.getByRole("tab", { name: /Working/ }));
    expect(
      screen.getByText(
        "Queued or claimed captures still being processed by an agent.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Holiday bins need inventory.")).toBeInTheDocument();
    expect(screen.getByText("Kitchen counter walkthrough.")).toBeInTheDocument();
    expect(screen.getByText("Codex helper")).toBeInTheDocument();
    expect(
      screen.queryByText(/Which room is this from?/i),
    ).not.toBeInTheDocument();

    // Archive tab: resolved + discarded.
    await user.click(screen.getByRole("tab", { name: /Archive/ }));
    expect(
      screen.getByText(
        "Resolved or discarded captures kept out of the active queue.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Resolved capture.")).toBeInTheDocument();
    expect(
      screen.getByText("Discarded duplicate capture."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Holiday bins need inventory."),
    ).not.toBeInTheDocument();
  });

  it("surfaces upload status badges in the Working tab", async () => {
    const user = userEvent.setup();

    render(
      <IngestionQueueList
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /Working/ }));

    // Server rollup "uploading" with photos still owed, but no live job in this
    // session (e.g. after a reload) => uploading badge plus an orphaned-pending
    // recovery row so the user isn't stuck.
    expect(screen.getAllByText(/Uploading…/).length).toBeGreaterThan(0);
    // Server rollup "failed" with no live jobs => failed badge.
    expect(screen.getByLabelText("Upload failed")).toBeInTheDocument();
    // Both the failed entry and the orphaned-uploading entry expose recovery:
    // "Add the missing photos" (editable, no live job to retry) + "Dismiss".
    expect(
      screen.getAllByRole("button", { name: /Add the missing photos/ }).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByRole("button", { name: /Dismiss/ }).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("handles inline status failures without an unhandled rejection", async () => {
    const user = userEvent.setup();
    queueData.mutation.mockRejectedValueOnce(new Error("network"));

    render(
      <IngestionQueueList
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Mark resolved" }));

    expect(toastMock.toastError).toHaveBeenCalledWith(
      "Could not update that capture",
    );
  });

  it("renders live per-file jobs: spinner tiles, the counted badge, and Retry", async () => {
    const user = userEvent.setup();

    // Two in-flight jobs (spinner tiles + "Uploading 2…") on the uploading
    // entry, and a permanently-failed in-session job (Retry) on the failed one.
    uploadStub.pendingCountForEntry.mockImplementation(
      (id: Id<"ingestionQueueEntries">) => (id === "entry_uploading" ? 2 : 0),
    );
    uploadStub.jobsForEntry.mockImplementation(
      (id: Id<"ingestionQueueEntries">) => {
        if (id === "entry_uploading") {
          return [
            {
              id: "job_a",
              status: "uploading",
              file: new File(["x"], "a.jpg", { type: "image/jpeg" }),
            },
            {
              id: "job_b",
              status: "queued",
              file: new File(["x"], "b.jpg", { type: "image/jpeg" }),
            },
          ] as unknown[];
        }
        if (id === "entry_failed") {
          return [
            {
              id: "job_c",
              status: "error",
              error: "network blip",
              file: new File(["x"], "c.jpg", { type: "image/jpeg" }),
            },
          ] as unknown[];
        }
        return [] as unknown[];
      },
    );

    render(
      <IngestionQueueList
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /Working/ }));

    // Live pending count drives the counted badge text and the per-file spinner
    // tiles (one per in-flight job).
    expect(screen.getByText("Uploading 2…")).toBeInTheDocument();
    expect(screen.getByLabelText("Uploading a.jpg")).toBeInTheDocument();
    expect(screen.getByLabelText("Uploading b.jpg")).toBeInTheDocument();
    // A failed in-session job offers Retry (vs. the reload case's "Add the
    // missing photos") plus the failed tile.
    expect(
      screen.getByRole("button", { name: /Retry upload/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Upload failed for c.jpg"),
    ).toBeInTheDocument();

    uploadStub.pendingCountForEntry.mockReturnValue(0);
    uploadStub.jobsForEntry.mockReturnValue([] as unknown[]);
  });

  it("exposes an Add images affordance on editable entries", async () => {
    const user = userEvent.setup();

    render(
      <IngestionQueueList
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    // needsInput is editable, so it gets an "Add images" button on the default
    // (Needs action) tab.
    expect(
      screen.getAllByRole("button", { name: "Add images" }).length,
    ).toBeGreaterThan(0);

    // The processed entry is NOT editable, so beyond needsInput nothing else on
    // this tab adds the affordance. Switch to Working where queued entries are
    // editable and confirm it appears there too.
    await user.click(screen.getByRole("tab", { name: /Working/ }));
    expect(
      screen.getAllByRole("button", { name: "Add images" }).length,
    ).toBeGreaterThan(0);
  });
});

describe("IngestionQueueList todo-done view", () => {
  it("filters by lifecycle bucket with count chips", async () => {
    const user = userEvent.setup();

    render(
      <IngestionQueueList
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
        view="todo-done"
      />,
    );

    // "To do" is the default filter (queued lifecycle bucket). The three queued
    // captures show; the resolved one does not.
    expect(
      screen.getByRole("tab", { name: /To do/ }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Holiday bins need inventory.")).toBeInTheDocument();
    expect(screen.queryByText("Resolved capture.")).not.toBeInTheDocument();

    // Review bucket holds processed + needsInput.
    await user.click(screen.getByRole("tab", { name: /Review/ }));
    expect(screen.getByText(/Which room is this from?/i)).toBeInTheDocument();
    expect(
      screen.queryByText("Holiday bins need inventory."),
    ).not.toBeInTheDocument();

    // Done bucket holds resolved + discarded.
    await user.click(screen.getByRole("tab", { name: /Done/ }));
    expect(screen.getByText("Resolved capture.")).toBeInTheDocument();
    expect(
      screen.getByText("Discarded duplicate capture."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Holiday bins need inventory."),
    ).not.toBeInTheDocument();
  });
});

describe("IngestionQueueList detail modal (MOVE-356)", () => {
  it("opens a capture detail modal when an entry is clicked", async () => {
    const user = userEvent.setup();

    render(
      <IngestionQueueList
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    // No modal until a row is opened.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // The whole entry is a button; capture 1 is the needsInput entry (editable).
    await user.click(screen.getByRole("button", { name: "Open capture 1" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Capture 1")).toBeInTheDocument();
    // Editable entries expose the directions textarea seeded from the entry plus
    // the save/add/discard lifecycle actions in the footer.
    expect(within(dialog).getByLabelText("Directions")).toHaveValue(
      "Identify the blue bin.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Save directions" }),
    ).toBeInTheDocument();

    // Esc returns to the list with no modal.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not open the modal when an inline action is clicked (stopPropagation)", async () => {
    const user = userEvent.setup();

    render(
      <IngestionQueueList
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    // Clicking a quick-action button inside the row must not bubble up and open
    // the row's detail modal.
    await user.click(screen.getByRole("button", { name: "Add images" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not hijack Space from inline edit controls", async () => {
    const user = userEvent.setup();

    render(
      <IngestionQueueList
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Answer & requeue" }));
    const textarea = screen.getByLabelText("Edit directions");
    await user.clear(textarea);
    await user.type(textarea, "Garage shelf");

    expect(textarea).toHaveValue("Garage shelf");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not show saved state when detail save fails", async () => {
    const user = userEvent.setup();
    queueData.mutation.mockRejectedValueOnce(new Error("network"));

    render(
      <IngestionQueueList
        householdId={"household_123" as Id<"households">}
        moveId={"move_123" as Id<"moves">}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open capture 1" }));
    const dialog = screen.getByRole("dialog");
    const textarea = within(dialog).getByLabelText("Directions");
    await user.clear(textarea);
    await user.type(textarea, "Garage shelf");
    await user.click(within(dialog).getByRole("button", { name: "Save directions" }));

    expect(within(dialog).queryByText("Directions saved.")).not.toBeInTheDocument();
    expect(toastMock.toastError).toHaveBeenCalledWith(
      "Could not save those directions",
    );
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
