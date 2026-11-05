import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GRANT_CONSENT_POLICY, grantCatalogFingerprint } from "../../convex/lib/aiGrants";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  aiGrants: {
    listMine: "aiGrants.listMine",
    listActivity: "aiGrants.listActivity",
    listMoveChoices: "aiGrants.listMoveChoices",
    listSourceHistory: "aiGrants.listSourceHistory",
    describeBoundary: "aiGrants.describeBoundary",
    approve: "aiGrants.approve",
    revoke: "aiGrants.revoke",
    updateLimits: "aiGrants.updateLimits",
  },
  households: {
    listMine: "households.listMine",
    summaryStats: "households.summaryStats",
  },
  apiKeys: {
    listForHousehold: "apiKeys.listForHousehold",
    create: "apiKeys.create",
    revoke: "apiKeys.revoke",
    rotate: "apiKeys.rotate",
  },
}));

const connectionData = vi.hoisted(() => ({
  queryCalls: vi.fn(),
  moveChoicesPaging: false,
  archivedRecords: false,
  approve: vi.fn(),
  revoke: vi.fn(),
  updateLimits: vi.fn(),
  grants: {
    boundaryVersion: "2026-08-16",
    consentPolicyVersion: "",
    catalogFingerprint: "",
    historyFingerprint: "current-history" as string | undefined,
    recoveryFingerprint: "current-recovery",
    historyAtCapacity: false,
    historyOverflow: false,
    scopes: [
      {
        scope: "moving.context.read",
        label: "Read the move context you choose",
        grants: "Route, dates, rooms and places, belongings and boxes.",
        doesNotImply:
          "It does not open your private photos or files, change anything, or archive a record.",
        writes: false,
      },
      {
        scope: "moving.work.write",
        label: "Save the work you asked for",
        grants: "Saving move context, inventory, decisions, and estimates.",
        doesNotImply:
          "It does not claim or complete Queue handoffs, archive or delete anything, export, or share.",
        writes: true,
      },
    ],
    neverExposed: ["Another household's moves, belongings, evidence, or Queue."],
    neverPermitted: ["Permanently delete anything, or delete your account."],
    grants: [
      {
        grantId: "ai_grant_123" as Id<"aiGrants">,
        householdId: "household_123" as Id<"households">,
        label: "My AI on the laptop",
        status: "active" as "active" | "expired" | "revoked",
        clientId: "verified-client" as string | null,
        scopes: ["moving.context.read"],
        effectiveAuthority: { status: "active" as const, scopes: ["moving.context.read"] },
        moveScope: "selectedMoves" as "selectedMoves" | "allMoves",
        moveIds: ["move_123"],
        observedClientName: "Some AI Client",
        registrationMethodLabel: "Dynamic registration",
        consentSnapshot: [
          {
            scope: "moving.context.read",
            label: "Read the move context you choose",
            grants: "Route, dates, rooms and places, belongings and boxes.",
            doesNotImply:
              "It does not open your private photos or files, change anything, or archive a record.",
          },
        ],
        approvedAt: 1_770_000_000_000,
        expiresAt: 1_780_000_000_000,
        lastUsedAt: 1_771_000_000_000,
        lastToolName: "get_move_brief",
        useCount: 12,
        revokedAt: null,
        revokedReason: null,
        note: null,
        version: 3,
      },
    ],
    activeCount: 1,
    maxActive: 8,
  },
  activity: {
    activity: [
      {
        grantId: "ai_grant_123" as Id<"aiGrants">,
        type: "refused",
        scope: null,
        toolName: "archive_move_records",
        clientLabel: "Some AI Client",
        message: "Refused archive_move_records: GRANT_SCOPE_MISSING.",
        outcome: "refused" as const,
        createdAt: 1_771_100_000_000,
      },
    ],
  },
  households: [
    {
      household: {
        _id: "household_123" as Id<"households">,
        name: "Jarvie household",
      },
      role: "owner",
    },
  ],
  stats: {
    moves: [
      {
        moveId: "move_123" as Id<"moves">,
        title: "Utah to Virginia",
        status: "active",
      },
    ],
    moveCount: 1,
    archivedMoveCount: 0,
    itemCount: 0,
    boxCount: 0,
    activeApiKeyCount: 0,
    activeMemberCount: 1,
    pendingInvitationCount: 0,
  },
  keys: [] as unknown[],
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));

vi.mock("convex/react", () => ({
  useQuery: (query: string, args: unknown) => {
    connectionData.queryCalls(query, args);
    if (args === "skip") return undefined;
    switch (query) {
      case apiMock.aiGrants.listMine:
        return connectionData.grants;
      case apiMock.aiGrants.listActivity:
        return connectionData.activity;
      case apiMock.aiGrants.listSourceHistory:
        return { page: connectionData.archivedRecords ? [{ _id: "saved-source", archivedAt: 1770000000000, source: { ...connectionData.grants.grants[0], _id: "original-grant", label: (args as { cursor?: string })?.cursor ? "Earlier original approval" : "Original approval", version: 1 } }] : [], isDone: Boolean((args as { cursor?: string })?.cursor), continueCursor: "older-originals" };
      case apiMock.households.listMine:
        return connectionData.households;
      case apiMock.households.summaryStats:
        return connectionData.stats;
      case apiMock.aiGrants.listMoveChoices:
        return connectionData.moveChoicesPaging ? { moves: (args as { cursor?: string })?.cursor ? [{ ...connectionData.stats.moves[0], moveId: "move_456", title: "Later move" }] : connectionData.stats.moves, nextCursor: (args as { cursor?: string })?.cursor ? null : "later-moves" } : connectionData.stats;
      case apiMock.apiKeys.listForHousehold:
        return connectionData.keys;
      default:
        return undefined;
    }
  },
  useMutation: (mutation: string) =>
    mutation === apiMock.aiGrants.approve
      ? connectionData.approve
      : mutation === apiMock.aiGrants.updateLimits
        ? connectionData.updateLimits
        : mutation === apiMock.aiGrants.revoke
          ? connectionData.revoke
          : vi.fn(),
}));

import {
  AiConnectionManager,
  buildManualQueueBrief,
} from "@/components/ai-connection-manager";

describe("AiConnectionManager", () => {
  beforeEach(() => {
    connectionData.grants.consentPolicyVersion = GRANT_CONSENT_POLICY;
    connectionData.grants.catalogFingerprint = grantCatalogFingerprint();
    connectionData.queryCalls.mockClear();
    connectionData.updateLimits.mockReset();
    connectionData.approve.mockReset();
    connectionData.approve.mockResolvedValue({ grantId: "ai_grant_456" });
    connectionData.revoke.mockReset();
    connectionData.revoke.mockResolvedValue({ grantId: "ai_grant_123" });
  });

  it("renders each scope with the server's does-not-imply boundary", () => {
    render(<AiConnectionManager />);

    const scopeChoices = screen.getByRole("group", {
      name: "What this AI may do",
    });
    expect(
      within(scopeChoices).getByText("Read the move context you choose"),
    ).toBeInTheDocument();
    expect(
      within(scopeChoices).getByText(
        /It does not open your private photos or files/,
      ),
    ).toBeInTheDocument();
    expect(
      within(scopeChoices).getByText(
        /It does not claim or complete Queue handoffs/,
      ),
    ).toBeInTheDocument();
    // The read scope must never be presented as if it changed anything.
    expect(within(scopeChoices).getByText("Read only")).toBeInTheDocument();
  });

  it("summarizes the exact approval before the person confirms", async () => {
    const user = userEvent.setup();
    render(<AiConnectionManager />);

    const approveButton = screen.getByRole("button", {
      name: "Approve this connection",
    });
    expect(approveButton).toBeDisabled();

    await user.type(
      screen.getByLabelText("Name this connection"),
      "Kitchen table AI",
    );
    await user.click(
      within(screen.getByRole("group", { name: "What this AI may do" })).getByRole("checkbox", { name: /Save the work you asked for/ }),
    );

    expect(screen.getByText("Kitchen table AI")).toBeInTheDocument();
    expect(screen.getByText(/all your moves/)).toBeInTheDocument();
    expect(approveButton).toBeEnabled();

    await user.click(approveButton);
    expect(connectionData.approve).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Kitchen table AI",
        scopes: ["moving.context.read"],
        moveScope: "allMoves",
        expiresInDays: undefined,
      }),
    );
  });

  it("defaults every permission on with no end date", () => {
    render(<AiConnectionManager />);
    const group = screen.getByRole("group", { name: "What this AI may do" });
    for (const checkbox of within(group).getAllByRole("checkbox")) expect(checkbox).toBeChecked();
    expect(screen.getByLabelText("End date", { selector: "#ai-grant-expiry" })).toHaveValue("0");
  });

  it("requires choosing a revoked client before approving its reconnect", async () => {
    const original = connectionData.grants.grants;
    connectionData.grants.grants = [{ ...original[0], status: "revoked" }];
    try {
      const user = userEvent.setup();
      render(<AiConnectionManager />);
      expect(screen.getByLabelText("Connection", { selector: "#ai-grant-reconnect" })).toHaveValue("");
      await user.selectOptions(screen.getByLabelText("Connection", { selector: "#ai-grant-reconnect" }), "ai_grant_123");
      expect(screen.getByText(/Its refusal stays in place until you approve/)).toBeInTheDocument();
      expect(connectionData.approve).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Approve this connection" }));
      expect(connectionData.approve).toHaveBeenCalledWith(expect.objectContaining({
        reconnectGrantId: "ai_grant_123", expectedHistoryFingerprint: "current-history",
        consentPolicyVersion: GRANT_CONSENT_POLICY, catalogFingerprint: grantCatalogFingerprint(),
        label: "My AI on the laptop", scopeIntent: "full", expiryIntent: "none",
      }));
      expect(screen.getByText(/Reconnected with the permissions and end date you approved/)).toBeInTheDocument();
    } finally { connectionData.grants.grants = original; }
  });

  it("reconnects a move-only participant without querying household-only data", async () => {
    const original = connectionData.grants.grants;
    const households = connectionData.households;
    connectionData.households = [];
    connectionData.grants.grants = [{ ...original[0], status: "revoked" }];
    try {
      const user = userEvent.setup();
      render(<AiConnectionManager />);
      await user.selectOptions(screen.getByLabelText("Connection", { selector: "#ai-grant-reconnect" }), "ai_grant_123");
      expect(screen.getByText(/Reconnecting does not give household access/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Approve this connection" })).toBeEnabled();
      expect(connectionData.queryCalls).not.toHaveBeenCalledWith(apiMock.households.summaryStats, { householdId: "household_123" });
      await user.click(screen.getByRole("button", { name: "Approve this connection" }));
      expect(connectionData.approve).toHaveBeenCalledWith(expect.objectContaining({ householdId: "household_123", reconnectGrantId: "ai_grant_123", scopeIntent: "full", expiryIntent: "none", moveScope: "allMoves" }));
    } finally { connectionData.households = households; connectionData.grants.grants = original; }
  });

  it("keeps a participant reconnect in its original household when the person also belongs to another household", async () => {
    const original = connectionData.grants.grants;
    connectionData.grants.grants = [{ ...original[0], householdId: "participant_household" as Id<"households">, status: "revoked" }];
    try {
      const user = userEvent.setup();
      render(<AiConnectionManager />);
      await user.selectOptions(screen.getByLabelText("Connection", { selector: "#ai-grant-reconnect" }), "ai_grant_123");
      expect(connectionData.queryCalls).toHaveBeenCalledWith(apiMock.aiGrants.listMoveChoices, { householdId: "participant_household" });
      await user.click(screen.getByRole("button", { name: "Approve this connection" }));
      expect(connectionData.approve).toHaveBeenCalledWith(expect.objectContaining({ householdId: "participant_household", reconnectGrantId: "ai_grant_123" }));
    } finally { connectionData.grants.grants = original; }
  });

  it("lets the person move recovery to an eligible household and clears the prior move choice", async () => {
    const original = connectionData.grants.grants;
    connectionData.grants.grants = [{ ...original[0], householdId: "inaccessible_previous" as Id<"households">, status: "revoked" }];
    try {
      const user = userEvent.setup();
      render(<AiConnectionManager />);
      await user.selectOptions(screen.getByLabelText("Connection", { selector: "#ai-grant-reconnect" }), "ai_grant_123");
      const household = screen.getByLabelText("Household", { selector: "#ai-grant-household" });
      expect(household).toHaveValue("inaccessible_previous");
      const moves = screen.getByRole("group", { name: "Which moves" });
      await user.click(within(moves).getByRole("radio", { name: /Only the moves I pick/ }));
      await user.click(within(moves).getByRole("checkbox", { name: "Utah to Virginia" }));
      await user.selectOptions(household, "household_123");
      expect(within(moves).getByRole("radio", { name: /All my moves/ })).toBeChecked();
      await user.click(within(moves).getByRole("radio", { name: /Only the moves I pick/ }));
      expect(within(moves).getByRole("checkbox", { name: "Utah to Virginia" })).not.toBeChecked();
      await user.click(within(moves).getByRole("radio", { name: /All my moves/ }));
      expect(connectionData.queryCalls).toHaveBeenCalledWith(apiMock.aiGrants.listMoveChoices, { householdId: "household_123" });
      await user.click(screen.getByRole("button", { name: "Approve this connection" }));
      expect(connectionData.approve).toHaveBeenCalledWith(expect.objectContaining({ householdId: "household_123", reconnectGrantId: "ai_grant_123", moveScope: "allMoves", moveIds: undefined }));
    } finally { connectionData.grants.grants = original; }
  });

  it("allows a participant-only person to select moves for existing limits", async () => {
    const households = connectionData.households;
    const original = connectionData.grants.grants;
    connectionData.grants.grants = [{ ...original[0], moveScope: "allMoves", moveIds: [] }];
    connectionData.households = [];
    try {
      const user = userEvent.setup();
      render(<AiConnectionManager />);
      await user.click(screen.getByText("Change moves, permissions or end date"));
      const form = screen.getByRole("button", { name: "Save limits" }).closest("form")!;
      await user.click(within(form).getByRole("radio", { name: "Only the moves checked below" }));
      await user.click(within(form).getByRole("checkbox", { name: "Utah to Virginia" }));
      await user.click(within(form).getByRole("button", { name: "Save limits" }));
      expect(connectionData.updateLimits).toHaveBeenCalledWith(expect.objectContaining({ moveScope: "selectedMoves", moveIds: ["move_123"] }));
    } finally { connectionData.households = households; connectionData.grants.grants = original; }
  });

  it("blocks another new row at history capacity while allowing explicit reconnect", async () => {
    const original = connectionData.grants.grants;
    connectionData.grants.grants = [{ ...original[0], status: "revoked" }];
    connectionData.grants.historyAtCapacity = true;
    try {
      const user = userEvent.setup();
      render(<AiConnectionManager />);
      await user.type(screen.getByLabelText("Name this connection"), "Another connection");
      expect(screen.getByRole("button", { name: "Approve this connection" })).toBeDisabled();
      expect(screen.getByText(/Connection history is full/)).toBeInTheDocument();
      await user.selectOptions(screen.getByLabelText("Connection", { selector: "#ai-grant-reconnect" }), "ai_grant_123");
      expect(screen.getByRole("button", { name: "Approve this connection" })).toBeEnabled();
      await user.click(screen.getByRole("button", { name: "Approve this connection" }));
      expect(connectionData.approve).toHaveBeenCalledWith(expect.objectContaining({ reconnectGrantId: "ai_grant_123", expectedHistoryFingerprint: "current-history" }));
    } finally {
      connectionData.grants.grants = original;
      connectionData.grants.historyAtCapacity = false;
    }
  });

  it("permits explicit overflow recovery with the loaded management revision", async () => {
    const original = connectionData.grants.grants;
    connectionData.grants.grants = [{ ...original[0], status: "revoked" }];
    connectionData.grants.historyAtCapacity = true;
    connectionData.grants.historyOverflow = true;
    connectionData.grants.historyFingerprint = undefined;
    try {
      const user = userEvent.setup();
      render(<AiConnectionManager />);
      await user.selectOptions(screen.getByLabelText("Connection", { selector: "#ai-grant-reconnect" }), "ai_grant_123");
      expect(screen.getByRole("button", { name: "Approve this connection" })).toBeEnabled();
      await user.click(screen.getByRole("button", { name: "Approve this connection" }));
      expect(connectionData.approve).toHaveBeenCalledWith(expect.objectContaining({
        reconnectGrantId: "ai_grant_123", expectedRecoveryFingerprint: "current-recovery", scopeIntent: "full", expiryIntent: "none",
      }));
    } finally {
      connectionData.grants.grants = original;
      connectionData.grants.historyAtCapacity = false;
      connectionData.grants.historyOverflow = false;
      connectionData.grants.historyFingerprint = "current-history";
    }
  });

  it("submits explicit full access and no end date once the backend advertises support", async () => {
    const user = userEvent.setup();
    render(<AiConnectionManager />);
    await user.type(screen.getByLabelText("Name this connection"), "Current form");
    await user.click(screen.getByRole("button", { name: "Approve this connection" }));
    expect(connectionData.approve).toHaveBeenCalledWith(expect.objectContaining({
      consentPolicyVersion: GRANT_CONSENT_POLICY, catalogFingerprint: grantCatalogFingerprint(),
      scopeIntent: "full", expiryIntent: "none", expiresInDays: undefined,
    }));
  });

  it("marks an opted-in approval end date as chosen", async () => {
    const user = userEvent.setup();
    render(<AiConnectionManager />);
    await user.type(screen.getByLabelText("Name this connection"), "Seven day AI");
    await user.selectOptions(screen.getByLabelText("End date", { selector: "#ai-grant-expiry" }), "7");
    await user.click(screen.getByRole("button", { name: "Approve this connection" }));
    expect(connectionData.approve).toHaveBeenCalledWith(expect.objectContaining({ expiryIntent: "chosen", expiresInDays: 7 }));
  });

  it("removes an existing end date deliberately", async () => {
    const user = userEvent.setup();
    render(<AiConnectionManager />);
    await user.click(screen.getByText("Change moves, permissions or end date"));
    const form = screen.getByRole("button", { name: "Save limits" }).closest("form")!;
    await user.selectOptions(within(form).getByRole("combobox"), "0");
    await user.click(within(form).getByRole("button", { name: "Save limits" }));
    expect(connectionData.updateLimits).toHaveBeenCalledWith({ consentPolicyVersion: GRANT_CONSENT_POLICY, catalogFingerprint: grantCatalogFingerprint(), scopeIntent: "preserve", expiryIntent: "none", grantId: "ai_grant_123", expectedVersion: 3, scopes: ["moving.context.read"], expiresInDays: null });
  });

  it("preserves unchanged move choices without submitting a move edit", async () => {
    const user = userEvent.setup();
    render(<AiConnectionManager />);
    await user.click(screen.getByText("Change moves, permissions or end date"));
    const form = screen.getByRole("button", { name: "Save limits" }).closest("form")!;
    expect(within(form).getByRole("radio", { name: "Only the moves checked below" })).toBeChecked();
    expect(within(form).getByRole("checkbox", { name: "Utah to Virginia" })).toBeChecked();
    await user.click(within(form).getByRole("button", { name: "Save limits" }));
    expect(connectionData.updateLimits).toHaveBeenCalledWith({
      consentPolicyVersion: GRANT_CONSENT_POLICY, catalogFingerprint: grantCatalogFingerprint(), scopeIntent: "preserve",
      grantId: "ai_grant_123", expectedVersion: 3, scopes: ["moving.context.read"],
    });
    expect(connectionData.approve).not.toHaveBeenCalled();
  });

  it("submits a deliberate move change", async () => {
    const user = userEvent.setup();
    render(<AiConnectionManager />);
    await user.click(screen.getByText("Change moves, permissions or end date"));
    const form = screen.getByRole("button", { name: "Save limits" }).closest("form")!;
    await user.click(within(form).getByRole("radio", { name: "All my moves, including future moves" }));
    await user.click(within(form).getByRole("button", { name: "Save limits" }));
    expect(connectionData.updateLimits).toHaveBeenCalledWith(expect.objectContaining({ moveScope: "allMoves" }));
    expect(connectionData.updateLimits.mock.calls[0][0]).not.toHaveProperty("moveIds");
  });

  it("submits changed selected moves", async () => {
    const moves = connectionData.stats.moves;
    connectionData.stats.moves = [...moves, { moveId: "move_456" as Id<"moves">, title: "Another move", status: "active" }];
    try {
      const user = userEvent.setup();
      render(<AiConnectionManager />);
      await user.click(screen.getByText("Change moves, permissions or end date"));
      const form = screen.getByRole("button", { name: "Save limits" }).closest("form")!;
      await user.click(within(form).getByRole("checkbox", { name: "Another move" }));
      await user.click(within(form).getByRole("button", { name: "Save limits" }));
      expect(connectionData.updateLimits).toHaveBeenCalledWith(expect.objectContaining({
        moveScope: "selectedMoves", moveIds: ["move_123", "move_456"],
      }));
    } finally {
      connectionData.stats.moves = moves;
    }
  });

  it("omits move edits when the person returns to the original selection", async () => {
    const user = userEvent.setup();
    render(<AiConnectionManager />);
    await user.click(screen.getByText("Change moves, permissions or end date"));
    const form = screen.getByRole("button", { name: "Save limits" }).closest("form")!;
    const move = within(form).getByRole("checkbox", { name: "Utah to Virginia" });
    await user.click(move);
    await user.click(move);
    await user.click(within(form).getByRole("button", { name: "Save limits" }));
    expect(connectionData.updateLimits.mock.calls[0][0]).not.toHaveProperty("moveScope");
    expect(connectionData.updateLimits.mock.calls[0][0]).not.toHaveProperty("moveIds");
  });

  it("lets a participant-only owner edit permissions and expiry without submitting unavailable moves", async () => {
    const households = connectionData.households;
    connectionData.households = [];
    try {
      const user = userEvent.setup();
      render(<AiConnectionManager />);
      await user.click(screen.getByText("Change moves, permissions or end date"));
      const form = screen.getByRole("button", { name: "Save limits" }).closest("form")!;
      await user.click(within(form).getByRole("checkbox", { name: "Save the work you asked for" }));
      await user.selectOptions(within(form).getByRole("combobox"), "7");
      await user.click(within(form).getByRole("button", { name: "Save limits" }));
      expect(connectionData.updateLimits).toHaveBeenCalledWith({
        consentPolicyVersion: GRANT_CONSENT_POLICY, catalogFingerprint: grantCatalogFingerprint(),
        scopeIntent: "full", grantId: "ai_grant_123", expectedVersion: 3,
        scopes: ["moving.context.read", "moving.work.write"], expiryIntent: "chosen", expiresInDays: 7,
      });
    } finally {
      connectionData.households = households;
    }
  });

  it("keeps old backends and stale catalogs readable while refusing unsupported writes", () => {
    connectionData.grants.consentPolicyVersion = "";
    const { rerender } = render(<AiConnectionManager />);
    expect(screen.getByText("My AI on the laptop")).toBeInTheDocument();
    expect(screen.getByText(/approvals and limit edits are read-only/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve this connection" })).not.toBeInTheDocument();
    expect(screen.queryByText("Change moves, permissions or end date")).not.toBeInTheDocument();
    expect(screen.queryByText(/get full access with no end date by default/)).not.toBeInTheDocument();
    connectionData.grants.consentPolicyVersion = GRANT_CONSENT_POLICY;
    connectionData.grants.catalogFingerprint = "new-server-catalog";
    rerender(<AiConnectionManager />);
    expect(screen.queryByRole("button", { name: "Approve this connection" })).not.toBeInTheDocument();
    expect(connectionData.approve).not.toHaveBeenCalled();
    expect(connectionData.updateLimits).not.toHaveBeenCalled();
    connectionData.grants.catalogFingerprint = grantCatalogFingerprint();
    rerender(<AiConnectionManager />);
    expect(screen.getByRole("button", { name: "Approve this connection" })).toBeInTheDocument();
    expect(screen.getByText(/get full access with no end date by default/)).toBeInTheDocument();
  });

  it("sends deliberate full intent only after turning all permissions on", async () => {
    const user = userEvent.setup();
    render(<AiConnectionManager />);
    await user.click(screen.getByText("Change moves, permissions or end date"));
    const form = screen.getByRole("button", { name: "Save limits" }).closest("form")!;
    await user.click(within(form).getByRole("checkbox", { name: "Save the work you asked for" }));
    await user.selectOptions(within(form).getByRole("combobox"), "7");
    await user.click(within(form).getByRole("button", { name: "Save limits" }));
    expect(connectionData.updateLimits).toHaveBeenCalledWith(expect.objectContaining({ scopeIntent: "full", expiryIntent: "chosen", expiresInDays: 7 }));
  });

  it("asks for confirmation before revoking, and says what revoking does", async () => {
    const user = userEvent.setup();
    render(<AiConnectionManager />);

    await user.click(
      screen.getByRole("button", { name: "Revoke this connection" }),
    );
    expect(connectionData.revoke).not.toHaveBeenCalled();
    expect(
      screen.getByText(/The next call from this AI is refused immediately/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the record of what it did, stays readable/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Yes, revoke it" }));
    expect(connectionData.revoke).toHaveBeenCalledWith({
      grantId: "ai_grant_123",
      expectedVersion: 3,
      expectedRecoveryFingerprint: "current-recovery",
    });
  });

  it("treats the reported client name as a label rather than a verified claim", () => {
    render(<AiConnectionManager />);

    expect(screen.getByText("Name the AI reported")).toBeInTheDocument();
    expect(
      screen.getByText(/has not verified it/),
    ).toBeInTheDocument();
    expect(screen.getByText("Dynamic registration")).toBeInTheDocument();
  });

  it("shows refusals clearly in recent activity", () => {
    render(<AiConnectionManager />);

    expect(screen.getByText("Refused")).toBeInTheDocument();
    expect(
      screen.getByText("Refused archive_move_records: GRANT_SCOPE_MISSING."),
    ).toBeInTheDocument();
  });

  it("keeps API keys separate from and secondary to AI connections", () => {
    render(<AiConnectionManager />);

    const disclosure = screen.getByText(
      "Separate: API keys for tools that cannot sign in",
    );
    expect(disclosure.closest("details")).not.toBeNull();
    expect(
      screen.getByText(/An API key is a different door/),
    ).toBeInTheDocument();
    // The connection list says plainly what it is not.
    expect(
      screen.getByText(
        /not people in your household, not share links, and not API keys/,
      ),
    ).toBeInTheDocument();
  });

  it("never claims a named AI product is supported", () => {
    const { container } = render(<AiConnectionManager />);
    const text = container.textContent ?? "";

    for (const client of ["Claude", "ChatGPT", "Codex", "Gemini", "Grok"]) {
      expect(text).not.toContain(client);
    }
    expect(text).toContain("Partial");
    expect(text).toContain(
      "Any AI that speaks remote Streamable HTTP MCP with compatible OAuth",
    );
    expect(text).toContain("nothing here is listed as supported");
  });

  it("offers a copyable manual Queue brief that is a real handoff", () => {
    render(<AiConnectionManager />);

    const brief = screen.getByLabelText("Manual Queue brief");
    expect(brief.textContent).toContain("Utah to Virginia");
    expect(brief.textContent).toContain("Summary");
    expect(brief.textContent).toContain("Assumptions");
    expect(
      screen.getByRole("button", { name: "Copy the manual Queue brief" }),
    ).toBeInTheDocument();
  });

  it("builds a brief that forbids acting outside the chat", () => {
    const brief = buildManualQueueBrief("Utah to Virginia");
    expect(brief).toContain("Move: Utah to Virginia");
    expect(brief).toContain("Do not book, buy, sign, pay, or message anyone");
    expect(brief).toContain("Next step");
  });

  it("renders the never lists from the server boundary", () => {
    render(<AiConnectionManager />);

    expect(
      screen.getByText(
        "Another household's moves, belongings, evidence, or Queue.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Permanently delete anything, or delete your account."),
    ).toBeInTheDocument();
  });
});


it("preserves selected move limits across pages", async () => {
  connectionData.grants.consentPolicyVersion = GRANT_CONSENT_POLICY;
  connectionData.grants.catalogFingerprint = grantCatalogFingerprint();
  connectionData.updateLimits.mockClear();
  connectionData.moveChoicesPaging = true;
  try {
    const user = userEvent.setup();
    render(<AiConnectionManager />);
    await user.click(screen.getByText("Change moves, permissions or end date"));
    const form = screen.getByRole("button", { name: "Save limits" }).closest("form")!;
    await user.click(within(form).getByRole("radio", { name: "Only the moves checked below" }));
    await user.click(within(form).getByRole("button", { name: "More move choices" }));
    await user.click(within(form).getByRole("checkbox", { name: "Later move" }));
    await user.click(within(form).getByRole("button", { name: "Save limits" }));
    expect(connectionData.updateLimits).toHaveBeenCalledWith(expect.objectContaining({ moveScope: "selectedMoves", moveIds: ["move_123", "move_456"] }));
  } finally { connectionData.moveChoicesPaging = false; }
});


it("shows original approval records in owner Settings and pages their history", async () => {
  connectionData.archivedRecords = true;
  connectionData.queryCalls.mockClear();
  try {
    const user = userEvent.setup();
    render(<AiConnectionManager />);
    await user.click(screen.getByText("Original connection records"));
    expect(await screen.findByText("Original approval")).toBeInTheDocument();
    await user.click(screen.getByText("Complete saved record"));
    expect(screen.getByText(/original-grant/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Older original records" }));
    expect(connectionData.queryCalls).toHaveBeenCalledWith(apiMock.aiGrants.listSourceHistory, { cursor: "older-originals" });
    expect(await screen.findByText("Earlier original approval")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Recent original records" }));
    expect(await screen.findByText("Original approval")).toBeInTheDocument();
  } finally { connectionData.archivedRecords = false; }
});

it("shows frozen historical consent separately from current permission wording", () => {
  const original = connectionData.grants.grants;
  connectionData.grants.grants = [{ ...original[0], consentSnapshot: [{ scope: "moving.context.read", label: "Saved old approval wording", grants: "Saved original consent terms.", doesNotImply: "Saved exclusions." }] }];
  try {
    render(<AiConnectionManager />);
    expect(screen.getByText("Saved old approval wording.")).toBeInTheDocument();
    expect(screen.getByText(/Saved original consent terms/)).toBeInTheDocument();
    expect(screen.getByText(/Resolved connection permissions \(active\): Read the move context you choose/)).toBeInTheDocument();
  } finally { connectionData.grants.grants = original; }
});


it.each(["household", "reconnect"])("clears selected moves when the approval %s changes", async kind => {
  const households = connectionData.households;
  const original = connectionData.grants.grants;
  connectionData.grants.consentPolicyVersion = GRANT_CONSENT_POLICY;
  connectionData.grants.catalogFingerprint = grantCatalogFingerprint();
  connectionData.households = [...households, { ...households[0], household: { _id: "household_other" as Id<"households">, name: "Another household" } }];
  connectionData.grants.grants = [...original, { ...original[0], grantId: "other_grant" as Id<"aiGrants">, householdId: "household_other" as Id<"households">, status: "revoked", label: "Other client" }];
  try {
    const user = userEvent.setup();
    render(<AiConnectionManager />);
    await user.type(screen.getByLabelText("Name this connection"), "Scope change");
    const moves = screen.getByRole("group", { name: "Which moves" });
    await user.click(within(moves).getByRole("radio", { name: /Only the moves I pick/ }));
    await user.click(within(moves).getByRole("checkbox", { name: "Utah to Virginia" }));
    if (kind === "household") await user.selectOptions(screen.getByLabelText("Household", { selector: "#ai-grant-household" }), "household_other");
    else await user.selectOptions(screen.getByLabelText("Connection", { selector: "#ai-grant-reconnect" }), "other_grant");
    expect(within(moves).getByRole("radio", { name: /All my moves/ })).toBeChecked();
    await user.click(within(moves).getByRole("radio", { name: /Only the moves I pick/ }));
    expect(within(moves).getByRole("checkbox", { name: "Utah to Virginia" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Approve this connection" })).toBeDisabled();
  } finally { connectionData.households = households; connectionData.grants.grants = original; }
});

it("labels resolved alias authority separately from the saved full row", () => {
  const original = connectionData.grants.grants;
  connectionData.grants.grants = [{ ...original[0], scopes: ["moving.context.read", "moving.work.write"], effectiveAuthority: { status: "active", scopes: ["moving.context.read"] } }];
  try {
    render(<AiConnectionManager />);
    const authority = screen.getByText(/Resolved connection permissions/);
    expect(authority).toHaveTextContent("Read the move context you choose");
    expect(authority).not.toHaveTextContent("Save the work you asked for");
  } finally { connectionData.grants.grants = original; }
});
