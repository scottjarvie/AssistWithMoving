import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import type { ApiKeyScope } from "@/lib/api-keys";

const apiMock = vi.hoisted(() => ({
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

const apiKeyManagerData = vi.hoisted(() => ({
  mutation: vi.fn(),
  queryArgs: [] as Array<{ query: string; args: unknown }>,
  households: [
    {
      household: {
        _id: "household_123" as Id<"households">,
        name: "Jarvie household",
      },
      role: "owner",
      apiAccessStatus: "enabled" as "enabled" | "disabled",
      canCreateApiKeys: true,
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
    apiCapableMemberCount: 1,
    activeMemberCount: 2,
    pendingInvitationCount: 1,
  },
  keys: [
    {
      apiKeyId: "api_key_123" as Id<"apiKeys">,
      name: "Photo helper key",
      tokenPreview: "mmk_photo...1234",
      scopes: ["moves/read", "inventory/read", "photos/write"] as ApiKeyScope[],
      status: "active" as const,
      expiresAt: 9999999999999,
      lastUsedAt: 9999999900000,
      lastUsedAction: "photo:upload",
      createdByName: "Scott Jarvie",
      createdByEmail: "scott@example.com",
      creatorApiAccessStatus: "enabled" as const,
      createdAt: 1,
    },
  ],
}));

vi.mock("../../convex/_generated/api", () => ({
  api: apiMock,
}));

vi.mock("convex/react", () => ({
  useMutation: () => apiKeyManagerData.mutation,
  useQuery: (query: string, args: unknown) => {
    apiKeyManagerData.queryArgs.push({ query, args });
    if (args === "skip") return undefined;
    switch (query) {
      case apiMock.households.listMine:
        return apiKeyManagerData.households;
      case apiMock.households.summaryStats:
        return apiKeyManagerData.stats;
      case apiMock.apiKeys.listForHousehold:
        return apiKeyManagerData.keys;
      default:
        return undefined;
    }
  },
}));

import { ApiKeyManager } from "@/components/api-key-manager";

describe("ApiKeyManager task tabs", () => {
  beforeEach(() => {
    apiKeyManagerData.mutation.mockReset();
    apiKeyManagerData.queryArgs = [];
  });

  it("skips household-dependent queries when auth is not ready", () => {
    render(<ApiKeyManager enabled={false} />);

    expect(apiKeyManagerData.queryArgs).toEqual([
      { query: apiMock.households.listMine, args: "skip" },
      { query: apiMock.households.summaryStats, args: "skip" },
      { query: apiMock.apiKeys.listForHousehold, args: "skip" },
    ]);
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
        "Choose the household, where the assistant can work, and what it can do.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Create a new AI connection")).toBeInTheDocument();
    expect(screen.getByText("Full trusted helper")).toBeInTheDocument();
    expect(screen.getByText("Add items and photos")).toBeInTheDocument();
    expect(
      screen.getByText(/Can read and change most move records/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Safest setup: restrict this key to the move/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Image upload handoff")).not.toBeInTheDocument();
    expect(screen.getByText("Test a key before leaving")).toBeInTheDocument();
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
    expect(screen.getByText(/Created by Scott Jarvie/)).toBeInTheDocument();
    expect(
      screen.queryByText("Create a new AI connection"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Overview" }));

    expect(
      screen.getByText(
        "Check household, move, item, member, and AI connection counts before changing access.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Simple setup for an AI assistant")).toBeInTheDocument();
    expect(screen.getByText("Households")).toBeInTheDocument();
    expect(screen.getByText("Items")).toBeInTheDocument();
    expect(screen.getByText("1 API-capable")).toBeInTheDocument();
    expect(screen.queryByText("Photo helper key")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Advanced" }));

    expect(
      screen.getByText(
        "Tune key name, expiration, move restriction, and exact API scopes when presets are not enough.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Advanced API settings")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Agent kit" })[0]).toHaveAttribute(
      "href",
      "/ai/kit",
    );
    expect(screen.getByText("Exact permissions")).toBeInTheDocument();
    expect(screen.getByLabelText("Key name")).toBeInTheDocument();
    expect(
      screen.getByText("Optional assistant instructions for images"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This is not a separate key/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("add_item_from_photo, upload_photo, upload_photos"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Create a new AI connection"),
    ).not.toBeInTheDocument();
  });

  it("verifies a pasted key without storing it in component state after success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          household: { name: "Jarvie household" },
          apiKey: {
            scopes: ["moves/read", "inventory/read"],
            moveRestricted: true,
          },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ApiKeyManager enabled />);

    await user.type(
      screen.getByLabelText("API key to verify"),
      "mmk_test_secret",
    );
    await user.click(screen.getByRole("button", { name: "Test key" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/me", {
      method: "GET",
      headers: {
        Authorization: "Bearer mmk_test_secret",
      },
    });
    expect(
      await screen.findByText(
        "Key verified. Your assistant can connect with this secret.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Restricted to one move/)).toBeInTheDocument();
    expect(screen.getByLabelText("API key to verify")).toHaveValue("");

    vi.unstubAllGlobals();
  });

  it("updates optional image instructions when the selected preset cannot upload photos", async () => {
    const user = userEvent.setup();

    render(<ApiKeyManager enabled />);

    await user.click(
      screen.getByRole("button", { name: /Look but do not change/ }),
    );
    await user.click(screen.getByRole("tab", { name: "Advanced" }));

    expect(
      screen.getByText("Choose a photo-capable access preset first"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /This key cannot upload photos; ask the user for an Add items and photos or Full trusted helper key/,
      ),
    ).toBeInTheDocument();
  });

  it("shows a newly created one-time key inline and hidden for screenshots", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    apiKeyManagerData.mutation.mockResolvedValueOnce({
      rawKey: "mmk_inline_secret",
    });

    render(<ApiKeyManager enabled />);

    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(apiKeyManagerData.mutation).toHaveBeenCalledWith(
      expect.objectContaining({
        householdId: "household_123",
        moveId: undefined,
        name: "Full trusted AI helper key",
      }),
    );
    expect(await screen.findByText("One-time key")).toBeInTheDocument();
    expect(
      screen.getByText(
        "AI connection created and copied. Paste the key into your trusted assistant now.",
      ),
    ).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith("mmk_inline_secret");

    const secret = screen.getByLabelText("One-time API key secret");
    expect(secret).toHaveValue(
      "Hidden for screenshots. Use Copy key, or Show key if manual copy is needed.",
    );
    expect(screen.queryByDisplayValue("mmk_inline_secret")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show key" }));

    expect(secret).toHaveValue("mmk_inline_secret");
    expect(screen.getByRole("button", { name: "Copy key" })).toBeInTheDocument();
    expect(
      screen.getByText("Optional: copy assistant instructions"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Image upload handoff")).not.toBeInTheDocument();

    vi.unstubAllGlobals();
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

  it("puts the OAuth connector path ahead of raw key creation in setup mode", () => {
    render(<ApiKeyManager enabled mode="setup" />);

    expect(screen.getByText("Hosted assistant? Try OAuth first.")).toBeInTheDocument();
    expect(
      screen.getByText(/On mobile, claude.ai, or another hosted MCP client/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open MCP setup" })).toHaveAttribute(
      "href",
      "/mcp",
    );
    expect(screen.getByText("https://movingmanifest.com/api/mcp")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create key" })).toBeInTheDocument();
    expect(screen.queryByText("One-time key")).not.toBeInTheDocument();
  });

  it("explains disabled member API access instead of offering key creation", () => {
    const originalHouseholds = apiKeyManagerData.households;
    apiKeyManagerData.households = [
      {
        household: {
          _id: "household_123" as Id<"households">,
          name: "Jarvie household",
        },
        role: "admin",
        apiAccessStatus: "disabled",
        canCreateApiKeys: false,
      },
    ];

    try {
      render(<ApiKeyManager enabled />);

      expect(
        screen.getByText(/API access is disabled for this household membership/),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Create key" })).toBeDisabled();
    } finally {
      apiKeyManagerData.households = originalHouseholds;
    }
  });
});
