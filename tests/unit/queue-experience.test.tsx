import { act, render, screen, waitFor, within } from "@testing-library/react";
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

let fixtureScope = 0;
function renderDesk(
  overrides: Partial<React.ComponentProps<typeof QueueDesk>> = {},
  presentation: "list" | "table" = "list",
) {
  const props: React.ComponentProps<typeof QueueDesk> = {
    items,
    preferenceScope: `synthetic-test-${++fixtureScope}`,
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
    hasMoreActivities: false,
    onLoadMoreActivities: vi.fn(),
    onProvideInput: vi.fn().mockResolvedValue(true),
    onCancel: vi.fn().mockResolvedValue(true),
    captureWorkspacePath: "/app/moves/move_1/capture",
    savedWorkPath: "/app/moves/move_1/overview#planning-results",
    ...overrides,
  };
  // Existing card/thread tests explicitly choose List; Table has separate
  // consumer coverage below. jsdom does not establish responsive CSS proof.
  window.localStorage.setItem(`assistwithmoving.collection.queue.${props.preferenceScope}.${props.ownerScope}.v1`, JSON.stringify({ view: presentation, density: "compact", groupBy: "state", groupDesc: false }));
  return { ...render(<QueueDesk {...props} />), props };
}

describe("QueueDesk", () => {
  it("answers the exact canonical handoff in its row without opening a sheet", async () => {
    const user = userEvent.setup();
    const item = queueItem("needsYou", { id: "synthetic-question", directive: "[synthetic] Choose the receiving room", version: 7 });
    const onProvideInput = vi.fn().mockResolvedValue(true);
    const onSelectItem = vi.fn();
    renderDesk({ items: [item], onProvideInput, onSelectItem });
    await user.type(screen.getByLabelText("Your answer for [synthetic] Choose the receiving room"), "  Synthetic study  ");
    await user.click(screen.getByRole("button", { name: "Send answer" }));
    expect(onProvideInput).toHaveBeenCalledWith(item, "Synthetic study");
    expect(onSelectItem).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the same unsent answer across the row, sheet and state navigation", async () => {
    const user = userEvent.setup();
    renderDesk();
    const answerName = "Your answer for needsYou route note";
    await user.type(screen.getByLabelText(answerName), "Synthetic unfinished answer");
    await user.click(screen.getByRole("button", { name: /needsYou route note/i }));
    expect(screen.getByLabelText("Your answer")).toHaveValue("Synthetic unfinished answer");
    await user.type(screen.getByLabelText("Your answer"), " from sheet");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByLabelText(answerName)).toHaveValue("Synthetic unfinished answer from sheet");
    await user.click(screen.getByRole("button", { name: /Working/ }));
    await user.click(screen.getByRole("button", { name: /Needs You/ }));
    expect(screen.getByLabelText(answerName)).toHaveValue("Synthetic unfinished answer from sheet");
  });

  it("keeps a rejected answer draft and never offers a canonical answer for capture adapters", async () => {
    const user = userEvent.setup();
    const onProvideInput = vi.fn().mockResolvedValue(false);
    renderDesk({ items: [queueItem("needsYou"), queueItem("needsYou", { id: "synthetic-capture", source: "capture", directive: "[synthetic] Capture review" })], onProvideInput });
    expect(screen.queryByLabelText("Your answer for [synthetic] Capture review")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Your answer for needsYou route note"), "Synthetic retained input");
    await user.click(screen.getByRole("button", { name: "Send answer" }));
    expect(screen.getByLabelText("Your answer for needsYou route note")).toHaveValue("Synthetic retained input");
    expect(screen.getByRole("button", { name: "Send answer" })).toBeEnabled();
  });
  it("offers six real views over the same four stored Queue states", () => {
    renderDesk();
    const views = screen.getByRole("group", { name: "Queue views" });
    expect(within(views).getAllByRole("button")).toHaveLength(6);
    for (const name of [/Needs You/, /Waiting for your AI/, /Working/, /Done this week/, /Everything/, /All Done/]) expect(within(views).getByRole("button", { name })).toBeInTheDocument();
    expect(screen.queryByText(/^To do$/i)).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: /All Done/ }));
    expect(screen.getByText("Comparison saved to the move.")).toBeInTheDocument();
  });

  it("states connection limits and that saving does not start work", async () => {
    const user = userEvent.setup();
    const createDirective = vi.fn().mockResolvedValue(true);
    renderDesk({ onCreateDirective: createDirective });

    expect(
      screen.getByText("A Queue API key is set up"),
    ).toBeInTheDocument();
    expect(screen.getByText(/cannot tell whether an AI client is currently online/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add handoff" }));
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

  it("keeps a linked MCP result readable without inventing a Queue transition", async () => {
    const user = userEvent.setup();
    renderDesk({
      items: [
        queueItem("waitingForAi", {
          resultSummary: "Three written estimates are ready for human review.",
          resultRefs: [
            {
              type: "planningRecord",
              id: "plan_result_1",
              label: "Mover estimate readiness",
            },
          ],
        }),
      ],
      selectedState: "waitingForAi",
      activities: [
        {
          id: "activity_linked",
          type: "resultLinked",
          actorLabel: "Your AI via MCP",
          fromState: "waitingForAi",
          toState: "waitingForAi",
          message: "Three written estimates are ready for human review.",
          createdAt: 1_750_000_001_000,
        },
      ],
    });

    await user.click(screen.getByRole("button", { name: /waitingForAi route note/i }));

    expect(screen.getByText("Linked move work")).toBeInTheDocument();
    expect(
      screen.getAllByText("Three written estimates are ready for human review."),
    ).toHaveLength(2);
    expect(screen.getByText("Mover estimate readiness")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open saved work" })).toHaveAttribute(
      "href",
      "/app/moves/move_1/overview#planning-results",
    );
    expect(screen.getAllByText("Waiting for your AI").length).toBeGreaterThan(0);
    expect(screen.getByText("Result Linked")).toBeInTheDocument();
    expect(screen.getByText(/Your AI via MCP · Waiting for your AI → Waiting for your AI/)).toBeInTheDocument();
    expect(screen.queryByText("Recorded result")).not.toBeInTheDocument();
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
    expect(screen.getByText("Loading Queue")).toBeInTheDocument();

    rerender(<QueueDesk {...props} items={[]} loading={false} />);
    expect(screen.getByText("Nothing needs you")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /All Done/ }));
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

    expect(screen.getByRole("option", { name: "Alex's Queue" })).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getByText("Alex's Queue")).toBeInTheDocument();
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

  it("keeps older attributable activity reachable", async () => {
    const user = userEvent.setup();
    const onLoadMoreActivities = vi.fn();
    renderDesk({ hasMoreActivities: true, onLoadMoreActivities });

    await user.click(screen.getByRole("button", { name: /needsYou route note/i }));
    await user.click(screen.getByRole("button", { name: "Load older activity" }));

    expect(onLoadMoreActivities).toHaveBeenCalledOnce();
  });

  it("disables the composer until one person's Queue is selected", async () => {
    renderDesk({
      canCreateDirective: false,
      directiveTargetLabel: "Choose one person's Queue",
    });

    await userEvent.click(screen.getByRole("button", { name: "Add handoff" }));
    expect(screen.getByLabelText("What should your AI pick up next?")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save handoff" })).toBeDisabled();
    expect(
      screen.getByText("Choose one person's Queue before saving a handoff."),
    ).toBeInTheDocument();
  });

  it("reports state changes to the data controller", async () => {
    const user = userEvent.setup();
    const onStateChange = vi.fn();
    renderDesk({ selectedState: "needsYou", onStateChange });

    await user.click(screen.getByRole("button", { name: /Waiting for your AI/ }));

    expect(onStateChange).toHaveBeenCalledWith("waitingForAi");
  });
  it("retains a Table answer's DOM identity, exact version and post-answer focus", async () => {
    const user = userEvent.setup();
    const item = queueItem("needsYou", { id: "synthetic-table-question", version: 9 });
    const provideInput = vi.fn().mockResolvedValue(true);
    renderDesk({ items: [item], onProvideInput: provideInput }, "table");
    const input = screen.getByLabelText("Your answer for needsYou route note");
    await user.type(input, "Synthetic room");
    expect(screen.getByLabelText("Your answer for needsYou route note")).toBe(input);
    expect(input).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send answer" }));
    expect(provideInput).toHaveBeenCalledWith(item, "Synthetic room");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Search Queue" })).toHaveFocus());
    expect(screen.getByRole("heading", { name: "Waiting for your AI" })).toBeInTheDocument();
  });

  it("keeps the composer draft through closing and refusal, then focuses Search on save", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderDesk({ onCreateDirective: save });
    expect(screen.queryByLabelText("What should your AI pick up next?")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add handoff" }));
    await user.type(screen.getByLabelText("What should your AI pick up next?"), "Synthetic direction");
    await user.click(screen.getByRole("button", { name: "Keep draft and close" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add handoff" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Add handoff" }));
    expect(screen.getByLabelText("What should your AI pick up next?")).toHaveValue("Synthetic direction");
    await user.click(screen.getByRole("button", { name: "Save handoff" }));
    expect(screen.getByLabelText("What should your AI pick up next?")).toHaveValue("Synthetic direction");
    await user.click(screen.getByRole("button", { name: "Save handoff" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Search Queue" })).toHaveFocus());
    expect(save).toHaveBeenNthCalledWith(2, "Synthetic direction");
  });

  it("does not carry a pending save's focus target into the next composer lifetime", async () => {
    const user = userEvent.setup();
    let resolveSave!: (saved: boolean) => void;
    const save = vi.fn(() => new Promise<boolean>(resolve => { resolveSave = resolve; }));
    renderDesk({ onCreateDirective: save });
    await user.click(screen.getByRole("button", { name: "Add handoff" }));
    await user.type(screen.getByLabelText("What should your AI pick up next?"), "Synthetic delayed direction");
    await user.click(screen.getByRole("button", { name: "Save handoff" }));
    expect(save).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Keep draft and close" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add handoff" })).toHaveFocus());
    await act(async () => { resolveSave(true); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add handoff" }));
    expect(screen.getByLabelText("What should your AI pick up next?")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Keep draft and close" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add handoff" })).toHaveFocus());
  });

  it("does not close a reopened composer when an earlier dismissed save resolves", async () => {
    const user = userEvent.setup();
    let resolveSave!: (saved: boolean) => void;
    renderDesk({ onCreateDirective: () => new Promise<boolean>(resolve => { resolveSave = resolve; }) });
    await user.click(screen.getByRole("button", { name: "Add handoff" }));
    await user.type(screen.getByLabelText("What should your AI pick up next?"), "Synthetic earlier save");
    await user.click(screen.getByRole("button", { name: "Save handoff" }));
    await user.click(screen.getByRole("button", { name: "Keep draft and close" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add handoff" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Add handoff" }));
    await act(async () => { resolveSave(true); });
    expect(screen.getByRole("dialog", { name: "Add a handoff" })).toBeInTheDocument();
    expect(screen.getByLabelText("What should your AI pick up next?")).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Keep draft and close" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add handoff" })).toHaveFocus());
  });

  it("keeps filtered Needs You and All Done emptiness distinct from an empty Queue", async () => {
    const user = userEvent.setup();
    renderDesk();
    await user.type(screen.getByRole("textbox", { name: "Search Queue" }), "synthetic unmatched search");
    expect(screen.getByRole("heading", { name: "No matching loaded records" })).toBeInTheDocument();
    expect(screen.queryByText("Nothing needs you")).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("group", { name: "Queue views" })).getByRole("button", { name: "All Done" }));
    await user.type(screen.getByRole("textbox", { name: "Search Queue" }), "synthetic unmatched outcome");
    expect(screen.getByRole("heading", { name: "No matching loaded records" })).toBeInTheDocument();
    expect(screen.queryByText("No completed handoffs yet")).not.toBeInTheDocument();
  });

  it("does not claim an empty Queue when a retained facet or older pages can exclude work", async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDesk({ items: [queueItem("needsYou"), queueItem("needsYou", { id: "synthetic-filtered-capture", source: "capture" })] });
    await user.click(screen.getByRole("button", { name: "Add filter" }));
    const filters = screen.getByRole("dialog", { name: "Filter records" });
    await user.click(within(within(filters).getByRole("group", { name: "Kind" })).getByRole("checkbox", { name: /^Capture\s*1$/ }));
    await user.click(within(filters).getByRole("button", { name: "Show records" }));
    rerender(<QueueDesk {...props} items={[queueItem("needsYou")]} />);
    expect(screen.getByRole("heading", { name: "No matching loaded records" })).toBeInTheDocument();
    expect(screen.queryByText("Nothing needs you")).not.toBeInTheDocument();
    rerender(<QueueDesk {...props} items={[]} hasMoreHandoffs />);
    expect(screen.getByText(/Older pages may contain more matches/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove filter Kind: Capture" }));
    expect(screen.getByRole("heading", { name: "No matching loaded records" })).toBeInTheDocument();
    expect(screen.queryByText("Nothing needs you")).not.toBeInTheDocument();
  });

  it("keeps every loaded state and both older-page controls reachable from Everything", async () => {
    const user = userEvent.setup();
    const moreHandoffs = vi.fn();
    const moreCaptures = vi.fn();
    renderDesk({ hasMoreHandoffs: true, hasMoreCaptures: true, onLoadMoreHandoffs: moreHandoffs, onLoadMoreCaptures: moreCaptures });
    await user.click(within(screen.getByRole("group", { name: "Queue views" })).getByRole("button", { name: "Everything" }));
    for (const state of ["needsYou", "working", "waitingForAi", "done"]) expect(screen.getByRole("button", { name: new RegExp(state + " route note") })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load older handoffs" }));
    await user.click(screen.getByRole("button", { name: "Load older captures" }));
    expect(moreHandoffs).toHaveBeenCalledOnce();
    expect(moreCaptures).toHaveBeenCalledOnce();
    await user.type(screen.getByRole("textbox", { name: "Search Queue" }), "synthetic no match");
    expect(screen.getByText(/Older pages may contain more matches/)).toBeInTheDocument();
  });

  it("discards presentation-only edits and reapplies a real named view after remount", async () => {
    const user = userEvent.setup();
    const first = renderDesk();
    const original = first.props;
    await user.selectOptions(screen.getByRole("combobox", { name: "Group records by" }), "source");
    expect(screen.getByText("Needs You modified")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByRole("combobox", { name: "Group records by" })).toHaveValue("state");
    await user.click(within(screen.getByRole("group", { name: "Queue views" })).getByRole("button", { name: "Everything" }));
    await user.type(screen.getByRole("textbox", { name: "Search Queue" }), "working");
    await user.click(screen.getByRole("button", { name: "Save as view" }));
    await user.type(screen.getByLabelText("View name"), "Synthetic working view");
    await user.click(screen.getByRole("button", { name: "Save view" }));
    first.unmount();
    render(<QueueDesk {...original} />);
    await user.click(within(screen.getByRole("group", { name: "Queue views" })).getByRole("button", { name: "Synthetic working view" }));
    expect(screen.getByRole("textbox", { name: "Search Queue" })).toHaveValue("working");
    expect(screen.getByRole("heading", { name: "Everything" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /working route note/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /needsYou route note/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
  });

  it("retains answer drafts when the owner scope changes and returns", async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDesk();
    await user.type(screen.getByLabelText("Your answer for needsYou route note"), "Synthetic retained owner draft");
    rerender(<QueueDesk {...props} items={[]} ownerScope="synthetic-other-owner" />);
    rerender(<QueueDesk {...props} />);
    expect(screen.getByLabelText("Your answer for needsYou route note")).toHaveValue("Synthetic retained owner draft");
  });

  it("preserves a draft through Options presentation changes and counted source filtering", async () => {
    const user = userEvent.setup();
    renderDesk({ items: [queueItem("needsYou"), queueItem("needsYou", { id: "synthetic-capture-options", source: "capture", directive: "[synthetic] Photo evidence" })] }, "table");
    const answerName = "Your answer for needsYou route note";
    await user.type(screen.getByLabelText(answerName), "Synthetic answer across views");
    for (const view of ["List", "Grid", "Table"]) {
      await user.click(screen.getByRole("button", { name: "Collection options" }));
      const options = screen.getByRole("dialog", { name: "Collection options" });
      await user.click(within(options).getByRole("button", { name: view }));
      await user.click(within(options).getByRole("button", { name: "Show records" }));
      expect(screen.getByLabelText(answerName)).toHaveValue("Synthetic answer across views");
    }
    await user.click(screen.getByRole("button", { name: "Add filter" }));
    const filters = screen.getByRole("dialog", { name: "Filter records" });
    const kind = within(filters).getByRole("group", { name: "Kind" });
    expect(within(kind).getByRole("checkbox", { name: /^Capture\s*1$/ })).toBeInTheDocument();
    await user.click(within(kind).getByRole("checkbox", { name: /^Handoff\s*1$/ }));
    await user.click(within(filters).getByRole("button", { name: "Show records" }));
    expect(screen.getByLabelText(answerName)).toHaveValue("Synthetic answer across views");
    expect(screen.queryByText("[synthetic] Photo evidence")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove filter Kind: Handoff" }));
    expect(screen.getByText("[synthetic] Photo evidence")).toBeInTheDocument();
  });

  it("uses real completion dates for the week view and refreshes its disclosed time window", async () => {
    const user = userEvent.setup();
    const clock = vi.spyOn(Date, "now").mockReturnValue(new Date(2026, 10, 5, 12).getTime());
    try {
      renderDesk({ items: [
        queueItem("done", { id: "synthetic-this-week", directive: "[synthetic] This week", completedAt: new Date(2026, 10, 2, 10).getTime() }),
        queueItem("done", { id: "synthetic-previous-week", directive: "[synthetic] Previous week", completedAt: new Date(2026, 10, 1, 10).getTime() }),
        queueItem("done", { id: "synthetic-undated", source: "capture", directive: "[synthetic] Undated capture", completedAt: null }),
      ] });
      await user.click(within(screen.getByRole("group", { name: "Queue views" })).getByRole("button", { name: "Done this week" }));
      expect(screen.getByRole("button", { name: /\[synthetic\] This week/ })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /\[synthetic\] Previous week/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /\[synthetic\] Undated capture/ })).not.toBeInTheDocument();
      clock.mockReturnValue(new Date(2026, 10, 9, 12).getTime());
      await user.click(screen.getByRole("button", { name: "Refresh week" }));
      expect(screen.queryByRole("button", { name: /\[synthetic\] This week/ })).not.toBeInTheDocument();
      await user.click(within(screen.getByRole("group", { name: "Queue views" })).getByRole("button", { name: "All Done" }));
      for (const name of [/\[synthetic\] This week/, /\[synthetic\] Previous week/, /\[synthetic\] Undated capture/]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    } finally { clock.mockRestore(); }
  });

});
