import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import type { ApiKeyScope } from "@/lib/api-keys";

const apiMock = vi.hoisted(() => ({
  households: {
    listMine: "households.listMine",
    summaryStats: "households.summaryStats",
  },
  apiKeys: {
    settingsSummary: "apiKeys.settingsSummary",
    listForHousehold: "apiKeys.listForHousehold",
    create: "apiKeys.create",
    revoke: "apiKeys.revoke",
    rotate: "apiKeys.rotate",
  },
  aiGrants: { listHouseholdChoices: "aiGrants.listHouseholdChoices", listMoveChoices: "aiGrants.listMoveChoices" },
}));

const apiKeyManagerData = vi.hoisted(() => ({
  mutation: vi.fn(),
  historyMode: false,
  movePaging: false,
  memberPaging: false,
  memberFinalEmpty: false,
  queryCalls: vi.fn(),
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
    itemCount: 24,
    boxCount: 8,
    activeApiKeyCount: 1,
    activeMemberCount: 2,
    pendingInvitationCount: 1,
  },
  keys: [
    {
      apiKeyId: "api_key_123" as Id<"apiKeys">,
      version: 1,
      name: "Photo helper key",
      tokenPreview: "mmk_photo...1234",
      scopes: ["moves/read", "inventory/read", "photos/write"] as ApiKeyScope[],
      status: "active" as const,
      expiresAt: 9999999999999,
      lastUsedAt: 9999999900000,
      lastUsedAction: "photo:upload",
      createdAt: 1,
    },
  ],
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: () => apiKeyManagerData.mutation,
  useQuery: (query: string, args: { cursor?: string }) => {
    apiKeyManagerData.queryCalls(query, args);
    switch (query) {
      case apiMock.households.listMine:
        return apiKeyManagerData.households;
      case apiMock.aiGrants.listHouseholdChoices:
        return { households: apiKeyManagerData.memberPaging && args?.cursor ? (apiKeyManagerData.memberFinalEmpty ? [] : [{ household: { _id: "member_later", name: "Later member household" }, role: "owner" }]) : apiKeyManagerData.households, nextCursor: apiKeyManagerData.memberPaging && !args?.cursor ? "later-members" : null };
      case apiMock.aiGrants.listMoveChoices:
        return { moves: apiKeyManagerData.movePaging && args?.cursor ? [{ ...apiKeyManagerData.stats.moves[0], moveId: "move_later", title: "Later key move" }] : apiKeyManagerData.stats.moves, nextCursor: apiKeyManagerData.movePaging && !args?.cursor ? "later-moves" : null };
      case apiMock.apiKeys.settingsSummary:
        return apiKeyManagerData.stats;
      case apiMock.households.summaryStats:
        return apiKeyManagerData.stats;
      case apiMock.apiKeys.listForHousehold:
        return apiKeyManagerData.historyMode ? { keys: args?.cursor ? [{ ...apiKeyManagerData.keys[0], apiKeyId: "old_key" as Id<"apiKeys">, name: "Older archived key", status: "revoked" }]: apiKeyManagerData.keys, nextCursor: args?.cursor ? null : "older-keys" } : apiKeyManagerData.keys;
      default:
        return undefined;
    }
  },
}));

import { ApiKeyManager } from "@/components/api-key-manager";

