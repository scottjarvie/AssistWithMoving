import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MoveWorkspaceValue } from "@/components/move-workspace-context";
import type { Id } from "../../convex/_generated/dataModel";

const mockData = vi.hoisted(() => ({
  queryResult: [] as unknown,
  mutation: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => mockData.queryResult,
  useMutation: () => mockData.mutation,
}));

vi.mock("@/components/move-workspace-context", () => ({
  useMoveWorkspace: () =>
    ({
      householdId: "household_123" as Id<"households">,
      moveId: "move_123" as Id<"moves">,
      selectedMove: undefined,
      selectHousehold: vi.fn(),
      households: [],
      moves: [],
      activeMoves: [],
      selectMove: vi.fn(),
      featureFlags: [],
      loadingIdentity: false,
      loadingHouseholds: false,
      loadingMoves: false,
      moveLinkMessage: null,
    }) satisfies MoveWorkspaceValue,
}));

vi.mock("@/components/move-workspace-header", () => ({
  MoveWorkspaceHeader: ({ title }: { title: string }) => (
    <header>{title}</header>
  ),
}));

import { SellWorkspacePage } from "@/components/move-pages/sell-page";
import { SpacesWorkspacePage } from "@/components/move-pages/spaces-page";

describe("SpacesWorkspacePage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app/moves/move_123/spaces");
    mockData.queryResult = [];
    mockData.mutation.mockReset();
  });

  it("opens on existing spaces before the add-space setup form", () => {
    mockData.queryResult = [
      {
        _id: "space_1",
        kind: "originRoom",
        name: "Kitchen",
        status: "active",
        floorLevel: "1",
        notes:
          "Long room notes should wrap inside the card instead of stretching the page.",
        photoCount: 2,
        transportResourceId: undefined,
        transportZoneId: undefined,
      },
    ];

    render(<SpacesWorkspacePage />);

    expect(screen.getByRole("tab", { name: "Spaces" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByRole("tab", { name: "Add space" })).toBeInTheDocument();
    expect(
      screen.getByText("Browse rooms and zones before adding setup records.")
    ).toBeInTheDocument();
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
    expect(screen.getByText("Origin room: 1")).toBeInTheDocument();
    expect(screen.queryByLabelText("Space name")).not.toBeInTheDocument();
  });

  it("opens the add-space form when routed to the add-space hash", async () => {
    window.history.replaceState(
      null,
      "",
      "/app/moves/move_123/spaces#add-space"
    );

    mockData.queryResult = [
      {
        _id: "space_1",
        kind: "originRoom",
        name: "Kitchen",
        status: "active",
        floorLevel: "1",
        notes: "Main prep room.",
        photoCount: 2,
        transportResourceId: undefined,
        transportZoneId: undefined,
      },
    ];

    render(<SpacesWorkspacePage />);

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Add space" })).toHaveAttribute(
        "data-state",
        "active"
      )
    );
    expect(screen.getByLabelText("Space name")).toBeInTheDocument();
    expect(screen.queryByText("Kitchen")).not.toBeInTheDocument();
  });
});

