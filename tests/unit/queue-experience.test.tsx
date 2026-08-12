import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  QueueDesk,
  type QueueDeskActivity,
  type QueueDeskItem,
  type QueueState,
} from "@/components/queue-experience";

function queueItem(
  state: QueueState,
  overrides: Partial<QueueDeskItem> = {},
): QueueDeskItem {
  return {
    id: `queue_${state}`,
    source: "handoff",
    ownerUserId: "user_1",
    ownerLabel: null,
    directive: `${state} route note`,
    summary: null,
    state,
    stateLabel:
      state === "needsYou"
        ? "Needs You"
        : state === "waitingForAi"
          ? "Waiting for your AI"
          : state === "working"
            ? "Working"
            : "Done",
    requiredAction: state === "needsYou" ? "Which mover should receive the inventory?" : null,
    nextStep: state === "working" ? "Compare the two mover estimates." : null,
    waitingReason: state === "waitingForAi" ? "connectionUnknown" : null,
    resultSummary: state === "done" ? "Comparison saved to the move." : null,
    resultRefs: [],
    claimLabel: state === "working" ? "Scott's chosen AI" : null,
    claimExpiresAt: state === "working" ? Date.now() + 60_000 : null,
    terminalReason: null,
    failure: null,
    version: 1,
    createdAt: 1_750_000_000_000,
    updatedAt: 1_750_000_001_000,
    ...overrides,
  };
}

const items = [
  queueItem("needsYou"),
  queueItem("working"),
  queueItem("waitingForAi"),
  queueItem("done"),
];

const activity: QueueDeskActivity[] = [
  {
    id: "activity_1",
    type: "input_requested",
    actorLabel: "Scott's chosen AI",
    fromState: "working",
    toState: "needsYou",
    message: "Asked which mover should receive the inventory.",
    createdAt: 1_750_000_001_000,
  },
];

function renderDesk(
  overrides: Partial<React.ComponentProps<typeof QueueDesk>> = {},
) {
  const props: React.ComponentProps<typeof QueueDesk> = {
    items,
    activeApiKeyCount: 1,
    loading: false,
    hasMoreHandoffs: false,
    hasMoreCaptures: false,
    onLoadMoreHandoffs: vi.fn(),
    onLoadMoreCaptures: vi.fn(),
    onCreateDirective: vi.fn().mockResolvedValue(true),
    onSelectItem: vi.fn(),
    ownerScope: "user_1",
    ownerOptions: [{ value: "user_1", label: "My Queue" }],
    onOwnerScopeChange: vi.fn(),
    activities: activity,
    activitiesLoading: false,
    onProvideInput: vi.fn().mockResolvedValue(true),
    onCancel: vi.fn().mockResolvedValue(true),
    captureWorkspacePath: "/app/moves/move_1/capture",
    ...overrides,
  };
  return { ...render(<QueueDesk {...props} />), props };
}