describe("ApiKeyManager task tabs", () => {
  it("starts and resets new keys to all permissions and no end date", async () => {
    const user = userEvent.setup();
    render(<ApiKeyManager enabled />);
    await user.click(screen.getByRole("tab", { name: "Advanced" }));
    expect(screen.getByLabelText("End date (optional days)")).toHaveValue("");
    const checks = screen.getAllByRole("checkbox");
    expect(checks).toHaveLength(12);
    checks.forEach(check => expect(check).toBeChecked());
    await user.click(checks[0]);
    await user.type(screen.getByLabelText("End date (optional days)"), "7");
    await user.click(screen.getByRole("button", { name: "Reset new connection" }));
    screen.getAllByRole("checkbox").forEach(check => expect(check).toBeChecked());
    expect(screen.getByLabelText("End date (optional days)")).toHaveValue("");
  });

  it("opens on key creation and separates connections, overview, and advanced settings", async () => {
    const user = userEvent.setup();

    render(<ApiKeyManager enabled />);

    expect(screen.getByRole("tab", { name: "Create key" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.getByText(
        "Pick the assistant job, copy the image handoff, then create one key for that trusted tool.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Create a new AI connection")).toBeInTheDocument();
    expect(screen.getByText("Full trusted helper")).toBeInTheDocument();
    expect(screen.getByText("Add items and photos")).toBeInTheDocument();
    expect(screen.getByText("Image upload handoff")).toBeInTheDocument();
    expect(
      screen.getByText("add_item_from_photo, upload_image, upload_images"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Assist With Moving stores the original and creates web-ready versions server-side/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create key" })).toBeInTheDocument();
    expect(screen.queryByText("Current AI connections")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Simple setup for an AI assistant"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Advanced API settings")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Connections" }));

    expect(screen.getByRole("tab", { name: "Connections" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.getByText(
        "Review active assistant keys, rotate secrets, and revoke old access without creating another key.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Current AI connections")).toBeInTheDocument();
    expect(screen.getByText("Photo helper key")).toBeInTheDocument();
    expect(
      screen.queryByText("Create a new AI connection"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Overview" }));

    expect(
      screen.getByText(
        "Review the selected household, available moves, and AI connections before changing access.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Simple setup for an AI assistant")).toBeInTheDocument();
    expect(screen.getByText("Households on this page")).toBeInTheDocument();
    expect(screen.getByText("Moves on this page")).toBeInTheDocument();
    expect(screen.queryByText("Photo helper key")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Advanced" }));

    expect(
      screen.getByText(
        "Tune key name, expiration, move restriction, and exact API scopes when presets are not enough.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Advanced API settings")).toBeInTheDocument();
    expect(screen.getByText("Exact permissions")).toBeInTheDocument();
    expect(screen.getByLabelText("Key name")).toBeInTheDocument();
    expect(
      screen.queryByText("Create a new AI connection"),
    ).not.toBeInTheDocument();
  });

  it("updates the image handoff when the selected preset cannot upload photos", async () => {
    const user = userEvent.setup();

    render(<ApiKeyManager enabled />);

    await user.click(
      screen.getByRole("button", { name: /Look but do not change/ }),
    );

    expect(screen.getByText("Change preset before upload")).toBeInTheDocument();
    expect(
      screen.getByText(
        /This key cannot upload photos; ask the user for an Add items and photos or Full trusted helper key/,
      ),
    ).toBeInTheDocument();
  });

  it("sends new signed-in users to create a household before making an AI key", () => {
    const originalHouseholds = apiKeyManagerData.households;
    apiKeyManagerData.households = [];

    try {
      render(<ApiKeyManager enabled mode="setup" />);

      expect(
        screen.getByText("Create a household before adding AI connections."),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Create household" }),
      ).toHaveAttribute("href", "/app/dashboard#household-setup");
      expect(
        screen.queryByRole("button", { name: "Create key" }),
      ).not.toBeInTheDocument();
    } finally {
      apiKeyManagerData.households = originalHouseholds;
    }
  });

  it("shows expired keys as inactive and disables terminal lifecycle actions", async () => {
    const user = userEvent.setup();
    const originalKeysLength = apiKeyManagerData.keys.length;
    const originalCount = apiKeyManagerData.stats.activeApiKeyCount;
    apiKeyManagerData.keys.push(
      {
        ...apiKeyManagerData.keys[0],
        apiKeyId: "api_key_expired" as Id<"apiKeys">,
        name: "Expired helper key",
        status: "expired" as const,
        expiresAt: 1,
      } as unknown as (typeof apiKeyManagerData.keys)[number],
    );
    apiKeyManagerData.stats.activeApiKeyCount = 2;

    try {
      render(<ApiKeyManager enabled />);

      await user.click(screen.getByRole("tab", { name: "Connections" }));
      expect(screen.getByText("1 active")).toBeInTheDocument();
      await user.click(screen.getByText("Show revoked and old keys (1)"));
      expect(screen.getByText("Expired helper key")).toBeInTheDocument();
      expect(screen.getByText("Expired")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Rotate Expired helper key" }),
      ).toBeDisabled();

      await user.click(screen.getByRole("tab", { name: "Overview" }));
      const overview = screen.getByLabelText("AI connection overview");
      const connectionLabel = within(overview).getByText("AI connections");
      expect(connectionLabel.parentElement?.parentElement).toHaveTextContent(
        "AI connections1",
      );
    } finally {
      apiKeyManagerData.keys.splice(originalKeysLength);
      apiKeyManagerData.stats.activeApiKeyCount = originalCount;
    }
  });
});


it("pages older API keys and returns to recent keys", async () => {
  apiKeyManagerData.historyMode = true;
  apiKeyManagerData.queryCalls.mockClear();
  try {
    const user = userEvent.setup();
    render(<ApiKeyManager enabled />);
    await user.click(screen.getByRole("tab", { name: "Connections" }));
    await user.click(screen.getByRole("button", { name: "Older API keys" }));
    expect(apiKeyManagerData.queryCalls).toHaveBeenCalledWith(apiMock.apiKeys.listForHousehold, { householdId: "household_123", cursor: "older-keys" });
    expect(screen.getByText("Older archived key")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Recent API keys" }));
    expect(screen.getByText("Photo helper key")).toBeInTheDocument();
  } finally { apiKeyManagerData.historyMode = false; }
});

it("uses bounded member/key/move queries and preserves a move restriction across pages", async () => {
  apiKeyManagerData.memberPaging = true;
  apiKeyManagerData.movePaging = true;
  apiKeyManagerData.queryCalls.mockClear();
  try {
    const user = userEvent.setup();
    render(<ApiKeyManager enabled />);
    const move = screen.getByLabelText("Where can it work?");
    await user.selectOptions(move, "move_123");
    await user.click(screen.getByRole("button", { name: "More key move choices" }));
    expect(move).toHaveValue("move_123");
    await user.selectOptions(move, "move_later");
    await user.click(screen.getByRole("button", { name: "First key move choices" }));
    expect(move).toHaveValue("move_later");
    await user.click(screen.getByRole("button", { name: "More member households" }));
    const household = screen.getByLabelText("Household");
    expect(household).toHaveValue("household_123");
    await user.selectOptions(household, "member_later");
    expect(move).toHaveValue("all");
    expect(apiKeyManagerData.queryCalls).not.toHaveBeenCalledWith(apiMock.households.listMine, expect.anything());
    expect(apiKeyManagerData.queryCalls).not.toHaveBeenCalledWith(apiMock.households.summaryStats, expect.anything());
    expect(apiKeyManagerData.queryCalls).toHaveBeenCalledWith(apiMock.apiKeys.settingsSummary, { householdId: "household_123" });
  } finally { apiKeyManagerData.memberPaging = false; apiKeyManagerData.movePaging = false; }
});

it("can pass an empty filtered membership page to reach a later active household", async () => {
  const original = apiKeyManagerData.households;
  apiKeyManagerData.households = [];
  apiKeyManagerData.memberPaging = true;
  try {
    const user = userEvent.setup();
    render(<ApiKeyManager enabled />);
    await user.click(screen.getByRole("button", { name: "More member households" }));
    expect(screen.getByLabelText("Household")).toHaveValue("member_later");
    expect(screen.getByRole("button", { name: "Create key" })).toBeInTheDocument();
  } finally { apiKeyManagerData.households = original; apiKeyManagerData.memberPaging = false; }
});

it("returns from an empty final member page without reloading", async () => {
  const original = apiKeyManagerData.households;
  apiKeyManagerData.households = [];
  apiKeyManagerData.memberPaging = true;
  apiKeyManagerData.memberFinalEmpty = true;
  try {
    const user = userEvent.setup();
    render(<ApiKeyManager enabled />);
    await user.click(screen.getByRole("button", { name: "More member households" }));
    expect(screen.queryByRole("button", { name: "More member households" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "First member households" }));
    expect(screen.getByRole("button", { name: "More member households" })).toBeInTheDocument();
  } finally { apiKeyManagerData.households = original; apiKeyManagerData.memberPaging = false; apiKeyManagerData.memberFinalEmpty = false; }
});

it("submits the displayed key revision when the person revokes it", async () => {
  apiKeyManagerData.mutation.mockClear();
  const user = userEvent.setup();
  render(<ApiKeyManager enabled />);
  await user.click(screen.getByRole("tab", { name: "Connections" }));
  await user.click(screen.getByRole("button", { name: "Revoke Photo helper key" }));
  expect(apiKeyManagerData.mutation).toHaveBeenCalledWith({ householdId: "household_123", apiKeyId: "api_key_123", expectedVersion: 1 });
});