describe("SellWorkspacePage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app/moves/move_123/sell");
    mockData.queryResult = [];
    mockData.mutation.mockReset();
  });

  it("filters the sale pipeline from the metric strip", async () => {
    const user = userEvent.setup();

    mockData.queryResult = [
      {
        item: {
          _id: "item_1",
          name: "Oak bookcase",
          room: "Den",
          category: "Furniture",
          condition: "good",
          description: "Tall shelf with adjustable pegs.",
        },
        listing: { status: "draftReady" },
        status: "draftReady",
        photoCount: 1,
        needsMorePhotos: true,
        researchDepth: "none",
        researchSourceCount: 0,
      },
      {
        item: {
          _id: "item_2",
          name: "Vintage lamp",
          room: "Living room",
          category: "Decor",
          condition: "excellent",
          description: "Brass lamp with shade.",
        },
        listing: { status: "listed" },
        status: "listed",
        photoCount: 4,
        needsMorePhotos: false,
        researchDepth: "standard",
        researchSourceCount: 3,
      },
    ];

    render(<SellWorkspacePage />);

    expect(screen.getByRole("button", { name: /All 2/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getAllByRole("tab", { name: "Pricing" })).toHaveLength(1);
    expect(screen.getByText("Oak bookcase")).toBeInTheDocument();
    expect(screen.getByText("Vintage lamp")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Scan sell items and choose whether pricing, copy, or status needs work."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Price Oak bookcase" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Needs photos 1/i }));

    expect(screen.getByRole("button", { name: /Needs photos 1/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("Oak bookcase")).toBeInTheDocument();
    expect(screen.queryByText("Vintage lamp")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Oak bookcase low suggested price")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Oak bookcase listing description")
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark listed" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Pricing" }));
    expect(
      screen.getByText(
        "Price one sale item at a time instead of stacking every listing form."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Oak bookcase low suggested price")
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Vintage lamp low suggested price")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save pricing" })).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Oak bookcase listing description")
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /All 2/i }));
    expect(screen.getByText("Choose one item for pricing.")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Oak bookcase low suggested price")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Vintage lamp low suggested price")
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Price Vintage lamp" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Price Vintage lamp" }));
    expect(screen.getByText("Focused on Vintage lamp")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Vintage lamp low suggested price")
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Oak bookcase low suggested price")
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Listing copy" }));
    expect(
      screen.getByLabelText("Vintage lamp listing description")
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Oak bookcase listing description")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Oak bookcase low suggested price")
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show all sale items" }));
    expect(
      screen.getByText("Choose one item for listing copy.")
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Vintage lamp listing description")
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Status" }));
    expect(screen.getByText("Choose one item for status.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Keep as draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark listed" })).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Update status for Oak bookcase" })
    );
    expect(screen.getByText("Focused on Oak bookcase")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep as draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark listed" })).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Oak bookcase listing description")
    ).not.toBeInTheDocument();
  });

  it("searches sale listings before opening a focused task", async () => {
    const user = userEvent.setup();

    mockData.queryResult = [
      {
        item: {
          _id: "item_1",
          name: "Oak bookcase",
          room: "Den",
          category: "Furniture",
          condition: "good",
          description: "Tall shelf with adjustable pegs.",
        },
        listing: {
          status: "draftReady",
          listingDescription: "Bookcase for office or den.",
        },
        status: "draftReady",
        photoCount: 1,
        needsMorePhotos: true,
        researchDepth: "none",
        researchSourceCount: 0,
      },
      {
        item: {
          _id: "item_2",
          name: "Vintage lamp",
          room: "Living room",
          category: "Decor",
          condition: "excellent",
          description: "Brass lamp with shade.",
        },
        listing: {
          status: "listed",
          listingDescription: "Brass table light for marketplace.",
        },
        status: "listed",
        photoCount: 4,
        needsMorePhotos: false,
        researchDepth: "standard",
        researchSourceCount: 3,
      },
    ];

    render(<SellWorkspacePage />);

    await user.type(screen.getByLabelText("Search sale listings"), "living");

    expect(screen.getByText("1 shown")).toBeInTheDocument();
    expect(screen.getByText("Vintage lamp")).toBeInTheDocument();
    expect(screen.queryByText("Oak bookcase")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Pricing" }));

    expect(
      screen.getByLabelText("Vintage lamp low suggested price")
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Oak bookcase low suggested price")
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(screen.getByText("2 shown")).toBeInTheDocument();
    expect(screen.getByText("Choose one item for pricing.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Price Oak bookcase" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Price Vintage lamp" })).toBeInTheDocument();
  });

  it("opens listing copy when routed to the sale listing hash", async () => {
    window.history.replaceState(
      null,
      "",
      "/app/moves/move_123/sell#sale-listing"
    );

    mockData.queryResult = [
      {
        item: {
          _id: "item_1",
          name: "Oak bookcase",
          room: "Den",
          category: "Furniture",
          condition: "good",
          description: "Tall shelf with adjustable pegs.",
        },
        listing: {
          status: "draftReady",
          listingDescription: "Bookcase for office or den.",
        },
        status: "draftReady",
        photoCount: 3,
        needsMorePhotos: false,
        researchDepth: "quick",
        researchSourceCount: 1,
      },
    ];

    render(<SellWorkspacePage />);

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Listing copy" })).toHaveAttribute(
        "data-state",
        "active"
      )
    );
    expect(
      screen.getByLabelText("Oak bookcase listing description")
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Oak bookcase low suggested price")
    ).not.toBeInTheDocument();
  });
});
