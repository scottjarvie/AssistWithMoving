import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Id } from "../../convex/_generated/dataModel";
import { QueueExperience } from "@/components/queue-experience-data";
import type { QueueDeskItem } from "@/components/queue-experience";

const fixture = vi.hoisted(() => ({
  ready: true,
  paginated: vi.fn(),
  create: vi.fn().mockResolvedValue(null),
  provide: vi.fn().mockResolvedValue(null),
  cancel: vi.fn().mockResolvedValue(null),
  canonical: {
    queueItemId: "synthetic-handoff", ownerUserId: "synthetic-person",
    directive: "[synthetic] Select the receiving room", summary: null,
    state: "needsYou", stateLabel: "Needs You", requiredAction: "Which room?",
    nextStep: null, waitingReason: null, resultSummary: null, resultRefs: [],
    claim: null, terminalReason: null, failure: null, version: 17,
    createdAt: 1_800_000_000_000, updatedAt: 1_800_000_001_000,
    completedAt: 1_800_000_000_500,
  },
  capture: {
    domainRef: { refId: "synthetic-capture" }, ownerUserId: "synthetic-person",
    directive: "[synthetic] Notebook capture", state: "done", stateLabel: "Done",
    requiredAction: null, nextStep: null, resultSummary: null, resultRefs: [], claim: null,
    createdAt: 1_800_000_000_000, updatedAt: 1_800_000_001_000,
  },
}));
vi.mock("../../convex/_generated/api", () => ({
  api: {
    users: { current: "current" },
    moveParticipants: { queueScopes: "scopes" },
    queue: { listForMove: "handoffs", listCaptureAdapter: "captures", listLegacyCaptureAdapter: "legacy", connectionStatus: "connection", listActivity: "activity", createDirective: "create", provideInput: "provide", cancel: "cancel" },
  },
}));
vi.mock("convex/react", () => ({
  useQuery: (query: string) => !fixture.ready ? undefined : query === "current" ? { _id: "synthetic-person" } : query === "scopes" ? { canManage: false, delegatedOwners: [] } : { queueCapableApiKeyCount: 0 },
  usePaginatedQuery: (query: string, args: unknown) => {
    fixture.paginated(query, args);
    return { results: args === "skip" ? [] : query === "handoffs" ? [fixture.canonical] : query === "captures" ? [fixture.capture] : [], status: "Exhausted", loadMore: vi.fn() };
  },
  useMutation: (mutation: string) => mutation === "create" ? fixture.create : mutation === "provide" ? fixture.provide : fixture.cancel,
}));
vi.mock("@/lib/toast", () => ({ toastError: vi.fn(), toastSaved: vi.fn() }));
vi.mock("@/components/queue-experience", () => ({
  QueueDesk: (props: {
    items: QueueDeskItem[];
    onStateChange: (state: string) => void;
    onProvideInput: (item: QueueDeskItem, answer: string) => Promise<boolean>;
    onCancel: (item: QueueDeskItem) => Promise<boolean>;
    onCreateDirective: (direction: string) => Promise<boolean>;
  }) => <div>
    <button onClick={() => props.onStateChange("all")}>Fixture Everything</button>
    <button onClick={() => props.onStateChange("doneWeek")}>Fixture week</button>
    <button onClick={() => { void props.onProvideInput(props.items[0], "Synthetic answer"); }}>Fixture answer</button>
    <button onClick={() => { void props.onCancel(props.items[0]); }}>Fixture cancel</button>
    <button onClick={() => { void props.onCreateDirective("Synthetic direction"); }}>Fixture create</button>
    <output aria-label="Mapped Queue records">{JSON.stringify(props.items)}</output>
  </div>,
}));
const householdId = "synthetic-household" as Id<"households">;
const moveId = "synthetic-move" as Id<"moves">;
function lastArgs(query: string) { return fixture.paginated.mock.calls.filter(([name]) => name === query).at(-1)?.[1]; }

describe("Queue presentation keeps the existing read/write hook contract", () => {
  beforeEach(() => { fixture.ready = true; fixture.paginated.mockClear(); fixture.create.mockClear(); fixture.provide.mockClear(); fixture.cancel.mockClear(); });
  it("maps real completion dates and requests Everything without inventing a fifth state", async () => {
    const user = userEvent.setup();
    render(<QueueExperience householdId={householdId} moveId={moveId} />);
    expect(lastArgs("handoffs")).toEqual({ householdId, moveId, ownerUserId: "synthetic-person", state: "needsYou" });
    const mapped = JSON.parse(screen.getByLabelText("Mapped Queue records").textContent!) as QueueDeskItem[];
    expect(mapped.find(item => item.source === "handoff")?.completedAt).toBe(fixture.canonical.completedAt);
    expect(mapped.find(item => item.source === "capture")?.completedAt).toBeNull();
    await user.click(screen.getByRole("button", { name: "Fixture Everything" }));
    for (const query of ["handoffs", "captures", "legacy"]) expect(lastArgs(query)).toEqual({ householdId, moveId, ownerUserId: "synthetic-person", state: undefined });
    await user.click(screen.getByRole("button", { name: "Fixture week" }));
    for (const query of ["handoffs", "captures", "legacy"]) expect(lastArgs(query)).toEqual({ householdId, moveId, ownerUserId: "synthetic-person", state: "done" });
  });

  it("does not admit owner-scoped reads before the existing scope resolution is ready", () => {
    fixture.ready = false;
    render(<QueueExperience householdId={householdId} moveId={moveId} />);
    for (const query of ["handoffs", "captures", "legacy"]) expect(lastArgs(query)).toBe("skip");
  });

  it("preserves exact handoff/version, owner and idempotency arguments on the existing mutations", async () => {
    const user = userEvent.setup();
    render(<QueueExperience householdId={householdId} moveId={moveId} />);
    await user.click(screen.getByRole("button", { name: "Fixture answer" }));
    await waitFor(() => expect(fixture.provide).toHaveBeenCalledWith({
      householdId, moveId, queueItemId: "synthetic-handoff", response: "Synthetic answer", expectedVersion: 17, idempotencyKey: expect.any(String),
    }));
    await user.click(screen.getByRole("button", { name: "Fixture cancel" }));
    expect(fixture.cancel).toHaveBeenCalledWith({
      householdId, moveId, queueItemId: "synthetic-handoff", reason: "Canceled by the person from the Queue screen.", expectedVersion: 17, idempotencyKey: expect.any(String),
    });
    await user.click(screen.getByRole("button", { name: "Fixture create" }));
    expect(fixture.create).toHaveBeenCalledWith({ householdId, moveId, ownerUserId: "synthetic-person", directive: "Synthetic direction", idempotencyKey: expect.any(String) });
    const tokens = [fixture.provide, fixture.cancel, fixture.create].map(mock => mock.mock.calls[0][0].idempotencyKey);
    expect(new Set(tokens).size).toBe(3);
  });
});
