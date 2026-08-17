import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

const apiMock = vi.hoisted(() => ({
  aiGrants: {
    listMine: "aiGrants.listMine",
    listActivity: "aiGrants.listActivity",
    describeBoundary: "aiGrants.describeBoundary",
    approve: "aiGrants.approve",
    revoke: "aiGrants.revoke",
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
  approve: vi.fn(),
  revoke: vi.fn(),
  grants: {
    boundaryVersion: "2026-08-16",
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
        label: "My AI on the laptop",
        status: "active" as const,
        scopes: ["moving.context.read"],
        moveScope: "selectedMoves" as const,
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
  useQuery: (query: string) => {
    switch (query) {
      case apiMock.aiGrants.listMine:
        return connectionData.grants;
      case apiMock.aiGrants.listActivity:
        return connectionData.activity;
      case apiMock.households.listMine:
        return connectionData.households;
      case apiMock.households.summaryStats:
        return connectionData.stats;
      case apiMock.apiKeys.listForHousehold:
        return connectionData.keys;
      default:
        return undefined;
    }
  },
  useMutation: (mutation: string) =>
    mutation === apiMock.aiGrants.approve
      ? connectionData.approve
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
      screen.getByRole("checkbox", { name: /Read the move context you choose/ }),
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
        expiresInDays: 90,
      }),
    );
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
