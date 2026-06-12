import { render, screen } from "@testing-library/react";
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
    listForHousehold: "apiKeys.listForHousehold",
    create: "apiKeys.create",
    revoke: "apiKeys.revoke",
    rotate: "apiKeys.rotate",
  },
}));

const apiKeyManagerData = vi.hoisted(() => ({
  mutation: vi.fn(),
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
  useQuery: (query: string) => {
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
        /MovingManifest stores the original and creates web-ready versions server-side/,
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
        "Check household, move, item, member, and AI connection counts before changing access.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Simple setup for an AI assistant")).toBeInTheDocument();
    expect(screen.getByText("Households")).toBeInTheDocument();
    expect(screen.getByText("Items")).toBeInTheDocument();
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
});