describe("QueueDesk", () => {
  it("uses exactly the four person-facing Queue states", () => {
    renderDesk();

    const nav = screen.getByRole("navigation", { name: "Queue states" });
    expect(within(nav).getAllByRole("button")).toHaveLength(4);
    expect(within(nav).getByRole("button", { name: /Needs You/ })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /Working/ })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /Waiting for your AI/ })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /Done/ })).toBeInTheDocument();
    expect(screen.queryByText(/^To do$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Review$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Archive$/i)).not.toBeInTheDocument();
  });

  it("shows state-specific handoff, next-step, and result anatomy", async () => {
    const user = userEvent.setup();
    renderDesk();

    expect(
      screen.getByText("Which mover should receive the inventory?"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Working/ }));
    expect(screen.getByText("Compare the two mover estimates.")).toBeInTheDocument();
    expect(screen.getByText("Claimed by Scott's chosen AI")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Waiting for your AI/ }));
    expect(screen.getByText("Ready for your chosen AI to claim.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Done/ }));
    expect(screen.getByText("Comparison saved to the move.")).toBeInTheDocument();
  });

  it("states connection limits and that saving does not start work", async () => {
    const user = userEvent.setup();
    const createDirective = vi.fn().mockResolvedValue(true);
    renderDesk({ onCreateDirective: createDirective });

    expect(screen.getByText("API-key access is available")).toBeInTheDocument();
    expect(screen.getByText(/cannot tell whether an AI client is currently online/i)).toBeInTheDocument();
    expect(screen.getByText(/Nothing runs until an AI claims it/i)).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("What should your AI pick up next?"),
      "Check the packing list for missing room labels.",
    );
    await user.click(screen.getByRole("button", { name: "Save handoff" }));

    expect(createDirective).toHaveBeenCalledWith(
      "Check the packing list for missing room labels.",
    );
    expect(screen.getByRole("heading", { name: "Waiting for your AI" })).toBeInTheDocument();
  });

  it("lets a person answer the exact question and inspect attributable activity", async () => {
    const user = userEvent.setup();
    const provideInput = vi.fn().mockResolvedValue(true);
    const onSelectItem = vi.fn();
    renderDesk({ onProvideInput: provideInput, onSelectItem });

    await user.click(screen.getByRole("button", { name: /needsYou route note/i }));

    expect(onSelectItem).toHaveBeenCalledWith(expect.objectContaining({ id: "queue_needsYou" }));
    expect(screen.getByRole("heading", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByText("Asked which mover should receive the inventory.")).toBeInTheDocument();
    expect(screen.getByText(/Scott's chosen AI · Working → Needs You/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Your answer"), "Mesa Moving Company");
    await user.click(screen.getByRole("button", { name: "Send answer" }));

    expect(provideInput).toHaveBeenCalledWith(
      expect.objectContaining({ id: "queue_needsYou" }),
      "Mesa Moving Company",
    );
  });

  it("renders loading and empty states without inventing work", async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderDesk({ items: [], loading: true });
    expect(screen.getByLabelText("Loading Queue")).toBeInTheDocument();

    rerender(<QueueDesk {...props} items={[]} loading={false} />);
    expect(screen.getByText("Nothing needs you")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Done/ }));
    expect(screen.getByText("No completed handoffs yet")).toBeInTheDocument();
  });

  it("makes multi-person Queue scope and item ownership visible", async () => {
    const user = userEvent.setup();
    const onOwnerScopeChange = vi.fn();
    renderDesk({
      items: [queueItem("needsYou", { ownerLabel: "Alex's Queue" })],
      ownerScope: "all",
      ownerOptions: [
        { value: "user_1", label: "My Queue" },
        { value: "user_2", label: "Alex's Queue" },
        { value: "all", label: "Everyone's Queue" },
      ],
      onOwnerScopeChange,
    });

    expect(screen.getAllByText("Alex's Queue")).toHaveLength(2);
    await user.selectOptions(screen.getByLabelText("Queue owner"), "user_2");
    expect(onOwnerScopeChange).toHaveBeenCalledWith("user_2");
  });

  it("keeps capture evidence and specialized actions reachable", async () => {
    const user = userEvent.setup();
    renderDesk({
      items: [
        queueItem("needsYou", {
          id: "capture_1",
          source: "capture",
          directive: "Review the garage photos",
        }),
      ],
    });

    await user.click(screen.getByRole("button", { name: /Review the garage photos/ }));
    expect(
      screen.getByRole("link", { name: "Open capture workspace" }),
    ).toHaveAttribute("href", "/app/moves/move_1/capture");
  });

  it("keeps an open handoff detail synchronized with live Queue state", async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderDesk();

    await user.click(screen.getByRole("button", { name: /needsYou route note/i }));
    expect(
      screen.getAllByText("Which mover should receive the inventory?"),
    ).toHaveLength(2);

    rerender(
      <QueueDesk
        {...props}
        items={[
          queueItem("working", {
            id: "queue_needsYou",
            directive: "needsYou route note",
            nextStep: "Read the newly attached estimate.",
            claimLabel: "Scott's chosen AI",
            version: 2,
          }),
          ...items.slice(1),
        ]}
      />,
    );

    expect(screen.getByText("Read the newly attached estimate.")).toBeInTheDocument();
    expect(screen.getByText("Claimed by Scott's chosen AI")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your answer")).not.toBeInTheDocument();
  });
});
